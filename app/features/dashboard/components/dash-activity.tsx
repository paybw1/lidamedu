// ACTIVITY 그룹 — 학습 히트맵 · 이번 주 학습량 막대.

import { BLUE_SCALE, Card, Eyebrow, Sub, T, useInView } from "~/features/dashboard/lib/dash";

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

// ── 학습 히트맵 ─────────────────────────────────────────────────────────────

export interface HeatmapDay {
  date: string;
  level: number; // 0-4
}

export function HeatmapCard({
  days,
  activeDays,
  avgHours,
}: {
  days: ReadonlyArray<HeatmapDay>;
  activeDays: number;
  avgHours: number;
}) {
  const [ref, inView] = useInView<HTMLDivElement>(0.2);
  const firstWd = days.length > 0 ? weekdayOf(days[0].date) : 0;
  const totalSlots = firstWd + days.length;
  const weekCount = Math.ceil(totalSlots / 7);

  return (
    <Card padding={20}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <Eyebrow>학습 히트맵</Eyebrow>
        <Sub style={{ font: "500 11px/1 Pretendard, sans-serif" }}>
          최근 {weekCount}주
        </Sub>
      </div>
      <div
        ref={ref}
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateRows: "repeat(7, 1fr)",
            font: "500 9px/1 Pretendard, sans-serif",
            color: T.inkMute,
            rowGap: 3,
            alignItems: "center",
          }}
        >
          {WEEKDAY_LABELS.map((d) => (
            <span key={d} style={{ height: 14, lineHeight: "14px" }}>
              {d}
            </span>
          ))}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${weekCount}, 1fr)`,
            gridTemplateRows: "repeat(7, 1fr)",
            gap: 3,
          }}
        >
          {days.map((d, i) => {
            const slot = firstWd + i;
            const col = Math.floor(slot / 7);
            const row = slot % 7;
            const delay = (col + row) * 16;
            return (
              <div
                key={d.date}
                title={`${d.date}`}
                style={{
                  gridColumn: col + 1,
                  gridRow: row + 1,
                  aspectRatio: "1",
                  borderRadius: 3,
                  minHeight: 12,
                  background: inView
                    ? BLUE_SCALE[Math.max(0, Math.min(4, d.level))]
                    : BLUE_SCALE[0],
                  transition: `background 280ms ${T.ease} ${delay}ms`,
                }}
              />
            );
          })}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            font: "500 11px/1 Pretendard, sans-serif",
            color: T.inkSoft,
          }}
        >
          <span>적음</span>
          <span style={{ display: "flex", gap: 2 }}>
            {BLUE_SCALE.map((c, i) => (
              <span
                key={i}
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: c,
                }}
              />
            ))}
          </span>
          <span>많음</span>
        </div>
        <Sub
          style={{
            font: "500 11px/1.4 Pretendard, sans-serif",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          활동 <strong style={{ color: T.ink }}>{activeDays}일</strong> · 일평균{" "}
          <strong style={{ color: T.ink }}>{avgHours.toFixed(1)}h</strong>
        </Sub>
      </div>
    </Card>
  );
}

// ── 이번 주 학습량 ──────────────────────────────────────────────────────────

export interface WeekBar {
  label: string;
  hours: number;
  today: boolean;
}

export function WeekBarsCard({ bars }: { bars: ReadonlyArray<WeekBar> }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const max = Math.max(...bars.map((b) => b.hours), 1);
  return (
    <Card padding={20}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <Eyebrow>이번 주 학습량</Eyebrow>
        <Sub style={{ font: "500 11px/1 Pretendard, sans-serif" }}>일별 시간</Sub>
      </div>
      <div
        ref={ref}
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${bars.length}, 1fr)`,
          gap: 8,
          height: 140,
          alignItems: "end",
        }}
      >
        {bars.map((b, i) => {
          const h = inView ? (b.hours / max) * 100 : 0;
          return (
            <div
              key={b.label + i}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
              }}
            >
              <div
                style={{
                  flex: 1,
                  width: "100%",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "flex-end",
                }}
              >
                <div
                  style={{
                    height: `${h}%`,
                    minHeight: b.hours > 0 ? 4 : 0,
                    background: b.today ? T.blue : T.blueDeep,
                    opacity: b.today ? 1 : 0.55,
                    borderRadius: "6px 6px 2px 2px",
                    transition: `height 800ms ${T.ease} ${i * 60}ms`,
                    position: "relative",
                  }}
                >
                  {b.today ? (
                    <span
                      style={{
                        position: "absolute",
                        top: -22,
                        left: "50%",
                        transform: "translateX(-50%)",
                        font: "700 11px/1 Pretendard, sans-serif",
                        color: T.blue,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {b.hours.toFixed(1)}h
                    </span>
                  ) : null}
                </div>
              </div>
              <span
                style={{
                  font: `${b.today ? 700 : 500} 11px/1 Pretendard, sans-serif`,
                  color: b.today ? T.blue : T.inkSoft,
                }}
              >
                {b.label}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
