// feat-6-012 강사소개 — 공개 강사진 목록(/about/instructors). 계열별 카드 그리드.
import { Link } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  type InstructorCategory,
} from "../labels";
import { InstructorStyle } from "../components/instructor-theme";
import { AboutSectionNav } from "~/features/home/components/about-section-nav";
import { listInstructors, type InstructorCard } from "../queries.server";

import type { Route } from "./+types/instructors-index";

export function meta() {
  return [
    { title: "강사진 | 리담변리사학원" },
    {
      name: "description",
      content:
        "조문·판례·문제를 한 체계로 엮어 온 리담변리사학원 전임 강사진을 소개합니다.",
    },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const all = await listInstructors(client);
  const groups = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    items: all.filter((i) => i.category === cat),
  })).filter((g) => g.items.length > 0);
  return { groups };
}

// 과목 중복 제거 — role_label("특허법 전임")에는 과목명이 다시 들어있다. 과목 배지로
// 이미 표시하므로 역할 부분만 남긴다. 예: "특허법 전임"→"전임", "자연과학(물리) 전임"→"자연과학 전임".
function roleTail(role: string | null, subject: string): string | null {
  if (!role) return null;
  const t = role
    .split(subject)
    .join(" ")
    .replace(/\(\s*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t && t !== subject ? t : null;
}

function Card({ it }: { it: InstructorCard }) {
  const role = roleTail(it.roleLabel, it.subjectLabel);
  return (
    <Link className="i-card" to={`/about/instructors/${it.slug}`}>
      <div className="i-photo">
        {it.photoPath ? (
          <img src={it.photoPath} alt={it.name} loading="lazy" />
        ) : (
          <div className="i-phf">
            <span>{it.monogram ?? it.name.slice(0, 1)}</span>
          </div>
        )}
      </div>
      <div className="i-cbody">
        <div className="i-cnm">{it.name}</div>
        <div className="i-cmeta">
          <span className="i-subj">{it.subjectLabel}</span>
          {role ? <span className="i-role">{role}</span> : null}
        </div>
      </div>
    </Link>
  );
}

export default function InstructorsIndex({ loaderData }: Route.ComponentProps) {
  const { groups } = loaderData;
  return (
    <div className="instr">
      <InstructorStyle />
      {/* 리담안내 섹션 공용 서브내비 — 먼저 나오고 고정(sticky). 그다음 강사진 히어로·목록. */}
      <AboutSectionNav />
      <header className="i-hero">
        <div
          className="i-wrap"
          style={{ position: "relative", zIndex: 1, padding: "58px 24px 52px", textAlign: "center" }}
        >
          <p className="i-eyebrow">리담안내 · 강사진</p>
          <h1
            className="i-serif"
            style={{ fontSize: "clamp(32px,5vw,48px)", fontWeight: 700, margin: 0, lineHeight: 1.1 }}
          >
            가르치는 사람이 곧 교재입니다
          </h1>
        </div>
      </header>

      <main className="i-wrap" style={{ padding: "44px 24px 72px", maxWidth: 1040 }}>
        {groups.map((g) => (
          <section key={g.category} style={{ marginBottom: 40 }}>
            <div className="i-grouphead">
              <h2 className="kr">{CATEGORY_LABEL[g.category as InstructorCategory].kr}</h2>
              <span className="en">{CATEGORY_LABEL[g.category as InstructorCategory].en}</span>
              <span className="ct">전임 {g.items.length}</span>
            </div>
            <div className="i-grid">
              {g.items.map((it) => (
                <Card key={it.instructorId} it={it} />
              ))}
            </div>
          </section>
        ))}

        {/* 신규강사 채용 CTA — 클릭 시 강사 모집 안내 페이지로 */}
        <section
          style={{
            marginTop: 8,
            textAlign: "center",
            paddingTop: 34,
            borderTop: "1px solid var(--i-line)",
          }}
        >
          <p style={{ margin: "0 0 18px", color: "var(--i-soft)", fontSize: 15 }}>
            리담과 함께 변리사 시험의 기준을 만들어갈 전문 강사진을 모십니다.
          </p>
          <Link to="/about/instructors/recruit" className="i-btn primary">
            신규강사 채용
          </Link>
        </section>
      </main>
    </div>
  );
}
