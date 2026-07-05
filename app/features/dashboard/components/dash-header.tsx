// 대시보드 헤더 — 인사말 + D-day 배지 + KPI 3-strip.

import { ArrowUpIcon } from "lucide-react";
import { Link } from "react-router";

import {
  Card,
  Eyebrow,
  Num,
  Reveal,
  Sub,
  T,
  useCountUp,
  useInView,
} from "~/features/dashboard/lib/dash";
import { GuideHelpButton } from "~/features/guide/components/guide-help-button";

export interface DashHeaderData {
  userName: string;
  todayLabel: string;
  cohort: string;
  examDateIso: string | null;
  examRound: string | null;
  goalsConfigured: boolean;
  remainingHours: number;
}

export function DashHeader({ data }: { data: DashHeaderData }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const dDay = data.examDateIso
    ? Math.max(
        0,
        Math.ceil(
          (new Date(data.examDateIso).getTime() - Date.now()) /
            (24 * 60 * 60 * 1000),
        ),
      )
    : 0;
  const counted = useCountUp(dDay, 1400, inView);
  const roundLabel = `변리사 ${data.examRound === "second" ? "2차" : "1차"}`;
  const remainText =
    data.remainingHours > 0
      ? `오늘은 ${data.remainingHours.toFixed(1)}시간 더 학습하면 일 목표에 닿습니다.`
      : "오늘 학습 목표를 달성했습니다. 흐름을 이어가 보세요.";

  return (
    <div
      ref={ref}
      className="dash-header"
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto",
        gap: 16,
        alignItems: "end",
        marginBottom: 24,
      }}
    >
      <div>
        <Eyebrow color={T.inkMute} style={{ marginBottom: 8 }}>
          {data.todayLabel} · {data.cohort}
        </Eyebrow>
        <h1
          style={{
            font: "800 28px/1.25 Pretendard, sans-serif",
            color: T.ink,
            letterSpacing: "-0.022em",
            margin: 0,
          }}
        >
          어서 오세요, {data.userName}님 ☕
        </h1>
        <p
          style={{
            font: "400 14px/1.6 Pretendard, sans-serif",
            color: T.inkSoft,
            margin: "8px 0 0",
            letterSpacing: "-0.005em",
          }}
        >
          {remainText}
        </p>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <GuideHelpButton screenKey="dashboard" />
      <div
        style={{
          display: "inline-flex",
          alignItems: "baseline",
          gap: 14,
          padding: "14px 22px",
          background: "var(--secondary)",
          color: "var(--secondary-foreground)",
          borderRadius: 16,
          border: "1px solid var(--border)",
        }}
      >
        {data.goalsConfigured && data.examDateIso ? (
          <>
            <div>
              <Eyebrow color="var(--secondary-foreground)" style={{ marginBottom: 4 }}>
                {roundLabel}
              </Eyebrow>
              <Num
                value={`D-${Math.round(counted)}`}
                size={36}
                color="var(--secondary-foreground)"
              />
            </div>
            <div
              style={{
                font: "400 12px/1.5 Pretendard, sans-serif",
                color: "var(--secondary-foreground)",
                opacity: 0.7,
                letterSpacing: "-0.005em",
              }}
            >
              시험일
              <br />
              {data.examDateIso}
            </div>
          </>
        ) : (
          // 시험일 미설정 — 가짜 D-day 대신 설정 안내(feat-2-025 Phase 3).
          <div>
            <Eyebrow color="var(--secondary-foreground)" style={{ marginBottom: 4 }}>
              {roundLabel}
            </Eyebrow>
            <Link
              to="/goals"
              style={{
                font: "700 15px/1.4 Pretendard, sans-serif",
                color: "var(--secondary-foreground)",
                textDecoration: "underline",
                letterSpacing: "-0.01em",
              }}
            >
              시험일 설정하기 →
            </Link>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

export interface DashKpiData {
  studyHours: number;
  problems: number;
  accuracy: number;
  deltaHours: number;
  deltaProblems: number;
  accuracyBase: number;
}

export function DashKpiStrip({ data }: { data: DashKpiData }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const h = useCountUp(data.studyHours, 1200, inView);
  const p = useCountUp(data.problems, 1300, inView);
  const a = useCountUp(data.accuracy, 1200, inView);

  const stats = [
    {
      label: "누적 풀이 시간",
      value: h.toFixed(1),
      unit: "h",
      delta: data.deltaHours > 0 ? `+${data.deltaHours.toFixed(1)}h` : null,
      hint: `지난주 +${data.deltaHours.toFixed(1)}h`,
    },
    {
      label: "푼 문항 수",
      value: Math.round(p).toLocaleString("ko-KR"),
      unit: "",
      delta: data.deltaProblems > 0 ? `+${data.deltaProblems}` : null,
      hint: `지난주 +${data.deltaProblems.toLocaleString("ko-KR")}`,
    },
    {
      label: "평균 정답률",
      value: a.toFixed(1),
      unit: "%",
      delta: null,
      hint: `기준 ${data.accuracyBase.toLocaleString("ko-KR")} 문항`,
    },
  ];

  return (
    <div
      ref={ref}
      className="dash-kpi"
      style={{
        display: "grid",
        gap: 16,
        gridTemplateColumns: "repeat(3, 1fr)",
        marginBottom: 16,
      }}
    >
      {stats.map((s, i) => (
        <Reveal key={s.label} delay={i * 60}>
          <Card padding={20}>
            <Eyebrow color={T.inkSoft} style={{ marginBottom: 12 }}>
              {s.label}
            </Eyebrow>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
              <Num value={s.value} unit={s.unit} size={32} />
              {s.delta ? (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 3,
                    padding: "3px 8px",
                    borderRadius: 9999,
                    background: T.emeraldSoft,
                    color: T.emerald,
                    font: "700 11px/1 Pretendard, sans-serif",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  <ArrowUpIcon size={11} strokeWidth={2.5} />
                  {s.delta}
                </span>
              ) : null}
            </div>
            <Sub style={{ marginTop: 8 }}>{s.hint}</Sub>
          </Card>
        </Reveal>
      ))}
    </div>
  );
}
