import type { Database } from "database.types";

export type AaRelationType = Database["public"]["Enums"]["aa_relation_type"];
export type AcRelationType = Database["public"]["Enums"]["ac_relation_type"];

export const AA_RELATION_LABEL: Record<AaRelationType, string> = {
  cross_reference: "상호 인용",
  parent_child: "일반·특수",
  precondition: "선결",
  exception: "예외",
};

export const AC_RELATION_LABEL: Record<AcRelationType, string> = {
  directly_interprets: "직접 해석",
  cites: "인용",
  similar_to: "유사",
  contrary_to: "반대",
};

export interface RelatedCase {
  caseId: string;
  caseNumber: string;
  caseTitle: string;
  summaryTitle: string | null;
  decidedAt: string;
  importance: number;
  relationType: AcRelationType;
  note: string | null;
}

export interface RelatedArticle {
  articleId: string;
  articleNumber: string | null;
  displayLabel: string;
  importance: number;
  relationType: AaRelationType | AcRelationType;
  note: string | null;
}
