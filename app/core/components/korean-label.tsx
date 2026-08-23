// 표 라벨 — 한국어 복합어를 뜻 단위로 끊을 수 있게 <wbr> 을 심어 그린다.
//
// ★CSS 는 낱말의 짜임을 모른다. `word-break: keep-all` 은 낱말을 통째로 유지하고, 칸보다
//   길면 `overflow-wrap: anywhere` 가 아무 데서나 자른다 — 「적법성심리」가 "적법성심 / 리"
//   로 끊기던 이유다(원장 보고 2026-08-23).
// ★<wbr> 은 textContent 에 아무것도 더하지 않아 하이라이트·포스트잇의 글자 오프셋이
//   그대로다. (제로폭 공백 U+200B 은 글자로 세어져 오프셋을 민다 — 쓰면 안 된다.)
import { Fragment } from "react";

import { labelSegments } from "~/core/lib/korean-wrap";

export function KoreanLabel({
  text,
  perChar = false,
}: {
  text: string;
  /** 3자 한 덩어리를 글자마다 끊는다 — 열 폭이 고정된 표(도해)에서만 켠다. */
  perChar?: boolean;
}) {
  return (
    <>
      {text.split("\n").map((line, li) => (
        <Fragment key={li}>
          {li > 0 ? "\n" : null}
          {labelSegments(line, { perChar }).map((seg, i) => (
            <Fragment key={i}>
              {i > 0 ? <wbr /> : null}
              {seg}
            </Fragment>
          ))}
        </Fragment>
      ))}
    </>
  );
}

/** 자식이 순수 문자열일 때만 <wbr> 을 심는다 — 그 밖(굵게·링크 등)은 그대로 둔다. */
export function wrapIfPlainText(children: React.ReactNode): React.ReactNode {
  return typeof children === "string" ? (
    <KoreanLabel text={children} />
  ) : (
    children
  );
}
