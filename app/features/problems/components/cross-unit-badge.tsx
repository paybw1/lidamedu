import { LayersIcon } from "lucide-react";

import { cn } from "~/core/lib/utils";

/**
 * "종합" 배지 — 해당 단원 밖의 내용을 담은 지문임을 알린다.
 *
 * 교재 원본은 이 지문들을 기울임체로 조판하지만, 화면에서는 기울임체가 읽기 불편하다는
 * 의견이 있어(원장 전달 2026-08-21) 글자 모양은 그대로 두고 배지로만 구분한다.
 * ★지문 본문 안에 넣지 않는다 — 하이라이트(HighlightOverlay)가 배지 글자까지 세어
 *   오프셋이 어긋난다. 문장 끝에 이어 붙이되 본문 컨테이너 밖의 형제로 둔다.
 */
export function CrossUnitBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
        "ml-1.5 inline-flex w-fit items-center gap-1 rounded-md border px-1.5 py-0.5 align-middle",
        "text-[11px] leading-none font-semibold tracking-[-0.01em]",
        className,
      )}
      title="종합 지문 — 다른 단원의 내용을 포함해, 이 단원만 학습해서는 판단하기 어려울 수 있습니다."
    >
      <LayersIcon className="size-3" aria-hidden />
      종합
    </span>
  );
}
