// 빈칸 위치를 article body 전체 기준으로 사전 계산하는 모듈.
//
// 기존: `findBlankHits` 가 inline token 단위로 호출돼 같은 token 안에서만 매칭 가능했다.
// 따라서 (a) 컨텍스트가 token 경계를 넘어서 저장된 빈칸은 본문에 표시되지 않았고,
// (b) 동일 정답을 가진 빈칸이 여러 절(clause)에 등장해도 첫 절의 같은 위치에 모두 매칭돼
// 두 번째 이후 빈칸이 누락됐다.
//
// 이 모듈은 article body 의 모든 block 을 render 순서로 walk 하면서 각 block 의 cumulative
// inline 텍스트를 만들고, blanks 를 idx 순으로 greedy 하게 배치한다 (overlap 회피).
// 결과는 Map<Block, BlankHit[]> — block 별로 그 안에 들어갈 hits.

import type {
  ArticleBody,
  Block,
  Inline,
} from "~/features/laws/lib/article-body";
import type { BlankItem } from "~/features/blanks/queries.server";

import { type BlankHit } from "../components/blanks-context";

// 큰 anchor 부터 시도 — 30자는 신규 빈칸 (addBlankToSet 가 ±30자로 저장) 의 specific 매칭용.
// 12자 이하는 legacy 빈칸 (±12자 컨텍스트로 저장돼 있는 기존 데이터) 의 호환을 위해 유지.
// 같은 답이 여러 항에 있고 12자가 동일한 케이스에서도 30자 윈도우가 차이를 잡아 의도 자리만 매칭.
const ANCHOR_LENGTHS = [30, 20, 12, 10, 8, 6, 4];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 단일 정규식으로 텍스트 안에서 답 시작점이 answerMinStart 이상인 첫 매칭의 capture group [start, end].
function findCaptureRangeAt(
  text: string,
  pattern: string,
  answerMinStart: number,
): [number, number] | null {
  let re: RegExp;
  try {
    re = new RegExp(pattern, "dg");
  } catch {
    return null;
  }
  while (true) {
    const m = re.exec(text);
    if (!m) return null;
    const indices = (m as RegExpExecArray & {
      indices?: Array<[number, number] | undefined>;
    }).indices;
    let answerRange: [number, number] | null = null;
    if (indices && indices[1]) {
      answerRange = indices[1];
    } else if (m[1]) {
      const offset = m[0].indexOf(m[1]);
      if (offset !== -1) {
        const start = m.index + offset;
        answerRange = [start, start + m[1].length];
      }
    }
    if (answerRange && answerRange[0] >= answerMinStart) return answerRange;
    if (re.lastIndex <= m.index) re.lastIndex = m.index + 1;
  }
}

// 한 (tier, len) 조합으로 한 블록 텍스트 안에서 매칭 시도. answerMinStart 로 cursor 앞부분 skip.
function tryAnchoredMatch(
  text: string,
  blank: BlankItem,
  tier: 1 | 2 | 3,
  len: number,
  answerMinStart: number,
): [number, number] | null {
  const beforeFull = blank.beforeContext ?? "";
  const afterFull = blank.afterContext ?? "";
  const ansEsc = escapeRegex(blank.answer);
  if (tier === 1) {
    if (beforeFull.length === 0 || afterFull.length === 0) return null;
    const before = beforeFull.slice(-len);
    const after = afterFull.slice(0, len);
    if (!before || !after) return null;
    return findCaptureRangeAt(
      text,
      escapeRegex(before) + "\\s*(" + ansEsc + ")\\s*" + escapeRegex(after),
      answerMinStart,
    );
  }
  if (tier === 2) {
    if (beforeFull.length === 0) return null;
    const before = beforeFull.slice(-len);
    if (!before) return null;
    return findCaptureRangeAt(
      text,
      escapeRegex(before) + "\\s*(" + ansEsc + ")",
      answerMinStart,
    );
  }
  // tier 3
  if (afterFull.length === 0) return null;
  const after = afterFull.slice(0, len);
  if (!after) return null;
  return findCaptureRangeAt(
    text,
    "(" + ansEsc + ")\\s*" + escapeRegex(after),
    answerMinStart,
  );
}

// 한 inline 토큰이 cumulative block text 에 기여하는 콘텐츠.
// 본문 매칭에 의미 있는 텍스트만 포함 (footnote 는 0 길이로 간주).
export function inlineTokenContent(t: Inline): string {
  if (
    t.type === "text" ||
    t.type === "underline" ||
    t.type === "subtitle" ||
    t.type === "annotation" ||
    t.type === "amendment_note"
  ) {
    return t.text;
  }
  if (t.type === "ref_article" || t.type === "ref_law") {
    return t.raw;
  }
  return "";
}

export function inlineTokenLength(t: Inline): number {
  return inlineTokenContent(t).length;
}

// block 단위 cumulative text. blanks 매칭은 이 텍스트 기반.
// header_refs / sub_article_group 자체는 빈칸 매칭 대상이 아니다 (children 만 walk).
export function blockCumulativeText(block: Block): string {
  if (block.kind === "title_marker") return block.text;
  if (block.kind === "header_refs") return "";
  if (block.kind === "sub_article_group") return "";
  return block.inline.map(inlineTokenContent).join("");
}

// 한 block 안에서 어떤 inline 토큰의 콘텐츠가 정답과 정확히 일치하면 그 토큰의 cumulative text 안
// 위치를 반환. underline / subtitle 등에서 정답 한 단어만 단독으로 강조된 케이스 (예: 제42조의3 ④
// 의 underline "명세서") 를 컨텍스트 없이도 정확히 잡기 위함.
function findExactTokenMatch(
  block: Block,
  answer: string,
): { start: number; end: number } | null {
  const trimmed = answer.trim();
  if (!trimmed) return null;
  if (block.kind === "title_marker") {
    return block.text.trim() === trimmed
      ? { start: 0, end: block.text.length }
      : null;
  }
  if (block.kind === "header_refs" || block.kind === "sub_article_group") {
    return null;
  }
  let pos = 0;
  for (const t of block.inline) {
    const content = inlineTokenContent(t);
    if (content.length > 0 && content.trim() === trimmed) {
      return { start: pos, end: pos + content.length };
    }
    pos += content.length;
  }
  return null;
}

// 모든 block 을 render 순서로 walk. clause/item/sub 의 children, sub_article_group 의
// preface + articles.blocks 까지 재귀.
export function walkBlocks(
  body: ArticleBody,
  visitor: (block: Block) => void,
): void {
  const walk = (blocks: Block[]) => {
    for (const b of blocks) {
      visitor(b);
      if (b.kind === "clause" || b.kind === "item" || b.kind === "sub") {
        walk(b.children);
      } else if (b.kind === "sub_article_group") {
        if (b.preface) walk(b.preface);
        for (const sa of b.articles) walk(sa.blocks);
      }
    }
  };
  walk(body.blocks);
}

// article-body.tsx 의 LabeledBlock id 와 동일 포맷으로 block id 를 반환. clause/item/sub 만 식별,
// para/title_marker/header_refs/sub_article_group 등은 null. 빈칸의 saved blockId 와 매칭하는 데 사용.
function blockIdOf(block: Block): string | null {
  if (block.kind === "clause") return `clause-${block.number}`;
  if (block.kind === "item") return `item-${block.number}`;
  if (block.kind === "sub") return `sub-${block.letter}`;
  return null;
}

// blanks 를 body 전체에 분배. 각 빈칸은 idx 순으로 처리되고, anchor specificity (tier, len) 가
// 가장 큰 매칭을 본문에서 찾는다. 이미 다른 빈칸이 차지한 위치는 건너뛴다 (overlap 회피).
//
// 매칭 단계:
//   Pass 1   — context anchor. (tier, len) 을 specificity 내림차순으로 outer loop, 블록을
//              body order 로 inner loop. tier1=before+answer+after, tier2=before+answer,
//              tier3=answer+after. len 은 12,10,8,6,4 (긴 것부터). 가장 specific 한 매칭이
//              승리하므로 ⑤ 의 12자 anchor 가 ③ item1 의 4자 anchor 에 가로채이지 않음.
//              빈칸에 blockId 가 저장돼 있으면 그 블록 (및 자손 항/호/목) 으로 한정.
//   Pass 1.5 — token 콘텐츠 자체가 답과 정확히 일치 (underline/subtitle 등 단독 강조).
//   Pass 2   — 답이 3자 이상이면 substring fallback. soft cursor 로 직전 배치 블록부터 forward 우선.
export function computeBlockBlankHits(
  body: ArticleBody,
  blanks: BlankItem[],
): Map<Block, BlankHit[]> {
  const blockOrder: Array<{ block: Block; text: string; blockId: string | null }> = [];
  walkBlocks(body, (block) => {
    blockOrder.push({
      block,
      text: blockCumulativeText(block),
      blockId: blockIdOf(block),
    });
  });

  // blockId 별로 그 블록 + 자손 block 들의 인덱스 범위를 사전 계산.
  // walkBlocks 는 부모 → 자식 순서로 visit 하므로 자손은 부모 직후 연속 인덱스를 가진다.
  const blockSubtreeRange = new Map<string, [number, number]>();
  const subtreeSize = (rootBlock: Block): number => {
    let count = 1;
    if (
      rootBlock.kind === "clause" ||
      rootBlock.kind === "item" ||
      rootBlock.kind === "sub"
    ) {
      for (const child of rootBlock.children) count += subtreeSize(child);
    } else if (rootBlock.kind === "sub_article_group") {
      for (const p of rootBlock.preface ?? []) count += subtreeSize(p);
      for (const sa of rootBlock.articles) {
        for (const sb of sa.blocks) count += subtreeSize(sb);
      }
    }
    return count;
  };
  for (let bi = 0; bi < blockOrder.length; bi++) {
    const { block, blockId } = blockOrder[bi];
    if (!blockId) continue;
    if (!blockSubtreeRange.has(blockId)) {
      blockSubtreeRange.set(blockId, [bi, bi + subtreeSize(block) - 1]);
    }
  }

  const sorted = [...blanks].sort((a, b) => a.idx - b.idx);
  const result = new Map<Block, BlankHit[]>();

  const isOccupied = (blockIdx: number, start: number, end: number): boolean => {
    const block = blockOrder[blockIdx].block;
    const hits = result.get(block);
    if (!hits) return false;
    return hits.some((h) => h.start < end && h.end > start);
  };

  const addHit = (blockIdx: number, hit: BlankHit) => {
    const block = blockOrder[blockIdx].block;
    const arr = result.get(block) ?? [];
    arr.push(hit);
    result.set(block, arr);
  };

  // 마지막으로 배치된 블록 인덱스. Pass 2 substring fallback 에서 forward 우선 탐색에 사용.
  // (idx 가 비슷한 빈칸들이 본문에서 가까운 위치에 모인다는 가정)
  let lastPlacedBi = 0;

  const trySubstringInBlock = (
    bi: number,
    blank: BlankItem,
  ): BlankHit | null => {
    const blockText = blockOrder[bi].text;
    if (blockText.length === 0) return null;
    let searchFrom = 0;
    while (true) {
      const start = blockText.indexOf(blank.answer, searchFrom);
      if (start === -1) return null;
      const end = start + blank.answer.length;
      if (!isOccupied(bi, start, end)) {
        return { blank, start, end };
      }
      searchFrom = start + 1;
    }
  };

  for (const blank of sorted) {
    if (!blank.answer) continue;
    let placed = false;
    let placedBi = -1;

    // Pass 0 (최강): blockIndex + cumOffset 가 있으면 그 좌표에 직접 배치.
    //   같은 단어가 같은 항에 여러 번 나와도 (예: 제4조 "그 사단 중 사단" 의 두 번째 사단)
    //   드래그 시점에 캡처된 정확 좌표로 결정적 배치 — 컨텍스트 매칭 우회.
    //   substring 검증: 그 위치의 char 가 정답과 정확히 일치할 때만 채택 (article 개정 후 좌표 stale 방지).
    if (
      typeof blank.blockIndex === "number" &&
      typeof blank.cumOffset === "number" &&
      blank.blockIndex >= 0 &&
      blank.blockIndex < blockOrder.length
    ) {
      const bi = blank.blockIndex;
      const blockText = blockOrder[bi].text;
      const start = blank.cumOffset;
      const end = start + blank.answer.length;
      if (
        start >= 0 &&
        end <= blockText.length &&
        blockText.slice(start, end) === blank.answer &&
        !isOccupied(bi, start, end)
      ) {
        addHit(bi, { blank, start, end });
        placed = true;
        placedBi = bi;
      }
    }

    // 빈칸이 saved blockId 를 가지면 본문 매칭을 그 블록 (+ 자손) 범위로 한정.
    // 같은 답이 다른 항에도 있을 때 (예: 제102조 ① ⑤ 양쪽 "특허권자") 슬롯이 만들어진 항에서만
    // 매칭되도록 한다. blockId 가 없으면 (legacy 슬롯) 전체 범위 (기존 동작).
    const range = blank.blockId
      ? blockSubtreeRange.get(blank.blockId)
      : undefined;
    const blockStart = range ? range[0] : 0;
    const blockEnd = range ? range[1] : blockOrder.length - 1;

    // Pass 1: context anchor.
    // (tier, len) 을 specificity 내림차순으로 outer loop, 블록을 body order 로 inner loop.
    // 이렇게 해야 한 블록의 짧은 anchor 매칭이 다른 블록의 긴 anchor 매칭을 가로채지 못한다.
    // 예: art42의3 ⑤ 의 "그 국어번역문에 따라 보정한 것으로 본다" 빈칸이 ③ item 1 의 "...에 따라
    //     보정한 것" (4자 anchor) 에 잘못 끌려가는 케이스 방지.
    const tiers: Array<{ tier: 1 | 2 | 3; len: number }> = [];
    for (const tier of [1, 2, 3] as const) {
      for (const len of ANCHOR_LENGTHS) tiers.push({ tier, len });
    }
    for (const { tier, len } of tiers) {
      if (placed) break;
      for (let bi = blockStart; bi <= blockEnd && !placed; bi++) {
        const blockText = blockOrder[bi].text;
        if (blockText.length === 0) continue;
        let minStart = 0;
        while (!placed) {
          const matchRange = tryAnchoredMatch(blockText, blank, tier, len, minStart);
          if (!matchRange) break;
          const [start, end] = matchRange;
          if (!isOccupied(bi, start, end)) {
            addHit(bi, { blank, start, end });
            placed = true;
            placedBi = bi;
            break;
          }
          minStart = start + 1;
        }
      }
    }

    // Pass 1.5: 토큰 콘텐츠 단독 일치 (Tier 4-token). underline/subtitle 등이 답 그 자체일 때
    //          (컨텍스트가 비어있어도) 정확히 그 자리에 배치. substring fallback 보다 우선.
    if (!placed) {
      for (let bi = blockStart; bi <= blockEnd && !placed; bi++) {
        const block = blockOrder[bi].block;
        const tokenMatch = findExactTokenMatch(block, blank.answer);
        if (tokenMatch && !isOccupied(bi, tokenMatch.start, tokenMatch.end)) {
          addHit(bi, {
            blank,
            start: tokenMatch.start,
            end: tokenMatch.end,
          });
          placed = true;
          placedBi = bi;
        }
      }
    }

    // Pass 2: 답이 충분히 길면 (>= 3자) substring fallback. 컨텍스트가 비어있거나 잘못된 빈칸용.
    // soft cursor: 직전 배치 블록부터 forward 시도 → 매칭 없으면 wrap 해서 앞 블록 탐색.
    // 이렇게 해야 동일 정답을 가진 빈칸 (예: art10 의 "심판장") 이 idx 순으로 인접한 블록에 배치된다.
    // blockId 가 있으면 해당 블록 범위 안에서만 fallback.
    if (!placed && blank.answer.length >= 3) {
      const fallbackStart = Math.max(blockStart, lastPlacedBi);
      for (
        let bi = fallbackStart;
        bi <= blockEnd && !placed;
        bi++
      ) {
        const hit = trySubstringInBlock(bi, blank);
        if (hit) {
          addHit(bi, hit);
          placed = true;
          placedBi = bi;
        }
      }
      if (!placed) {
        for (let bi = blockStart; bi < fallbackStart && !placed; bi++) {
          const hit = trySubstringInBlock(bi, blank);
          if (hit) {
            addHit(bi, hit);
            placed = true;
            placedBi = bi;
          }
        }
      }
    }

    if (placed && placedBi >= 0) {
      lastPlacedBi = placedBi;
    }
    // placed===false 이면 본문 어디서도 매칭 못한 빈칸 — 침묵으로 skip.
  }

  for (const hits of result.values()) {
    hits.sort((a, b) => a.start - b.start);
  }
  return result;
}
