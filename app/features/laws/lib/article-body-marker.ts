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

// 시각 편집기가 편집 대상으로 다루는 블록 종류.
// header_refs 만 frozen(JSON 모드 전용). sub_article_group("함께 공부할 조문") 은
// SubGroupEditable 로 펼쳐 카드 편집 가능.
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
      children: EditorBlock[];
    }
  | {
      kind: "item";
      number: number;
      label: string;
      subtitle: string;
      marker: string;
      children: EditorBlock[];
    }
  | {
      kind: "sub";
      letter: string;
      label: string;
      subtitle: string;
      marker: string;
      children: EditorBlock[];
    }
  | {
      kind: "title_marker";
      text: string;
    };

// 함께 공부할 조문 — 출처 + (선택)머리말 + 각 조문(제목 + 본문 블록).
export interface SubGroupArticleEditable {
  number: number;
  branch: number | null;
  title: string;
  blocks: EditorBlock[];
}
export interface SubGroupEditable {
  kind: "sub_group";
  source: string;
  preface: EditorBlock[];
  articles: SubGroupArticleEditable[];
}

// editor UI 가 다루기 어려운 block (header_refs) 은 frozen 상태로 보존.
export interface FrozenBlock {
  kind: "frozen";
  position: number; // 원본 blocks 배열 안의 위치 (호환용, 순서는 배열로 보존)
  block: Block;
}

export type EditorBlock = EditableBlock | SubGroupEditable | FrozenBlock;

export interface EditableArticleBody {
  blocks: EditorBlock[];
}

export function bodyToEditable(body: ArticleBody): EditableArticleBody {
  return { blocks: body.blocks.map((block, i) => blockToEditable(block, i)) };
}

function blockToEditable(block: Block, position: number): EditorBlock {
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
      children: block.children.map((c, i) => blockToEditable(c, i)),
    };
  }
  if (block.kind === "item") {
    return {
      kind: "item",
      number: block.number,
      label: block.label,
      subtitle: block.subtitle ?? "",
      marker: inlineToMarker(block.inline),
      children: block.children.map((c, i) => blockToEditable(c, i)),
    };
  }
  if (block.kind === "sub") {
    return {
      kind: "sub",
      letter: block.letter,
      label: block.label,
      subtitle: block.subtitle ?? "",
      marker: inlineToMarker(block.inline),
      children: block.children.map((c, i) => blockToEditable(c, i)),
    };
  }
  if (block.kind === "sub_article_group") {
    return {
      kind: "sub_group",
      source: block.source,
      preface: (block.preface ?? []).map((c, i) => blockToEditable(c, i)),
      articles: block.articles.map((a) => ({
        number: a.number,
        branch: a.branch ?? null,
        title: a.title,
        blocks: a.blocks.map((c, i) => blockToEditable(c, i)),
      })),
    };
  }
  // header_refs → frozen
  return { kind: "frozen", position, block };
}

export function editableToBody(edit: EditableArticleBody): ArticleBody {
  return { blocks: edit.blocks.map((b) => editableToBlock(b)) };
}

function editableToBlock(eb: EditorBlock): Block {
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
  if (eb.kind === "sub") {
    return {
      kind: "sub",
      letter: eb.letter,
      label: eb.label,
      subtitle: eb.subtitle.trim().length > 0 ? eb.subtitle : null,
      inline: markerToInline(eb.marker),
      children: eb.children.map((c) => editableToBlock(c)),
    };
  }
  // sub_group
  const preface = eb.preface.map((c) => editableToBlock(c));
  return {
    kind: "sub_article_group",
    source: eb.source,
    ...(preface.length > 0 ? { preface } : {}),
    articles: eb.articles.map((a) => ({
      number: a.number,
      ...(a.branch != null ? { branch: a.branch } : {}),
      title: a.title,
      blocks: a.blocks.map((c) => editableToBlock(c)),
    })),
  };
}
