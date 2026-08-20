// feat-2-011 빈칸 SRS — 서버 측 hook + 조회 (set 단위 집계).
// per-blank 추적 + display 는 set 으로 집계.

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPages } from "~/core/lib/supa-batch.server";
import type { Database } from "database.types";

import {
  type SrsState,
  computeNextSrsState,
  reviewDueCutoffIso,
  reviewDueCutoffMs,
} from "~/features/study/lib/srs";
import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";

import { parseBlanks } from "./queries.server";

/**
 * 빈칸 attempt 후 SRS 상태 upsert.
 * 호출처 = blanks/api/attempt.tsx insert 직후. best-effort.
 */
export async function applyBlankSrsUpdate(
  client: SupabaseClient<Database>,
  userId: string,
  setId: string,
  blankIdx: number,
  isCorrect: boolean,
): Promise<void> {
  try {
    const { data: prev } = await client
      .from("user_blank_srs")
      .select("interval_days, ease, reps, lapses")
      .eq("user_id", userId)
      .eq("set_id", setId)
      .eq("blank_idx", blankIdx)
      .maybeSingle();

    const prevState: SrsState | null = prev
      ? {
          intervalDays: prev.interval_days,
          ease: Number(prev.ease),
          reps: prev.reps,
          lapses: prev.lapses,
        }
      : null;

    const next = computeNextSrsState({ prev: prevState, isCorrect });
    const now = new Date().toISOString();

    await client.from("user_blank_srs").upsert(
      {
        user_id: userId,
        set_id: setId,
        blank_idx: blankIdx,
        next_due_at: next.nextDueAt.toISOString(),
        interval_days: next.intervalDays,
        ease: next.ease,
        last_quality: next.lastQuality,
        last_reviewed_at: now,
        lapses: next.lapses,
        reps: next.reps,
        updated_at: now,
      },
      { onConflict: "user_id,set_id,blank_idx" },
    );
  } catch (err) {
    console.error("[blank-srs] applyBlankSrsUpdate failed:", err);
  }
}

export interface DueBlankSetItem {
  setId: string;
  articleNumber: string;
  displayLabel: string;
  lawCode: LawSubjectSlug;
  dueBlankCount: number;
  totalBlankSrsCount: number; // 해당 set 에서 본인이 시도한 SRS 항목 총수
  earliestDueAt: string;
  /** 음수 = overdue days. */
  daysUntilDue: number;
}

/**
 * 본인 빈칸 SRS due 항목 set 단위 집계.
 * 같은 set 안의 blank 들이 여러 개 due 면 1행으로 합산 (가장 오래된 due 우선).
 */
export async function getDueBlankSets(
  client: SupabaseClient<Database>,
  userId: string,
  limit = 50,
): Promise<DueBlankSetItem[]> {
  const cutoffIso = reviewDueCutoffIso();
  // due rows fetch — set 별 그룹핑은 클라이언트.
  const { data, error } = await client
    .from("user_blank_srs")
    .select(
      "set_id, blank_idx, next_due_at, article_blank_sets!inner(set_id, article_id, blanks, articles!inner(article_number, display_label, laws!inner(law_code)))",
    )
    .eq("user_id", userId)
    .lte("next_due_at", cutoffIso)
    .order("next_due_at", { ascending: true })
    .limit(500); // set 집계 후 limit 적용 위해 raw 는 넉넉히
  if (error) throw error;

  type Row = NonNullable<typeof data>[number];
  // ★고아 SRS 행 제외 — 세트 재직렬화/빈칸 제거로 blank_idx 가 현재 세트에 없으면 다시
  //   풀 방법이 없어 영구 due 로 남는다(2026-07-29 신고: 민법 35·40조). 현재 세트에
  //   존재하고 정답이 매핑된 idx 만 due 로 집계한다.
  const validIdxBySet = new Map<string, Set<number>>();
  const liveRows = (data ?? []).filter((r) => {
    let valid = validIdxBySet.get(r.set_id);
    if (!valid) {
      valid = new Set(
        parseBlanks(r.article_blank_sets.blanks)
          .filter((b) => b.answer.trim().length > 0)
          .map((b) => b.idx),
      );
      validIdxBySet.set(r.set_id, valid);
    }
    return valid.has(r.blank_idx);
  });
  const bySet = new Map<
    string,
    {
      row: Row;
      dueBlankCount: number;
      earliestDueAt: string;
    }
  >();
  for (const r of liveRows) {
    const cur = bySet.get(r.set_id);
    if (!cur) {
      bySet.set(r.set_id, {
        row: r,
        dueBlankCount: 1,
        earliestDueAt: r.next_due_at,
      });
    } else {
      cur.dueBlankCount += 1;
      if (r.next_due_at < cur.earliestDueAt) cur.earliestDueAt = r.next_due_at;
    }
  }

  // set 별 본인의 SRS 항목 총수 (due + future).
  const setIds = [...bySet.keys()];
  const totalBySet = new Map<string, number>();
  if (setIds.length > 0) {
    const { data: totals } = await client
      .from("user_blank_srs")
      .select("set_id")
      .eq("user_id", userId)
      .in("set_id", setIds);
    for (const t of totals ?? []) {
      totalBySet.set(t.set_id, (totalBySet.get(t.set_id) ?? 0) + 1);
    }
  }

  const now = Date.now();
  const items: DueBlankSetItem[] = [...bySet.values()]
    .map((v) => {
      const due = new Date(v.earliestDueAt).getTime();
      const articleNumber = v.row.article_blank_sets.articles.article_number;
      if (!articleNumber) return null;
      return {
        setId: v.row.set_id,
        articleNumber,
        displayLabel: v.row.article_blank_sets.articles.display_label,
        lawCode: v.row.article_blank_sets.articles.laws
          .law_code as LawSubjectSlug,
        dueBlankCount: v.dueBlankCount,
        totalBlankSrsCount: totalBySet.get(v.row.set_id) ?? v.dueBlankCount,
        earliestDueAt: v.earliestDueAt,
        daysUntilDue: Math.floor((due - now) / 86_400_000),
      };
    })
    .filter((x): x is DueBlankSetItem => x !== null);
  // 가장 오래된 due 먼저.
  items.sort((a, b) => a.earliestDueAt.localeCompare(b.earliestDueAt));
  return items.slice(0, limit);
}

export interface BlankSrsCounts {
  dueSets: number;
  dueBlanks: number;
  upcoming7dSets: number;
  totalBlanks: number;
  lapsesSum: number;
}

export async function getBlankSrsCounts(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<BlankSrsCounts> {
  const cutoffIso = reviewDueCutoffIso();
  const sevenDays = new Date(
    reviewDueCutoffMs() + 7 * 86_400_000,
  ).toISOString();

  const [dueRes, upcomingRes, totalRes, lapsesRes] = await Promise.all([
    client
      .from("user_blank_srs")
      .select("set_id")
      .eq("user_id", userId)
      .lte("next_due_at", cutoffIso),
    client
      .from("user_blank_srs")
      .select("set_id")
      .eq("user_id", userId)
      .gt("next_due_at", cutoffIso)
      .lte("next_due_at", sevenDays),
    client
      .from("user_blank_srs")
      .select("set_id", { head: true, count: "exact" })
      .eq("user_id", userId),
    // ★행 상한 — 빈칸 카드가 많은 학생(실측 1인 최대 3,296건)은 뒤가 잘린다.
    fetchAllPages<{ lapses: number | null }>(() =>
      client
        .from("user_blank_srs")
        .select("lapses")
        .eq("user_id", userId)
        .order("set_id")
        .order("blank_idx"),
    ),
  ]);

  const dueSets = new Set((dueRes.data ?? []).map((r) => r.set_id));
  const upcomingSets = new Set((upcomingRes.data ?? []).map((r) => r.set_id));
  const lapsesSum = lapsesRes.reduce((s, r) => s + (r.lapses ?? 0), 0);

  return {
    dueSets: dueSets.size,
    dueBlanks: dueRes.data?.length ?? 0,
    upcoming7dSets: upcomingSets.size,
    totalBlanks: totalRes.count ?? 0,
    lapsesSum,
  };
}
