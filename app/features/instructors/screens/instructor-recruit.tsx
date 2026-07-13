// 강사 모집 안내 — /about/instructors/recruit. 공개. 강사소개 하단 "신규강사 채용" 대상.
//   콘텐츠 출처: source/강사모집.html. 강사소개와 동일한 .instr 테마(네이비·금박) 재사용.
import type { ReactNode } from "react";
import { Link } from "react-router";

import { InstructorStyle } from "../components/instructor-theme";

export function meta() {
  return [
    { title: "강사 모집 | 리담변리사학원" },
    {
      name: "description",
      content:
        "리담변리사학원 전문 강사진을 모집합니다. 모집 과목·우대사항·서류전형·제출 서류 안내.",
    },
  ];
}

const SUBJECTS = [
  "민법",
  "특허법",
  "상표법",
  "디자인보호법",
  "민사소송법",
  "물리",
  "화학",
  "지구과학",
  "생물",
  "2차 선택과목",
];
const PREFS = ["각 과목 전공자", "현직 변리사", "변리사 시험 합격자"];

function RecruitCard({
  no,
  title,
  children,
}: {
  no: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rc-card">
      <div className="rc-head">
        <span className="rc-no">{no}</span>
        <h2 className="i-serif">{title}</h2>
      </div>
      <div className="rc-body">{children}</div>
    </section>
  );
}

export default function InstructorRecruit() {
  return (
    <div className="instr">
      <InstructorStyle />
      <RecruitStyle />

      <header className="i-hero">
        <div
          className="i-wrap"
          style={{
            position: "relative",
            zIndex: 1,
            padding: "58px 24px 52px",
            textAlign: "center",
          }}
        >
          <p className="i-eyebrow">Lidam Recruitment</p>
          <h1
            className="i-serif"
            style={{
              fontSize: "clamp(30px,5vw,46px)",
              fontWeight: 700,
              margin: 0,
              lineHeight: 1.15,
            }}
          >
            강사 모집 안내
          </h1>
          <p
            style={{
              margin: "16px 0 0",
              color: "var(--i-herosoft)",
              fontSize: 16,
              lineHeight: 1.7,
              wordBreak: "keep-all",
            }}
          >
            변리사 시험의 기준을 함께 만들어갈{" "}
            <b style={{ color: "var(--i-gilts)" }}>전문 강사진</b>을 모집합니다.
          </p>
        </div>
      </header>

      <main className="i-wrap" style={{ padding: "44px 24px 72px", maxWidth: 920 }}>
        <p className="i-pull">
          리담은 단순히 지식을 전달하는 강사를 넘어,{" "}
          <span className="hl">수험생의 합격을 끝까지 함께 만들어갈</span> 분을
          찾습니다.
        </p>

        <RecruitCard no="01" title="모집 과목">
          <p style={{ margin: "0 0 16px", fontSize: 15, color: "var(--i-soft)" }}>
            변리사 시험에 해당하는{" "}
            <b style={{ color: "var(--i-ink)" }}>전 과목</b> 강사를 모집합니다.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {SUBJECTS.map((s) => (
              <span key={s} className="rc-pill">
                {s}
              </span>
            ))}
          </div>
        </RecruitCard>

        <RecruitCard no="02" title="우대사항">
          <ul className="i-tl" style={{ marginBottom: -14 }}>
            {PREFS.map((p) => (
              <li key={p}>
                <strong>{p}</strong>
              </li>
            ))}
          </ul>
        </RecruitCard>

        <RecruitCard no="03" title="서류전형 안내">
          <div className="rc-note">
            <div className="rc-note-h">평가 내용</div>
            변리사시험 전문강사로서 갖추어야 할 기본 자질·역량, 그리고 강의에
            대한 열정과 자세 등을 종합적으로 평가합니다.
          </div>
        </RecruitCard>

        <RecruitCard no="04" title="제출 서류">
          <div className="rc-table">
            <div className="rc-tr rc-th">
              <div>구분</div>
              <div>제출 내용</div>
            </div>
            <div className="rc-tr">
              <div>이력서</div>
              <div>자유 양식</div>
            </div>
            <div className="rc-tr">
              <div>증빙서류</div>
              <div>
                유효기간 이내의 공인 성적표 또는 자격증
                <br />
                <span style={{ fontSize: 13, color: "var(--i-faint)" }}>
                  ※ 이력서 내 해당 내용을 기재한 경우에 한하여 제출
                </span>
              </div>
            </div>
          </div>
        </RecruitCard>

        <div style={{ textAlign: "center", marginTop: 36 }}>
          <Link to="/lecture/support" className="i-btn primary">
            지원·문의하기
          </Link>
          <p style={{ marginTop: 12, fontSize: 13, color: "var(--i-faint)" }}>
            지원 서류 접수·문의는 고객센터를 통해 안내드립니다.
          </p>
        </div>

        <div style={{ marginTop: 26 }}>
          <Link to="/about/instructors" className="i-btn ghost">
            ← 강사소개로
          </Link>
        </div>
      </main>
    </div>
  );
}

// 강사 모집 전용 보조 스타일 — .instr 스코프. 토큰은 InstructorStyle 정의를 상속.
function RecruitStyle() {
  return (
    <style>{`
.instr .rc-card{background:var(--i-surface);border:1px solid var(--i-line);border-radius:16px;overflow:hidden;margin-top:20px;box-shadow:0 12px 34px -22px rgba(34,64,110,.34)}
.instr .rc-head{display:flex;align-items:center;gap:12px;padding:16px 22px;border-bottom:1px solid var(--i-line);background:linear-gradient(90deg,color-mix(in srgb,var(--i-gilt) 9%,transparent),transparent)}
.instr .rc-no{display:inline-grid;place-items:center;width:34px;height:34px;border-radius:9px;background:var(--i-navy);color:var(--i-gilts);font-weight:800;font-size:13px;font-variant-numeric:tabular-nums}
.instr .rc-head h2{font-size:19px;font-weight:700;margin:0}
.instr .rc-body{padding:22px}
.instr .rc-pill{padding:10px 16px;border-radius:999px;background:color-mix(in srgb,var(--i-gilt) 8%,var(--i-surface));border:1px solid color-mix(in srgb,var(--i-gilt) 30%,transparent);font-size:14px;font-weight:700;color:var(--i-blueink)}
.instr .rc-note{border-radius:14px;padding:18px;background:color-mix(in srgb,var(--i-gilt) 7%,var(--i-surface));border:1px solid color-mix(in srgb,var(--i-gilt) 22%,transparent);font-size:15px;color:var(--i-soft);line-height:1.7}
.instr .rc-note-h{font-size:14px;font-weight:800;color:var(--i-gilt);margin-bottom:8px}
.instr .rc-table{border:1px solid var(--i-line);border-radius:14px;overflow:hidden}
.instr .rc-tr{display:flex;border-top:1px solid var(--i-line)}
.instr .rc-tr:first-child{border-top:0}
.instr .rc-tr>div:first-child{width:34%;flex-shrink:0;padding:14px 16px;font-size:14px;color:var(--i-ink);border-right:1px solid var(--i-line);font-weight:600}
.instr .rc-tr>div:last-child{flex:1;padding:14px 16px;font-size:14px;color:var(--i-soft);line-height:1.6}
.instr .rc-th{background:var(--i-ground)}
.instr .rc-th>div{font-weight:800!important;color:var(--i-soft)!important}
`}</style>
  );
}
