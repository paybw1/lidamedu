// 섹션 라벨 — 작은 고딕 텍스트로 시각 위계 형성(2026-09-11: font-mono 제거 — 한글이 Windows 에서 굴림체로 떨어짐).
// ★uppercase 를 걸지 않는다(2026-09-15). 이 서비스의 라벨은 전부 한글이라 대문자 변환은
//   아무 효과가 없고(현 사용처 15개 파일 전수 확인 — 시각 변화 0), 영어 라벨은 이미 대문자로
//   타이핑돼 들어온다. 규칙만 남아 "영어 템플릿 습관"을 다른 화면으로 퍼뜨리고 있었다.
//   디자인 브리프 §4 도 「한글 라벨은 대문자 변환 금지」로 이미 정하고 있다.

import type { ReactNode } from "react";

import { cn } from "~/core/lib/utils";

export function Eyebrow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "text-ink-faint text-xs font-semibold tracking-[0.08em]",
        className,
      )}
    >
      {children}
    </div>
  );
}
