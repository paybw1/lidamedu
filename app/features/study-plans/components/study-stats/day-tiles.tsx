// feat-7-048 D8 — 하루 시간 배분 타일(그림2). 세로 눈금은 **시각**, 타일 1개는 **10분**.
//
// 시각을 아는 기록은 타이머(Stage E)와 '총량 입력 + 시작 시각'뿐이다.
// 시각을 모르는 기록은 숨기지 않고 아래 '시각 미지정' 띠에 같은 색으로 쌓는다.
import { useState } from "react";

import { cn } from "~/core/lib/utils";
import { formatMinutes } from "~/features/study-plans/labels";
import {
  SUBJECT_COLOR_CLASS,
  type SubjectColorKey,
} from "~/features/study-plans/subject-axis";

export const TILE_MINUTES = 10;
const TILES_PER_HOUR = 60 / TILE_MINUTES;
const HOURS = 24;

export interface DayEntry {
  minutes: number;
  subjectKind: string | null;
  subjectCode: string | null;
  /** ISO timestamp. null 이면 '시각 미지정'. */
  startedAt: string | null;
}

/** ISO → KST 자정 기준 분. */
export function kstMinuteOfDay(iso: string): number {
  const kst = new Date(Date.parse(iso) + 9 * 3_600_000);
  return kst.getUTCHours() * 60 + kst.getUTCMinutes();
}

export function DayTiles({
  entries,
  colorOf,
}: {
  entries: DayEntry[];
  colorOf: (kind: string | null, code: string | null) => SubjectColorKey;
}) {
  const [showAll, setShowAll] = useState(false);

  // 타일 채우기 — 나중 기록이 앞선 기록을 덮는다(겹치는 시간대는 한 칸에 하나).
  const cells: Array<SubjectColorKey | null> = Array(HOURS * TILES_PER_HOUR).fill(null);
  let placed = 0;
  for (const e of entries) {
    if (!e.startedAt || e.minutes <= 0) continue;
    const start = Math.floor(kstMinuteOfDay(e.startedAt) / TILE_MINUTES);
    const span = Math.max(1, Math.ceil(e.minutes / TILE_MINUTES));
    for (let i = start; i < Math.min(start + span, cells.length); i++) {
      cells[i] = colorOf(e.subjectKind, e.subjectCode);
    }
    placed++;
  }

  const unplaced = entries.filter((e) => !e.startedAt && e.minutes > 0);
  const unplacedMinutes = unplaced.reduce((s, e) => s + e.minutes, 0);

  // 기본 표시 범위 — 기록이 있는 시간대 ±1시간. 없으면 오전 6시~자정.
  const filledHours = cells
    .map((c, i) => (c ? Math.floor(i / TILES_PER_HOUR) : -1))
    .filter((h) => h >= 0);
  const fromHour = showAll
    ? 0
    : filledHours.length > 0
      ? Math.max(0, Math.min(...filledHours) - 1)
      : 6;
  const toHour = showAll
    ? HOURS - 1
    : filledHours.length > 0
      ? Math.min(HOURS - 1, Math.max(...filledHours) + 1)
      : HOURS - 1;

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
          시간 배분
        </span>
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="text-muted-foreground hover:text-foreground text-[11px]"
        >
          {showAll ? "기록 구간만" : "하루 전체"}
        </button>
      </div>

      <div className="mt-1.5 space-y-0.5">
        {Array.from({ length: toHour - fromHour + 1 }, (_, k) => {
          const hour = fromHour + k;
          return (
            <div key={hour} className="flex items-center gap-1.5">
              <span className="text-muted-foreground w-6 shrink-0 text-right text-[10px] tabular-nums">
                {hour}
              </span>
              <div className="flex flex-1 gap-0.5">
                {Array.from({ length: TILES_PER_HOUR }, (_, t) => {
                  const c = cells[hour * TILES_PER_HOUR + t];
                  return (
                    <span
                      key={t}
                      className={cn(
                        "h-3 flex-1 rounded-[2px]",
                        c ? SUBJECT_COLOR_CLASS[c].fill : "bg-muted/60",
                      )}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {unplacedMinutes > 0 ? (
        <div className="mt-2 border-t pt-2">
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground w-6 shrink-0 text-right text-[10px]">
              ?
            </span>
            <div className="flex flex-1 flex-wrap gap-0.5">
              {unplaced.flatMap((e, ei) =>
                Array.from(
                  { length: Math.max(1, Math.ceil(e.minutes / TILE_MINUTES)) },
                  (_, i) => (
                    <span
                      key={`${ei}-${i}`}
                      className={cn(
                        "h-3 w-3 rounded-[2px] opacity-70",
                        SUBJECT_COLOR_CLASS[colorOf(e.subjectKind, e.subjectCode)]
                          .fill,
                      )}
                    />
                  ),
                ),
              )}
            </div>
          </div>
          <p className="text-muted-foreground mt-1 text-[10px]">
            시각 미지정 {formatMinutes(unplacedMinutes)} — 시작 시각을 함께 적으면
            위 시간표에 놓입니다.
          </p>
        </div>
      ) : null}

      {placed === 0 && unplacedMinutes === 0 ? (
        <p className="text-muted-foreground mt-2 text-[11px]">
          이 날 기록이 없습니다.
        </p>
      ) : null}
    </div>
  );
}
