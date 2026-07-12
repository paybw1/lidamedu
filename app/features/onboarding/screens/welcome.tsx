// feat-8-017 Onboarding wizard — 가입 후 첫 화면.
// 4 steps: 응시 계획 / 분석 동의 / 학습 목표 / 기능 둘러보기(웰컴 투어).
// 어느 step 에서든 "건너뛰기" 가능. 완료 또는 skip 시 profile.onboarded_at 설정.
import type { Route } from "./+types/welcome";

import {
  BarChart3Icon,
  BookOpenIcon,
  CheckCircle2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CompassIcon,
  GraduationCapIcon,
  HelpCircleIcon,
  ListChecksIcon,
  TargetIcon,
} from "lucide-react";
import { useState } from "react";
import { Form, Link, data, redirect } from "react-router";
import { z } from "zod";

import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import makeServerClient from "~/core/lib/supa-client.server";
import { cn } from "~/core/lib/utils";
import { ConsentSection } from "~/features/exam-results/components/consent-section";
import {
  EXAM_ROUND_LABEL,
  type ExamRound,
} from "~/features/exam-results/labels";
import { setNextExamPlan } from "~/features/exam-results/queries.server";
import { upsertStudyGoals } from "~/features/goals/queries.server";

export const meta: Route.MetaFunction = () => [
  { title: "환영합니다 | 리담변리사학원" },
];

const TOTAL_STEPS = 4;

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  // feat-11-004 4d — 가입 자동 발급 쿠폰(정의: discounts.auto_issue='signup'). 멱등(unique).
  {
    const { issueAutoCoupons } = await import(
      "~/features/orders/coupons.server"
    );
    await issueAutoCoupons(user.id, "signup");
  }
  const { data: profile } = await client
    .from("profiles")
    .select(
      "name, onboarded_at, next_exam_year, next_exam_round, my_analysis_consent_at, pool_consent_at",
    )
    .eq("profile_id", user.id)
    .maybeSingle();
  const url = new URL(request.url);
  // 둘러보기 다시 보기(?replay=1) — 온보딩 완료자도 투어 스텝만 재열람.
  const replay = url.searchParams.get("replay") === "1";
  if (profile?.onboarded_at && !replay) {
    // 이미 완료 — 대시보드로
    throw redirect("/dashboard");
  }
  const step = replay
    ? TOTAL_STEPS
    : Math.max(
        1,
        Math.min(TOTAL_STEPS, Number(url.searchParams.get("step") ?? 1)),
      );
  return { profile, step, replay };
}

const planSchema = z.object({
  intent: z.literal("plan"),
  nextExamYear: z.coerce.number().int().min(2000).max(2100),
  nextExamRound: z.enum(["first", "second"]),
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

  // 동의(step 2)는 이제 공용 ConsentSection 이 항목별로 /api/consent 에 즉시 반영한다.
  // 위저드 action 은 더 이상 consent intent 를 다루지 않는다(단일 진입점: /api/consent).

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
        parsed.data.targetScore === "" || parsed.data.targetScore === undefined
          ? null
          : Number(parsed.data.targetScore),
      notes: null,
    });
    throw redirect("/onboarding/welcome?step=4");
  }

  // 투어 완료 — 대시보드 또는 이용 가이드로.
  if (intent === "finish" || intent === "finish_guide") {
    await markOnboarded(client, user.id);
    throw redirect(intent === "finish_guide" ? "/guide" : "/dashboard");
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
  const { profile, step, replay } = loaderData;
  const name = profile?.name?.trim() || "학습자";
  const currentYear = new Date().getFullYear();

  return (
    <div className="bg-muted/30 min-h-screen px-4 py-10 md:py-14">
      <div className="mx-auto w-full max-w-2xl">
        {/* 헤더 */}
        <header className="mb-6 space-y-1 text-center">
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            {replay ? "🧭 다시 둘러보기" : "🌱 Onboarding"}
          </p>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            {replay ? "핵심 기능 둘러보기" : `${name}님, 환영합니다`}
          </h1>
          <p className="text-muted-foreground text-sm">
            {replay
              ? "처음 안내했던 핵심 기능을 다시 확인해 보세요."
              : "1분이면 충분합니다. 응시 계획과 학습 목표를 알려주시고, 핵심 기능을 가볍게 둘러보세요."}
          </p>
        </header>

        {/* 진행 표시 — 다시 보기 모드에선 단계 없음 */}
        <ol
          className={cn(
            "mb-6 flex items-center justify-center gap-2",
            replay && "hidden",
          )}
        >
          {[1, 2, 3, 4].map((s) => (
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
              {s < TOTAL_STEPS ? (
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
          <ConsentStep
            myAnalysisConsentedAt={profile?.my_analysis_consent_at ?? null}
            poolConsentedAt={profile?.pool_consent_at ?? null}
          />
        ) : step === 3 ? (
          <GoalsStep currentYear={currentYear} />
        ) : (
          <TourStep replay={replay} />
        )}

        {/* 건너뛰기 — 다시 보기 모드에선 불필요 */}
        {!replay ? (
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
        ) : null}
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
          다음에 응시할 시험 정보를 알려주세요. 같은 연도·차수 합격자 데이터가
          쌓이면 비교 컨설팅이 활성화됩니다.
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
                defaultValue={profile?.next_exam_year ?? currentYear + 1}
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
          <p className="text-muted-foreground bg-muted/40 rounded px-2 py-1.5 text-[11px]">
            ℹ️ 1차 자연과학은 4과목(물리·화학·생물·지구과학) 모두 필수
            응시입니다.
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

// step 2 — 학습 데이터 활용 동의(선택). 대시보드 입력 허브와 동일한 공용
// ConsentSection 을 그대로 사용해 문구·동작 드리프트를 없앤다. 각 토글이
// /api/consent 로 즉시 반영되므로, 이 스텝은 별도 제출 없이 "계속"으로 넘어간다.
// A(내 학습 분석)는 가입 시점(handle_new_user)에 이미 ON 이라 기본 동의 상태로 보인다.
function ConsentStep({
  myAnalysisConsentedAt,
  poolConsentedAt,
}: {
  myAnalysisConsentedAt: string | null;
  poolConsentedAt: string | null;
}) {
  return (
    <Card>
      <CardContent className="space-y-3 px-5 py-5">
        <ConsentSection
          myAnalysisConsentedAt={myAnalysisConsentedAt}
          poolConsentedAt={poolConsentedAt}
        />
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
          <Button asChild size="default">
            <Link to="/onboarding/welcome?step=3">
              계속 <ChevronRightIcon className="size-3.5" />
            </Link>
          </Button>
        </div>
        <p className="text-muted-foreground text-center text-[10px]">
          나중에 /me/exam-results 페이지에서 언제든 변경 가능합니다.
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
              다음 <ChevronRightIcon className="size-3.5" />
            </Button>
          </div>
        </Form>
      </CardContent>
    </Card>
  );
}

// ── Step 4 — 기능 둘러보기(웰컴 투어) ───────────────────────────────────────
// 핵심 동선 4장 카드. 마지막 장에서 완료(대시보드) 또는 이용 가이드로 이동.

const TOUR_CARDS = [
  {
    Icon: BookOpenIcon,
    title: "조문·판례·문제가 이어집니다",
    body: "학습과목에서 조문을 열면 옆에 관련 판례와 문제가 함께 붙습니다. 조문을 읽다가 판례로, 판례에서 문제로 끊김 없이 오가며 공부해 보세요.",
  },
  {
    Icon: ListChecksIcon,
    title: "틀린 문제는 자동으로 모입니다",
    body: "문제를 풀면 틀린 문제가 오답노트에 자동으로 쌓이고, 다시 풀어 맞히면 알아서 빠집니다. 하이라이트·포스트잇 같은 기록은 학습노트에 모입니다.",
  },
  {
    Icon: BarChart3Icon,
    title: "약점을 찾고, 복습은 알아서",
    body: "학습현황에서 어느 단원이 약한지 한눈에 보입니다. 복습과 암기 카드는 잊을 때쯤 자동으로 다시 물어봅니다.",
  },
  {
    Icon: HelpCircleIcon,
    title: "막힐 땐 ? 버튼",
    body: "화면 구석의 ? 버튼을 누르면 그 화면 사용법이 바로 열립니다. 커뮤니티의 이용 가이드에서 영상 설명도 볼 수 있습니다.",
  },
] as const;

function TourStep({ replay = false }: { replay?: boolean }) {
  const [idx, setIdx] = useState(0);
  const card = TOUR_CARDS[idx];
  const last = idx === TOUR_CARDS.length - 1;
  return (
    <Card>
      <CardHeader className="px-5 pb-2">
        <div className="flex items-center gap-2">
          <CompassIcon className="text-link size-5" />
          <p className="text-base font-semibold">
            1분 둘러보기 ({idx + 1}/{TOUR_CARDS.length})
          </p>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <div className="bg-muted/30 border-border rounded-xl border p-5 text-center">
          <card.Icon className="text-link mx-auto size-8" />
          <p className="text-foreground mt-3 text-base font-bold">
            {card.title}
          </p>
          <p className="text-muted-foreground mx-auto mt-2 max-w-md text-sm leading-relaxed">
            {card.body}
          </p>
        </div>
        {/* 진행 점 */}
        <div className="mt-3 flex items-center justify-center gap-1.5">
          {TOUR_CARDS.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`${i + 1}번째 카드`}
              onClick={() => setIdx(i)}
              className={cn(
                "size-2 rounded-full transition-colors",
                i === idx ? "bg-primary" : "bg-muted",
              )}
            />
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={idx === 0}
            onClick={() => setIdx((v) => Math.max(0, v - 1))}
          >
            <ChevronLeftIcon className="size-3.5" /> 이전
          </Button>
          {last ? (
            replay ? (
              // 다시 보기 — 이미 온보딩 완료 상태라 링크로만 마무리(재기록 없음).
              <div className="flex items-center gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link to="/guide">이용 가이드 보기</Link>
                </Button>
                <Button asChild size="sm">
                  <Link to="/dashboard">대시보드로 →</Link>
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Form method="post" className="inline">
                  <input type="hidden" name="intent" value="finish_guide" />
                  <Button type="submit" variant="outline" size="sm">
                    이용 가이드 보기
                  </Button>
                </Form>
                <Form method="post" className="inline">
                  <input type="hidden" name="intent" value="finish" />
                  <Button type="submit" size="sm">
                    시작하기 →
                  </Button>
                </Form>
              </div>
            )
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={() => setIdx((v) => Math.min(TOUR_CARDS.length - 1, v + 1))}
            >
              다음 <ChevronRightIcon className="size-3.5" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
