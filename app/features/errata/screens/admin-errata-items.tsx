// errata — 발행분 수정(staff). 발행 후에 문구가 틀렸거나 중복 발행된 것을 이 화면에서 고친다.
//
// 왜 필요한가: 발행 모달의 프리필은 스냅샷 diff 라 그대로 두면 영어 enum 값·중복 문장이
// 인쇄물에 그대로 실린다(원장 지적 2026-08-20). 지금까지는 고칠 화면이 없어 스크립트로만
// 손댈 수 있었다.
//
// ★고칠 수 있는 것은 **서술 필드뿐**이다 — 제목·유형·경중·변경 전/후 문구·사유.
//   변경 실체(before/after 스냅샷·대상·changed_fields)는 DB 트리거(revision_append_only)가
//   막는다. 개정 원장은 "무엇이 바뀌었는지"의 증거라 사후에 손대면 안 된다.
// ★회수(철회)는 원장·관리자만 — fn_withdraw_errata 가 is_publisher 로 한 번 더 막는다.

import { useState } from "react";
import { FileTextIcon, SearchIcon, Undo2Icon } from "lucide-react";
import { Form, data, redirect, useFetcher } from "react-router";
import { z } from "zod";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { Textarea } from "~/core/components/ui/textarea";
import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip } from "~/features/admin/components/admin-ui";
import {
  ERRATA_KINDS,
  ERRATA_SEVERITIES,
} from "~/features/errata/labels";
import { regenerateForRevisions } from "~/features/errata/pdf/regenerate.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/admin-errata-items";

export const meta: Route.MetaFunction = () => [
  { title: "발행분 수정 | 리담변리사학원" },
];

const KIND_LABEL: Record<string, string> = Object.fromEntries(
  ERRATA_KINDS.map((k) => [k.value, k.label]),
);
const SEVERITY_LABEL: Record<string, string> = Object.fromEntries(
  ERRATA_SEVERITIES.map((s) => [s.value, s.label]),
);
const LIST_LIMIT = 120;

function payloadText(payload: unknown, key: string): string {
  if (payload == null || typeof payload !== "object") return "";
  const v = (payload as Record<string, unknown>)[key];
  return typeof v === "string" ? v : "";
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/auth/login?next=/admin/errata-items");
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
  let query = adminClient
    .from("content_revisions")
    .select(
      "revision_id, content_type, content_id, notice_status, errata_kind, errata_severity, errata_title, errata_payload, errata_reason, published_at, withdrawn_at, withdraws_revision_id",
    )
    .in("notice_status", ["published", "withdrawn"])
    .order("published_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (q) query = query.ilike("errata_title", `%${q}%`);
  const { data: rows, error } = await query;
  if (error) throw error;

  // 교재 위치 — 어느 시트에 실리는지 보여야 수정 후 무엇이 갱신되는지 안다.
  const contentIds = [...new Set((rows ?? []).map((r) => r.content_id))];
  const { data: maps } = await adminClient
    .from("publication_content_map")
    .select(
      "content_id, content_type, page_no, sort_key, toc_path, publication_editions(edition_label, publications(title))",
    )
    .in("content_id", contentIds.length ? contentIds : ["00000000-0000-0000-0000-000000000000"]);
  const locByContent = new Map<string, string>();
  for (const m of maps ?? []) {
    const e = m.publication_editions;
    const parts = [
      e?.publications?.title ?? "",
      e?.edition_label ?? "",
      m.toc_path ?? "",
      m.sort_key != null ? `${m.sort_key}번` : "",
    ].filter(Boolean);
    locByContent.set(`${m.content_type}:${m.content_id}`, parts.join(" · "));
  }

  return {
    role,
    q,
    items: (rows ?? []).map((r) => ({
      revisionId: r.revision_id,
      contentType: r.content_type,
      contentId: r.content_id,
      status: r.notice_status,
      kind: r.errata_kind ?? "typo",
      severity: r.errata_severity ?? "normal",
      title: r.errata_title ?? "",
      beforeText: payloadText(r.errata_payload, "before_text"),
      afterText: payloadText(r.errata_payload, "after_text"),
      reason: r.errata_reason ?? "",
      publishedAt: r.published_at,
      isWithdrawalNotice: r.withdraws_revision_id != null,
      location: locByContent.get(`${r.content_type}:${r.content_id}`) ?? "",
    })),
  };
}

const saveSchema = z.object({
  revisionId: z.string().uuid(),
  title: z.string().trim().min(1, "제목을 입력하세요").max(300),
  kind: z.enum(ERRATA_KINDS.map((k) => k.value) as [string, ...string[]]),
  severity: z.enum(ERRATA_SEVERITIES.map((s) => s.value) as [string, ...string[]]),
  beforeText: z.string().max(8000).default(""),
  afterText: z.string().max(8000).default(""),
  reason: z.string().max(2000).default(""),
});

const withdrawSchema = z.object({
  revisionId: z.string().uuid(),
  reason: z.string().trim().min(1, "회수 사유는 필수입니다").max(2000),
  notify: z.string().optional(),
});

export async function action({ request }: Route.ActionArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const form = Object.fromEntries(await request.formData());
  const intent = String(form.intent ?? "");

  if (intent === "save") {
    const parsed = saveSchema.safeParse(form);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "입력 확인" };
    }
    const p = parsed.data;
    // 기존 payload 를 유지한 채 문구만 갈아끼운다(regrade_requested 등 보존).
    const { data: cur, error: readErr } = await client
      .from("content_revisions")
      .select("errata_payload")
      .eq("revision_id", p.revisionId)
      .maybeSingle();
    if (readErr) return { ok: false, error: readErr.message };
    const payload = {
      ...((cur?.errata_payload as Record<string, unknown>) ?? {}),
      before_text: p.beforeText,
      after_text: p.afterText,
    };
    // ★요청 클라이언트로 쓴다 — RLS(revision_admin_update = is_staff)가 권한의 근거.
    const { error } = await client
      .from("content_revisions")
      .update({
        errata_title: p.title,
        errata_kind: p.kind,
        errata_severity: p.severity,
        errata_reason: p.reason,
        errata_payload: payload,
      })
      .eq("revision_id", p.revisionId);
    if (error) return { ok: false, error: error.message };
    // 시트 PDF 는 파생물 — 즉시 다시 그려야 수험생이 받는 파일이 화면과 일치한다.
    const rendered = await regenerateForRevisions([p.revisionId]);
    const failed = rendered.filter((r) => !r.ok);
    return {
      ok: true,
      message:
        failed.length > 0
          ? `저장했지만 시트 재렌더 실패: ${failed[0].error ?? "?"}`
          : `저장하고 시트 ${rendered.length}건을 다시 그렸습니다.`,
    };
  }

  if (intent === "withdraw") {
    if (role !== "manager" && role !== "admin") {
      return { ok: false, error: "회수는 원장·관리자만 할 수 있습니다." };
    }
    const parsed = withdrawSchema.safeParse(form);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "입력 확인" };
    }
    const { error } = await client.rpc("fn_withdraw_errata", {
      p_revision_id: parsed.data.revisionId,
      p_reason: parsed.data.reason,
      // 고지 없이 회수 = 중복·오발행 정리. 실제 정정을 되돌릴 때는 고지를 남긴다.
      p_notify: parsed.data.notify === "on",
    });
    if (error) return { ok: false, error: error.message };
    const rendered = await regenerateForRevisions([parsed.data.revisionId]);
    return {
      ok: true,
      message: `회수했습니다. 시트 ${rendered.length}건 재렌더.`,
    };
  }

  return { ok: false, error: "알 수 없는 요청" };
}

export default function AdminErrataItems({ loaderData }: Route.ComponentProps) {
  const { role, q, items } = loaderData;
  const canWithdraw = role === "manager" || role === "admin";

  return (
    <AdminShell
      cluster="cases"
      role={role}
      width={980}
      title="발행분 수정"
      desc="발행된 추록·정오표의 문구를 고칩니다. 저장하면 교재 시트 PDF 를 바로 다시 그립니다."
    >
      <div className="border-border bg-muted/30 text-muted-foreground mb-4 rounded-xl border px-4 py-3 text-xs leading-relaxed">
        고칠 수 있는 것은 <strong>제목·유형·경중·변경 전/후 문구·사유</strong>입니다. 무엇이
        바뀌었는지의 기록(원본 스냅샷·대상)은 고칠 수 없습니다 — 그건 정정의 증거라
        사후 수정이 막혀 있습니다. 잘못 발행한 항목은{" "}
        <strong>회수</strong>(원장·관리자)로 내립니다.
      </div>

      <Form method="get" className="mb-3 flex items-center gap-2">
        <div className="relative">
          <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
          <Input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="제목 검색 (예: P-5816)"
            className="h-8 w-64 rounded-lg pl-8 text-xs"
          />
        </div>
        <button
          type="submit"
          className="border-border hover:bg-muted h-8 rounded-lg border px-3 text-xs font-semibold"
        >
          검색
        </button>
      </Form>

      {items.length === 0 ? (
        <div className="border-border bg-card text-muted-foreground rounded-2xl border p-8 text-center text-sm">
          발행된 항목이 없습니다.
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <ItemCard key={item.revisionId} item={item} canWithdraw={canWithdraw} />
          ))}
        </ul>
      )}
    </AdminShell>
  );
}

type Item = Awaited<ReturnType<typeof loader>>["items"][number];

function ItemCard({ item, canWithdraw }: { item: Item; canWithdraw: boolean }) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string; message?: string }>();
  const [withdrawing, setWithdrawing] = useState(false);
  const busy = fetcher.state !== "idle";
  const withdrawn = item.status === "withdrawn";

  return (
    <li className="border-border bg-card rounded-xl border p-4 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
        <Chip tone={withdrawn ? "coral" : "emerald"}>
          {withdrawn ? "회수됨" : "발행됨"}
        </Chip>
        <Chip tone="outline">{KIND_LABEL[item.kind] ?? item.kind}</Chip>
        <Chip tone={item.severity === "critical" ? "amber" : "outline"}>
          {SEVERITY_LABEL[item.severity] ?? item.severity}
        </Chip>
        {item.isWithdrawalNotice ? <Chip tone="outline">철회 고지</Chip> : null}
        {item.location ? (
          <span className="text-muted-foreground inline-flex items-center gap-1">
            <FileTextIcon className="size-3" /> {item.location}
          </span>
        ) : (
          <span className="text-muted-foreground">교재 매핑 없음</span>
        )}
        <span className="text-muted-foreground ml-auto">
          {item.publishedAt?.slice(0, 10)}
        </span>
      </div>

      <fetcher.Form method="post" className="space-y-2">
        <input type="hidden" name="intent" value="save" />
        <input type="hidden" name="revisionId" value={item.revisionId} />
        <Input
          name="title"
          defaultValue={item.title}
          placeholder="정오표 제목"
          className="h-8 rounded-lg text-xs"
        />
        <div className="flex flex-wrap gap-2">
          <label className="text-muted-foreground text-[11px]">
            유형
            <select
              name="kind"
              defaultValue={item.kind}
              className="border-border bg-background ml-1 h-8 rounded-lg border px-2 text-xs"
            >
              {ERRATA_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-muted-foreground text-[11px]">
            경중
            <select
              name="severity"
              defaultValue={item.severity}
              className="border-border bg-background ml-1 h-8 rounded-lg border px-2 text-xs"
            >
              {ERRATA_SEVERITIES.map((sv) => (
                <option key={sv.value} value={sv.value}>
                  {sv.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-muted-foreground text-[11px]">
            변경 전
            <Textarea
              name="beforeText"
              defaultValue={item.beforeText}
              rows={4}
              className="mt-0.5 rounded-lg text-xs"
            />
          </label>
          <label className="text-muted-foreground text-[11px]">
            변경 후
            <Textarea
              name="afterText"
              defaultValue={item.afterText}
              rows={4}
              className="mt-0.5 rounded-lg text-xs"
            />
          </label>
        </div>
        <Textarea
          name="reason"
          defaultValue={item.reason}
          rows={2}
          placeholder="사유(선택) — 정오표에 함께 실립니다."
          className="rounded-lg text-xs"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={busy} className="rounded-full">
            {busy ? "저장 중…" : "저장 + 시트 재렌더"}
          </Button>
          {canWithdraw && !withdrawn ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-full"
              onClick={() => setWithdrawing((v) => !v)}
            >
              <Undo2Icon className="size-3.5" /> 회수
            </Button>
          ) : null}
          {fetcher.data?.message ? (
            <span className="text-xs text-emerald-600">{fetcher.data.message}</span>
          ) : null}
          {fetcher.data?.error ? (
            <span className="text-destructive text-xs">{fetcher.data.error}</span>
          ) : null}
        </div>
      </fetcher.Form>

      {withdrawing ? (
        <fetcher.Form
          method="post"
          className="border-border mt-2 space-y-2 rounded-lg border border-dashed p-3"
        >
          <input type="hidden" name="intent" value="withdraw" />
          <input type="hidden" name="revisionId" value={item.revisionId} />
          <Input
            name="reason"
            required
            placeholder="회수 사유 (필수) — 예: 중복 발행 정리"
            className="h-8 rounded-lg text-xs"
          />
          <label className="text-muted-foreground flex items-center gap-2 text-[11px]">
            <input type="checkbox" name="notify" />
            정오표에 <strong>철회 고지</strong>를 남긴다 — 이미 인쇄해 간 수험생이 적용을
            되돌려야 할 때만 켭니다. 중복·오발행 정리는 끄세요.
          </label>
          <Button type="submit" size="sm" variant="destructive" className="rounded-full">
            회수 실행
          </Button>
        </fetcher.Form>
      ) : null}
    </li>
  );
}
