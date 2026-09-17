// feat-12 현장강의 일정 — /lecture/schedule. 공개. 월간 달력 + 개강일 순 카드 목록.
// 2026-09-17 원장: 이 달력은 현장강의 일정이다 — 형태 축(현장/실시간/영상 칩·색·라벨)을 없앴고
//   공개 목록은 listSchedules 가 현장(offline)만 돌려준다(실시간 강의는 운영하지 않는다).
//   찾기 축은 구분(1차/2차)·과목(7종) 칩 두 줄 — 상태는 URL(?round=&subject=)이 SSOT, 달력 막대와
//   오른쪽 목록에 같은 필터(matchesScheduleFilter)를 건다.
import type { Route } from "./+types/schedule";

import {
  Link,
  type ShouldRevalidateFunctionArgs,
  useSearchParams,
} from "react-router";

import { pageMeta } from "~/core/lib/seo";
import makeServerClient from "~/core/lib/supa-client.server";

import { LandingStyle } from "../components/landing-style";
import { ScheduleFilterChips } from "../components/schedule-filter-chips";
import { scheduleState } from "../labels";
import {
  addMonth,
  monthEvents,
  monthMatrixFull,
  parseYm,
  ymString,
} from "../lib/lecture-calendar";
import {
  FILTER_ALL,
  FILTER_PARAM_ROUND,
  FILTER_PARAM_SUBJECT,
  SCHEDULE_META_SEP,
  parseScheduleFilter,
  scheduleFilterLabel,
  scheduleMetaLabel,
  scheduleMetaParts,
  scheduleMonogramText,
} from "../lib/schedule-filter";
import { matchesScheduleFilter } from "../lib/schedule-taxonomy";
import { listSchedules } from "../queries.server";

export const meta: Route.MetaFunction = (a) =>
  pageMeta(
    {
      title: "현장강의 일정",
      description:
        "리담변리사학원 현장강의 개강 일정 — 구분·과목·요일·시간과 남은 자리를 달력으로 확인하고 신청합니다.",
    },
    a,
  );

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const todayISO = new Date().toISOString();
  // 달력은 진행 중(과거 개강 포함) 강의도 표시해야 하므로 todayISO 필터 없이 전체 게시분.
  const all = await listSchedules(client);
  return { all, todayISO };
}

// loader 는 search param(ym/round/subject)을 전혀 읽지 않는다 — 달·구분·과목은 전부 클라 계산.
//   같은 경로의 search 만 바뀌는 내비(칩 클릭·달 화살표)에서 loader(listSchedules) 재실행 = 서버
//   왕복 뒤에야 화면이 바뀌므로 재검증을 막는다(stats.tsx 선례). 폼 제출이면 재검증, 경로가 바뀌면 기본값.
//   부작용: todayISO 가 첫 로드 시각에 고정된다 — 공개 일정 페이지라 허용.
export function shouldRevalidate({
  currentUrl,
  nextUrl,
  formMethod,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs): boolean {
  if (formMethod && formMethod.toUpperCase() !== "GET") return true;
  if (currentUrl.pathname !== nextUrl.pathname) return defaultShouldRevalidate;
  return false;
}

const SEAT_CLASS = (rem: number) =>
  rem === 0 ? "low" : rem <= 8 ? "low" : rem <= 16 ? "mid" : "ok";

const WD_HEAD = ["일", "월", "화", "수", "목", "금", "토"];
const YM_PARAM = "ym";

// "YYYY-MM-DD" → "M월 D일 (요일)". 날짜 그룹 헤더용.
const DOW_LABEL = ["일", "월", "화", "수", "목", "금", "토"];
function dateHeading(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${m}월 ${d}일 (${DOW_LABEL[dow]})`;
}

// 썸네일 대체 모노그램 — 과목 라벨 앞 두 글자(공백 제거).
function monogram(label: string): string {
  return label.replace(/\s+/g, "").slice(0, 2) || "강의";
}

// 달 이동 링크 — ym 만 바꾸고 구분·과목 필터는 그대로 가져간다(URL SSOT).
function hrefWithYm(params: URLSearchParams, ym: string): string {
  const next = new URLSearchParams(params);
  next.set(YM_PARAM, ym);
  return `?${next.toString()}`;
}

export default function Schedule({ loaderData }: Route.ComponentProps) {
  const { all, todayISO } = loaderData;
  const [params, setSearchParams] = useSearchParams();
  const { year, month0 } = parseYm(params.get(YM_PARAM), todayISO);
  const weeks = monthMatrixFull(year, month0);
  const prev = addMonth(year, month0, -1);
  const next = addMonth(year, month0, 1);
  const todayYmd = todayISO.slice(0, 10);
  const cur = ymString(year, month0);
  // 구분·과목 필터 — 달력 막대·오른쪽 목록·「가장 이른 개강」 안내 모두 같은 집합에서 계산.
  const filter = parseScheduleFilter((k) => params.get(k));
  const filtered = all.filter((s) => matchesScheduleFilter(s, filter));
  const filterLabel = scheduleFilterLabel(filter);
  const setFilter = (key: string, value: string) => {
    const nextParams = new URLSearchParams(params);
    if (value === FILTER_ALL) nextParams.delete(key);
    else nextParams.set(key, value);
    setSearchParams(nextParams, { preventScrollReset: true });
  };
  const events = monthEvents(filtered, year, month0);
  // 오른쪽 목록: '그 달에 개강'하는 강의 = start_date 가 표시 중인 달에 속함.
  const monthList = filtered.filter((s) => s.start_date?.slice(0, 7) === cur);
  // ★이 달에 개강이 없을 때 "가장 이른 다음 개강"을 찾아 안내한다 — 목록이 달로 걸리므로
  //   개강이 있어도 "없습니다"만 보이고 방문자가 그냥 나간다(feat-11-012 P3).
  const nextOpening = filtered
    .filter((s) => s.start_date && s.start_date >= todayYmd)
    .map((s) => s.start_date as string)
    .sort()[0];
  // 개강일별 그룹(listSchedules 가 start_date 오름차순 → 그룹 순서도 오름차순 유지).
  const dateGroups: Array<{ date: string; items: typeof monthList }> = [];
  const groupIdx = new Map<string, number>();
  for (const s of monthList) {
    const key = s.start_date ?? "미정";
    let idx = groupIdx.get(key);
    if (idx === undefined) {
      idx = dateGroups.length;
      groupIdx.set(key, idx);
      dateGroups.push({ date: key, items: [] });
    }
    dateGroups[idx].items.push(s);
  }

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
                <Link
                  className="cal-arrow"
                  to={hrefWithYm(params, ymString(prev.year, prev.month0))}
                  aria-label="이전 달"
                >
                  ‹
                </Link>
                <span className="cal-title tnum">
                  {year}. {month0 + 1}
                </span>
                <Link
                  className="cal-arrow"
                  to={hrefWithYm(params, ymString(next.year, next.month0))}
                  aria-label="다음 달"
                >
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
                                    className="cal-bar"
                                    key={s.schedule_id}
                                    title={`${scheduleMetaLabel(s)} ${s.title}${s.time_label ? `${SCHEDULE_META_SEP}${s.time_label}` : ""}`}
                                    aria-label={`${scheduleMetaLabel(s)} ${s.title}`}
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
              <ScheduleFilterChips
                filter={filter}
                onRoundChange={(v) => setFilter(FILTER_PARAM_ROUND, v)}
                onSubjectChange={(v) => setFilter(FILTER_PARAM_SUBJECT, v)}
              />
              <div className="sched-scroll">
                {dateGroups.length === 0 ? (
                  <p className="sched-empty">
                    {month0 + 1}월에 개강하는{" "}
                    {filterLabel ? `${filterLabel} ` : ""}
                    현장강의가 없습니다.
                    {nextOpening && nextOpening.slice(0, 7) !== cur ? (
                      <>
                        {" "}
                        <Link to={hrefWithYm(params, nextOpening.slice(0, 7))}>
                          가장 이른 개강은 {Number(nextOpening.slice(0, 4))}년{" "}
                          {Number(nextOpening.slice(5, 7))}월입니다 →
                        </Link>
                      </>
                    ) : null}
                  </p>
                ) : (
                  dateGroups.map((g) => (
                    <div className="dgroup" key={g.date}>
                      <div className="dgroup-h tnum">
                        {g.date === "미정" ? "개강일 미정" : dateHeading(g.date)}
                      </div>
                      {g.items.map((s) => {
                        // ★판정은 labels.ts 의 scheduleState 하나 — 개강일 경과까지 본다.
                        const st = scheduleState(s, todayISO);
                        const rem = st.seatsLeft;
                        const d = st.dday;
                        const closed = st.closed;
                        // 「◆ 1차 · 특허법 · 월·목 · 19:00–22:00」 — 구분은 있을 때만 앞에.
                        const metaText = [
                          ...scheduleMetaParts(s),
                          s.day_label,
                          s.time_label,
                        ]
                          .filter((p): p is string => !!p)
                          .join(SCHEDULE_META_SEP);
                        return (
                          <Link
                            to={`/lecture/schedule/${s.schedule_id}`}
                            className="scard"
                            key={s.schedule_id}
                          >
                            <span className="scard-thumb">
                              {monogram(scheduleMonogramText(s))}
                            </span>
                            <span className="scard-main">
                              <span className="scard-top">
                                <span className="scard-dot" />
                                <span className="scard-title">{s.title}</span>
                              </span>
                              <span className="scard-meta">◆ {metaText}</span>
                              <span className="scard-meta2">
                                강사 : {s.instructor_name}
                                {d !== null ? (
                                  <span className="dday">D-{d}</span>
                                ) : null}
                                <span className={`seat ${closed ? "low" : SEAT_CLASS(rem)}`}>
                                  {closed ? "마감" : `잔여 ${rem}`}
                                </span>
                              </span>
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>
            </aside>
          </div>
        </div>
      </section>
    </div>
  );
}

// 달력 전용 보조 스타일 — .llx 스코프. (필터 칩 스타일은 schedule-filter-chips.tsx 에.)
function CalendarStyle() {
  return (
    <style>{`
.llx .sched-split{display:grid;grid-template-columns:45fr 55fr;gap:22px;align-items:start}
.llx .cal{background:transparent}
.llx .cal-nav{display:flex;align-items:center;justify-content:center;gap:18px;height:36px;margin-bottom:16px}
.llx .cal-title{font-size:22px;font-weight:700;min-width:120px;text-align:center;color:var(--ink)}
.llx .cal-arrow{width:36px;height:36px;border:1px solid var(--line2);border-radius:999px;display:grid;place-items:center;font-size:20px;color:var(--ink);background:var(--lsurface);transition:border-color .15s,background .15s}
.llx .cal-arrow:hover{border-color:var(--blue);background:var(--blue-wash)}
/* 한 장의 사각형 박스 안에 얇은 격자로 나뉜 날짜 칸 */
.llx .cal-box{background:var(--lsurface);border:1px solid var(--line2);border-radius:16px;overflow:hidden;box-shadow:var(--lshadow)}
.llx .cal-grid{display:grid;grid-template-columns:repeat(7,1fr)}
/* 요일 헤더 = 배경 띠(그 위에 날짜 그리드를 얹는 느낌) */
.llx .cal-head{background:var(--lground);border-bottom:1px solid var(--line2)}
.llx .cal-hd{text-align:center;font-size:12px;font-weight:700;letter-spacing:.02em;color:var(--soft);padding:10px 0}
.llx .cal-hd.sun{color:var(--hot)}.llx .cal-hd.sat{color:var(--blue-ink)}
/* 셀 = 정사각 비율(가로폭에 세로 맞춤 → 세로로 길어지지 않음) */
.llx .cal-cell{position:relative;aspect-ratio:1/1;min-height:0;border-right:1px solid var(--line);border-bottom:1px solid var(--line);padding:7px 8px;background:var(--lsurface);transition:background .12s;overflow:hidden}
.llx .cal-cell:nth-child(7n){border-right:0}
.llx .cal-body>.cal-grid:last-child .cal-cell{border-bottom:0}
.llx .cal-cell.today{background:var(--blue-wash)}
.llx .cal-cell.out{background:color-mix(in srgb,var(--lground) 55%,transparent)}
.llx .cal-d{font-size:13px;font-weight:700;color:var(--soft);line-height:1}
.llx .cal-d.sun{color:var(--hot)}.llx .cal-d.sat{color:var(--blue-ink)}
.llx .cal-cell.out .cal-d{color:var(--faint);font-weight:700}
.llx .cal-cell.today .cal-d{display:inline-grid;place-items:center;width:22px;height:22px;margin:-2px 0 0 -3px;border-radius:50%;background:var(--blue);color:var(--blue-fg)}
/* 강의 표시 = 칸 하단 색 막대(현장 한 가지 색 — 필터를 통과한 일정만 그린다). */
.llx .cal-bars{position:absolute;left:9px;right:9px;bottom:8px;display:flex;flex-direction:column;gap:3px}
.llx .cal-bar{display:block;height:4px;border-radius:999px;background:var(--ok);transition:filter .12s,transform .12s}
.llx a.cal-bar:hover{filter:brightness(.92);transform:scaleY(1.5)}
.llx .cal-more{font-size:9.5px;color:var(--faint);font-weight:700;line-height:1;margin-top:1px}
/* 우측 패널 = 구분·과목 필터 칩(schedule-filter-chips) + 날짜별 카드 */
/* 우측 패널 시작점을 달력의 요일 헤더 라인과 맞춤(월 네비 높이 36 + 아래 여백 16 = 52). */
.llx .sched-list{margin-top:52px;background:var(--lsurface);border:1px solid var(--line2);border-radius:16px;box-shadow:var(--lshadow);overflow:hidden;align-self:stretch}
.llx .sched-scroll{max-height:640px;overflow-y:auto;padding:6px}
.llx .sched-empty{padding:40px 18px;text-align:center;color:var(--faint);font-size:13.5px}
.llx .dgroup{padding:8px 8px 4px}
.llx .dgroup-h{font-size:13px;font-weight:700;color:var(--blue-ink);padding:6px 8px 10px}
.llx .scard{display:flex;gap:12px;padding:11px;border-radius:12px;transition:background .12s}
.llx .scard:hover{background:var(--lground)}
.llx .scard+.scard{margin-top:2px}
/* 썸네일 글자 = --blue-fg(라이트 흰·다크 잉크). 그라디언트 끝점은 --ink 와 섞어 라이트에선 짙어지고 다크에선 밝아져 대비가 유지된다.
   형태별 색(현장 --ok / 실시간 --blue / 영상 --warn)은 2026-09-17 형태 축 제거로 현장 하나만 남았다. */
.llx .scard-thumb{flex-shrink:0;width:54px;height:54px;border-radius:10px;display:grid;place-items:center;font-size:15px;font-weight:700;color:var(--blue-fg);letter-spacing:-.02em}
.llx .scard-thumb{background:linear-gradient(140deg,var(--ok),color-mix(in srgb,var(--ok) 72%,var(--ink)))}
.llx .scard-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.llx .scard-top{display:flex;align-items:center;gap:7px;min-width:0}
.llx .scard-dot{flex-shrink:0;width:8px;height:8px;border-radius:50%}
.llx .scard-dot{background:var(--ok)}
.llx .scard-title{font-size:14px;font-weight:700;color:var(--ink);line-height:1.35;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.llx .scard-meta{font-size:11.5px;font-weight:700;color:var(--blue-ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.llx .scard-meta2{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--soft);flex-wrap:wrap}
.llx .scard-meta2 .dday{font-size:10px;font-weight:700;color:var(--blue-ink);background:var(--blue-wash);padding:1px 6px;border-radius:5px}
.llx .scard-meta2 .seat{font-size:11.5px;font-weight:700}
.llx .scard-meta2 .seat.low{color:var(--hot)}.llx .scard-meta2 .seat.mid{color:var(--warn-ink)}.llx .scard-meta2 .seat.ok{color:var(--ok)}
@media (max-width:900px){
  .llx .sched-split{grid-template-columns:1fr}
  .llx .sched-list{margin-top:0}
  .llx .sched-scroll{max-height:none}
}
@media (max-width:640px){
  .llx .cal-cell{padding:5px 6px}
  .llx .cal-hd{padding:8px 0;font-size:11px}
  .llx .cal-bars{left:6px;right:6px;bottom:6px;gap:2px}
  .llx .cal-title{font-size:19px}
}
`}</style>
  );
}
