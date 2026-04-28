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
  isEnBanc: boolean;
  importance: number;
  summaryTitle: string | null;
  subjectLaws: string[];
}

export interface CaseDetail extends CaseListItem {
  summaryBodyMd: string | null;
  reasoningMd: string | null;
  fullTextPdf: string | null;
  commentSource: string | null;
  commentBodyMd: string | null;
}
