// feat-2-035 S4 — 판례 도식 배지 + 우측 Sheet(학생 열람).
//
// 팝업(Dialog)이 아니라 Sheet 인 이유: 6단 구조에 쟁점이 여러 개면 모달 박스에 안 들어가고,
// 판례 본문을 옆에 두고 대조하며 읽는 게 이 기능의 사용법이다(설계 §6).
//
// ★법리 4축은 "있는 축만" 렌더한다. 빈 축의 자리를 만들어 두면 "비어 있음"이 정보처럼 읽혀,
//   근거 없는 축을 채우지 않기로 한 설계가 화면에서 무너진다.

import { GitBranchIcon, ScaleIcon } from "lucide-react";

import { Badge } from "~/core/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "~/core/components/ui/sheet";
import { cn } from "~/core/lib/utils";

import {
  filledAxes,
  isLowerCourtSource,
  type CaseDiagramBlock,
  type FactsSourceKind,
} from "../lib/case-diagram";

export interface CaseDiagramView {
  factsMd: string;
  factsSourceKind: FactsSourceKind;
  factsSourceRef: string | null;
  blocks: CaseDiagramBlock[];
  reviewStatus: "draft" | "approved" | "rejected";
}

/** 사실관계 출처 캡션 — 사실관계가 얇은 이유를 학생이 알 수 있게 밝힌다. */
function factsSourceCaption(d: CaseDiagramView): string | null {
  if (isLowerCourtSource(d.factsSourceKind)) {
    return d.factsSourceRef ? `출처 ${d.factsSourceRef}` : "출처 하급심 판결문";
  }
  if (d.factsSourceKind === "supreme_only") {
    return "출처 대법원 판결문 기재 범위";
  }
  return null;
}

export function CaseDiagramSheet({
  diagram,
  caseNumber,
  className,
}: {
  diagram: CaseDiagramView;
  caseNumber: string;
  className?: string;
}) {
  const draft = diagram.reviewStatus !== "approved";
  const caption = factsSourceCaption(diagram);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type="button"
          title="2차 답안 순서로 정리한 도식 보기"
          className={cn(
            "inline-flex h-7 items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors",
            draft
              ? "border-amber-500/40 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400"
              : "border-primary/40 text-link hover:bg-primary/10",
            className,
          )}
        >
          <GitBranchIcon className="size-3.5" />
          도식
          {draft ? <span className="font-semibold">· 검수중</span> : null}
        </button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto p-0 sm:max-w-[560px]"
      >
        <SheetHeader className="border-border bg-background sticky top-0 z-10 border-b px-4 py-3">
          <SheetTitle className="flex items-center gap-2 text-sm font-semibold">
            <ScaleIcon className="text-link size-4" />
            판례 도식
            <span className="text-muted-foreground font-mono text-xs font-normal">
              {caseNumber}
            </span>
          </SheetTitle>
          <p className="text-muted-foreground text-[11px]">
            2차 답안 작성 순서 — 사실관계 → 쟁점 → 법조문 → 법리 → 포섭 → 결론
          </p>
        </SheetHeader>

        <div className="space-y-4 px-4 py-4">
          {/* 사실관계 — 판례당 1개. 2차는 이 부분을 각색해 출제된다. */}
          <section>
            <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-bold">
              <Badge variant="secondary" className="rounded-sm px-1.5 py-0">
                사실관계
              </Badge>
              {caption ? (
                <span className="text-muted-foreground text-[11px] font-normal">
                  {caption}
                </span>
              ) : null}
            </h3>
            {diagram.factsMd.trim() ? (
              <div className="border-border bg-muted/30 text-foreground rounded-lg border p-3 text-[13px] leading-relaxed whitespace-pre-wrap">
                {diagram.factsMd}
              </div>
            ) : (
              <p className="border-border text-muted-foreground rounded-lg border border-dashed p-3 text-xs">
                이 판례는 사실관계가 아직 정리되지 않았습니다. 쟁점부터
                확인하세요.
              </p>
            )}
          </section>

          {/* 쟁점 단위 블록 — 쟁점마다 법조문·법리·포섭·결론 1세트. */}
          {diagram.blocks.map((b, i) => {
            const axes = filledAxes(b);
            return (
              <section
                key={i}
                className="border-border bg-card rounded-xl border p-3 shadow-sm"
              >
                <h3 className="mb-2 flex items-start gap-1.5 text-[13px] font-bold">
                  <Badge className="mt-0.5 shrink-0 rounded-sm px-1.5 py-0">
                    쟁점 {i + 1}
                  </Badge>
                  <span className="leading-snug">{b.issue}</span>
                </h3>

                {b.statutes.length > 0 ? (
                  <Row label="법조문">
                    <div className="flex flex-wrap gap-1">
                      {b.statutes.map((s) => (
                        <span
                          key={s}
                          className="border-border text-muted-foreground rounded border px-1.5 py-0.5 text-[11px]"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </Row>
                ) : null}

                {axes.length > 0 ? (
                  <Row label="법리">
                    <div className="space-y-2">
                      {axes.map((ax) => (
                        <div key={ax.key}>
                          <span className="bg-primary/10 text-link rounded px-1.5 py-0.5 text-[10px] font-semibold">
                            {ax.label}
                          </span>
                          <p className="mt-1 text-[13px] leading-relaxed">
                            {ax.body}
                          </p>
                        </div>
                      ))}
                    </div>
                  </Row>
                ) : null}

                {b.application ? (
                  <Row label="사안의 포섭">
                    <p className="text-[13px] leading-relaxed">
                      {b.application}
                    </p>
                  </Row>
                ) : null}

                {b.conclusion ? (
                  <Row label="결론">
                    <p className="text-[13px] leading-relaxed font-medium">
                      {b.conclusion}
                    </p>
                  </Row>
                ) : null}
              </section>
            );
          })}

          {diagram.blocks.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              아직 쟁점이 정리되지 않았습니다.
            </p>
          ) : null}

          {draft ? (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400">
              검수 전 초안입니다 — 운영자에게만 보입니다.
            </p>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-2">
      <p className="text-muted-foreground mb-1 text-[10px] font-semibold tracking-wide">
        {label}
      </p>
      {children}
    </div>
  );
}
