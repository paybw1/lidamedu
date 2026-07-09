// feat-12 현장강의 일정 전체 — /lecture/schedule. 공개. 개강일 순 카드 목록.
import { Link } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";

import { LandingStyle } from "../components/landing-style";
import {
  FORMAT_LABEL,
  fillPercent,
  ddayFrom,
  remainingSeats,
  type LectureFormat,
} from "../labels";
import { listSchedules } from "../queries.server";

import type { Route } from "./+types/schedule";

export function meta() {
  return [{ title: "현장강의 일정 | 리담변리사학원" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const todayISO = new Date().toISOString();
  const schedules = await listSchedules(client, { todayISO });
  return { schedules, todayISO };
}

const SEAT_CLASS = (rem: number) =>
  rem === 0 ? "low" : rem <= 8 ? "low" : rem <= 16 ? "mid" : "ok";

export default function Schedule({ loaderData }: Route.ComponentProps) {
  const { schedules, todayISO } = loaderData;
  return (
    <div className="llx">
      <LandingStyle />
      <section className="band">
        <div className="wrap">
          <div className="shead">
            <div>
              <p className="eyebrow">현장강의 일정</p>
              <h2>다가오는 개강 일정</h2>
              <p>개강일 순으로 정렬됩니다. 잔여석은 실시간으로 반영됩니다.</p>
            </div>
            <Link className="more" to="/lecture/catalog">
              수강신청 →
            </Link>
          </div>
          {schedules.length === 0 ? (
            <p style={{ color: "var(--soft)", fontSize: 14 }}>
              예정된 개강 일정이 곧 공개됩니다.
            </p>
          ) : (
            <div className="strip">
              {schedules.map((s) => {
                const rem = remainingSeats(s);
                const d = ddayFrom(s.start_date, todayISO);
                return (
                  <article className="sc" key={s.schedule_id}>
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
                          {s.start_date
                            ? s.start_date.replace(/-/g, ".").slice(2)
                            : "예정"}
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
                        <span className="v">
                          {FORMAT_LABEL[s.format as LectureFormat]}
                        </span>
                      </div>
                    </div>
                    <div className="gauge">
                      <i style={{ width: `${fillPercent(s)}%` }} />
                    </div>
                    <div className="foot">
                      <span className={`seatn ${SEAT_CLASS(rem)}`}>
                        {s.status === "closed" || rem === 0
                          ? "마감"
                          : `잔여 ${rem} / ${s.capacity}석`}
                      </span>
                      {d !== null ? <span className="ddayb">D-{d}</span> : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
