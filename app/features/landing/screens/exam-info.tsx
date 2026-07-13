// 시험정보 — /lecture/exam-info. 공개 정적 페이지. 강의 nav "리담안내" 하위.
//   데이터 출처: 특허청·한국산업인력공단 변리사 국가자격시험 공고(2026) 요약.
//   정적 참고자료(연 1회 갱신) — /about·/location 과 동일한 하드코딩 패턴.
import { LandingStyle } from "../components/landing-style";

import type { Route } from "./+types/exam-info";

export const meta: Route.MetaFunction = () => [
  { title: "시험정보 | 리담변리사학원" },
  {
    name: "description",
    content:
      "변리사 시험 일정·과목·합격 기준·영어 대체시험 인정 점수 안내. 2026년 기준 요약.",
  },
];

// ── 시험 일정(2026) ──
const SCHEDULE: { round: string; kind: string; rows: [string, string][] }[] = [
  {
    round: "제1차 시험",
    kind: "객관식 5지선다",
    rows: [
      ["원서접수", "2026. 1. 12.(월) 09:00 ~ 1. 16.(금) 18:00"],
      ["시험일", "2026. 2. 28.(토)"],
      ["합격자 발표", "2026. 3. 25.(수)"],
    ],
  },
  {
    round: "제2차 시험",
    kind: "주관식 논술",
    rows: [
      ["원서접수", "2026. 4. 20.(월) 09:00 ~ 4. 24.(금) 18:00"],
      ["시험일", "2026. 7. 31.(금) ~ 8. 1.(토)"],
      ["합격자 발표", "2026. 10. 28.(수)"],
    ],
  },
];

// ── 1차 과목 ──
const FIRST_SUBJECTS: [string, string][] = [
  ["산업재산권법", "특허법·실용신안법, 상표법, 디자인보호법"],
  ["민법개론", "친족·상속법 제외"],
  ["자연과학개론", "물리·화학·생물·지구과학"],
  ["영어", "공인 어학시험 성적으로 대체"],
];

// ── 2차 과목 ──
const SECOND_REQUIRED = ["특허법", "상표법", "민사소송법"];

// ── 영어 대체시험 인정 점수(일반 응시자 기준) ──
const ENGLISH: [string, string][] = [
  ["TOEIC", "775"],
  ["TOEFL (PBT)", "560"],
  ["TOEFL (iBT)", "83"],
  ["TEPS", "385"],
  ["G-TELP", "77 (Level-2)"],
  ["FLEX", "700"],
  ["IELTS", "5"],
];

// ── 주요 통계(2025년 제1차) ──
const STATS: [string, string][] = [
  ["3,541명", "2025년 제1차 응시"],
  ["661명", "2025년 제1차 합격"],
  ["5.99 : 1", "2025년 최종 경쟁률"],
];

export default function ExamInfo() {
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
              <p>
                산업재산권 분야 유일의 국가전문자격. 1차(객관식)·2차(논술)로
                치러지며, 아래는 2026년 시행 기준 요약입니다.
              </p>
            </div>
          </div>

          <div className="ei-two">
            {SCHEDULE.map((s) => (
              <div className="ei-card" key={s.round}>
                <div className="ei-ch">
                  <h3>{s.round}</h3>
                  <span className="ei-kind">{s.kind}</span>
                </div>
                <div className="ei-rows">
                  {s.rows.map(([k, v]) => (
                    <div className="ei-row" key={k}>
                      <span className="ei-k">{k}</span>
                      <span className="ei-v tnum">{v}</span>
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
                {FIRST_SUBJECTS.map(([name, desc]) => (
                  <div className="ei-subrow" key={name}>
                    <b>{name}</b>
                    <span>{desc}</span>
                  </div>
                ))}
              </div>
              <p className="ei-crit">
                <b>합격</b> 매 과목 40점 이상, 전 과목 평균 60점 이상 득점자
                중 고득점자순으로 선발예정인원(600명, 동점자 포함) 결정
              </p>
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
                  <span>{SECOND_REQUIRED.join(", ")}</span>
                </div>
                <div className="ei-subrow">
                  <b>선택과목</b>
                  <span>19개 과목 중 1개 선택 (50점 이상 합격 · Pass)</span>
                </div>
              </div>
              <p className="ei-crit">
                <b>합격</b> 필수과목 매 과목 40점 이상·평균 60점 이상, 선택과목
                50점 이상. 필수과목 성적으로 고득점자순 선발
              </p>
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
            {ENGLISH.map(([name, score]) => (
              <div className="ei-engc" key={name}>
                <span className="ei-engn">{name}</span>
                <span className="ei-engs tnum">{score}</span>
              </div>
            ))}
          </div>
          <p className="ei-note">
            ※ 인정 성적: 2022. 4. 27. ~ 2026. 1. 16. 사이 응시하고 접수마감일까지
            발표된 성적. 청각장애인 등 별도 기준은 공식 공고를 확인하세요.
          </p>

          <div className="ei-stats">
            {STATS.map(([n, l]) => (
              <div className="ei-stat" key={l}>
                <b className="tnum">{n}</b>
                <span>{l}</span>
              </div>
            ))}
          </div>

          <p className="ei-src">
            본 정보는 특허청·한국산업인력공단 공고를 요약한 참고자료입니다.
            정확한 일정·기준·점수는 반드시 큐넷(Q-Net) 및 특허청 공식 공고를
            확인하시기 바랍니다.
          </p>
        </div>
      </section>
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
