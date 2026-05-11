// 클라이언트·서버 공용 라벨/타입. queries.server.ts 와 분리해 클라이언트 번들에 import 가능.
import type { Database } from "database.types";

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
  caseType: string | null;
  isEnBanc: boolean;
  importance: number;
  summaryTitle: string | null;
  subjectLaws: string[];
  exam1stYears: number[];
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
