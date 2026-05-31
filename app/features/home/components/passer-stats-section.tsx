import { ArrowRightIcon } from "lucide-react";

import {
  LandingButton,
  PALETTE,
  Reveal,
  useCountUp,
  useInView,
} from "~/features/home/lib/landing";
import { SectionHeader } from "~/features/home/components/section-header";

interface StatDef {
  fg: string;
  bg: string;
  lbl: string;
  target: number;
  unit: string;
  sub: string;
  decimal?: number;
}

const STATS: StatDef[] = [
  {
    fg: "#2D5BA8",
    bg: "rgba(45,91,168,0.08)",
    lbl: "분석 합격자",
    target: 128,
    unit: "명",
    sub: "합격증 인증 + 분석 동의",
  },
  {
    fg: "#10A37F",
    bg: "rgba(16,163,127,0.08)",
    lbl: "평균 학습",
    target: 186,
    unit: "h",
    sub: "응시 전년~당해 누적",
  },
  {
    fg: "#7B6BA0",
    bg: "rgba(123,107,160,0.08)",
    lbl: "평균 풀이",
    target: 2431,
    unit: "",
    sub: "객관식·OX·주관식 합산",
  },
  {
    fg: "#A77B3F",
    bg: "rgba(167,123,63,0.10)",
    lbl: "평균 정답률",
    target: 74.2,
    unit: "%",
    sub: "최근 12주 기준",
    decimal: 1,
  },
];

const FEATURES = [
  {
    t: "평균 대비 비교",
    d: "본인 학습이 합격자 평균과 얼마나 가까운지, 분위와 차이로 확인.",
  },
  {
    t: "자동 추천 액션",
    d: "다음 한 주에 무엇을 풀고 어떤 단원을 복습할지 자동 제안.",
  },
  {
    t: "12주 학습 곡선",
    d: "합격자 분포 위에 본인 곡선을 겹쳐 보고, 위험 신호 알림.",
  },
];

export function PasserStatsSection() {
  const [ref, inView] = useInView<HTMLElement>();
  return (
    <section
      ref={ref}
      aria-labelledby="passer-h2"
      style={{
        maxWidth: 1200,
        margin: "0 auto",
        padding: "64px 24px",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          border: `1px solid ${PALETTE.line}`,
          boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
          padding: "clamp(28px, 4vw, 48px)",
        }}
      >
        <SectionHeader
          eyebrow="📊 합격자 데이터 기반 컨설팅"
          title={"합격자의 학습 패턴이 곧\n본인의 합격 지도가 됩니다"}
          subtitle={
            "실제 변리사 합격자가 직접 입력하고 동의한 학습 데이터를 익명·집계해서, 본인 학습이 합격자 평균에 얼마나 가까운지 분위와 차이로 보여드립니다."
          }
        />

        <div
          style={{
            display: "grid",
            gap: 14,
            marginTop: 32,
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          }}
        >
          {STATS.map((s, i) => (
            <StatCard key={s.lbl} {...s} start={inView} delay={i * 80} />
          ))}
        </div>

        <div
          style={{
            display: "grid",
            gap: 14,
            marginTop: 32,
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          }}
        >
          {FEATURES.map((f, i) => (
            <Reveal
              key={f.t}
              delay={i * 80 + 160}
              style={{
                padding: 18,
                borderRadius: 16,
                background: PALETTE.tint,
              }}
            >
              <div
                style={{
                  font: "700 15px/1.4 Pretendard, sans-serif",
                  color: PALETTE.ink,
                  letterSpacing: "-0.015em",
                  marginBottom: 6,
                }}
              >
                {f.t}
              </div>
              <div
                style={{
                  font: "400 13px/1.6 Pretendard, sans-serif",
                  color: PALETTE.inkSoft,
                  letterSpacing: "-0.01em",
                }}
              >
                {f.d}
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={500} style={{ marginTop: 32, textAlign: "center" }}>
          <LandingButton
            size="lg"
            variant="primary"
            to="/join"
            iconRight={<ArrowRightIcon size={17} strokeWidth={1.8} />}
          >
            가입하고 비교 보기
          </LandingButton>
          <div
            style={{
              font: "400 12px/1.5 Pretendard, sans-serif",
              color: PALETTE.inkSoft,
              marginTop: 10,
            }}
          >
            가입 즉시 합격자 평균과 본인 진도를 나란히 비교
          </div>
        </Reveal>
      </div>
    </section>
  );
}

interface StatCardProps extends StatDef {
  start: boolean;
  delay: number;
}

function StatCard({
  fg,
  bg,
  lbl,
  target,
  unit,
  sub,
  decimal = 0,
  start,
  delay,
}: StatCardProps) {
  const v = useCountUp(target, 1200, start);
  const display =
    decimal > 0 ? v.toFixed(decimal) : Math.round(v).toLocaleString("ko-KR");
  const finalText =
    (decimal > 0 ? target.toFixed(decimal) : target.toLocaleString("ko-KR")) +
    unit;
  return (
    <Reveal
      delay={delay}
      style={{
        padding: "16px 16px 14px",
        background: bg,
        borderRadius: 16,
        border: `1px solid rgba(0,0,0,0.06)`,
        position: "relative",
      }}
    >
      <div
        style={{
          font: "600 11px/1 Pretendard, sans-serif",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: fg,
          marginBottom: 10,
        }}
      >
        {lbl}
      </div>
      <div
        aria-hidden="true"
        style={{
          font: "800 30px/1 Pretendard, sans-serif",
          letterSpacing: "-0.02em",
          fontVariantNumeric: "tabular-nums",
          color: PALETTE.ink,
        }}
      >
        {display}
        {unit ? (
          <span
            style={{
              fontSize: 16,
              color: PALETTE.inkSoft,
              marginLeft: 2,
            }}
          >
            {unit}
          </span>
        ) : null}
      </div>
      <span
        style={{ position: "absolute", left: -9999, top: "auto" }}
      >
        {finalText}
      </span>
      <div
        style={{
          font: "400 12px/1.4 Pretendard, sans-serif",
          color: PALETTE.inkSoft,
          marginTop: 6,
          letterSpacing: "-0.005em",
        }}
      >
        {sub}
      </div>
    </Reveal>
  );
}
