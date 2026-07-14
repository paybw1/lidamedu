// 시험정보 — /lecture/exam-info. 공개 페이지. 강의 nav "리담안내" 하위.
//   콘텐츠는 exam_info.data(JSONB) 에서 로드, 행 없으면 기본값 폴백(변리사시험로드맵 반영).
//   운영자는 /admin/exam-info 에서 직접 편집. 디자인은 랜딩·리담소식과 동일한 .llx 스코프.
import makeServerClient from "~/core/lib/supa-client.server";

import { LandingStyle } from "../components/landing-style";
import { getExamInfo, listExamNotices } from "../queries.server";

import type { Route } from "./+types/exam-info";

export const meta: Route.MetaFunction = () => [
  { title: "시험정보 | 리담변리사학원" },
  {
    name: "description",
    content:
      "변리사 시험 일정·과목·시험시간·합격 기준·영어 대체시험·연도별 통계·공부법 안내. 2026년 제63회 기준.",
  },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const [info, notices] = await Promise.all([
    getExamInfo(client),
    listExamNotices(client),
  ]);
  return { info, notices };
}

export default function ExamInfo({ loaderData }: Route.ComponentProps) {
  const d = loaderData.info;
  const { notices } = loaderData;

  return (
    <div className="llx">
      <LandingStyle />
      <ExamStyle />

      {/* 헤더 + 시험 일정 */}
      <section className="band">
        <div className="wrap" style={{ maxWidth: 1180 }}>
          <div className="shead">
            <div>
              <p className="eyebrow">Exam Info</p>
              <h2>변리사 시험 정보</h2>
              {d.intro ? <p>{d.intro}</p> : null}
            </div>
          </div>

          <div className="ei-two">
            {d.schedule.map((s) => (
              <div className="ei-card" key={s.title}>
                <div className="ei-ch">
                  <h3>{s.title}</h3>
                  <span className="ei-kind">{s.kind}</span>
                </div>
                <div className="ei-rows">
                  {s.rows.map((r) => (
                    <div className="ei-row" key={r.label}>
                      <span className="ei-k">{r.label}</span>
                      <span className="ei-v tnum">{r.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {d.scheduleNote ? <p className="ei-note">{d.scheduleNote}</p> : null}
        </div>
      </section>

      {/* 시험 과목 · 합격 기준 · 시험시간표 */}
      <section className="band tint">
        <div className="wrap" style={{ maxWidth: 1180 }}>
          <div className="shead">
            <div>
              <p className="eyebrow">Subjects</p>
              <h2>시험 과목 · 합격 기준</h2>
            </div>
          </div>

          <div className="ei-two">
            <div className="ei-card">
              <div className="ei-ch">
                <h3>제1차 시험</h3>
                <span className="ei-kind">4과목 · 객관식</span>
              </div>
              <div className="ei-subj">
                {d.firstSubjects.map((s) => (
                  <div className="ei-subrow" key={s.name}>
                    <b>{s.name}</b>
                    <span>{s.desc}</span>
                  </div>
                ))}
              </div>
              {d.firstCriteria ? (
                <p className="ei-crit">
                  <b>합격</b> {d.firstCriteria}
                </p>
              ) : null}
            </div>

            <div className="ei-card">
              <div className="ei-ch">
                <h3>제2차 시험</h3>
                <span className="ei-kind">필수 3 + 선택 1 · 논술</span>
              </div>
              <div className="ei-subj">
                <div className="ei-subrow">
                  <b>필수과목</b>
                  <span>{d.secondRequired}</span>
                </div>
                <div className="ei-subrow">
                  <b>선택과목</b>
                  <span>{d.secondElective}</span>
                </div>
              </div>
              {d.secondCriteria ? (
                <p className="ei-crit">
                  <b>합격</b> {d.secondCriteria}
                </p>
              ) : null}
            </div>
          </div>

          {d.examTimes.length ? (
            <>
              <h3 className="ei-subhead">과목별 시험시간</h3>
              <div className="ei-table">
                <table>
                  <thead>
                    <tr>
                      <th>구분</th>
                      <th>교시</th>
                      <th>과목</th>
                      <th>입실완료</th>
                      <th>시험시간</th>
                      <th>문항수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.examTimes.map((t, i) => (
                      <tr key={i}>
                        <td>{t.section}</td>
                        <td>{t.period}</td>
                        <td className="ei-strong">{t.subject}</td>
                        <td className="tnum">{t.entry}</td>
                        <td className="tnum">{t.time}</td>
                        <td className="tnum">{t.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {d.examTimesNote ? (
                <p className="ei-note">{d.examTimesNote}</p>
              ) : null}
            </>
          ) : null}
        </div>
      </section>

      {/* 영어 대체시험 */}
      <section className="band">
        <div className="wrap" style={{ maxWidth: 1180 }}>
          <div className="shead">
            <div>
              <p className="eyebrow">English</p>
              <h2>영어 대체시험 인정 점수</h2>
              <p>
                1차 영어 과목은 공인 어학시험 성적으로 대체합니다. 아래 기준
                점수 이상이어야 하며, 일반 응시자 기준입니다.
              </p>
            </div>
          </div>

          <div className="ei-eng">
            {d.english.map((e) => (
              <div className="ei-engc" key={e.name}>
                <span className="ei-engn">{e.name}</span>
                <span className="ei-engs tnum">{e.score}</span>
              </div>
            ))}
          </div>
          {d.englishNote ? <p className="ei-note">{d.englishNote}</p> : null}

          <div className="ei-two" style={{ marginTop: 18 }}>
            {d.englishValidity ? (
              <div className="ei-card">
                <div className="ei-ch">
                  <h3>인정기간</h3>
                </div>
                <p className="ei-cardp">{d.englishValidity}</p>
              </div>
            ) : null}
            {d.englishTip ? (
              <div className="ei-card ei-tip">
                <div className="ei-ch">
                  <h3>TIP</h3>
                </div>
                <p className="ei-cardp">{d.englishTip}</p>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {/* 연도별 통계 */}
      {d.yearlyStats.length ? (
        <section className="band tint">
          <div className="wrap" style={{ maxWidth: 1180 }}>
            <div className="shead">
              <div>
                <p className="eyebrow">Statistics</p>
                <h2>연도별 통계</h2>
                <p>최근 응시·합격·경쟁률 요약(1차 응시(대상) · 커트라인 · 합격).</p>
              </div>
            </div>

            <div className="ei-table">
              <table>
                <thead>
                  <tr>
                    <th>연도</th>
                    <th>1차 응시(대상)</th>
                    <th>커트라인</th>
                    <th>1차 합격</th>
                    <th>응시율 / 합격률</th>
                    <th>2차 대상</th>
                    <th>최종 합격</th>
                    <th>최종 경쟁률</th>
                  </tr>
                </thead>
                <tbody>
                  {d.yearlyStats.map((y) => (
                    <tr key={y.year}>
                      <td className="ei-strong tnum">{y.year}</td>
                      <td className="tnum">{y.applied}</td>
                      <td className="tnum">{y.cut}</td>
                      <td className="tnum">{y.passed}</td>
                      <td className="tnum">{y.rate}</td>
                      <td className="tnum">{y.second}</td>
                      <td className="tnum">{y.final}</td>
                      <td className="tnum">{y.ratio}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {d.statNotes.length ? (
              <ul className="ei-bullets">
                {d.statNotes.map((s, i) => (
                  <li key={i}>
                    <span className="ei-no">{i + 1}</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* 1차 공부방법론 */}
      {d.studyPrinciples.length ||
      d.subjectNotes.length ||
      d.studyFlow ? (
        <section className="band">
          <div className="wrap" style={{ maxWidth: 1180 }}>
            <div className="shead">
              <div>
                <p className="eyebrow">Strategy</p>
                <h2>1차 공부방법론</h2>
                <p>법과목 중심 + 자연과학 전략 운영.</p>
              </div>
            </div>

            <div className="ei-two">
              {d.studyPrinciples.length ? (
                <div className="ei-card">
                  <div className="ei-ch">
                    <h3>핵심 원칙</h3>
                  </div>
                  <ol className="ei-ol">
                    {d.studyPrinciples.map((p, i) => (
                      <li key={i}>
                        <span className="ei-no">{i + 1}</span>
                        <span>{p}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
              {d.subjectNotes.length ? (
                <div className="ei-card">
                  <div className="ei-ch">
                    <h3>과목 특징</h3>
                  </div>
                  <div className="ei-subj">
                    {d.subjectNotes.map((s) => (
                      <div className="ei-subrow" key={s.name}>
                        <b>{s.name}</b>
                        <span>{s.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            {d.studyFlow ? (
              <div className="ei-card" style={{ marginTop: 18 }}>
                <div className="ei-ch">
                  <h3>추천 학습 흐름</h3>
                </div>
                <p className="ei-cardp">{d.studyFlow}</p>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* Q&A */}
      {d.faq.length ? (
        <section className="band tint">
          <div className="wrap" style={{ maxWidth: 860 }}>
            <div className="shead">
              <div>
                <p className="eyebrow">Q&amp;A</p>
                <h2>자주 묻는 질문</h2>
              </div>
            </div>
            <div className="ei-faq">
              {d.faq.map((f, i) => (
                <details className="ei-qa" key={i}>
                  <summary>
                    <span className="ei-q">Q</span>
                    <span className="ei-qt">{f.q}</span>
                    <span className="ei-ar">⌄</span>
                  </summary>
                  <p className="ei-a">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* 출처 */}
      {d.source ? (
        <section className="band" style={{ paddingTop: 0 }}>
          <div className="wrap" style={{ maxWidth: 1180 }}>
            <p className="ei-src">{d.source}</p>
          </div>
        </section>
      ) : null}

      {/* 시험 공고(첨부 게시판) */}
      {notices.length ? (
        <section className="band tint">
          <div className="wrap" style={{ maxWidth: 1180 }}>
            <div className="shead">
              <div>
                <p className="eyebrow">Notices</p>
                <h2>시험 공고</h2>
                <p>지식재산처·한국산업인력공단 공식 공고문입니다.</p>
              </div>
            </div>

            <div className="ei-notices">
              {notices.map((n) => (
                <div className="ei-notice" key={n.notice_id}>
                  <div className="ei-nhead">
                    <span className="ei-nt">
                      {n.is_pinned ? "📌 " : ""}
                      {n.title}
                    </span>
                    <span className="ei-nd tnum">
                      {n.published_at.slice(0, 10).replace(/-/g, ".")}
                    </span>
                  </div>
                  {n.body_md ? <p className="ei-nbody">{n.body_md}</p> : null}
                  {n.files.length ? (
                    <div className="ei-files">
                      {n.files.map((f) => (
                        <a className="ei-file" href={f.url} key={f.path}>
                          <span aria-hidden>⬇</span>
                          {f.name}
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

// 시험정보 전용 보조 스타일 — .llx 스코프. 토큰은 LandingStyle 정의를 상속.
function ExamStyle() {
  return (
    <style>{`
.llx .ei-two{display:grid;grid-template-columns:1fr 1fr;gap:18px}
.llx .ei-card{background:var(--lsurface);border:1px solid var(--line);border-radius:15px;padding:22px 22px 24px;box-shadow:var(--lshadow);display:flex;flex-direction:column;gap:16px}
.llx .ei-card.ei-tip{background:linear-gradient(160deg,var(--blue-wash),var(--lsurface))}
.llx .ei-ch{display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding-bottom:12px;border-bottom:1px solid var(--line)}
.llx .ei-ch h3{font-size:18px;font-weight:900;letter-spacing:-.02em}
.llx .ei-kind{font-size:12px;font-weight:800;color:var(--gilt);white-space:nowrap}
.llx .ei-cardp{font-size:13.5px;color:var(--soft);line-height:1.8}
.llx .ei-rows{display:flex;flex-direction:column;gap:2px}
.llx .ei-row{display:flex;gap:12px;padding:9px 0;border-top:1px solid var(--line);font-size:13.5px}
.llx .ei-row:first-child{border-top:0}
.llx .ei-k{color:var(--faint);font-weight:700;width:72px;flex-shrink:0}
.llx .ei-v{color:var(--ink);font-weight:700}
.llx .ei-subj{display:flex;flex-direction:column;gap:2px}
.llx .ei-subrow{display:flex;flex-direction:column;gap:2px;padding:9px 0;border-top:1px solid var(--line)}
.llx .ei-subrow:first-child{border-top:0}
.llx .ei-subrow b{font-size:14px;font-weight:800;color:var(--ink)}
.llx .ei-subrow span{font-size:13px;color:var(--soft);line-height:1.6}
.llx .ei-crit{font-size:12.5px;color:var(--soft);line-height:1.7;background:var(--blue-wash);border-radius:10px;padding:12px 14px;margin-top:auto}
.llx .ei-crit b{color:var(--blue-ink);font-weight:900;margin-right:6px}
.llx .ei-subhead{font-size:15px;font-weight:900;letter-spacing:-.02em;margin:26px 0 12px}
.llx .ei-table{overflow-x:auto;border:1px solid var(--line);border-radius:12px;background:var(--lsurface);box-shadow:var(--lshadow)}
.llx .ei-table table{border-collapse:collapse;width:100%;min-width:640px}
.llx .ei-table th,.llx .ei-table td{padding:11px 13px;text-align:left;font-size:13px;border-bottom:1px solid var(--line);white-space:nowrap;color:var(--soft)}
.llx .ei-table th{background:var(--lground);color:var(--ink);font-weight:900;position:sticky;top:0}
.llx .ei-table tr:last-child td{border-bottom:0}
.llx .ei-table td.ei-strong{color:var(--ink);font-weight:800}
.llx .ei-eng{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.llx .ei-engc{background:var(--lsurface);border:1px solid var(--line);border-radius:12px;padding:16px 14px;display:flex;flex-direction:column;gap:6px;box-shadow:var(--lshadow)}
.llx .ei-engn{font-size:12.5px;font-weight:800;color:var(--soft)}
.llx .ei-engs{font-size:24px;font-weight:900;color:var(--gilt);letter-spacing:-.02em}
.llx .ei-note{font-size:12px;color:var(--faint);line-height:1.7;margin-top:14px}
.llx .ei-bullets{margin:16px 0 0;padding-left:0;list-style:none;display:flex;flex-direction:column;gap:7px}
.llx .ei-bullets li{font-size:13px;color:var(--soft);line-height:1.7;display:flex;gap:8px}
.llx .ei-ol{margin:0;padding-left:0;list-style:none;display:flex;flex-direction:column;gap:9px}
.llx .ei-ol li{font-size:13.5px;color:var(--ink);line-height:1.6;display:flex;gap:8px}
.llx .ei-no{flex-shrink:0;display:inline-grid;place-items:center;min-width:19px;height:19px;padding:0 5px;border-radius:6px;background:var(--blue-wash);color:var(--blue-ink);font-size:11px;font-weight:800;font-variant-numeric:tabular-nums;margin-top:2px}
.llx .ei-faq{display:flex;flex-direction:column;gap:10px}
.llx details.ei-qa{background:var(--lsurface);border:1px solid var(--line);border-radius:12px;padding:2px 18px;box-shadow:var(--lshadow)}
.llx details.ei-qa summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:12px;padding:15px 0;font-weight:800;font-size:14.5px;color:var(--ink)}
.llx details.ei-qa summary::-webkit-details-marker{display:none}
.llx .ei-q{width:26px;height:26px;flex-shrink:0;display:grid;place-items:center;border-radius:8px;background:var(--blue-wash);color:var(--blue-ink);font-weight:900;font-size:13px}
.llx .ei-qt{flex:1;min-width:0}
.llx .ei-ar{margin-left:auto;color:var(--faint);transition:transform .2s;flex-shrink:0}
.llx details.ei-qa[open] .ei-ar{transform:rotate(180deg)}
.llx .ei-a{font-size:13.5px;color:var(--soft);line-height:1.85;padding:0 0 16px 38px;margin:0}
.llx .ei-src{font-size:12px;color:var(--faint);line-height:1.7;padding-top:18px;border-top:1px solid var(--line)}
.llx .ei-notices{display:flex;flex-direction:column;gap:12px}
.llx .ei-notice{background:var(--lsurface);border:1px solid var(--line);border-radius:12px;padding:16px 18px;box-shadow:var(--lshadow)}
.llx .ei-nhead{display:flex;align-items:baseline;justify-content:space-between;gap:14px}
.llx .ei-nt{font-size:15px;font-weight:800;color:var(--ink);line-height:1.4}
.llx .ei-nd{font-size:12.5px;color:var(--faint);white-space:nowrap;flex-shrink:0}
.llx .ei-nbody{font-size:13px;color:var(--soft);line-height:1.7;margin-top:8px;white-space:pre-wrap}
.llx .ei-files{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.llx .ei-file{display:inline-flex;align-items:center;gap:7px;font-size:13px;font-weight:700;color:var(--blue-ink);background:var(--blue-wash);border:1px solid var(--line);border-radius:8px;padding:7px 12px;transition:transform .14s,border-color .14s}
.llx .ei-file:hover{transform:translateY(-1px);border-color:var(--blue)}
.llx .ei-file span{font-size:12px;color:var(--gilt)}
@media (max-width:820px){
  .llx .ei-two{grid-template-columns:1fr}
  .llx .ei-eng{grid-template-columns:repeat(2,1fr)}
}
`}</style>
  );
}
