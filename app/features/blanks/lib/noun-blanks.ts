// feat-2-030 S3c — 빈칸 세트가 없는 조문(민법 등)의 "명사 빈칸" 자동 생성(순수 규칙).
//
// 형태소 분석기 없이 명사를 안정적으로 잡는 방법: **조사(助詞)는 체언(명사·대명사·수사)에
//   붙는다** 는 문법 성질 이용. 어절 끝의 조사를 벗겨낸 앞부분(체언)을 빈칸으로 삼는다.
//   예) "소멸시효는"→소멸시효, "기간을"→기간, "채권자의"→채권자. 서술어/부사/조사뿐인
//   어절은 자연히 제외된다. 완벽하진 않지만("임의로") 법조문 명사를 잘 잡는다.
//
// 산출물 = 합성 BlankItem(blockIndex+cumOffset+answer=명사). 레이아웃 Pass 0 좌표 배치.
//   중(中)=이 명사 전체, 하=절반, 상=구간(tier-spans). 세트로 materialize 하면 기존 tier 흐름 재사용.

import type { ArticleBody, Block } from "~/features/laws/lib/article-body";
import type { BlankItem } from "~/features/blanks/queries.server";

import { blockCumulativeText, walkBlocks } from "./blank-layout";

// 어절 끝에서 벗겨낼 조사(긴 것부터). 체언 뒤에 붙는 격조사·보조사만 — 용언 연결어미와
//   충돌하는 것(나=거나, 든)은 뺐다. 스택된 조사(만을·까지를)는 반복 제거한다.
const JOSA = [
  "으로부터",
  "으로서",
  "으로써",
  "이라도",
  "이라는",
  "이라고",
  "에서의",
  "에서도",
  "에게서",
  "에게로",
  "에게는",
  "이라",
  "라는",
  "라고",
  "이란",
  "에서",
  "에게",
  "으로",
  "에는",
  "에도",
  "에만",
  "과의",
  "와의",
  "로서",
  "로써",
  "로의",
  "부터",
  "까지",
  "마다",
  "처럼",
  "보다",
  "조차",
  "마저",
  "라도",
  "은",
  "는",
  "이",
  "가",
  "을",
  "를",
  "의",
  "에",
  "와",
  "과",
  "도",
  "만",
  "로",
] as const;

// 조사를 벗겨도 명사로 보기 어려운 관형사·부사·대명사·접속사 스템(제외).
const STOP = new Set([
  "다음",
  "그러",
  "그리",
  "다만",
  "또한",
  "그런",
  "이런",
  "저런",
  "모든",
  "어느",
  "여기",
  "거기",
  "저기",
  "누구",
  "무엇",
  "모두",
  "서로",
  "각각",
  "이때",
]);

const isHangul = (s: string) => /^[가-힣]+$/.test(s);

// 한 어절(공백 제외, 앞뒤 비한글 트림된 core)에서 체언(명사) 스템 추출. 없으면 null.
//   ★조사가 실제로 하나 이상 벗겨진 어절만 명사로 인정(용언·부사는 조사가 안 붙어 제외).
export function nounStem(core: string): string | null {
  let stem = core;
  let stripped = 0;
  while (stem.length >= 2) {
    let matched = false;
    for (const j of JOSA) {
      if (stem.length > j.length && stem.endsWith(j)) {
        stem = stem.slice(0, stem.length - j.length);
        stripped++;
        matched = true;
        break;
      }
    }
    if (!matched) break;
  }
  if (stripped === 0) return null; // 조사 없음 → 용언/부사 추정
  if (stem.length < 2) return null;
  if (!isHangul(stem)) return null;
  if (STOP.has(stem)) return null;
  return stem;
}

// body → 명사 빈칸(합성 BlankItem). 조사 벗긴 체언을 어절별 1개씩.
export function deriveNounBlanks(body: ArticleBody): BlankItem[] {
  const blockOrder: Block[] = [];
  walkBlocks(body, (b) => blockOrder.push(b));
  const blanks: BlankItem[] = [];
  let idx = 0;
  for (let bi = 0; bi < blockOrder.length; bi++) {
    const text = blockCumulativeText(blockOrder[bi]);
    if (!text) continue;
    // 어절(공백 구분) 스캔 — 각 토큰의 [start,end) 추적.
    let i = 0;
    while (i < text.length) {
      while (i < text.length && /\s/.test(text[i])) i++;
      if (i >= text.length) break;
      const tokStart = i;
      while (i < text.length && !/\s/.test(text[i])) i++;
      const token = text.slice(tokStart, i);
      // 토큰 앞뒤 한글 아닌 문자(괄호·구두점) 트림 — 스템 offset 보정.
      const lead = token.length - token.replace(/^[^가-힣]+/, "").length;
      const coreStart = tokStart + lead;
      const core = token.slice(lead).replace(/[^가-힣]+$/, "");
      if (core.length < 2) continue;
      const stem = nounStem(core);
      if (!stem) continue;
      // 스템은 core 의 앞부분(조사는 뒤에서 벗김) → 시작은 coreStart, 길이 stem.length.
      blanks.push({
        idx: idx++,
        length: stem.length,
        answer: stem,
        blockIndex: bi,
        cumOffset: coreStart,
      });
    }
  }
  return blanks;
}
