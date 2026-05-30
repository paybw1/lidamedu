// feat-2-013 학습 활동 히트맵 — 클라이언트 컴포넌트.
// GitHub 잔디 스타일 SVG (52주 × 7요일) + 요일/시간대 막대.

import { cn } from "~/core/lib/utils";
import type {
  ActivityHeatmapData,
  HeatmapCell,
} from "~/features/study/activity-heatmap.server";

const DOW_LABEL = ["일", "월", "화", "수", "목", "금", "토"];

function intensityClass(count: number, max: number): string {
  if (count === 0) return "fill-muted";
  if (max <= 0) return "fill-emerald-300";
  const ratio = count / max;
  if (ratio >= 0.75) return "fill-emerald-700 dark:fill-emerald-500";
  if (ratio >= 0.5) return "fill-emerald-500 dark:fill-emerald-400";
  if (ratio >= 0.25) return "fill-emerald-400 dark:fill-emerald-600";
  return "fill-emerald-200 dark:fill-emerald-800";
}

export function ActivityHeatmap({ data }: { data: ActivityHeatmapData }) {
  // 365일 cells 를 53주 × 7요일 그리드로 — 가장 왼쪽 = 가장 오래된 일요일.
  // cells[0] 이 가장 오래된 날. dow(KST) 에 맞춰 grid x/y 계산.
  const cellSize = 11;
  const cellGap = 2;
  const stride = cellSize + cellGap;
  // 첫 셀의 요일 offset.
  const firstDate = new Date(data.cells[0]?.date + "T00:00:00Z");
  const firstDow = firstDate.getUTCDay();
  const totalCells = data.cells.length;
  const weeks = Math.ceil((firstDow + totalCells) / 7);
  const svgWidth = weeks * stride;
  const svgHeight = 7 * stride;

  return (
    <div className="space-y-5">
      {/* KPI / Insights */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <InsightTile
          label={`최근 ${data.daysBack}일 이벤트`}
          value={data.totalEvents.toLocaleString("ko-KR")}
        />
        <InsightTile
          label="활동한 날"
          value={`${data.activeDays}일`}
          hint={`${Math.round((data.activeDays / data.daysBack) * 100)}%`}
        />
        <InsightTile
          label="가장 활동 많은 요일"
          value={
            data.topDow
              ? `${DOW_LABEL[data.topDow.dow]} · ${data.topDow.totalCount.toLocaleString("ko-KR")}`
              : "—"
          }
          hint={
            data.topDow?.accuracyPct != null
              ? `정답률 ${data.topDow.accuracyPct}%`
              : undefined
          }
        />
        <InsightTile
          label="가장 활동 많은 시간"
          value={
            data.topHour
              ? `${pad(data.topHour.hour)}시 · ${data.topHour.totalCount.toLocaleString("ko-KR")}`
              : "—"
          }
          hint={
            data.topHour?.accuracyPct != null
              ? `정답률 ${data.topHour.accuracyPct}%`
              : undefined
          }
        />
      </div>

      {/* 히트맵 */}
      <div className="overflow-x-auto">
        <div className="min-w-max">
          <svg
            width={svgWidth}
            height={svgHeight}
            role="img"
            aria-label={`최근 ${data.daysBack}일 학습 활동 히트맵`}
          >
            {data.cells.map((c, i) => {
              const idx = firstDow + i;
              const x = Math.floor(idx / 7) * stride;
              const y = (idx % 7) * stride;
              return (
                <rect
                  key={c.date}
                  x={x}
                  y={y}
                  width={cellSize}
                  height={cellSize}
                  rx={2}
                  className={intensityClass(c.count, data.maxDayCount)}
                >
                  <title>
                    {c.date} · {c.count}회
                  </title>
                </rect>
              );
            })}
          </svg>
        </div>
      </div>

      {/* 범례 */}
      <div className="text-muted-foreground flex items-center gap-2 text-[10px]">
        <span>적음</span>
        {[0, 0.2, 0.4, 0.7, 1].map((r) => (
          <span
            key={r}
            className={cn(
              "inline-block size-2.5 rounded-sm",
              intensityClass(Math.ceil(r * data.maxDayCount), data.maxDayCount)
                .replace("fill-", "bg-"),
            )}
          />
        ))}
        <span>많음</span>
      </div>

      {/* 요일별 / 시간대별 막대 */}
      <div className="grid gap-5 lg:grid-cols-2">
        <DowBars data={data} />
        <HourBars data={data} />
      </div>
    </div>
  );
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function InsightTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="border-border bg-card rounded-xl border p-3.5 shadow-sm">
      <p className="text-muted-foreground font-mono text-[10px] font-bold tracking-[0.06em] uppercase">
        {label}
      </p>
      <p className="text-foreground mt-1.5 text-base font-extrabold tracking-tight tabular-nums">
        {value}
      </p>
      {hint ? (
        <p className="text-muted-foreground mt-0.5 text-[10px]">{hint}</p>
      ) : null}
    </div>
  );
}

function DowBars({ data }: { data: ActivityHeatmapData }) {
  const max = data.byDow.reduce((m, b) => Math.max(m, b.totalCount), 0) || 1;
  return (
    <div>
      <p className="text-muted-foreground mb-2 font-mono text-[11px] font-bold tracking-[0.06em] uppercase">
        요일별
      </p>
      <div className="space-y-1.5">
        {data.byDow.map((b) => (
          <div key={b.dow} className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground w-5 shrink-0 font-mono">
              {DOW_LABEL[b.dow]}
            </span>
            <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
              <div
                className="h-full rounded-full bg-emerald-500"
                style={{ width: `${(b.totalCount / max) * 100}%` }}
              />
            </div>
            <span className="text-foreground w-12 text-right font-mono text-[11px] font-bold tabular-nums">
              {b.totalCount.toLocaleString("ko-KR")}
            </span>
            <span className="text-muted-foreground w-12 text-right font-mono text-[10px] tabular-nums">
              {b.accuracyPct != null ? `${b.accuracyPct}%` : "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HourBars({ data }: { data: ActivityHeatmapData }) {
  const max = data.byHour.reduce((m, b) => Math.max(m, b.totalCount), 0) || 1;
  return (
    <div>
      <p className="text-muted-foreground mb-2 font-mono text-[11px] font-bold tracking-[0.06em] uppercase">
        시간대별
      </p>
      <div className="flex items-end gap-[2px]">
        {data.byHour.map((b) => {
          const pct = (b.totalCount / max) * 100;
          return (
            <div
              key={b.hour}
              title={`${pad(b.hour)}시 · ${b.totalCount}회${b.accuracyPct != null ? ` · 정답률 ${b.accuracyPct}%` : ""}`}
              className="bg-muted relative h-20 flex-1 rounded-sm"
            >
              <div
                className="absolute right-0 bottom-0 left-0 rounded-sm bg-emerald-500"
                style={{ height: `${Math.max(pct, 2)}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="text-muted-foreground mt-1 flex items-center justify-between text-[10px] tabular-nums">
        <span>00시</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>23</span>
      </div>
    </div>
  );
}

// 외부 노출 — `useless: unused` 경고 방지.
export type { HeatmapCell };
