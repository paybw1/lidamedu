import { z } from "zod";

export const LAW_SUBJECT_SLUGS = [
  "patent",
  "trademark",
  "design",
  "civil",
  "civil-procedure",
] as const;

export type LawSubjectSlug = (typeof LAW_SUBJECT_SLUGS)[number];

export const lawSubjectSlugSchema = z.enum(LAW_SUBJECT_SLUGS);

// problems=객관식(1차) / subjective=주관식(2차) — 2차 과목(특·상·디·민소)만 주관식 탭 노출.
export const SUBJECT_TAB_VALUES = [
  "articles",
  "cases",
  "problems",
  "subjective",
] as const;

export type SubjectTab = (typeof SUBJECT_TAB_VALUES)[number];

export const subjectTabSchema = z.enum(SUBJECT_TAB_VALUES);

export const DEFAULT_SUBJECT_TAB: SubjectTab = "articles";

export type LawCategory = "industrial" | "civil" | "civil-procedure";

export type ExamLevel = "first" | "second" | "both";

export interface LawSubjectMeta {
  slug: LawSubjectSlug;
  name: string;
  shortName: string;
  category: LawCategory;
  categoryLabel: string;
  exam: ExamLevel;
  description: string;
}

export const LAW_SUBJECTS: Record<LawSubjectSlug, LawSubjectMeta> = {
  patent: {
    slug: "patent",
    name: "특허법",
    shortName: "특허",
    category: "industrial",
    categoryLabel: "산업재산권법",
    exam: "both",
    description: "",
  },
  trademark: {
    slug: "trademark",
    name: "상표법",
    shortName: "상표",
    category: "industrial",
    categoryLabel: "산업재산권법",
    exam: "both",
    description: "",
  },
  design: {
    slug: "design",
    name: "디자인보호법",
    shortName: "디자인",
    category: "industrial",
    categoryLabel: "산업재산권법",
    exam: "both",
    description: "",
  },
  civil: {
    slug: "civil",
    name: "민법",
    shortName: "민법",
    category: "civil",
    categoryLabel: "민법",
    exam: "first",
    description: "",
  },
  "civil-procedure": {
    slug: "civil-procedure",
    name: "민사소송법",
    shortName: "민소",
    category: "civil-procedure",
    categoryLabel: "민사소송법",
    exam: "second",
    description: "",
  },
};

export const EXAM_LABEL: Record<ExamLevel, string> = {
  first: "1차",
  second: "2차",
  both: "1·2차",
};

// =========================================================================
// 시험 차수별 법 과목 그룹 — 1차(객관식) / 2차(주관식).
// 1차/2차는 과목을 묶어 보여주는 기준 축이다. 민법은 1차 전용, 민사소송법은
// 2차 전용, 산업재산권법(특허·상표·디자인)은 1·2차 공통이라 양쪽에 포함된다.
// =========================================================================

/** 1차(객관식) 법 과목 — 산업재산권법 3법 + 민법. */
export const FIRST_EXAM_LAW_SLUGS = [
  "patent",
  "trademark",
  "design",
  "civil",
] as const satisfies readonly LawSubjectSlug[];

/**
 * 체계도(systematic) 축이 조문 목차와 별개로 의미 있는 과목만 true.
 * 민법은 체계도 = 조문 목차(단원)와 사실상 동일해 축 구분이 무의미 → 좌패널 목차를
 * 조문 축으로 고정하고 체계도 토글을 비활성화한다.
 */
export function subjectHasSystematicAxis(slug: string): boolean {
  return slug !== "civil";
}

/** 2차(주관식) 법 과목 — 산업재산권법 3법 + 민사소송법. */
export const SECOND_EXAM_LAW_SLUGS = [
  "patent",
  "trademark",
  "design",
  "civil-procedure",
] as const satisfies readonly LawSubjectSlug[];

/** 판례를 "주제(topic)" 축으로도 분류하는 과목 — 판례 탭에 주제 토글 노출.
 *  상표(주제1~46 배치 완료) · 디자인(주제 토글만 우선, 판례 적재 시 채움). */
export const CASE_TOPIC_SUBJECTS = [
  "trademark",
  "design",
] as const satisfies readonly LawSubjectSlug[];

export function subjectUsesCaseTopics(slug: string): boolean {
  return (CASE_TOPIC_SUBJECTS as readonly string[]).includes(slug);
}

/** 1차 시험 과목인가 — 민법·산업재산권법. (exam 이 "second" 가 아님) */
export function isFirstExamSubject(slug: string): boolean {
  const meta = LAW_SUBJECTS[slug as LawSubjectSlug];
  return meta !== undefined && meta.exam !== "second";
}

/** 2차 시험 과목인가 — 민사소송법·산업재산권법. (exam 이 "first" 가 아님) */
export function isSecondExamSubject(slug: string): boolean {
  const meta = LAW_SUBJECTS[slug as LawSubjectSlug];
  return meta !== undefined && meta.exam !== "first";
}
