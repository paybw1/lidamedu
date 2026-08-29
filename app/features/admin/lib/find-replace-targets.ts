// feat-7-049 — 본문 찾아 고치기의 대상 필드 SSOT.
//
// 화면·서버 양쪽이 같은 목록을 봐야 한다. 여기 없는 필드는 검색도 치환도 되지 않는다.
// 무엇을 **일부러 뺐는지**는 docs/features/feat-7-049-content-find-replace.md 참조
// (법령 조문 · 판례 식별 필드 · 2차 모범답안/채점기준 · 문제 발문).

export const ENTITY_TYPES = [
  "case",
  "case_placement",
  "case_reference",
  "problem",
] as const;
export type FindReplaceEntity = (typeof ENTITY_TYPES)[number];

export interface FieldSpec {
  field: string;
  label: string;
  /**
   * jsonb 필드일 때 치환을 허용할 키. ★화이트리스트여야 한다 —
   * 문자열을 전부 훑으면 kind·key·type 같은 구조 키와 이미지 URL까지 바뀐다.
   */
  jsonKeys?: readonly string[];
}

export interface EntitySpec {
  label: string;
  table: string;
  idColumn: string;
  fields: readonly FieldSpec[];
}

export const FIND_REPLACE_TARGETS: Record<FindReplaceEntity, EntitySpec> = {
  case: {
    label: "판례 본문",
    table: "cases",
    idColumn: "case_id",
    fields: [
      { field: "summary_title", label: "요지 제목" },
      // 뷰어는 summary_items 를 먼저 그리고 이 필드는 폴백이다. 둘 다 대상.
      { field: "summary_body_md", label: "요지 본문(구)" },
      { field: "reasoning_md", label: "이유" },
      { field: "comment_body_md", label: "비고·평석" },
      { field: "related_md", label: "관련자료 설명" },
      {
        field: "summary_items",
        label: "요지 항목",
        jsonKeys: ["title", "body", "commentMd"],
      },
      { field: "book_sections", label: "교재 서술", jsonKeys: ["text"] },
    ],
  },
  case_placement: {
    label: "판례 배치 서술",
    table: "case_systematic_links",
    idColumn: "link_id",
    fields: [{ field: "book_sections", label: "교재 서술", jsonKeys: ["text"] }],
  },
  case_reference: {
    label: "관련 논문·기사",
    table: "case_references",
    idColumn: "reference_id",
    fields: [
      { field: "title", label: "제목" },
      { field: "authors", label: "저자" },
      { field: "source", label: "출처" },
      { field: "note", label: "메모" },
    ],
  },
  problem: {
    label: "문제 해설",
    table: "problems",
    idColumn: "problem_id",
    fields: [{ field: "explanation_md", label: "해설" }],
  },
};

export function fieldSpecOf(
  entityType: FindReplaceEntity,
  field: string,
): FieldSpec | null {
  return (
    FIND_REPLACE_TARGETS[entityType].fields.find((f) => f.field === field) ?? null
  );
}

export function fieldLabelOf(entityType: FindReplaceEntity, field: string): string {
  return fieldSpecOf(entityType, field)?.label ?? field;
}

/** 한 번에 고칠 수 있는 상한 — 미리보기로 감당 가능한 범위. */
export const MAX_MATCHES = 200;
/** 검색어 최소 길이. 한 글자를 허용하면 사실상 전수 치환이 된다. */
export const MIN_TERM = 2;
/** 미리보기 맥락 — 찾은 자리 앞뒤로 보여 줄 글자 수. */
export const CONTEXT_CHARS = 30;
