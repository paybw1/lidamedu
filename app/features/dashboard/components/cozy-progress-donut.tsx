// 도넛 진척도 — SVG stroke-dasharray. 별도 라이브러리 없음.

import { COZY_INK_SOFT, type CozyPalette } from "~/core/lib/cozy-tokens";

type Props = {
  label: string;
  current: number;
  total: number;
  pct: number;
  unit: string;
  palette: CozyPalette;
  // 고유 testid (E2E 식별용).
  testId?: string;
};

const SIZE = 120;
const STROKE = 14;
const RADIUS = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * RADIUS;

export default function CozyProgressDonut({
  label,
  current,
  total,
  pct,
  unit,
  palette,
  testId,
}: Props) {
  const dash = (Math.min(100, Math.max(0, pct)) / 100) * CIRC;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
      }}
      data-testid={testId}
    >
      <div style={{ position: "relative", width: SIZE, height: SIZE }}>
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          style={{ display: "block", transform: "rotate(-90deg)" }}
        >
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke={palette.tint}
            strokeWidth={STROKE}
            fill="none"
          />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke={palette.primary}
            strokeWidth={STROKE}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${dash} ${CIRC - dash}`}
            style={{ transition: "stroke-dasharray 250ms" }}
          />
        </svg>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            style={{
              fontSize: 22,
              fontWeight: 700,
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "-0.02em",
            }}
          >
            {pct}
            <span style={{ fontSize: 12, fontWeight: 500 }}>%</span>
          </span>
        </div>
      </div>
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.02em",
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: 10.5,
            color: COZY_INK_SOFT,
            fontVariantNumeric: "tabular-nums",
            marginTop: 2,
          }}
        >
          {current.toLocaleString("ko-KR")} / {total.toLocaleString("ko-KR")} {unit}
        </div>
      </div>
    </div>
  );
}
