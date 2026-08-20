// feat-2-035 — 판례 도식 편집(staff). 사실관계 + 쟁점 블록(법조문·법리 4축·포섭·결론).
//
// ★AI 초안은 "쟁점~결론"만 만든다. 사실관계의 근거는 하급심 판결문이고 그 전문은 로컬 캐시라
//   서버리스 런타임에서 읽을 수 없다 — 사실관계는 배치 스크립트가 채우거나 여기서 직접 쓴다.
//   설계 §2 소스 이원화(사실관계=하급심 / 쟁점~결론=대법원)와 같은 경계다.

import { useState } from "react";
import {
  ArrowLeftIcon,
  CheckIcon,
  PlusIcon,
  SparklesIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { Form, Link, data, redirect, useNavigation } from "react-router";
import { z } from "zod";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { Textarea } from "~/core/components/ui/textarea";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { runAfterResponse } from "~/core/lib/wait-until.server";
import { Chip } from "~/features/community/components/community-ui";
import { draftCaseDiagramBlocks } from "~/features/cases/lib/ai-case-diagram-drafter.server";
import {
  DOCTRINE_AXES,
  FACTS_SOURCE_KINDS,
  FACTS_SOURCE_LABEL,
  caseDiagramBlocksSchema,
  diagramApprovable,
  emptyBlock,
  type CaseDiagramBlock,
  type FactsSourceKind,
} from "~/features/cases/lib/case-diagram";
import {
  approveCaseDiagram,
  getCaseDiagramEditContext,
  rejectCaseDiagram,
  replaceCaseDiagramBlocks,
  softDeleteCaseDiagram,
  upsertCaseDiagram,
} from "~/features/cases/queries-case-diagram.server";
import {
  capBlockedMessage,
  checkAiCap,
  notifyCapReachedOnce,
  recordAiUsage,
} from "~/features/gs/lib/usage-tracker.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/admin-case-diagram-edit";

const MIN_OFFICIAL_TEXT = 200;

export const meta: Route.MetaFunction = () => [
  { title: "판례 도식 편집 | 리담변리사학원" },
];

export async function loader({ request, params }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  if (!params.caseId) throw data("Not found", { status: 404 });
  const ctx = await getCaseDiagramEditContext(client, params.caseId);
  if (!ctx) throw data("Not found", { status: 404 });
  return {
    role,
    kase: {
      ...ctx.kase,
      // 전문은 화면에서 쓰지 않는다(길이만 필요) — 페이로드 절감.
      officialTextMd: null,
      officialTextLen: ctx.kase.officialTextMd?.trim().length ?? 0,
    },
    diagram: ctx.diagram,
  };
}

const saveSchema = z.object({
  factsMd: z.string().trim().max(20000),
  factsSourceKind: z.enum(FACTS_SOURCE_KINDS),
  factsSourceRef: z.string().trim().max(200),
  blocksJson: z.string(),
});

export async function action({ request, params }: Route.ActionArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) return data({ error: "Forbidden" }, { status: 403 });

  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "");
  const caseId = params.caseId;
  if (!caseId) return data({ error: "Not found" }, { status: 404 });

  if (intent === "save") {
    const parsed = saveSchema.safeParse({
      factsMd: fd.get("factsMd") ?? "",
      factsSourceKind: fd.get("factsSourceKind") ?? "none",
      factsSourceRef: fd.get("factsSourceRef") ?? "",
      blocksJson: fd.get("blocksJson") ?? "[]",
    });
    if (!parsed.success) return data({ error: "입력값이 올바르지 않습니다." });

    let rawBlocks: unknown;
    try {
      rawBlocks = JSON.parse(parsed.data.blocksJson);
    } catch {
      return data({ error: "쟁점 데이터를 읽지 못했습니다." });
    }
    const blocks = caseDiagramBlocksSchema.safeParse(rawBlocks);
    if (!blocks.success) {
      return data({ error: "쟁점은 2자 이상 입력해야 합니다." });
    }
    await upsertCaseDiagram(client, {
      caseId,
      factsMd: parsed.data.factsMd,
      factsSourceKind: parsed.data.factsSourceKind,
      factsSourceRef: parsed.data.factsSourceRef || null,
      blocks: blocks.data,
      generatedBy: "staff",
      userId: user.id,
    });
    return data({ ok: "저장했습니다. (검수 대기 상태)" });
  }

  if (intent === "draft") {
    const ctx = await getCaseDiagramEditContext(client, caseId);
    if (!ctx) return data({ error: "판례를 찾지 못했습니다." }, { status: 404 });
    const officialText = ctx.kase.officialTextMd?.trim() ?? "";
    if (officialText.length < MIN_OFFICIAL_TEXT) {
      return data({
        error:
          "판례 전문이 없거나 너무 짧아 초안을 만들 수 없습니다. 직접 작성해 주세요.",
      });
    }
    const cap = await checkAiCap();
    if (cap.blocked) {
      await recordAiUsage({
        kind: "ai_case_diagram_draft",
        model: "claude-opus-4-7",
        inputTokens: 0,
        outputTokens: 0,
        outcome: "skipped_cap",
        meta: { userId: user.id },
        reason: cap.reason,
      });
      runAfterResponse(notifyCapReachedOnce(cap));
      return data({ error: capBlockedMessage(cap) }, { status: 503 });
    }
    const blocks = await draftCaseDiagramBlocks({
      caseTitle: ctx.kase.caseTitle,
      caseNumber: ctx.kase.caseNumber,
      court: ctx.kase.court,
      decidedAt: ctx.kase.decidedAt,
      officialTextMd: officialText,
      summaryItems: ctx.kase.summaryItems,
      usage: { meta: { userId: user.id } },
    });
    if (!blocks) {
      return data({ error: "AI 초안 생성에 실패했습니다. 다시 시도해 주세요." });
    }
    await replaceCaseDiagramBlocks(client, {
      caseId,
      blocks,
      userId: user.id,
    });
    return data({ ok: `쟁점 ${blocks.length}개 초안을 생성했습니다.` });
  }

  if (intent === "approve") {
    const ctx = await getCaseDiagramEditContext(client, caseId);
    if (!ctx?.diagram) return data({ error: "도식이 없습니다." });
    if (!diagramApprovable(ctx.diagram.blocks)) {
      return data({
        error: "쟁점이 1개 이상 있어야 하고, 각 쟁점에 결론이 있어야 승인됩니다.",
      });
    }
    await approveCaseDiagram(client, {
      diagramId: ctx.diagram.diagramId,
      userId: user.id,
    });
    return data({ ok: "승인했습니다. 학생에게 공개됩니다." });
  }

  if (intent === "reject") {
    const ctx = await getCaseDiagramEditContext(client, caseId);
    if (!ctx?.diagram) return data({ error: "도식이 없습니다." });
    const reason = String(fd.get("reason") ?? "").trim();
    if (!reason) return data({ error: "반려 사유를 입력하세요." });
    await rejectCaseDiagram(client, {
      diagramId: ctx.diagram.diagramId,
      reason,
    });
    return data({ ok: "반려 처리했습니다." });
  }

  if (intent === "delete") {
    const ctx = await getCaseDiagramEditContext(client, caseId);
    if (ctx?.diagram) await softDeleteCaseDiagram(client, ctx.diagram.diagramId);
    return redirect("/admin/case-diagrams");
  }

  return data({ error: "알 수 없는 요청입니다." }, { status: 400 });
}

export default function AdminCaseDiagramEdit({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { kase, diagram, role } = loaderData;
  const nav = useNavigation();
  const busy = nav.state !== "idle";

  const [factsMd, setFactsMd] = useState(diagram?.factsMd ?? "");
  const [factsSourceKind, setFactsSourceKind] = useState<FactsSourceKind>(
    diagram?.factsSourceKind ?? "none",
  );
  const [factsSourceRef, setFactsSourceRef] = useState(
    diagram?.factsSourceRef ?? "",
  );
  const [blocks, setBlocks] = useState<CaseDiagramBlock[]>(
    diagram?.blocks.length ? diagram.blocks : [emptyBlock()],
  );

  const patchBlock = (idx: number, patch: Partial<CaseDiagramBlock>) =>
    setBlocks((prev) =>
      prev.map((b, i) => (i === idx ? { ...b, ...patch } : b)),
    );
  const patchDoctrine = (idx: number, key: string, value: string) =>
    setBlocks((prev) =>
      prev.map((b, i) =>
        i === idx ? { ...b, doctrine: { ...b.doctrine, [key]: value } } : b,
      ),
    );

  return (
    <AdminShell
      cluster="cases"
      role={role}
      title="판례 도식 편집"
      desc={`${kase.caseNumber} · ${kase.court} ${kase.decidedAt}`}
      width={960}
    >
      <Link
        to="/admin/case-diagrams"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-xs"
      >
        <ArrowLeftIcon className="size-3.5" /> 목록으로
      </Link>

      <header className="mb-5">
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          {diagram ? (
            diagram.reviewStatus === "approved" ? (
              <Chip tone="emerald">승인</Chip>
            ) : diagram.reviewStatus === "rejected" ? (
              <Chip tone="coral">반려</Chip>
            ) : (
              <Chip tone="amber">검수 대기</Chip>
            )
          ) : (
            <Chip tone="outline">미생성</Chip>
          )}
          <Chip tone="outline">{kase.caseNumber}</Chip>
          <Chip tone="outline">
            {kase.court} {kase.decidedAt}
          </Chip>
          <Chip tone="outline">전문 {kase.officialTextLen.toLocaleString()}자</Chip>
        </div>
        <h1 className="text-lg font-bold">{kase.caseTitle}</h1>
        {diagram?.rejectedReason ? (
          <p className="mt-2 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
            반려 사유: {diagram.rejectedReason}
          </p>
        ) : null}
      </header>

      {actionData && "error" in actionData && actionData.error ? (
        <p className="mb-4 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
          {actionData.error}
        </p>
      ) : null}
      {actionData && "ok" in actionData && actionData.ok ? (
        <p className="mb-4 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          {actionData.ok}
        </p>
      ) : null}

      {/* ── AI 초안 (쟁점~결론) ───────────────────────────────────────── */}
      <Form method="post" className="mb-5">
        <input type="hidden" name="intent" value="draft" />
        <div className="border-border bg-muted/30 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">AI 초안 — 쟁점 ~ 결론</p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              대법원 판결문에서 쟁점·법조문·법리(근거 있는 축만)·포섭·결론을 만듭니다.
              사실관계는 하급심이 근거라 여기서 만들지 않습니다 — 아래에 직접 쓰거나
              배치 스크립트로 채웁니다. ★기존 쟁점 블록은 교체됩니다.
            </p>
          </div>
          <Button
            type="submit"
            variant="outline"
            className="rounded-full"
            disabled={busy || kase.officialTextLen < MIN_OFFICIAL_TEXT}
          >
            <SparklesIcon className="size-4" /> 초안 생성
          </Button>
        </div>
      </Form>

      <Form method="post" className="space-y-5">
        <input type="hidden" name="intent" value="save" />
        <input
          type="hidden"
          name="blocksJson"
          value={JSON.stringify(blocks)}
        />

        {/* ── 사실관계 ─────────────────────────────────────────────── */}
        <section className="border-border bg-card rounded-xl border p-4 shadow-sm">
          <h2 className="mb-1 text-sm font-bold">사실관계</h2>
          <p className="text-muted-foreground mb-3 text-xs">
            2차는 이 사실관계를 각색해 출제됩니다. 근거는 하급심 판결문 —
            없으면 비워 두세요(창작 금지).
          </p>
          <Textarea
            name="factsMd"
            value={factsMd}
            onChange={(e) => setFactsMd(e.target.value)}
            rows={10}
            placeholder="누가·언제·무엇을 했고 어떤 분쟁이 생겼는지"
            className="text-sm"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select
              name="factsSourceKind"
              value={factsSourceKind}
              onChange={(e) =>
                setFactsSourceKind(e.target.value as FactsSourceKind)
              }
              className="border-border bg-background h-8 rounded-lg border px-2 text-xs"
            >
              {FACTS_SOURCE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {FACTS_SOURCE_LABEL[k]}
                </option>
              ))}
            </select>
            <Input
              name="factsSourceRef"
              value={factsSourceRef}
              onChange={(e) => setFactsSourceRef(e.target.value)}
              placeholder="출처 표기 — 예: 특허법원 2022허4635"
              className="h-8 max-w-xs text-xs"
            />
          </div>
        </section>

        {/* ── 쟁점 블록 ────────────────────────────────────────────── */}
        {blocks.map((b, idx) => (
          <section
            key={idx}
            className="border-border bg-card rounded-xl border p-4 shadow-sm"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-bold">쟁점 {idx + 1}</h2>
              <button
                type="button"
                onClick={() =>
                  setBlocks((prev) => prev.filter((_, i) => i !== idx))
                }
                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
              >
                <XIcon className="size-3.5" /> 삭제
              </button>
            </div>

            <Field label="쟁점">
              <Input
                value={b.issue}
                onChange={(e) => patchBlock(idx, { issue: e.target.value })}
                placeholder="이 쟁점에서 무엇이 문제되는가"
                className="text-sm"
              />
            </Field>

            <Field label="법조문" hint="쉼표로 구분. 판결문에 명시된 것만.">
              <Input
                value={b.statutes.join(", ")}
                onChange={(e) =>
                  patchBlock(idx, {
                    statutes: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="특허법 제29조 제2항"
                className="text-sm"
              />
            </Field>

            <div className="mt-3">
              <p className="text-muted-foreground mb-2 text-xs font-semibold">
                법리 — 판결문에서 확인되는 축만 채우세요(빈 축은 학생 화면에
                나타나지 않습니다)
              </p>
              <div className="space-y-2">
                {DOCTRINE_AXES.map((ax) => (
                  <div key={ax.key}>
                    <label className="text-muted-foreground mb-1 block text-[11px]">
                      {ax.label}
                      <span className="text-muted-foreground/70">
                        {" "}
                        — {ax.hint}
                      </span>
                    </label>
                    <Textarea
                      value={b.doctrine[ax.key] ?? ""}
                      onChange={(e) =>
                        patchDoctrine(idx, ax.key, e.target.value)
                      }
                      rows={2}
                      className="text-sm"
                    />
                  </div>
                ))}
              </div>
            </div>

            <Field label="사안의 포섭">
              <Textarea
                value={b.application}
                onChange={(e) =>
                  patchBlock(idx, { application: e.target.value })
                }
                rows={3}
                className="text-sm"
              />
            </Field>

            <Field label="결론">
              <Textarea
                value={b.conclusion}
                onChange={(e) =>
                  patchBlock(idx, { conclusion: e.target.value })
                }
                rows={2}
                className="text-sm"
              />
            </Field>
          </section>
        ))}

        <button
          type="button"
          onClick={() => setBlocks((prev) => [...prev, emptyBlock()])}
          className="border-border text-muted-foreground hover:bg-muted w-full rounded-xl border border-dashed py-3 text-xs font-semibold"
        >
          <PlusIcon className="mr-1 inline size-3.5" /> 쟁점 추가
        </button>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button type="submit" className="rounded-full" disabled={busy}>
            저장
          </Button>
          <span className="text-muted-foreground text-xs">
            저장하면 검수 대기 상태가 됩니다.
          </span>
        </div>
      </Form>

      {/* ── 승인 / 반려 / 삭제 ───────────────────────────────────────── */}
      {diagram ? (
        <div className="border-border mt-6 space-y-3 rounded-xl border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Form method="post">
              <input type="hidden" name="intent" value="approve" />
              <Button
                type="submit"
                className="rounded-full"
                disabled={busy || diagram.reviewStatus === "approved"}
              >
                <CheckIcon className="size-4" /> 승인
              </Button>
            </Form>
            <Form method="post" className="flex items-center gap-2">
              <input type="hidden" name="intent" value="reject" />
              <Input
                name="reason"
                placeholder="반려 사유"
                className="h-9 w-56 text-xs"
              />
              <Button
                type="submit"
                variant="outline"
                className="rounded-full"
                disabled={busy}
              >
                반려
              </Button>
            </Form>
            <Form method="post" className="ml-auto">
              <input type="hidden" name="intent" value="delete" />
              <Button
                type="submit"
                variant="ghost"
                className="text-muted-foreground rounded-full"
                disabled={busy}
              >
                <Trash2Icon className="size-4" /> 도식 삭제
              </Button>
            </Form>
          </div>
          <p className="text-muted-foreground text-xs">
            승인 조건 — 쟁점 1개 이상 + 각 쟁점에 결론. 저장 후 승인하세요(저장하면
            검수 대기로 되돌아갑니다).
          </p>
        </div>
      ) : null}
    </AdminShell>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3">
      <label className="text-muted-foreground mb-1 block text-[11px] font-semibold">
        {label}
        {hint ? (
          <span className="text-muted-foreground/70 font-normal"> — {hint}</span>
        ) : null}
      </label>
      {children}
    </div>
  );
}
