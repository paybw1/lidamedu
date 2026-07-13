// feat-6-012 강사소개 — 공개 강사 상세(/about/instructors/:slug). 신뢰성 중심 편집 레이아웃.
import { Link, data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { listPasserSummaries } from "~/features/exam-results/analytics.server";
import { InstructorStyle } from "../components/instructor-theme";
import {
  getInstructorBySlug,
  getInstructorCourses,
  type InstructorDetail,
} from "../queries.server";

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
  // 이 강사의 강의(정밀 연결) + 학원 합격 후기(전체·동의 게이트 내장, 강사 귀속 아님).
  const [courses, passerRaw] = await Promise.all([
    getInstructorCourses(instructor.profileId),
    listPasserSummaries({ limit: 3, excludeSynthetic: true }),
  ]);
  const passers = passerRaw
    .filter((p) => p.summaryMd.trim().length > 0)
    .map((p) => ({
      examYear: p.examYear,
      displayName: p.displayName,
      excerpt:
        p.summaryMd.trim().slice(0, 140) +
        (p.summaryMd.trim().length > 140 ? "…" : ""),
    }));
  return { instructor, courses, passers };
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
  const { courses, passers } = loaderData;
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

        {/* 소통 채널 — 강사별 카페·블로그·유튜브 등 */}
        {it.links.length > 0 ? (
          <section className="i-sec">
            <div className="i-sechead">
              <h2 className="kr i-serif">소통 채널</h2>
              <span className="en">Community</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {it.links.map((l, i) => (
                <a
                  key={i}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="i-btn ghost"
                >
                  {l.label} ↗
                </a>
              ))}
            </div>
          </section>
        ) : null}

        {/* 이 강사의 강의 */}
        {courses.length > 0 ? (
          <section className="i-sec">
            <div className="i-sechead">
              <h2 className="kr i-serif">이 강사의 강의</h2>
              <span className="en">Courses</span>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {courses.map((c) => (
                <Link
                  key={c.code}
                  to="/lecture/catalog"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "16px 18px",
                    background: "var(--i-surface)",
                    border: "1px solid var(--i-line)",
                    borderRadius: 8,
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--i-blueink)",
                      background: "color-mix(in srgb, var(--i-blue) 12%, transparent)",
                      padding: "4px 9px",
                      borderRadius: 5,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {c.productKind === "tpass" ? "T-PASS" : "강의"}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 15 }}>{c.name}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 14, color: "var(--i-soft)" }}>
                    {c.priceKrw.toLocaleString("ko-KR")}원
                  </span>
                  <span style={{ color: "var(--i-faint)" }}>→</span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {/* 합격 후기 — 학원 전체 실데이터(동의 게이트), 강사 귀속 아님 */}
        {passers.length > 0 ? (
          <section className="i-sec">
            <div className="i-sechead">
              <h2 className="kr i-serif">합격 후기</h2>
              <span className="en">In Their Words</span>
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              {passers.map((p, i) => (
                <div
                  key={i}
                  style={{
                    background: "var(--i-surface)",
                    border: "1px solid var(--i-line)",
                    borderLeft: "3px solid var(--i-gilt)",
                    borderRadius: 8,
                    padding: "18px 22px",
                  }}
                >
                  <p className="i-serif" style={{ fontSize: 16, lineHeight: 1.6, margin: "0 0 10px", color: "var(--i-ink)" }}>
                    “{p.excerpt}”
                  </p>
                  <span style={{ fontSize: 12.5, color: "var(--i-faint)" }}>
                    — {p.displayName ?? "합격생"} · {p.examYear}년 합격
                  </span>
                </div>
              ))}
            </div>
            <p style={{ marginTop: 14, fontSize: 12.5, color: "var(--i-faint)" }}>
              리담변리사학원{" "}
              <Link to="/community/review" style={{ color: "var(--i-blueink)" }}>
                합격 수기
              </Link>
              의 검증된(공개 동의) 후기입니다.
            </p>
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
