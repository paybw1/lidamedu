// 이메일 템플릿 공용 테마 — 글꼴 스택 SSOT (2026-09-11 폰트 정리).
//
// ★이 파일은 app/ 의 어떤 것도 import 하지 않는다(`~/` alias·.server 금지) — react-email 미리보기가
//   esbuild 로 상대경로만 풀기 때문. 순수 상수와 이 래퍼만 둔다.
// ★transactional-emails/ 안에서 `npm install` 하지 말 것 — React 사본이 둘이 되어 앱 render 와 충돌.
//
// 웹폰트(@font-face)는 싣지 않는다: Gmail 계열이 지원하지 않고, Outlook Windows 는 @font-face 가
// 있으면 스택을 무시하고 Times New Roman 으로 떨어지는 버그가 있다(caniemail css-at-font-face).
// 대신 시스템 한글 고딕 스택을 명시한다 — Pretendard 는 설치한 수신자에게만 적용되고, 주력은
// Malgun Gothic(Windows) / Apple SD Gothic Neo(Apple) 이다. 앱의 --font-sans(Pretendard Variable
// 웹폰트 우선)와는 의도적으로 다른 스택이라 합치지 않는다.
import type { ReactNode } from "react";

import { Tailwind } from "@react-email/components";

/** Tailwind v3(react-email)는 배열을 ', ' 로 잇기만 하므로 공백 있는 이름은 따옴표를 직접 넣는다. */
export const EMAIL_FONT_SANS = [
  "Pretendard",
  '"Apple SD Gothic Neo"',
  '"Malgun Gothic"',
  '"Noto Sans KR"',
  "system-ui",
  "sans-serif",
];

/**
 * 활성 템플릿 공용 `<Tailwind>` — `font-sans` 가 붙은 요소에 위 스택이 inline font-family 로 들어간다.
 * 상속을 믿지 않는 클라이언트(Outlook 표) 대비로 Body 뿐 아니라 Container·표·버튼에도 `font-sans` 를 붙인다.
 */
export function EmailTailwind({ children }: { children: ReactNode }) {
  return (
    <Tailwind
      config={{ theme: { extend: { fontFamily: { sans: EMAIL_FONT_SANS } } } }}
    >
      {children}
    </Tailwind>
  );
}
