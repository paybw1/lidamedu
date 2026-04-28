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

export const SUBJECT_TAB_VALUES = ["articles", "cases", "problems"] as const;

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
    description: "발명의 보호와 이용을 통한 기술발전과 산업발전에 이바지",
  },
  trademark: {
    slug: "trademark",
    name: "상표법",
    shortName: "상표",
    category: "industrial",
    categoryLabel: "산업재산권법",
    exam: "both",
    description: "상표 사용자의 업무상 신용유지와 수요자의 이익 보호",
  },
  design: {
    slug: "design",
    name: "디자인보호법",
    shortName: "디자인",
    category: "industrial",
    categoryLabel: "산업재산권법",
    exam: "first",
    description: "디자인의 보호와 이용을 통한 디자인 창작 장려",
  },
  civil: {
    slug: "civil",
    name: "민법",
    shortName: "민법",
    category: "civil",
    categoryLabel: "민법",
    exam: "first",
    description: "재산법·신분법 일반의 법률관계",
  },
  "civil-procedure": {
    slug: "civil-procedure",
    name: "민사소송법",
    shortName: "민소",
    category: "civil-procedure",
    categoryLabel: "민사소송법",
    exam: "second",
    description: "민사 권리구제를 위한 소송절차",
  },
};

export const EXAM_LABEL: Record<ExamLevel, string> = {
  first: "1차",
  second: "2차",
  both: "1·2차",
};
