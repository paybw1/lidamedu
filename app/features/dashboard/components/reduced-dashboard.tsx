// feat-8-008 — 대시보드 축소판. 회원1·2(area_study_mgmt 없음)는 전체 분석 대신 이 화면을 본다.
// 학습관리(합격 진단·진도·통계·과제·합격자 비교 등)는 종합반(회원3)·staff 전용.
import { Link } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Card, CardContent } from "~/core/components/ui/card";
import { InstructorAccessNotice } from "~/features/dashboard/components/instructor-access-notice";

const PLAN_LABEL: Record<string, string> = {
  free: "무료",
  pro_monthly: "정회원",
  cohort: "종합반",
};

export type ReducedTrialState =
  | { phase: "active"; daysLeft: number }
  | { phase: "ended" }
  | null;

export function ReducedDashboard({
  name,
  planCode,
  isCohortMember,
  trialState,
}: {
  name: string;
  planCode: string;
  isCohortMember: boolean;
  /** 체험 상태 — active=체험 중(특허법 무료), ended=종료(미구독 시 학습정보·커뮤니티만). */
  trialState?: ReducedTrialState;
}) {
  const planLabel = PLAN_LABEL[planCode] ?? planCode;
  const isPaid = planCode === "pro_monthly";
  return (
    <div className="bg-background min-h-[calc(100vh-56px)]">
      <div className="mx-auto w-full max-w-screen-md px-5 py-10 md:px-8 md:py-14">
        <h1 className="text-2xl font-bold tracking-tight">
          안녕하세요, {name}님 ☕
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          현재 플랜: <strong>{planLabel}</strong>
        </p>

        {/* feat-7-040 — 강사 열람 투명성 고지(약관 제7조 ⑤). 지도형 과정 멤버에게만. */}
        {isCohortMember ? (
          <div className="mt-6">
            <InstructorAccessNotice />
          </div>
        ) : null}

        {trialState?.phase === "active" ? (
          // 체험 중 — 15일 특허법 무료체험. 종료 후엔 미구독 시 학습정보·커뮤니티만.
          <Card className="mt-6 border-emerald-300/60 bg-emerald-50/40 dark:border-emerald-700/50 dark:bg-emerald-950/20">
            <CardContent className="space-y-3 px-5 py-5 text-sm leading-relaxed">
              <p>
                🎁{" "}
                <strong className="tabular-nums">
                  무료 체험 D-{trialState.daysLeft}
                </strong>{" "}
                · 지금은 <strong>특허법 학습과목</strong>(조문·판례·문제)을 15일간
                무료로 이용할 수 있습니다.
              </p>
              <p className="text-muted-foreground text-xs">
                체험이 종료되면 구독하지 않을 경우 <strong>학습정보 · 커뮤니티</strong>만
                이용할 수 있습니다. 계속 학습하려면 구독해 주세요.
              </p>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button asChild>
                  <Link to="/subjects/patent">특허법 학습 시작</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/pricing">요금제 보기</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/latest/laws">법 개정</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/latest/cases">최근 판례</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : trialState?.phase === "ended" ? (
          // 체험 종료 — 미구독 시 학습정보·커뮤니티만. 학습과목은 구독해야 이용.
          <Card className="mt-6 border-amber-300/60 bg-amber-50/30 dark:border-amber-700/50 dark:bg-amber-950/20">
            <CardContent className="space-y-3 px-5 py-5 text-sm leading-relaxed">
              <p>
                🔒 <strong>15일 특허법 무료 체험이 종료되었습니다.</strong>{" "}
                구독하지 않으면 <strong>학습정보 · 커뮤니티</strong>만 이용할 수
                있습니다.
              </p>
              <p className="text-muted-foreground text-xs">
                특허법 등 학습과목(조문·판례·문제)을 계속 이용하려면 구독이
                필요합니다. 학습 기록은 그대로 보관되어 구독 시 이어서 학습할 수
                있습니다.
              </p>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button asChild>
                  <Link to="/pricing">구독하기</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/community">커뮤니티</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/latest/laws">법 개정</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/latest/cases">최근 판례</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          // 그 외(유료 개별 과목 구독 등, 학습관리 권한 없음) — 기존 안내.
          <Card className="mt-6 border-amber-300/60 bg-amber-50/30 dark:border-amber-700/50 dark:bg-amber-950/20">
            <CardContent className="space-y-3 px-5 py-5 text-sm leading-relaxed">
              <p>
                🔒 합격 예측 점수·학습 통계·약점 분석·합격자 비교·과제 등{" "}
                <strong>학습관리 분석</strong>은 <strong>종합반</strong>에서
                이용할 수 있습니다.
              </p>
              <p className="text-muted-foreground text-xs">
                ※ 합격자 비교는 실제 합격자 데이터가 일정 수 이상 쌓이면
                활성화됩니다.
              </p>
              <p className="text-muted-foreground">
                상단 메뉴에서 현재 이용 가능한 영역으로 바로 진입할 수 있습니다 —{" "}
                <strong>
                  학습정보 · 커뮤니티
                  {isPaid ? " · 학습과목 · 학습노트" : ""}
                </strong>
                .
              </p>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button asChild>
                  <Link to="/pricing">요금제 보기</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/latest/laws">법 개정</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/latest/cases">최근 판례</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/community">커뮤니티</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
