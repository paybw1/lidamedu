// Q&A 공용 타입/라벨/zod 스키마.
import type { Database } from "database.types";
import { z } from "zod";

export type QnaTargetType = Database["public"]["Enums"]["qna_target_type"];
export type QnaStatus = Database["public"]["Enums"]["qna_status"];
export type QnaQualityGrade = Database["public"]["Enums"]["qna_quality_grade"];

export const QNA_TARGET_TYPES: QnaTargetType[] = [
  "article",
  "node",
  "case",
  "problem",
  "study_method",
];
export const QNA_STATUSES: QnaStatus[] = ["open", "answered", "closed"];
// 질문 수준 5점 척도 — 5(매우 높음)~1(매우 낮음). 기존 3단계(high/mid/low) 데이터는
// 각각 4/3/2 로 재해석 표시.
export const QNA_QUALITY_GRADES: QnaQualityGrade[] = [
  "very_high",
  "high",
  "mid",
  "low",
  "very_low",
];

export const qnaTargetTypeSchema = z.enum([
  "article",
  "node",
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
export const qnaQualityGradeSchema = z.enum([
  "very_high",
  "high",
  "mid",
  "low",
  "very_low",
]);

export const QNA_TARGET_LABEL: Record<QnaTargetType, string> = {
  article: "조문",
  node: "쟁점",
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
  very_high: "5 (매우 높음)",
  high: "4 (높음)",
  mid: "3 (보통)",
  low: "2 (낮음)",
  very_low: "1 (매우 낮음)",
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
  /** 단원(체계도 노드) 앵커 — 대상 crumb 의 쟁점 표기에 사용. */
  nodeId: string | null;
  /** 질문 고유번호 — Q-{n} 표기. 전역 시퀀스 불변. */
  displayNo: number;
}

export interface QnaThreadDetail extends QnaThreadSummary {
  questionMd: string;
  answerMd: string | null;
}

export type QnaMessageRole = Database["public"]["Enums"]["qna_message_role"];

/** 강사의 AI 답변 정오 평가 — 시험 대비라 binary(정확/부정확). null=미평가. */
export type QnaVerdict = "correct" | "incorrect";
export const QNA_VERDICT_LABEL: Record<QnaVerdict, string> = {
  correct: "정확",
  incorrect: "부정확",
};

/** AI 답변 출처칩 — 렌더용 최소 형태(클라이언트 안전). */
export interface QnaCitation {
  label: number;
  sourceType: string;
  sourceId: string;
  headingPath: string;
}

/** 출처 → 뷰어 href 매핑(loader 가 citation-links.server 로 해소). */
export type CitationHrefMap = Record<string, string>;

export function citationKey(
  c: Pick<QnaCitation, "sourceType" | "sourceId">,
): string {
  return `${c.sourceType}:${c.sourceId}`;
}

// ── 응답 SLA(운영 대시보드) ─────────────────────────────────────────────
// "강사 응답" = 정식 답변(answered_at) · AI 답변 '정확' 확인 · 강사 메시지 중
// 가장 빠른 것. AI 즉답만으로는 SLA 미충족(강사 확인이 목표).
/** 목표 응답 시간(시간). 이내 응답 = SLA 준수. */
export const QNA_SLA_TARGET_HOURS = 24;
/** 위반 경보 기준(시간). 초과 대기 = 즉시 조치 대상. */
export const QNA_SLA_BREACH_HOURS = 48;

export interface QnaSlaPendingItem {
  threadId: string;
  title: string;
  subject: string | null;
  targetType: QnaTargetType;
  status: QnaStatus;
  askerId: string | null;
  askerName: string | null;
  createdAt: string;
  /** 질문 등록 후 경과 시간. */
  ageHours: number;
}

export interface QnaSlaWeekStat {
  /** 주 시작일(월요일, KST, YYYY-MM-DD). */
  weekStart: string;
  asked: number;
  responded: number;
  medianHours: number | null;
  /** 목표 시간 내 응답 건수. */
  withinTarget: number;
}

export interface QnaSlaAnswererStat {
  profileId: string;
  name: string | null;
  responded: number;
  medianHours: number | null;
}

export interface QnaSlaDashboard {
  pending: QnaSlaPendingItem[];
  pendingCounts: { total: number; overTarget: number; overBreach: number };
  /** 최근 30일(질문 등록 기준) 지표. */
  window30: {
    asked: number;
    responded: number;
    responseRatePct: number | null;
    medianHours: number | null;
    avgHours: number | null;
    /** 목표 시간 내 응답 비율 — 분모는 응답됐거나 목표 시간을 넘긴 질문. */
    withinTargetPct: number | null;
  };
  /** 최근 8주(오래된 주부터). */
  weekly: QnaSlaWeekStat[];
  /** 최근 30일 응답자별 현황(응답 수 내림차순). */
  answerers: QnaSlaAnswererStat[];
}

/** 스레드 타임라인 메시지(질문 후속 / AI 즉답 / 강사). */
export interface QnaMessage {
  messageId: string;
  threadId: string;
  role: QnaMessageRole;
  authorId: string | null;
  authorName: string | null;
  bodyMd: string;
  citations: QnaCitation[];
  /** 강사가 ✓확인/정정한 대상 AI 메시지(있으면). */
  verifiesMessageId: string | null;
  /** 강사 정오 평가(AI 메시지 한정). null=미평가. */
  verdict: QnaVerdict | null;
  verifiedByName: string | null;
  verifiedAt: string | null;
  feedback: number | null;
  createdAt: string;
}
