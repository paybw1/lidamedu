// 학생 입력 허브 — 대시보드 한 곳에서 목표·실제 시험결과·데이터 활용 동의를 정리.
// ★3블록 = 3 독립 action: 저장이 동의를 함의하지 않도록 폼/제출을 분리한다.
//   목표 → /study/stats · 시험결과 → /me/exam-results · 동의 → /api/consent(ConsentSection 내부).
// 차수·목표 모두 미설정이면 autoOpen 으로 첫 진입에 펼침(온보딩성 넛지, 설정되면 자동 오픈 안 함).
import { SettingsIcon } from "lucide-react";
import { useState } from "react";
import { Link, useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "~/core/components/ui/sheet";
import { ConsentSection } from "~/features/exam-results/components/consent-section";
import { ResultFields } from "~/features/exam-results/components/result-fields";
import type { StudyGoals } from "~/features/goals/queries.server";
import { GoalFields } from "~/features/study/components/goal-fields";

export function StudentInputHub({
  goals,
  examRound,
  myAnalysisConsentAt,
  poolConsentAt,
  autoOpen = false,
}: {
  goals: StudyGoals;
  examRound: "first" | "second" | null;
  myAnalysisConsentAt: string | null;
  poolConsentAt: string | null;
  autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(autoOpen);
  const round = examRound ?? "first";
  const currentYear = new Date().getFullYear();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <SettingsIcon className="size-3.5" /> 내 정보 설정
        </Button>
      </SheetTrigger>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>내 정보 설정</SheetTitle>
          <SheetDescription>
            학습 목표 · 실제 시험 결과 · 데이터 활용 동의를 한 곳에서
            관리합니다. 각 항목은 따로 저장되며, 저장이 동의를 의미하지
            않습니다.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-6 px-4 pb-10">
          <GoalBlock goals={goals} examRound={round} />
          <ResultBlock currentYear={currentYear} defaultRound={round} />
          <section className="border-t pt-5">
            <ConsentSection
              myAnalysisConsentedAt={myAnalysisConsentAt}
              poolConsentedAt={poolConsentAt}
            />
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// 블록 1 — 학습 목표. /study/stats action(setNextExamPlan + upsertStudyGoals)로 독립 제출.
function GoalBlock({
  goals,
  examRound,
}: {
  goals: StudyGoals;
  examRound: "first" | "second";
}) {
  const fetcher = useFetcher<{ ok?: true } | { error?: string }>();
  const submitting = fetcher.state !== "idle";
  const errorMsg =
    fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;
  const saved =
    fetcher.data && "ok" in fetcher.data && fetcher.data.ok ? true : false;

  return (
    <section>
      <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
        학습 목표
      </p>
      <fetcher.Form method="post" action="/study/stats" className="space-y-3">
        <GoalFields goals={goals} examRound={examRound} />
        {errorMsg ? (
          <p className="text-sm text-rose-600" role="alert">
            {errorMsg}
          </p>
        ) : null}
        {saved ? (
          <p className="text-sm text-emerald-600" role="status">
            저장되었습니다.
          </p>
        ) : null}
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? "저장 중…" : "목표 저장"}
        </Button>
      </fetcher.Form>
    </section>
  );
}

// 블록 2 — 실제 시험 결과(빠른 입력). /me/exam-results action(upsert)으로 독립 제출.
// 전체 이력·합격증·검증은 전용 화면 링크로 분리.
function ResultBlock({
  currentYear,
  defaultRound,
}: {
  currentYear: number;
  defaultRound: "first" | "second";
}) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const submitting = fetcher.state !== "idle";
  const saved = fetcher.data?.ok ? true : false;

  return (
    <section className="border-t pt-5">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          실제 시험 결과
        </p>
        <Link to="/me/exam-results" className="text-link text-xs underline">
          전체 관리 →
        </Link>
      </div>
      <fetcher.Form
        method="post"
        action="/me/exam-results"
        className="space-y-2"
      >
        <ResultFields currentYear={currentYear} defaultRound={defaultRound} />
        {fetcher.data?.error ? (
          <p className="text-xs text-rose-600">{fetcher.data.error}</p>
        ) : null}
        {saved ? (
          <p className="text-xs text-emerald-600">저장되었습니다.</p>
        ) : null}
        <Button
          type="submit"
          size="sm"
          disabled={submitting}
          className="w-full"
        >
          {submitting ? "저장 중…" : "시험 결과 저장"}
        </Button>
      </fetcher.Form>
    </section>
  );
}
