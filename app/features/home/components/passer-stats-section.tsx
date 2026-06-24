import { ArrowRightIcon } from "lucide-react";

import { SectionHeader } from "~/features/home/components/section-header";
import { LandingButton, PALETTE, Reveal } from "~/features/home/lib/landing";

interface AxisDef {
  fg: string;
  bg: string;
  lbl: string;
  desc: string;
}

// 실데이터 미연동(실 합격자 표본 누적 전) — 과장 수치 대신 "무엇을 비교하는지" 축만 소개.
const COMPARE_AXES: AxisDef[] = [
  {
    fg: "#2D5BA8",
    bg: "rgba(45,91,168,0.08)",
    lbl: "분석 합격자 풀",
    desc: "합격증 인증 + 분석 동의한 합격자만 익명·집계합니다.",
  },
  {
    fg: "#10A37F",
    bg: "rgba(16,163,127,0.08)",
    lbl: "학습 시간",
    desc: "응시 전년~당해 누적 학습 시간을 합격자 평균과 대조합니다.",
  },
  {
    fg: "#7B6BA0",
    bg: "rgba(123,107,160,0.08)",
    lbl: "풀이량",
    desc: "객관식·정오문제·주관식 합산 풀이량을 비교합니다.",
  },
  {
    fg: "#A77B3F",
    bg: "rgba(167,123,63,0.10)",
    lbl: "정답률",
    desc: "최근 12주 정답률의 분위와 차이를 보여줍니다.",
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
  return (
    <section
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
            "실제 변리사 합격자가 직접 입력·동의한 학습 데이터를 익명·집계해, 본인 학습이 합격자 평균에 얼마나 가까운지 분위와 차이로 비교해 드립니다. 실 합격자 데이터가 일정 수 이상 누적되면 자동으로 공개됩니다."
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
          {COMPARE_AXES.map((a, i) => (
            <AxisCard key={a.lbl} {...a} delay={i * 80} />
          ))}
        </div>

        <Reveal
          delay={400}
          as="p"
          style={{
            font: "400 12px/1.6 Pretendard, sans-serif",
            color: PALETTE.inkSoft,
            marginTop: 14,
            textAlign: "center",
          }}
        >
          실 합격자 데이터가 누적되는 대로 위 지표가 실제 수치로 공개됩니다.
          가입 후 학습할수록 본인 데이터도 함께 쌓입니다.
        </Reveal>

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
            가입하고 시작하기
          </LandingButton>
          <div
            style={{
              font: "400 12px/1.5 Pretendard, sans-serif",
              color: PALETTE.inkSoft,
              marginTop: 10,
            }}
          >
            학습을 시작하면 합격자 데이터가 쌓이는 대로 본인 진도와 나란히
            비교됩니다
          </div>
        </Reveal>
      </div>
    </section>
  );
}

interface AxisCardProps extends AxisDef {
  delay: number;
}

function AxisCard({ fg, bg, lbl, desc, delay }: AxisCardProps) {
  return (
    <Reveal
      delay={delay}
      style={{
        padding: "16px 16px 14px",
        background: bg,
        borderRadius: 16,
        border: `1px solid rgba(0,0,0,0.06)`,
      }}
    >
      <div
        style={{
          font: "700 14px/1.3 Pretendard, sans-serif",
          letterSpacing: "-0.01em",
          color: fg,
          marginBottom: 8,
        }}
      >
        {lbl}
      </div>
      <div
        style={{
          font: "400 13px/1.6 Pretendard, sans-serif",
          color: PALETTE.inkSoft,
          letterSpacing: "-0.005em",
        }}
      >
        {desc}
      </div>
    </Reveal>
  );
}
