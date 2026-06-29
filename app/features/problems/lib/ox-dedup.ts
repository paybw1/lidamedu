// feat-4-A-343 — 조문 OX 패널 표시 중복 제거 (비파괴적, 표시 단계).
// 같은 조문에 서로 다른 정당한 문제(다른 회차)가 동일 지문을 물어 패널에 같은 문장이
// 여러 번 뜨는 것을 대표 1개로 합친다. 데이터(problem/choice/box)는 건드리지 않는다.

import type { OxQuestionItem } from "~/features/problems/labels";

// 지문 앞 항목 번호 — (가) (ㄱ) [ㄱ] ㄱ. ① 1) 등 — 제거.
// 정오문제는 지문 하나 단위라 번호가 불필요(표시)하고, marker 유무만 다른 같은 지문을
// 한 그룹으로 합치기 위한 dedup 정규화의 일부이기도 하다. (패널 표시와 단일 규칙·단일 소유.)
export function stripLeadingMarker(text: string): string {
  let s = text.trimStart();
  const marker =
    /^(?:[([（［][가-힣ㄱ-ㅎ\d]+[)\]）］]|[가-힣ㄱ-ㅎ]\.|[①-⑳]|\d+[.)])\s*/;
  while (marker.test(s)) s = s.replace(marker, "").trimStart();
  return s;
}

// dedup 시그니처: 앞 번호 제거 + 모든 공백 제거 (감사 ox-dup-audit.mjs 와 동일 정규화).
export function normalizeOxBody(text: string): string {
  return stripLeadingMarker(text).replace(/\s+/g, "");
}

// 대표 선정 우선순위(클수록 우선): 승인>초안, 기출>변형>예상>모의>AI, 최신 연도, refId 안정정렬.
const ORIGIN_RANK: Record<string, number> = {
  past_exam: 5,
  past_exam_variant: 4,
  expected: 3,
  mock: 2,
  ai_draft: 1,
};
function reviewRank(status: string | undefined): number {
  if (status === "approved") return 2;
  if (status === "draft") return 1;
  return 0;
}
function compareRepresentative(a: OxQuestionItem, b: OxQuestionItem): number {
  const r = reviewRank(b.reviewStatus) - reviewRank(a.reviewStatus);
  if (r !== 0) return r;
  const o = (ORIGIN_RANK[b.origin] ?? 0) - (ORIGIN_RANK[a.origin] ?? 0);
  if (o !== 0) return o;
  const y = (b.year ?? 0) - (a.year ?? 0);
  if (y !== 0) return y;
  return a.refId < b.refId ? -1 : a.refId > b.refId ? 1 : 0;
}

// 단일 조문 기준 호출 전제(getOxQuestionsForArticle 가 한 조문의 OX 목록을 넘김).
// - 모순(O/X 갈림) 그룹은 합치지 않고 전부 반환(가드: 정답 오류를 조용히 숨기지 않음 → staff 교정).
// - 그 외 중복은 대표 1개 + dupCount(그룹 크기, "여러 회차 출제" 배지용).
export function dedupeOxByBody(items: OxQuestionItem[]): OxQuestionItem[] {
  const groups = new Map<string, OxQuestionItem[]>();
  const order: string[] = [];
  for (const it of items) {
    const key = normalizeOxBody(it.bodyMd);
    const g = groups.get(key);
    if (g) {
      g.push(it);
    } else {
      groups.set(key, [it]);
      order.push(key);
    }
  }
  const out: OxQuestionItem[] = [];
  for (const key of order) {
    const g = groups.get(key) ?? [];
    if (g.length <= 1) {
      out.push(...g);
      continue;
    }
    const truths = new Set(g.map((x) => x.oxTruth));
    if (truths.size >= 2) {
      out.push(...g); // 모순 — 합치지 않고 그대로 노출
      continue;
    }
    const rep = [...g].sort(compareRepresentative)[0];
    out.push({ ...rep, dupCount: g.length });
  }
  return out;
}
