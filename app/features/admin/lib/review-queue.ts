// feat-14-N1-b — 통합 검수 큐의 **클라이언트 안전** 타입·상수.
//
// ★쿼리(`review-queue.server.ts`)와 나눠 둔다 — 화면이 `.server` 모듈에서 **값**을
//   import 하면 typecheck 는 통과해도 빌드가 깨진다(클라 번들에 서버 모듈이 딸려온다).
//   프로젝트의 `labels.ts` 패턴과 같은 이유다.

/** 큐 탭 = 검수 대상 종류. `content_audit_findings.entity_type` 과 같은 값. */
export const REVIEW_KINDS = [
  "problem",
  "case_diagram",
  "case_training_item",
  "case_training_issue",
] as const;

export type ReviewKind = (typeof REVIEW_KINDS)[number];

export const REVIEW_KIND_LABEL: Record<ReviewKind, string> = {
  problem: "문제",
  case_diagram: "판례 도식",
  case_training_item: "2차 훈련 항목",
  case_training_issue: "2차 훈련 논점",
};

export interface AuditBadge {
  ruleKey: string;
  severity: "fail" | "warn" | "info";
  message: string;
}

export interface ReviewRow {
  kind: ReviewKind;
  /** 승인 요청에 실을 식별자(문제=problemId, 도식=diagramId …). */
  id: string;
  /** 화면 제목 한 줄. */
  title: string;
  /** 부제 — 사건번호·연도 등 판정에 필요한 최소 맥락. */
  subtitle: string;
  /** 본문 미리보기(판정에 쓸 만큼만). */
  preview: string;
  /** 깊게 볼 때 가는 기존 편집 화면. */
  editHref: string;
  /** 승인/반려 POST 대상 — 종류별 **기존** 엔드포인트. */
  actionPath: string;
  /** 폼에 실을 식별자 필드 이름(problemId/itemId/issueId). 도식은 경로에 있어 null. */
  idField: string | null;
  createdAt: string | null;
  audits: AuditBadge[];
}

export interface ReviewQueue {
  counts: Record<ReviewKind, number>;
  rows: ReviewRow[];
}

export function parseReviewKind(raw: string | null): ReviewKind {
  return (REVIEW_KINDS as readonly string[]).includes(raw ?? "")
    ? (raw as ReviewKind)
    : "case_diagram";
}
