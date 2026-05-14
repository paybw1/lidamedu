// feat-8-002 학생 본인 합격 결과 입력 화면.
// /me/exam-results — 본인 결과 연도별 1차/2차 카드 + 동의 토글 + 차기 응시 의향 입력.

import {
  CheckCircle2Icon,
  ClipboardCheckIcon,
  TrophyIcon,
  UploadIcon,
} from "lucide-react";
import { useState } from "react";
import { Link, data, redirect, useFetcher } from "react-router";
import { z } from "zod";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import { Textarea } from "~/core/components/ui/textarea";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  attachCertificate,
  deleteMyExamResult,
  getMyExamProfileFields,
  listMyExamResults,
  setAnalyticsConsent,
  setNextExamPlan,
  upsertMyExamResult,
} from "~/features/exam-results/queries.server";
import {
  EXAM_RESULT_STATUS_LABEL,
  EXAM_RESULT_STATUSES,
  EXAM_ROUND_LABEL,
  EXAM_VERIFICATION_STATUS_LABEL,
  SCIENCE_SUBJECT_KEYS,
  SCIENCE_SUBJECT_LABEL,
  type ExamResultStatus,
  type ExamRound,
} from "~/features/exam-results/labels";

import type { Route } from "./+types/my-exam-results";

export const meta: Route.MetaFunction = () => [
  { title: "합격 결과 | Lidam Edu" },
];

const upsertSchema = z.object({
  intent: z.literal("upsert"),
  examYear: z.coerce.number().int().min(2000).max(2100),
  examRound: z.enum(["first", "second"]),
  status: z.enum(["absent", "pending", "failed", "passed"]),
  selfReportedTotalScore: z
    .union([z.coerce.number().min(0).max(200), z.literal("")])
    .optional(),
  selectedScienceSubject: z.string().optional().nullable(),
  studySummaryMd: z.string().max(8000).optional().nullable(),
});

const planSchema = z.object({
  intent: z.literal("plan"),
  nextExamYear: z.union([z.coerce.number().int().min(2000).max(2100), z.literal("")]),
  nextExamRound: z.union([z.enum(["first", "second"]), z.literal("")]),
  selectedScienceSubject: z.string().optional().nullable(),
});

const consentSchema = z.object({
  intent: z.literal("consent"),
  consented: z.coerce.boolean(),
});

const deleteSchema = z.object({
  intent: z.literal("delete"),
  resultId: z.string().uuid(),
});

const certSchema = z.object({
  intent: z.literal("certificate"),
  resultId: z.string().uuid(),
  storagePath: z.string().min(1).max(500),
});

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const [results, profile] = await Promise.all([
    listMyExamResults(client, user.id),
    getMyExamProfileFields(client, user.id),
  ]);
  return { results, profile };
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

  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "");

  if (intent === "upsert") {
    const parsed = upsertSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success)
      return data({ error: parsed.error.issues[0]?.message ?? "입력 오류" }, { status: 400 });
    const totalScore =
      parsed.data.selfReportedTotalScore === "" ||
      parsed.data.selfReportedTotalScore === undefined
        ? null
        : Number(parsed.data.selfReportedTotalScore);
    const res = await upsertMyExamResult(client, {
      userId: user.id,
      examYear: parsed.data.examYear,
      examRound: parsed.data.examRound,
      status: parsed.data.status,
      selfReportedTotalScore: totalScore,
      selectedScienceSubject: parsed.data.selectedScienceSubject || null,
      studySummaryMd: parsed.data.studySummaryMd || null,
    });
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true, resultId: res.resultId });
  }

  if (intent === "plan") {
    const parsed = planSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success)
      return data({ error: parsed.error.issues[0]?.message ?? "입력 오류" }, { status: 400 });
    const res = await setNextExamPlan(client, user.id, {
      nextExamYear: parsed.data.nextExamYear === "" ? null : Number(parsed.data.nextExamYear),
      nextExamRound:
        parsed.data.nextExamRound === "" ? null : (parsed.data.nextExamRound as ExamRound),
      selectedScienceSubject: parsed.data.selectedScienceSubject || null,
    });
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true });
  }

  if (intent === "consent") {
    const parsed = consentSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return data({ error: "입력 오류" }, { status: 400 });
    const res = await setAnalyticsConsent(client, user.id, parsed.data.consented);
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true });
  }

  if (intent === "delete") {
    const parsed = deleteSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return data({ error: "입력 오류" }, { status: 400 });
    const res = await deleteMyExamResult(client, user.id, parsed.data.resultId);
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true });
  }

  if (intent === "certificate") {
    const parsed = certSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return data({ error: "입력 오류" }, { status: 400 });
    // 클라가 직접 storage 에 업로드한 path 를 받아 result row 에 attach
    const res = await attachCertificate(
      client,
      user.id,
      parsed.data.resultId,
      parsed.data.storagePath,
      null,
    );
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true });
  }

  return data({ error: `알 수 없는 intent: ${intent}` }, { status: 400 });
}

const STATUS_TONE: Record<ExamResultStatus, string> = {
  passed: "text-emerald-700 bg-emerald-50 border-emerald-200",
  failed: "text-rose-700 bg-rose-50 border-rose-200",
  pending: "text-amber-700 bg-amber-50 border-amber-200",
  absent: "text-muted-foreground bg-muted/40 border-muted-foreground/20",
};

export default function MyExamResults({ loaderData }: Route.ComponentProps) {
  const { results, profile } = loaderData;
  const consented = !!profile?.analyticsConsentAt;
  const currentYear = new Date().getFullYear();

  return (
    <div className="mx-auto w-full max-w-screen-md px-5 py-6 md:px-10 md:py-8">
      <header className="mb-6 space-y-1">
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
          <TrophyIcon className="size-3.5" /> 합격 데이터
        </p>
        <h1 className="text-2xl font-bold tracking-tight">내 시험 결과</h1>
        <p className="text-muted-foreground text-sm">
          변리사 1·2차 시험 결과를 연도·차수별로 기록합니다. 인증된 데이터는
          학습 패턴 분석에 익명·집계 형태로 활용됩니다.
          <Link
            to="/legal/analytics-consent"
            className="text-primary ml-1 underline"
          >
            상세 약관 →
          </Link>
        </p>
      </header>

      {/* 분석 동의 카드 */}
      <ConsentCard consented={consented} consentedAt={profile?.analyticsConsentAt ?? null} />

      {/* 차기 응시 의향 */}
      <PlanCard profile={profile} currentYear={currentYear} />

      {/* 결과 일람 */}
      <section className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">결과 기록</h2>
          <span className="text-muted-foreground text-xs">
            {results.length}건
          </span>
        </div>
        {results.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            아직 기록된 결과가 없습니다. 아래에서 추가하세요.
          </p>
        ) : (
          <div className="space-y-2">
            {results.map((r) => (
              <ResultCard key={r.resultId} result={r} />
            ))}
          </div>
        )}
      </section>

      {/* 신규 입력 폼 */}
      <NewResultCard currentYear={currentYear} />
    </div>
  );
}

function ConsentCard({
  consented,
  consentedAt,
}: {
  consented: boolean;
  consentedAt: string | null;
}) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  return (
    <Card className="mb-4">
      <CardHeader className="px-4 pb-2">
        <p className="text-sm font-semibold">
          <ClipboardCheckIcon className="mr-1 inline size-3.5" />
          학습 데이터 분석 활용 동의
        </p>
      </CardHeader>
      <CardContent className="px-4 pb-3 space-y-2">
        <p className="text-muted-foreground text-xs leading-relaxed">
          본인의 학습 로그(문제 풀이, 조문 열람, 빈칸/암기, 강의 시청 등)와 시험
          결과를 <strong>익명화·집계</strong>하여 합격자 학습 패턴 분석 및 다른
          학생의 진단·컨설팅에 활용하는 데 동의합니다. 동의는 언제든 철회할 수
          있으며, 철회 시 다음 분석 배치부터 본인 데이터는 제외됩니다.
        </p>
        <fetcher.Form
          method="post"
          className="flex items-center justify-between gap-3"
        >
          <input type="hidden" name="intent" value="consent" />
          <input type="hidden" name="consented" value={String(!consented)} />
          <span className="text-xs">
            {consented ? (
              <span className="inline-flex items-center gap-1 text-emerald-700">
                <CheckCircle2Icon className="size-3" />
                동의함
                {consentedAt ? (
                  <span className="text-muted-foreground">
                    · {consentedAt.slice(0, 10)}
                  </span>
                ) : null}
              </span>
            ) : (
              <span className="text-muted-foreground">미동의 상태</span>
            )}
          </span>
          <Button
            type="submit"
            size="sm"
            variant={consented ? "outline" : "default"}
            disabled={fetcher.state !== "idle"}
          >
            {consented ? "동의 철회" : "동의하기"}
          </Button>
        </fetcher.Form>
      </CardContent>
    </Card>
  );
}

function PlanCard({
  profile,
  currentYear,
}: {
  profile: { nextExamYear: number | null; nextExamRound: ExamRound | null; selectedScienceSubject: string | null } | null;
  currentYear: number;
}) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  return (
    <Card className="mb-4">
      <CardHeader className="px-4 pb-2">
        <p className="text-sm font-semibold">차기 응시 계획</p>
        <p className="text-muted-foreground text-[11px]">
          결과 입력 알림 + 합격자 평균 비교 시 사용합니다.
        </p>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        <fetcher.Form method="post" className="grid grid-cols-3 gap-2">
          <input type="hidden" name="intent" value="plan" />
          <div>
            <Label htmlFor="next-year" className="text-[11px]">
              연도
            </Label>
            <Input
              id="next-year"
              name="nextExamYear"
              type="number"
              min={currentYear}
              max={currentYear + 5}
              defaultValue={profile?.nextExamYear ?? ""}
              placeholder={String(currentYear)}
              className="h-8 text-xs"
            />
          </div>
          <div>
            <Label htmlFor="next-round" className="text-[11px]">
              차수
            </Label>
            <select
              id="next-round"
              name="nextExamRound"
              defaultValue={profile?.nextExamRound ?? ""}
              className="border-input bg-background h-8 w-full rounded border px-2 text-xs"
            >
              <option value="">미정</option>
              <option value="first">1차</option>
              <option value="second">2차</option>
            </select>
          </div>
          <div>
            <Label htmlFor="next-science" className="text-[11px]">
              자연과학 선택
            </Label>
            <select
              id="next-science"
              name="selectedScienceSubject"
              defaultValue={profile?.selectedScienceSubject ?? ""}
              className="border-input bg-background h-8 w-full rounded border px-2 text-xs"
            >
              <option value="">없음</option>
              {SCIENCE_SUBJECT_KEYS.map((k) => (
                <option key={k} value={k}>
                  {SCIENCE_SUBJECT_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-3 flex justify-end">
            <Button size="sm" type="submit" disabled={fetcher.state !== "idle"}>
              저장
            </Button>
          </div>
        </fetcher.Form>
      </CardContent>
    </Card>
  );
}

function ResultCard({
  result,
}: {
  result: Awaited<ReturnType<typeof listMyExamResults>>[number];
}) {
  const editFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const deleteFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const [editing, setEditing] = useState(false);
  const tone = STATUS_TONE[result.status];

  return (
    <Card>
      <CardHeader className="px-4 pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold tabular-nums">
            {result.examYear}년 {EXAM_ROUND_LABEL[result.examRound]}
          </p>
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className={cn("text-[10px]", tone)}>
              {EXAM_RESULT_STATUS_LABEL[result.status]}
            </Badge>
            <Badge variant="secondary" className="text-[10px]">
              {EXAM_VERIFICATION_STATUS_LABEL[result.verificationStatus]}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-3 space-y-2">
        {result.selfReportedTotalScore !== null ? (
          <p className="text-muted-foreground text-xs">
            자가 신고 점수: <span className="font-semibold tabular-nums">{result.selfReportedTotalScore}</span>
          </p>
        ) : null}
        {result.studySummaryMd ? (
          <p className="text-muted-foreground text-xs whitespace-pre-line">
            {result.studySummaryMd}
          </p>
        ) : null}
        {result.rejectionReason ? (
          <p className="text-rose-700 text-xs">
            반려 사유: {result.rejectionReason}
          </p>
        ) : null}

        {editing ? (
          <editFetcher.Form
            method="post"
            className="space-y-2 rounded border-l-2 border-primary/40 bg-muted/30 p-3"
            onSubmit={() => setTimeout(() => setEditing(false), 100)}
          >
            <input type="hidden" name="intent" value="upsert" />
            <input type="hidden" name="examYear" value={result.examYear} />
            <input type="hidden" name="examRound" value={result.examRound} />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[11px]">상태</Label>
                <select
                  name="status"
                  defaultValue={result.status}
                  className="border-input bg-background h-8 w-full rounded border px-2 text-xs"
                >
                  {EXAM_RESULT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {EXAM_RESULT_STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-[11px]">자가 신고 점수</Label>
                <Input
                  type="number"
                  step={0.01}
                  name="selfReportedTotalScore"
                  defaultValue={result.selfReportedTotalScore ?? ""}
                  className="h-8 text-xs"
                />
              </div>
            </div>
            <div>
              <Label className="text-[11px]">학습 요약 (선택)</Label>
              <Textarea
                name="studySummaryMd"
                defaultValue={result.studySummaryMd ?? ""}
                rows={3}
                className="text-xs"
                placeholder="이번 차수를 준비하면서 가장 중요했던 학습 방법·시간 배분 등"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setEditing(false)}
              >
                취소
              </Button>
              <Button type="submit" size="sm" disabled={editFetcher.state !== "idle"}>
                저장
              </Button>
            </div>
          </editFetcher.Form>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CertificateUploader
              resultId={result.resultId}
              currentPath={result.certificatePath}
              verified={result.verificationStatus === "verified"}
            />
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setEditing(true)}
                disabled={result.verificationStatus === "verified"}
              >
                수정
              </Button>
              <deleteFetcher.Form method="post">
                <input type="hidden" name="intent" value="delete" />
                <input type="hidden" name="resultId" value={result.resultId} />
                <Button
                  type="submit"
                  size="sm"
                  variant="ghost"
                  className="text-rose-600 hover:text-rose-700"
                  disabled={
                    deleteFetcher.state !== "idle" ||
                    result.verificationStatus === "verified"
                  }
                  onClick={(e) => {
                    if (!confirm("이 기록을 삭제하시겠습니까?")) e.preventDefault();
                  }}
                >
                  삭제
                </Button>
              </deleteFetcher.Form>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CertificateUploader({
  resultId,
  currentPath,
  verified,
}: {
  resultId: string;
  currentPath: string | null;
  verified: boolean;
}) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    setUploading(true);
    try {
      // 클라 측에서 Supabase Storage 로 직접 업로드.
      // 본인 폴더(user_id/result_id/...) 경로에만 RLS 가 허용됨.
      const { createBrowserClient } = await import("@supabase/ssr");
      const supa = createBrowserClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_ANON_KEY,
      );
      const { data: auth } = await supa.auth.getUser();
      if (!auth.user) {
        setErrorMsg("로그인이 필요합니다");
        return;
      }
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "pdf";
      const path = `${auth.user.id}/${resultId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supa.storage
        .from("exam-certificates")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) {
        setErrorMsg(upErr.message);
        return;
      }
      const fd = new FormData();
      fd.append("intent", "certificate");
      fd.append("resultId", resultId);
      fd.append("storagePath", path);
      fetcher.submit(fd, { method: "post" });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Label
        className={cn(
          "border-input inline-flex cursor-pointer items-center gap-1 rounded border px-2 py-1 text-xs",
          verified && "cursor-not-allowed opacity-50",
        )}
      >
        <UploadIcon className="size-3" />
        {currentPath ? "증빙 교체" : "합격증 업로드"}
        <input
          type="file"
          accept=".pdf,image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={onChange}
          disabled={uploading || verified}
        />
      </Label>
      {currentPath ? (
        <span className="text-muted-foreground text-[10px]">
          {currentPath.split("/").pop()}
        </span>
      ) : null}
      {uploading || fetcher.state !== "idle" ? (
        <span className="text-muted-foreground text-[10px]">업로드 중…</span>
      ) : null}
      {errorMsg ? (
        <span className="text-[10px] text-rose-600">{errorMsg}</span>
      ) : null}
    </div>
  );
}

function NewResultCard({ currentYear }: { currentYear: number }) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  return (
    <Card>
      <CardHeader className="px-4 pb-2">
        <p className="text-sm font-semibold">새 결과 추가</p>
        <p className="text-muted-foreground text-[11px]">
          같은 연도·차수에 중복 추가 시 기존 기록을 덮어씁니다.
        </p>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        <fetcher.Form method="post" className="space-y-2">
          <input type="hidden" name="intent" value="upsert" />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px]">연도</Label>
              <Input
                type="number"
                name="examYear"
                min={2000}
                max={currentYear + 1}
                defaultValue={currentYear}
                className="h-8 text-xs"
              />
            </div>
            <div>
              <Label className="text-[11px]">차수</Label>
              <select
                name="examRound"
                defaultValue="first"
                className="border-input bg-background h-8 w-full rounded border px-2 text-xs"
              >
                <option value="first">1차</option>
                <option value="second">2차</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px]">상태</Label>
              <select
                name="status"
                defaultValue="pending"
                className="border-input bg-background h-8 w-full rounded border px-2 text-xs"
              >
                {EXAM_RESULT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {EXAM_RESULT_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-[11px]">자가 신고 점수 (선택)</Label>
              <Input
                type="number"
                step={0.01}
                name="selfReportedTotalScore"
                placeholder="예: 85"
                className="h-8 text-xs"
              />
            </div>
          </div>
          <div>
            <Label className="text-[11px]">학습 요약 (선택)</Label>
            <Textarea
              name="studySummaryMd"
              rows={3}
              className="text-xs"
              placeholder="이번 차수를 준비하면서 가장 중요했던 학습 방법·시간 배분 등"
            />
          </div>
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={fetcher.state !== "idle"}>
              결과 저장
            </Button>
          </div>
          {fetcher.data?.error ? (
            <p className="text-xs text-rose-600">{fetcher.data.error}</p>
          ) : null}
        </fetcher.Form>
      </CardContent>
    </Card>
  );
}
