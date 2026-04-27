import { Link } from "react-router";

import {
  COZY_BASE,
  COZY_FONT_STACK,
  COZY_INK,
  COZY_INK_SOFT,
  COZY_LINE,
  COZY_PALETTES,
} from "~/core/lib/cozy-tokens";
import i18next from "~/core/lib/i18next.server";

import type { Route } from "./+types/home";

export const meta: Route.MetaFunction = ({ data }) => {
  return [
    { title: data?.title },
    { name: "description", content: data?.subtitle },
  ];
};

export async function loader({ request }: Route.LoaderArgs) {
  const t = await i18next.getFixedT(request);
  return {
    title: t("home.title"),
    subtitle: t("home.subtitle"),
  };
}

const palette = COZY_PALETTES.sage;

const FEATURES = [
  {
    badge: "01",
    title: "메뉴 진입 트리",
    body: "과목 → 조문 · 판례 · 문제로 자연스럽게 깊이 들어갑니다. 클릭 한 번으로 도달할 수 있는 학습 단위.",
  },
  {
    badge: "02",
    title: "조문 ↔ 판례 ↔ 문제",
    body: "어떤 화면에서 진입하든 관련 자료가 곁에 있습니다. 끊김 없이 잇고, 흐름을 잃지 않게.",
  },
  {
    badge: "03",
    title: "최신 정보 자동 추적",
    body: "법 개정, 신규 판례, 신규 문제, 논문이 한 곳에 자동 집계됩니다. 매일 ‘무엇이 새로 올라왔는지’ 한 눈에.",
  },
  {
    badge: "04",
    title: "과목 특성별 학습 구조",
    body: "법률 과목은 조문·판례·문제 3탭, 자연과학은 문제 중심. 같은 시간을 들여도 결이 맞는 학습.",
  },
];

const SUBJECTS = {
  legal: [
    { name: "특허법", group: "산업재산권법" },
    { name: "상표법", group: "산업재산권법" },
    { name: "디자인보호법", group: "산업재산권법" },
    { name: "민법", group: null },
    { name: "민사소송법", group: null },
  ],
  science: ["물리", "화학", "생물", "지구과학"],
};

const STEPS = [
  {
    n: "STEP 1",
    title: "학습 목표 설정",
    body: "시험 일자와 목표 점수를 기준으로, 매일의 권장 진도가 자동 계산됩니다.",
  },
  {
    n: "STEP 2",
    title: "조문 → 판례 → 문제",
    body: "한 흐름으로 깊이 들어가며, 메모와 하이라이트로 자기만의 노트를 쌓아갑니다.",
  },
  {
    n: "STEP 3",
    title: "약점·진도 한 눈에",
    body: "히트맵, 정답률, 연속 학습일이 대시보드에 모입니다. 다음에 무엇을 풀지 추천도.",
  },
];

export default function Home() {
  return (
    <div
      style={{
        background: COZY_BASE,
        color: COZY_INK,
        fontFamily: COZY_FONT_STACK,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* paper grain */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          opacity: 0.35,
          backgroundImage: `radial-gradient(${palette.soft}55 1px, transparent 1px)`,
          backgroundSize: "4px 4px",
          zIndex: 0,
        }}
      />

      <Hero />
      <FeaturesSection />
      <SubjectsSection />
      <PreviewSection />
      <FlowSection />
      <FinalCta />
    </div>
  );
}

function Hero() {
  return (
    <section
      style={{
        position: "relative",
        zIndex: 1,
        padding: "84px 24px 64px",
        maxWidth: 1200,
        margin: "0 auto",
        display: "grid",
        gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 1fr)",
        gap: 48,
        alignItems: "center",
      }}
      className="hero"
    >
      <div>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 12px",
            borderRadius: 999,
            background: palette.tint,
            color: palette.primary,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: palette.accent,
            }}
          />
          리담 변리사 학원
        </div>
        <h1
          style={{
            margin: "20px 0 0",
            fontSize: "clamp(34px, 5vw, 56px)",
            fontWeight: 700,
            lineHeight: 1.15,
            letterSpacing: "-0.025em",
          }}
        >
          변리사 시험,
          <br />
          한 곳에서 차근차근.
        </h1>
        <p
          style={{
            margin: "20px 0 0",
            fontSize: 17,
            lineHeight: 1.65,
            color: COZY_INK_SOFT,
            maxWidth: 520,
          }}
        >
          조문 · 판례 · 문제 · 논문이 끊김 없이 이어지는 학습 플랫폼.
          <br />
          매일의 진도를 따뜻하게 받쳐주는, 카공 같은 책상이 되어 드릴게요.
        </p>

        <div
          style={{
            display: "flex",
            gap: 12,
            marginTop: 32,
            flexWrap: "wrap",
          }}
        >
          <Link
            to="/join"
            style={{
              ...buttonBase,
              background: palette.primary,
              color: "#FFF",
              boxShadow: "0 4px 18px rgba(63, 90, 74, 0.24)",
            }}
          >
            무료로 시작하기
          </Link>
          <Link
            to="/login"
            style={{
              ...buttonBase,
              background: "transparent",
              color: palette.primary,
              border: `1.5px solid ${palette.primary}`,
            }}
          >
            로그인
          </Link>
        </div>

        <div
          style={{
            display: "flex",
            gap: 28,
            marginTop: 36,
            flexWrap: "wrap",
            color: COZY_INK_SOFT,
            fontSize: 13,
          }}
        >
          <Stat icon="🔥" label="평균 23일 연속 학습" />
          <Stat icon="📚" label="5 법률 + 4 자연과학" />
          <Stat icon="🌿" label="조문·판례·문제 통합" />
        </div>
      </div>

      <HeroPreview />
    </section>
  );
}

function Stat({ icon, label }: { icon: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span>{label}</span>
    </div>
  );
}

function HeroPreview() {
  return (
    <div
      className="hero-preview"
      style={{
        position: "relative",
        background: "#FFF",
        border: `1px solid ${COZY_LINE}`,
        borderRadius: 24,
        padding: 22,
        boxShadow: "0 24px 60px rgba(107,66,38,0.12)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 18,
        }}
      >
        <div>
          <div style={{ fontSize: 11, color: COZY_INK_SOFT }}>
            2026년 4월 27일 · 월요일
          </div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              marginTop: 4,
              letterSpacing: "-0.01em",
            }}
          >
            어서오세요, 지원님 ☕
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 12px",
            borderRadius: 999,
            border: `1.5px solid ${palette.primary}`,
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: palette.primary,
              color: "#FFF",
              display: "grid",
              placeItems: "center",
              fontFamily: "Georgia, serif",
              fontWeight: 700,
              fontSize: 11,
            }}
          >
            D-87
          </div>
          <div style={{ fontSize: 11, color: COZY_INK_SOFT }}>1차 시험까지</div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 8,
          marginBottom: 14,
        }}
      >
        {[
          { label: "학습", value: "186h" },
          { label: "문제", value: "1,248" },
          { label: "정답률", value: "74%" },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              background: palette.tint,
              borderRadius: 12,
              padding: "10px 12px",
              textAlign: "center",
            }}
          >
            <div
              style={{ fontSize: 10, color: COZY_INK_SOFT, marginBottom: 3 }}
            >
              {s.label}
            </div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: palette.primary,
                fontVariantNumeric: "tabular-nums",
                letterSpacing: "-0.01em",
              }}
            >
              {s.value}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          background: "#FBF7EF",
          border: `1px solid ${COZY_LINE}`,
          borderRadius: 14,
          padding: 14,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: palette.primary,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            marginBottom: 10,
          }}
        >
          오늘의 학습 계획
        </div>
        {[
          { text: "특허법 강의 14·15강 시청", done: true, meta: "90분" },
          { text: "신규성 기출문제 30제 풀이", done: true, meta: "60분" },
          { text: "오답노트 2회독", done: false, meta: "30분" },
        ].map((it, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 0",
              borderBottom:
                i < 2 ? `1px dashed ${COZY_LINE}` : "none",
            }}
          >
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: 6,
                background: it.done ? palette.primary : "transparent",
                border: `1.5px solid ${it.done ? palette.primary : "#C9B9A6"}`,
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
              }}
            >
              {it.done ? (
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M2.5 6.2l2.4 2.3L9.5 3.5"
                    stroke="#FFF"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : null}
            </span>
            <span
              style={{
                flex: 1,
                fontSize: 12.5,
                color: it.done ? COZY_INK_SOFT : COZY_INK,
                textDecoration: it.done ? "line-through" : "none",
              }}
            >
              {it.text}
            </span>
            <span
              style={{
                fontSize: 11,
                color: COZY_INK_SOFT,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {it.meta}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FeaturesSection() {
  return (
    <section
      style={{
        position: "relative",
        zIndex: 1,
        padding: "60px 24px",
        maxWidth: 1200,
        margin: "0 auto",
      }}
    >
      <SectionHeader
        eyebrow="WHY LIDAM"
        title="혼자 공부할 때 가장 필요한 것"
        subtitle="흐름을 잃지 않고, 매일 한 걸음 나아가는 감각."
      />
      <div
        className="features-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 16,
          marginTop: 40,
        }}
      >
        {FEATURES.map((f) => (
          <div
            key={f.badge}
            style={{
              background: "#FFF",
              border: `1px solid ${COZY_LINE}`,
              borderRadius: 18,
              padding: 22,
              boxShadow: "0 2px 16px rgba(107,66,38,0.06)",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: palette.tint,
                color: palette.primary,
                display: "grid",
                placeItems: "center",
                fontFamily: "Georgia, serif",
                fontWeight: 700,
                fontSize: 13,
                letterSpacing: "0.02em",
              }}
            >
              {f.badge}
            </div>
            <h3
              style={{
                margin: 0,
                fontSize: 16,
                fontWeight: 700,
                letterSpacing: "-0.01em",
              }}
            >
              {f.title}
            </h3>
            <p
              style={{
                margin: 0,
                fontSize: 13.5,
                lineHeight: 1.6,
                color: COZY_INK_SOFT,
              }}
            >
              {f.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function SubjectsSection() {
  return (
    <section
      style={{
        position: "relative",
        zIndex: 1,
        padding: "60px 24px",
        maxWidth: 1200,
        margin: "0 auto",
      }}
    >
      <SectionHeader
        eyebrow="SUBJECTS"
        title="다루는 과목"
        subtitle="변리사 1차 + 2차, 그리고 1차 선택 자연과학 4과목까지."
      />
      <div
        className="subjects-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "1.5fr 1fr",
          gap: 18,
          marginTop: 40,
        }}
      >
        <div
          style={{
            background: "#FFF",
            border: `1px solid ${COZY_LINE}`,
            borderRadius: 20,
            padding: "26px 28px",
            boxShadow: "0 2px 16px rgba(107,66,38,0.06)",
          }}
        >
          <SubjectsCol
            label="법률 과목 · 5"
            sub="조문 · 판례 · 문제 3탭 구조"
            chips={SUBJECTS.legal}
            tone="primary"
          />
        </div>
        <div
          style={{
            background: palette.primary,
            color: "#F8EFE3",
            borderRadius: 20,
            padding: "26px 28px",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            aria-hidden
            style={{
              position: "absolute",
              right: -40,
              bottom: -40,
              width: 160,
              height: 160,
              borderRadius: "50%",
              background: palette.accent,
              opacity: 0.25,
            }}
          />
          <SubjectsCol
            label="자연과학 · 4"
            sub="1차 선택 · 객관식 문제 중심"
            chips={SUBJECTS.science.map((name) => ({ name, group: null }))}
            tone="dark"
          />
        </div>
      </div>
    </section>
  );
}

function SubjectsCol({
  label,
  sub,
  chips,
  tone,
}: {
  label: string;
  sub: string;
  chips: { name: string; group: string | null }[];
  tone: "primary" | "dark";
}) {
  const isDark = tone === "dark";
  return (
    <div style={{ position: "relative", zIndex: 1 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: isDark ? "rgba(248,239,227,0.65)" : palette.primary,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 14,
          color: isDark ? "rgba(248,239,227,0.85)" : COZY_INK_SOFT,
          marginBottom: 18,
        }}
      >
        {sub}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {chips.map((c) => (
          <span
            key={c.name}
            style={{
              padding: "8px 14px",
              borderRadius: 999,
              background: isDark
                ? "rgba(255,255,255,0.12)"
                : palette.tint,
              border: isDark
                ? "1px solid rgba(255,255,255,0.18)"
                : `1px solid ${palette.soft}`,
              color: isDark ? "#F8EFE3" : palette.primary,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {c.name}
            {c.group ? (
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 500,
                  marginLeft: 6,
                  opacity: 0.75,
                }}
              >
                · {c.group}
              </span>
            ) : null}
          </span>
        ))}
      </div>
    </div>
  );
}

function PreviewSection() {
  return (
    <section
      style={{
        position: "relative",
        zIndex: 1,
        padding: "60px 24px",
        maxWidth: 1200,
        margin: "0 auto",
      }}
    >
      <div
        style={{
          background: "#FBF7EF",
          border: `1px solid ${COZY_LINE}`,
          borderRadius: 24,
          padding: "40px 32px",
          display: "grid",
          gridTemplateColumns: "1fr 1.2fr",
          gap: 36,
          alignItems: "center",
        }}
        className="preview-card"
      >
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: palette.primary,
              marginBottom: 10,
            }}
          >
            DASHBOARD
          </div>
          <h2
            style={{
              margin: 0,
              fontSize: "clamp(24px, 3.4vw, 34px)",
              fontWeight: 700,
              lineHeight: 1.25,
              letterSpacing: "-0.02em",
            }}
          >
            오늘 무엇을, 얼마나
            <br />
            해야 하는지가 또렷해집니다.
          </h2>
          <p
            style={{
              margin: "16px 0 0",
              fontSize: 15,
              lineHeight: 1.7,
              color: COZY_INK_SOFT,
            }}
          >
            D-day, 연속 학습일, 과목별 진도, 약점 지표가 한 화면에. 작은
            성취가 매일 쌓이는 감각.
          </p>
          <Link
            to="/dashboard"
            style={{
              ...buttonBase,
              marginTop: 24,
              background: palette.primary,
              color: "#FFF",
              fontSize: 14,
            }}
          >
            대시보드 둘러보기 →
          </Link>
        </div>
        <DashboardMosaic />
      </div>
    </section>
  );
}

function DashboardMosaic() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 12,
      }}
    >
      <MosaicCard label="진도" big={"72%"} note="특허법 38h" />
      <MosaicCard label="히트맵" mosaicHeatmap />
      <MosaicCard label="이번 주" big="19.6h" note="목표 25h" tinted />
      <MosaicCard label="문제" big="1,248" note="정답률 74.2%" />
    </div>
  );
}

function MosaicCard({
  label,
  big,
  note,
  tinted,
  mosaicHeatmap,
}: {
  label: string;
  big?: string;
  note?: string;
  tinted?: boolean;
  mosaicHeatmap?: boolean;
}) {
  return (
    <div
      style={{
        background: tinted ? palette.primary : "#FFF",
        color: tinted ? "#F8EFE3" : COZY_INK,
        border: `1px solid ${tinted ? "transparent" : COZY_LINE}`,
        borderRadius: 14,
        padding: 14,
        boxShadow: tinted
          ? "0 8px 24px rgba(63,90,74,0.18)"
          : "0 2px 12px rgba(107,66,38,0.05)",
        minHeight: 110,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: tinted ? "rgba(248,239,227,0.7)" : palette.primary,
        }}
      >
        {label}
      </div>
      {mosaicHeatmap ? (
        <MiniHeatmap />
      ) : (
        <>
          <div
            style={{
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              fontVariantNumeric: "tabular-nums",
              marginTop: 6,
            }}
          >
            {big}
          </div>
          <div
            style={{
              fontSize: 11,
              color: tinted ? "rgba(248,239,227,0.7)" : COZY_INK_SOFT,
              marginTop: 2,
            }}
          >
            {note}
          </div>
        </>
      )}
    </div>
  );
}

function MiniHeatmap() {
  // 7 cols x 4 rows mini heatmap with deterministic intensities
  const cells: number[] = [];
  for (let i = 0; i < 28; i++) {
    const seed = (i + 1) * 9301 + 49297;
    const r = (seed % 233280) / 233280;
    cells.push(Math.min(1, r * 0.7 + (i / 28) * 0.4));
  }
  const tone = (v: number) => {
    if (v < 0.05) return "#F2EAE0";
    if (v < 0.25) return palette.soft;
    if (v < 0.5) return palette.accent + "aa";
    if (v < 0.75) return palette.accent;
    return palette.primary;
  };
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(7, 1fr)",
        gridTemplateRows: "repeat(4, 1fr)",
        gap: 3,
        marginTop: 6,
      }}
    >
      {cells.map((v, i) => (
        <div
          key={i}
          style={{
            aspectRatio: "1",
            borderRadius: 2,
            background: tone(v),
          }}
        />
      ))}
    </div>
  );
}

function FlowSection() {
  return (
    <section
      style={{
        position: "relative",
        zIndex: 1,
        padding: "60px 24px",
        maxWidth: 1200,
        margin: "0 auto",
      }}
    >
      <SectionHeader
        eyebrow="HOW IT WORKS"
        title="시작은 단순하게"
        subtitle="가입하고 목표를 정하면, 나머지는 매일의 습관."
      />
      <div
        className="flow-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 16,
          marginTop: 40,
        }}
      >
        {STEPS.map((s, i) => (
          <div
            key={s.n}
            style={{
              background: "#FFF",
              border: `1px solid ${COZY_LINE}`,
              borderRadius: 18,
              padding: "26px 22px",
              position: "relative",
              boxShadow: "0 2px 16px rgba(107,66,38,0.06)",
            }}
          >
            <div
              style={{
                fontFamily: "ui-monospace, monospace",
                fontSize: 11,
                color: palette.primary,
                letterSpacing: "0.06em",
                marginBottom: 14,
              }}
            >
              {s.n}
            </div>
            <h3
              style={{
                margin: 0,
                fontSize: 17,
                fontWeight: 700,
                letterSpacing: "-0.01em",
              }}
            >
              {s.title}
            </h3>
            <p
              style={{
                margin: "10px 0 0",
                fontSize: 13.5,
                lineHeight: 1.65,
                color: COZY_INK_SOFT,
              }}
            >
              {s.body}
            </p>
            {i < STEPS.length - 1 ? (
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  right: -10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: 20,
                  height: 1,
                  background: palette.soft,
                }}
                className="flow-connector"
              />
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section
      style={{
        position: "relative",
        zIndex: 1,
        padding: "80px 24px 96px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          background: palette.primary,
          color: "#F8EFE3",
          borderRadius: 28,
          padding: "56px 32px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute",
            right: -40,
            top: -40,
            width: 200,
            height: 200,
            borderRadius: "50%",
            background: palette.accent,
            opacity: 0.18,
          }}
        />
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: -60,
            bottom: -60,
            width: 240,
            height: 240,
            borderRadius: "50%",
            background: palette.accent,
            opacity: 0.1,
          }}
        />
        <h2
          style={{
            margin: 0,
            fontSize: "clamp(24px, 3.6vw, 34px)",
            fontWeight: 700,
            letterSpacing: "-0.02em",
            position: "relative",
            zIndex: 1,
          }}
        >
          오늘부터 한 걸음씩, 차근차근 ☕
        </h2>
        <p
          style={{
            margin: "14px 0 30px",
            fontSize: 15,
            lineHeight: 1.7,
            opacity: 0.85,
            position: "relative",
            zIndex: 1,
          }}
        >
          가입은 1분이면 충분합니다. 카드 정보 없이 시작해 보세요.
        </p>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 12,
            flexWrap: "wrap",
            position: "relative",
            zIndex: 1,
          }}
        >
          <Link
            to="/join"
            style={{
              ...buttonBase,
              background: "#FFF",
              color: palette.primary,
            }}
          >
            무료로 시작하기
          </Link>
          <Link
            to="/login"
            style={{
              ...buttonBase,
              background: "transparent",
              color: "#F8EFE3",
              border: "1.5px solid rgba(248,239,227,0.4)",
            }}
          >
            이미 계정이 있어요
          </Link>
        </div>
      </div>

      <style>{`
        @media (max-width: 960px) {
          .hero { grid-template-columns: 1fr; }
          .hero-preview { order: -1; }
          .features-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .subjects-grid { grid-template-columns: 1fr !important; }
          .preview-card { grid-template-columns: 1fr !important; }
          .flow-grid { grid-template-columns: 1fr !important; }
          .flow-connector { display: none; }
        }
        @media (max-width: 560px) {
          .features-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  );
}

function SectionHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.12em",
          color: palette.primary,
          marginBottom: 12,
          fontFamily: "ui-monospace, monospace",
        }}
      >
        {eyebrow}
      </div>
      <h2
        style={{
          margin: 0,
          fontSize: "clamp(24px, 3.4vw, 34px)",
          fontWeight: 700,
          letterSpacing: "-0.02em",
          lineHeight: 1.3,
        }}
      >
        {title}
      </h2>
      <p
        style={{
          margin: "12px 0 0",
          fontSize: 15,
          lineHeight: 1.65,
          color: COZY_INK_SOFT,
        }}
      >
        {subtitle}
      </p>
    </div>
  );
}

const buttonBase: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "14px 22px",
  borderRadius: 14,
  fontSize: 15,
  fontWeight: 600,
  textDecoration: "none",
  transition: "transform 160ms ease, box-shadow 160ms ease",
};
