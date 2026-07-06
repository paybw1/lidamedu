// feat-8-027 — 체험(가입 15일) 안내 배너. 체험 시작일부터 상시 노출(사전공지),
// 만료 임박(D-3 이내)이면 경고 톤으로 강조. 학습과목=특허법만 무료임을 안내.
import { SparklesIcon, TriangleAlertIcon } from "lucide-react";
import { Link } from "react-router";

import { cn } from "~/core/lib/utils";

// 만료 임박 경고 임계값 — trial.server.ts TRIAL_EXPIRY_NOTICE_DAYS 와 동일(인박스 공지와 정합).
const URGENT_DAYS = 3;

export function TrialNoticeBanner({
  daysLeft,
  ended = false,
}: {
  daysLeft: number;
  /** 체험 종료 후 전환 넛지 변형 — 종료 후 7일간 노출(대시보드 로더가 판정). */
  ended?: boolean;
}) {
  const urgent = ended || daysLeft <= URGENT_DAYS;
  return (
    <div
      className={cn(
        "mb-6 flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-xl border px-4 py-3 text-sm",
        urgent
          ? "border-amber-300 bg-amber-50/70 text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-200"
          : "border-primary/30 bg-primary/[0.05] text-foreground",
      )}
      data-testid="trial-notice"
    >
      {urgent ? (
        <TriangleAlertIcon className="size-4 shrink-0" />
      ) : (
        <SparklesIcon className="text-link size-4 shrink-0" />
      )}
      <span className="min-w-0">
        {ended ? (
          <>
            <strong>무료 체험이 종료되었습니다</strong> · 학습 기록은 그대로
            보관 중입니다. 구독을 시작하면 이어서 학습할 수 있습니다.
          </>
        ) : (
          <>
            <strong className="tabular-nums">무료 체험 D-{daysLeft}</strong> ·{" "}
            {urgent
              ? "곧 학습과목(조문·판례·문제)이 잠기고 무료회원으로 전환됩니다. 계속 학습하려면 구독해 주세요."
              : "특허법 학습과목을 무료로 이용 중입니다. 다른 과목과 전체 기능은 구독 시 열립니다."}
          </>
        )}
      </span>
      <Link
        to="/pricing"
        className="ml-auto shrink-0 rounded-md border border-current px-3 py-1 text-xs font-semibold transition-opacity hover:opacity-80"
      >
        요금제 보기
      </Link>
    </div>
  );
}
