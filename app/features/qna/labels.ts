// Q&A 공용 타입/라벨/zod 스키마.
import type { Database } from "database.types";
import { z } from "zod";

export type QnaTargetType = Database["public"]["Enums"]["qna_target_type"];
export type QnaStatus = Database["public"]["Enums"]["qna_status"];
export type QnaQualityGrade = Database["public"]["Enums"]["qna_quality_grade"];

export const QNA_TARGET_TYPES: QnaTargetType[] = [
  "article",
  "case",
  "problem",
  "study_method",
];
export const QNA_STATUSES: QnaStatus[] = ["open", "answered", "closed"];
export const QNA_QUALITY_GRADES: QnaQualityGrade[] = ["high", "mid", "low"];

export const qnaTargetTypeSchema = z.enum([
  "article",
  "case",
  "problem",
  "study_method",
]);

// 과목 분류 — study_method 는 필수(작성자 선택), 콘텐츠 Q&A 는 대상에서 도출.
export const QNA_SUBJECTS = [
  "patent",
  "trademark",
  "design",
  "civil",
  "civil-procedure",
  "science",
  "general",
] as const;
export type QnaSubject = (typeof QNA_SUBJECTS)[number];
export const qnaSubjectSchema = z.enum(QNA_SUBJECTS);
export const QNA_SUBJECT_LABEL: Record<QnaSubject, string> = {
  patent: "특허법",
  trademark: "상표법",
  design: "디자인보호법",
  civil: "민법",
  "civil-procedure": "민사소송법",
  science: "자연과학",
  general: "공통",
};
export function subjectLabel(subject: string | null): string | null {
  if (!subject) return null;
  return QNA_SUBJECT_LABEL[subject as QnaSubject] ?? subject;
}
export const qnaStatusSchema = z.enum(["open", "answered", "closed"]);
export const qnaQualityGradeSchema = z.enum(["high", "mid", "low"]);

export const QNA_TARGET_LABEL: Record<QnaTargetType, string> = {
  article: "조문",
  case: "판례",
  problem: "문제",
  study_method: "공부방법",
  general: "일반",
};

export const QNA_STATUS_LABEL: Record<QnaStatus, string> = {
  open: "답변 대기",
  answered: "답변 완료",
  closed: "종료",
  ai_answered: "AI 답변",
  verified: "강사 확인",
};

export const QNA_QUALITY_LABEL: Record<QnaQualityGrade, string> = {
  high: "상",
  mid: "중",
  low: "하",
};

export interface QnaThreadSummary {
  threadId: string;
  targetType: QnaTargetType;
  /** study_method 는 콘텐츠 앵커가 없어 null. */
  targetId: string | null;
  /** 과목 분류(law_code 류). null = 미분류. */
  subject: string | null;
  askerId: string;
  askerName: string | null;
  answererId: string | null;
  answererName: string | null;
  title: string;
  status: QnaStatus;
  qualityGrade: QnaQualityGrade | null;
  createdAt: string;
  answeredAt: string | null;
  updatedAt: string;
}

export interface QnaThreadDetail extends QnaThreadSummary {
  questionMd: string;
  answerMd: string | null;
}
