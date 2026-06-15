// 별점 단계 칩 필터 — 판례·문제 색인 공용.
// 두 종류: bookmark(❤ 수험생 즐겨찾기, 1~5) / importance(★ 강사 체크 중요도, 1~3).
// 조문 트리(article-tree)의 칩 UX 와 동일. 서버 필터라 각 단계는 URL 파라미터를 세팅하는
// 링크다(나머지 쿼리 보존). 라벨: 0=전체, 최상위=숫자만, 그 외=N+.
import { HeartIcon, StarIcon } from "lucide-react";
import { Link, useSearchParams } from "react-router";

import { cn } from "~/core/lib/utils";

type LevelFilterKind = "bookmark" | "importance";

const CONFIG: Record<
  LevelFilterKind,
  {
    label: string;
    max: number;
    Icon: typeof HeartIcon;
    iconClass: string;
    activeClass: string;
  }
> = {
  bookmark: {
    label: "즐겨찾기",
    max: 5,
    Icon: HeartIcon,
    iconClass: "fill-rose-500 stroke-rose-500",
    activeClass: "border-rose-500 bg-rose-500 text-white",
  },
  importance: {
    label: "중요도",
    max: 3,
    Icon: StarIcon,
    iconClass: "fill-amber-400 stroke-amber-400",
    activeClass: "border-amber-500 bg-amber-500 text-white",
  },
};

export function LevelChipFilter({
  kind,
  paramName,
  value,
}: {
  kind: LevelFilterKind;
  /** URL 파라미터명 — 예: "case_bookmarked" / "p_importance". */
  paramName: string;
  /** 현재 적용된 최소 단계 (0=전체). */
  value: number;
}) {
  const cfg = CONFIG[kind];
  const [searchParams] = useSearchParams();
  const levels = Array.from({ length: cfg.max + 1 }, (_, i) => i); // 0..max
  const labelFor = (level: number) =>
    level === 0 ? "전체" : level === cfg.max ? String(level) : `${level}+`;
  const hrefFor = (level: number) => {
    const sp = new URLSearchParams(searchParams);
    if (level === 0) sp.delete(paramName);
    else sp.set(paramName, String(level));
    return `?${sp.toString()}`;
  };

  return (
    <div className="flex flex-nowrap items-center gap-0.5">
      <span className="text-muted-foreground mr-0.5 inline-flex shrink-0 items-center gap-0.5 text-[10px] font-medium tracking-wide uppercase">
        <cfg.Icon className={cn("size-3", cfg.iconClass)} /> {cfg.label}
      </span>
      {levels.map((level) => (
        <Link
          key={level}
          to={hrefFor(level)}
          preventScrollReset
          aria-current={value === level ? "true" : undefined}
          className={cn(
            "rounded-md border px-1 py-0.5 text-[11px] tabular-nums transition-colors",
            value === level
              ? cfg.activeClass
              : "bg-background hover:bg-accent text-muted-foreground border-input",
          )}
        >
          {labelFor(level)}
        </Link>
      ))}
    </div>
  );
}
