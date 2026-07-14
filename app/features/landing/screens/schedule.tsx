// feat-12 현장강의 일정 — /lecture/schedule. 공개. 월간 달력 + 개강일 순 카드 목록.
import { Link, useSearchParams } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";

import { LandingStyle } from "../components/landing-style";
import {
  addMonth,
  monthEvents,
  monthMatrix,
  parseYm,
  ymString,
} from "../lib/lecture-calendar";
import {
  FORMAT_LABEL,
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
  // 달력은 진행 중(과거 개강 포함) 강의도 표시해야 하므로 todayISO 필터 없이 전체 게시분.
  const all = await listSchedules(client);
  return { all, todayISO };
}

const SEAT_CLASS = (rem: number) =>
  rem === 0 ? "low" : rem <= 8 ? "low" : rem <= 16 ? "mid" : "ok";

const WD_HEAD = ["일", "월", "화", "수", "목", "금", "토"];

export default function Schedule({ loaderData }: Route.ComponentProps) {
  const { all, todayISO } = loaderData;
  const [params] = useSearchParams();
  const { year, month0 } = parseYm(params.get("ym"), todayISO);
  const weeks = monthMatrix(year, month0);
  const events = monthEvents(all, year, month0);
  const prev = addMonth(year, month0, -1);
  const next = addMonth(year, month0, 1);
  const todayYmd = todayISO.slice(0, 10);
  const cur = ymString(year, month0);
  // 오른쪽 목록: '그 달에 개강'하는 강의 = start_date 가 표시 중인 달에 속함.
  const monthList = all.filter((s) => s.start_date?.slice(0, 7) === cur);

  return (
    <div className="llx">
      <LandingStyle />
      <CalendarStyle />

      <section className="band">
        <div className="wrap" style={{ maxWidth: 1180 }}>
          <div className="shead">
            <div>
              <p className="eyebrow">현장강의 일정</p>
              <h2>강의 캘린더</h2>
              <p>왼쪽 달력에서 달을 넘기면, 오른쪽에 그 달 개강 강의가 표시됩니다.</p>
            </div>
            <Link className="more" to="/lecture/catalog">
              수강신청 →
            </Link>
          </div>

          {/* 좌: 달력 / 우: 그 달 개강 강의 목록 */}
          <div className="sched-split">
            <div className="cal">
              <div className="cal-nav">
                <Link className="cal-arrow" to={`?ym=${ymString(prev.year, prev.month0)}`} aria-label="이전 달">
                  ‹
                </Link>
                <span className="cal-title tnum">
                  {year}년 {month0 + 1}월
                </span>
                <Link className="cal-arrow" to={`?ym=${ymString(next.year, next.month0)}`} aria-label="다음 달">
                  ›
                </Link>
              </div>

              <div className="cal-grid cal-head">
                {WD_HEAD.map((w, i) => (
                  <div key={w} className={`cal-hd${i === 0 ? " sun" : i === 6 ? " sat" : ""}`}>
                    {w}
                  </div>
                ))}
              </div>

              {weeks.map((week, wi) => (
                <div className="cal-grid" key={wi}>
                  {week.map((d, di) => {
                    if (d === null)
                      return <div className="cal-cell empty" key={di} />;
                    const ymd = `${cur}-${String(d).padStart(2, "0")}`;
                    const evs = events.get(d) ?? [];
                    return (
                      <div
                        className={`cal-cell${ymd === todayYmd ? " today" : ""}`}
                        key={di}
                      >
                        <span className={`cal-d${di === 0 ? " sun" : di === 6 ? " sat" : ""}`}>
                          {d}
                        </span>
                        {evs.slice(0, 3).map((s, k) => (
                          <Link
                            to={`/lecture/schedule/${s.schedule_id}`}
                            className={`cal-ev${k % 2 ? " gilt" : ""}`}
                            key={s.schedule_id}
                            title={`${s.subject_label} ${s.title} · ${s.time_label ?? ""}`}
                          >
                            {s.subject_label}
                            {s.time_label ? <span className="t"> {s.time_label}</span> : null}
                          </Link>
                        ))}
                        {evs.length > 3 ? (
                          <span className="cal-more">+{evs.length - 3}</span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <aside className="sched-list">
              <div className="sched-list-h tnum">
                {month0 + 1}월 개강 강의
                <span className="cnt">{monthList.length}</span>
              </div>
              {monthList.length === 0 ? (
                <p className="sched-empty">이 달에 개강하는 강의가 없습니다.</p>
              ) : (
                <ul>
                  {monthList.map((s) => {
                    const rem = remainingSeats(s);
                    const d = ddayFrom(s.start_date, todayISO);
                    return (
                      <li key={s.schedule_id}>
                        <Link to={`/lecture/schedule/${s.schedule_id}`} className="sli">
                          <div className="sli-day tnum">
                            <b>{s.start_date ? Number(s.start_date.slice(8, 10)) : "-"}</b>
                            <span>일</span>
                          </div>
                          <div className="sli-main">
                            <div className="sli-subj">
                              ◆ {s.subject_label}
                              {d !== null ? <span className="dday">D-{d}</span> : null}
                            </div>
                            <div className="sli-title">{s.title}</div>
                            <div className="sli-meta">
                              {s.instructor_name}
                              {s.time_label ? ` · ${s.time_label}` : ""}
                              {" · "}
                              {FORMAT_LABEL[s.format as LectureFormat]}
                            </div>
                          </div>
                          <span className={`sli-seat ${SEAT_CLASS(rem)}`}>
                            {s.status === "closed" || rem === 0 ? "마감" : `잔여 ${rem}`}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </aside>
          </div>
        </div>
      </section>
    </div>
  );
}

// 달력 전용 보조 스타일 — .llx 스코프.
function CalendarStyle() {
  return (
    <style>{`
.llx .sched-split{display:grid;grid-template-columns:4fr 6fr;gap:22px;align-items:start}
.llx .cal{background:var(--lsurface);border:1px solid var(--line);border-radius:16px;padding:16px;box-shadow:var(--lshadow)}
.llx .cal-nav{display:flex;align-items:center;justify-content:center;gap:14px;margin-bottom:14px}
.llx .cal-title{font-size:17px;font-weight:900;min-width:118px;text-align:center}
.llx .cal-arrow{width:34px;height:34px;border:1px solid var(--line2);border-radius:9px;display:grid;place-items:center;font-size:19px;color:var(--ink);background:var(--lground);transition:border-color .15s}
.llx .cal-arrow:hover{border-color:var(--blue)}
.llx .cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}
.llx .cal-head{margin-bottom:6px}
.llx .cal-hd{text-align:center;font-size:12px;font-weight:800;color:var(--faint);padding:4px 0}
.llx .cal-hd.sun{color:#c0392b}.llx .cal-hd.sat{color:var(--blue-ink)}
.llx .cal-cell{min-height:88px;border:1px solid var(--line);border-radius:9px;padding:5px 5px 6px;display:flex;flex-direction:column;gap:3px;background:var(--lground);overflow:hidden}
.llx .cal-cell.empty{background:transparent;border:0}
.llx .cal-cell.today{border-color:var(--blue);box-shadow:inset 0 0 0 1px var(--blue)}
.llx .cal-d{font-size:12px;font-weight:800;color:var(--soft)}
.llx .cal-d.sun{color:#c0392b}.llx .cal-d.sat{color:var(--blue-ink)}
.llx .cal-cell.today .cal-d{color:var(--blue-ink)}
.llx .cal-ev{font-size:10.5px;font-weight:700;line-height:1.35;padding:2px 6px;border-radius:5px;background:var(--blue-wash);color:var(--blue-ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.llx .cal-ev.gilt{background:color-mix(in srgb,var(--gilt) 16%,transparent);color:var(--gilt)}
.llx a.cal-ev{cursor:pointer;transition:filter .12s}
.llx a.cal-ev:hover{filter:brightness(.94)}
.llx .cal-more{font-size:10px;color:var(--faint);font-weight:700;padding-left:2px}
/* 우측 그 달 개강 목록 */
.llx .sched-list{background:var(--lsurface);border:1px solid var(--line);border-radius:16px;box-shadow:var(--lshadow);overflow:hidden}
.llx .sched-list-h{display:flex;align-items:center;gap:8px;padding:15px 18px;font-size:15px;font-weight:900;border-bottom:1px solid var(--line);background:linear-gradient(90deg,color-mix(in srgb,var(--gilt) 8%,transparent),transparent)}
.llx .sched-list-h .cnt{margin-left:auto;font-size:12px;font-weight:800;color:#fff;background:var(--blue);border-radius:999px;padding:1px 9px}
.llx .sched-empty{padding:34px 18px;text-align:center;color:var(--faint);font-size:13.5px}
.llx .sched-list ul{list-style:none;margin:0;padding:0}
.llx .sli{display:flex;align-items:center;gap:12px;padding:13px 16px;border-top:1px solid var(--line)}
.llx .sched-list li:first-child .sli{border-top:0}
.llx .sli:hover{background:var(--lground)}
.llx .sli-day{flex-shrink:0;width:44px;text-align:center;line-height:1}
.llx .sli-day b{display:block;font-size:22px;font-weight:900;color:var(--blue-ink)}
.llx .sli-day span{font-size:10px;color:var(--faint)}
.llx .sli-main{flex:1;min-width:0}
.llx .sli-subj{font-size:11.5px;font-weight:800;color:var(--gilt);display:flex;align-items:center;gap:6px}
.llx .sli-subj .dday{font-size:10px;font-weight:900;color:var(--blue-ink);background:var(--blue-wash);padding:1px 6px;border-radius:5px}
.llx .sli-title{font-size:14.5px;font-weight:800;color:var(--ink);margin:2px 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.llx .sli-meta{font-size:12px;color:var(--soft);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.llx .sli-seat{flex-shrink:0;font-size:12px;font-weight:800}
.llx .sli-seat.low{color:var(--hot)}.llx .sli-seat.mid{color:var(--warn)}.llx .sli-seat.ok{color:var(--ok)}
@media (max-width:900px){
  .llx .sched-split{grid-template-columns:1fr}
}
@media (max-width:640px){
  .llx .cal-cell{min-height:58px;padding:3px}
  .llx .cal-ev{font-size:9px;padding:1px 4px}
  .llx .cal-ev .t{display:none}
}
`}</style>
  );
}
