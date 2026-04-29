// Q&A 대상(article/case/problem) 단위로 표시용 라벨 + 진입 URL 을 만들어주는 헬퍼.
// 실패해도 Q&A 동작은 영향 없도록 null 반환.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import type { QnaTargetType } from "../labels";

export interface TargetDisplay {
  label: string;
  href: string | null;
}

export async function resolveTargetDisplay(
  client: SupabaseClient<Database>,
  targetType: QnaTargetType,
  targetId: string,
): Promise<TargetDisplay | null> {
  if (targetType === "article") {
    const { data, error } = await client
      .from("articles")
      .select(
        "article_number, display_label, laws ( law_code, short_label )",
      )
      .eq("article_id", targetId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error || !data || !data.laws) return null;
    return {
      label: `${data.laws.short_label} ${data.display_label}`,
      href: data.article_number
        ? `/subjects/${data.laws.law_code}/articles/${data.article_number}`
        : null,
    };
  }

  // v1: case / problem 은 라벨만 표시 (deep link 미구현). v2 에서 보강.
  if (targetType === "case") {
    return { label: "판례", href: null };
  }
  if (targetType === "problem") {
    return { label: "문제", href: null };
  }
  return null;
}
