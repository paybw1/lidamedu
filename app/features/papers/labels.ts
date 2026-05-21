// 클라이언트·서버 공용 타입. queries.server.ts 와 분리해 클라이언트 번들에 import 가능.
import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";

export interface PaperListItem {
  paperId: string;
  title: string;
  authors: string | null;
  source: string | null;
  publishedAt: string | null;
  abstract: string | null;
  url: string | null;
  pdfUrl: string | null;
  /** feat-3-504 — Supabase Storage `papers` 버킷 내 경로. signed URL 발급 대상. */
  pdfPath: string | null;
  subjectLaws: LawSubjectSlug[];
  importance: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

// 카드에 함께 표시할 관련 chip.
export interface PaperRelatedArticleChip {
  articleId: string;
  articleNumber: string | null;
  displayLabel: string;
  lawCode: LawSubjectSlug;
}

export interface PaperRelatedCaseChip {
  caseId: string;
  caseNumber: string;
  summaryTitle: string | null;
  caseTitle: string;
  primarySubject: LawSubjectSlug | null;
}

export interface PaperWithLinks extends PaperListItem {
  articles: PaperRelatedArticleChip[];
  cases: PaperRelatedCaseChip[];
}
