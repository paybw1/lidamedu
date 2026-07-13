// 시험정보 — /lecture/exam-info. 공개 페이지. 강의 nav "리담안내" 하위.
//   콘텐츠는 exam_info.data(JSONB) 에서 로드, 행 없으면 기본값 폴백.
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
      "변리사 시험 일정·과목·합격 기준·영어 대체시험 인정 점수 안내. 2026년 기준 요약.",
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
  const {
    intro,
    schedule,
    firstSubjects,
    firstCriteria,
    secondRequired,
    secondElective,
    secondCriteria,
    english,
    englishNote,
    stats,
    source,
  } = loaderData.info;
  const { notices } = loaderData;

  return (
    <div className="llx">
      <LandingStyle />
      <ExamStyle />

      {/* 헤더 + 시험 일정 */}
      <section className="band">
        <div className="wrap" style={{ maxWidth: 980 }}>
          <div className="shead">
            <div>
              <p className="eyebrow">Exam Info</p>
              <h2>변리사 시험 정보</h2>
              {intro ? <p>{intro}</p> : null}
            </div>
          </div>

          <div className="ei-two">
            {schedule.map((s) => (
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
        </div>
      </section>

      {/* 시험 과목 & 합격 기준 */}
      <section className="band tint">
        <div className="wrap" style={{ maxWidth: 980 }}>
          <div className="shead">
            <div>
              <p className="eyebrow">Subjects</p>
              <h2>시험 과목 · 합격 기준</h2>
            </div>
          </div>

          <div className="ei-two">
            {/* 1차 */}
            <div className="ei-card">
              <div className="ei-ch">
                <h3>제1차 시험</h3>
                <span className="ei-kind">4과목 · 객관식</span>
              </div>
              <div className="ei-subj">
                {firstSubjects.map((s) => (
                  <div className="ei-subrow" key={s.name}>
                    <b>{s.name}</b>
                    <span>{s.desc}</span>
                  </div>
                ))}
              </div>
              {firstCriteria ? (
                <p className="ei-crit">
                  <b>합격</b> {firstCriteria}
                </p>
              ) : null}
            </div>

            {/* 2차 */}
            <div className="ei-card">
              <div className="ei-ch">
                <h3>제2차 시험</h3>
                <span className="ei-kind">필수 3 + 선택 1 · 논술</span>
              </div>
              <div className="ei-subj">
                <div className="ei-subrow">
                  <b>필수과목</b>
                  <span>{secondRequired}</span>
                </div>
                <div className="ei-subrow">
                  <b>선택과목</b>
                  <span>{secondElective}</span>
                </div>
              </div>
              {secondCriteria ? (
                <p className="ei-crit">
                  <b>합격</b> {secondCriteria}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* 영어 대체시험 + 통계 */}
      <section className="band">
        <div className="wrap" style={{ maxWidth: 980 }}>
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
            {english.map((e) => (
              <div className="ei-engc" key={e.name}>
                <span className="ei-engn">{e.name}</span>
                <span className="ei-engs tnum">{e.score}</span>
              </div>
            ))}
          </div>
          {englishNote ? <p className="ei-note">{englishNote}</p> : null}

          {stats.length ? (
            <div className="ei-stats">
              {stats.map((s) => (
                <div className="ei-stat" key={s.label}>
                  <b className="tnum">{s.value}</b>
                  <span>{s.label}</span>
                </div>
              ))}
            </div>
          ) : null}

          {source ? <p className="ei-src">{source}</p> : null}
        </div>
      </section>

      {/* 시험 공고(첨부 게시판) */}
      {notices.length ? (
        <section className="band tint">
          <div className="wrap" style={{ maxWidth: 980 }}>
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
.llx .ei-ch{display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding-bottom:12px;border-bottom:1px solid var(--line)}
.llx .ei-ch h3{font-size:18px;font-weight:900;letter-spacing:-.02em}
.llx .ei-kind{font-size:12px;font-weight:800;color:var(--gilt);white-space:nowrap}
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
.llx .ei-eng{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.llx .ei-engc{background:var(--lsurface);border:1px solid var(--line);border-radius:12px;padding:16px 14px;display:flex;flex-direction:column;gap:6px;box-shadow:var(--lshadow)}
.llx .ei-engn{font-size:12.5px;font-weight:800;color:var(--soft)}
.llx .ei-engs{font-size:24px;font-weight:900;color:var(--gilt);letter-spacing:-.02em}
.llx .ei-note{font-size:12px;color:var(--faint);line-height:1.7;margin-top:14px}
.llx .ei-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:26px}
.llx .ei-stat{background:linear-gradient(158deg,var(--navy),var(--navy2));border-radius:14px;padding:22px 18px;text-align:center;color:var(--hero-ink)}
.llx .ei-stat b{display:block;font-size:28px;font-weight:900;color:#fff;letter-spacing:-.03em}
.llx .ei-stat span{font-size:12.5px;color:var(--hero-soft);margin-top:6px;display:block}
.llx .ei-src{font-size:12px;color:var(--faint);line-height:1.7;margin-top:26px;padding-top:18px;border-top:1px solid var(--line)}
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
@media (max-width:520px){
  .llx .ei-stats{grid-template-columns:1fr}
}
`}</style>
  );
}
