// feat-8-003 운영자 합격 결과 일람·인증 화면.
// admin 만 verify/reject 가능, instructor 는 read-only.
// P6 REVIEW QUEUE 패턴 — AdminShell cluster="analytics" 래핑.

import {
  CheckCircle2Icon,
  ExternalLinkIcon,
  InboxIcon,
  ShieldCheckIcon,
  TrophyIcon,
  XCircleIcon,
} from "lucide-react";
import { useState } from "react";
import { Form, Link, data, redirect, useFetcher } from "react-router";
import { z } from "zod";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import {
  AdminSelect,
  Chip,
  Field,
  FilterBar,
  FilterGroup,
  IndexTable,
  StatusChip,
  TD,
  TR,
} from "~/features/admin/components/admin-ui";
import { getStaffRole } from "~/features/laws/queries.server";
import { roleAtLeast } from "~/core/lib/roles";
import {
  createCertificateSignedUrl,
  getAdminExamResultPoolSize,
  listAdminExamResults,
  verifyExamResult,
  type AdminExamResultRow,
} from "~/features/exam-results/queries.server";
import {
  EXAM_RESULT_STATUS_LABEL,
  EXAM_RESULT_STATUSES,
  EXAM_ROUND_LABEL,
  EXAM_VERIFICATION_STATUS_LABEL,
  type ExamResultStatus,
  type ExamRound,
  type ExamVerificationStatus,
} from "~/features/exam-results/labels";

import type { Route } from "./+types/admin-exam-results";

export const meta: Route.MetaFunction = () => [
  { title: "합격 결과 운영 | 리담변리사학원" },
];

const verifySchema = z.object({
  intent: z.literal("verify"),
  resultId: z.string().uuid(),
  decision: z.enum(["verified", "rejected"]),
  rejectionReason: z.string().max(500).optional(),
});

const certSchema = z.object({
  intent: z.literal("certificate-url"),
  path: z.string().min(1).max(500),
});

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const yearStr = url.searchParams.get("year");
  const filter = {
    year: yearStr ? Number(yearStr) : null,
    round: (url.searchParams.get("round") as ExamRound | null) || null,
    status: (url.searchParams.get("status") as ExamResultStatus | null) || null,
    verificationStatus:
      (url.searchParams.get("v") as ExamVerificationStatus | null) || null,
    search: url.searchParams.get("q"),
  };
  const [rows, pool] = await Promise.all([
    listAdminExamResults(filter),
    getAdminExamResultPoolSize(),
  ]);
  return { rows, pool, role, filter };
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });
  const role = await getStaffRole(client, user.id);

  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "");

  if (intent === "verify") {
    if (!roleAtLeast(role, "manager"))
      return data({ error: "관리자 이상만 인증 처리할 수 있습니다" }, { status: 403 });
    const parsed = verifySchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success)
      return data({ error: parsed.error.issues[0]?.message ?? "입력 오류" }, { status: 400 });
    const res = await verifyExamResult(
      parsed.data.resultId,
      user.id,
      parsed.data.decision,
      parsed.data.rejectionReason ?? null,
    );
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true });
  }

  if (intent === "certificate-url") {
    const parsed = certSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return data({ error: "입력 오류" }, { status: 400 });
    const res = await createCertificateSignedUrl(parsed.data.path);
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true, url: res.url });
  }

  return data({ error: `알 수 없는 intent: ${intent}` }, { status: 400 });
}

/* ── 의미색 매핑 (디자인 토큰 기반) ──────────────────────────────────────── */

function statusChipTone(
  status: ExamResultStatus,
): "emerald" | "amber" | "coral" | "neutral" {
  if (status === "passed") return "emerald";
  if (status === "failed") return "coral";
  if (status === "pending") return "amber";
  return "neutral";
}

function verifyChipTone(
  v: ExamVerificationStatus,
): "emerald" | "amber" | "coral" | "blue" | "neutral" {
  if (v === "verified") return "emerald";
  if (v === "document_submitted") return "blue";
  if (v === "rejected") return "coral";
  return "neutral";
}

/* ── 풀 사이즈 KPI 카드 ───────────────────────────────────────────────────── */

function PoolCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "amber" | "coral" | "blue" | "violet" | "neutral";
}) {
  const toneMap: Record<typeof tone, string> = {
    emerald: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    amber: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    coral: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    blue: "bg-primary/10 text-link",
    violet: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
    neutral: "bg-muted text-foreground/80",
  };
  return (
    <div
      className={cn(
        "rounded-xl border border-transparent px-4 py-3 shadow-sm",
        toneMap[tone],
      )}
    >
      <p className="font-mono text-[10px] font-semibold tracking-[0.08em] uppercase opacity-80">
        {label}
      </p>
      <p className="mt-1.5 text-2xl font-extrabold tabular-nums">
        {value.toLocaleString("ko-KR")}
      </p>
    </div>
  );
}

/* ── 메인 컴포넌트 ────────────────────────────────────────────────────────── */

export default function AdminExamResults({ loaderData }: Route.ComponentProps) {
  const { rows, pool, role, filter } = loaderData;
  const hasFilter =
    !!filter.year ||
    !!filter.round ||
    !!filter.status ||
    !!filter.verificationStatus ||
    !!filter.search;

  const pendingCount = rows.filter(
    (r) =>
      r.verificationStatus === "document_submitted" ||
      r.verificationStatus === "self_reported",
  ).length;

  return (
    <AdminShell
      cluster="analytics"
      role={role}
      title="합격 결과 운영"
      desc={
        roleAtLeast(role, "manager")
          ? "학생이 입력한 시험 결과를 검토하고 합격증을 인증합니다."
          : "본인 반 학생의 결과를 조회할 수 있습니다 (인증 처리는 관리자 이상)."
      }
      headerRight={
        pendingCount > 0 ? (
          <Chip tone="amber">
            <TrophyIcon className="size-3" /> 검증 대기 {pendingCount}
          </Chip>
        ) : (
          <Chip tone="emerald">
            <ShieldCheckIcon className="size-3" /> 전체 인증 완료
          </Chip>
        )
      }
    >
      {/* KPI 타일 */}
      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <PoolCard label="합격 (인증)" value={pool.passedVerified} tone="emerald" />
        <PoolCard
          label="합격 (자가)"
          value={pool.passedTotal - pool.passedVerified}
          tone="amber"
        />
        <PoolCard label="불합격" value={pool.failedTotal} tone="coral" />
        <PoolCard label="인증 대기" value={pool.pending} tone="blue" />
        <PoolCard label="분석 동의" value={pool.consented} tone="violet" />
      </div>

      {/* 필터 바 */}
      <Form method="get">
        <FilterBar
          hasActive={hasFilter}
          onReset={() => {
            window.location.href = "/admin/exam-results";
          }}
        >
          <FilterGroup label="연도">
            <input
              type="number"
              name="year"
              defaultValue={filter.year ?? ""}
              placeholder="2026"
              aria-label="연도"
              className="border-input bg-background focus:border-primary h-9 w-24 rounded-md border px-3 text-[13px] tabular-nums outline-none"
            />
          </FilterGroup>
          <FilterGroup label="차수">
            <AdminSelect name="round" defaultValue={filter.round ?? ""}>
              <option value="">전체</option>
              <option value="first">1차</option>
              <option value="second">2차</option>
            </AdminSelect>
          </FilterGroup>
          <FilterGroup label="상태">
            <AdminSelect name="status" defaultValue={filter.status ?? ""}>
              <option value="">전체</option>
              {EXAM_RESULT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {EXAM_RESULT_STATUS_LABEL[s]}
                </option>
              ))}
            </AdminSelect>
          </FilterGroup>
          <FilterGroup label="인증">
            <AdminSelect name="v" defaultValue={filter.verificationStatus ?? ""}>
              <option value="">전체</option>
              <option value="self_reported">자가 신고</option>
              <option value="document_submitted">증빙 제출</option>
              <option value="verified">인증됨</option>
              <option value="rejected">반려</option>
            </AdminSelect>
          </FilterGroup>
          <FilterGroup label="학생">
            <div className="relative min-w-[160px]">
              <input
                type="search"
                name="q"
                defaultValue={filter.search ?? ""}
                placeholder="이름 / 이메일"
                aria-label="학생 검색"
                className="border-input bg-background focus:border-primary h-9 w-full rounded-md border px-3 text-[13px] outline-none"
              />
            </div>
          </FilterGroup>
          <Button type="submit" size="sm" className="rounded-full">
            필터 적용
          </Button>
        </FilterBar>
      </Form>

      {/* 결과 표 */}
      {rows.length === 0 ? (
        <div className="border-border bg-card flex flex-col items-center gap-2 rounded-xl border p-14 text-center shadow-sm">
          <InboxIcon className="text-muted-foreground/60 size-8" />
          <p className="text-sm font-semibold">
            {hasFilter ? "조건에 맞는 결과가 없습니다" : "등록된 결과가 없습니다"}
          </p>
          <p className="text-muted-foreground text-xs">
            {hasFilter
              ? "필터를 초기화하거나 조건을 바꿔보세요."
              : "학생이 시험 결과를 입력하면 이곳에 표시됩니다."}
          </p>
          {hasFilter ? (
            <Link to="/admin/exam-results" className="text-link text-xs underline">
              필터 초기화
            </Link>
          ) : null}
        </div>
      ) : (
        <IndexTable
          minWidth={860}
          headers={[
            { label: "학생", width: "140px" },
            { label: "연도", align: "center", width: "60px" },
            { label: "차수", align: "center", width: "60px" },
            { label: "상태", width: "80px" },
            { label: "자가점수", align: "right", width: "80px" },
            { label: "증빙", width: "100px" },
            { label: "인증 상태", width: "120px" },
            { label: "처리", width: "220px" },
          ]}
          footer={
            <div className="border-border/60 text-muted-foreground border-t px-4 py-2.5 text-[11px]">
              총 {rows.length}건
            </div>
          }
        >
          {rows.map((r) => (
            <ResultRow key={r.resultId} row={r} canVerify={roleAtLeast(role, "manager")} />
          ))}
        </IndexTable>
      )}
    </AdminShell>
  );
}

/* ── ResultRow ────────────────────────────────────────────────────────────── */

function ResultRow({
  row,
  canVerify,
}: {
  row: AdminExamResultRow;
  canVerify: boolean;
}) {
  const fetcher = useFetcher<{ ok?: boolean; url?: string; error?: string }>();
  const verifyFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const [showReject, setShowReject] = useState(false);
  const certUrl = fetcher.data?.url;

  function openCertificate() {
    if (!row.certificatePath) return;
    const fd = new FormData();
    fd.append("intent", "certificate-url");
    fd.append("path", row.certificatePath);
    fetcher.submit(fd, { method: "post" });
  }

  return (
    <TR testid={`exam-result-row-${row.resultId}`}>
      <TD>
        <p className="text-[13px] font-semibold">{row.userName}</p>
        {row.userEmail ? (
          <p className="text-muted-foreground text-[11px]">{row.userEmail}</p>
        ) : null}
      </TD>
      <TD align="center" mono>
        {row.examYear}
      </TD>
      <TD align="center">{EXAM_ROUND_LABEL[row.examRound]}</TD>
      <TD>
        <Chip tone={statusChipTone(row.status)}>
          {EXAM_RESULT_STATUS_LABEL[row.status]}
        </Chip>
      </TD>
      <TD align="right" mono soft>
        {row.selfReportedTotalScore ?? "—"}
      </TD>
      <TD>
        {row.certificatePath ? (
          <div className="space-y-0.5">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={openCertificate}
              disabled={fetcher.state !== "idle"}
              className="text-link h-7 px-2 text-[11px]"
            >
              <ExternalLinkIcon className="mr-1 size-3" />
              증빙 열기
            </Button>
            {certUrl ? (
              <a
                href={certUrl}
                target="_blank"
                rel="noreferrer"
                className="text-link block text-[11px] underline"
              >
                서명 URL (5분)
              </a>
            ) : null}
          </div>
        ) : (
          <span className="text-muted-foreground text-[11px]">없음</span>
        )}
      </TD>
      <TD>
        <div className="space-y-0.5">
          <Chip tone={verifyChipTone(row.verificationStatus)}>
            {EXAM_VERIFICATION_STATUS_LABEL[row.verificationStatus]}
          </Chip>
          {row.rejectionReason ? (
            <p className="text-[11px] text-rose-600">{row.rejectionReason}</p>
          ) : null}
        </div>
      </TD>
      <TD>
        {canVerify && row.verificationStatus !== "verified" ? (
          <div className="flex flex-wrap items-center gap-1">
            {/* 인증 버튼 */}
            <verifyFetcher.Form method="post" className="inline-flex">
              <input type="hidden" name="intent" value="verify" />
              <input type="hidden" name="resultId" value={row.resultId} />
              <input type="hidden" name="decision" value="verified" />
              <Button
                type="submit"
                size="sm"
                variant="ghost"
                disabled={verifyFetcher.state !== "idle"}
                className="h-7 px-2 text-[11px] text-emerald-700 hover:text-emerald-800"
              >
                <CheckCircle2Icon className="mr-1 size-3" />
                인증
              </Button>
            </verifyFetcher.Form>
            {/* 반려 토글 */}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setShowReject((s) => !s)}
              className="h-7 px-2 text-[11px] text-rose-600 hover:text-rose-700"
            >
              <XCircleIcon className="mr-1 size-3" />
              반려
            </Button>
            {showReject ? (
              <verifyFetcher.Form
                method="post"
                className="mt-1 flex w-full items-center gap-1"
              >
                <input type="hidden" name="intent" value="verify" />
                <input type="hidden" name="resultId" value={row.resultId} />
                <input type="hidden" name="decision" value="rejected" />
                <Field htmlFor={`reject-reason-${row.resultId}`} className="flex-1">
                  <Input
                    id={`reject-reason-${row.resultId}`}
                    type="text"
                    name="rejectionReason"
                    placeholder="반려 사유"
                    className="h-7 text-xs"
                  />
                </Field>
                <Button
                  type="submit"
                  size="sm"
                  className="h-7 rounded-full bg-rose-600 px-2 text-[11px] text-white hover:bg-rose-700"
                  disabled={verifyFetcher.state !== "idle"}
                >
                  확정
                </Button>
              </verifyFetcher.Form>
            ) : null}
            {verifyFetcher.data?.error ? (
              <p className="mt-1 w-full text-[11px] text-rose-600">
                {verifyFetcher.data.error}
              </p>
            ) : null}
          </div>
        ) : row.verificationStatus === "verified" ? (
          <Chip tone="emerald">
            <ShieldCheckIcon className="size-3" /> 인증 완료
          </Chip>
        ) : (
          <StatusChip status="pending" label="권한 없음" />
        )}
      </TD>
    </TR>
  );
}
