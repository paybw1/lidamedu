// PASS FORECAST 그룹 — 합격 진단 점수(hero) · 합격자 벤치마크 · 합격자 수기.

import { ArrowDownIcon, ArrowUpIcon, TrendingUpIcon } from "lucide-react";
import { Link } from "react-router";

import {
  Card,
  Chip,
  Eyebrow,
  Num,
  ProgressBar,
  Sub,
  T,
  Title,
  useCountUp,
  useInView,
} from "~/features/dashboard/lib/dash";

// ── 합격 진단 점수 (hero) ───────────────────────────────────────────────────

export interface PassPredictionData {
  score: number;
  rating: "안정" | "가능" | "주의" | "취약";
  components: {
    study: number;
    accuracy: number;
    gs: number | null;
    activity: number;
    completion: number;
  };
  hint: string;
}

const RATING_LABEL: Record<PassPredictionData["rating"], string> = {
  안정: "안정 — 합격 안정권",
  가능: "가능 — 합격권 진입",
  주의: "주의 — 보완 필요",
  취약: "취약 — 학습 강도 점검",
};

export function PassPredictionCard({
  prediction,
}: {
  prediction: PassPredictionData;
}) {
  const [ref, inView] = useInView<HTMLDivElement>(0.25);
  const score = useCountUp(prediction.score, 1500, inView);

  const radius = 88;
  const stroke = 14;
  const cx = 110;
  const cy = 110;
  const arcLen = Math.PI * radius;
  const dashOffset =
    arcLen * (1 - (prediction.score / 100) * (inView ? 1 : 0));

  const ratingColor =
    prediction.rating === "안정"
      ? T.emerald
      : prediction.rating === "가능"
        ? T.blue
        : prediction.rating === "주의"
          ? T.amberInk
          : T.coral;
  const ratingBg =
    prediction.rating === "안정"
      ? T.emeraldSoft
      : prediction.rating === "가능"
        ? T.blueSoft
        : prediction.rating === "주의"
          ? T.amberSoft
          : T.coralSoft;

  const comps: { label: string; value: number }[] = [
    { label: "학습량", value: prediction.components.study },
    { label: "정답률", value: prediction.components.accuracy },
    ...(prediction.components.gs !== null
      ? [{ label: "GS 평균", value: prediction.components.gs }]
      : []),
    { label: "활성도", value: prediction.components.activity },
    { label: "과제 완수", value: prediction.components.completion },
  ];

  return (
    <Card padding={28} hover={false}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 4,
        }}
      >
        <div>
          <Eyebrow style={{ marginBottom: 6 }}>합격 예측 점수</Eyebrow>
          <Title size={20}>합격까지 얼마나 왔는지</Title>
        </div>
        <Chip tone="blue">실시간</Chip>
      </div>

      <div
        ref={ref}
        className="ppc-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "220px 1fr",
          gap: 28,
          marginTop: 20,
          alignItems: "center",
        }}
      >
        <div style={{ position: "relative", width: 220, height: 130 }}>
          <svg
            width="220"
            height="130"
            viewBox="0 0 220 130"
            style={{ overflow: "visible" }}
          >
            <path
              d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
              stroke={T.muted}
              strokeWidth={stroke}
              fill="none"
              strokeLinecap="round"
            />
            <path
              d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
              stroke={ratingColor}
              strokeWidth={stroke}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={arcLen}
              strokeDashoffset={dashOffset}
              style={{ transition: `stroke-dashoffset 1500ms ${T.ease}` }}
            />
            {[40, 60, 80].map((tick) => {
              const angle = Math.PI * (1 - tick / 100);
              const x1 = cx + Math.cos(angle) * (radius - stroke / 2 - 4);
              const y1 = cy - Math.sin(angle) * (radius - stroke / 2 - 4);
              const x2 = cx + Math.cos(angle) * (radius + stroke / 2 + 2);
              const y2 = cy - Math.sin(angle) * (radius + stroke / 2 + 2);
              return (
                <line
                  key={tick}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="var(--border)"
                  strokeWidth={1}
                />
              );
            })}
          </svg>
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "flex-end",
              paddingBottom: 6,
            }}
          >
            <Num value={Math.round(score)} size={48} color={ratingColor} />
            <div
              style={{
                font: "500 11px/1 Pretendard, sans-serif",
                color: T.inkSoft,
                marginTop: 4,
              }}
            >
              / 100점
            </div>
          </div>
        </div>

        <div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 12px",
              borderRadius: 9999,
              background: ratingBg,
              color: ratingColor,
              font: "700 12px/1 Pretendard, sans-serif",
              marginBottom: 10,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: ratingColor,
              }}
            />
            {RATING_LABEL[prediction.rating]}
          </div>
          <div
            style={{
              font: "400 13px/1.6 Pretendard, sans-serif",
              color: T.ink,
              background: T.blueSoft,
              padding: "10px 14px",
              borderRadius: 10,
              marginBottom: 14,
              letterSpacing: "-0.005em",
              display: "flex",
              alignItems: "flex-start",
              gap: 6,
            }}
          >
            <TrendingUpIcon
              size={14}
              color={T.blue}
              strokeWidth={2}
              style={{ flexShrink: 0, marginTop: 2 }}
            />
            <span>{prediction.hint}</span>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
            }}
          >
            {comps.map((c) => (
              <div
                key={c.label}
                style={{ display: "flex", alignItems: "center", gap: 8 }}
              >
                <span
                  style={{
                    flex: 1,
                    font: "500 12px/1 Pretendard, sans-serif",
                    color: T.inkSoft,
                    letterSpacing: "-0.005em",
                  }}
                >
                  {c.label}
                </span>
                <span style={{ width: 60 }}>
                  <ProgressBar
                    value={c.value}
                    height={4}
                    animateOnView
                    delay={200}
                  />
                </span>
                <span
                  style={{
                    width: 30,
                    textAlign: "right",
                    font: "700 11px/1 Pretendard, sans-serif",
                    color: T.ink,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {Math.round(c.value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`@media (max-width: 720px) { .ppc-grid { grid-template-columns: 1fr !important; justify-items: center; } }`}</style>
    </Card>
  );
}

// ── 합격자 벤치마크 ─────────────────────────────────────────────────────────

interface BenchmarkMetric {
  user: number | null;
  passerMean: number | null;
  passerMedian: number | null;
  userPercentile: number | null;
}

export interface PasserBenchmarkData {
  sampleSize: number;
  fallbackUsed: boolean;
  studyHours: BenchmarkMetric;
  problemAttempts: BenchmarkMetric;
  accuracyPct: BenchmarkMetric;
  activeDays: BenchmarkMetric;
  longestStreak: BenchmarkMetric;
}

const TH_STYLE = (align?: "right"): React.CSSProperties => ({
  textAlign: align ?? "left",
  padding: "8px 8px 10px",
  font: "600 11px/1 Pretendard, sans-serif",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: T.inkMute,
});
const TD_STYLE = (align?: "right"): React.CSSProperties => ({
  textAlign: align ?? "left",
  padding: "10px 8px",
  font: "500 13px/1 Pretendard, sans-serif",
  color: T.ink,
  letterSpacing: "-0.01em",
  fontVariantNumeric: "tabular-nums",
});

export function PasserBenchmarkCard({
  benchmark,
}: {
  benchmark: PasserBenchmarkData;
}) {
  const rows = [
    { label: "학습 시간", unit: "h", m: benchmark.studyHours },
    { label: "총 풀이", unit: "", m: benchmark.problemAttempts },
    { label: "평균 정답률", unit: "%", m: benchmark.accuracyPct },
    { label: "활동 일수", unit: "일", m: benchmark.activeDays },
    { label: "최장 연속", unit: "일", m: benchmark.longestStreak },
  ];
  const fmt = (n: number | null) =>
    n === null ? "—" : n % 1 !== 0 ? n.toFixed(1) : n.toString();

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
        <div>
          <Eyebrow>합격자 벤치마크</Eyebrow>
          <Title size={15} style={{ marginTop: 4 }}>
            본인 학습 vs 합격자 평균
          </Title>
        </div>
        <Link
          to="/study/passer-trend"
          style={{
            font: "600 12px/1 Pretendard, sans-serif",
            color: T.link,
            textDecoration: "none",
          }}
        >
          12주 곡선 →
        </Link>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={TH_STYLE()}>지표</th>
            <th style={TH_STYLE("right")}>본인</th>
            <th style={TH_STYLE("right")}>합격자</th>
            <th style={TH_STYLE("right")}>차이</th>
            <th style={TH_STYLE("right")}>분위</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const delta =
              r.m.user !== null && r.m.passerMean !== null
                ? r.m.user - r.m.passerMean
                : null;
            const pct =
              delta !== null && r.m.passerMean
                ? (delta / r.m.passerMean) * 100
                : null;
            const ahead = delta !== null && delta >= 0;
            return (
              <tr key={r.label} style={{ borderTop: `1px solid ${T.lineSoft}` }}>
                <td style={TD_STYLE()}>{r.label}</td>
                <td style={TD_STYLE("right")}>
                  {fmt(r.m.user)}
                  {r.m.user !== null ? r.unit : ""}
                </td>
                <td style={TD_STYLE("right")}>
                  {fmt(r.m.passerMean)}
                  {r.m.passerMean !== null ? r.unit : ""}
                </td>
                <td style={TD_STYLE("right")}>
                  {pct === null ? (
                    <span style={{ color: T.inkMute }}>—</span>
                  ) : (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 2,
                        padding: "2px 7px",
                        borderRadius: 9999,
                        background: ahead ? T.emeraldSoft : T.coralSoft,
                        color: ahead ? T.emerald : T.coral,
                        font: "700 11px/1 Pretendard, sans-serif",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {ahead ? (
                        <ArrowUpIcon size={9} strokeWidth={3} />
                      ) : (
                        <ArrowDownIcon size={9} strokeWidth={3} />
                      )}
                      {ahead ? "+" : ""}
                      {pct.toFixed(1)}%
                    </span>
                  )}
                </td>
                <td style={TD_STYLE("right")}>
                  {r.m.userPercentile === null ? (
                    <span style={{ color: T.inkMute }}>—</span>
                  ) : (
                    <span
                      style={{
                        color:
                          r.m.userPercentile >= 50 ? T.emerald : T.coral,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {r.m.userPercentile}분위
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <Sub style={{ marginTop: 10, font: "500 11px/1.4 Pretendard, sans-serif" }}>
        합격자 표본 {benchmark.sampleSize}명
        {benchmark.fallbackUsed ? " · 인접 연도 표본 포함" : ""}
      </Sub>
    </Card>
  );
}

// ── 합격자 수기 ─────────────────────────────────────────────────────────────

export interface PasserSummaryData {
  examYear: number;
  scoreBucket: string | null;
  verified: boolean;
  summaryMd: string;
}

export function PasserSummariesCard({
  summaries,
}: {
  summaries: ReadonlyArray<PasserSummaryData>;
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
        <Eyebrow>합격자 수기</Eyebrow>
        <Link
          to="/study/passer-summaries"
          style={{
            font: "600 12px/1 Pretendard, sans-serif",
            color: T.link,
            textDecoration: "none",
          }}
        >
          모든 수기 →
        </Link>
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
        {summaries.map((s, i) => {
          const excerpt = s.summaryMd
            .replace(/[#*`>_~-]/g, "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 110);
          return (
            <li
              key={i}
              style={{
                padding: "14px 16px",
                borderRadius: 12,
                background: T.subtle,
                border: `1px solid ${T.lineSoft}`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 8,
                }}
              >
                <Chip tone="blue">{s.examYear}년</Chip>
                {s.scoreBucket ? (
                  <Chip tone="neutral">{s.scoreBucket}점</Chip>
                ) : null}
                {s.verified ? <Chip tone="emerald">✓ 인증</Chip> : null}
              </div>
              <p
                style={{
                  font: "400 13px/1.65 Pretendard, sans-serif",
                  color: T.ink,
                  letterSpacing: "-0.005em",
                  margin: 0,
                }}
              >
                &ldquo;{excerpt}&rdquo;
              </p>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

// ── 공식 합격선 벤치마크 카드 ────────────────────────────────────────────────
// 실 합격자 학습 패턴 표본이 임계값(A3 게이트) 미만일 때 노출.
// 합격자 평균 대신 한국산업인력공단 공식 합격선(실측 cut_line)을 비교 앵커로 사용.
// 1차 cut_line 은 평균 60 보다 훨씬 높음(~80), 2차는 60 보다 낮음(~54).
// "단순 60 룰" 노출 금지 — 차수별로 다른 실측 합격선을 보여준다.

import {
  type ExamRound,
  type OperativeTarget,
  type StatutoryFloor,
  getOperativeTarget,
  getStatutoryFloor,
} from "~/features/exam-results/pass-criteria";
import {
  OFFICIAL_EXAM_STATS,
  type Round1YearStat,
  type Round2YearStat,
} from "~/features/exam-results/official-stats";

function CutLineSparkline({ round }: { round: ExamRound }) {
  const rows: (Round1YearStat | Round2YearStat)[] =
    round === "first"
      ? OFFICIAL_EXAM_STATS.round1.by_year
      : OFFICIAL_EXAM_STATS.round2.by_year;
  const recent = rows
    .filter((r) => r.cut_line !== null)
    .sort((a, b) => a.year - b.year)
    .slice(-6);
  if (recent.length === 0) return null;
  const max = Math.max(...recent.map((r) => r.cut_line!));
  const min = Math.min(...recent.map((r) => r.cut_line!));
  const range = Math.max(1, max - min);
  return (
    <div className="mt-2 flex items-end gap-1 h-12" aria-label="최근 합격선 추세">
      {recent.map((r) => {
        const h = 8 + ((r.cut_line! - min) / range) * 32;
        return (
          <div
            key={r.year}
            className="flex flex-col items-center gap-0.5"
            title={`${r.year}: ${r.cut_line}점`}
          >
            <div
              className="w-4 rounded-sm bg-primary/70"
              style={{ height: `${h}px` }}
            />
            <span className="text-[9px] text-muted-foreground tabular-nums">
              {String(r.year).slice(-2)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function RoundBlock({
  round,
  electiveNote,
}: {
  round: ExamRound;
  electiveNote?: string;
}) {
  const floor: StatutoryFloor = getStatutoryFloor(round);
  const target: OperativeTarget = getOperativeTarget(round);
  const roundLabel = round === "first" ? "1차" : "2차";
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-3">
      <div className="text-xs font-medium text-muted-foreground">
        {roundLabel} 시험 합격 기준
      </div>
      {/* 실측 합격선 — operative target */}
      <div className="mt-1">
        {target.recentCutLine !== null ? (
          <>
            <div className="text-sm font-semibold text-foreground tabular-nums">
              실측 합격선 ≈ {target.recentCutLine}점
            </div>
            <div className="text-[11px] text-muted-foreground">
              한국산업인력공단 {target.yearRange!.min}~{target.yearRange!.max}년 평균
              ({target.sampleYears}개년 · 최근 {target.latestYear}년{" "}
              {target.latestCutLine}점)
            </div>
            <CutLineSparkline round={round} />
          </>
        ) : (
          <div className="text-[11px] text-muted-foreground">
            {target.unavailableReason ?? "실측 합격선 데이터가 아직 없습니다."}
          </div>
        )}
      </div>
      {/* 법정 기준 — statutory floor */}
      <div className="mt-2 border-t border-border pt-2 text-[11px] text-muted-foreground">
        법정 자격선 — 과목 {floor.subjectFloor}점 미만 과락 · 평균{" "}
        {floor.averagePass}점 이상
      </div>
      {electiveNote ? (
        <div className="mt-1 text-[11px] text-muted-foreground">{electiveNote}</div>
      ) : null}
    </div>
  );
}

export function PassCriterionAnnouncementCard() {
  return (
    <Card>
      <Eyebrow>PASS CRITERION · 공식 합격선</Eyebrow>
      <Title>한국산업인력공단 공식 합격선 기준</Title>
      <div className="mt-2">
        <Sub>공식 채점통계 기반 합격선 안내</Sub>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <RoundBlock round="first" />
        <RoundBlock
          round="second"
          electiveNote="선택과목 Pass/Fail (50점 이상 통과·총점 미산입)"
        />
      </div>
      <div className="mt-3 text-[11px] text-muted-foreground">
        실측 합격선은 한국산업인력공단(큐넷) 공개 채점통계 기준입니다 — 1차
        합격선은 평균 60점보다 훨씬 높고(상대 3배수 선발), 2차는 60점보다
        낮습니다(최소인원 보정).
      </div>
    </Card>
  );
}
