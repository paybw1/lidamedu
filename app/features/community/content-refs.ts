// feat-6-005 콘텐츠 인용 marker — 파서 (클라/서버 공용).
// `[law:patent#29]` `[law:patent#29의2]` — 법 + 조문 번호
// `[case:2020다123456]` — 사건번호
// `[problem:UUID]` — 문제 id

export type ContentRefKind = "law" | "case" | "problem";

export interface ContentRef {
  kind: ContentRefKind;
  /** 정규화 key — lookup map 의 키. */
  key: string;
  /** 원본 marker (예: "[law:patent#29]"). */
  raw: string;
  /** 인라인 위치 — 파서 결과에 포함. */
  index: number;
  length: number;
}

const LAW_RE = /\[law:([a-z-]+)#([^\]\s]+)\]/g;
const CASE_RE = /\[case:([^\]\s]+)\]/g;
const PROBLEM_RE = /\[problem:([0-9a-fA-F-]{8,})\]/g;

export function extractContentRefs(text: string): ContentRef[] {
  if (!text) return [];
  const out: ContentRef[] = [];
  for (const m of text.matchAll(LAW_RE)) {
    out.push({
      kind: "law",
      key: `${m[1]}|${m[2]}`,
      raw: m[0],
      index: m.index ?? 0,
      length: m[0].length,
    });
  }
  for (const m of text.matchAll(CASE_RE)) {
    out.push({
      kind: "case",
      key: m[1],
      raw: m[0],
      index: m.index ?? 0,
      length: m[0].length,
    });
  }
  for (const m of text.matchAll(PROBLEM_RE)) {
    out.push({
      kind: "problem",
      key: m[1],
      raw: m[0],
      index: m.index ?? 0,
      length: m[0].length,
    });
  }
  out.sort((a, b) => a.index - b.index);
  return out;
}

/** 본문을 marker 위치 기준으로 plain text 와 marker token 으로 분할. */
export interface BodySegment {
  type: "text" | "marker";
  text: string;
  ref?: ContentRef;
}

export function splitBodyByRefs(text: string): BodySegment[] {
  const refs = extractContentRefs(text);
  if (refs.length === 0) return [{ type: "text", text }];
  const out: BodySegment[] = [];
  let cursor = 0;
  for (const ref of refs) {
    if (ref.index > cursor) {
      out.push({ type: "text", text: text.slice(cursor, ref.index) });
    }
    out.push({ type: "marker", text: ref.raw, ref });
    cursor = ref.index + ref.length;
  }
  if (cursor < text.length) {
    out.push({ type: "text", text: text.slice(cursor) });
  }
  return out;
}

/* ── 해석 결과 메타 ──────────────────────────────────────────────────── */

export interface LawRefMeta {
  lawCode: string;
  articleNumber: string;
  displayLabel: string;
  url: string;
}

export interface CaseRefMeta {
  caseId: string;
  caseNumber: string;
  caseTitle: string | null;
  lawCode: string;
  url: string;
}

export interface ProblemRefMeta {
  problemId: string;
  lawCode: string;
  year: number | null;
  problemNumber: number | null;
  bodySnippet: string;
  url: string;
}

export interface ResolvedRefMap {
  law: Record<string, LawRefMeta>;
  case: Record<string, CaseRefMeta>;
  problem: Record<string, ProblemRefMeta>;
}

export const EMPTY_REF_MAP: ResolvedRefMap = { law: {}, case: {}, problem: {} };
