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
  setAnalyticsConsent,
  setNextExamPlan,
} from "~/features/exam-results/queries.server";
import { upsertStudyGoals } from "~/features/goals/queries.server";

import type { Route } from "./+types/welcome";

export const meta: Route.MetaFunction = () => [
  { title: "환영합니다 | Lidam Edu" },
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

const consentSchema = z.object({
  intent: z.literal("consent"),
  consented: z.enum(["true", "false"]),
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
      selectedScienceSubject: null,
    });
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    throw redirect("/onboarding/welcome?step=2");
  }

  if (intent === "consent") {
    const parsed = consentSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return data({ error: "입력 오류" }, { status: 400 });
    const consented = parsed.data.consented === "true";
    const res = await setAnalyticsConsent(client, user.id, consented);
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    throw redirect("/onboarding/welcome?step=3");
  }

  if (intent === "goals") {
    const parsed = goalsSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success)
      return data(
        { error: parsed.error.issues[0]?.message ?? "입력 오류" },
        { status: 400 },
      );
    await upsertStudyGoals(client, user.id, {
      examDate: parsed.data.examDate,
      weeklyGoalHours: parsed.data.weeklyGoalHours,
      examType: "first", // onboarding 은 1차 디폴트, /goals 에서 수정 가능
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
          <GraduationCapIcon className="text-primary size-5" />
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
          <ShieldCheckIcon className="text-primary size-5" />
          <p className="text-base font-semibold">학습 데이터 분석 활용 동의</p>
        </div>
        <p className="text-muted-foreground text-xs">
          본인 학습 데이터를 익명·집계 형태로 활용하면, 합격자 평균 대비 비교
          컨설팅을 받을 수 있습니다.
        </p>
      </CardHeader>
      <CardContent className="space-y-3 px-5 pb-5">
        <div className="bg-muted/40 rounded-md border p-3 text-xs leading-relaxed">
          <p className="font-semibold">분석에 활용되는 데이터</p>
          <ul className="text-muted-foreground mt-1 list-inside list-disc space-y-0.5 text-[11px]">
            <li>문제 풀이 결과, 조문/판례 열람 이력</li>
            <li>빈칸·암기 시도, 강의 시청 진행률</li>
            <li>본인 시험 결과 (입력한 경우)</li>
          </ul>
          <p className="text-muted-foreground mt-2 text-[11px]">
            모든 분석은 익명·가명처리 후 집계 형태로만 수행됩니다.
            <Link
              to="/legal/analytics-consent"
              target="_blank"
              className="text-primary ml-1 underline"
            >
              상세 약관 →
            </Link>
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Form method="post">
            <input type="hidden" name="intent" value="consent" />
            <input type="hidden" name="consented" value="true" />
            <Button type="submit" size="default" className="w-full">
              동의하고 계속
            </Button>
          </Form>
          <Form method="post">
            <input type="hidden" name="intent" value="consent" />
            <input type="hidden" name="consented" value="false" />
            <Button
              type="submit"
              size="default"
              variant="outline"
              className="w-full"
            >
              지금은 동의 안 함
            </Button>
          </Form>
        </div>
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
          <TargetIcon className="text-primary size-5" />
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
