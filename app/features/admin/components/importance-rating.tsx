// feat-8-025 — 운영자·강사용 중요도 별점 에디터.
// 오른쪽 패널 "즐겨찾기" 자리에 staff 에게만 노출. 별점이 곧 콘텐츠 importance.

import { StarIcon } from "lucide-react";
import { useFetcher } from "react-router";

import { cn } from "~/core/lib/utils";

type ImportanceTarget = "case" | "article" | "problem";

export function ImportanceRating({
  targetType,
  targetId,
  importance,
}: {
  targetType: ImportanceTarget;
  targetId: string;
  importance: number;
}) {
  const fetcher = useFetcher<{
    ok: boolean;
    error?: string;
    importance?: number;
  }>();
  // 판례 importance 는 최소 1(NOT NULL·CHECK 1~3), 조문·문제는 0 까지.
  const min = targetType === "case" ? 1 : 0;

  // 제출 중 낙관적 값 — fetcher.formData 가 사라질 때(=action 완료·revalidate)까지 유지.
  const submitting =
    fetcher.formData != null
      ? Number(fetcher.formData.get("importance"))
      : null;
  const current = submitting ?? importance;
  const isSubmitting = fetcher.state !== "idle";
  const error =
    fetcher.data && fetcher.data.ok === false ? fetcher.data.error : null;
  const label =
    targetType === "case" ? "판례" : targetType === "problem" ? "문제" : "조문";

  const setLevel = (level: number) => {
    // 현재 값과 같은 별 클릭 → 한 단계 내림(min 까지).
    const next = current === level ? Math.max(min, level - 1) : level;
    if (next === current) return;
    const fd = new FormData();
    fd.set("targetType", targetType);
    fd.set("targetId", targetId);
    fd.set("importance", String(next));
    fetcher.submit(fd, { method: "post", action: "/api/admin/importance" });
  };

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-xs leading-relaxed">
        운영자·강사 전용 — 별을 눌러 이 {label}의 중요도를 정합니다. 학생 화면의
        ★ 표시에 반영됩니다.
      </p>
      <div className="flex items-center gap-1">
        {[1, 2, 3].map((level) => (
          <button
            key={level}
            type="button"
            onClick={() => setLevel(level)}
            disabled={isSubmitting}
            aria-label={`중요도 ${level}단계`}
            aria-pressed={current >= level}
            className={cn(
              "transition-transform disabled:opacity-50",
              current >= level
                ? "text-amber-500 hover:scale-110"
                : "text-muted-foreground hover:text-amber-400",
            )}
          >
            <StarIcon
              className={cn("size-6", current >= level && "fill-current")}
            />
          </button>
        ))}
        <span className="text-muted-foreground ml-2 text-xs tabular-nums">
          중요도 {current} / 3
        </span>
      </div>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}
