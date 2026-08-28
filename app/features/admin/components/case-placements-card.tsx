// feat-3-214 — 판례가 교재에서 다뤄지는 자리(체계도 주제) 관리.
//
// 왜 있나: 리담 판례집은 같은 판결을 두 주제에서 **다른 각도로** 다룬다. 자리마다
// 서술이 달라서, 자리를 붙이고 그 자리의 본문을 따로 고칠 수 있어야 한다.
//
// ★대표 배치는 여기서 본문을 고치지 않는다 — 그건 위 "교재 구조 본문" 카드가 담당하고
//   (목록·검색 미러도 거기서 파생), 저장 시 대표 링크로 자동 동기화된다.
// ★폼 안에 폼을 넣을 수 없어 모든 동작은 fetcher 로 보낸다(메인 저장 폼과 독립).

import { PlusIcon, StarIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/core/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/core/components/ui/select";
import { cn } from "~/core/lib/utils";
import { BookSectionsEditor } from "~/features/admin/components/book-sections-editor";
import type { BookSection } from "~/features/cases/labels";
import type { SystematicNode } from "~/features/laws/queries.server";

export interface CasePlacementRow {
  nodeId: string;
  isPrimary: boolean;
  seq: number;
  sections: BookSection[];
}

export function CasePlacementsCard({
  caseId,
  placements,
  systematicNodes,
}: {
  caseId: string;
  placements: CasePlacementRow[];
  systematicNodes: SystematicNode[];
}) {
  const fetcher = useFetcher<{ error?: string; ok?: boolean }>();
  const [addNode, setAddNode] = useState("");
  const labelOf = (nodeId: string) =>
    systematicNodes.find((n) => n.nodeId === nodeId)?.displayLabel ?? "(삭제된 노드)";

  const submit = (fields: Record<string, string>) => {
    const fd = new FormData();
    fd.set("caseId", caseId);
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    fetcher.submit(fd, { method: "post", action: "/api/admin/case" });
  };

  const used = new Set(placements.map((p) => p.nodeId));
  // 교재 주제 노드만 후보로 — 상위 분류에 판례를 붙이면 트리 카운트가 엉킨다.
  const candidates = systematicNodes.filter(
    (n) => /^주제\s*\d+\s/.test(n.displayLabel) && !used.has(n.nodeId),
  );

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">교재 수록 자리 (체계도 배치)</CardTitle>
        <p className="text-muted-foreground text-xs leading-relaxed">
          교재가 같은 판결을 여러 주제에서 다루면 자리를 추가하고, 그 자리의 서술을 따로
          입력합니다. 학생 뷰어는 들어온 주제의 서술을 보여 줍니다.
          <br />
          <strong>대표</strong> 자리의 본문은 위 「교재 구조 본문」 카드에서 고칩니다(목록·검색
          미러가 거기서 파생됩니다).
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {fetcher.data?.error ? (
          <p className="text-destructive text-xs">{fetcher.data.error}</p>
        ) : null}

        {placements.length === 0 ? (
          <p className="text-muted-foreground text-xs">등록된 배치가 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {placements.map((p) => (
              <li
                key={p.nodeId}
                className={cn(
                  "border-border rounded-lg border px-3 py-2",
                  p.isPrimary && "bg-muted/40",
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex-1 text-sm font-medium">
                    {labelOf(p.nodeId)}
                  </span>
                  {p.isPrimary ? (
                    <span className="text-link inline-flex items-center gap-1 text-[11px] font-bold">
                      <StarIcon className="size-3" /> 대표
                    </span>
                  ) : (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 text-xs"
                        disabled={fetcher.state !== "idle"}
                        onClick={() =>
                          submit({
                            intent: "set_case_placement_primary",
                            nodeId: p.nodeId,
                          })
                        }
                      >
                        <StarIcon className="size-3" /> 대표로
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 text-xs text-rose-600 hover:text-rose-700"
                        disabled={fetcher.state !== "idle"}
                        onClick={() => {
                          if (!confirm(`"${labelOf(p.nodeId)}" 배치를 삭제할까요?`)) return;
                          submit({
                            intent: "remove_case_placement",
                            nodeId: p.nodeId,
                          });
                        }}
                      >
                        <Trash2Icon className="size-3" /> 삭제
                      </Button>
                    </>
                  )}
                </div>
                {p.isPrimary ? null : (
                  <PlacementBody
                    caseId={caseId}
                    nodeId={p.nodeId}
                    sections={p.sections}
                  />
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Select value={addNode} onValueChange={setAddNode}>
            <SelectTrigger className="h-8 w-[320px] text-xs">
              <SelectValue
              placeholder={
                candidates.length > 0
                  ? "주제 선택 — 이 판례를 추가로 실을 자리"
                  : "추가할 주제가 없습니다"
              }
            />
            </SelectTrigger>
            <SelectContent>
              {candidates.map((n) => (
                <SelectItem key={n.nodeId} value={n.nodeId} className="text-xs">
                  {n.displayLabel}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1 text-xs"
            disabled={!addNode || fetcher.state !== "idle"}
            onClick={() => {
              submit({ intent: "add_case_placement", nodeId: addNode });
              setAddNode("");
            }}
          >
            <PlusIcon className="size-3" /> 배치 추가
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// 대표가 아닌 자리의 본문 — 접었다 펴고, 그 자리에만 저장한다.
function PlacementBody({
  caseId,
  nodeId,
  sections,
}: {
  caseId: string;
  nodeId: string;
  sections: BookSection[];
}) {
  const fetcher = useFetcher<{ error?: string; ok?: boolean }>();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<BookSection[]>(sections);
  const saving = fetcher.state !== "idle";

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-2"
      >
        {open ? "본문 접기" : `이 자리의 본문 편집 (섹션 ${sections.length}개)`}
      </button>
      {open ? (
        <div className="mt-2 space-y-2">
          <BookSectionsEditor defaultSections={sections} onChange={setDraft} />
          {fetcher.data?.error ? (
            <p className="text-destructive text-xs">{fetcher.data.error}</p>
          ) : null}
          <Button
            type="button"
            size="sm"
            className="h-8 text-xs"
            disabled={saving}
            onClick={() => {
              const fd = new FormData();
              fd.set("intent", "save_case_placement_body");
              fd.set("caseId", caseId);
              fd.set("nodeId", nodeId);
              fd.set("bookSections", JSON.stringify(draft));
              fetcher.submit(fd, { method: "post", action: "/api/admin/case" });
            }}
          >
            {saving ? "저장 중…" : "이 자리 본문 저장"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
