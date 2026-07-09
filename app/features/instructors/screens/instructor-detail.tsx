// feat-6-012 강사소개 — 공개 강사 상세(/about/instructors/:slug). 신뢰성 중심 편집 레이아웃.
import { Link, data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { InstructorStyle } from "../components/instructor-theme";
import { getInstructorBySlug, type InstructorDetail } from "../queries.server";

import type { Route } from "./+types/instructor-detail";

export function meta({ data: d }: Route.MetaArgs) {
  const n = d?.instructor?.name;
  return [{ title: n ? `${n} 강사 | 리담변리사학원` : "강사소개 | 리담변리사학원" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  if (!params.slug) throw data("Not found", { status: 404 });
  const instructor = await getInstructorBySlug(client, params.slug);
  if (!instructor) throw data("강사를 찾을 수 없습니다", { status: 404 });
  return { instructor };
}

function Portrait({ it }: { it: InstructorDetail }) {
  return (
    <div className="i-mono" style={{ width: 190 }}>
      {it.photoPath ? (
        <img
          src={it.photoPath}
          alt={it.name}
          style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 4 }}
        />
      ) : (
        <>
          <span className="fr" />
          <span style={{ fontSize: 72 }}>{it.monogram ?? it.name.slice(0, 1)}</span>
        </>
      )}
    </div>
  );
}

export default function InstructorDetailScreen({ loaderData }: Route.ComponentProps) {
  const it = loaderData.instructor;
  const philoParas = (it.philosophyMd ?? "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const hasCred = it.education.length > 0 || it.career.length > 0;

  return (
    <div className="instr">
      <InstructorStyle />

      {/* HERO */}
      <header className="i-hero">
        <div
          className="i-wrap i-heroinner"
          style={{
            display: "grid",
            gridTemplateColumns: "190px 1fr",
            gap: 40,
            alignItems: "center",
            padding: "60px 24px 56px",
            position: "relative",
            zIndex: 1,
          }}
        >
          <Portrait it={it} />
          <div>
            <p className="i-eyebrow">리담안내 · 강사진</p>
            <h1 className="i-serif" style={{ fontSize: "clamp(36px,6vw,56px)", fontWeight: 700, margin: "0 0 6px", lineHeight: 1.05 }}>
              {it.name}
            </h1>
            <p style={{ color: "var(--i-herosoft)", fontSize: 15, margin: "0 0 20px" }}>
              {it.roleLabel ? (
                <strong style={{ color: "var(--i-heroink)", fontWeight: 600 }}>{it.roleLabel}</strong>
              ) : null}
              {it.roleLabel && it.title ? " · " : ""}
              {it.title}
            </p>
            {it.headline ? (
              <p
                className="i-serif"
                style={{
                  fontSize: "clamp(18px,2.4vw,23px)",
                  lineHeight: 1.55,
                  color: "var(--i-heroink)",
                  maxWidth: "32ch",
                  margin: 0,
                  borderLeft: "2px solid var(--i-gilts)",
                  paddingLeft: 18,
                }}
              >
                {it.headline}
              </p>
            ) : null}
          </div>
        </div>
      </header>

      {/* TRUST BAR */}
      {it.metrics.length > 0 ? (
        <div style={{ background: "var(--i-surface)", borderBottom: "1px solid var(--i-line)" }}>
          <div
            className="i-wrap"
            style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(it.metrics.length, 4)},1fr)`, padding: 0 }}
          >
            {it.metrics.slice(0, 4).map((m, i) => (
              <div className="i-metric" key={i}>
                <div className="i-num">
                  {m.value}
                  {m.unit ? <span className="u">{m.unit}</span> : null}
                </div>
                <div className="i-mlab">{m.label}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <main className="i-wrap">
        {/* 약력 */}
        {hasCred ? (
          <section className="i-sec">
            <div className="i-sechead">
              <h2 className="kr i-serif">약력</h2>
              <span className="en">Credentials</span>
            </div>
            <div className="i-cred" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 34 }}>
              {it.education.length > 0 ? (
                <div>
                  <h3 className="i-h3">학력</h3>
                  <ul className="i-tl">
                    {it.education.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {it.career.length > 0 ? (
                <div>
                  <h3 className="i-h3">경력</h3>
                  <ul className="i-tl">
                    {it.career.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {/* 저술 */}
        {it.books.length > 0 ? (
          <section className="i-sec">
            <div className="i-sechead">
              <h2 className="kr i-serif">저술</h2>
              <span className="en">Published Works</span>
            </div>
            <div className="i-books">
              {it.books.map((b, i) => (
                <div className="i-book" key={i}>
                  <div className="cov">
                    <span className="bt">{b.title}</span>
                  </div>
                  {b.label ? <div className="cap">{b.label}</div> : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* 강의 철학 */}
        {philoParas.length > 0 ? (
          <section className="i-sec">
            <div className="i-sechead">
              <h2 className="kr i-serif">강의 철학</h2>
              <span className="en">Teaching</span>
            </div>
            <div style={{ maxWidth: "62ch" }}>
              <p className="i-pull i-serif">“{philoParas[0]}”</p>
              {philoParas.slice(1).map((p, i) => (
                <p key={i} style={{ fontSize: 15.5, color: "var(--i-soft)", margin: "0 0 16px" }}>
                  {p}
                </p>
              ))}
            </div>
          </section>
        ) : null}

        {/* CTA */}
        <section className="i-sec" style={{ borderBottom: 0, textAlign: "center", padding: "56px 0 68px" }}>
          <h2 className="i-serif" style={{ fontSize: 26, margin: "0 0 8px", fontWeight: 700 }}>
            {it.name} 강사와 함께 시작하세요
          </h2>
          <p style={{ color: "var(--i-soft)", margin: "0 0 24px" }}>강의 안내와 수강 신청을 확인해 보세요.</p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link className="i-btn primary" to="/lecture/catalog">
              강의 보러가기 →
            </Link>
            <Link className="i-btn ghost" to="/about/instructors">
              강사진 전체
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
