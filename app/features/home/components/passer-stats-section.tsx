import type { CSSProperties, ReactNode } from "react";

import {
  ArrowRightIcon,
  ClockIcon,
  type LucideIcon,
  PencilLineIcon,
  TargetIcon,
  UsersIcon,
} from "lucide-react";

import { SectionHeader } from "~/features/home/components/section-header";
import { LandingButton, PALETTE, Reveal } from "~/features/home/lib/landing";

interface AxisDef {
  Icon: LucideIcon;
  fg: string;
  bg: string;
  lbl: string;
  desc: string;
}

// 실데이터 미연동(실 합격자 표본 누적 전) — 과장 수치 대신 "무엇을 비교하는지" 축만 소개.
const COMPARE_AXES: AxisDef[] = [
  {
    Icon: UsersIcon,
    fg: "#2D5BA8",
    bg: "rgba(45,91,168,0.10)",
    lbl: "분석 합격자 풀",
    desc: "합격증 인증 + 분석 동의한 합격자만 익명 집계",
  },
  {
    Icon: ClockIcon,
    fg: "#10A37F",
    bg: "rgba(16,163,127,0.10)",
    lbl: "학습 시간",
    desc: "응시 전년~당해 누적 시간을 합격자 평균과 대조",
  },
  {
    Icon: PencilLineIcon,
    fg: "#7B6BA0",
    bg: "rgba(123,107,160,0.10)",
    lbl: "풀이량",
    desc: "객관식·정오문제·주관식 합산",
  },
  {
    Icon: TargetIcon,
    fg: "#A77B3F",
    bg: "rgba(167,123,63,0.12)",
    lbl: "정답률",
    desc: "최근 12주 정답률의 분위·차이",
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

const panelStyle: CSSProperties = {
  padding: 20,
  background: "#fff",
  borderRadius: 16,
  border: `1px solid ${PALETTE.line}`,
  display: "flex",
  flexDirection: "column",
};

export function PasserStatsSection() {
  return (
    <section
      aria-labelledby="passer-h2"
      style={{ maxWidth: 1200, margin: "0 auto", padding: "64px 24px" }}
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
          className="passer-grid"
          style={{
            display: "grid",
            gap: 16,
            marginTop: 32,
            gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 1fr)",
            alignItems: "stretch",
          }}
        >
          {/* 좌 — 비교 미리보기 [예시] */}
          <Reveal style={panelStyle}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <PanelLabel>
                비교 미리보기 <Tag>예시</Tag>
              </PanelLabel>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: PALETTE.tint,
                  color: PALETTE.primary,
                  padding: "4px 10px",
                  borderRadius: 9999,
                  font: "700 11px/1 Pretendard, sans-serif",
                  letterSpacing: "-0.01em",
                }}
              >
                본인 · 상위 38% (예시)
              </span>
            </div>

            <DistributionPreview />

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                font: "500 11px/1 Pretendard, sans-serif",
                color: PALETTE.inkMute,
                marginTop: 2,
              }}
            >
              <span>학습량 낮음</span>
              <span>높음</span>
            </div>

            <PanelFoot>
              예시 화면 — 실제 분위는 합격자 데이터가 쌓이면 표시됩니다.
            </PanelFoot>
          </Reveal>

          {/* 우 — 4축 압축 + 조건 */}
          <Reveal delay={120} style={panelStyle}>
            <PanelLabel>이렇게 비교합니다</PanelLabel>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: "14px 0 0",
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              {COMPARE_AXES.map((a) => (
                <li
                  key={a.lbl}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      background: a.bg,
                      color: a.fg,
                      flexShrink: 0,
                    }}
                  >
                    <a.Icon size={17} strokeWidth={2} />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        font: "700 14px/1.4 Pretendard, sans-serif",
                        color: PALETTE.ink,
                        letterSpacing: "-0.01em",
                      }}
                    >
                      {a.lbl}
                    </div>
                    <div
                      style={{
                        font: "400 12px/1.5 Pretendard, sans-serif",
                        color: PALETTE.inkSoft,
                        letterSpacing: "-0.005em",
                      }}
                    >
                      {a.desc}
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <div
              style={{
                marginTop: "auto",
                paddingTop: 16,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span
                style={{
                  background: PALETTE.tint,
                  color: PALETTE.primary,
                  padding: "3px 9px",
                  borderRadius: 9999,
                  font: "700 10px/1.4 Pretendard, sans-serif",
                  letterSpacing: "0.02em",
                  flexShrink: 0,
                }}
              >
                준비 중
              </span>
              <span
                style={{
                  font: "500 12px/1.5 Pretendard, sans-serif",
                  color: PALETTE.inkSoft,
                  letterSpacing: "-0.005em",
                }}
              >
                실 합격자 10명 이상 모이면 자동 공개
              </span>
            </div>
          </Reveal>
        </div>

        <Reveal
          delay={300}
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

      <style>{`
        @media (max-width: 860px) {
          .passer-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  );
}

function DistributionPreview() {
  return (
    <svg
      viewBox="0 0 340 150"
      role="img"
      aria-label="합격자 학습량 분포와 본인 위치 (예시)"
      style={{
        width: "100%",
        height: "auto",
        margin: "14px 0 4px",
        display: "block",
      }}
    >
      <defs>
        <linearGradient id="passer-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(45,91,168,0.22)" />
          <stop offset="100%" stopColor="rgba(45,91,168,0.02)" />
        </linearGradient>
      </defs>
      <path
        d="M 14,120 C 80,120 104,38 162,38 C 220,38 244,120 326,120 Z"
        fill="url(#passer-fill)"
      />
      <path
        d="M 14,120 C 80,120 104,38 162,38 C 220,38 244,120 326,120"
        fill="none"
        stroke={PALETTE.primary}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <line
        x1="14"
        y1="120"
        x2="326"
        y2="120"
        stroke="rgba(0,0,0,0.12)"
        strokeWidth="1"
      />
      <line
        x1="232"
        y1="120"
        x2="232"
        y2="68"
        stroke={PALETTE.primary}
        strokeWidth="1.5"
        strokeDasharray="3 3"
      />
      <circle
        cx="232"
        cy="68"
        r="5"
        fill={PALETTE.primary}
        stroke="#fff"
        strokeWidth="2"
      />
      <text
        x="232"
        y="55"
        textAnchor="middle"
        fill={PALETTE.primary}
        style={{ font: "700 11px/1 Pretendard, sans-serif" }}
      >
        본인
      </text>
    </svg>
  );
}

function PanelLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        font: "600 11px/1 Pretendard, sans-serif",
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: PALETTE.primary,
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      {children}
    </div>
  );
}

function Tag({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        background: PALETTE.tint,
        color: PALETTE.primary,
        padding: "2px 7px",
        borderRadius: 6,
        font: "600 10px/1.4 Pretendard, sans-serif",
        letterSpacing: "0.02em",
      }}
    >
      {children}
    </span>
  );
}

function PanelFoot({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        font: "400 12px/1.6 Pretendard, sans-serif",
        color: PALETTE.inkSoft,
        letterSpacing: "-0.005em",
        marginTop: "auto",
        paddingTop: 12,
      }}
    >
      {children}
    </div>
  );
}
