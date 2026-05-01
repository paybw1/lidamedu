// inline tokens ↔ 한 줄 마커 텍스트 양방향 변환.
//
// 마커 규칙:
//   __X__   → underline
//   [X]     → annotation (강사 강조 라벨)
//   ((X))   → inline subtitle  (block 의 subtitle prop 과 별개로 본문 중간에 등장하는 케이스)
//   그 외 텍스트는 그대로 text token. text 안의 "제29조..." 같은 ref 와 "<개정 ...>" 같은
//   amendment 는 InlineNode 의 splitInlineParts 가 자동 인식하므로 별도 토큰화 불필요.
//
// 사용자가 시각 편집기에서 텍스트를 수정하고 위 마커로 강조 종류를 표시한다.
// 저장 시 markerToInline 으로 inline tokens 를 만들어 articleBodySchema 검증 후 DB 저장.

import type { ArticleBody, Block, Inline } from "./article-body";

export function inlineToMarker(inline: Inline[]): string {
  return inline
    .map((t) => {
      switch (t.type) {
        case "text":
          return t.text;
        case "underline":
          return `__${t.text}__`;
        case "subtitle":
          return `((${t.text}))`;
        case "annotation":
          return `[${t.text}]`;
        case "ref_article":
        case "ref_law":
          return t.raw;
        case "amendment_note":
          return t.text;
        case "footnote":
          return "";
      }
    })
    .join("");
}

interface MarkerMatch {
  start: number;
  end: number;
  type: "underline" | "annotation" | "subtitle";
  inner: string;
}

// __X__, [X], ((X)) — non-greedy, non-nested. 가장 단순한 형태.
// 같은 마커가 중첩되지 않는다고 가정 (UI 에서 wrap 시 기존 마커 영역에 wrap 못 하게 가드).
function findMarkers(text: string): MarkerMatch[] {
  const matches: MarkerMatch[] = [];
  const patterns: Array<{
    re: RegExp;
    type: MarkerMatch["type"];
    open: number;
    close: number;
  }> = [
    { re: /\(\((.+?)\)\)/g, type: "subtitle", open: 2, close: 2 },
    { re: /__([^_]+?)__/g, type: "underline", open: 2, close: 2 },
    { re: /\[([^\[\]]+?)\]/g, type: "annotation", open: 1, close: 1 },
  ];
  for (const p of patterns) {
    for (const m of text.matchAll(p.re)) {
      if (m.index === undefined) continue;
      matches.push({
        start: m.index,
        end: m.index + m[0].length,
        type: p.type,
        inner: m[1],
      });
    }
  }
  matches.sort((a, b) => a.start - b.start);
  // 겹침 제거 (먼저 시작한 매칭 우선, 동률이면 더 긴 쪽)
  const filtered: MarkerMatch[] = [];
  for (const m of matches) {
    const last = filtered[filtered.length - 1];
    if (last && last.end > m.start) continue;
    filtered.push(m);
  }
  return filtered;
}

export function markerToInline(text: string): Inline[] {
  if (text.length === 0) return [];
  const markers = findMarkers(text);
  if (markers.length === 0) {
    return [{ type: "text", text }];
  }
  const out: Inline[] = [];
  let cursor = 0;
  for (const m of markers) {
    if (m.start > cursor) {
      out.push({ type: "text", text: text.slice(cursor, m.start) });
    }
    if (m.type === "underline") {
      out.push({ type: "underline", text: m.inner });
    } else if (m.type === "annotation") {
      out.push({ type: "annotation", text: m.inner });
    } else {
      out.push({ type: "subtitle", text: m.inner });
    }
    cursor = m.end;
  }
  if (cursor < text.length) {
    out.push({ type: "text", text: text.slice(cursor) });
  }
  return out;
}

// ── block 단위 변환 ───────────────────────────────────────────────────────

// 시각 편집기가 편집 대상으로 다루는 블록 종류. 나머지(header_refs, sub_article_group)는
// raw 토큰으로 보존되어 JSON 모드에서만 수정 가능.
export type EditableBlock =
  | {
      kind: "para";
      marker: string;
    }
  | {
      kind: "clause";
      number: number;
      label: string;
      subtitle: string;
      marker: string;
      children: EditableBlock[];
    }
  | {
      kind: "item";
      number: number;
      label: string;
      subtitle: string;
      marker: string;
      children: EditableBlock[];
    }
  | {
      kind: "sub";
      letter: string;
      label: string;
      subtitle: string;
      marker: string;
      children: EditableBlock[];
    }
  | {
      kind: "title_marker";
      text: string;
    };

// editor UI 가 다루기 어려운 block 들 (sub_article_group, header_refs) 은 frozen 상태로 보존.
export interface FrozenBlock {
  kind: "frozen";
  position: number; // 원본 blocks 배열 안의 위치 — 저장 시 순서 복원
  block: Block;
}

export interface EditableArticleBody {
  blocks: Array<EditableBlock | FrozenBlock>;
}

export function bodyToEditable(body: ArticleBody): EditableArticleBody {
  const out: EditableArticleBody["blocks"] = [];
  body.blocks.forEach((block, i) => {
    const editable = blockToEditable(block, i);
    out.push(editable);
  });
  return { blocks: out };
}

function blockToEditable(
  block: Block,
  position: number,
): EditableBlock | FrozenBlock {
  if (block.kind === "para") {
    return { kind: "para", marker: inlineToMarker(block.inline) };
  }
  if (block.kind === "title_marker") {
    return { kind: "title_marker", text: block.text };
  }
  if (block.kind === "clause") {
    return {
      kind: "clause",
      number: block.number,
      label: block.label,
      subtitle: block.subtitle ?? "",
      marker: inlineToMarker(block.inline),
      children: block.children.map((c, i) => editableChild(c, i)),
    };
  }
  if (block.kind === "item") {
    return {
      kind: "item",
      number: block.number,
      label: block.label,
      subtitle: block.subtitle ?? "",
      marker: inlineToMarker(block.inline),
      children: block.children.map((c, i) => editableChild(c, i)),
    };
  }
  if (block.kind === "sub") {
    return {
      kind: "sub",
      letter: block.letter,
      label: block.label,
      subtitle: block.subtitle ?? "",
      marker: inlineToMarker(block.inline),
      children: block.children.map((c, i) => editableChild(c, i)),
    };
  }
  // header_refs / sub_article_group → frozen
  return { kind: "frozen", position, block };
}

// child 는 frozen 이 될 수도 있지만 시각편집기 UI 에서는 child frozen 케이스가 없다.
// (clause/item/sub 의 children 은 보통 item/sub/para 만 등장)
function editableChild(block: Block, position: number): EditableBlock {
  const e = blockToEditable(block, position);
  if (e.kind === "frozen") {
    // 매우 드문 케이스: clause 안에 sub_article_group 이 들어온 경우. para 로 fallback (raw text 풀어서 보존).
    return {
      kind: "para",
      marker: extractRawText(e.block),
    };
  }
  return e;
}

function extractRawText(block: Block): string {
  if (block.kind === "para") return inlineToMarker(block.inline);
  if (block.kind === "title_marker") return block.text;
  if (block.kind === "clause" || block.kind === "item" || block.kind === "sub") {
    return inlineToMarker(block.inline);
  }
  return "";
}

export function editableToBody(edit: EditableArticleBody): ArticleBody {
  return {
    blocks: edit.blocks.map((b) => editableToBlock(b)),
  };
}

function editableToBlock(eb: EditableBlock | FrozenBlock): Block {
  if (eb.kind === "frozen") return eb.block;
  if (eb.kind === "para") {
    return { kind: "para", inline: markerToInline(eb.marker) };
  }
  if (eb.kind === "title_marker") {
    return { kind: "title_marker", text: eb.text };
  }
  if (eb.kind === "clause") {
    return {
      kind: "clause",
      number: eb.number,
      label: eb.label,
      subtitle: eb.subtitle.trim().length > 0 ? eb.subtitle : null,
      inline: markerToInline(eb.marker),
      children: eb.children.map((c) => editableToBlock(c)),
    };
  }
  if (eb.kind === "item") {
    return {
      kind: "item",
      number: eb.number,
      label: eb.label,
      subtitle: eb.subtitle.trim().length > 0 ? eb.subtitle : null,
      inline: markerToInline(eb.marker),
      children: eb.children.map((c) => editableToBlock(c)),
    };
  }
  // sub
  return {
    kind: "sub",
    letter: eb.letter,
    label: eb.label,
    subtitle: eb.subtitle.trim().length > 0 ? eb.subtitle : null,
    inline: markerToInline(eb.marker),
    children: eb.children.map((c) => editableToBlock(c)),
  };
}
