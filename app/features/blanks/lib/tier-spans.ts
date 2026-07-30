// feat-2-030 S3b — 상(tier 3) "구간(구절) 빈칸" 자동 도출. UI 렌더·서버 검증 공용 순수 로직.
//
// 모델: 상은 개별 단어가 아니라 문장의 **특정 구간**을 통째로 입력(암기 수월). 각 항(block)에서
//   그 항의 단어 빈칸들을 아우르는 구간(첫 빈칸 시작 ~ 마지막 빈칸 끝)을 하나의 큰 빈칸으로 만든다.
//   구간이 너무 길면 수험생 부담 → **띄어쓰기(어절) 기준 최대 N개**로 끊어 여러 구간으로 분할.
//
// 산출물 = 합성 BlankItem 목록(blockIndex + cumOffset + answer=구간 원문). 레이아웃 엔진의
//   Pass 0(좌표 직접 배치)가 그대로 배치하므로 기존 렌더/판정 파이프라인을 재사용한다.
//   ★결정적 idx(블록·청크 순서) → 클라 렌더와 서버 검증이 동일 집합을 얻는다.

import type { ArticleBody, Block } from "~/features/laws/lib/article-body";
import type { BlankItem } from "~/features/blanks/queries.server";

import {
  blockCumulativeText,
  computeBlockBlankHits,
  inlineTokenContent,
  walkBlocks,
} from "./blank-layout";

// 상 구간 1개당 최대 어절 수(초과 시 분할).
export const TIER3_MAX_EOJEOL = 10;

// [spanStart, spanEnd) 구간을 어절(공백 구분) 단위로 끊어 maxEojeol 개씩 묶은 청크의 [start,end).
//   청크 경계는 공백에서만 — answer 는 앞뒤 공백을 제외한 실제 구간이 된다.
export function chunkByEojeol(
  text: string,
  spanStart: number,
  spanEnd: number,
  maxEojeol: number,
): Array<{ start: number; end: number }> {
  const tokens: Array<{ start: number; end: number }> = [];
  let i = spanStart;
  while (i < spanEnd) {
    while (i < spanEnd && /\s/.test(text[i])) i++; // 공백 skip
    if (i >= spanEnd) break;
    const start = i;
    while (i < spanEnd && !/\s/.test(text[i])) i++;
    tokens.push({ start, end: i });
  }
  if (tokens.length === 0) return [];
  const cap = Math.max(1, maxEojeol);
  const chunks: Array<{ start: number; end: number }> = [];
  for (let t = 0; t < tokens.length; t += cap) {
    const group = tokens.slice(t, t + cap);
    chunks.push({ start: group[0].start, end: group[group.length - 1].end });
  }
  return chunks;
}

// 블록 cumulative text 안에서 학생이 '타이핑해야 하는' 토큰(text·underline)의 [start,end) 목록.
//   subtitle("(예외)" 라벨)·annotation·ref·개정주기 등은 화면 장식/메타라 구간 정답에 포함되면
//   라벨 문구까지 입력해야 정답 처리되는 버그가 된다(2026-07-30 신고: 특허 29조③④ "예외").
//   좌표계는 cumulative text 그대로 — 구간을 이 범위들로 쪼갤 뿐 오프셋 변형은 없다.
function typeableRanges(block: Block): Array<{ start: number; end: number }> {
  if (block.kind === "title_marker") {
    return [{ start: 0, end: block.text.length }];
  }
  if (block.kind === "header_refs" || block.kind === "sub_article_group") {
    return [];
  }
  const out: Array<{ start: number; end: number }> = [];
  let pos = 0;
  for (const t of block.inline) {
    const len = inlineTokenContent(t).length;
    if (len > 0 && (t.type === "text" || t.type === "underline")) {
      const last = out[out.length - 1];
      if (last && last.end === pos) last.end = pos + len;
      else out.push({ start: pos, end: pos + len });
    }
    pos += len;
  }
  return out;
}

// 단어 빈칸 → 상 구간 빈칸(합성 BlankItem).
export function deriveTierSpanBlanks(
  body: ArticleBody,
  wordBlanks: BlankItem[],
  maxEojeol: number = TIER3_MAX_EOJEOL,
): BlankItem[] {
  // blockIndex = walkBlocks pre-order 인덱스(레이아웃 엔진 Pass 0 와 동일 좌표계).
  const blockOrder: Block[] = [];
  walkBlocks(body, (b) => blockOrder.push(b));
  const hitsByBlock = computeBlockBlankHits(body, wordBlanks);

  const spans: BlankItem[] = [];
  let idx = 0;
  for (let bi = 0; bi < blockOrder.length; bi++) {
    const hits = hitsByBlock.get(blockOrder[bi]);
    if (!hits || hits.length === 0) continue;
    const text = blockCumulativeText(blockOrder[bi]);
    let spanStart = hits[0].start;
    let spanEnd = hits[0].end;
    for (const h of hits) {
      if (h.start < spanStart) spanStart = h.start;
      if (h.end > spanEnd) spanEnd = h.end;
    }
    // 구간을 타이핑 대상 토큰 범위와 교차 — subtitle 라벨 등 비입력 토큰에서 구간이 끊긴다.
    for (const seg of typeableRanges(blockOrder[bi])) {
      const segStart = Math.max(spanStart, seg.start);
      const segEnd = Math.min(spanEnd, seg.end);
      if (segStart >= segEnd) continue;
      for (const chunk of chunkByEojeol(text, segStart, segEnd, maxEojeol)) {
        const answer = text.slice(chunk.start, chunk.end);
        if (answer.trim().length === 0) continue;
        spans.push({
          idx: idx++,
          length: answer.length,
          answer,
          blockIndex: bi,
          cumOffset: chunk.start,
        });
      }
    }
  }
  return spans;
}
