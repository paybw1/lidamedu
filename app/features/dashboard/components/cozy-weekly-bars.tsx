import { COZY_INK_SOFT, type CozyPalette } from "~/core/lib/cozy-tokens";

type WeekDay = { d: string; h: number; today: boolean };

type Props = {
  palette: CozyPalette;
  dense?: boolean;
  // 월~일 7일치 (시간 단위, 0 가능). 없으면 synthetic.
  days?: ReadonlyArray<WeekDay>;
  weeklyGoalHours?: number;
};

const FALLBACK_DAYS: WeekDay[] = [
  { d: "월", h: 3.2, today: false },
  { d: "화", h: 4.1, today: false },
  { d: "수", h: 2.6, today: false },
  { d: "목", h: 3.8, today: false },
  { d: "금", h: 4.5, today: false },
  { d: "토", h: 1.4, today: true },
  { d: "일", h: 0, today: false },
];

export default function CozyWeeklyBars({
  palette,
  dense = false,
  days,
  weeklyGoalHours = 25,
}: Props) {
  const items = days ?? FALLBACK_DAYS;
  const total = items.reduce((s, d) => s + d.h, 0);
  // 최대 막대 높이 — 가장 긴 날 기준 (최소 5h 보장 → 짧은 막대도 보이도록).
  const max = Math.max(5, ...items.map((d) => d.h));

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 6,
          marginBottom: 12,
        }}
      >
        <span
          style={{
            fontSize: 26,
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "-0.02em",
          }}
          data-testid="weekly-total-hours"
        >
          {total.toFixed(1)}h
        </span>
        <span style={{ fontSize: 11, color: COZY_INK_SOFT }}>
          / {weeklyGoalHours}h
        </span>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: dense ? 6 : 10,
          height: dense ? 90 : 110,
        }}
      >
        {items.map((d, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
              height: "100%",
            }}
          >
            <div
              style={{
                flex: 1,
                width: "100%",
                display: "flex",
                alignItems: "flex-end",
              }}
            >
              <div
                style={{
                  width: "100%",
                  height: `${(d.h / max) * 100}%`,
                  minHeight: d.h > 0 ? 4 : 0,
                  borderRadius: 5,
                  background: d.today
                    ? `repeating-linear-gradient(45deg, ${palette.accent} 0 4px, ${palette.primary} 4px 8px)`
                    : d.h === 0
                      ? palette.tint
                      : `linear-gradient(180deg, ${palette.accent}, ${palette.primary})`,
                }}
              />
            </div>
            <span
              style={{
                fontSize: 10.5,
                color: d.today ? palette.primary : COZY_INK_SOFT,
                fontWeight: d.today ? 700 : 500,
              }}
            >
              {d.d}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
