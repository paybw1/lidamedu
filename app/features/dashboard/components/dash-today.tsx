// TODAY 그룹 — 이번 주 트랙 · 마감 임박 과제 · 자동 추천 액션.

import {
  ArrowRightIcon,
  CalendarIcon,
  CheckIcon,
  ChevronRightIcon,
  FlameIcon,
  SparklesIcon,
  StarIcon,
  TargetIcon,
  TrendingUpIcon,
  TriangleAlertIcon,
  TrophyIcon,
} from "lucide-react";
import type { ComponentType } from "react";
import { Link } from "react-router";

import {
  Card,
  Eyebrow,
  Num,
  ProgressBar,
  Sub,
  T,
  Title,
} from "~/features/dashboard/lib/dash";

// ── 이번 주 트랙 ────────────────────────────────────────────────────────────

export interface WeekTrackData {
  weekNumber: number;
  durationWeeks: number;
  weekTitle: string;
  completedCount: number;
  totalCount: number;
  assignmentId: string | null;
  items: ReadonlyArray<{
    itemId: string;
    ord: number;
    label: string;
    isDone: boolean;
    entryUrl: string | null;
  }>;
}

export function WeekTrackCard({ track }: { track: WeekTrackData }) {
  const pct =
    track.totalCount > 0
      ? (track.completedCount / track.totalCount) * 100
      : 0;
  const items = [...track.items].sort((a, b) => a.ord - b.ord);

  return (
    <Card padding={24} hover={false}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 16,
        }}
      >
        <div>
          <Eyebrow style={{ marginBottom: 6 }}>
            이번 주 트랙 · W{track.weekNumber}/{track.durationWeeks}
          </Eyebrow>
          <Title size={18}>{track.weekTitle}</Title>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <Num
            value={track.completedCount}
            unit={`/${track.totalCount}`}
            size={22}
            color={T.blue}
          />
          <Sub>완수</Sub>
        </div>
      </div>
      <ProgressBar value={pct} animateOnView />
      {items.length === 0 ? (
        <p
          style={{
            font: "400 13px/1.5 Pretendard, sans-serif",
            color: T.inkSoft,
            margin: "14px 0 0",
          }}
        >
          이번 주 학습 항목이 비어 있습니다.
        </p>
      ) : (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: "14px 0 0",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          {items.map((it) => (
            <li key={it.itemId}>
              <TrackRow item={it} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function TrackRow({
  item,
}: {
  item: WeekTrackData["items"][number];
}) {
  const inner = (
    <>
      <span
        style={{
          width: 20,
          height: 20,
          borderRadius: 6,
          background: item.isDone ? T.blue : T.paper,
          border: item.isDone ? 0 : `1.5px solid ${T.line}`,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {item.isDone ? (
          <CheckIcon size={12} color="#fff" strokeWidth={3} />
        ) : null}
      </span>
      <span
        style={{
          flex: 1,
          font: "500 14px/1.4 Pretendard, sans-serif",
          color: item.isDone ? T.inkMute : T.ink,
          letterSpacing: "-0.01em",
          textDecoration: item.isDone ? "line-through" : "none",
        }}
      >
        {item.label}
      </span>
      {!item.isDone && item.entryUrl ? (
        <ChevronRightIcon size={14} color={T.inkMute} />
      ) : null}
    </>
  );
  const rowStyle = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 8px",
    borderRadius: 8,
    textDecoration: "none",
  } as const;
  if (item.entryUrl && !item.isDone) {
    return (
      <Link to={item.entryUrl} style={rowStyle}>
        {inner}
      </Link>
    );
  }
  return <div style={rowStyle}>{inner}</div>;
}

// ── 마감 임박 과제 ──────────────────────────────────────────────────────────

export interface PendingAssignmentData {
  assignmentId: string;
  title: string;
  dueAt: string;
  itemCount: number;
  submission: { completedItems: number; totalItems: number } | null;
}

export function PendingAssignmentsCard({
  assignments,
}: {
  assignments: ReadonlyArray<PendingAssignmentData>;
}) {
  return (
    <Card padding={20} hover={false}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <Eyebrow>마감 임박 과제</Eyebrow>
        <Link
          to="/assignments"
          style={{
            font: "600 12px/1 Pretendard, sans-serif",
            color: T.blue,
            textDecoration: "none",
          }}
        >
          전체 보기 →
        </Link>
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
        {assignments.map((a) => {
          const total = a.submission?.totalItems ?? a.itemCount;
          const completed = a.submission?.completedItems ?? 0;
          const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
          const daysLeft = Math.ceil(
            (new Date(a.dueAt).getTime() - Date.now()) /
              (24 * 60 * 60 * 1000),
          );
          const urgent = daysLeft <= 2;
          return (
            <li key={a.assignmentId}>
              <Link
                to={`/assignments/${a.assignmentId}`}
                style={{
                  display: "block",
                  padding: "12px 14px",
                  borderRadius: 12,
                  background: urgent ? T.coralSoft : T.subtle,
                  border: `1px solid ${urgent ? "transparent" : T.lineSoft}`,
                  textDecoration: "none",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    marginBottom: 8,
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      font: "600 13px/1.4 Pretendard, sans-serif",
                      color: T.ink,
                      letterSpacing: "-0.012em",
                    }}
                  >
                    {a.title}
                  </span>
                  <span
                    style={{
                      font: "700 11px/1 Pretendard, sans-serif",
                      color: urgent ? T.coral : T.inkSoft,
                      whiteSpace: "nowrap",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {daysLeft >= 0 ? `D-${daysLeft}` : `D+${-daysLeft}`}
                  </span>
                </div>
                <div
                  style={{ display: "flex", alignItems: "center", gap: 10 }}
                >
                  <div style={{ flex: 1 }}>
                    <ProgressBar
                      value={pct}
                      tone={urgent ? "coral" : "blue"}
                      animateOnView
                      height={4}
                    />
                  </div>
                  <span
                    style={{
                      font: "700 11px/1 Pretendard, sans-serif",
                      color: T.inkSoft,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {pct}%
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

// ── 자동 추천 액션 ──────────────────────────────────────────────────────────

export interface RecActionData {
  id: string;
  priority: "high" | "medium" | "low" | "celebrate";
  icon: string;
  title: string;
  ctaLabel: string;
  ctaUrl: string;
  metric?: string;
}

const REC_ICON: Record<
  string,
  ComponentType<{ size?: number; strokeWidth?: number }>
> = {
  alert: TriangleAlertIcon,
  trend: TrendingUpIcon,
  target: TargetIcon,
  flame: FlameIcon,
  star: StarIcon,
  trophy: TrophyIcon,
  calendar: CalendarIcon,
  spark: SparklesIcon,
};

const REC_TONE: Record<
  RecActionData["priority"],
  { bg: string; ic: string }
> = {
  high: { bg: T.coralSoft, ic: T.coral },
  medium: { bg: T.blueSoft, ic: T.blue },
  low: { bg: T.amberSoft, ic: T.amberInk },
  celebrate: { bg: T.emeraldSoft, ic: T.emerald },
};

export function RecommendedActionsCard({
  actions,
}: {
  actions: ReadonlyArray<RecActionData>;
}) {
  return (
    <Card padding={20} hover={false}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <Eyebrow>자동 추천 액션</Eyebrow>
        <Sub style={{ font: "500 11px/1 Pretendard, sans-serif" }}>
          합격자 데이터 기반
        </Sub>
      </div>
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {actions.map((a) => {
          const Icon = REC_ICON[a.icon] ?? SparklesIcon;
          const tn = REC_TONE[a.priority];
          return (
            <li key={a.id}>
              <Link
                to={a.ctaUrl}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 14px",
                  borderRadius: 12,
                  background: T.paper,
                  border: `1px solid ${T.lineSoft}`,
                  textDecoration: "none",
                }}
              >
                <span
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: tn.bg,
                    color: tn.ic,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Icon size={18} strokeWidth={2} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      font: "600 13px/1.4 Pretendard, sans-serif",
                      color: T.ink,
                      letterSpacing: "-0.012em",
                    }}
                  >
                    {a.title}
                  </div>
                  {a.metric ? (
                    <div
                      style={{
                        font: "400 11px/1.4 Pretendard, sans-serif",
                        color: T.inkSoft,
                        marginTop: 2,
                      }}
                    >
                      {a.metric}
                    </div>
                  ) : null}
                </div>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "6px 12px",
                    borderRadius: 9999,
                    background: T.blue,
                    color: "#fff",
                    font: "600 12px/1 Pretendard, sans-serif",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  {a.ctaLabel}
                  <ArrowRightIcon size={11} strokeWidth={2.5} />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
