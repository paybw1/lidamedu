// 포스트잇(user_memos.snippet)이 붙은 문구를 본문 위에 시각 표시.
// 조문 뷰어는 블록 렌더러가 직접 마크(MemoSnippetMark)를 끼워 넣지만, 판례 본문은
// 렌더 경로가 여러 갈래(Prose·SummaryBlock·book 표)라 DOM 무변형인
// CSS Highlight API 로 오버레이한다 — HighlightOverlay 와 동일 방식이라 하이라이트
// offset 정합에도 영향 없음.
//
// 매칭: 래퍼 안 [data-highlight-field] 컨테이너들의 textContent 에서 snippet 의
// 첫 매치를 찾아 등록. 본문 수정 등으로 못 찾으면 그 포스트잇만 조용히 생략
// (사이드 패널 목록에는 계속 보임).

import { type ReactNode, useEffect, useRef } from "react";

import type { MemoRecord } from "../labels";
import { containerText, rangeFromOffsets } from "../lib/highlight-dom";
import { getOrCreateSharedEntry } from "./highlight-overlay";

const MEMO_HIGHLIGHT_NAME = "lidam-memo";

export function MemoMarksOverlay({
  memos,
  children,
}: {
  memos: Pick<MemoRecord, "memoId" | "snippet">[];
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const snippets = [
      ...new Set(
        memos
          .map((m) => m.snippet?.trim())
          .filter((s): s is string => !!s),
      ),
    ];
    if (snippets.length === 0) return;
    const entry = getOrCreateSharedEntry(MEMO_HIGHLIGHT_NAME);
    if (!entry) return; // CSS Highlight API 미지원 브라우저 — 목록만 유지

    const containers = Array.from(
      root.querySelectorAll<HTMLElement>("[data-highlight-field]"),
    );
    const textCache = new Map<HTMLElement, string>();
    const added: Range[] = [];
    for (const snip of snippets) {
      for (const el of containers) {
        let text = textCache.get(el);
        if (text === undefined) {
          text = containerText(el);
          textCache.set(el, text);
        }
        const idx = text.indexOf(snip);
        if (idx < 0) continue;
        const range = rangeFromOffsets(el, idx, idx + snip.length);
        if (range) {
          entry.add(range);
          added.push(range);
        }
        break; // 첫 매치 컨테이너만 — 같은 문구 중복 마킹 방지
      }
    }
    return () => {
      for (const r of added) entry.delete(r);
    };
  }, [memos]);

  return <div ref={ref}>{children}</div>;
}
