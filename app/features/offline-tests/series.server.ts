// feat-7-044 — 오프라인 테스트 시리즈 서버 쿼리. 회차 묶음 + 성적 추이(석차·백분위).
// 파생값(순위·평균)은 저장하지 않고 조회 시 계산.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import { fetchAllIn } from "~/core/lib/supa-batch.server";

export interface SeriesSummary {
  seriesId: string;
  cohortId: string;
  title: string;
  testCount: number;
  createdAt: string;
}

export async function listSeries(
  client: SupabaseClient<Database>,
  cohortId: string,
): Promise<SeriesSummary[]> {
  const { data: series, error } = await client
    .from("offline_test_series")
    .select("series_id, cohort_id, title, created_at")
    .eq("cohort_id", cohortId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const list = series ?? [];
  if (list.length === 0) return [];

  const tests = await fetchAllIn(
    list.map((s) => s.series_id),
    (slice) =>
      client
        .from("offline_tests")
        .select("series_id, test_id")
        .in("series_id", slice)
        .is("deleted_at", null)
        .order("test_id"),
  );
  const countBySeries = new Map<string, number>();
  for (const t of tests) {
    if (!t.series_id) continue;
    countBySeries.set(t.series_id, (countBySeries.get(t.series_id) ?? 0) + 1);
  }
  return list.map((s) => ({
    seriesId: s.series_id,
    cohortId: s.cohort_id,
    title: s.title,
    testCount: countBySeries.get(s.series_id) ?? 0,
    createdAt: s.created_at,
  }));
}

export async function createSeries(
  client: SupabaseClient<Database>,
  input: { cohortId: string; title: string; createdBy: string },
): Promise<string> {
  const { data, error } = await client
    .from("offline_test_series")
    .insert({
      cohort_id: input.cohortId,
      title: input.title,
      created_by: input.createdBy,
    })
    .select("series_id")
    .single();
  if (error) throw error;
  return data.series_id;
}

// 테스트 ↔ 시리즈 연결/해제. roundNo 미지정 시 시리즈 내 다음 회차 자동.
export async function assignTestToSeries(
  client: SupabaseClient<Database>,
  testId: string,
  seriesId: string | null,
  roundNo: number | null,
): Promise<void> {
  let resolvedRound = roundNo;
  if (seriesId && resolvedRound === null) {
    const { data: rows } = await client
      .from("offline_tests")
      .select("series_round_no")
      .eq("series_id", seriesId)
      .is("deleted_at", null);
    resolvedRound =
      (rows ?? []).reduce((m, r) => Math.max(m, r.series_round_no ?? 0), 0) + 1;
  }
  const { error } = await client
    .from("offline_tests")
    .update({
      series_id: seriesId,
      series_round_no: seriesId ? resolvedRound : null,
      updated_at: new Date().toISOString(),
    })
    .eq("test_id", testId);
  if (error) throw error;
}

// ── 성적 추이 ────────────────────────────────────────────────────────────────

export interface SeriesRound {
  testId: string;
  roundNo: number;
  title: string;
  maxScore: number | null;
  takenCount: number;
  avgPct: number | null;
}

export interface SeriesCell {
  roundNo: number;
  score: number;
  pct: number;
  rank: number; // 1 = 최고
  taken: number; // 그 회차 응시자 수
}

export interface SeriesStudentTrend {
  profileId: string;
  cells: SeriesCell[];
  avgPct: number | null;
  // 최근 회차 − 직전 회차 (%p). 둘 다 응시했을 때만.
  deltaPct: number | null;
}

export interface SeriesTrend {
  seriesId: string;
  cohortId: string;
  title: string;
  rounds: SeriesRound[];
  students: SeriesStudentTrend[];
}

export async function getSeriesTrend(
  client: SupabaseClient<Database>,
  seriesId: string,
): Promise<SeriesTrend | null> {
  const { data: s, error } = await client
    .from("offline_test_series")
    .select("series_id, cohort_id, title")
    .eq("series_id", seriesId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!s) return null;

  const { data: tests, error: tErr } = await client
    .from("offline_tests")
    .select("test_id, title, series_round_no")
    .eq("series_id", seriesId)
    .is("deleted_at", null)
    .order("series_round_no", { ascending: true });
  if (tErr) throw tErr;
  const testList = (tests ?? []).filter((t) => t.series_round_no !== null);
  if (testList.length === 0) {
    return {
      seriesId: s.series_id,
      cohortId: s.cohort_id,
      title: s.title,
      rounds: [],
      students: [],
    };
  }

  const results = await fetchAllIn(
    testList.map((t) => t.test_id),
    (slice) =>
      client
        .from("offline_test_results")
        .select("test_id, user_id, status, score, max_score, result_id")
        .in("test_id", slice)
        .order("result_id"),
  );

  // 회차별 응시 점수 → 순위·평균.
  const roundByTest = new Map(
    testList.map((t) => [t.test_id, t.series_round_no as number] as const),
  );
  const takenByRound = new Map<number, Array<{ userId: string; score: number; pct: number }>>();
  const maxScoreByRound = new Map<number, number>();
  for (const r of results) {
    const roundNo = roundByTest.get(r.test_id);
    if (roundNo === undefined) continue;
    if (r.max_score !== null) maxScoreByRound.set(roundNo, Number(r.max_score));
    if (r.status !== "taken" || r.score === null) continue;
    const max = r.max_score === null ? null : Number(r.max_score);
    const pct = max && max > 0 ? Math.round((Number(r.score) / max) * 100) : 0;
    const arr = takenByRound.get(roundNo) ?? [];
    arr.push({ userId: r.user_id, score: Number(r.score), pct });
    takenByRound.set(roundNo, arr);
  }

  const rounds: SeriesRound[] = testList.map((t) => {
    const roundNo = t.series_round_no as number;
    const taken = takenByRound.get(roundNo) ?? [];
    const avgPct =
      taken.length > 0
        ? Math.round(taken.reduce((sum, v) => sum + v.pct, 0) / taken.length)
        : null;
    return {
      testId: t.test_id,
      roundNo,
      title: t.title,
      maxScore: maxScoreByRound.get(roundNo) ?? null,
      takenCount: taken.length,
      avgPct,
    };
  });

  // 학생별 셀 — 회차 내 순위(동점=같은 순위 아님, 점수 내림차순 인덱스+1 단순화).
  const cellsByUser = new Map<string, SeriesCell[]>();
  for (const [roundNo, taken] of takenByRound) {
    const sorted = [...taken].sort((a, b) => b.score - a.score);
    for (const v of sorted) {
      // 동점자는 같은 순위 (표준 competition ranking).
      const rank = sorted.findIndex((x) => x.score === v.score) + 1;
      const arr = cellsByUser.get(v.userId) ?? [];
      arr.push({
        roundNo,
        score: v.score,
        pct: v.pct,
        rank,
        taken: sorted.length,
      });
      cellsByUser.set(v.userId, arr);
    }
  }

  const students: SeriesStudentTrend[] = [...cellsByUser.entries()].map(
    ([profileId, cells]) => {
      const sortedCells = [...cells].sort((a, b) => a.roundNo - b.roundNo);
      const avgPct =
        sortedCells.length > 0
          ? Math.round(
              sortedCells.reduce((sum, c) => sum + c.pct, 0) / sortedCells.length,
            )
          : null;
      const last = sortedCells[sortedCells.length - 1];
      const prev = sortedCells[sortedCells.length - 2];
      return {
        profileId,
        cells: sortedCells,
        avgPct,
        deltaPct: last && prev ? last.pct - prev.pct : null,
      };
    },
  );
  students.sort((a, b) => (b.avgPct ?? -1) - (a.avgPct ?? -1));

  return {
    seriesId: s.series_id,
    cohortId: s.cohort_id,
    title: s.title,
    rounds,
    students,
  };
}

// 학생 본인 — 내 시험 추이 (회차별 내 점수% vs 반 평균).
// 내 결과는 요청 클라이언트(RLS own), 반 평균은 adminClient 집계(개인 식별 없음 —
// 게임화 코호트 구간과 같은 격리 패턴).
export interface MySeriesTrend {
  seriesTitle: string;
  rounds: Array<{
    roundNo: number;
    title: string;
    myPct: number | null; // null = 미응시/미기록
    avgPct: number | null;
  }>;
}

export async function getMySeriesTrend(
  client: SupabaseClient<Database>,
  admin: SupabaseClient<Database>,
  userId: string,
): Promise<MySeriesTrend | null> {
  // RLS 멤버 read — 내 반의 시리즈만 보인다. 최근 시리즈 1개.
  const { data: series, error } = await client
    .from("offline_test_series")
    .select("series_id, title")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  const s = (series ?? [])[0];
  if (!s) return null;

  const trend = await getSeriesTrend(admin, s.series_id);
  if (!trend || trend.rounds.length === 0) return null;

  const mine = trend.students.find((st) => st.profileId === userId);
  const myByRound = new Map((mine?.cells ?? []).map((c) => [c.roundNo, c.pct]));
  // 내 결과가 하나도 없으면 카드 자체를 숨긴다.
  if (myByRound.size === 0) return null;

  return {
    seriesTitle: trend.title,
    rounds: trend.rounds.map((r) => ({
      roundNo: r.roundNo,
      title: r.title,
      myPct: myByRound.get(r.roundNo) ?? null,
      avgPct: r.avgPct,
    })),
  };
}
