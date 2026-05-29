// feat-7-033 콘텐츠 헬스 통합 점수 — 5법 한 줄 매트릭스.
// RPC `admin_law_health_matrix` 가 8지표 ratio + 종합 점수(0~100) 반환.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import {
  type LawHealthMetric,
  LAW_HEALTH_METRIC_KEYS,
} from "~/features/admin/lib/law-health";
import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";

export interface LawHealthRow {
  lawCode: LawSubjectSlug;
  displayLabel: string;
  totalArticles: number;
  totalCases: number;
  totalMcq: number;
  ratios: Record<LawHealthMetric, number>;
  healthScore: number;
  /** 가장 낮은 비율의 지표 — 자동 추천. */
  weakestMetric: LawHealthMetric;
}

function pickWeakest(ratios: Record<LawHealthMetric, number>): LawHealthMetric {
  let weakest: LawHealthMetric = LAW_HEALTH_METRIC_KEYS[0];
  let min = Infinity;
  for (const k of LAW_HEALTH_METRIC_KEYS) {
    if (ratios[k] < min) {
      min = ratios[k];
      weakest = k;
    }
  }
  return weakest;
}

export async function getLawHealthMatrix(
  client: SupabaseClient<Database>,
): Promise<LawHealthRow[]> {
  const { data, error } = await client.rpc("admin_law_health_matrix");
  if (error) throw error;
  return (data ?? []).map((r) => {
    const ratios: Record<LawHealthMetric, number> = {
      articles_body_ratio: Number(r.articles_body_ratio),
      articles_blank_ratio: Number(r.articles_blank_ratio),
      articles_systematic_ratio: Number(r.articles_systematic_ratio),
      articles_comment_ratio: Number(r.articles_comment_ratio),
      cases_linked_ratio: Number(r.cases_linked_ratio),
      cases_summary_ratio: Number(r.cases_summary_ratio),
      mcq_explanation_ratio: Number(r.mcq_explanation_ratio),
      problems_per_article_ratio: Number(r.problems_per_article_ratio),
    };
    return {
      lawCode: r.law_code as LawSubjectSlug,
      displayLabel: r.display_label,
      totalArticles: Number(r.total_articles),
      totalCases: Number(r.total_cases),
      totalMcq: Number(r.total_mcq),
      ratios,
      healthScore: Number(r.health_score),
      weakestMetric: pickWeakest(ratios),
    };
  });
}
