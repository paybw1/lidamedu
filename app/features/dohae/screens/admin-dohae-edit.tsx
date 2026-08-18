// /admin/dohae/:unitKey — 도해 유닛 **텍스트** 편집. ★staff 전용.
//
// 구조(표 병합·열 너비·음영·굵게·다이어그램)는 원본 HWPX 에서 온 값이라 여기서 못 바꾼다.
// 오타·조문 표기 정정 같은 실수요를 덮는 게 목적이고, 구조를 바꿔야 하면 원본을 고쳐
// 재파싱하는 편이 안전하다.
//
// ★편집분은 재시드(seed-dohae)로 사라진다 — 원장(content_revisions)이 유일한 복구 원천
//   (원장 판단 2026-08-17: 날아가도 무방, 대신 무엇을 고쳤는지는 남길 것).

import type { Route } from "./+types/admin-dohae-edit";

import { ArrowLeftIcon, HistoryIcon, MegaphoneIcon, SaveIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, data, useNavigation } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Textarea } from "~/core/components/ui/textarea";
import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { cn } from "~/core/lib/utils";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { ErrataPublishModal } from "~/features/errata/components/errata-publish-modal";
import { getUnpublishedRevisions } from "~/features/errata/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";

import { dohaeUnitLabel, type DohaeBlock } from "../labels";
import { applyTextEdits, collectTextNodes } from "../lib/dohae-edit";
import { listDohaeRevisions, type DohaeRevision } from "../queries.server";

export const meta: Route.MetaFunction = () => [
  { title: "도해 유닛 편집 | 리담변리사학원" },
];

const BOOK = "dohae_patent_20";

/** staff 게이트 + 유닛 조회 — loader·action 공용. */
async function loadUnit(request: Request, unitKey: string | undefined) {
  if (!unitKey) throw data("Missing unitKey", { status: 400 });
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const { data: row, error } = await client
    .from("dohae_units")
    .select("unit_id, unit_key, kind, title, chapter_no, chapter_title, unit_no, ref_no, pdf_page, blocks")
    .eq("book_code", BOOK)
    .eq("unit_key", unitKey)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw data("Not found", { status: 404 });
  return { client, role, row };
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const { client, role, row } = await loadUnit(request, params.unitKey);
  const blocks = (row.blocks ?? []) as DohaeBlock[];
  // 편집 이력 — 편집분은 재시드로 사라지므로 이 원장이 유일한 복구 원천이다.
  const revisions = await listDohaeRevisions(client, adminClient, row.unit_id);
  return {
    role,
    revisions,
    unit: {
      unitId: row.unit_id,
      unitKey: row.unit_key,
      kind: row.kind as "topic" | "reference",
      title: row.title,
      chapterNo: row.chapter_no,
      chapterTitle: row.chapter_title,
      unitNo: row.unit_no,
      refNo: row.ref_no,
      pdfPage: row.pdf_page,
    },
    nodes: collectTextNodes(blocks),
  };
}

export async function action({ params, request }: Route.ActionArgs) {
  const { client, row } = await loadUnit(request, params.unitKey);
  const fd = await request.formData();

  // 경로 → 새 텍스트. 구조는 서버가 가진 원본을 그대로 쓰고 텍스트만 갈아끼운다.
  const edits: Record<string, string> = {};
  for (const [k, v] of fd.entries()) {
    if (!k.startsWith("t:") || typeof v !== "string") continue;
    edits[k.slice(2)] = v;
  }

  const result = applyTextEdits((row.blocks ?? []) as DohaeBlock[], edits);
  if (result.rejected.length > 0) {
    // 구조와 안 맞는 경로가 하나라도 있으면 저장하지 않는다 — 다른 사람이 재시드해
    // 블록이 바뀐 상태일 수 있다(그대로 밀면 엉뚱한 칸을 덮는다).
    return {
      ok: false as const,
      error: `본문 구조가 바뀌었습니다(${result.rejected.length}곳). 새로고침 후 다시 시도해 주세요.`,
    };
  }
  if (result.changed.length === 0) {
    return { ok: false as const, error: "변경된 내용이 없습니다." };
  }

  // ★요청 클라이언트로 쓴다(adminClient 금지) — RLS staff UPDATE 정책이 최종 방어선이고,
  //   원장 트리거가 auth.uid() 로 작성자를 남긴다.
  const { error } = await client
    .from("dohae_units")
    .update({
      // blocks 는 jsonb — 생성 타입의 Json 과 DohaeBlock 은 구조가 같지만 서로
      // 대입되지 않는다(인덱스 시그니처 없음). 직렬화해 형태를 맞춘다.
      blocks: JSON.parse(JSON.stringify(result.blocks)),
      updated_at: new Date().toISOString(),
    })
    .eq("unit_id", row.unit_id);
  if (error) return { ok: false as const, error: error.message };

  // ★두 갈래(원장 지시 2026-08-18) — 추록·정오표는 **실제 책이 바뀐 때만** 발행한다.
  //   적재 오류 정정(파서가 잘못 읽은 텍스트·오타)은 책이 바뀐 게 아니므로 원장에만 남긴다
  //   (메모: errata-only-for-book-changes). 발행을 고른 경우에만 방금 난 원장 묶음을
  //   돌려주고, 화면이 발행 모달을 연다.
  if (fd.get("publishIntent") === "1") {
    const revisions = await getUnpublishedRevisions(client, ["dohae"], row.unit_id);
    return {
      ok: true as const,
      changed: result.changed.length,
      publishRevisionIds: revisions.map((r) => r.revisionId),
    };
  }

  return { ok: true as const, changed: result.changed.length };
}

export default function AdminDohaeEdit({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { role, unit, nodes, revisions } = loaderData;
  const nav = useNavigation();
  const saving = nav.state !== "idle";
  const [draft, setDraft] = useState<Record<string, string>>({});
  // 저장이 끝나 원장 묶음을 받으면 발행 모달을 연다(취소해도 저장은 유지).
  const [publishIds, setPublishIds] = useState<string[] | null>(null);
  const returnedIds = actionData?.ok ? actionData.publishRevisionIds : undefined;
  useEffect(() => {
    if (returnedIds && returnedIds.length > 0) setPublishIds(returnedIds);
  }, [returnedIds]);

  const original = useMemo(
    () => new Map(nodes.map((n) => [n.path, n.text])),
    [nodes],
  );
  const dirty = Object.entries(draft).filter(
    ([p, v]) => (original.get(p) ?? "") !== v,
  );

  return (
    <AdminShell
      cluster="laws"
      role={role}
      title={`도해 편집 — ${dohaeUnitLabel(unit)} ${unit.title}`}
      desc={`제${unit.chapterNo}장 ${unit.chapterTitle}${unit.pdfPage ? ` · 원본 p.${unit.pdfPage}` : ""} — 텍스트만 수정합니다. 표 구조·열 너비·서식은 원본 그대로 유지됩니다.`}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm" className="h-8">
          <Link to="/admin/dohae">
            <ArrowLeftIcon className="size-3.5" /> 목록
          </Link>
        </Button>
        {actionData?.ok ? (
          <p className="text-[13px] font-medium text-emerald-600 dark:text-emerald-400">
            {actionData.changed}곳을 저장했습니다.
          </p>
        ) : actionData?.error ? (
          <p className="text-destructive text-[13px] font-medium">
            {actionData.error}
          </p>
        ) : null}
      </div>

      <form method="post">
        {/* 편집하지 않은 칸도 함께 보내면 폼이 커지기만 하므로, 바뀐 것만 담는다. */}
        {dirty.map(([path, value]) => (
          <input key={path} type="hidden" name={`t:${path}`} value={value} />
        ))}

        <div className="bg-card divide-border divide-y rounded-xl border shadow-sm">
          {nodes.map((n) => {
            const value = draft[n.path] ?? n.text;
            const isDirty = value !== n.text;
            return (
              <div
                key={n.path}
                className={cn("px-4 py-2.5", isDirty && "bg-amber-50/60 dark:bg-amber-950/20")}
              >
                <p className="text-muted-foreground mb-1 flex items-center gap-1.5 text-[11px]">
                  <span className="font-medium">{n.label}</span>
                  {isDirty ? (
                    <span className="font-semibold text-amber-600 dark:text-amber-400">
                      수정됨
                    </span>
                  ) : null}
                </p>
                {n.multiline ? (
                  <Textarea
                    value={value}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, [n.path]: e.target.value }))
                    }
                    rows={Math.min(12, Math.max(2, value.split("\n").length + 1))}
                    className="text-[13px] leading-relaxed"
                  />
                ) : (
                  <input
                    type="text"
                    value={value}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, [n.path]: e.target.value }))
                    }
                    className="border-input focus:ring-ring w-full rounded-md border px-2.5 py-1.5 text-[13px] focus:ring-2 focus:outline-none"
                  />
                )}
              </div>
            );
          })}
        </div>

        <div className="bg-background/95 sticky bottom-0 mt-3 flex flex-wrap items-center gap-2 border-t py-3 backdrop-blur">
          {/* 두 갈래 — 기본은 적재 오류 정정(발행 안 함). 책이 실제로 바뀐 경우만 발행. */}
          <Button type="submit" disabled={saving || dirty.length === 0} className="h-9">
            <SaveIcon className="size-3.5" />
            {saving ? "저장 중…" : `적재 오류 정정으로 저장 (${dirty.length}곳)`}
          </Button>
          <Button
            type="submit"
            name="publishIntent"
            value="1"
            variant="outline"
            disabled={saving || dirty.length === 0}
            title="교재 내용 자체가 바뀐 경우에만 사용하세요. 저장 후 추록·정오표 발행 모달이 열립니다."
            className="h-9"
          >
            <MegaphoneIcon className="size-3.5" /> 책 내용 정정 + 추록·정오표 발행
          </Button>
          {dirty.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9"
              onClick={() => setDraft({})}
            >
              되돌리기
            </Button>
          ) : null}
          <p className="text-muted-foreground ml-auto text-[11px]">
            텍스트 {nodes.length}곳 · 오타·적재 오류는 발행 대상이 아닙니다.
          </p>
        </div>
      </form>

      {publishIds ? (
        <ErrataPublishModal
          open
          onOpenChange={() => {}}
          revisionIds={publishIds}
          defaultKind="typo"
          onDone={() => setPublishIds(null)}
        />
      ) : null}

      <RevisionHistory revisions={revisions} />
    </AdminShell>
  );
}

// 편집 이력 — ★재시드로 편집분이 사라져도 여기서 무엇을 고쳤는지 되찾을 수 있다.
//   원장은 append-only 라 지워지지 않는다.
function RevisionHistory({ revisions }: { revisions: DohaeRevision[] }) {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("ko-KR", {
      year: "2-digit",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  return (
    <section className="mt-6">
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold tracking-tight">
        <HistoryIcon className="size-3.5" /> 변경 이력
        {revisions.length > 0 ? (
          <span className="text-muted-foreground text-xs font-normal tabular-nums">
            {revisions.length}
          </span>
        ) : null}
      </h2>
      {revisions.length === 0 ? (
        <p className="text-muted-foreground text-[13px]">
          아직 편집 기록이 없습니다.
        </p>
      ) : (
        <ul className="space-y-2">
          {revisions.map((r) => (
            <li key={r.revisionId} className="bg-card rounded-xl border px-4 py-2.5 shadow-sm">
              <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-[11px]">
                <span className="text-foreground font-medium">
                  {r.authorName ?? (r.systemLabel === "system" ? "시드·시스템" : "알 수 없음")}
                </span>
                <span className="tabular-nums">{fmt(r.createdAt)}</span>
                <span>{r.op}</span>
                {r.otherFields.length > 0 ? (
                  <span>기타 필드: {r.otherFields.join(", ")}</span>
                ) : null}
              </p>
              {r.diffs.length === 0 ? (
                <p className="text-muted-foreground mt-1 text-[12px]">
                  텍스트 변경 없음
                </p>
              ) : (
                <ul className="mt-1.5 space-y-1.5">
                  {r.diffs.map((d) => (
                    <li key={d.path} className="text-[12px] leading-relaxed">
                      <span className="text-muted-foreground mr-1.5 text-[11px]">
                        {d.label}
                      </span>
                      <span className="text-destructive line-through decoration-1">
                        {d.before || "(빈칸)"}
                      </span>
                      <span className="text-muted-foreground mx-1">→</span>
                      <span className="font-medium text-emerald-700 dark:text-emerald-400">
                        {d.after || "(빈칸)"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
