// 강의 플랫폼 과목 코드 SSOT — 강의개설(courses.subject_code)·강의그룹(content_groups.subject_code)·
// 도서(books.subject_code, 2026-09-11 과목별 진열) 공용.
// 값 집합은 DB CHECK(books_subject_code_check 등)와 동기 — 새 값은 DB 부터 넣는다.
// 클라이언트 번들에 들어가므로 .server 모듈을 import 하지 말 것.

export const LMS_SUBJECT_CODES = [
  "patent",
  "trademark",
  "design",
  "civil",
  "civil-procedure",
  "science",
] as const;

export type LmsSubjectCode = (typeof LMS_SUBJECT_CODES)[number];

export const LMS_SUBJECT_LABEL: Record<LmsSubjectCode, string> = {
  patent: "특허법",
  trademark: "상표법",
  design: "디자인보호법",
  civil: "민법",
  "civil-procedure": "민사소송법",
  science: "자연과학",
};

/** select 옵션 — 배열 순서가 곧 화면 표시 순서(과목별 진열 순서). */
export const LMS_SUBJECT_OPTIONS: ReadonlyArray<{
  value: LmsSubjectCode;
  label: string;
}> = LMS_SUBJECT_CODES.map((value) => ({
  value,
  label: LMS_SUBJECT_LABEL[value],
}));

export function isLmsSubjectCode(v: unknown): v is LmsSubjectCode {
  return (
    typeof v === "string" &&
    (LMS_SUBJECT_CODES as readonly string[]).includes(v)
  );
}

/** 코드 → 한국어 과목명. 미지정·모르는 코드는 null. */
export function lmsSubjectLabel(
  code: string | null | undefined,
): string | null {
  return isLmsSubjectCode(code) ? LMS_SUBJECT_LABEL[code] : null;
}
