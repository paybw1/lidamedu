import { SectionHeader } from "~/features/home/components/section-header";
import { PALETTE, Reveal } from "~/features/home/lib/landing";

// 1차(객관식) 법 과목 — 산업재산권법 3법 + 민법.
const LEGAL_FIRST = ["특허법", "상표법", "디자인보호법", "민법"];
// 2차(주관식) 법 과목 — 산업재산권법 3법 + 민사소송법.
const LEGAL_SECOND = ["특허법", "상표법", "디자인보호법", "민사소송법"];
const SCIENCE = ["물리", "화학", "생물", "지구과학"];

export function SubjectsSection() {
  return (
    <section
      aria-labelledby="subjects-h2"
      style={{
        maxWidth: 1200,
        margin: "0 auto",
        padding: "72px 24px",
      }}
    >
      <SectionHeader
        eyebrow="SUBJECTS"
        title="다루는 과목"
        subtitle="변리사 1차 + 2차, 그리고 1차 필수 자연과학 4과목까지 다룹니다."
      />
      <div
        style={{
          display: "grid",
          gap: 14,
          marginTop: 32,
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        }}
      >
        <Reveal
          as="article"
          style={{
            padding: 28,
            background: "var(--card)",
            borderRadius: 16,
            border: `1px solid ${PALETTE.line}`,
          }}
        >
          <div
            style={{
              font: "600 12px/1 Pretendard, sans-serif",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: PALETTE.link,
              marginBottom: 14,
            }}
          >
            법률 과목 · 1·2차
          </div>
          <div
            style={{
              font: "700 22px/1.3 Pretendard, sans-serif",
              color: PALETTE.ink,
              letterSpacing: "-0.02em",
              marginBottom: 6,
            }}
          >
            조문 · 판례 · 문제 3탭 구조
          </div>
          <div
            style={{
              font: "400 14px/1.6 Pretendard, sans-serif",
              color: PALETTE.inkSoft,
              marginBottom: 20,
              letterSpacing: "-0.01em",
            }}
          >
            법률은 조문에서 시작합니다. 판례와 문제가 따라오고, 본인 메모가 곁에
            남습니다.
          </div>
          {[
            { label: "1차 · 객관식", items: LEGAL_FIRST },
            { label: "2차 · 주관식", items: LEGAL_SECOND },
          ].map((g) => (
            <div key={g.label} style={{ marginBottom: 10 }}>
              <div
                style={{
                  font: "600 11px/1 Pretendard, sans-serif",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: PALETTE.inkSoft,
                  marginBottom: 8,
                }}
              >
                {g.label}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {g.items.map((l) => (
                  <span
                    key={l}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      background: PALETTE.tint,
                      color: PALETTE.link,
                      padding: "6px 12px",
                      borderRadius: 9999,
                      font: "500 13px/1 Pretendard, sans-serif",
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {l}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </Reveal>

        <Reveal
          delay={120}
          as="article"
          style={{
            padding: 28,
            background: PALETTE.gradientPeople,
            color: "#fff",
            borderRadius: 16,
            position: "relative",
            overflow: "hidden",
            boxShadow: "0 8px 24px rgba(45, 91, 168, 0.18)",
          }}
        >
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              right: -60,
              bottom: -60,
              width: 200,
              height: 200,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.18)",
            }}
          />
          <div
            style={{
              font: "600 12px/1 Pretendard, sans-serif",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.7)",
              marginBottom: 14,
              position: "relative",
            }}
          >
            자연과학 · 4
          </div>
          <div
            style={{
              font: "700 22px/1.3 Pretendard, sans-serif",
              letterSpacing: "-0.02em",
              marginBottom: 6,
              position: "relative",
            }}
          >
            1차 필수 · 객관식 문제 중심
          </div>
          <div
            style={{
              font: "400 14px/1.6 Pretendard, sans-serif",
              color: "rgba(255,255,255,0.78)",
              marginBottom: 20,
              letterSpacing: "-0.01em",
              position: "relative",
            }}
          >
            법률과 같은 학습 흐름 · 진도 추적 · 오답노트가 동일하게 적용됩니다.
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              position: "relative",
            }}
          >
            {SCIENCE.map((s) => (
              <span
                key={s}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: "rgba(255,255,255,0.14)",
                  color: "#fff",
                  padding: "6px 12px",
                  borderRadius: 9999,
                  font: "500 13px/1 Pretendard, sans-serif",
                  letterSpacing: "-0.01em",
                }}
              >
                <span
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    background: PALETTE.accent,
                  }}
                />
                {s}
              </span>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
