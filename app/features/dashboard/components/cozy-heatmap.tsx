import { useMemo } from "react";

import { COZY_INK_SOFT, type CozyPalette } from "~/core/lib/cozy-tokens";

type DayPoint = { date: string; intensity: number };

type Props = {
  palette: CozyPalette;
  dense?: boolean;
  // 가장 오래된 → 오늘 순서. 길이 = WEEKS*7. 없으면 synthetic.
  days?: ReadonlyArray<DayPoint>;
};

const WEEKS = 12;
const DAYS = ["월", "화", "수", "목", "금", "토", "일"];

// dayOfWeek: 0=일 ~ 6=토. 한국은 월요일 시작이라 (d+6)%7 → 월=0..일=6.
function koreanDayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

export default function CozyHeatmap({ palette, dense = false, days }: Props) {
  const cell = dense ? 14 : 18;
  const gap = dense ? 4 : 5;

  // 12주 x 7일 = 84칸. days 가 있으면 사용 (date 별 intensity 0..1), 없으면 synthetic.
  const cells = useMemo(() => {
    if (days && days.length > 0) {
      // 가장 오래된 날짜의 요일에 맞춰 첫 주 앞쪽을 빈 칸으로 패딩.
      const first = new Date(days[0].date);
      const padFront = koreanDayIndex(first);
      const arr: Array<DayPoint | null> = Array(padFront).fill(null);
      arr.push(...days);
      // 끝쪽도 채워서 정확히 WEEKS*7 길이로 자름/패딩.
      while (arr.length < WEEKS * 7) arr.push(null);
      return arr.slice(0, WEEKS * 7);
    }
    // synthetic fallback (개발용).
    const arr: Array<DayPoint | null> = [];
    for (let w = 0; w < WEEKS; w++) {
      for (let d = 0; d < 7; d++) {
        const seed = (w * 7 + d) * 9301 + 49297;
        const r = (seed % 233280) / 233280;
        const recencyBoost = w / WEEKS;
        const v = Math.min(1, r * 0.7 + recencyBoost * 0.4);
        arr.push({ date: "", intensity: v });
      }
    }
    return arr;
  }, [days]);

  const tone = (v: number) => {
    if (v < 0.05) return "#F2EAE0";
    if (v < 0.25) return palette.soft;
    if (v < 0.5) return palette.accent + "aa";
    if (v < 0.75) return palette.accent;
    return palette.primary;
  };

  return (
    <div style={{ display: "flex", gap: 10 }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap,
          paddingTop: 2,
        }}
      >
        {DAYS.map((d) => (
          <div
            key={d}
            style={{
              height: cell,
              fontSize: 10,
              color: COZY_INK_SOFT,
              lineHeight: `${cell}px`,
            }}
          >
            {d}
          </div>
        ))}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${WEEKS}, ${cell}px)`,
          gridTemplateRows: `repeat(7, ${cell}px)`,
          gap,
          gridAutoFlow: "column",
        }}
      >
        {cells.map((c, i) => (
          <div
            key={i}
            title={
              c?.date
                ? `${c.date} · 학습 ${(c.intensity * 100).toFixed(0)}%`
                : undefined
            }
            style={{
              width: cell,
              height: cell,
              borderRadius: 4,
              background: c ? tone(c.intensity) : "transparent",
            }}
          />
        ))}
      </div>
    </div>
  );
}
