import { useMemo } from "react";

import { COZY_INK_SOFT, type CozyPalette } from "~/core/lib/cozy-tokens";

type Props = {
  palette: CozyPalette;
  dense?: boolean;
};

const WEEKS = 12;
const DAYS = ["월", "화", "수", "목", "금", "토", "일"];

export default function CozyHeatmap({ palette, dense = false }: Props) {
  const cell = dense ? 14 : 18;
  const gap = dense ? 4 : 5;

  const data = useMemo(() => {
    const arr: number[] = [];
    for (let w = 0; w < WEEKS; w++) {
      for (let d = 0; d < 7; d++) {
        const seed = (w * 7 + d) * 9301 + 49297;
        const r = (seed % 233280) / 233280;
        const recencyBoost = w / WEEKS;
        const v = Math.min(1, r * 0.7 + recencyBoost * 0.4);
        arr.push(v);
      }
    }
    arr[arr.length - 1] = 0;
    arr[arr.length - 2] = 0;
    arr[arr.length - 3] = 0;
    return arr;
  }, []);

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
        {data.map((v, i) => (
          <div
            key={i}
            style={{
              width: cell,
              height: cell,
              borderRadius: 4,
              background: tone(v),
            }}
          />
        ))}
      </div>
    </div>
  );
}
