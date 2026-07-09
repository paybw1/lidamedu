// feat-6-012 강사소개 — 공개 강사진 목록(/about/instructors). 계열별 카드 그리드.
import { Link } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  type InstructorCategory,
} from "../labels";
import { InstructorStyle } from "../components/instructor-theme";
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

function Card({ it }: { it: InstructorCard }) {
  return (
    <Link className="i-card" to={`/about/instructors/${it.slug}`}>
      <span className="i-cmono">
        {it.photoPath ? (
          <img src={it.photoPath} alt={it.name} />
        ) : (
          <>
            <span className="fr" />
            <span className="m">{it.monogram ?? it.name.slice(0, 1)}</span>
          </>
        )}
      </span>
      <span style={{ minWidth: 0 }}>
        <span className="i-cnm">{it.name}</span>
        <br />
        <span className="i-subj">{it.subjectLabel}</span>
        <span className="i-cr">{it.roleLabel ?? it.headline ?? ""}</span>
      </span>
    </Link>
  );
}

export default function InstructorsIndex({ loaderData }: Route.ComponentProps) {
  const { groups } = loaderData;
  return (
    <div className="instr">
      <InstructorStyle />
      <header className="i-hero">
        <div
          className="i-wrap"
          style={{ position: "relative", zIndex: 1, padding: "58px 24px 52px", textAlign: "center" }}
        >
          <p className="i-eyebrow">리담안내 · 강사진</p>
          <h1
            className="i-serif"
            style={{ fontSize: "clamp(32px,5vw,48px)", fontWeight: 700, margin: "0 0 12px", lineHeight: 1.1 }}
          >
            가르치는 사람이 곧 교재입니다
          </h1>
          <p style={{ color: "var(--i-herosoft)", maxWidth: "46ch", margin: "0 auto", fontSize: 15.5 }}>
            조문·판례·문제를 한 체계로 엮어 온 리담의 전임 강사진을 소개합니다.
          </p>
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
      </main>
    </div>
  );
}
