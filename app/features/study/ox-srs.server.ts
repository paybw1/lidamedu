// feat-2-014 OX 채점 SRS — 서버 측 hook + 조회.
// 단위 = ref (choice 또는 box_item). recordProblemAttempt OX 분기에서 hook.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import {
  type SrsState,
  computeNextSrsState,
  reviewDueCutoffIso,
  reviewDueCutoffMs,
} from "~/features/study/lib/srs";
import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";

export type OxRefType = "choice" | "box_item";

export async function applyOxRefSrsUpdate(
  client: SupabaseClient<Database>,
  userId: string,
  refType: OxRefType,
  refId: string,
  isCorrect: boolean,
): Promise<void> {
  try {
    const { data: prev } = await client
      .from("user_ox_ref_srs")
      .select("interval_days, ease, reps, lapses")
      .eq("user_id", userId)
      .eq("ref_type", refType)
      .eq("ref_id", refId)
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

    await client.from("user_ox_ref_srs").upsert(
      {
        user_id: userId,
        ref_type: refType,
        ref_id: refId,
        next_due_at: next.nextDueAt.toISOString(),
        interval_days: next.intervalDays,
        ease: next.ease,
        last_quality: next.lastQuality,
        last_reviewed_at: now,
        lapses: next.lapses,
        reps: next.reps,
        updated_at: now,
      },
      { onConflict: "user_id,ref_type,ref_id" },
    );
  } catch (err) {
    console.error("[ox-srs] applyOxRefSrsUpdate failed:", err);
  }
}

export interface DueOxRefItem {
  refType: OxRefType;
  refId: string;
  /** 부모 problem id (있으면 — display·진입에 사용). */
  problemId: string | null;
  lawCode: LawSubjectSlug | null;
  year: number | null;
  problemNumber: number | null;
  /** 선택지/박스 항목 본문 발췌. */
  refSnippet: string;
  nextDueAt: string;
  intervalDays: number;
  reps: number;
  lapses: number;
  daysUntilDue: number;
}

/**
 * 본인 OX ref SRS due 항목.
 * choice / box_item 별로 부모 problem 조인을 따로 해서 합친다.
 * SRS 등록 뒤 ox_ineligible/ox_truth 회수·문제 삭제로 풀 수 없게 된 ref 는 제외
 * — 러너(getOxQuestionsForRefs)와 동일 기준. 안 맞으면 목록엔 있는데 러너가 빈 화면.
 */
export async function getDueOxRefs(
  client: SupabaseClient<Database>,
  userId: string,
  limit: number = 100,
): Promise<DueOxRefItem[]> {
  const cutoffIso = reviewDueCutoffIso();
  const { data: rows, error } = await client
    .from("user_ox_ref_srs")
    .select("ref_type, ref_id, next_due_at, interval_days, reps, lapses")
    .eq("user_id", userId)
    .lte("next_due_at", cutoffIso)
    .order("next_due_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  if (!rows || rows.length === 0) return [];

  const choiceIds = rows.filter((r) => r.ref_type === "choice").map((r) => r.ref_id);
  const boxItemIds = rows.filter((r) => r.ref_type === "box_item").map((r) => r.ref_id);

  const choiceMap = new Map<
    string,
    {
      problemId: string;
      lawCode: LawSubjectSlug;
      year: number | null;
      problemNumber: number | null;
      snippet: string;
    }
  >();
  if (choiceIds.length > 0) {
    const { data: choices } = await client
      .from("problem_choices")
      .select(
        "choice_id, body_md, problem_id, problems!inner(year, problem_number, deleted_at, laws!inner(law_code))",
      )
      .in("choice_id", choiceIds)
      .eq("ox_ineligible", false)
      .not("ox_truth", "is", null);
    for (const c of choices ?? []) {
      if (c.problems.deleted_at) continue;
      choiceMap.set(c.choice_id, {
        problemId: c.problem_id,
        lawCode: (c.problems.laws.law_code as LawSubjectSlug) ?? "patent",
        year: c.problems.year,
        problemNumber: c.problems.problem_number,
        snippet: (c.body_md ?? "").slice(0, 100),
      });
    }
  }

  const boxMap = new Map<
    string,
    {
      problemId: string;
      lawCode: LawSubjectSlug;
      year: number | null;
      problemNumber: number | null;
      snippet: string;
    }
  >();
  if (boxItemIds.length > 0) {
    const { data: boxes } = await client
      .from("problem_box_items")
      .select(
        "box_item_id, body_md, problem_id, problems!inner(year, problem_number, deleted_at, laws!inner(law_code))",
      )
      .in("box_item_id", boxItemIds)
      .eq("ox_ineligible", false)
      .not("ox_truth", "is", null);
    for (const b of boxes ?? []) {
      if (b.problems.deleted_at) continue;
      boxMap.set(b.box_item_id, {
        problemId: b.problem_id,
        lawCode: (b.problems.laws.law_code as LawSubjectSlug) ?? "patent",
        year: b.problems.year,
        problemNumber: b.problems.problem_number,
        snippet: (b.body_md ?? "").slice(0, 100),
      });
    }
  }

  const now = Date.now();
  const items: DueOxRefItem[] = [];
  for (const r of rows) {
    const parent =
      r.ref_type === "choice" ? choiceMap.get(r.ref_id) : boxMap.get(r.ref_id);
    // parent 없음 = eligibility 필터 탈락(부적격/삭제) — 러너에서 못 푸는 항목이라 목록에서도 제외.
    if (!parent) continue;
    items.push({
      refType: r.ref_type as OxRefType,
      refId: r.ref_id,
      problemId: parent.problemId,
      lawCode: parent.lawCode,
      year: parent.year,
      problemNumber: parent.problemNumber,
      refSnippet: parent.snippet,
      nextDueAt: r.next_due_at,
      intervalDays: r.interval_days,
      reps: r.reps,
      lapses: r.lapses,
      daysUntilDue: Math.floor(
        (new Date(r.next_due_at).getTime() - now) / 86_400_000,
      ),
    });
  }
  return items;
}

export interface OxSrsCounts {
  due: number;
  upcoming7d: number;
  total: number;
  lapsesSum: number;
}

export async function getOxSrsCounts(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<OxSrsCounts> {
  const cutoffIso = reviewDueCutoffIso();
  const sevenDays = new Date(
    reviewDueCutoffMs() + 7 * 86_400_000,
  ).toISOString();
  const [dueRes, upcomingRes, totalRes, lapsesRes] = await Promise.all([
    client
      .from("user_ox_ref_srs")
      .select("ref_id", { head: true, count: "exact" })
      .eq("user_id", userId)
      .lte("next_due_at", cutoffIso),
    client
      .from("user_ox_ref_srs")
      .select("ref_id", { head: true, count: "exact" })
      .eq("user_id", userId)
      .gt("next_due_at", cutoffIso)
      .lte("next_due_at", sevenDays),
    client
      .from("user_ox_ref_srs")
      .select("ref_id", { head: true, count: "exact" })
      .eq("user_id", userId),
    client
      .from("user_ox_ref_srs")
      .select("lapses")
      .eq("user_id", userId),
  ]);
  const lapsesSum = (lapsesRes.data ?? []).reduce(
    (s, r) => s + (r.lapses ?? 0),
    0,
  );
  return {
    due: dueRes.count ?? 0,
    upcoming7d: upcomingRes.count ?? 0,
    total: totalRes.count ?? 0,
    lapsesSum,
  };
}
