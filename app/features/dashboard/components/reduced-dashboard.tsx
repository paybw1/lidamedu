// feat-8-008 — 대시보드 축소판. 회원1·2(area_study_mgmt 없음)는 전체 분석 대신 이 화면을 본다.
// 학습관리(합격 진단·진도·통계·과제·합격자 비교 등)는 종합반(회원3)·staff 전용.

import { Link } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Card, CardContent } from "~/core/components/ui/card";

const PLAN_LABEL: Record<string, string> = {
  free: "무료",
  pro_monthly: "정회원",
  cohort: "종합반",
};

export function ReducedDashboard({
  name,
  planCode,
}: {
  name: string;
  planCode: string;
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

        <Card className="mt-6 border-amber-300/60 bg-amber-50/30 dark:border-amber-700/50 dark:bg-amber-950/20">
          <CardContent className="space-y-3 px-5 py-5 text-sm leading-relaxed">
            <p>
              🔒 합격 진단 점수·학습 통계·약점 분석·합격자 비교·과제 등{" "}
              <strong>학습관리 분석</strong>은{" "}
              <strong>종합반</strong>에서 이용할 수 있습니다.
            </p>
            <p className="text-muted-foreground">
              상단 메뉴에서 현재 이용 가능한 영역으로 바로 진입할 수 있습니다 —{" "}
              <strong>
                학습정보 · 커뮤니티
                {isPaid ? " · 학습과목 · 학습보조" : ""}
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
      </div>
    </div>
  );
}
