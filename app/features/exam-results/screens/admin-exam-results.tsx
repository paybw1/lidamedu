// feat-8-003 운영자 합격 결과 일람·인증 화면.
// admin 만 verify/reject 가능, instructor 는 read-only.

import {
  CheckCircle2Icon,
  ExternalLinkIcon,
  ShieldAlertIcon,
  TrophyIcon,
  XCircleIcon,
} from "lucide-react";
import { useState } from "react";
import { Form, Link, data, redirect, useFetcher } from "react-router";
import { z } from "zod";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/core/components/ui/table";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";
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
  { title: "합격 결과 운영 | Lidam Edu" },
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
    if (role !== "admin")
      return data({ error: "관리자만 인증 처리할 수 있습니다" }, { status: 403 });
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

const STATUS_TONE: Record<ExamResultStatus, string> = {
  passed: "text-emerald-700 bg-emerald-50",
  failed: "text-rose-700 bg-rose-50",
  pending: "text-amber-700 bg-amber-50",
  absent: "text-muted-foreground bg-muted/40",
};
const VERIFY_TONE: Record<ExamVerificationStatus, string> = {
  verified: "text-emerald-700 bg-emerald-50",
  document_submitted: "text-sky-700 bg-sky-50",
  rejected: "text-rose-700 bg-rose-50",
  self_reported: "text-muted-foreground bg-muted/40",
};

export default function AdminExamResults({ loaderData }: Route.ComponentProps) {
  const { rows, pool, role, filter } = loaderData;

  return (
    <div className="mx-auto w-full max-w-screen-xl px-5 py-6 md:px-10 md:py-8">
      <header className="mb-6 space-y-1">
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
          <TrophyIcon className="size-3.5" /> 운영자 · 합격 결과
        </p>
        <h1 className="text-2xl font-bold tracking-tight">시험 결과 운영</h1>
        <p className="text-muted-foreground text-sm">
          {role === "admin"
            ? "학생이 입력한 시험 결과를 검토하고 합격증을 인증합니다."
            : "본인 cohort 학생의 결과를 조회할 수 있습니다 (인증 처리는 admin)."}
        </p>
      </header>

      {/* 풀 사이즈 카드 */}
      <div className="mb-5 grid grid-cols-2 gap-2 md:grid-cols-5">
        <PoolStat label="합격 (인증)" value={pool.passedVerified} tone="emerald" />
        <PoolStat
          label="합격 (자가)"
          value={pool.passedTotal - pool.passedVerified}
          tone="amber"
        />
        <PoolStat label="불합격" value={pool.failedTotal} tone="rose" />
        <PoolStat label="인증 대기" value={pool.pending} tone="sky" />
        <PoolStat label="분석 동의" value={pool.consented} tone="violet" />
      </div>

      {/* 필터 */}
      <Card className="mb-4">
        <CardContent className="px-4 py-3">
          <Form method="get" className="grid grid-cols-2 gap-2 md:grid-cols-6">
            <div>
              <Label className="text-[11px]">연도</Label>
              <Input
                type="number"
                name="year"
                defaultValue={filter.year ?? ""}
                placeholder="2026"
                className="h-8 text-xs"
              />
            </div>
            <div>
              <Label className="text-[11px]">차수</Label>
              <select
                name="round"
                defaultValue={filter.round ?? ""}
                className="border-input bg-background h-8 w-full rounded border px-2 text-xs"
              >
                <option value="">전체</option>
                <option value="first">1차</option>
                <option value="second">2차</option>
              </select>
            </div>
            <div>
              <Label className="text-[11px]">상태</Label>
              <select
                name="status"
                defaultValue={filter.status ?? ""}
                className="border-input bg-background h-8 w-full rounded border px-2 text-xs"
              >
                <option value="">전체</option>
                {EXAM_RESULT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {EXAM_RESULT_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-[11px]">인증 상태</Label>
              <select
                name="v"
                defaultValue={filter.verificationStatus ?? ""}
                className="border-input bg-background h-8 w-full rounded border px-2 text-xs"
              >
                <option value="">전체</option>
                <option value="self_reported">자가 신고</option>
                <option value="document_submitted">증빙 제출</option>
                <option value="verified">인증됨</option>
                <option value="rejected">반려</option>
              </select>
            </div>
            <div className="col-span-2">
              <Label className="text-[11px]">학생 검색</Label>
              <Input
                type="search"
                name="q"
                defaultValue={filter.search ?? ""}
                placeholder="이름 / 이메일"
                className="h-8 text-xs"
              />
            </div>
            <div className="col-span-2 flex items-end justify-end gap-1 md:col-span-6">
              <Button size="sm" type="submit">
                필터 적용
              </Button>
              <Link to="/admin/exam-results" className="text-muted-foreground text-xs underline">
                초기화
              </Link>
            </div>
          </Form>
        </CardContent>
      </Card>

      {/* 결과 표 */}
      <Card>
        <CardHeader className="px-4 pb-2">
          <p className="text-sm font-semibold">결과 ({rows.length})</p>
        </CardHeader>
        <CardContent className="px-0 pb-3">
          {rows.length === 0 ? (
            <p className="text-muted-foreground px-4 text-xs">조건에 맞는 결과가 없습니다.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">학생</TableHead>
                  <TableHead className="w-[60px]">연도</TableHead>
                  <TableHead className="w-[60px]">차수</TableHead>
                  <TableHead className="w-[80px]">상태</TableHead>
                  <TableHead className="w-[80px]">자가점수</TableHead>
                  <TableHead className="w-[100px]">증빙</TableHead>
                  <TableHead className="w-[120px]">인증 상태</TableHead>
                  <TableHead>처리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <ResultRow key={r.resultId} row={r} canVerify={role === "admin"} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PoolStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "amber" | "rose" | "sky" | "violet";
}) {
  const toneClass = {
    emerald: "bg-emerald-50 text-emerald-800 border-emerald-200",
    amber: "bg-amber-50 text-amber-800 border-amber-200",
    rose: "bg-rose-50 text-rose-800 border-rose-200",
    sky: "bg-sky-50 text-sky-800 border-sky-200",
    violet: "bg-violet-50 text-violet-800 border-violet-200",
  }[tone];
  return (
    <div className={cn("rounded-md border px-3 py-2", toneClass)}>
      <div className="text-[10px] font-semibold tracking-wide uppercase opacity-80">
        {label}
      </div>
      <div className="text-xl font-bold tabular-nums">{value.toLocaleString("ko-KR")}</div>
    </div>
  );
}

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
    <TableRow data-testid={`exam-result-row-${row.resultId}`}>
      <TableCell className="text-xs">
        <div className="font-semibold">{row.userName}</div>
        {row.userEmail ? (
          <div className="text-muted-foreground text-[10px]">{row.userEmail}</div>
        ) : null}
      </TableCell>
      <TableCell className="tabular-nums text-xs">{row.examYear}</TableCell>
      <TableCell className="text-xs">{EXAM_ROUND_LABEL[row.examRound]}</TableCell>
      <TableCell>
        <Badge
          variant="outline"
          className={cn("text-[10px]", STATUS_TONE[row.status])}
        >
          {EXAM_RESULT_STATUS_LABEL[row.status]}
        </Badge>
      </TableCell>
      <TableCell className="tabular-nums text-xs">
        {row.selfReportedTotalScore ?? "—"}
      </TableCell>
      <TableCell>
        {row.certificatePath ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={openCertificate}
            disabled={fetcher.state !== "idle"}
            className="h-6 px-2 text-[10px]"
          >
            <ExternalLinkIcon className="mr-1 size-3" />
            증빙 열기
          </Button>
        ) : (
          <span className="text-muted-foreground text-[10px]">없음</span>
        )}
        {certUrl ? (
          <a
            href={certUrl}
            target="_blank"
            rel="noreferrer"
            className="text-primary block text-[10px] underline"
          >
            서명 URL (5분)
          </a>
        ) : null}
      </TableCell>
      <TableCell>
        <Badge
          variant="outline"
          className={cn("text-[10px]", VERIFY_TONE[row.verificationStatus])}
        >
          {EXAM_VERIFICATION_STATUS_LABEL[row.verificationStatus]}
        </Badge>
        {row.rejectionReason ? (
          <div className="text-[10px] text-rose-600">{row.rejectionReason}</div>
        ) : null}
      </TableCell>
      <TableCell>
        {canVerify && row.verificationStatus !== "verified" ? (
          <div className="flex flex-wrap items-center gap-1">
            <verifyFetcher.Form method="post" className="inline-flex">
              <input type="hidden" name="intent" value="verify" />
              <input type="hidden" name="resultId" value={row.resultId} />
              <input type="hidden" name="decision" value="verified" />
              <Button
                type="submit"
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[10px] text-emerald-700"
                disabled={verifyFetcher.state !== "idle"}
              >
                <CheckCircle2Icon className="mr-1 size-3" />
                인증
              </Button>
            </verifyFetcher.Form>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[10px] text-rose-700"
              onClick={() => setShowReject((s) => !s)}
            >
              <XCircleIcon className="mr-1 size-3" />
              반려
            </Button>
            {showReject ? (
              <verifyFetcher.Form method="post" className="flex items-center gap-1">
                <input type="hidden" name="intent" value="verify" />
                <input type="hidden" name="resultId" value={row.resultId} />
                <input type="hidden" name="decision" value="rejected" />
                <Input
                  type="text"
                  name="rejectionReason"
                  placeholder="반려 사유"
                  className="h-6 w-32 text-[10px]"
                />
                <Button
                  type="submit"
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  disabled={verifyFetcher.state !== "idle"}
                >
                  확정
                </Button>
              </verifyFetcher.Form>
            ) : null}
          </div>
        ) : row.verificationStatus === "verified" ? (
          <Badge variant="default" className="text-[10px]">
            <ShieldAlertIcon className="mr-1 size-3" />
            완료
          </Badge>
        ) : (
          <span className="text-muted-foreground text-[10px]">권한 없음</span>
        )}
      </TableCell>
    </TableRow>
  );
}
