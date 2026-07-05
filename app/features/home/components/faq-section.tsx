import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";

import { SectionHeader } from "~/features/home/components/section-header";
import { PALETTE, Reveal } from "~/features/home/lib/landing";

const ITEMS = [
  {
    q: "회원가입과 로그인은 어떻게 하나요?",
    a: "카카오 계정으로 로그인하면 끝입니다. 별도의 회원가입 절차나 비밀번호 없이 카카오 로그인 한 번으로 시작하며, 첫 로그인 시 계정이 자동으로 만들어집니다.",
  },
  {
    q: "무료로는 어디까지 이용할 수 있나요?",
    a: "무료회원은 커뮤니티, 최근 판례·법령 개정 피드, 1·2차 기출문제, 공지·스터디 모집을 이용할 수 있습니다. 가입 후 15일간은 특허법 학습과목을 무료로 체험할 수 있습니다.",
  },
  {
    q: "어떤 과목을 다루나요?",
    a: "변리사 1차·2차의 법률 과목(특허법·상표법·디자인보호법·민법·민사소송법)과 1차 자연과학 4과목(물리·화학·생물·지구과학)을 다룹니다.",
  },
  {
    q: "학원 종합반은 자기학습과 어떻게 다른가요?",
    a: "종합반은 학원이 짠 커리큘럼이 반 단위로 적용되어 주간 과제·1차 모의고사·반 진도 관리·1:1 상담까지 포함됩니다. 자기학습은 본인 페이스로 필요한 과목만 학습하는 분께 적합합니다. (2차 모의고사·온라인 GS는 별도 프로그램)",
  },
  {
    q: "요금제는 어떻게 구성되어 있나요?",
    a: "필요한 과목만 고르는 자기학습(과목별 결제·과목 묶음 번들)과, 학원 커리큘럼이 반 단위로 적용되는 종합반으로 나뉩니다. 자세한 금액은 요금 안내 페이지에서 확인하실 수 있습니다.",
  },
  {
    q: "결제와 자동 갱신은 어떻게 되나요?",
    a: "토스페이먼츠 카드 결제로 진행되며, 동의하신 경우 매월 같은 날 자동 결제로 갱신됩니다. 자동 갱신은 언제든 본인 계정에서 해지할 수 있습니다.",
  },
  {
    q: "환불 규정은 어떻게 되나요?",
    a: "결제 후 3일 이내에 신청하면 전액 환불되고 정기구독도 함께 취소됩니다. 3일이 지난 뒤 신청하면 다음 갱신부터 청구가 중단되며, 이미 결제한 기간은 만료일까지 이용하실 수 있습니다.",
  },
  {
    q: "법 개정·신규 판례는 얼마나 빨리 반영되나요?",
    a: "강사진이 개정 시행 시점에 맞춰 반영하며, 즐겨찾기·메모한 조문이 개정되면 자동으로 알려드립니다.",
  },
  {
    q: "질문은 어떻게 하나요?",
    a: "조문·판례·문제 화면이나 커뮤니티에서 질문하면 AI가 먼저 답하고, 과목별 담당 강사가 확인·보완합니다. 답변이 등록되면 알림으로 알려드립니다.",
  },
  // 합격자 데이터 비교 항목 — 올해는 데이터 축적 단계라 숨김(사용자 결정 2026-07-05).
  //   내년 합격자 데이터 확보 후 PasserStatsSection(home.tsx)과 함께 복원.
  // {
  //   q: "합격자 데이터 비교는 어떻게 되나요?",
  //   a: "합격자가 직접 입력하고 분석 활용에 동의한 데이터만 익명으로 집계합니다. 신뢰할 만한 표본이 모이기 전까지는 비교 기능을 열지 않으며, 현재 오픈을 준비하고 있습니다.",
  // },
  {
    q: "모바일에서도 학습할 수 있나요?",
    a: "네, 모든 화면이 모바일 반응형입니다. 조문 뷰어의 사이드바는 시트(Sheet)로 변환되며, 대시보드·문제 풀이·통계 모두 모바일에 최적화되어 있습니다.",
  },
];

export function FaqSection() {
  const [open, setOpen] = useState<number>(0);
  return (
    <section
      aria-labelledby="faq-h2"
      style={{
        maxWidth: 880,
        margin: "0 auto",
        padding: "72px 24px",
      }}
    >
      <SectionHeader eyebrow="FAQ" title="자주 묻는 질문" />
      <div role="region" style={{ marginTop: 16 }}>
        {ITEMS.map((it, i) => {
          const isOpen = open === i;
          return (
            <Reveal
              key={it.q}
              delay={i * 40}
              style={{
                borderBottom: `1px solid ${PALETTE.line}`,
              }}
            >
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? -1 : i)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  background: "transparent",
                  border: 0,
                  cursor: "pointer",
                  padding: "20px 0",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  font: "600 16px/1.5 Pretendard, sans-serif",
                  color: PALETTE.ink,
                  letterSpacing: "-0.015em",
                }}
              >
                <span style={{ flex: 1 }}>{it.q}</span>
                <span
                  style={{
                    width: 24,
                    height: 24,
                    flexShrink: 0,
                    transition: "transform 240ms cubic-bezier(0.22,1,0.36,1)",
                    transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                    color: PALETTE.link,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <ChevronDownIcon size={18} strokeWidth={1.8} />
                </span>
              </button>
              <div
                style={{
                  maxHeight: isOpen ? 320 : 0,
                  overflow: "hidden",
                  transition:
                    "max-height 300ms cubic-bezier(0.22,1,0.36,1), padding 300ms ease",
                  paddingBottom: isOpen ? 22 : 0,
                }}
              >
                <div
                  style={{
                    padding: 16,
                    borderRadius: 12,
                    background: PALETTE.tint,
                    font: "400 14px/1.7 Pretendard, sans-serif",
                    color: PALETTE.ink,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {it.a}
                </div>
              </div>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
