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
  // 달력은 진행 중(과거 개강 포함) 강의도 표시해야 하므로 todayISO 필터 없이 전체 게시분.
  const all = await listSchedules(client);
  const upcoming = all.filter(
    (s) => !s.start_date || s.start_date >= todayISO.slice(0, 10),
  );
  return { all, upcoming, todayISO };
}

const SEAT_CLASS = (rem: number) =>
  rem === 0 ? "low" : rem <= 8 ? "low" : rem <= 16 ? "mid" : "ok";

const WD_HEAD = ["일", "월", "화", "수", "목", "금", "토"];

export default function Schedule({ loaderData }: Route.ComponentProps) {
  const { all, upcoming, todayISO } = loaderData;
  const [params] = useSearchParams();
  const { year, month0 } = parseYm(params.get("ym"), todayISO);
  const weeks = monthMatrix(year, month0);
  const events = monthEvents(all, year, month0);
  const prev = addMonth(year, month0, -1);
  const next = addMonth(year, month0, 1);
  const todayYmd = todayISO.slice(0, 10);
  const cur = ymString(year, month0);

  return (
    <div className="llx">
      <LandingStyle />
      <CalendarStyle />

      {/* 달력 */}
      <section className="band">
        <div className="wrap" style={{ maxWidth: 1000 }}>
          <div className="shead">
            <div>
              <p className="eyebrow">현장강의 일정</p>
              <h2>강의 캘린더</h2>
              <p>요일별 현장강의 일정을 한눈에. 개강일 이후 수업 요일마다 표시됩니다.</p>
            </div>
            <Link className="more" to="/lecture/catalog">
              수강신청 →
            </Link>
          </div>

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
                      {evs.slice(0, 4).map((s, k) => (
                        <span className={`cal-ev${k % 2 ? " gilt" : ""}`} key={s.schedule_id} title={`${s.subject_label} ${s.title} · ${s.time_label ?? ""}`}>
                          {s.subject_label}
                          {s.time_label ? <span className="t"> {s.time_label}</span> : null}
                        </span>
                      ))}
                      {evs.length > 4 ? (
                        <span className="cal-more">+{evs.length - 4}</span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 개강 임박 카드 목록 */}
      <section className="band tint">
        <div className="wrap">
          <div className="shead">
            <div>
              <p className="eyebrow">Upcoming</p>
              <h2>다가오는 개강</h2>
              <p>개강일 순으로 정렬됩니다. 잔여석은 실시간으로 반영됩니다.</p>
            </div>
          </div>
          {upcoming.length === 0 ? (
            <p style={{ color: "var(--soft)", fontSize: 14 }}>
              예정된 개강 일정이 곧 공개됩니다.
            </p>
          ) : (
            <div className="strip">
              {upcoming.map((s) => {
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

// 달력 전용 보조 스타일 — .llx 스코프.
function CalendarStyle() {
  return (
    <style>{`
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
.llx .cal-more{font-size:10px;color:var(--faint);font-weight:700;padding-left:2px}
@media (max-width:640px){
  .llx .cal-cell{min-height:58px;padding:3px}
  .llx .cal-ev{font-size:9px;padding:1px 4px}
  .llx .cal-ev .t{display:none}
}
`}</style>
  );
}
