// feat-2-035 — 하급심 판결문 적재 현황·수집(staff). 무엇이 적재됐고, 무엇을 아직 못 구했는지 +
// 그 자리에서 바로 구해 넣는다(원장 요청 2026-08-20 — "찾아서 바로 적재할 수 있게").
//
// 도식의 사실관계 근거가 하급심이라, 미확보 목록이 곧 다음 작업 지시서다.
// ★두 종류의 작업이 섞여 있어 상태를 구분해 보여준다 —
//   판결문만 구하면 되는 건(원심 사건번호 확정)과, 원심이 무엇인지부터 찾아야 하는 건.
//
// 수집 경로 3단(전부 이 화면에서):
//   ① 자동   — 원심 표기 파싱 → 법령정보센터. 우리 DB 원문이 비면 대법원 전문을 받아 거기서 찾는다.
//   ② 지정   — 운영자가 원심 사건번호를 직접 넣고 자동 수집
//   ③ 붙여넣기 — API 에 없는 건(수기 확보분)

import { useState } from "react";
import {
  CheckCircle2Icon,
  DownloadIcon,
  FileTextIcon,
  SearchIcon,
} from "lucide-react";
import { Form, Link, data, redirect, useFetcher } from "react-router";
import { z } from "zod";

import { Input } from "~/core/components/ui/input";
import { Textarea } from "~/core/components/ui/textarea";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip } from "~/features/admin/components/admin-ui";
import {
  LOWER_STATUS_LABEL,
  type LowerCourtStatus,
} from "~/features/cases/lib/lower-court";
import {
  collectLowerCourt,
  listLowerCourtTargets,
  saveLowerCourtText,
  type CollectResult,
  type LowerCourtListItem,
} from "~/features/cases/queries-lower-court.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/admin-lower-court-list";

export const meta: Route.MetaFunction = () => [
  { title: "하급심 판결문 적재 | 리담변리사학원" },
];

const STATUS_VALUES = [
  "loaded",
  "not_in_api",
  "summary_only",
  "no_ref",
] as const;

// ★서버리스 함수 시간 제한 안에서 끝내야 한다 — 실측 한 건 1~3초(외부 API 2회)라
//   일괄은 시간 예산으로 끊고 "남은 건수"를 돌려준다(다시 눌러 이어서 처리).
//   예산은 마지막 한 건이 더 도는 것까지 감안해 넉넉히 잡을 것.
const BATCH_BUDGET_MS = 5_000;
const BATCH_MAX = 8;

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/auth/login?next=/admin/cases/lower-court");
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const raw = url.searchParams.get("status");
  const status =
    raw === "manual" || (STATUS_VALUES as readonly string[]).includes(raw ?? "")
      ? (raw as LowerCourtStatus | "manual")
      : "manual"; // 기본 = 수기 대상(이 화면의 목적)
  const q = (url.searchParams.get("q") ?? "").trim();

  const { rows, counts } = await listLowerCourtTargets(client, { status, q });
  return { rows, counts, status, q, role };
}

const collectSchema = z.object({
  caseId: z.string().uuid(),
  lowerCaseNumber: z
    .string()
    .trim()
    .transform((v) => v.replace(/\s+/g, ""))
    .refine((v) => !v || /^\d{2,4}[가-힣]{1,3}\d+$/.test(v), {
      message: "원심 사건번호 형식이 아닙니다 (예: 2022허4635)",
    })
    .optional(),
  lowerCourt: z.string().trim().max(40).optional(),
});

const pasteSchema = z.object({
  caseId: z.string().uuid(),
  sourceRef: z.string().trim().max(120),
  bodyText: z
    .string()
    .trim()
    .min(200, "판결문 전문을 붙여넣으세요 (200자 이상)"),
});

export type LowerActionResult =
  | { kind: "single"; result: CollectResult }
  | { kind: "batch"; results: CollectResult[]; remaining: number }
  | { kind: "error"; message: string };

export async function action({ request }: Route.ActionArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  // ★서버 게이트가 유일한 방어 — RLS(staff 전용)와 겹쳐 두 겹으로 막는다.
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const form = Object.fromEntries(await request.formData());
  const intent = String(form.intent ?? "");

  try {
    if (intent === "collect") {
      const parsed = collectSchema.safeParse(form);
      if (!parsed.success) {
        return {
          kind: "error",
          message: parsed.error.issues[0]?.message ?? "입력을 확인하세요.",
        } satisfies LowerActionResult;
      }
      const { caseId, lowerCaseNumber, lowerCourt } = parsed.data;
      const result = await collectLowerCourt(
        client,
        caseId,
        lowerCaseNumber
          ? { caseNumber: lowerCaseNumber, court: lowerCourt ?? null }
          : null,
      );
      return { kind: "single", result } satisfies LowerActionResult;
    }

    if (intent === "paste") {
      const parsed = pasteSchema.safeParse(form);
      if (!parsed.success) {
        return {
          kind: "error",
          message: parsed.error.issues[0]?.message ?? "입력을 확인하세요.",
        } satisfies LowerActionResult;
      }
      const result = await saveLowerCourtText(client, parsed.data.caseId, {
        bodyText: parsed.data.bodyText,
        sourceRef: parsed.data.sourceRef,
      });
      return { kind: "single", result } satisfies LowerActionResult;
    }

    if (intent === "batch") {
      // 현재 보고 있는 필터 그대로 처리한다(원심 미상만 골라 돌리는 경우가 있다).
      const raw = String(form.status ?? "manual");
      const status = (STATUS_VALUES as readonly string[]).includes(raw)
        ? (raw as LowerCourtStatus)
        : "manual";
      const q = String(form.q ?? "");
      const { rows } = await listLowerCourtTargets(client, { status, q });
      // 이미 확보된 건은 다시 받지 않는다.
      const queue = rows.filter((r) => r.status !== "loaded");
      const started = Date.now();
      const results: CollectResult[] = [];
      for (const row of queue) {
        if (results.length >= BATCH_MAX) break;
        if (results.length && Date.now() - started > BATCH_BUDGET_MS) break;
        results.push(await collectLowerCourt(client, row.caseId));
      }
      return {
        kind: "batch",
        results,
        remaining: queue.length - results.filter((r) => r.ok).length,
      } satisfies LowerActionResult;
    }

    return { kind: "error", message: "알 수 없는 요청" } satisfies LowerActionResult;
  } catch (e) {
    // 외부 API 장애·타임아웃을 화면에 그대로 보여 준다(조용히 실패하면 원인을 못 찾는다).
    return {
      kind: "error",
      message: e instanceof Error ? e.message : "수집 중 오류가 발생했습니다.",
    } satisfies LowerActionResult;
  }
}

export default function AdminLowerCourtList({
  loaderData,
}: Route.ComponentProps) {
  const { rows, counts, status, q, role } = loaderData;
  const manualTotal = counts.not_in_api + counts.summary_only + counts.no_ref;
  const batch = useFetcher<LowerActionResult>();
  const batchData = batch.data?.kind === "batch" ? batch.data : null;
  const batchError = batch.data?.kind === "error" ? batch.data.message : null;

  return (
    <AdminShell
      cluster="cases"
      role={role}
      title="하급심 판결문 적재"
      desc="판례 도식의 사실관계는 하급심 판결문에서 정리합니다. 화면에서 바로 수집하고, API 에 없는 건만 전문을 붙여넣습니다."
    >
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">특허법 2005년 이후</span>
        {(
          [
            ["manual", "수기 대상", manualTotal],
            ["loaded", "적재됨", counts.loaded],
            ["not_in_api", "미수록", counts.not_in_api],
            ["summary_only", "요지만", counts.summary_only],
            ["no_ref", "원심 미상", counts.no_ref],
          ] as [string, string, number][]
        ).map(([val, label, n]) => {
          const sp = new URLSearchParams();
          sp.set("status", val);
          if (q) sp.set("q", q);
          const active = status === val;
          return (
            <Link
              key={val}
              to={`/admin/cases/lower-court?${sp}`}
              preventScrollReset
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 font-semibold transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {label}
              <span className={active ? "" : "text-foreground"}>{n}</span>
            </Link>
          );
        })}
        <span className="text-muted-foreground ml-1">/ 전체 {counts.total}</span>
      </div>

      {/* 안내 — 목록만 보여 주고 방법을 안 적으면 다시 물어보게 된다. */}
      <div className="border-border bg-muted/30 text-muted-foreground mb-4 rounded-xl border px-4 py-3 text-xs leading-relaxed">
        <strong>자동 수집</strong> = 대법원 원문의 원심 표기를 읽어 국가법령정보센터에서
        판결문을 받아 적재합니다. 우리 DB 원문이 비어 있으면 대법원 전문부터 받아 원심을
        찾습니다. 못 찾으면 <strong>원심번호 지정</strong>으로 번호를 직접 넣고,
        법령정보센터에 없는 판결문은 <strong>파일 업로드</strong>(PDF·txt·md, 합계 4MB
        이하) 또는 <strong>전문 붙여넣기</strong>로 넣습니다.
        <br />
        <strong>미수록·요지만</strong> = 원심 사건번호는 확정돼 있어 판결문만 구하면 됩니다.{" "}
        <strong>원심 미상</strong> = 원심이 무엇인지부터 찾아야 합니다.
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Form method="get" className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="status" value={status} />
          <div className="relative">
            <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
            <Input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="사건번호·사건명·원심번호"
              className="h-8 w-60 rounded-lg pl-8 text-xs"
            />
          </div>
          <button
            type="submit"
            className="border-border hover:bg-muted h-8 rounded-lg border px-3 text-xs font-semibold"
          >
            검색
          </button>
        </Form>

        {manualTotal > 0 ? (
          <batch.Form method="post" className="ml-auto">
            <input type="hidden" name="intent" value="batch" />
            <input type="hidden" name="status" value={status} />
            <input type="hidden" name="q" value={q} />
            <button
              type="submit"
              disabled={batch.state !== "idle"}
              className="bg-primary text-primary-foreground inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold disabled:opacity-60"
            >
              <DownloadIcon className="size-3.5" />
              {batch.state !== "idle"
                ? "수집 중…"
                : `미확보 일괄 수집 (최대 ${BATCH_MAX}건)`}
            </button>
          </batch.Form>
        ) : null}
      </div>

      {batchError ? (
        <p className="border-destructive/40 bg-destructive/10 text-destructive mb-3 rounded-lg border px-3 py-2 text-xs">
          {batchError}
        </p>
      ) : null}
      {batchData ? (
        <div className="border-border bg-card mb-3 rounded-xl border p-3 text-xs">
          <p className="font-semibold">
            {batchData.results.filter((r) => r.ok).length}건 적재 ·{" "}
            {batchData.results.filter((r) => !r.ok).length}건 실패 · 남은 미확보{" "}
            {batchData.remaining}건
          </p>
          <ul className="text-muted-foreground mt-1.5 space-y-0.5">
            {batchData.results.map((r) => (
              <li key={r.caseId}>
                <span className={r.ok ? "text-emerald-600" : "text-amber-600"}>
                  {r.ok ? "✓" : "✗"}
                </span>{" "}
                <span className="text-foreground font-medium">{r.caseNumber}</span>{" "}
                {r.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="border-border bg-card text-muted-foreground rounded-2xl border p-8 text-center text-sm">
          {status === "manual"
            ? "수기로 구해야 할 판결문이 없습니다."
            : "조건에 맞는 판례가 없습니다."}
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <LowerRow key={r.caseId} row={r} />
          ))}
        </ul>
      )}
    </AdminShell>
  );
}

function LowerRow({ row }: { row: LowerCourtListItem }) {
  const fetcher = useFetcher<LowerActionResult>();
  const [mode, setMode] = useState<"ref" | "upload" | "paste" | null>(null);
  const busy = fetcher.state !== "idle";
  const result = fetcher.data?.kind === "single" ? fetcher.data.result : null;
  const error = fetcher.data?.kind === "error" ? fetcher.data.message : null;

  return (
    <li className="border-border bg-card rounded-xl border p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusChip status={row.status} />
        <Chip tone="outline">{row.caseNumber}</Chip>
        <Chip tone="outline">{row.decidedAt}</Chip>
        {row.lowerCaseNumber ? (
          <Chip tone="blue">
            <FileTextIcon className="size-3" /> 원심 {row.lowerCourt}{" "}
            {row.lowerCaseNumber}
          </Chip>
        ) : null}
        {row.status === "loaded" ? (
          <Chip tone="outline">{row.charCount.toLocaleString("ko-KR")}자</Chip>
        ) : null}
        <Link
          to={`/subjects/patent/cases/${row.caseId}`}
          className="text-link ml-auto text-xs hover:underline"
        >
          판례 보기
        </Link>
      </div>
      <p className="text-foreground mt-1.5 line-clamp-2 text-sm">
        {row.caseTitle}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="collect" />
          <input type="hidden" name="caseId" value={row.caseId} />
          <button
            type="submit"
            disabled={busy}
            className="border-border hover:bg-muted h-7 rounded-lg border px-2.5 text-xs font-semibold disabled:opacity-60"
          >
            {busy ? "수집 중…" : row.status === "loaded" ? "다시 수집" : "자동 수집"}
          </button>
        </fetcher.Form>
        <button
          type="button"
          onClick={() => setMode(mode === "ref" ? null : "ref")}
          className="border-border hover:bg-muted h-7 rounded-lg border px-2.5 text-xs font-semibold"
        >
          원심번호 지정
        </button>
        <button
          type="button"
          onClick={() => setMode(mode === "upload" ? null : "upload")}
          className="border-border hover:bg-muted h-7 rounded-lg border px-2.5 text-xs font-semibold"
        >
          파일 업로드
        </button>
        <button
          type="button"
          onClick={() => setMode(mode === "paste" ? null : "paste")}
          className="border-border hover:bg-muted h-7 rounded-lg border px-2.5 text-xs font-semibold"
        >
          전문 붙여넣기
        </button>
      </div>

      {mode === "upload" ? (
        // ★파일 고르면 바로 전송한다(제출 버튼 없음) — 출처 표기는 파일명에서 뽑는다.
        <fetcher.Form
          method="post"
          action="/api/admin/lower-court-upload"
          encType="multipart/form-data"
          className="mt-2"
        >
          <input type="hidden" name="caseId" value={row.caseId} />
          <input
            type="file"
            name="files"
            multiple
            accept=".pdf,.txt,.md"
            disabled={busy}
            onChange={(e) => {
              const files = [...(e.currentTarget.files ?? [])];
              if (!files.length || !e.currentTarget.form) return;
              // ★action 을 옵션에 명시해야 한다 — 폼의 action 속성만 두고 submit(form, {method})
              //   로 보내면 현재 라우트로 가서 "알 수 없는 요청"이 된다(원장 오류신고 2026-08-20).
              fetcher.submit(e.currentTarget.form, {
                method: "post",
                action: "/api/admin/lower-court-upload",
                encType: "multipart/form-data",
              });
            }}
            className="file:bg-muted block w-full text-xs file:mr-2 file:rounded file:border-0 file:px-2 file:py-1 file:text-xs"
          />
          <p className="text-muted-foreground mt-1 text-[11px] leading-relaxed">
            <code className="bg-muted rounded px-1 py-0.5">
              {"<대법원 사건번호> <법원> <하급심 사건번호>.pdf"}
            </code>{" "}
            형식으로 이름을 지으면 앞 번호를 떼고 출처 표기가 됩니다. 심급이 여러 개면
            한 번에 여러 개를 고르세요. <strong>합계 4MB 이하</strong> · 텍스트 레이어
            없는 스캔 PDF 는 추출되지 않습니다(그때는 붙여넣기).
          </p>
          {busy ? (
            <p className="text-muted-foreground mt-1 text-[11px]">
              업로드·텍스트 추출 중…
            </p>
          ) : null}
        </fetcher.Form>
      ) : null}

      {mode === "ref" ? (
        <fetcher.Form
          method="post"
          className="mt-2 flex flex-wrap items-end gap-2"
          onSubmit={() => setMode(null)}
        >
          <input type="hidden" name="intent" value="collect" />
          <input type="hidden" name="caseId" value={row.caseId} />
          <label className="text-muted-foreground text-[11px]">
            원심 사건번호
            <Input
              name="lowerCaseNumber"
              defaultValue={row.lowerCaseNumber ?? ""}
              placeholder="2022허4635"
              required
              className="mt-0.5 h-8 w-40 rounded-lg text-xs"
            />
          </label>
          <label className="text-muted-foreground text-[11px]">
            법원(선택 — 동일 번호 구분용)
            <Input
              name="lowerCourt"
              defaultValue={row.lowerCourt ?? ""}
              placeholder="특허법원"
              className="mt-0.5 h-8 w-40 rounded-lg text-xs"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="bg-primary text-primary-foreground h-8 rounded-lg px-3 text-xs font-semibold disabled:opacity-60"
          >
            이 번호로 수집
          </button>
        </fetcher.Form>
      ) : null}

      {mode === "paste" ? (
        <fetcher.Form
          method="post"
          className="mt-2 space-y-2"
          onSubmit={() => setMode(null)}
        >
          <input type="hidden" name="intent" value="paste" />
          <input type="hidden" name="caseId" value={row.caseId} />
          <Input
            name="sourceRef"
            defaultValue={
              row.lowerCourt && row.lowerCaseNumber
                ? `${row.lowerCourt} ${row.lowerCaseNumber}`
                : ""
            }
            placeholder="출처 표기 — 예: 특허법원 2022허4635"
            className="h-8 rounded-lg text-xs"
          />
          <Textarea
            name="bodyText"
            rows={8}
            required
            placeholder="판결문 전문을 붙여넣으세요. 사실관계 절(기초사실·이 사건 심결의 경위 등)이 포함돼야 도식의 사실관계로 쓸 수 있습니다."
            className="rounded-lg text-xs"
          />
          <button
            type="submit"
            disabled={busy}
            className="bg-primary text-primary-foreground h-8 rounded-lg px-3 text-xs font-semibold disabled:opacity-60"
          >
            전문 적재
          </button>
        </fetcher.Form>
      ) : null}

      {error ? (
        <p className="text-destructive mt-2 text-xs">{error}</p>
      ) : result ? (
        <p
          className={cn(
            "mt-2 text-xs",
            result.ok ? "text-emerald-600" : "text-amber-600",
          )}
        >
          {result.ok ? "✓" : "✗"} {result.message}
        </p>
      ) : null}
    </li>
  );
}

function StatusChip({ status }: { status: LowerCourtStatus }) {
  if (status === "loaded") {
    return (
      <Chip tone="emerald">
        <CheckCircle2Icon className="size-3" /> 적재됨
      </Chip>
    );
  }
  if (status === "no_ref") return <Chip tone="coral">원심 미상</Chip>;
  return <Chip tone="amber">{LOWER_STATUS_LABEL[status]}</Chip>;
}
