// feat-11-008 P5 — 강의 상세페이지 섹션 SSOT(260807 요청서 '에디터 적용 입력 영역' 9종).
// subscription_plans.detail_sections jsonb 의 키 = 아래 key. 서버 의존 없음(운영자 폼·상세 공용).

export const DETAIL_SECTIONS = [
  { key: "summary", label: "강의 기본설명" },
  { key: "detail", label: "강의 상세설명" },
  { key: "intro", label: "강의 소개" },
  { key: "target", label: "수강대상" },
  { key: "features", label: "강의특징" },
  { key: "curriculum", label: "커리큘럼 안내" },
  { key: "books", label: "교재 안내" },
  { key: "notice", label: "수강 유의사항" },
  { key: "refund", label: "환불 및 이용 안내" },
] as const;

export type DetailSectionKey = (typeof DETAIL_SECTIONS)[number]["key"];

export type DetailSections = Partial<Record<DetailSectionKey, string>>;

const KEYS = new Set(DETAIL_SECTIONS.map((s) => s.key as string));

/** jsonb → 알려진 키만 남긴 안전한 맵(빈 문자열 제외). */
export function toDetailSections(v: unknown): DetailSections {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: DetailSections = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (!KEYS.has(k)) continue;
    if (typeof val !== "string") continue;
    const html = val.trim();
    if (html) out[k as DetailSectionKey] = html;
  }
  return out;
}

/** 섹션이 하나라도 있으면 true — 레거시 detail_html 폴백 판단용. */
export function hasAnyDetailSection(s: DetailSections): boolean {
  return DETAIL_SECTIONS.some((sec) => Boolean(s[sec.key]));
}
