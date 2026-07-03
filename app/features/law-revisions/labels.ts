// 클라이언트·서버 공용 타입.

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
  promulgatedAt: string | null;
  effectiveDate: string | null;
  reasonMd: string | null;
  comparisonPdf: string | null;
  explanationPdf: string | null;
  videoUrl: string | null;
  articleCount: number;
  createdAt: string;
  /**
   * 내부 정정 스냅샷 여부 — 조문 오탈자·라벨 정정이 개정 흐름(불변 원칙)으로 저장된
   * 시스템 생성분(quick-/fix-/조문정리 패턴). 실제 법 개정이 아니므로 개정 목록과
   * 분리해 표시하고, 현재 조문 본문 스냅샷을 보유할 수 있어 삭제 금지.
   */
  isMaintenance: boolean;
}

// 내부 정정 스냅샷 판별 — 학습정보 목록 필터(laws/queries.server.ts)와 동일 패턴 SSOT.
export function isMaintenanceRevisionNumber(revisionNumber: string): boolean {
  return (
    revisionNumber.startsWith("quick-") ||
    revisionNumber.startsWith("fix-") ||
    revisionNumber.includes("조문정리")
  );
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
  // 트리 path (ltree 문자열, 예: "patent.ch02.a30"). 장/절 그룹화에 사용.
  path: string | null;
}
