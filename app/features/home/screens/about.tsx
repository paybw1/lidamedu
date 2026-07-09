// 학원 소개(인사말) — 공개 페이지. 푸터 "소개" 링크 대상.
// 본문은 리담지식재산교육원 공식 인사말(원문 그대로).
import { AboutSectionNav } from "../components/about-section-nav";

import type { Route } from "./+types/about";

export const meta: Route.MetaFunction = () => [
  { title: "소개 | 리담변리사학원" },
  {
    name: "description",
    content:
      "변리사의 꿈을 함께 합니다 — 리담지식재산교육원 인사말. 첫 시작부터 합격의 순간까지 함께합니다.",
  },
];

// 인사말 본문 — 단락 단위. 원문 줄바꿈을 단락 내 줄로 보존.
const GREETING: string[][] = [
  [
    "누구에게나 처음은 있습니다.",
    "모든 시험이 어렵지만,",
    "대한민국 산업의 미래를 책임지는 변리사시험은 결코 녹록하지 않습니다.",
  ],
  [
    "방대한 학습량, 긴 준비 기간,",
    "그리고 끝까지 버텨야 하는 마음의 무게까지",
    "이 시험은 실력뿐 아니라 태도와 방향을 끊임없이 요구합니다.",
  ],
  [
    "리담은 그 과정이",
    "혼자 견뎌야 하는 시간이 되지 않기를 바라는 마음에서 출발했습니다.",
  ],
  [
    "우리는 단순히 지식을 전달하는 곳이 아니라,",
    "배움의 이치를 설명하고,",
    "이해에 이르기까지의 과정을 함께 고민하며,",
    "합격이라는 목표에 이르는 길을 끝까지 동행하고자 합니다.",
  ],
  ["여러분의 첫 시작부터", "합격의 순간까지,", "그 모든 과정에 함께하겠습니다."],
];

export default function About() {
  return (
    <>
      <AboutSectionNav />
      <main className="mx-auto w-full max-w-3xl px-5 py-16 md:px-8 md:py-24">
        <header className="mb-12 text-center md:mb-16">
          <p className="text-link mb-3 font-mono text-xs font-semibold tracking-[0.2em] uppercase">
            Dreams start here
          </p>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            변리사의 꿈을 함께 합니다.
          </h1>
        </header>

      <div className="space-y-8 text-center text-[15px] leading-[1.9] md:text-base md:leading-[2.1]">
        {GREETING.map((para, i) => (
          <p key={i} className="text-foreground/90">
            {para.map((line, j) => (
              <span key={j} className="block">
                {line}
              </span>
            ))}
          </p>
        ))}
      </div>

        <p className="text-muted-foreground mt-14 text-center text-sm font-semibold md:mt-20">
          — 리담지식재산교육원 임직원 일동
        </p>
      </main>
    </>
  );
}
