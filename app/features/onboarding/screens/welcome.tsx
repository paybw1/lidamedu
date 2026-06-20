// feat-8-017 Onboarding wizard — 가입 후 첫 화면.
// 3 steps: 응시 계획 / 분석 동의 / 학습 목표. 각 step submit 시 데이터 저장 + 진행.
// 어느 step 에서든 "건너뛰기" 가능. 완료 또는 skip 시 profile.onboarded_at 설정.

import {
  CheckCircle2Icon,
  ChevronRightIcon,
  GraduationCapIcon,
  ShieldCheckIcon,
  TargetIcon,
} from "lucide-react";
import { Form, Link, data, redirect } from "react-router";
import { z } from "zod";

import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  EXAM_ROUND_LABEL,
  type ExamRound,
} from "~/features/exam-results/labels";
import {
  setMyAnalysisConsent,
  setNextExamPlan,
  setPoolConsent,
} from "~/features/exam-results/queries.server";
import { upsertStudyGoals } from "~/features/goals/queries.server";

import type { Route } from "./+types/welcome";

export const meta: Route.MetaFunction = () => [
  { title: "환영합니다 | Lidam Patent Attorney Academy" },
];

const TOTAL_STEPS = 3;

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const { data: profile } = await client
    .from("profiles")
    .select(
      "name, onboarded_at, next_exam_year, next_exam_round, analytics_consent_at",
    )
    .eq("profile_id", user.id)
    .maybeSingle();
  if (profile?.onboarded_at) {
    // 이미 완료 — 대시보드로
    throw redirect("/dashboard");
  }
  const url = new URL(request.url);
  const step = Math.max(
    1,
    Math.min(TOTAL_STEPS, Number(url.searchParams.get("step") ?? 1)),
  );
  return { profile, step };
}

const planSchema = z.object({
  intent: z.literal("plan"),
  nextExamYear: z.coerce.number().int().min(2000).max(2100),
  nextExamRound: z.enum(["first", "second"]),
});

// 체크박스 — 체크 시에만 "true" 전송, 미체크면 키 자체가 없음(optional).
const consentSchema = z.object({
  intent: z.literal("consent"),
  consentA: z.string().optional(),
  consentB: z.string().optional(),
});

const goalsSchema = z.object({
  intent: z.literal("goals"),
  examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식"),
  weeklyGoalHours: z.coerce.number().min(1).max(168),
  targetScore: z
    .union([z.coerce.number().min(0).max(200), z.literal("")])
    .optional(),
});

const skipSchema = z.object({
  intent: z.literal("skip"),
});

async function markOnboarded(
  client: ReturnType<typeof makeServerClient>[0],
  userId: string,
): Promise<void> {
  await client
    .from("profiles")
    .update({ onboarded_at: new Date().toISOString() })
    .eq("profile_id", userId);
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST")
    return data({ error: "Method not allowed" }, { status: 405 });
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });
  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "");

  if (intent === "plan") {
    const parsed = planSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success)
      return data(
        { error: parsed.error.issues[0]?.message ?? "입력 오류" },
        { status: 400 },
      );
    const res = await setNextExamPlan(client, user.id, {
      nextExamYear: parsed.data.nextExamYear,
      nextExamRound: parsed.data.nextExamRound as ExamRound,
    });
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    throw redirect("/onboarding/welcome?step=2");
  }

  if (intent === "consent") {
    const parsed = consentSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return data({ error: "입력 오류" }, { status: 400 });
    // A=내 학습 분석(기본 체크·opt-out), B=풀 기여+비교(opt-in·기본 미체크).
    const aRes = await setMyAnalysisConsent(
      client,
      user.id,
      parsed.data.consentA === "true",
    );
    if (!aRes.ok) return data({ error: aRes.error }, { status: 400 });
    const bRes = await setPoolConsent(
      client,
      user.id,
      parsed.data.consentB === "true",
    );
    if (!bRes.ok) return data({ error: bRes.error }, { status: 400 });
    throw redirect("/onboarding/welcome?step=3");
  }

  if (intent === "goals") {
    const parsed = goalsSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success)
      return data(
        { error: parsed.error.issues[0]?.message ?? "입력 오류" },
        { status: 400 },
      );
    // 차수(1차/2차)는 step1 의 setNextExamPlan(profiles.next_exam_round)이 SSOT —
    // study_goals 에는 더 이상 차수를 쓰지 않는다(feat-2-025).
    await upsertStudyGoals(client, user.id, {
      examDate: parsed.data.examDate,
      weeklyGoalHours: parsed.data.weeklyGoalHours,
      targetScore:
        parsed.data.targetScore === "" ||
        parsed.data.targetScore === undefined
          ? null
          : Number(parsed.data.targetScore),
      notes: null,
    });
    await markOnboarded(client, user.id);
    throw redirect("/dashboard");
  }

  if (intent === "skip") {
    skipSchema.parse(Object.fromEntries(fd));
    await markOnboarded(client, user.id);
    throw redirect("/dashboard");
  }

  return data({ error: `알 수 없는 intent: ${intent}` }, { status: 400 });
}

export default function OnboardingWelcome({
  loaderData,
}: Route.ComponentProps) {
  const { profile, step } = loaderData;
  const name = profile?.name?.trim() || "학습자";
  const currentYear = new Date().getFullYear();

  return (
    <div className="bg-muted/30 min-h-screen px-4 py-10 md:py-14">
      <div className="mx-auto w-full max-w-2xl">
        {/* 헤더 */}
        <header className="mb-6 space-y-1 text-center">
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            🌱 Onboarding
          </p>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            {name}님, 환영합니다
          </h1>
          <p className="text-muted-foreground text-sm">
            1분이면 충분합니다. 세 가지를 알려주시면 합격자 비교 컨설팅이 즉시
            활성화됩니다.
          </p>
        </header>

        {/* 진행 표시 */}
        <ol className="mb-6 flex items-center justify-center gap-2">
          {[1, 2, 3].map((s) => (
            <li key={s} className="flex items-center gap-2">
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full text-[11px] font-bold",
                  s < step
                    ? "bg-emerald-500 text-white"
                    : s === step
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {s < step ? <CheckCircle2Icon className="size-3.5" /> : s}
              </span>
              {s < 3 ? (
                <span
                  className={cn(
                    "h-px w-8",
                    s < step ? "bg-emerald-500" : "bg-muted",
                  )}
                />
              ) : null}
            </li>
          ))}
        </ol>

        {/* Step 본문 */}
        {step === 1 ? (
          <PlanStep currentYear={currentYear} profile={profile} />
        ) : step === 2 ? (
          <ConsentStep />
        ) : (
          <GoalsStep currentYear={currentYear} />
        )}

        {/* 건너뛰기 */}
        <div className="mt-6 text-center">
          <Form method="post" className="inline">
            <input type="hidden" name="intent" value="skip" />
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className="text-muted-foreground text-xs"
            >
              지금은 건너뛰기 →
            </Button>
          </Form>
        </div>
      </div>
    </div>
  );
}

function PlanStep({
  currentYear,
  profile,
}: {
  currentYear: number;
  profile: {
    next_exam_year: number | null;
    next_exam_round: ExamRound | null;
  } | null;
}) {
  return (
    <Card>
      <CardHeader className="px-5 pb-2">
        <div className="flex items-center gap-2">
          <GraduationCapIcon className="text-link size-5" />
          <p className="text-base font-semibold">차기 응시 계획</p>
        </div>
        <p className="text-muted-foreground text-xs">
          다음에 응시할 시험 정보를 알려주세요. 같은 연도·차수 합격자 데이터로
          비교 컨설팅이 활성화됩니다.
        </p>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <Form method="post" className="space-y-4">
          <input type="hidden" name="intent" value="plan" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px]">응시 연도</Label>
              <Input
                type="number"
                name="nextExamYear"
                min={currentYear}
                max={currentYear + 5}
                defaultValue={
                  profile?.next_exam_year ?? currentYear + 1
                }
                className="h-9"
                required
              />
            </div>
            <div>
              <Label className="text-[11px]">차수</Label>
              <select
                name="nextExamRound"
                defaultValue={profile?.next_exam_round ?? "first"}
                className="border-input bg-background h-9 w-full rounded border px-2 text-sm"
              >
                <option value="first">{EXAM_ROUND_LABEL.first}</option>
                <option value="second">{EXAM_ROUND_LABEL.second}</option>
              </select>
            </div>
          </div>
          <p className="text-muted-foreground rounded bg-muted/40 px-2 py-1.5 text-[11px]">
            ℹ️ 1차 자연과학은 4과목(물리·화학·생물·지구과학) 모두 필수 응시입니다.
          </p>
          <div className="flex justify-end">
            <Button type="submit" size="sm">
              다음 <ChevronRightIcon className="size-3.5" />
            </Button>
          </div>
        </Form>
      </CardContent>
    </Card>
  );
}

function ConsentStep() {
  return (
    <Card>
      <CardHeader className="px-5 pb-2">
        <div className="flex items-center gap-2">
          <ShieldCheckIcon className="text-link size-5" />
          <p className="text-base font-semibold">학습 데이터 활용 (선택)</p>
        </div>
        <p className="text-muted-foreground text-xs">
          서비스 이용에 필요한 학습 데이터 처리는 가입 시 동의로 완료되었습니다.
          아래 두 가지는 선택이며, 끄셔도 이용에 제한이 없습니다.
        </p>
      </CardHeader>
      <CardContent className="space-y-3 px-5 pb-5">
        <Form method="post" className="space-y-2.5">
          <input type="hidden" name="intent" value="consent" />

          {/* A — 내 학습 분석: 기본 체크(opt-out 가능) */}
          <label className="bg-muted/30 flex items-start gap-2.5 rounded-md border p-3">
            <input
              type="checkbox"
              name="consentA"
              value="true"
              defaultChecked
              className="mt-0.5 size-4 shrink-0"
            />
            <span className="space-y-0.5">
              <span className="block text-xs font-semibold">
                내 학습 분석 (A)
              </span>
              <span className="text-muted-foreground block text-[11px] leading-relaxed">
                내 학습 기록으로 학습 통계·정오문제 약점진단·복습·암기 기능을 제공합니다.
                끄면 이 기능들이 비활성화됩니다(기존 기록은 보존되며 다시 켜면
                복구).
              </span>
            </span>
          </label>

          {/* B — 풀 기여 + 비교: opt-in, 기본 미체크 (pre-check 금지) */}
          <label className="bg-muted/30 flex items-start gap-2.5 rounded-md border p-3">
            <input
              type="checkbox"
              name="consentB"
              value="true"
              className="mt-0.5 size-4 shrink-0"
            />
            <span className="space-y-0.5">
              <span className="block text-xs font-semibold">
                합격자·동료 비교 + 표본 기여 (B)
              </span>
              <span className="text-muted-foreground block text-[11px] leading-relaxed">
                내 학습·시험 데이터를 익명·집계로 합격자 표본에 기여하고, 그 대가로
                합격자·동료 대비 비교를 열람합니다.{" "}
                <strong>비교를 보려면 동의가 필요</strong>하며, 끄면 비교가 보이지
                않고 풀 집계에서도 제외됩니다.
              </span>
            </span>
          </label>

          <p className="text-muted-foreground bg-muted/40 rounded px-2 py-1.5 text-[11px]">
            모든 분석은 익명·가명처리 후 집계 형태로만 수행됩니다.
            <Link
              to="/legal/analytics-consent"
              target="_blank"
              className="text-link ml-1 underline"
            >
              상세 약관 →
            </Link>
          </p>

          <div className="flex justify-end">
            <Button type="submit" size="default">
              계속 <ChevronRightIcon className="size-3.5" />
            </Button>
          </div>
        </Form>
        <p className="text-muted-foreground text-center text-[10px]">
          나중에 `/me/exam-results` 페이지에서 언제든 변경 가능합니다.
        </p>
      </CardContent>
    </Card>
  );
}

function GoalsStep({ currentYear }: { currentYear: number }) {
  const defaultExamDate = `${currentYear + 1}-02-25`; // 변리사 1차 시험 근사일
  return (
    <Card>
      <CardHeader className="px-5 pb-2">
        <div className="flex items-center gap-2">
          <TargetIcon className="text-link size-5" />
          <p className="text-base font-semibold">학습 목표</p>
        </div>
        <p className="text-muted-foreground text-xs">
          시험일과 주간 학습 시간을 정해주세요. 매일의 권장 진도가 자동 계산되고
          대시보드 카드에 표시됩니다.
        </p>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <Form method="post" className="space-y-4">
          <input type="hidden" name="intent" value="goals" />
          <div>
            <Label className="text-[11px]">시험일 (예상)</Label>
            <Input
              type="date"
              name="examDate"
              defaultValue={defaultExamDate}
              className="h-9"
              required
            />
            <p className="text-muted-foreground mt-1 text-[10px]">
              변리사 1차는 보통 2월 마지막 토요일, 2차는 7월 셋째 토요일 근방
              입니다.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px]">주간 목표 시간</Label>
              <Input
                type="number"
                name="weeklyGoalHours"
                min={1}
                max={168}
                step={1}
                defaultValue={25}
                className="h-9"
                required
              />
            </div>
            <div>
              <Label className="text-[11px]">목표 점수 (선택)</Label>
              <Input
                type="number"
                name="targetScore"
                step={1}
                placeholder="예: 75"
                className="h-9"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="submit" size="default">
              완료하고 대시보드로 →
            </Button>
          </div>
        </Form>
      </CardContent>
    </Card>
  );
}
