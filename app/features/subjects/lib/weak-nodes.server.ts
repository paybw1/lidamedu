// 약점 체계도 노드 추출 — 모든 법률 과목을 훑어 가장 정답률 낮은 노드 top N.
// 대시보드 위젯에서 사용. 노드 단위 (systematic_node) 직속 article 만으로 점수 계산
// (subtree 합산은 추후 — 노이즈 줄이려면 leaf 노드 우선).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import {
  getSystematicSkeleton,
  type SystematicNode,
} from "~/features/laws/queries.server";

import { buildNodeProgressByArticle } from "./node-progress.server";
import type { LawSubjectSlug } from "./subjects";

export interface WeakNodeItem {
  lawCode: LawSubjectSlug;
  nodeId: string;
  displayLabel: string;
  articleCount: number;
  problemAttempts: number;
  problemCorrect: number;
  accuracyPct: number; // 0~100
  weaknessScore: number; // 정렬키 — 정답률 낮을수록 + 시도 많을수록 ↑
}

const MIN_ATTEMPTS_FOR_RANKING = 5; // 시도 표본 부족 노드는 제외.

interface SubjectAggregate {
  lawCode: LawSubjectSlug;
  systematicNodes: SystematicNode[];
  articleIds: string[];
}

export async function getWeakNodes(
  client: SupabaseClient<Database>,
  userId: string,
  lawCodes: LawSubjectSlug[],
  limit = 5,
): Promise<WeakNodeItem[]> {
  // 1. 과목별 systematic 노드 + article ids.
  const perSubject: SubjectAggregate[] = [];
  for (const lawCode of lawCodes) {
    const systematicNodes = await getSystematicSkeleton(client, lawCode);
    const articleIds = new Set<string>();
    for (const n of systematicNodes) {
      for (const a of n.articles) articleIds.add(a.articleId);
    }
    perSubject.push({
      lawCode,
      systematicNodes,
      articleIds: [...articleIds],
    });
  }
  const allArticleIds = [...new Set(perSubject.flatMap((s) => s.articleIds))];
  if (allArticleIds.length === 0) return [];

  // 2. 본인 통합 진척도.
  const byArticle = await buildNodeProgressByArticle(
    client,
    userId,
    allArticleIds,
  );

  // 3. 노드별 직속 article 합산 → 약점 점수.
  const candidates: WeakNodeItem[] = [];
  for (const s of perSubject) {
    for (const n of s.systematicNodes) {
      let attempts = 0;
      let correct = 0;
      for (const a of n.articles) {
        const u = byArticle[a.articleId];
        if (!u) continue;
        attempts += u.problemAttempts;
        correct += u.problemCorrect;
      }
      if (attempts < MIN_ATTEMPTS_FOR_RANKING) continue;
      const accuracyPct = Math.round((correct / attempts) * 100);
      // 약점 점수: (100 - 정답률) × log(시도+1) — 정답률 낮고 시도 많을수록 ↑.
      const weaknessScore = (100 - accuracyPct) * Math.log10(attempts + 1);
      candidates.push({
        lawCode: s.lawCode,
        nodeId: n.nodeId,
        displayLabel: n.displayLabel,
        articleCount: n.articles.length,
        problemAttempts: attempts,
        problemCorrect: correct,
        accuracyPct,
        weaknessScore,
      });
    }
  }
  candidates.sort((a, b) => b.weaknessScore - a.weaknessScore);
  return candidates.slice(0, limit);
}
