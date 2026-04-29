// 저장된 하이라이트들을 article body 컨테이너에 visual overlay 로 적용.
// CSS Highlight API (CSS Custom Highlight Registry) 를 사용 — DOM 트리를 변형하지 않으므로 React 렌더링과 충돌 없음.
//
// 폴백: CSS.highlights 가 없는 브라우저(드물게)에서는 visual overlay 없이 동작 (DB 데이터/사이드바 목록은 계속 보임).
//
// Multi-instance: registry 는 색깔별 단일 entry 를 글로벌 공유한다. 여러 HighlightOverlay 인스턴스가 같이 떠 있어도
// 색깔별 공유 entry 에 각자 range 를 add/cleanup 하도록 한다 (그렇지 않으면 마지막 인스턴스가 다른 인스턴스 entry 를
// 덮어써 다른 카드의 하이라이트가 사라진다).

import { useEffect, useRef, type ReactNode } from "react";

import { type HighlightColor, type HighlightRecord } from "../labels";
import { rangeFromOffsets } from "../lib/highlight-dom";

const HIGHLIGHT_NAME_PREFIX = "lidam-hl-";

function highlightName(color: HighlightColor): string {
  return `${HIGHLIGHT_NAME_PREFIX}${color}`;
}

// 브라우저가 CSS Highlight API 를 지원하는지 (TS lib.dom 에 Highlight global 이 있어도 런타임 미지원 가능)
function getHighlightCtor(): typeof Highlight | null {
  if (typeof globalThis === "undefined") return null;
  const ctor = (globalThis as unknown as { Highlight?: typeof Highlight })
    .Highlight;
  return ctor ?? null;
}

function getHighlightRegistry() {
  if (typeof CSS === "undefined") return null;
  return (CSS as unknown as { highlights?: Map<string, Highlight> })
    .highlights ?? null;
}

// 색깔별 공유 entry — 모든 인스턴스가 함께 사용한다. 처음 사용될 때 lazy 생성 + registry 등록.
const sharedEntries: Record<HighlightColor, Highlight | null> = {
  green: null,
  yellow: null,
  red: null,
  blue: null,
};

function getOrCreateSharedEntry(color: HighlightColor): Highlight | null {
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

export function HighlightOverlay({
  highlights,
  fieldPath = "article.body",
  targetType,
  targetId,
  children,
}: {
  highlights: HighlightRecord[];
  fieldPath?: string;
  // multi-instance 환경에서 selection 발생 컨테이너의 target 을 토글바가 알 수 있도록 dataset 으로 노출.
  targetType?: string;
  targetId?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const container = ref.current;
    if (!container) return;

    const relevant = highlights.filter(
      (h) => (h.fieldPath || "article.body") === fieldPath,
    );

    // 이번 인스턴스가 추가한 (color, range) 들 — cleanup 에서 자기 것만 제거
    const added: Array<{ color: HighlightColor; range: Range }> = [];
    for (const h of relevant) {
      const range = rangeFromOffsets(container, h.startOffset, h.endOffset);
      if (!range) continue;
      const entry = getOrCreateSharedEntry(h.color);
      if (!entry) continue;
      entry.add(range);
      added.push({ color: h.color, range });
    }

    return () => {
      for (const { color, range } of added) {
        const entry = sharedEntries[color];
        if (entry) entry.delete(range);
      }
    };
  }, [highlights, fieldPath]);

  return (
    <div
      ref={ref}
      data-highlight-field={fieldPath}
      data-highlight-target-type={targetType}
      data-highlight-target-id={targetId}
    >
      {children}
    </div>
  );
}
