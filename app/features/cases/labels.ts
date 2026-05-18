// 클라이언트·서버 공용 라벨/타입. queries.server.ts 와 분리해 클라이언트 번들에 import 가능.
import type { Database } from "database.types";

import type { ExamProblemRef } from "~/features/problems/labels";

export type CaseCourt = Database["public"]["Enums"]["case_court"];

export const COURT_LABELS: Record<CaseCourt, string> = {
  supreme: "대법원",
  patent_court: "특허법원",
  high_court: "고등법원",
  district_court: "지방법원",
};

export interface CaseListItem {
  caseId: string;
  court: CaseCourt;
  decidedAt: string;
  caseNumber: string;
  caseTitle: string;
  // 판례 닉네임 — 중요 판례의 통칭(예: 수지상 세포 사건). 선택. 사건명 앞에 표시.
  nickname: string | null;
  caseType: string | null;
  isEnBanc: boolean;
  importance: number;
  summaryTitle: string | null;
  // 복수 요지(summary_items)의 [1] 제목 — list 화면 사건명 컬럼에서 우선 표시.
  // summary_items 가 비었으면 null. legacy summary_title 보다 우선.
  summaryFirstTitle: string | null;
  subjectLaws: string[];
  // feat-8-024: 이 판례가 출제된 1차 객관식 기출문제 — 목록에서 ExamProblemChip 으로 표시.
  exam1stProblems: ExamProblemRef[];
  exam2ndYears: number[];
}

export interface SummaryItem {
  title: string;
  body: string;
}

export interface CaseDetail extends CaseListItem {
  summaryBodyMd: string | null;
  summaryItems: SummaryItem[];
  reasoningMd: string | null;
  fullTextPdf: string | null;
  commentSource: string | null;
  commentBodyMd: string | null;
}

// feat-4-A-214 관련논문/기사 링크.
export type CaseReferenceKind = "paper" | "article" | "other";

export interface CaseReference {
  referenceId: string;
  caseId: string;
  kind: CaseReferenceKind;
  title: string;
  authors: string | null;
  source: string | null;
  publishedAt: string | null; // YYYY-MM-DD
  url: string | null;
  pdfUrl: string | null;
  note: string | null;
  ord: number;
  createdAt: string;
  updatedAt: string;
}
