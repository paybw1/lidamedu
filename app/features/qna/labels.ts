// Q&A 공용 타입/라벨/zod 스키마.
import type { Database } from "database.types";
import { z } from "zod";

export type QnaTargetType = Database["public"]["Enums"]["qna_target_type"];
export type QnaStatus = Database["public"]["Enums"]["qna_status"];
export type QnaQualityGrade = Database["public"]["Enums"]["qna_quality_grade"];

export const QNA_TARGET_TYPES: QnaTargetType[] = ["article", "case", "problem"];
export const QNA_STATUSES: QnaStatus[] = ["open", "answered", "closed"];
export const QNA_QUALITY_GRADES: QnaQualityGrade[] = ["high", "mid", "low"];

export const qnaTargetTypeSchema = z.enum(["article", "case", "problem"]);
export const qnaStatusSchema = z.enum(["open", "answered", "closed"]);
export const qnaQualityGradeSchema = z.enum(["high", "mid", "low"]);

export const QNA_TARGET_LABEL: Record<QnaTargetType, string> = {
  article: "조문",
  case: "판례",
  problem: "문제",
};

export const QNA_STATUS_LABEL: Record<QnaStatus, string> = {
  open: "답변 대기",
  answered: "답변 완료",
  closed: "종료",
};

export const QNA_QUALITY_LABEL: Record<QnaQualityGrade, string> = {
  high: "상",
  mid: "중",
  low: "하",
};

export interface QnaThreadSummary {
  threadId: string;
  targetType: QnaTargetType;
  targetId: string;
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
