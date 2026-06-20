// PROGRESS 그룹 — 전체 진척도(도넛 3) · 오늘 진척도 · 과목별 진도 · 자연과학 진도.

import { FlameIcon } from "lucide-react";

import {
  Card,
  Chip,
  Eyebrow,
  Num,
  ProgressBar,
  Sub,
  T,
  useInView,
} from "~/features/dashboard/lib/dash";
import {
  isFirstExamSubject,
  isSecondExamSubject,
} from "~/features/subjects/lib/subjects";

// ── 전체 학습 진척도 (도넛 3) ───────────────────────────────────────────────

export interface OverallProgressData {
  articles: { visited: number; total: number; pct: number };
  cases: { visited: number; total: number; pct: number };
  problems: { attempted: number; total: number; pct: number };
}

export function OverallProgressCard({
  overall,
}: {
  overall: OverallProgressData;
}) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const donuts = [
    {
      kind: "조문",
      pct: overall.articles.pct,
      visited: overall.articles.visited,
      total: overall.articles.total,
    },
    {
      kind: "판례",
      pct: overall.cases.pct,
      visited: overall.cases.visited,
      total: overall.cases.total,
    },
    {
      kind: "문제",
      pct: overall.problems.pct,
      visited: overall.problems.attempted,
      total: overall.problems.total,
    },
  ];
  return (
    <Card padding={20}>
      <Eyebrow style={{ marginBottom: 14 }}>전체 학습 진척도</Eyebrow>
      <div
        ref={ref}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 12,
        }}
      >
        {donuts.map((d, i) => (
          <Donut key={d.kind} {...d} animate={inView} delay={i * 120} />
        ))}
      </div>
    </Card>
  );
}

function Donut({
  kind,
  pct,
  visited,
  total,
  animate,
  delay,
}: {
  kind: string;
  pct: number;
  visited: number;
  total: number;
  animate: boolean;
  delay: number;
}) {
  const radius = 36;
  const stroke = 7;
  const C = 2 * Math.PI * radius;
  const offset = C * (1 - (animate ? pct / 100 : 0));
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
      }}
    >
      <div style={{ position: "relative", width: 92, height: 92 }}>
        <svg width="92" height="92" viewBox="0 0 92 92">
          <circle
            cx="46"
            cy="46"
            r={radius}
            stroke={T.muted}
            strokeWidth={stroke}
            fill="none"
          />
          <circle
            cx="46"
            cy="46"
            r={radius}
            stroke={T.blue}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={offset}
            transform="rotate(-90 46 46)"
            style={{
              transition: `stroke-dashoffset 1000ms ${T.ease} ${delay}ms`,
            }}
          />
        </svg>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            font: "800 17px/1 Pretendard, sans-serif",
            color: T.ink,
            letterSpacing: "-0.02em",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {Math.round(pct)}%
        </div>
      </div>
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            font: "700 13px/1 Pretendard, sans-serif",
            color: T.ink,
            marginBottom: 2,
          }}
        >
          {kind}
        </div>
        <div
          style={{
            font: "400 11px/1 Pretendard, sans-serif",
            color: T.inkSoft,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {visited.toLocaleString("ko-KR")} / {total.toLocaleString("ko-KR")}
        </div>
      </div>
    </div>
  );
}

// ── 오늘의 진척도 ───────────────────────────────────────────────────────────

export interface TodayProgressData {
  todayHours: number;
  weekTotalHours: number;
  weeklyTarget: number;
  streak: number;
  activeDays: number;
  avgDailyHours: number;
}

export function TodayProgressCard({ data }: { data: TodayProgressData }) {
  const weekPct =
    data.weeklyTarget > 0
      ? (data.weekTotalHours / data.weeklyTarget) * 100
      : 0;
  return (
    <Card padding={20}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <Eyebrow>오늘의 진척도</Eyebrow>
        <Chip tone="amber">
          <FlameIcon size={11} color={T.amberInk} /> {data.streak}일 연속
        </Chip>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 8,
          marginBottom: 14,
        }}
      >
        <Num value={data.todayHours.toFixed(1)} unit="h" size={32} />
        <span
          style={{
            font: "500 13px/1 Pretendard, sans-serif",
            color: T.inkSoft,
          }}
        >
          오늘 학습
        </span>
      </div>
      <div style={{ marginBottom: 16 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            font: "500 11px/1 Pretendard, sans-serif",
            color: T.inkSoft,
            marginBottom: 6,
          }}
        >
          <span>이번 주 {data.weekTotalHours.toFixed(1)}h</span>
          <span>목표 {data.weeklyTarget}h</span>
        </div>
        <ProgressBar value={weekPct} animateOnView height={8} />
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          font: "400 12px/1.5 Pretendard, sans-serif",
          color: T.inkSoft,
        }}
      >
        <span>
          활동 일수{" "}
          <strong style={{ color: T.ink, fontVariantNumeric: "tabular-nums" }}>
            {data.activeDays}일
          </strong>
        </span>
        <span>
          일평균{" "}
          <strong style={{ color: T.ink, fontVariantNumeric: "tabular-nums" }}>
            {data.avgDailyHours.toFixed(1)}h
          </strong>
        </span>
      </div>
    </Card>
  );
}

// ── 과목별 진도 ─────────────────────────────────────────────────────────────

export interface SubjectProgressData {
  lawCode: string;
  name: string;
  pctViewed: number;
  problemsAttempted: number;
  accuracyPct: number | null;
}

// 법률 과목 진도 — 1차(객관식)/2차(주관식)로 분리. 산업재산권법은 양쪽에 노출.
// 목표 차수(profiles.next_exam_round)가 정해져 있으면 그 차수 그룹만 — 미설정(null)이면 둘 다.
export function SubjectsProgressCard({
  subjects,
  examRound,
}: {
  subjects: ReadonlyArray<SubjectProgressData>;
  examRound: "first" | "second" | null;
}) {
  const first = subjects.filter((s) => isFirstExamSubject(s.lawCode));
  const second = subjects.filter((s) => isSecondExamSubject(s.lawCode));
  const showFirst = examRound !== "second";
  const showSecond = examRound !== "first";
  return (
    <Card padding={20}>
      <Eyebrow style={{ marginBottom: 14 }}>법률 과목 진도</Eyebrow>
      {showFirst ? (
        <SubjectExamGroup label="1차 · 객관식" subjects={first} />
      ) : null}
      {showSecond ? (
        <div style={showFirst ? { marginTop: 16 } : undefined}>
          <SubjectExamGroup label="2차 · 주관식" subjects={second} />
        </div>
      ) : null}
    </Card>
  );
}

function SubjectExamGroup({
  label,
  subjects,
}: {
  label: string;
  subjects: ReadonlyArray<SubjectProgressData>;
}) {
  return (
    <div>
      <div
        style={{
          font: "700 11px/1 Pretendard, sans-serif",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: T.link,
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {subjects.map((s) => (
          <li key={s.lawCode}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: 4,
              }}
            >
              <span
                style={{
                  font: "600 13px/1 Pretendard, sans-serif",
                  color: T.ink,
                  letterSpacing: "-0.012em",
                }}
              >
                {s.name}
              </span>
              <span
                style={{
                  font: "700 12px/1 Pretendard, sans-serif",
                  color: T.ink,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {Math.round(s.pctViewed)}%
              </span>
            </div>
            <ProgressBar value={s.pctViewed} height={6} animateOnView />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                font: "400 11px/1 Pretendard, sans-serif",
                color: T.inkSoft,
                marginTop: 4,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              <span>풀이 {s.problemsAttempted}</span>
              <span>
                정답률{" "}
                {s.accuracyPct === null ? "—" : `${Math.round(s.accuracyPct)}%`}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── 자연과학 진도 ───────────────────────────────────────────────────────────

export interface ScienceProgressData {
  slug: string;
  name: string;
  attempted: number;
  total: number;
}

export function ScienceProgressCard({
  science,
}: {
  science: ReadonlyArray<ScienceProgressData>;
}) {
  return (
    <Card padding={20}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <Eyebrow>자연과학 진도</Eyebrow>
        <Sub style={{ font: "500 11px/1 Pretendard, sans-serif" }}>
          1차 필수 4과목
        </Sub>
      </div>
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {science.map((s) => {
          const taken = s.attempted > 0;
          const pct =
            s.total > 0
              ? Math.min(100, Math.round((s.attempted / s.total) * 100))
              : 0;
          return (
            <li key={s.slug} style={{ opacity: taken ? 1 : 0.45 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  marginBottom: 4,
                }}
              >
                <span
                  style={{
                    font: "600 13px/1 Pretendard, sans-serif",
                    color: T.ink,
                    letterSpacing: "-0.012em",
                  }}
                >
                  {s.name}
                  {!taken ? (
                    <span
                      style={{
                        color: T.inkMute,
                        fontWeight: 400,
                        marginLeft: 6,
                      }}
                    >
                      미응시
                    </span>
                  ) : null}
                </span>
                <span
                  style={{
                    font: "700 12px/1 Pretendard, sans-serif",
                    color: T.ink,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {pct}%
                </span>
              </div>
              <ProgressBar value={pct} height={6} animateOnView />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
