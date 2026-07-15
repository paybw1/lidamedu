// feat-12 현장강의 일정 — /lecture/schedule. 공개. 월간 달력 + 개강일 순 카드 목록.
import { Link, useSearchParams } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";

import { LandingStyle } from "../components/landing-style";
import {
  addMonth,
  monthEvents,
  monthMatrixFull,
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

// 강의 형태별 달력 막대 색 클래스 — 현장/실시간/영상.
const FMT_BAR = (f: string) =>
  f === "offline" ? "off" : f === "live" ? "live" : "vid";

export default function Schedule({ loaderData }: Route.ComponentProps) {
  const { all, todayISO } = loaderData;
  const [params] = useSearchParams();
  const { year, month0 } = parseYm(params.get("ym"), todayISO);
  const weeks = monthMatrixFull(year, month0);
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
                  {year}. {month0 + 1}
                </span>
                <Link className="cal-arrow" to={`?ym=${ymString(next.year, next.month0)}`} aria-label="다음 달">
                  ›
                </Link>
              </div>

              <div className="cal-box">
                <div className="cal-grid cal-head">
                  {WD_HEAD.map((w, i) => (
                    <div key={w} className={`cal-hd${i === 0 ? " sun" : i === 6 ? " sat" : ""}`}>
                      {w}
                    </div>
                  ))}
                </div>

                <div className="cal-body">
                  {weeks.map((week, wi) => (
                    <div className="cal-grid" key={wi}>
                      {week.map((c, di) => {
                        if (!c.inMonth)
                          return (
                            <div className="cal-cell out" key={di}>
                              <span className="cal-d">{c.day}</span>
                            </div>
                          );
                        const ymd = `${cur}-${String(c.day).padStart(2, "0")}`;
                        const evs = events.get(c.day) ?? [];
                        return (
                          <div
                            className={`cal-cell${ymd === todayYmd ? " today" : ""}`}
                            key={di}
                          >
                            <span className={`cal-d${di === 0 ? " sun" : di === 6 ? " sat" : ""}`}>
                              {c.day}
                            </span>
                            {evs.length > 0 ? (
                              <div className="cal-bars">
                                {evs.slice(0, 3).map((s) => (
                                  <Link
                                    to={`/lecture/schedule/${s.schedule_id}`}
                                    className={`cal-bar ${FMT_BAR(s.format)}`}
                                    key={s.schedule_id}
                                    title={`${s.subject_label} ${s.title}${s.time_label ? ` · ${s.time_label}` : ""}`}
                                    aria-label={`${s.subject_label} ${s.title}`}
                                  />
                                ))}
                                {evs.length > 3 ? (
                                  <span className="cal-more">+{evs.length - 3}</span>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
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
.llx .sched-split{display:grid;grid-template-columns:45fr 55fr;gap:22px;align-items:start}
.llx .cal{background:transparent}
.llx .cal-nav{display:flex;align-items:center;justify-content:center;gap:18px;margin-bottom:16px}
.llx .cal-title{font-size:22px;font-weight:900;min-width:120px;text-align:center;color:var(--ink)}
.llx .cal-arrow{width:36px;height:36px;border:1px solid var(--line2);border-radius:999px;display:grid;place-items:center;font-size:20px;color:var(--ink);background:var(--lsurface);transition:border-color .15s,background .15s}
.llx .cal-arrow:hover{border-color:var(--blue);background:var(--blue-wash)}
/* 한 장의 사각형 박스 안에 얇은 격자로 나뉜 날짜 칸 */
.llx .cal-box{background:var(--lsurface);border:1px solid var(--line2);border-radius:16px;overflow:hidden;box-shadow:var(--lshadow)}
.llx .cal-grid{display:grid;grid-template-columns:repeat(7,1fr)}
.llx .cal-head{border-bottom:1px solid var(--line2)}
.llx .cal-hd{text-align:center;font-size:12px;font-weight:800;letter-spacing:.02em;color:var(--soft);padding:11px 0}
.llx .cal-hd.sun{color:#c0392b}.llx .cal-hd.sat{color:var(--blue-ink)}
.llx .cal-cell{position:relative;min-height:92px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);padding:8px 9px 20px;background:var(--lsurface);transition:background .12s;overflow:hidden}
.llx .cal-cell:nth-child(7n){border-right:0}
.llx .cal-body>.cal-grid:last-child .cal-cell{border-bottom:0}
.llx .cal-cell.today{background:var(--blue-wash)}
.llx .cal-cell.out{background:color-mix(in srgb,var(--lground) 55%,transparent)}
.llx .cal-d{font-size:13px;font-weight:800;color:var(--soft);line-height:1}
.llx .cal-d.sun{color:#c0392b}.llx .cal-d.sat{color:var(--blue-ink)}
.llx .cal-cell.out .cal-d{color:var(--faint);font-weight:700}
.llx .cal-cell.today .cal-d{display:inline-grid;place-items:center;width:22px;height:22px;margin:-2px 0 0 -3px;border-radius:50%;background:var(--blue);color:#fff}
/* 강의 표시 = 칸 하단 색 막대(형태별 색). */
.llx .cal-bars{position:absolute;left:9px;right:9px;bottom:8px;display:flex;flex-direction:column;gap:3px}
.llx .cal-bar{display:block;height:4px;border-radius:999px;background:var(--blue);transition:filter .12s,transform .12s}
.llx a.cal-bar:hover{filter:brightness(.92);transform:scaleY(1.5)}
.llx .cal-bar.off{background:var(--ok)}
.llx .cal-bar.live{background:var(--blue)}
.llx .cal-bar.vid{background:var(--gilt)}
.llx .cal-more{font-size:9.5px;color:var(--faint);font-weight:800;line-height:1;margin-top:1px}
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
  .llx .cal-cell{min-height:60px;padding:5px 6px 15px}
  .llx .cal-hd{padding:8px 0;font-size:11px}
  .llx .cal-bars{left:6px;right:6px;bottom:6px;gap:2px}
  .llx .cal-title{font-size:19px}
}
`}</style>
  );
}
