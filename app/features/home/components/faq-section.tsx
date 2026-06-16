import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";

import { PALETTE, Reveal } from "~/features/home/lib/landing";
import { SectionHeader } from "~/features/home/components/section-header";

const ITEMS = [
  {
    q: "합격자 데이터는 어떻게 모이나요?",
    a: "합격자 본인이 직접 점수·합격 여부를 입력하고, 분석 활용에 명시적으로 동의한 경우에만 학습 데이터(시간·풀이·정답률·활동일수)를 익명으로 집계합니다. 합격증 인증은 선택입니다.",
  },
  {
    q: "무료로는 어디까지 이용할 수 있나요?",
    a: "무료 회원은 최근 판례·법령 개정 피드, 1·2차 기출 색인, 논문·도서 추록 색인, 커뮤니티·공지·스터디 모집을 평생 이용할 수 있습니다. 조문·판례·문제 본문 학습과 오답노트·하이라이트·메모·맞춤 퀴즈는 정회원(자기주도)부터, 진도·합격 예측·1·2차 모의고사·커리큘럼·강사 첨삭은 종합반에서 제공됩니다.",
  },
  {
    q: "학원 종합반은 자기주도 구독과 어떻게 다른가요?",
    a: "종합반은 학원이 짠 N주 커리큘럼이 반 단위로 적용되어 자동 주간 과제·강사 첨삭·온라인 GS 채점·반 진도 관리까지 포함됩니다. 자기주도 구독은 본인 페이스로 합격자 데이터 비교 컨설팅만 이용하는 분께 적합합니다.",
  },
  {
    q: "자연과학 4과목도 다루나요?",
    a: "네, 변리사 1차 자연과학 4과목(물리·화학·생물·지구과학)은 모두 필수 응시 과목입니다 — 총 40문제 중 과목별 10문제씩 출제됩니다. 리담변리사학원은 4과목 모두 객관식 문제 중심으로 제공하며, 법률 과목과 동일한 학습 흐름·진도 추적·오답노트가 적용됩니다.",
  },
  {
    q: "법 개정·신규 판례는 얼마나 빨리 반영되나요?",
    a: "강사진이 개정 시행 시점에 맞춰 article_revision 스냅샷으로 반영하고, 즐겨찾기·메모한 조문이 개정되면 자동 알림과 주간 리포트로 안내합니다.",
  },
  {
    q: "모바일에서도 학습할 수 있나요?",
    a: "네, 모든 화면이 모바일 반응형입니다. 조문 뷰어의 사이드바는 시트(Sheet)로 변환되며, 대시보드·문제 풀이·통계 모두 모바일에 최적화되어 있습니다.",
  },
  {
    q: "회원가입과 로그인은 어떻게 하나요?",
    a: "카카오 계정으로 로그인하면 끝입니다. 별도의 회원가입 절차나 비밀번호 없이 카카오 로그인 한 번으로 시작하며, 첫 로그인 시 계정이 자동으로 만들어집니다.",
  },
  {
    q: "결제는 어떻게 되나요?",
    a: "토스페이먼츠를 통해 카드 결제로 진행됩니다. 첫 결제 후 매월 자동 갱신되며, 언제든 본인 계정에서 해지할 수 있습니다.",
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
                    transition:
                      "transform 240ms cubic-bezier(0.22,1,0.36,1)",
                    transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                    color: PALETTE.primary,
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
