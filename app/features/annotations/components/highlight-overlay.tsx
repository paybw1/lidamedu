// 저장된 하이라이트들을 본문 컨테이너에 visual overlay 로 적용.
// CSS Highlight API (CSS Custom Highlight Registry) 를 사용 — DOM 트리를 변형하지 않으므로 React 렌더링과 충돌 없음.
//
// feat-8-023: 강사·원장 작성 하이라이트(전체 공개)는 lidam-hl-staff-* (배경 + 밑줄),
//   수험생 본인 하이라이트는 lidam-hl-* (배경만) 로 시각 구분한다.
//
// 폴백: CSS.highlights 가 없는 브라우저(드물게)에서는 visual overlay 없이 동작 (DB 데이터/사이드바 목록은 계속 보임).
//
// Multi-instance: registry 는 highlight name 별 단일 entry 를 글로벌 공유한다. 여러 HighlightOverlay 인스턴스가
// 같이 떠 있어도 name 별 공유 entry 에 각자 range 를 add/cleanup 하도록 한다.
import { type ReactNode, useEffect, useRef } from "react";

import { type HighlightColor, type HighlightRecord } from "../labels";
import { containerText, rangeFromOffsets } from "../lib/highlight-dom";

// haystack 안에 needle 이 단 한 번만 등장하면 그 인덱스, 아니면 -1.
function uniqueIndexOf(haystack: string, needle: string): number {
  if (!needle) return -1;
  const first = haystack.indexOf(needle);
  if (first < 0) return -1;
  const second = haystack.indexOf(needle, first + 1);
  return second < 0 ? first : -1;
}

// 본문 수정 후 저장된 offset 이 어긋났을 때 snippet + before/after 컨텍스트로
// 단일 매치를 찾아 새 위치(startOffset/endOffset)를 돌려준다. 실패 시 null.
function tryReanchor(
  fullText: string,
  snippet: string,
  beforeCtx: string | null,
  afterCtx: string | null,
): { startOffset: number; endOffset: number } | null {
  if (!snippet) return null;
  // 1) before + snippet + after 단일 매치 (강한 컨텍스트).
  const before = beforeCtx ?? "";
  const after = afterCtx ?? "";
  if (before || after) {
    const composite = before + snippet + after;
    const idx = uniqueIndexOf(fullText, composite);
    if (idx >= 0) {
      const start = idx + before.length;
      return { startOffset: start, endOffset: start + snippet.length };
    }
  }
  // 2) snippet 단독 단일 매치 (fallback).
  const idx2 = uniqueIndexOf(fullText, snippet);
  if (idx2 < 0) return null;
  return { startOffset: idx2, endOffset: idx2 + snippet.length };
}

// staff 여부에 따라 lidam-hl-* (수험생) / lidam-hl-staff-* (강사) registry name 선택.
function highlightName(color: HighlightColor, staff: boolean): string {
  return staff ? `lidam-hl-staff-${color}` : `lidam-hl-${color}`;
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
  return (
    (CSS as unknown as { highlights?: Map<string, Highlight> }).highlights ??
    null
  );
}

// highlight name 별 공유 entry — 모든 인스턴스가 함께 사용한다. 처음 사용될 때 lazy 생성 + registry 등록.
const sharedEntries = new Map<string, Highlight>();

function getOrCreateSharedEntry(name: string): Highlight | null {
  if (typeof window === "undefined") return null;
  const HighlightCtor = getHighlightCtor();
  const registry = getHighlightRegistry();
  if (!HighlightCtor || !registry) return null;
  let entry = sharedEntries.get(name);
  if (!entry) {
    entry = new HighlightCtor();
    sharedEntries.set(name, entry);
    registry.set(name, entry);
  }
  return entry;
}

export function HighlightOverlay({
  highlights,
  fieldPath = "article.body",
  targetType,
  targetId,
  viewerIsStaff = false,
  className,
  children,
}: {
  highlights: HighlightRecord[];
  fieldPath?: string;
  // multi-instance 환경에서 selection 발생 컨테이너의 target 을 토글바가 알 수 있도록 dataset 으로 노출.
  targetType?: string;
  targetId?: string;
  // 보는 사람이 강사·원장인지 — 본인 하이라이트도 강사 스타일로 표시한다.
  viewerIsStaff?: boolean;
  // 컨테이너 div 에 적용할 클래스 — 선지처럼 flex item 으로 쓸 때 레이아웃/타이포 주입.
  className?: string;
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

    // 이번 인스턴스가 추가한 (name, range) 들 — cleanup 에서 자기 것만 제거
    const added: Array<{ name: string; range: Range }> = [];
    // 본문이 staff 수정으로 바뀌면 저장된 offset 이 어긋날 수 있다. 매 렌더마다
    //   1) offset 으로 Range 복원 → text 와 snippet/excerpt 정확 비교 (정합성 가드)
    //   2) 불일치면 snippet + before/after 컨텍스트로 단일 매치 재탐색(클라이언트 reanchor)
    //   3) 그래도 못 찾으면 그리지 않음(orphan — DB 는 보존)
    // legacy 데이터(snippet 컬럼 NULL) 는 excerpt(=label, 500자 truncate) 로 fallback.
    let fullTextCache: string | null = null;
    const getFullText = (): string => {
      if (fullTextCache === null) fullTextCache = containerText(container);
      return fullTextCache;
    };
    for (const h of relevant) {
      const expected = (h.snippet ?? h.excerpt ?? "").trim();
      let range = rangeFromOffsets(container, h.startOffset, h.endOffset);
      const matchesAtOffset =
        range !== null &&
        expected !== "" &&
        (h.snippet
          ? range.toString() === h.snippet
          : range.toString().startsWith(expected));
      if (!matchesAtOffset) {
        // 위치 어긋남 — reanchor 시도.
        const reanchored = tryReanchor(
          getFullText(),
          h.snippet ?? expected,
          h.beforeCtx ?? null,
          h.afterCtx ?? null,
        );
        range = reanchored
          ? rangeFromOffsets(
              container,
              reanchored.startOffset,
              reanchored.endOffset,
            )
          : null;
      }
      if (!range) continue;
      // 강사 작성 하이라이트(= 내 것이 아니거나, 내가 강사) 는 staff 스타일.
      const staffAuthored = !h.isMine || viewerIsStaff;
      const name = highlightName(h.color, staffAuthored);
      const entry = getOrCreateSharedEntry(name);
      if (!entry) continue;
      entry.add(range);
      added.push({ name, range });
    }

    return () => {
      for (const { name, range } of added) {
        const entry = sharedEntries.get(name);
        if (entry) entry.delete(range);
      }
    };
  }, [highlights, fieldPath, viewerIsStaff]);

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
