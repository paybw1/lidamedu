import { useState } from "react";
import { Link, redirect } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import {
  getUserAutoBlankStats,
  getUserBlankStats,
} from "~/features/blanks/queries.server";
import { getUserRecitationStats } from "~/features/recitation/queries.server";

import type { Route } from "./+types/dashboard";
import CozyCard from "../components/cozy-card";
import CozyChecklist, {
  type ChecklistItem,
} from "../components/cozy-checklist";
import CozyHeatmap from "../components/cozy-heatmap";
import CozySidebar from "../components/cozy-sidebar";
import CozyStatChip from "../components/cozy-stat-chip";
import CozyTopbar from "../components/cozy-topbar";
import CozyWeeklyBars from "../components/cozy-weekly-bars";
import StripePlaceholder from "../components/stripe-placeholder";
import {
  COZY_BASE,
  COZY_FONT_STACK,
  COZY_INK,
  COZY_INK_SOFT,
  COZY_PALETTES,
} from "~/core/lib/cozy-tokens";

export const meta: Route.MetaFunction = () => [
  { title: "대시보드 | Lidam Edu" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    throw redirect("/login");
  }
  const name =
    (user.user_metadata?.name as string | undefined)?.trim() || "사용자";

  // 빈칸 학습 요약 — 3 모드 + 암기 모드 병렬 조회.
  const [content, subject, period, recitation] = await Promise.all([
    getUserBlankStats(client, user.id),
    getUserAutoBlankStats(client, user.id, "subject"),
    getUserAutoBlankStats(client, user.id, "period"),
    getUserRecitationStats(client, user.id),
  ]);
  const summarize = (s: {
    totalAttempts: number;
    correctAttempts: number;
    weakBlanks: { length: number };
  }) => ({
    total: s.totalAttempts,
    correct: s.correctAttempts,
    accuracy:
      s.totalAttempts > 0
        ? Math.round((s.correctAttempts / s.totalAttempts) * 100)
        : 0,
    weak: s.weakBlanks.length,
  });

  return {
    user: {
      name,
      cohort: "27기 · 1차 준비",
    },
    blankSummary: {
      content: summarize(content),
      subject: summarize(subject),
      period: summarize(period),
      recitation: {
        total: recitation.totalAttempts,
        correct: recitation.completedAttempts,
        accuracy: Math.round(recitation.averageSimilarity * 100),
        weak: recitation.weakArticles.length,
      },
    },
  };
}

const INITIAL_CHECKLIST: ChecklistItem[] = [
  { label: "특허법 강의 14·15강 시청", meta: "90분", done: true },
  { label: "신규성 기출문제 30제 풀이", meta: "60분", done: true },
  { label: "상표법 식별력 챕터 정리", meta: "45분", done: true },
  { label: "오답노트 2회독", meta: "30분", done: false },
  { label: "내일 모의고사 범위 예습", meta: "40분", done: false },
];

const SUBJECTS = [
  { name: "특허법", pct: 72, hours: "38h" },
  { name: "상표법", pct: 54, hours: "22h" },
  { name: "민사소송법", pct: 41, hours: "17h" },
  { name: "국제지재권", pct: 28, hours: "9h" },
];

const LECTURES = [
  {
    tag: "특허법",
    title: "제29조 신규성 — 공지·공용 판단기준",
    meta: "강의 14 · 42분",
    progress: 0.65,
  },
  {
    tag: "상표법",
    title: "식별력 판단 사례 정리 (2024 출제경향)",
    meta: "강의 08 · 38분",
    progress: 0.3,
  },
  {
    tag: "민소법",
    title: "소의 이익과 확인의 이익",
    meta: "강의 11 · 51분",
    progress: 0.0,
  },
];

const TODAY_LABEL = "2026년 4월 27일 · 월요일";
const EXAM_DDAY = 87;
const EXAM_DATE_LABEL = "2026년 7월 23일 (토)";

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  const { user, blankSummary } = loaderData;
  const palette = COZY_PALETTES.sage;
  const [checklist, setChecklist] = useState(INITIAL_CHECKLIST);
  const completedCount = checklist.filter((i) => i.done).length;

  const toggleCheck = (index: number) =>
    setChecklist((prev) =>
      prev.map((it, i) => (i === index ? { ...it, done: !it.done } : it)),
    );

  const avatarInitials = user.name.slice(0, Math.min(2, user.name.length));

  return (
    <div
      style={{
        minHeight: "100vh",
        background: COZY_BASE,
        fontFamily: COZY_FONT_STACK,
        color: COZY_INK,
        display: "flex",
        position: "relative",
        overflow: "hidden",
      }}
      className="dashboard-cozy"
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          opacity: 0.35,
          backgroundImage: `radial-gradient(${palette.soft}55 1px, transparent 1px)`,
          backgroundSize: "4px 4px",
        }}
      />

      <CozySidebar palette={palette} />

      <main
        className="cozy-main"
        style={{
          flex: 1,
          padding: "28px 40px 40px",
          minWidth: 0,
          position: "relative",
          zIndex: 1,
        }}
      >
        <CozyTopbar
          palette={palette}
          user={{
            name: user.name,
            avatarInitials,
            cohort: user.cohort,
          }}
        />

        <div
          style={{
            marginBottom: 24,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{ fontSize: 13, color: COZY_INK_SOFT, marginBottom: 6 }}
            >
              {TODAY_LABEL}
            </div>
            <h1
              style={{
                margin: 0,
                fontSize: 28,
                fontWeight: 700,
                letterSpacing: "-0.02em",
              }}
            >
              어서오세요, {user.name}님 ☕
            </h1>
            <p
              style={{ margin: "6px 0 0", fontSize: 14, color: COZY_INK_SOFT }}
            >
              오늘도 한 걸음씩, 차근차근 가봐요.
            </p>
          </div>

          <div
            style={{
              background: "#FFF",
              border: `1.5px solid ${palette.primary}`,
              borderRadius: 999,
              padding: "10px 18px",
              display: "flex",
              alignItems: "center",
              gap: 12,
              boxShadow: "0 2px 16px rgba(107,66,38,0.08)",
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                background: palette.primary,
                color: "#FFF",
                display: "grid",
                placeItems: "center",
                fontFamily: "Georgia, serif",
                fontWeight: 700,
                fontSize: 14,
                letterSpacing: "0.02em",
              }}
            >
              D-{EXAM_DDAY}
            </div>
            <div>
              <div
                style={{
                  fontSize: 11,
                  color: COZY_INK_SOFT,
                  marginBottom: 2,
                }}
              >
                변리사 1차 시험까지
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                {EXAM_DATE_LABEL}
              </div>
            </div>
          </div>
        </div>

        <div
          className="cozy-stats"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 14,
            marginBottom: 22,
          }}
        >
          <CozyStatChip
            icon="clock"
            label="총 학습시간"
            value="186"
            unit="시간"
            delta="+12h 지난주"
            palette={palette}
          />
          <CozyStatChip
            icon="check"
            label="푼 문제 수"
            value="1,248"
            unit="문항"
            delta="+184 지난주"
            palette={palette}
          />
          <CozyStatChip
            icon="target"
            label="평균 정답률"
            value="74.2"
            unit="%"
            delta="+2.1%p"
            palette={palette}
          />
        </div>

        <div
          className="cozy-grid-3"
          style={{
            display: "grid",
            gridTemplateColumns: "1.1fr 1fr 1fr",
            gap: 18,
            marginBottom: 18,
          }}
        >
          <CozyCard
            title="오늘의 학습 계획"
            subtitle={`${completedCount} / ${checklist.length} 완료`}
          >
            <CozyChecklist
              palette={palette}
              items={checklist}
              onToggle={toggleCheck}
            />
          </CozyCard>

          <CozyCard title="과목별 진도" subtitle="이번 학기">
            <div
              style={{ display: "flex", flexDirection: "column", gap: 14 }}
            >
              {SUBJECTS.map((s) => (
                <div key={s.name}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      marginBottom: 6,
                    }}
                  >
                    <span style={{ fontSize: 13.5, fontWeight: 600 }}>
                      {s.name}
                    </span>
                    <span
                      style={{
                        fontSize: 11.5,
                        color: COZY_INK_SOFT,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {s.pct}% · {s.hours}
                    </span>
                  </div>
                  <div
                    style={{
                      height: 8,
                      borderRadius: 4,
                      background: palette.tint,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${s.pct}%`,
                        height: "100%",
                        background: `linear-gradient(90deg, ${palette.accent}, ${palette.primary})`,
                        borderRadius: 4,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CozyCard>

          <CozyCard title="이어보기" subtitle="최근 학습한 강의">
            <div
              style={{ display: "flex", flexDirection: "column", gap: 12 }}
            >
              {LECTURES.map((l, i) => (
                <div
                  key={i}
                  style={{ display: "flex", gap: 10, alignItems: "center" }}
                >
                  <StripePlaceholder
                    label={`LEC ${String(i + 1).padStart(2, "0")}`}
                    w={64}
                    h={48}
                    accent={palette.primary}
                    radius={8}
                    dense
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: palette.primary,
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                        marginBottom: 3,
                      }}
                    >
                      {l.tag}
                    </div>
                    <div
                      style={{
                        fontSize: 12.5,
                        fontWeight: 600,
                        lineHeight: 1.35,
                        marginBottom: 4,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {l.title}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <div
                        style={{
                          flex: 1,
                          height: 3,
                          background: palette.tint,
                          borderRadius: 2,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${l.progress * 100}%`,
                            height: "100%",
                            background: palette.accent,
                          }}
                        />
                      </div>
                      <span style={{ fontSize: 10, color: COZY_INK_SOFT }}>
                        {l.meta}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              <Link
                to="/subjects/patent"
                style={{
                  textDecoration: "none",
                  cursor: "pointer",
                  textAlign: "center",
                  padding: "8px",
                  borderRadius: 10,
                  background: palette.primary,
                  color: "#FFF",
                  fontSize: 12.5,
                  fontWeight: 600,
                  marginTop: 4,
                }}
              >
                다음 강의 이어보기 →
              </Link>
            </div>
          </CozyCard>
        </div>

        <div
          className="cozy-grid-2"
          style={{
            display: "grid",
            gridTemplateColumns: "1.4fr 1fr",
            gap: 18,
          }}
        >
          <CozyCard title="학습 히트맵" subtitle="최근 12주">
            <CozyHeatmap palette={palette} />
            <div
              style={{
                marginTop: 12,
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 11,
                color: COZY_INK_SOFT,
                flexWrap: "wrap",
              }}
            >
              <span>덜</span>
              {[
                "#F2EAE0",
                palette.soft,
                palette.accent + "aa",
                palette.accent,
                palette.primary,
              ].map((c) => (
                <div
                  key={c}
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: c,
                  }}
                />
              ))}
              <span>더</span>
              <span style={{ marginLeft: "auto" }}>
                총 86일 학습 · 평균 2.4시간/일
              </span>
            </div>
          </CozyCard>

          <CozyCard title="이번 주 학습량" subtitle="목표 25시간">
            <CozyWeeklyBars palette={palette} />
          </CozyCard>
        </div>

        <div style={{ marginTop: 18 }}>
          <CozyCard
            title="빈칸 · 암기 학습"
            subtitle="내용 · 주체 · 시기 · 암기 모드 정답률 / 유사도"
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 10,
                marginBottom: 14,
              }}
            >
              <BlankSummaryTile
                label="내용 빈칸"
                summary={blankSummary.content}
                palette={palette}
              />
              <BlankSummaryTile
                label="주체 빈칸"
                summary={blankSummary.subject}
                palette={palette}
              />
              <BlankSummaryTile
                label="시기 빈칸"
                summary={blankSummary.period}
                palette={palette}
              />
              <BlankSummaryTile
                label="암기"
                summary={blankSummary.recitation}
                palette={palette}
              />
            </div>
            <Link
              to="/study/blanks"
              style={{
                display: "block",
                textDecoration: "none",
                cursor: "pointer",
                textAlign: "center",
                padding: "10px",
                borderRadius: 10,
                background: palette.primary,
                color: "#FFF",
                fontSize: 12.5,
                fontWeight: 600,
              }}
            >
              상세 통계 보기 →
            </Link>
          </CozyCard>
        </div>
      </main>

      <style>{`
        @media (max-width: 1024px) {
          .dashboard-cozy { flex-direction: column; }
          .dashboard-cozy aside { width: 100%; padding: 20px; }
          .cozy-main { padding: 20px; }
          .cozy-stats { grid-template-columns: 1fr; }
          .cozy-grid-3 { grid-template-columns: 1fr; }
          .cozy-grid-2 { grid-template-columns: 1fr; }
        }
        @media (min-width: 1025px) and (max-width: 1280px) {
          .cozy-grid-3 { grid-template-columns: 1fr 1fr; }
          .cozy-grid-3 > :first-child { grid-column: span 2; }
        }
      `}</style>
    </div>
  );
}

function BlankSummaryTile({
  label,
  summary,
  palette,
}: {
  label: string;
  summary: { total: number; correct: number; accuracy: number; weak: number };
  palette: { primary: string; tint: string; soft: string; accent: string };
}) {
  return (
    <div
      style={{
        background: palette.tint,
        borderRadius: 12,
        padding: "12px 14px",
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: COZY_INK_SOFT,
          fontWeight: 600,
          letterSpacing: "0.02em",
          marginBottom: 6,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.1,
        }}
      >
        {summary.accuracy}
        <span style={{ fontSize: 13, fontWeight: 500, marginLeft: 2 }}>%</span>
      </div>
      <div
        style={{
          marginTop: 4,
          fontSize: 11,
          color: COZY_INK_SOFT,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {summary.correct} / {summary.total} 정답
        {summary.weak > 0 ? (
          <span
            style={{
              marginLeft: 6,
              color: "#C44A36",
              fontWeight: 600,
            }}
          >
            · 약점 {summary.weak}
          </span>
        ) : null}
      </div>
    </div>
  );
}
