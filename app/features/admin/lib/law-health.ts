// feat-7-033 콘텐츠 헬스 점수 — 클라이언트/서버 공용 상수.

export type LawHealthMetric =
  | "articles_body_ratio"
  | "articles_blank_ratio"
  | "articles_systematic_ratio"
  | "articles_comment_ratio"
  | "cases_linked_ratio"
  | "cases_summary_ratio"
  | "mcq_explanation_ratio"
  | "problems_per_article_ratio";

export const LAW_HEALTH_METRIC_LABEL: Record<LawHealthMetric, string> = {
  articles_body_ratio: "조문 본문",
  articles_blank_ratio: "빈칸",
  articles_systematic_ratio: "체계도",
  articles_comment_ratio: "강사메모",
  cases_linked_ratio: "판례 매핑",
  cases_summary_ratio: "판례 요지",
  mcq_explanation_ratio: "객관식 해설",
  problems_per_article_ratio: "조문당 문제",
};

export const LAW_HEALTH_METRIC_KEYS: LawHealthMetric[] = [
  "articles_body_ratio",
  "articles_blank_ratio",
  "articles_systematic_ratio",
  "articles_comment_ratio",
  "cases_linked_ratio",
  "cases_summary_ratio",
  "mcq_explanation_ratio",
  "problems_per_article_ratio",
];
