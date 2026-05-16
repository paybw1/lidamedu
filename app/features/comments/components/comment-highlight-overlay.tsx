// 강사 코멘트 하이라이트(feat-8-022) 를 본문 컨테이너에 visual overlay 로 적용.
// HighlightOverlay(개인 하이라이트) 와 같은 메커니즘 — CSS Custom Highlight Registry.
// 차이점:
//   - highlight name 이 lidam-cmt-* (개인 하이라이트 lidam-hl-* 와 별도 registry entry)
//     → 학생 개인 하이라이트와 시각적으로 구분 (app.css 에서 더 진한 틴트 + 밑줄).
//   - anchor !== null 인 ContentComment 만 그린다.
//   - 코멘트 하이라이트 영역 클릭 시 우측 패널 코멘트 탭을 연다 (dispatchOpenCommentTab).
//
// 폴백: CSS.highlights 미지원 브라우저에서는 overlay 없이 동작 (코멘트 패널 목록은 계속 보임).

import { useEffect, useRef, type ReactNode } from "react";

import { dispatchOpenCommentTab } from "~/features/laws/lib/comment-event";

import { rangeFromOffsets } from "~/features/annotations/lib/highlight-dom";
import type {
  CommentHighlightColor,
  ContentComment,
} from "~/features/comments/queries.server";

const HIGHLIGHT_NAME_PREFIX = "lidam-cmt-";

function highlightName(color: CommentHighlightColor): string {
  return `${HIGHLIGHT_NAME_PREFIX}${color}`;
}

function getHighlightCtor(): typeof Highlight | null {
  if (typeof globalThis === "undefined") return null;
  const ctor = (globalThis as unknown as { Highlight?: typeof Highlight })
    .Highlight;
  return ctor ?? null;
}

function getHighlightRegistry() {
  if (typeof CSS === "undefined") return null;
  return (
    (CSS as unknown as { highlights?: Map<string, Highlight> }).highlights ??
    null
  );
}

// 색깔별 공유 entry — 모든 인스턴스가 함께 사용한다 (HighlightOverlay 와 동일 전략).
const sharedEntries: Record<CommentHighlightColor, Highlight | null> = {
  green: null,
  yellow: null,
  red: null,
  blue: null,
};

function getOrCreateSharedEntry(
  color: CommentHighlightColor,
): Highlight | null {
  if (typeof window === "undefined") return null;
  const HighlightCtor = getHighlightCtor();
  const registry = getHighlightRegistry();
  if (!HighlightCtor || !registry) return null;
  let entry = sharedEntries[color];
  if (!entry) {
    entry = new HighlightCtor();
    sharedEntries[color] = entry;
    registry.set(highlightName(color), entry);
  }
  return entry;
}

export function CommentHighlightOverlay({
  comments,
  fieldPath = "article.body",
  targetType,
  targetId,
  children,
}: {
  /** target 의 모든 코멘트. anchor !== null + fieldPath 일치하는 것만 그린다. */
  comments: ContentComment[];
  fieldPath?: string;
  /** 코멘트 하이라이트 클릭 → 코멘트 탭 열기에 사용. */
  targetType: "article" | "case" | "problem";
  targetId: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const container = ref.current;
    if (!container) return;

    const relevant = comments.filter(
      (c) =>
        c.anchor !== null &&
        (c.anchor.fieldPath || "article.body") === fieldPath,
    );

    // 이번 인스턴스가 추가한 (color, range) 들 — cleanup 에서 자기 것만 제거.
    const added: Array<{ color: CommentHighlightColor; range: Range }> = [];
    for (const c of relevant) {
      const anchor = c.anchor;
      if (!anchor) continue;
      const range = rangeFromOffsets(
        container,
        anchor.startOffset,
        anchor.endOffset,
      );
      if (!range) continue;
      const entry = getOrCreateSharedEntry(anchor.color);
      if (!entry) continue;
      entry.add(range);
      added.push({ color: anchor.color, range });
    }

    return () => {
      for (const { color, range } of added) {
        const entry = sharedEntries[color];
        if (entry) entry.delete(range);
      }
    };
  }, [comments, fieldPath]);

  // CSS Highlight 는 포인터 이벤트를 받지 않으므로, 컨테이너 클릭 시 클릭 지점이
  // 코멘트 하이라이트 구간 안인지 caret 위치로 판정해 코멘트 탭을 연다.
  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const container = ref.current;
    if (!container) return;
    const relevant = comments.filter(
      (c) =>
        c.anchor !== null &&
        (c.anchor.fieldPath || "article.body") === fieldPath,
    );
    if (relevant.length === 0) return;
    const caret = caretOffsetAt(container, e.clientX, e.clientY);
    if (caret === null) return;
    const hit = relevant.some(
      (c) =>
        c.anchor !== null &&
        caret >= c.anchor.startOffset &&
        caret < c.anchor.endOffset,
    );
    if (!hit) return;
    dispatchOpenCommentTab({ targetType, targetId });
  }

  return (
    <div
      ref={ref}
      onClick={handleClick}
      // HighlightToolbar 가 selection 컨테이너의 fieldPath/target 을 읽는 dataset.
      // problem-viewer 처럼 개인 HighlightOverlay 가 없는 곳에서도 코멘트 작성이
      // 가능하도록 코멘트 오버레이가 같은 컨테이너 역할을 한다.
      data-highlight-field={fieldPath}
      data-highlight-target-type={targetType}
      data-highlight-target-id={targetId}
    >
      {children}
    </div>
  );
}

// (clientX, clientY) 가 가리키는 컨테이너 기준 누적 char offset. 실패 시 null.
function caretOffsetAt(
  container: Element,
  clientX: number,
  clientY: number,
): number | null {
  if (typeof document === "undefined") return null;
  const doc = document as Document & {
    caretPositionFromPoint?: (
      x: number,
      y: number,
    ) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  let node: Node | null = null;
  let offset = 0;
  if (typeof doc.caretPositionFromPoint === "function") {
    const pos = doc.caretPositionFromPoint(clientX, clientY);
    if (!pos) return null;
    node = pos.offsetNode;
    offset = pos.offset;
  } else if (typeof doc.caretRangeFromPoint === "function") {
    const range = doc.caretRangeFromPoint(clientX, clientY);
    if (!range) return null;
    node = range.startContainer;
    offset = range.startOffset;
  } else {
    return null;
  }
  if (!node || node.nodeType !== Node.TEXT_NODE) return null;
  if (!container.contains(node)) return null;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let cumulative = 0;
  let cur = walker.nextNode();
  while (cur) {
    if (cur === node) return cumulative + offset;
    cumulative += (cur as Text).data.length;
    cur = walker.nextNode();
  }
  return null;
}
