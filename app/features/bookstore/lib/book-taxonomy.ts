// 도서몰 진열 분류 — 과목별 구분(원장 요청 2026-09-11). 학생 카탈로그·도서 관리 공용(클라이언트 안전).
//
// 진열 순서 = 과목(LMS_SUBJECT_OPTIONS 순서) → 운영자 지정 sort_order(동률은 최신 등록순).
// 즉 sort_order 는 같은 과목 묶음 안에서만 의미가 있고, 화살표 이동도 묶음 안에서만 일어난다.
// 과목 미지정 도서는 맨 뒤 한 묶음으로 모은다.
// ★1차/2차 구분은 원장 판단 보류(2026-09-11) — 축을 더할 때는 여기 묶음 키에 붙인다.
import {
  LMS_SUBJECT_OPTIONS,
  isLmsSubjectCode,
  lmsSubjectLabel,
} from "~/features/lms/lib/subject-options";

export interface BookSubjectGroup<T> {
  /** null = 과목 미지정 묶음 */
  subjectCode: string | null;
  label: string;
  items: T[];
}

/**
 * 과목 순서대로 묶는다(도서가 없는 과목은 생략). 입력 순서(=sort_order)는 묶음 안에서 그대로 유지.
 * @param unassignedLabel 미지정 묶음 제목 — 운영 화면 「미분류」, 학생 화면 「기타」.
 */
export function groupBooksBySubject<T extends { subjectCode: string | null }>(
  items: readonly T[],
  unassignedLabel = "미분류",
): BookSubjectGroup<T>[] {
  const by = new Map<string | null, T[]>();
  for (const it of items) {
    const key = isLmsSubjectCode(it.subjectCode) ? it.subjectCode : null;
    const arr = by.get(key) ?? [];
    arr.push(it);
    by.set(key, arr);
  }
  const out: BookSubjectGroup<T>[] = [];
  for (const o of LMS_SUBJECT_OPTIONS) {
    const arr = by.get(o.value);
    if (arr?.length)
      out.push({ subjectCode: o.value, label: o.label, items: arr });
  }
  const rest = by.get(null);
  if (rest?.length)
    out.push({ subjectCode: null, label: unassignedLabel, items: rest });
  return out;
}

/** 카드·행에 붙이는 과목명. 미지정이면 null(표시 생략). */
export function bookSubjectLabel(code: string | null): string | null {
  return lmsSubjectLabel(code);
}
