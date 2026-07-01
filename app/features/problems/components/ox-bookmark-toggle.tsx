// 객관식 풀이(정답 공개 후) 선지/박스 지문의 "정오문제 즐겨찾기" 컴팩트 하트.
// 정오문제 패널과 같은 타깃(problem_choice/problem_box_item)이라 한 곳에서 매기면 양쪽
// 연동. 정오문제 부적격 지문(isOxEligible=false)은 비활성 + 학습 불가 안내를 보여준다.

import { HeartIcon } from "lucide-react";
import { useFetcher } from "react-router";

import { cn } from "~/core/lib/utils";

export function OxBookmarkToggle({
  refType,
  refId,
  initialLevel,
  eligible,
}: {
  refType: "choice" | "box";
  refId: string;
  initialLevel: number;
  eligible: boolean;
}) {
  const fetcher = useFetcher();

  if (!eligible) {
    return (
      <span
        className="text-muted-foreground/60 inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-[11px]"
        title="정오문제로 학습할 수 없는 지문이라 즐겨찾기할 수 없습니다"
      >
        <HeartIcon className="size-3.5" />
        정오문제 학습 불가
      </span>
    );
  }

  const targetType =
    refType === "choice" ? "problem_choice" : "problem_box_item";

  // 낙관적 표시: 제출 중이면 그 값 우선(회전 revalidation 전에 즉시 반영).
  const submitted =
    fetcher.formData?.get("intent") === "rating"
      ? Number(fetcher.formData.get("starLevel"))
      : null;
  const level = submitted ?? initialLevel;
  const on = level >= 1;

  return (
    <fetcher.Form method="post" action="/api/annotations/bookmark">
      <input type="hidden" name="intent" value="rating" />
      <input type="hidden" name="targetType" value={targetType} />
      <input type="hidden" name="targetId" value={refId} />
      <input type="hidden" name="starLevel" value={on ? "0" : "1"} />
      <button
        type="submit"
        disabled={fetcher.state !== "idle"}
        aria-pressed={on}
        title={
          on
            ? "정오문제 즐겨찾기 해제 (정오문제 패널과 연동)"
            : "정오문제 즐겨찾기 — 정오문제 패널에도 함께 표시됩니다"
        }
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors disabled:opacity-50",
          on
            ? "border-rose-300/60 bg-rose-50 text-rose-600 dark:border-rose-700/40 dark:bg-rose-950/30 dark:text-rose-300"
            : "border-border text-muted-foreground hover:text-rose-500",
        )}
      >
        <HeartIcon className={cn("size-3.5", on && "fill-current")} />
        즐겨찾기
      </button>
    </fetcher.Form>
  );
}
