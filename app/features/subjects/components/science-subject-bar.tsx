// 자연과학 과목 토글 바 — 물/화/생/지 를 화면 상단에 고정(sticky).
// 허브·문제 뷰어·퀴즈 설정 어디서든 과목을 바로 바꿀 수 있다.
// progress 를 주면(허브) 탭에 진척 링·% 를 내장 — "4과목 고르게" 균형 계기판.

import { Link } from "react-router";

import { cn } from "~/core/lib/utils";
import {
  SCIENCE_SUBJECT_SLUGS,
  SCIENCE_SUBJECTS,
  type ScienceSubjectSlug,
  scienceSubjectPath,
} from "~/features/subjects/lib/science";

// 탭 진척 미니 링 — currentColor 로 활성/비활성 톤을 그대로 따른다.
function TabProgressRing({ pct }: { pct: number }) {
  const r = 5.5;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 14 14" className="size-3.5 -rotate-90" aria-hidden="true">
      <circle
        cx="7"
        cy="7"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="2.5"
      />
      {pct > 0 ? (
        <circle
          cx="7"
          cy="7"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={`${(c * pct) / 100} ${c}`}
        />
      ) : null}
    </svg>
  );
}

export function ScienceSubjectBar({
  active,
  progress = null,
  preventScrollReset = false,
}: {
  active: ScienceSubjectSlug;
  /** 과목별 진척(허브용) — 있으면 탭에 링·% 표시. */
  progress?:
    | { slug: ScienceSubjectSlug; attempted: number; total: number }[]
    | null;
  /** 같은 화면 내 탭 교체(허브 ?subject=)일 때만 true — 스크롤 유지. */
  preventScrollReset?: boolean;
}) {
  return (
    <div
      // 상위 subjects.layout 의 학습과목 AreaTabs(sticky, 높이 49px = py-2 + 32px
      // 항목 + border 1px) 바로 아래에 붙인다. md+ 는 navbar 만큼 더 내림.
      className="border-border bg-background/95 sticky top-[49px] z-10 border-b backdrop-blur-lg md:top-[calc(var(--area-sticky-top,0px)+49px)]"
    >
      <div className="mx-auto flex w-full max-w-screen-lg items-center gap-2 px-5 py-2 md:px-10">
        <p className="text-link mr-1 hidden shrink-0 font-mono text-[10px] font-bold tracking-widest uppercase sm:block">
          자연과학
        </p>
        <div className="-mx-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-1">
          {SCIENCE_SUBJECT_SLUGS.map((slug) => {
            const isActive = slug === active;
            const prog = progress?.find((p) => p.slug === slug);
            const pct =
              prog && prog.total > 0
                ? Math.round((prog.attempted / prog.total) * 100)
                : null;
            return (
              <Link
                key={slug}
                to={`/subjects/science?subject=${scienceSubjectPath(slug)}`}
                preventScrollReset={preventScrollReset}
                viewTransition
                aria-current={isActive ? "page" : undefined}
                title={
                  prog && prog.total > 0
                    ? `내 풀이 ${prog.attempted}/${prog.total}`
                    : undefined
                }
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] font-semibold transition-colors",
                  isActive
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-border bg-card hover:border-primary hover:text-link",
                )}
              >
                {pct != null ? <TabProgressRing pct={pct} /> : null}
                {SCIENCE_SUBJECTS[slug].name}
                {pct != null ? (
                  <span
                    className={cn(
                      "font-mono text-[10px] tabular-nums",
                      isActive
                        ? "text-primary-foreground/80"
                        : "text-muted-foreground",
                    )}
                  >
                    {pct}%
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
