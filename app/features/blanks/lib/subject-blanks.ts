// 주체 빈칸 모드 자동 생성기 — 운영자가 만든 set 과 무관하게, 본문 텍스트 패턴에서 즉석 생성.
// 규칙:
//   1) 주체 키워드 (특허심판원장/심판관합의체/지식재산처장/특허청장/심사관/심판관/심판장) 가 등장하면 빈칸.
//   2) "X이/가/은/는 ... Y에게" 형식의 문장에서 "Y" 부분 (에게 제외) 만 빈칸.
// 두 규칙이 겹치는 경우 (예: "심사관에게" — 심사관 자체가 주체이자 수신자) 동일 범위로 합쳐짐.
//
// "함께 공부할 조문" (sub_article_group — 시행령/시행규칙 박스 안 본문) 은 주체 빈칸 대상에서 제외.
// 메인 조문의 주체에만 집중하기 위함.
//
// 결과는 BlankItem[] 형태로 반환 — blockIndex/cumOffset 포함해 BlankFillView 의 정확 좌표
// 렌더링 (computeBlockBlankHits Pass 0) 에 즉시 사용 가능. DB 저장 없음 (즉석 생성 + 휘발).

import type { ArticleBody, Block } from "~/features/laws/lib/article-body";

import { blockCumulativeText } from "./blank-layout";
import type { BlankItem } from "../queries.server";

// 길이 내림차순 — 부분 일치 방지용 (심판관합의체 가 심판관 보다 먼저 잡혀야 함).
// "특허심판원장" 이 먼저 잡혀야 그 안의 "심판원장" 부분이 중복 매칭되지 않음.
const SUBJECT_KEYWORDS = [
  "특허심판원장",
  "심판관합의체",
  "지식재산처장",
  "심판원장",
  "특허청장",
  "심사관",
  "심판관",
  "심판장",
] as const;

// 그룹 1 = 명사 (Y) — 빈칸은 이 부분만, "에게" 는 본문에 그대로 남김.
const RECIPIENT_RE = /([가-힯]+)에게/g;
// 문장 안의 주체 표지 — 한글 명사 + 은/는/이/가. 단순 휴리스틱.
const SUBJECT_MARKER_RE = /[가-힯]+(?:은|는|이|가)/;

interface CandidateRange {
  start: number;
  end: number;
  answer: string;
}

function findSubjectKeywordRanges(text: string): CandidateRange[] {
  // 길이 내림차순 키워드를 순회하며 위치 수집. 이미 다른 키워드가 차지한 범위와 겹치면 skip
  // (예: "심판관합의체" 가 잡힌 자리 안에 "심판관" 매칭이 또 들어오지 않게).
  const taken: CandidateRange[] = [];
  for (const kw of SUBJECT_KEYWORDS) {
    let from = 0;
    while (true) {
      const idx = text.indexOf(kw, from);
      if (idx < 0) break;
      const end = idx + kw.length;
      const overlap = taken.some((t) => t.start < end && t.end > idx);
      if (!overlap) {
        taken.push({ start: idx, end, answer: kw });
      }
      from = idx + 1;
    }
  }
  return taken;
}

// "Y에게" 가 등장하는 문장에서 그 앞에 주체 표지 (은/는/이/가) 가 있으면 후보로 채택.
// 빈칸은 "Y" (명사 부분) 만 — "에게" 는 본문에 그대로 둠.
// 문장 경계는 ./?/!/줄바꿈. 한 block cumulative 는 보통 한 항/문장 단위라 충분.
function findRecipientRanges(text: string): CandidateRange[] {
  const out: CandidateRange[] = [];
  RECIPIENT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RECIPIENT_RE.exec(text)) !== null) {
    const noun = m[1];
    const nounStart = m.index;
    const nounEnd = nounStart + noun.length;
    let sentStart = 0;
    for (let i = nounStart - 1; i >= 0; i--) {
      const c = text[i];
      if (c === "." || c === "?" || c === "!" || c === "\n") {
        sentStart = i + 1;
        break;
      }
    }
    const preceding = text.slice(sentStart, nounStart);
    if (SUBJECT_MARKER_RE.test(preceding)) {
      out.push({
        start: nounStart,
        end: nounEnd,
        answer: noun,
      });
    }
  }
  return out;
}

// 두 후보 집합 합치기 — 겹치면 더 넓은 범위 채택. 시작 순으로 정렬해 반환.
function mergeRanges(a: CandidateRange[], b: CandidateRange[]): CandidateRange[] {
  const all = [...a, ...b].sort((x, y) => x.start - y.start);
  const out: CandidateRange[] = [];
  for (const r of all) {
    const idxOverlap = out.findIndex(
      (o) => o.start < r.end && o.end > r.start,
    );
    if (idxOverlap === -1) {
      out.push(r);
      continue;
    }
    const existing = out[idxOverlap];
    const existingLen = existing.end - existing.start;
    const newLen = r.end - r.start;
    if (newLen > existingLen) {
      out[idxOverlap] = r;
    }
  }
  return out.sort((x, y) => x.start - y.start);
}

// blockIndex 는 walkBlocks(blank-layout.ts) pre-order 와 동일 순서로 부여되어야 한다
// (computeBlockBlankHits 의 blockOrder 와 정렬 정합). 동시에 sub_article_group 자손 여부를
// 같이 트래킹해서 그쪽 자손은 텍스트 매칭에서 제외 — 빈칸 후보 생성만 skip 하고 인덱스는 그대로 증가.
function walkWithSubArticleFlag(
  body: ArticleBody,
  visitor: (block: Block, blockIndex: number, insideSubArticle: boolean) => void,
): void {
  let i = 0;
  const walk = (blocks: Block[], inside: boolean) => {
    for (const b of blocks) {
      visitor(b, i++, inside);
      if (b.kind === "clause" || b.kind === "item" || b.kind === "sub") {
        walk(b.children, inside);
      } else if (b.kind === "sub_article_group") {
        if (b.preface) walk(b.preface, true);
        for (const sa of b.articles) walk(sa.blocks, true);
      }
    }
  };
  walk(body.blocks, false);
}

// body 의 모든 block 을 walkBlocks 순서로 순회하면서 주체 빈칸 후보를 만든다.
// blockIndex + cumOffset 를 같이 기록해 computeBlockBlankHits 의 Pass 0 (정확 좌표) 로
// 결정적으로 배치되도록 한다. 단, "함께 공부할 조문" (sub_article_group) 자손은 skip.
export function computeSubjectBlanks(body: ArticleBody): BlankItem[] {
  const out: BlankItem[] = [];
  let nextIdx = 1;
  walkWithSubArticleFlag(body, (block, blockIndex, insideSubArticle) => {
    if (insideSubArticle) return;
    const text = blockCumulativeText(block);
    if (text.length === 0) return;
    const subjects = findSubjectKeywordRanges(text);
    const recipients = findRecipientRanges(text);
    const ranges = mergeRanges(subjects, recipients);
    for (const r of ranges) {
      out.push({
        idx: nextIdx++,
        length: r.end - r.start,
        answer: r.answer,
        beforeContext: "",
        afterContext: "",
        blockIndex,
        cumOffset: r.start,
      });
    }
  });
  return out;
}
