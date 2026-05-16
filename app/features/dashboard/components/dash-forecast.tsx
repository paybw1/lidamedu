// PASS FORECAST 그룹 — 합격 진단 점수(hero) · 합격자 벤치마크 · 합격자 후기.

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
          <Eyebrow style={{ marginBottom: 6 }}>합격 진단 점수</Eyebrow>
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
                  stroke="rgba(0,0,0,0.2)"
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
            color: T.blue,
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

// ── 합격자 후기 ─────────────────────────────────────────────────────────────

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
        <Eyebrow>합격자 후기</Eyebrow>
        <Link
          to="/study/passer-summaries"
          style={{
            font: "600 12px/1 Pretendard, sans-serif",
            color: T.blue,
            textDecoration: "none",
          }}
        >
          모든 후기 →
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
