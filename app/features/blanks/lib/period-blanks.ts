// 기간 빈칸 모드 자동 생성기 — 본문 (조문) + 함께 공부할 조문 중 현행 시행령/시행규칙 박스에서
// 기간 표현 (년/(개)월/주/일) 과 그 기준점을 즉석 추출.
//
// 규칙:
//   1) 기간 표현: 숫자 + (년|개월|월|주|일). "30일", "3개월" 같은 단일 + "1년 6개월"
//      같은 공백으로 이어진 복합 기간을 단일 빈칸으로 처리.
//   2) 기준점: 기간 직전에 (부터|로부터|이후|뒤|후|로) 조사가 붙은 명사구. 그 명사구를 별도 빈칸.
//      예: "특허를 받지 못하게 된 날부터 30일" → "특허를 받지 못하게 된 날" + "30일" 두 빈칸.
//      예: "발생일로 30일 이내" → "발생일" + "30일" 두 빈칸.
//
// 함께 공부할 조문 (sub_article_group) 중 source 가 정확히 "시행령" / "시행규칙" 으로 시작하는
// 박스만 포함. "구시행령", "구특허법", "민사소송법" 등은 제외 (학습 대상은 현행만).
//
// 기준점 경계가 모호한 케이스 (50자 안에 명확한 boundary 가 없거나 추출이 너무 길어지는 등) 는
// AmbiguousCase 로 따로 모아 사용자 검토 대상으로 반환.

import type { ArticleBody, Block } from "~/features/laws/lib/article-body";

import { blockCumulativeText } from "./blank-layout";
import overridesData from "./period-blanks-overrides.json";
import type { BlankItem } from "../queries.server";

// scripts/import-period-blanks.mjs 가 CSV 의 사용자 수정 row 를 이 파일에 기록.
// key = `${articleLabel}|${source}|${blockPath}` (예: "제56조|본문|제1항").
// articleLabel 은 "제30조" / "제29조의2" 형식 — DB 의 display_label (title 포함) 이 아닌 정규형.
// value = 빈칸 정답 배열 — 이 순서대로 본문에서 substring 매칭. 빈 배열이면 "이 블록은 빈칸 없음".
type PeriodBlankOverrides = Record<string, Record<string, string[]>>;
const OVERRIDES = overridesData as PeriodBlankOverrides;

// articleNumber ("30", "29의2") → label ("제30조", "제29조의2"). CSV 의 "조문" 컬럼과 동일 포맷.
function formatArticleNumberAsLabel(articleNumber: string): string {
  const idx = articleNumber.indexOf("의");
  if (idx < 0) return `제${articleNumber}조`;
  return `제${articleNumber.slice(0, idx)}조의${articleNumber.slice(idx + 1)}`;
}

// "개월" 이 "월" 보다 먼저 잡히도록 alternation 순서 주의.
// 복합 기간 ("1년 6개월", "1년 3개월 10일" 등) 은 공백으로 이어진 연속 단위를 한 토큰으로 묶어 단일 빈칸 처리.
const DURATION_UNIT = "(?:개월|년|월|주|일)";
const DURATION_RE = new RegExp(
  `\\d+\\s*${DURATION_UNIT}(?:\\s+\\d+\\s*${DURATION_UNIT})*`,
  "g",
);

// 기준점-기간 사이의 조사. 길이 내림차순 — "로부터" 가 "부터" 에 가로채이지 않도록.
// "로" 단독은 가장 마지막 (가장 짧고 false positive 위험 있음 — 주로/별로 등).
const PARTICLE_RE = /(?:로부터|부터|이후|뒤에|후에|뒤|후|로)\s*$/;

// 기준점 시작 boundary 후보:
//   STRONG: , . ! ? \n ( ) [ ] : ; — 명확한 구두점/괄호.
//   SUBJECT: [한글][은|는|이|가] 뒤 공백 — 주격/주제격 조사 직후 (다른 명사 시작점).
//   CLAUSE:  [한글][에|여|고|도|며|서|면] 뒤 공백 — 부사절 구분 (보수적, 일부 false positive 가능).
const STRONG_BOUNDARY = new Set([
  ",", ".", "!", "?", "\n", "\r",
  "(", ")", "[", "]", "{", "}",
  "·", "ㆍ",
  ":", ";",
]);
const SUBJECT_PARTICLE = new Set(["은", "는", "이", "가"]);
const CLAUSE_PARTICLE = new Set(["여", "고", "며"]);
const REF_LIMIT = 50; // 기준점 후보의 최대 char 길이.

// "[duration N]이 지난 후에 / 흐른 뒤에" 등에서 "후/뒤" 는 기간 기준점 조사가 아니라
// 기간이 만료된 후 시점을 가리키는 표현. 이 동사들이 "후/뒤" 직전에 오면 PARTICLE_RE 매칭 무효화.
// 동시에 기준점 walk 시 boundary 로도 사용 (기준점이 이 동사 너머로 확장되지 않게).
const POST_DURATION_VERBS = ["지난", "흐른", "경과한", "경과된", "있은", "산정한"];

// 기준점 앞에 붙는 지시어 — 빈칸에서 제외 (학습 목적상 정답 외 수식어).
// 예: "그 출원일부터 1년" → 빈칸은 "출원일" (그 X). 동일 지시어가 중첩되는 경우는 거의 없으나
// 안전을 위해 loop 로 반복 적용.
const LEADING_DETERMINERS = ["그", "해당", "당해", "상기"];

export interface PeriodAmbiguousCase {
  // 어느 article 의 어느 block 인지 식별.
  articleId: string;
  articleLabel: string;
  blockText: string; // 디버깅용 — block 의 cumulative text (앞뒤 잘라낸 미리보기).
  durationText: string; // 잡힌 기간 토큰 (예: "30일")
  candidate: string; // 추출 시도된 기준점 텍스트.
  reason: string;
}

// "지난 " / "흐른 " 등 boundary 검출 후, 그 뒤에 따라오는 "후"/"뒤"/"후에"/"뒤에"/"후에도"/"뒤에도"
// 부분도 같이 skip — 이 표현 전체가 "기간 만료 후 ..." 부사구라 기준점에 포함되면 안 됨.
function skipPostDurationPhrase(text: string, fromPos: number): number {
  let pos = fromPos;
  if (pos >= text.length) return pos;
  if (text[pos] !== "후" && text[pos] !== "뒤") return pos;
  pos++;
  if (pos < text.length && text[pos] === "에") {
    pos++;
    // "에도", "에는" 등 추가 조사.
    if (pos < text.length && (text[pos] === "도" || text[pos] === "는")) {
      pos++;
    }
  }
  while (pos < text.length && /\s/.test(text[pos])) pos++;
  return pos;
}

function findReferenceStart(text: string, particleStart: number): number | null {
  const minPos = Math.max(0, particleStart - REF_LIMIT);
  for (let i = particleStart - 1; i >= minPos; i--) {
    const c = text[i];
    if (STRONG_BOUNDARY.has(c)) return i + 1;
    if (/\s/.test(c)) {
      // 공백 직전이 "지난"/"흐른"/"경과한" 등이면 그 자리를 boundary 로 ("기간 후" 표현 차단).
      // 이어지는 "후/뒤/후에/뒤에/후에도/뒤에도" 도 같이 skip.
      for (const v of POST_DURATION_VERBS) {
        if (i >= v.length && text.slice(i - v.length, i) === v) {
          return skipPostDurationPhrase(text, i + 1);
        }
      }
      // 공백 발견 시 직전 1글자가 주격/주제격/부사절 조사인지 확인.
      if (i >= 2) {
        const prev1 = text[i - 1];
        const prev2 = text[i - 2];
        if (
          /[가-힯]/.test(prev2) &&
          (SUBJECT_PARTICLE.has(prev1) || CLAUSE_PARTICLE.has(prev1))
        ) {
          return i + 1;
        }
      }
    }
  }
  return null;
}

// 짧은 기준점 ("날" / "때" 단독 등) 을 그 앞 동사 modifier + 목적격 명사구까지 확장.
// 현재 boundary 검출이 verb-stem ending 인 "은" 을 subject marker 로 오인해 "받은 날" 의 "받은 " 에서
// 끊고 "날" 만 잡는 케이스를 보완. 예: "통지를 받은 날" — 객체 "통지를" 까지 포함.
function extendShortReference(
  text: string,
  refStart: number,
  refEnd: number,
): number {
  const refText = text.slice(refStart, refEnd);
  if (refText.length >= 10) return refStart;
  if (!/[날때]$/.test(refText)) return refStart;
  // refStart 직전 공백 skip.
  let i = refStart - 1;
  while (i >= 0 && /\s/.test(text[i])) i--;
  // 동사 modifier 끝 (은/는/한/된 등) 을 지나 목적격 (을/를) + 공백 패턴 찾기.
  const minPos = Math.max(0, refEnd - REF_LIMIT);
  while (i >= minPos) {
    const c = text[i];
    if (STRONG_BOUNDARY.has(c)) return i + 1;
    // "지난"/"흐른" 등이 나오면 그 자리에서 stop (기간 기준점이 아님).
    if (/\s/.test(c)) {
      for (const v of POST_DURATION_VERBS) {
        if (i >= v.length && text.slice(i - v.length, i) === v) {
          return skipPostDurationPhrase(text, i + 1);
        }
      }
      if (i >= 2) {
        const prev1 = text[i - 1];
        const prev2 = text[i - 2];
        // 진짜 주격/주제격 (이/가) — 명사 + 이/가 공백.
        // 은/는 은 verb ending 과 충돌하므로 일단 stop 하지 않고 계속 확장 (후속 STRONG/지난 등이 잡아줌).
        if (
          /[가-힯]/.test(prev2) &&
          (prev1 === "이" || prev1 === "가")
        ) {
          return i + 1;
        }
        // 목적격 (을/를) + 공백 — 목적어 명사구 시작점까지 확장.
        if (/[가-힯]/.test(prev2) && (prev1 === "을" || prev1 === "를")) {
          // 을/를 직전 한글 명사의 시작점까지 walk.
          let j = i - 2;
          while (j >= minPos && /[가-힯]/.test(text[j])) j--;
          return j + 1;
        }
      }
    }
    i--;
  }
  // 의미 있는 확장 target (을/를, 이/가, STRONG, 지난) 없으면 원래 refStart 유지 — 과도 확장 방지.
  return refStart;
}

function trimTrailingSpace(text: string, end: number): number {
  let e = end;
  while (e > 0 && /\s/.test(text[e - 1])) e--;
  return e;
}

function trimLeadingSpace(text: string, start: number): number {
  let s = start;
  while (s < text.length && /\s/.test(text[s])) s++;
  return s;
}

// refStart 직후가 LEADING_DETERMINERS + 공백 형태면 그 부분을 skip.
// 중첩 지시어 ("해당 그 ...") 도 처리하기 위해 변화 없을 때까지 반복.
function skipLeadingDeterminers(
  text: string,
  refStart: number,
  refEnd: number,
): number {
  let cur = refStart;
  while (true) {
    cur = trimLeadingSpace(text, cur);
    let advanced = false;
    for (const d of LEADING_DETERMINERS) {
      const after = cur + d.length;
      if (after >= refEnd) continue;
      if (text.slice(cur, after) !== d) continue;
      // 지시어 다음에 공백이 있어야 — "그것" 의 "그" 가 잘리는 걸 방지.
      if (!/\s/.test(text[after])) continue;
      cur = after;
      advanced = true;
      break;
    }
    if (!advanced) break;
  }
  return cur;
}

// "[명사] 경과후 [기간]" / "[명사] 경과 후 [기간]" 패턴 — "경과" 직후의 "후" 가 particle 처럼
// 기준점-기간을 잇지만, "경과" 자체는 기준점에 포함되어야 한다.
//   예: "기준일 경과후 30일" → 기준점 "기준일 경과", 기간 "30일".
// "경과한"/"경과된" + "후" 는 POST_DURATION_VERBS 와 충돌하므로 별도 처리하지 않는다 (skip).
function tryExtractElapseReference(
  text: string,
  particleStartInBefore: number,
  particleWord: string,
): { start: number; end: number } | null {
  if (
    particleWord !== "후" &&
    particleWord !== "후에" &&
    particleWord !== "뒤" &&
    particleWord !== "뒤에"
  ) {
    return null;
  }
  // particle 직전 (공백 skip 후) 마지막 한글이 "과" 이고 그 앞이 "경" 인지 확인.
  let scan = particleStartInBefore - 1;
  while (scan >= 0 && /\s/.test(text[scan])) scan--;
  if (scan < 1 || text[scan] !== "과" || text[scan - 1] !== "경") return null;
  const elapseEnd = scan + 1; // "경과" 직후 (= particle 시작 위치 또는 그 사이 공백 직전).
  // "경과" 앞 공백 + 1 단어 (한글) 까지 확장 — 의미 단위 "[명사] 경과".
  let i = scan - 2; // "경" 직전.
  while (i >= 0 && /\s/.test(text[i])) i--;
  while (i >= 0 && /[가-힯]/.test(text[i])) i--;
  const elapseStart = i + 1;
  if (elapseStart >= elapseEnd) return null;
  return { start: elapseStart, end: elapseEnd };
}

interface Range {
  start: number;
  end: number;
  answer: string;
}

interface BlockMatchResult {
  ranges: Range[];
  ambiguous: Array<{
    durationText: string;
    candidate: string;
    reason: string;
  }>;
}

function findRangesInBlock(text: string): BlockMatchResult {
  const ranges: Range[] = [];
  const ambiguous: BlockMatchResult["ambiguous"] = [];
  DURATION_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = DURATION_RE.exec(text)) !== null) {
    const durationStart = m.index;
    const durationEnd = m.index + m[0].length;
    const durationText = text.slice(durationStart, durationEnd);

    // 1) 기간 자체는 항상 빈칸 후보.
    ranges.push({
      start: durationStart,
      end: durationEnd,
      answer: durationText,
    });

    // 2) 직전 조사 (부터/이후 등) 검사 후 기준점 추출.
    const beforeText = text.slice(0, durationStart);
    const particleMatch = beforeText.match(PARTICLE_RE);
    if (!particleMatch) continue;
    const particleStartInBefore =
      beforeText.length - particleMatch[0].length;
    const particleWord = particleMatch[0].trim();
    // 2a) "경과후" / "경과 후" 패턴 — "[명사] 경과" 가 기준점 (시행규칙 제111조 등).
    //     POST_DURATION skip 보다 먼저 시도해 "경과한"/"경과된" 매칭과 분리.
    const elapse = tryExtractElapseReference(
      text,
      particleStartInBefore,
      particleWord,
    );
    if (elapse) {
      const refTextElapse = text.slice(elapse.start, elapse.end).trim();
      if (refTextElapse.length > 0) {
        ranges.push({
          start: elapse.start,
          end: elapse.end,
          answer: refTextElapse,
        });
      }
      continue;
    }
    // 2b) "[duration N]이 지난 후에 / 흐른 뒤에" 같은 표현에서 후/뒤 는 기준점 조사가 아님 — skip.
    if (
      particleWord === "후" ||
      particleWord === "후에" ||
      particleWord === "뒤" ||
      particleWord === "뒤에"
    ) {
      const beforeTrimmed = beforeText.slice(0, particleStartInBefore).trimEnd();
      if (POST_DURATION_VERBS.some((v) => beforeTrimmed.endsWith(v))) {
        continue;
      }
    }
    // 조사 자체는 본문에 그대로 둠 — 기준점은 조사 직전까지.
    const particleStart = particleStartInBefore;
    const refStartRaw = findReferenceStart(text, particleStart);
    if (refStartRaw === null) {
      ambiguous.push({
        durationText,
        candidate: text.slice(Math.max(0, particleStart - REF_LIMIT), particleStart),
        reason: "기준점 시작 boundary 미검출 (50자 안에 구두점/주격조사 없음)",
      });
      continue;
    }
    let refStart = trimLeadingSpace(text, refStartRaw);
    const refEnd = trimTrailingSpace(text, particleStart);
    if (refStart >= refEnd) {
      ambiguous.push({
        durationText,
        candidate: text.slice(refStartRaw, particleStart),
        reason: "기준점 길이 0",
      });
      continue;
    }
    // 1) "그/해당/당해/상기" 지시어를 먼저 제거 — extension 트리거 길이 판정에 영향.
    //    예: "그 통지를 받은 날" 은 strip 하면 "통지를 받은 날" → extension 으로 더 거슬러 올라가지 않음.
    refStart = skipLeadingDeterminers(text, refStart, refEnd);
    if (refStart >= refEnd) {
      ambiguous.push({
        durationText,
        candidate: text.slice(refStartRaw, particleStart),
        reason: "지시어 제외 후 기준점 길이 0",
      });
      continue;
    }
    // 2) 그래도 짧고 (<10자) "날"/"때" 로 끝나면 verbal modifier + object 까지 확장.
    refStart = trimLeadingSpace(text, extendShortReference(text, refStart, refEnd));
    // 3) 확장 후에 다시 지시어 떨어졌을 가능성 — 한 번 더 strip.
    refStart = skipLeadingDeterminers(text, refStart, refEnd);
    if (refStart >= refEnd) continue;
    const refText = text.slice(refStart, refEnd);
    const lastChar = refText[refText.length - 1];
    if (!/[가-힯]/.test(lastChar)) {
      ambiguous.push({
        durationText,
        candidate: refText,
        reason: "기준점 끝 글자가 한글 명사가 아님",
      });
      continue;
    }
    ranges.push({ start: refStart, end: refEnd, answer: refText });
  }
  return { ranges, ambiguous };
}

// 겹치는 range 는 더 넓은 쪽 채택. start 오름차순 반환.
function mergeRanges(ranges: Range[]): Range[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const out: Range[] = [];
  for (const r of sorted) {
    const idxOverlap = out.findIndex(
      (o) => o.start < r.end && o.end > r.start,
    );
    if (idxOverlap === -1) {
      out.push(r);
      continue;
    }
    const existing = out[idxOverlap];
    if (r.end - r.start > existing.end - existing.start) {
      out[idxOverlap] = r;
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

// 각 block 의 위치 라벨 — override 키 생성 시 사용. export-period-blanks.mjs 와 동일 규칙.
function blockPathLabel(block: Block, ancestors: Block[]): string {
  const parts: string[] = [];
  for (const a of ancestors) {
    if (a.kind === "clause") parts.push(`제${a.number}항`);
    else if (a.kind === "item") parts.push(`${a.number}.`);
    else if (a.kind === "sub") parts.push(`${a.letter}.`);
  }
  if (block.kind === "clause") return `제${block.number}항`;
  if (block.kind === "item") return [...parts, `${block.number}.`].join(" - ");
  if (block.kind === "sub") return [...parts, `${block.letter}.`].join(" - ");
  if (block.kind === "para") return parts.length > 0 ? parts.join(" - ") : "본문";
  if (block.kind === "title_marker") return "표제";
  return parts.join(" - ");
}

interface BlockVisitInfo {
  blockIndex: number;
  source: string; // "본문" 또는 "시행령 제X조" 등 — sub_article_group 의 source.
  blockPath: string;
}

// walkBlocks(blank-layout.ts) 와 동일 pre-order 순서로 인덱스 부여.
// 시행령/시행규칙 sub_article_group 안 자손은 포함, 그 외 sub_article_group 은 제외:
//   - 구시행령 / 구특허법 / 민사소송법 / 디자인보호법 등 → "구" 또는 다른 법 prefix 라 ^(시행령|시행규칙) 매칭 실패.
//   - 즉 "구시행령" 도 자동 제외 (현행 시행령/시행규칙만 학습 대상).
// 인덱스 자체는 모든 block 에 대해 증가시켜 computeBlockBlankHits 의 blockOrder 와 일치 유지.
function walkForPeriod(
  body: ArticleBody,
  visitor: (block: Block, info: BlockVisitInfo) => void,
): void {
  let i = 0;
  const walk = (blocks: Block[], shouldInclude: boolean, source: string, ancestors: Block[]) => {
    for (const b of blocks) {
      if (shouldInclude && b.kind !== "sub_article_group") {
        visitor(b, {
          blockIndex: i,
          source,
          blockPath: blockPathLabel(b, ancestors),
        });
      }
      i++;
      if (b.kind === "clause" || b.kind === "item" || b.kind === "sub") {
        walk(b.children, shouldInclude, source, [...ancestors, b]);
      } else if (b.kind === "sub_article_group") {
        const includeSub = /^(시행령|시행규칙)/.test(b.source ?? "");
        const subSource = b.source ?? source;
        if (b.preface) walk(b.preface, includeSub, subSource, []);
        for (const sa of b.articles) walk(sa.blocks, includeSub, subSource, []);
      }
    }
  };
  walk(body.blocks, true, "본문", []);
}

export interface PeriodBlanksResult {
  blanks: BlankItem[];
  ambiguous: PeriodAmbiguousCase[];
}

// 사용자가 override 로 지정한 빈칸 배열을 본문 cumulative text 에서 순서대로 substring 매칭해 좌표 변환.
// 1번째가 검색된 위치 다음부터 2번째 검색 — "기준일 경과" 다음 "30일" 처럼 등장 순서를 보존.
// 본문에 없는 빈칸이면 그 빈칸은 skip (드물게 typo 등의 경우).
function applyOverrideBlanks(
  text: string,
  blockIndex: number,
  answers: string[],
  startIdx: number,
): { items: BlankItem[]; nextIdx: number } {
  const items: BlankItem[] = [];
  let nextIdx = startIdx;
  let cursor = 0;
  for (const answer of answers) {
    if (!answer) continue;
    const pos = text.indexOf(answer, cursor);
    if (pos < 0) continue;
    items.push({
      idx: nextIdx++,
      length: answer.length,
      answer,
      beforeContext: "",
      afterContext: "",
      blockIndex,
      cumOffset: pos,
    });
    cursor = pos + answer.length;
  }
  return { items, nextIdx };
}

export function computePeriodBlanks(
  body: ArticleBody,
  context: {
    articleId: string;
    articleLabel: string;
    // override lookup 용 — articleNumber + lawCode 로 키잉. articleNumber 는 "30" 또는 "29의2" 형태.
    // 두 값 모두 있어야 override 매칭. 없으면 auto-only.
    articleNumber?: string | null;
    lawCode?: string;
  },
): PeriodBlanksResult {
  const blanks: BlankItem[] = [];
  const ambiguous: PeriodAmbiguousCase[] = [];
  let nextIdx = 1;
  const lawOverrides =
    context.lawCode && context.articleNumber
      ? (OVERRIDES[context.lawCode] ?? {})
      : {};
  // CSV/import 가 사용하는 "제30조" / "제29조의2" 형식으로 articleLabel 을 정규화.
  const overrideArticleKey = context.articleNumber
    ? formatArticleNumberAsLabel(context.articleNumber)
    : null;
  walkForPeriod(body, (block, info) => {
    const text = blockCumulativeText(block);
    if (text.length === 0) return;
    const overrideKey = overrideArticleKey
      ? `${overrideArticleKey}|${info.source}|${info.blockPath}`
      : null;
    const overrideAnswers = overrideKey
      ? lawOverrides[overrideKey]
      : undefined;
    if (overrideAnswers !== undefined) {
      // 빈 배열이면 "이 블록은 빈칸 없음" — 자동 매칭도 무시.
      const result = applyOverrideBlanks(
        text,
        info.blockIndex,
        overrideAnswers,
        nextIdx,
      );
      blanks.push(...result.items);
      nextIdx = result.nextIdx;
      return;
    }
    const { ranges, ambiguous: amb } = findRangesInBlock(text);
    const merged = mergeRanges(ranges);
    for (const r of merged) {
      blanks.push({
        idx: nextIdx++,
        length: r.end - r.start,
        answer: r.answer,
        beforeContext: "",
        afterContext: "",
        blockIndex: info.blockIndex,
        cumOffset: r.start,
      });
    }
    for (const a of amb) {
      ambiguous.push({
        articleId: context.articleId,
        articleLabel: context.articleLabel,
        blockText:
          text.length > 200 ? text.slice(0, 200) + "…" : text,
        durationText: a.durationText,
        candidate: a.candidate,
        reason: a.reason,
      });
    }
  });
  return { blanks, ambiguous };
}
