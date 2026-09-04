// 도해 본문 글자 렌더 — 굵게 구간. 팝업(읽기)과 빈칸 모드가 함께 쓴다.
//
// ★텍스트 노드를 쪼개도 컨테이너의 textContent 는 그대로라 하이라이트 오프셋이 보존된다
//   (공백을 새로 넣지 않는 것이 조건).

import { type ReactNode } from "react";

/** 굵게 구간(boldRanges)을 글자 오프셋에 맞춰 입힌다. */
export function BoldSpans({
  text,
  ranges,
}: {
  text: string;
  ranges?: [number, number][];
}) {
  if (!ranges?.length) return <>{text}</>;
  const out: ReactNode[] = [];
  let at = 0;
  ranges
    .slice()
    .sort((a, b) => a[0] - b[0])
    .forEach(([s, e], i) => {
      const from = Math.max(at, s);
      const to = Math.min(text.length, e);
      if (to <= from) return;
      if (from > at) out.push(text.slice(at, from));
      out.push(
        <strong key={i} className="font-semibold">
          {text.slice(from, to)}
        </strong>,
      );
      at = to;
    });
  if (at < text.length) out.push(text.slice(at));
  return <>{out}</>;
}

/** 구간 목록을 `[lo, hi)` 안으로 잘라 그 안 좌표로 옮긴다. */
export function shiftRanges(
  ranges: [number, number][] | undefined,
  lo: number,
  hi: number,
): [number, number][] {
  return (ranges ?? [])
    .map(([s, e]) => [Math.max(s, lo) - lo, Math.min(e, hi) - lo] as [number, number])
    .filter(([s, e]) => e > s);
}
