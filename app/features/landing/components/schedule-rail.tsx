// 랜딩 현장강의 일정 가로 레일 — 공용 Rail 위에 개강 카드(.sc)를 얹은 것.
//   카드 클릭 → 현장강의 상세(/lecture/schedule/:id). *.server 값 import 금지.
import { Link } from "react-router";

import {
  FORMAT_LABEL,
  ddayFrom,
  type LectureFormat,
  type ScheduleRow,
} from "../labels";

import { Rail } from "./rail";

export function ScheduleRail({
  schedules,
  todayISO,
}: {
  schedules: ScheduleRow[];
  todayISO: string;
}) {
  return (
    <Rail
      cardWidth={252}
      count={schedules.length}
      ariaPrev="이전 일정"
      ariaNext="다음 일정"
    >
      {schedules.map((s) => {
        const d = ddayFrom(s.start_date, todayISO);
        return (
          <Link
            to={`/lecture/schedule/${s.schedule_id}`}
            className="sc"
            key={s.schedule_id}
          >
            <span className={`tag ${s.status}`}>
              {s.status === "soon" && d !== null
                ? `D-${d} 임박`
                : s.status === "open"
                  ? "접수중"
                  : s.status === "waitlist"
                    ? "대기접수"
                    : "마감"}
            </span>
            <span className="subj">◆ {s.subject_label}</span>
            <h3>{s.title}</h3>
            <div className="tutor">{s.instructor_name}</div>
            <div className="meta">
              <div>
                <span className="k">개강</span>
                <span className="v tnum">
                  {s.start_date ? s.start_date.slice(5).replace("-", "/") : "예정"}
                </span>
              </div>
              <div>
                <span className="k">요일</span>
                <span className="v">
                  {s.day_label ?? "-"}
                  {s.time_label ? ` ${s.time_label}` : ""}
                </span>
              </div>
              <div>
                <span className="k">형태</span>
                <span className="v">{FORMAT_LABEL[s.format as LectureFormat]}</span>
              </div>
            </div>
            {d !== null ? (
              <div className="foot">
                <span className="ddayb">D-{d}</span>
              </div>
            ) : null}
          </Link>
        );
      })}
    </Rail>
  );
}
