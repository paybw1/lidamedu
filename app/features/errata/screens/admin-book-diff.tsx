// feat-3-604 S3 — 판 대조 후보 검수(staff). 인쇄본과 개정중 원고를 맞춰 뽑은 후보를 건별로
// 판정하고, 정오표·추록으로 정한 것만 묶어 발행한다.
//
// ★후보를 만드는 것은 스크립트다(`scripts/errata/ingest-book-diff.mjs`, service_role).
//   이 화면은 **판정과 발행만** 한다 — 검수함에 INSERT 정책이 없다.
// ★발행은 새 경로를 만들지 않는다. `fn_publish_book_errata` 가 원장 메타 행을 만들어
//   기존 `fn_publish_errata` 로 넘기고, 그러면 시트 PDF·`/study/errata` 가 알아서 따라온다.
// ★표·도해 후보는 글자만으로 판정이 안 선다 — 로컬 `tmp/book-diff/<책>/changes.html` 을
//   옆에 띄워 놓고 구판 쪽 그림을 보면서 정한다(운영 화면은 그 그림을 볼 수 없다).

import { useState } from "react";
import { SendIcon } from "lucide-react";
import { Form, data, redirect, useFetcher } from "react-router";
import { z } from "zod";

import { Input } from "~/core/components/ui/input";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip } from "~/features/admin/components/admin-ui";
import {
  BOOK_DIFF_DECISIONS,
  BOOK_DIFF_DECISION_LABEL,
  type BookDiffDecision,
} from "~/features/errata/labels";
import { ERRATA_KINDS, ERRATA_SEVERITIES } from "~/features/errata/labels";
import { regenerateForRevisions } from "~/features/errata/pdf/regenerate.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/admin-book-diff";

export const meta: Route.MetaFunction = () => [
  { title: "판 대조 검수 | 리담변리사학원" },
];

const LIST_LIMIT = 300;

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/auth/login?next=/admin/book-diff");
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const params = new URL(request.url).searchParams;
  const decision = params.get("decision") ?? "pending";
  const confidence = params.get("confidence") ?? "";
  const bucket = params.get("bucket") ?? "";

  const { data: editions, error: edErr } = await client
    .from("publication_editions")
    .select("edition_id, edition_label, publications(title)")
    .order("edition_label");
  if (edErr) throw edErr;

  let query = client
    .from("book_diff_candidates")
    .select(
      "candidate_id, edition_id, page_no, bucket, change_type, confidence, before_text, after_text, decision, decision_note, published_revision_id, status",
    )
    .eq("status", "current")
    .order("page_no", { ascending: true, nullsFirst: false })
    .limit(LIST_LIMIT);
  const editionId = params.get("edition");
  if (editionId) query = query.eq("edition_id", editionId);
  if (decision !== "all") query = query.eq("decision", decision);
  if (confidence) query = query.eq("confidence", confidence);
  if (bucket) query = query.ilike("bucket", `%${bucket}%`);
  const { data: rows, error } = await query;
  if (error) throw error;

  // 남은 일감 — 판정 필터를 걸어 놔도 전체 진행이 보여야 한다.
  const { data: all, error: cntErr } = await client
    .from("book_diff_candidates")
    .select("decision, edition_id")
    .eq("status", "current");
  if (cntErr) throw cntErr;
  const counts: Record<string, number> = {};
  for (const r of all ?? []) {
    if (editionId && r.edition_id !== editionId) continue;
    counts[r.decision] = (counts[r.decision] ?? 0) + 1;
  }

  return {
    role,
    filters: { edition: editionId ?? "", decision, confidence, bucket },
    counts,
    editions: (editions ?? []).map((e) => ({
      editionId: e.edition_id,
      label: `${e.publications?.title ?? "?"} ${e.edition_label}`,
    })),
    items: (rows ?? []).map((r) => ({
      candidateId: r.candidate_id,
      pageNo: r.page_no,
      bucket: r.bucket,
      changeType: r.change_type,
      confidence: r.confidence,
      beforeText: r.before_text,
      afterText: r.after_text,
      decision: r.decision as BookDiffDecision,
      decisionNote: r.decision_note ?? "",
      publishedRevisionId: r.published_revision_id,
    })),
  };
}

const decideSchema = z.object({
  candidateId: z.string().uuid(),
  decision: z.enum(BOOK_DIFF_DECISIONS.map((d) => d.value) as [string, ...string[]]),
  note: z.string().max(1000).optional(),
});

const publishSchema = z.object({
  candidateIds: z.array(z.string().uuid()).min(1, "발행할 항목을 고르세요"),
  kind: z.enum(ERRATA_KINDS.map((k) => k.value) as [string, ...string[]]).optional(),
  severity: z.enum(ERRATA_SEVERITIES.map((s) => s.value) as [string, ...string[]]),
  reason: z.string().max(2000).default(""),
});

export async function action({ request }: Route.ActionArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "decide") {
    const parsed = decideSchema.safeParse({
      candidateId: form.get("candidateId"),
      decision: form.get("decision"),
      note: form.get("note") ?? undefined,
    });
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "입력 확인" };
    }
    // ★요청 클라이언트로 쓴다 — RLS(book_diff_staff_update = is_staff)가 권한의 근거다.
    const { error } = await client
      .from("book_diff_candidates")
      .update({
        decision: parsed.data.decision,
        decision_note: parsed.data.note?.trim() || null,
        decided_by: user.id,
        decided_at: new Date().toISOString(),
      })
      .eq("candidate_id", parsed.data.candidateId);
    if (error) return { ok: false, error: error.message };
    return { ok: true, message: "" };
  }

  if (intent === "publish") {
    // 발행은 원장·관리자만. RPC 안에서도 private.is_publisher 로 한 번 더 막는다.
    if (role !== "manager" && role !== "admin") {
      return { ok: false, error: "발행은 원장·관리자만 할 수 있습니다." };
    }
    const parsed = publishSchema.safeParse({
      candidateIds: form.getAll("candidateId").map(String),
      kind: form.get("kind") ? String(form.get("kind")) : undefined,
      severity: String(form.get("severity") ?? "normal"),
      reason: String(form.get("reason") ?? ""),
    });
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "입력 확인" };
    }
    const { data: published, error } = await client.rpc("fn_publish_book_errata", {
      p_candidate_ids: parsed.data.candidateIds,
      // 유형을 안 고르면 RPC 가 판정대로 정한다(정오표=정오 · 추록=추록).
      p_errata_kind: parsed.data.kind ?? undefined,
      p_errata_severity: parsed.data.severity,
      p_errata_reason: parsed.data.reason,
    });
    if (error) return { ok: false, error: error.message };
    const ids = (published ?? []) as string[];
    if (ids.length === 0) {
      return {
        ok: false,
        error: "발행된 항목이 없습니다 — 정오표·추록으로 판정된 것만 발행됩니다.",
      };
    }
    // 시트 PDF 는 파생물이다. 실패해도 발행은 이미 커밋됐다(수동 재렌더로 복구).
    const rendered = await regenerateForRevisions(ids);
    const failed = rendered.filter((r) => !r.ok);
    return {
      ok: true,
      message:
        failed.length > 0
          ? `${ids.length}건 발행했지만 시트 재렌더 실패: ${failed[0].error ?? "?"}`
          : `${ids.length}건을 발행하고 시트 ${rendered.length}건을 다시 그렸습니다.`,
    };
  }

  return { ok: false, error: "알 수 없는 요청" };
}

const CONFIDENCE_TONE = {
  확실: "coral",
  일부: "amber",
  이동: "neutral",
} as const;

export default function AdminBookDiff({ loaderData, actionData }: Route.ComponentProps) {
  const { role, filters, counts, editions, items } = loaderData;
  const canPublish = role === "manager" || role === "admin";
  const pending = counts.pending ?? 0;
  const ready = (counts.errata ?? 0) + (counts.addendum ?? 0);

  return (
    <AdminShell
      cluster="cases"
      role={role}
      width={1100}
      title="판 대조 검수"
      desc="인쇄된 책과 개정중 원고를 맞춰 뽑은 후보입니다. 건별로 판정하고, 정오표·추록으로 정한 것만 발행합니다."
    >
      <div className="border-border bg-muted/30 text-muted-foreground mb-4 rounded-xl border px-4 py-3 text-xs leading-relaxed">
        쪽 번호는 <strong>인쇄된 책</strong> 기준입니다. 「구판」 칸은 줄 단위로 뽑아
        실제로 바뀐 데보다 앞뒤가 넓게 보입니다.
        <br />
        <strong>표·도해 후보</strong>는 글자만으로 판정하기 어렵습니다 — 대조 도구가 만든
        로컬 <code>changes.html</code> 을 옆에 띄워 구판 쪽 그림을 보면서 정하세요.
        <br />
        발행하면 <strong>바로 추록·정오표 시트에 실려 수험생에게 보입니다</strong>(대기함 없음).
      </div>

      {actionData?.error ? (
        <p className="border-destructive/40 bg-destructive/10 text-destructive mb-3 rounded-lg border px-3 py-2 text-xs">
          {actionData.error}
        </p>
      ) : null}
      {actionData?.ok && actionData.message ? (
        <p className="mb-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
          {actionData.message}
        </p>
      ) : null}

      <Form method="get" className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <select
          name="edition"
          defaultValue={filters.edition}
          className="border-border bg-background h-8 rounded-lg border px-2"
        >
          <option value="">판본 전체</option>
          {editions.map((e) => (
            <option key={e.editionId} value={e.editionId}>
              {e.label}
            </option>
          ))}
        </select>
        <select
          name="decision"
          defaultValue={filters.decision}
          className="border-border bg-background h-8 rounded-lg border px-2"
        >
          <option value="all">판정 전체</option>
          {BOOK_DIFF_DECISIONS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
        <select
          name="confidence"
          defaultValue={filters.confidence}
          className="border-border bg-background h-8 rounded-lg border px-2"
        >
          <option value="">확신 전체</option>
          <option value="확실">확실</option>
          <option value="일부">일부</option>
          <option value="이동">이동</option>
        </select>
        <Input
          name="bucket"
          defaultValue={filters.bucket}
          placeholder="구분 (본문·각주·표·도해)"
          className="h-8 w-52 rounded-lg text-xs"
        />
        <button
          type="submit"
          className="border-border hover:bg-muted h-8 rounded-lg border px-3 font-semibold"
        >
          거르기
        </button>
        <span className="text-muted-foreground ml-auto">
          안 본 것 <strong>{pending}</strong> · 발행 대기 <strong>{ready}</strong> · 뺀 것{" "}
          {(counts.next_edition ?? 0) + (counts.not_a_change ?? 0)}
        </span>
      </Form>

      {items.length === 0 ? (
        <div className="border-border bg-card text-muted-foreground rounded-2xl border p-8 text-center text-sm">
          조건에 맞는 후보가 없습니다.
        </div>
      ) : (
        <Form method="post">
          <input type="hidden" name="intent" value="publish" />
          <ul className="space-y-3">
            {items.map((item) => (
              <CandidateCard key={item.candidateId} item={item} />
            ))}
          </ul>

          {canPublish ? (
            <div className="border-border bg-card sticky bottom-0 mt-4 flex flex-wrap items-center gap-2 rounded-2xl border p-3 text-xs">
              <SendIcon className="size-3.5" />
              <span className="font-semibold">고른 항목 발행</span>
              <select
                name="kind"
                className="border-border bg-background h-8 rounded-lg border px-2"
              >
                <option value="">유형 자동 (정오표=정오 · 추록=추록)</option>
                {ERRATA_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
              <select
                name="severity"
                defaultValue="normal"
                className="border-border bg-background h-8 rounded-lg border px-2"
              >
                {ERRATA_SEVERITIES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <Input
                name="reason"
                placeholder="발행 사유 (선택)"
                className="h-8 w-56 rounded-lg text-xs"
              />
              <button
                type="submit"
                className="bg-primary text-primary-foreground ml-auto h-8 rounded-lg px-4 font-semibold"
              >
                발행
              </button>
            </div>
          ) : (
            <p className="text-muted-foreground mt-4 text-xs">
              발행은 원장·관리자만 할 수 있습니다. 판정까지 해 두면 됩니다.
            </p>
          )}
        </Form>
      )}
    </AdminShell>
  );
}

function CandidateCard({ item }: { item: Route.ComponentProps["loaderData"]["items"][number] }) {
  const fetcher = useFetcher();
  const [note, setNote] = useState(item.decisionNote);
  const decided = (fetcher.formData?.get("decision") as string) ?? item.decision;
  const published = item.publishedRevisionId != null;

  return (
    <li className="border-border bg-card rounded-2xl border p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        {!published ? (
          <input
            type="checkbox"
            name="candidateId"
            value={item.candidateId}
            defaultChecked={decided === "errata" || decided === "addendum"}
            className="size-4"
            aria-label="발행 대상"
          />
        ) : null}
        <Chip tone="blue">{item.pageNo ? `${item.pageNo}쪽` : "쪽 미상"}</Chip>
        <Chip tone="neutral">{item.bucket}</Chip>
        <Chip tone="neutral">{item.changeType}</Chip>
        <Chip tone={CONFIDENCE_TONE[item.confidence as keyof typeof CONFIDENCE_TONE] ?? "neutral"}>
          {item.confidence}
        </Chip>
        {published ? <Chip tone="emerald">발행됨</Chip> : null}
        <span className="text-muted-foreground ml-auto">
          {BOOK_DIFF_DECISION_LABEL[decided as BookDiffDecision] ?? decided}
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="구판 (인쇄본)" text={item.beforeText} />
        <Field label="신판 (개정중)" text={item.afterText} />
      </div>

      {!published ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {BOOK_DIFF_DECISIONS.map((d) => (
            <button
              key={d.value}
              type="button"
              onClick={() =>
                fetcher.submit(
                  {
                    intent: "decide",
                    candidateId: item.candidateId,
                    decision: d.value,
                    note,
                  },
                  { method: "post" },
                )
              }
              className={`h-7 rounded-lg border px-2.5 text-xs font-semibold ${
                decided === d.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-muted"
              }`}
            >
              {d.label}
            </button>
          ))}
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="메모 (선택)"
            className="h-7 w-48 rounded-lg text-xs"
          />
        </div>
      ) : null}
    </li>
  );
}

function Field({ label, text }: { label: string; text: string }) {
  return (
    <div className="bg-muted/40 rounded-xl p-2.5">
      <p className="text-muted-foreground mb-1 text-[11px] font-semibold">{label}</p>
      <p className="text-xs leading-relaxed break-words whitespace-pre-wrap">
        {text || <span className="text-muted-foreground">— 없음</span>}
      </p>
    </div>
  );
}
