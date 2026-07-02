// 객관식 풀이(정답 공개 후) 선지/박스 지문의 "정오문제 즐겨찾기".
// 조문·문제 즐겨찾기와 동일한 ♡ 5단계 + 단계별 메모(BookmarkStars)를 팝오버로 제공 —
// 별 개수로 학습지원 즐겨찾기(/study/bookmarks)에서 검색·정렬할 수 있다.
// 정오문제 패널과 같은 타깃(problem_choice/problem_box_item)이라 한 곳에서 매기면 양쪽 연동.
// 부적격 지문(eligible=false)은 비활성 + 학습 불가 안내.

import { HeartIcon } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/core/components/ui/popover";
import { cn } from "~/core/lib/utils";
import { BookmarkStars } from "~/features/annotations/components/bookmark-stars";
import type { BookmarkRecord } from "~/features/annotations/labels";

export function OxBookmarkToggle({
  refType,
  refId,
  initial,
  eligible,
}: {
  refType: "choice" | "box";
  refId: string;
  initial: BookmarkRecord | null;
  eligible: boolean;
}) {
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
  const level = initial?.starLevel ?? 0;
  const on = level >= 1;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-pressed={on}
          title="정오문제 즐겨찾기 — ♡ 5단계 + 단계별 메모. 정오문제 패널과 연동됩니다."
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors",
            on
              ? "border-rose-300/60 bg-rose-50 text-rose-600 dark:border-rose-700/40 dark:bg-rose-950/30 dark:text-rose-300"
              : "border-border text-muted-foreground hover:text-rose-500",
          )}
        >
          <HeartIcon className={cn("size-3.5", on && "fill-current")} />
          즐겨찾기
          {on ? <span className="tabular-nums">· {level}/5</span> : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <BookmarkStars
          targetType={targetType}
          targetId={refId}
          initial={initial}
        />
      </PopoverContent>
    </Popover>
  );
}
