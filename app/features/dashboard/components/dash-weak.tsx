// WEAK SPOTS 그룹 — 약점 우선 복습 · 약점 단원.

import { ChevronRightIcon, TrendingUpIcon } from "lucide-react";
import { Link } from "react-router";

import { Card, Chip, Eyebrow, Num, Sub, T } from "~/features/dashboard/lib/dash";

// ── 약점 우선 복습 ──────────────────────────────────────────────────────────

export interface WeakAreaRow {
  problemId: string;
  lawCode: string;
  lawName: string;
  title: string;
  difficulty: "easy" | "medium" | "hard";
  globalAccuracyPct: number | null;
}

const DIFFICULTY: Record<
  WeakAreaRow["difficulty"],
  { label: string; color: string; bg: string }
> = {
  easy: { label: "쉬움", color: T.emerald, bg: T.emeraldSoft },
  medium: { label: "보통", color: T.amberInk, bg: T.amberSoft },
  hard: { label: "어려움", color: T.coral, bg: T.coralSoft },
};

export function WeakReviewCard({
  areas,
}: {
  areas: ReadonlyArray<WeakAreaRow>;
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
        <Eyebrow>약점 우선 복습</Eyebrow>
        <Link
          to="/study/wrong-note"
          style={{
            font: "600 11px/1 Pretendard, sans-serif",
            color: T.blue,
            textDecoration: "none",
          }}
        >
          오답노트 →
        </Link>
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {areas.map((w, i) => {
          const d = DIFFICULTY[w.difficulty];
          return (
            <li
              key={w.problemId}
              style={{
                borderBottom:
                  i < areas.length - 1 ? `1px solid ${T.lineSoft}` : "none",
              }}
            >
              <Link
                to={`/subjects/${w.lawCode}/problems/${w.problemId}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 8px",
                  textDecoration: "none",
                }}
              >
                <span
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: T.muted,
                    color: T.inkSoft,
                    font: "700 12px/1 Pretendard, sans-serif",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      marginBottom: 3,
                    }}
                  >
                    <Chip tone="blue">{w.lawName}</Chip>
                    <Chip
                      style={{
                        background: d.bg,
                        color: d.color,
                        border: "1px solid transparent",
                      }}
                    >
                      {d.label}
                    </Chip>
                  </div>
                  <div
                    style={{
                      font: "500 13px/1.4 Pretendard, sans-serif",
                      color: T.ink,
                      letterSpacing: "-0.01em",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {w.title}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div
                    style={{
                      font: "700 13px/1 Pretendard, sans-serif",
                      color: T.coral,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {w.globalAccuracyPct === null
                      ? "—"
                      : `${Math.round(w.globalAccuracyPct)}%`}
                  </div>
                  <Sub style={{ font: "500 10px/1 Pretendard, sans-serif", marginTop: 2 }}>
                    전역 정답률
                  </Sub>
                </div>
                <ChevronRightIcon size={14} color={T.inkMute} />
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

// ── 약점 단원 ───────────────────────────────────────────────────────────────

export interface WeakNodeRow {
  nodeId: string;
  lawCode: string;
  lawName: string;
  name: string;
  accuracyPct: number;
  myAttempts: number;
  passerAvgAttempts: number | null;
  passerAvgAccuracy: number | null;
}

export function WeakNodesCard({
  nodes,
}: {
  nodes: ReadonlyArray<WeakNodeRow>;
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
        <Eyebrow>약점 단원</Eyebrow>
        <Sub style={{ font: "500 11px/1 Pretendard, sans-serif" }}>
          정답률 낮은 단원
        </Sub>
      </div>
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {nodes.map((n) => {
          const gap =
            n.passerAvgAttempts !== null
              ? n.passerAvgAttempts - n.myAttempts
              : null;
          return (
            <li key={n.nodeId}>
              <Link
                to={`/subjects/${n.lawCode}/systematic/${n.nodeId}`}
                style={{
                  display: "block",
                  padding: "12px 14px",
                  borderRadius: 12,
                  background: T.subtle,
                  border: `1px solid ${T.lineSoft}`,
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
                  <div style={{ minWidth: 0 }}>
                    <Chip tone="blue" style={{ marginBottom: 6 }}>
                      {n.lawName}
                    </Chip>
                    <div
                      style={{
                        font: "600 13px/1.4 Pretendard, sans-serif",
                        color: T.ink,
                        letterSpacing: "-0.012em",
                      }}
                    >
                      {n.name}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <Num
                      value={n.accuracyPct.toFixed(1)}
                      unit="%"
                      size={20}
                      color={T.coral}
                    />
                  </div>
                </div>
                {n.passerAvgAttempts !== null ? (
                  <div
                    style={{
                      font: "500 11px/1.5 Pretendard, sans-serif",
                      color: T.inkSoft,
                      letterSpacing: "-0.005em",
                      paddingTop: 8,
                      borderTop: `1px solid ${T.lineSoft}`,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <TrendingUpIcon size={11} color={T.blue} strokeWidth={2.5} />
                    <span>
                      합격자 평균{" "}
                      <strong
                        style={{
                          color: T.ink,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {n.passerAvgAttempts}회
                        {n.passerAvgAccuracy !== null
                          ? ` · ${Math.round(n.passerAvgAccuracy)}%`
                          : ""}
                      </strong>{" "}
                      {gap !== null && gap > 0
                        ? `· +${gap}회 더 풀어 보세요`
                        : "· 평균 이상 달성"}
                    </span>
                  </div>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
