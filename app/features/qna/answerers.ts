// Q&A 과목별 답변자 지정 — 카테고리 SSOT (클라이언트 안전).
// 새 질문이 어떤 카테고리로 라우팅되는지, 운영관리 화면 행 구성의 기준.
import { z } from "zod";

// 답변자 배정 카테고리 10종 — 법 5과목 + 자연과학 4분과 + 공부방법.
//   (과학 분과 키는 problems.science_subject enum 값과 동일.)
export const QNA_ANSWERER_CATEGORIES = [
  "patent",
  "trademark",
  "design",
  "civil",
  "civil-procedure",
  "physics",
  "chemistry",
  "biology",
  "earth_science",
  "study_method",
] as const;

export type QnaAnswererCategory = (typeof QNA_ANSWERER_CATEGORIES)[number];

export const qnaAnswererCategorySchema = z.enum(QNA_ANSWERER_CATEGORIES);

export const QNA_ANSWERER_CATEGORY_LABEL: Record<QnaAnswererCategory, string> = {
  patent: "특허법",
  trademark: "상표법",
  design: "디자인보호법",
  civil: "민법",
  "civil-procedure": "민사소송법",
  physics: "물리",
  chemistry: "화학",
  biology: "생물",
  earth_science: "지구과학",
  study_method: "공부방법",
};

// 운영관리 화면 그룹핑 — 법과목 / 자연과학 / 기타.
export const QNA_ANSWERER_CATEGORY_GROUPS: ReadonlyArray<{
  label: string;
  categories: readonly QnaAnswererCategory[];
}> = [
  {
    label: "법 과목",
    categories: ["patent", "trademark", "design", "civil", "civil-procedure"],
  },
  {
    label: "자연과학",
    categories: ["physics", "chemistry", "biology", "earth_science"],
  },
  { label: "기타", categories: ["study_method"] },
];

export function isQnaAnswererCategory(v: string): v is QnaAnswererCategory {
  return (QNA_ANSWERER_CATEGORIES as readonly string[]).includes(v);
}
