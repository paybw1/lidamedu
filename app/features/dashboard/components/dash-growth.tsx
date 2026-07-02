// GROWTH 요약 스트립 — 학습현황(게임화, feat-2-027)의 압축 미러.
// 레벨(마스터 단원 파생) · 마스터 단원 수 · 연속 학습(스트릭) · 이번 주 공부량 변화.
// 상세·코호트 비교는 /study/stats. 대시보드는 읽기 미러(persist=false) — 부작용 없음.
import {
  FlameIcon,
  ClockIcon,
  SproutIcon,
  TrophyIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Card, Num, T } from "~/features/dashboard/lib/dash";

export interface GrowthStripData {
  levelName: string;
  levelNumber: number;
  masteredCount: number;
  toNext: number | null;
  nextName: string | null;
  currentStreak: number;
  thisWeekStudyMs: number;
  studyDeltaPct: number | null; // 지난주 대비 %, 첫 주면 null
}

/** ms → 시간(소수 1자리, 10h 이상은 정수). */
function fmtHours(ms: number): string {
  const h = ms / 3_600_000;
  return h >= 10 ? `${Math.round(h)}` : h.toFixed(1);
}

interface Cell {
  icon: LucideIcon;
  label: string;
  value: string | number;
  unit?: string;
  sub: string;
  subColor?: string;
}

export function GrowthStripCard({ g }: { g: GrowthStripData }) {
  const delta = g.studyDeltaPct;
  const deltaSub =
    delta === null
      ? "첫 주 기록 중"
      : delta > 0
        ? `지난주 대비 +${delta}%`
        : delta < 0
          ? `지난주 대비 ${delta}%`
          : "지난주와 비슷";
  const deltaColor =
    delta === null || delta === 0
      ? undefined
      : delta > 0
        ? T.emerald
        : T.coral;

  const cells: Cell[] = [
    {
      icon: TrophyIcon,
      label: "레벨",
      value: g.levelName,
      sub:
        g.nextName && g.toNext !== null
          ? `${g.nextName}까지 ${g.toNext}단원`
          : "최고 단계",
    },
    {
      icon: SproutIcon,
      label: "마스터 단원",
      value: g.masteredCount,
      unit: "단원",
      sub: "정답률 + 복습 파지 기준",
    },
    {
      icon: FlameIcon,
      label: "연속 학습",
      value: g.currentStreak,
      unit: "일",
      sub: g.currentStreak > 0 ? "오늘도 이어가요" : "오늘 시작해요",
    },
    {
      icon: ClockIcon,
      label: "이번 주 공부량",
      value: fmtHours(g.thisWeekStudyMs),
      unit: "시간",
      sub: deltaSub,
      subColor: deltaColor,
    },
  ];

  return (
    <Card padding={20} hover={false}>
      <div
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        }}
      >
        {cells.map((c) => {
          const Icon = c.icon;
          return (
            <div
              key={c.label}
              style={{ display: "flex", flexDirection: "column", gap: 6 }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  font: "600 11px/1 Pretendard, sans-serif",
                  letterSpacing: "0.04em",
                  color: "var(--ink-faint)",
                }}
              >
                <Icon size={13} strokeWidth={1.8} color={T.link} />
                {c.label}
              </div>
              <Num value={c.value} unit={c.unit} size={24} weight={700} />
              <div
                style={{
                  font: "400 12px/1.4 Pretendard, sans-serif",
                  color: c.subColor ?? "var(--ink-soft)",
                  letterSpacing: "-0.005em",
                }}
              >
                {c.sub}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
