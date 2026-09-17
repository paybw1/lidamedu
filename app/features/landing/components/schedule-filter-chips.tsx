// 강의 캘린더 필터 칩 두 줄(구분 / 과목) — 표시 + 이벤트만. 상태는 화면(URL SSOT)이 소유한다.
//   구분·과목 공통 한 벌의 색(과목별 색 없음). .llx 토큰만 쓰고 고정 hex 금지.
//   *.server 값 import 금지.
import { FILTER_ALL } from "../lib/schedule-filter";
import {
  EXAM_ROUNDS,
  EXAM_ROUND_LABEL,
  SCHEDULE_SUBJECT_OPTIONS,
  type ScheduleFilter,
} from "../lib/schedule-taxonomy";

const ALL_LABEL = "전체";

interface ChipOption {
  value: string;
  label: string;
}

// 1행 「구분」: 전체·1차·2차 / 2행 「과목」: 전체 + 7과목(SSOT 배열 순서 그대로).
const ROUND_CHIPS: ReadonlyArray<ChipOption> = [
  { value: FILTER_ALL, label: ALL_LABEL },
  ...EXAM_ROUNDS.map((r) => ({ value: r, label: EXAM_ROUND_LABEL[r] })),
];
const SUBJECT_CHIPS: ReadonlyArray<ChipOption> = [
  { value: FILTER_ALL, label: ALL_LABEL },
  ...SCHEDULE_SUBJECT_OPTIONS,
];

export function ScheduleFilterChips({
  filter,
  onRoundChange,
  onSubjectChange,
}: {
  filter: ScheduleFilter;
  onRoundChange: (value: string) => void;
  onSubjectChange: (value: string) => void;
}) {
  return (
    <div className="sfchips">
      <ChipRow
        keyLabel="구분"
        ariaLabel="구분 필터"
        options={ROUND_CHIPS}
        value={filter.round}
        onChange={onRoundChange}
      />
      <ChipRow
        keyLabel="과목"
        ariaLabel="과목 필터"
        options={SUBJECT_CHIPS}
        value={filter.subject}
        onChange={onSubjectChange}
      />
      <ChipStyle />
    </div>
  );
}

function ChipRow({
  keyLabel,
  ariaLabel,
  options,
  value,
  onChange,
}: {
  keyLabel: string;
  ariaLabel: string;
  options: ReadonlyArray<ChipOption>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="sfchip-row">
      {/* 보이는 행 제목은 tablist 의 aria-label 과 중복이라 읽기에서 뺀다. */}
      <span className="sfchip-k" aria-hidden="true">
        {keyLabel}
      </span>
      <div className="sfchip-list" role="tablist" aria-label={ariaLabel}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="tab"
              aria-selected={on}
              className={on ? "sfchip on" : "sfchip"}
              onClick={() => onChange(o.value)}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// 칩 전용 보조 스타일 — .llx 스코프. (.chip 은 리담소식 종류 칩이 쓰므로 sfchip 으로 분리.)
function ChipStyle() {
  return (
    <style>{`
.llx .sfchips{display:flex;flex-direction:column;gap:8px;padding:12px 16px;border-bottom:1px solid var(--line);background:var(--lsurface)}
.llx .sfchip-row{display:flex;align-items:flex-start;gap:8px}
.llx .sfchip-k{flex-shrink:0;width:30px;padding-top:7px;font-size:11.5px;font-weight:700;color:var(--faint);letter-spacing:.02em;line-height:1}
.llx .sfchip-list{display:flex;flex-wrap:wrap;gap:6px;min-width:0}
.llx .sfchip{display:inline-flex;align-items:center;font-size:12.5px;font-weight:700;line-height:1;color:var(--soft);background:var(--lground);border:1px solid var(--line);border-radius:999px;padding:6px 11px;cursor:pointer;white-space:nowrap;transition:color .12s,border-color .12s,background .12s}
.llx .sfchip:hover{border-color:var(--line2);color:var(--ink)}
.llx .sfchip.on{color:var(--blue-ink);background:var(--blue-wash);border-color:var(--blue)}
.llx .sfchip:focus-visible{outline:2px solid var(--blue);outline-offset:2px}
@media (max-width:640px){
  .llx .sfchips{padding:10px 12px}
  .llx .sfchip{padding:5px 10px;font-size:12px}
}
`}</style>
  );
}
