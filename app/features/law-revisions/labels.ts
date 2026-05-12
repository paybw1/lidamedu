// 클라이언트·서버 공용 타입.

export type LawRevisionStatus = "draft" | "review" | "published";

export const LAW_REVISION_STATUS_LABELS: Record<LawRevisionStatus, string> = {
  draft: "초안",
  review: "검토",
  published: "발행",
};

export type ArticleChangeKind = "created" | "amended" | "deleted";

export const CHANGE_KIND_LABELS: Record<ArticleChangeKind, string> = {
  created: "신설",
  amended: "개정",
  deleted: "폐지",
};

export type LawRevisionKind = "act" | "decree" | "rule";

export const LAW_REVISION_KIND_LABELS: Record<LawRevisionKind, string> = {
  act: "법률",
  decree: "시행령",
  rule: "시행규칙",
};

export interface LawRevisionListItem {
  lawRevisionId: string;
  lawId: string;
  lawCode: string;
  lawName: string;
  revisionNumber: string;
  revisionKind: LawRevisionKind;
  status: LawRevisionStatus;
  promulgatedAt: string | null;
  effectiveDate: string | null;
  publishedAt: string | null;
  reasonMd: string | null;
  comparisonPdf: string | null;
  explanationPdf: string | null;
  videoUrl: string | null;
  articleCount: number;
  createdAt: string;
}

export interface RevisionArticleEntry {
  revisionId: string;
  articleId: string;
  articleNumber: string | null;
  displayLabel: string;
  bodyJson: unknown;
  changeKind: ArticleChangeKind;
  // 현재 시행 중인 본문 (비교 용).
  currentBodyJson: unknown;
  currentRevisionId: string | null;
}
