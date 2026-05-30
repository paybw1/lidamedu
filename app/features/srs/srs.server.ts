// SRS v2 ③ — 서버 측 공용 헬퍼.
// queue 조회 / review 기록 / stats / CSV export 모두 이 모듈을 통과.
// SRS_FAKE_TODAY 환경변수로 "오늘 날짜" 시뮬레이션 — QA·E2E 용.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import {
  type Grade,
  type SrsCardState,
  type SrsState,
  newCardState,
  scheduleNext,
} from "~/features/srs/lib/scheduler";

/* ── 시간 ─────────────────────────────────────────────────────────────── */

/**
 * "오늘" 의 KST 자정 시각 (Date).
 * SRS_FAKE_TODAY="YYYY-MM-DD" 환경변수가 설정돼 있으면 해당 날짜 KST 자정 반환.
 * QA·E2E 시뮬레이션 전용 — 프로덕션에서는 비활성 권장(env 미지정).
 */
export function srsNow(): Date {
  const raw = process.env.SRS_FAKE_TODAY;
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    // KST 자정 = UTC 전날 15:00
    const [y, m, d] = raw.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d, -9, 0, 0));
  }
  return new Date();
}

/** srsNow() 의 KST 날짜 (YYYY-MM-DD). due_date 비교용. */
export function srsToday(): string {
  const ms = srsNow().getTime() + 9 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** YYYY-MM-DD (KST) → UTC ISO timestamp (KST 자정). */
export function kstDateToUtcIso(yyyymmdd: string): string {
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, -9, 0, 0)).toISOString();
}

/* ── 사용자 설정 ───────────────────────────────────────────────────── */

export interface SrsSettings {
  newPerDay: number;
  maxReviewsPerDay: number;
}

const DEFAULT_SETTINGS: SrsSettings = {
  newPerDay: 20,
  maxReviewsPerDay: 200,
};

export async function getUserSettings(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<SrsSettings> {
  const { data } = await client
    .from("srs_user_settings")
    .select("new_per_day, max_reviews_per_day")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return DEFAULT_SETTINGS;
  return {
    newPerDay: data.new_per_day,
    maxReviewsPerDay: data.max_reviews_per_day,
  };
}

/* ── 큐 ─────────────────────────────────────────────────────────────── */

export type QueueItemKind = "due" | "new";

export interface QueueItem {
  itemId: string;
  kind: QueueItemKind;
  subject: string;
  topic: string | null;
  type: Database["public"]["Enums"]["srs_item_type"];
  front: string;
  back: string;
  lawRef: string | null;
  sourceType: string | null;
  /** due 일 때만. */
  state: SrsState | null;
  dueDate: string | null;
  intervalDays: number | null;
  repetitions: number | null;
  easeFactor: number | null;
}

export interface QueueResult {
  today: string;
  items: QueueItem[];
  dueCount: number;
  newCount: number;
  newIntroducedToday: number;
  settings: SrsSettings;
}

/**
 * 오늘의 복습 큐.
 *  - due 항목: review_states 의 due_date <= today, 오래된 것부터.
 *  - new 항목: srs_items 중 본인 review_states 없는 것, 오늘 신규 도입분 - 이미 도입 분 만큼.
 *  - 전체는 maxReviewsPerDay 상한.
 */
export async function getReviewQueue(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<QueueResult> {
  const today = srsToday();
  const todayUtcIso = kstDateToUtcIso(today);
  const settings = await getUserSettings(client, userId);

  // 1) due 항목 (review/relearning/learning) — due_date <= today.
  const { data: dueRows } = await client
    .from("srs_review_states")
    .select(
      "item_id, due_date, state, interval_days, repetitions, ease_factor, srs_items!inner(item_id, subject, topic, type, front, back, law_ref, source_type, deleted_at)",
    )
    .eq("user_id", userId)
    .lte("due_date", today)
    .order("due_date", { ascending: true })
    .limit(settings.maxReviewsPerDay);

  const due: QueueItem[] = (dueRows ?? [])
    .filter((r) => r.srs_items.deleted_at === null)
    .map((r) => ({
      itemId: r.item_id,
      kind: "due" as const,
      subject: r.srs_items.subject,
      topic: r.srs_items.topic,
      type: r.srs_items.type,
      front: r.srs_items.front,
      back: r.srs_items.back,
      lawRef: r.srs_items.law_ref,
      sourceType: r.srs_items.source_type,
      state: r.state as SrsState,
      dueDate: r.due_date,
      intervalDays: r.interval_days,
      repetitions: r.repetitions,
      easeFactor: Number(r.ease_factor),
    }));

  // 2) 오늘 이미 도입한 신규 개수 — review_states.created_at >= todayUtcIso AND repetitions == 1
  //    (rep>=1 = 한 번이라도 채점된 카드. 신규 도입 = 첫 채점 시점).
  //    더 단순하게: states 중 last_reviewed_at >= todayUtc 이면서 created_at == updated_at 비교는 부정확.
  //    실용적 정의: states.created_at(처음 review 한 시점) 이 오늘이면 그게 신규 도입.
  const { count: introCount } = await client
    .from("srs_review_states")
    .select("state_id", { head: true, count: "exact" })
    .eq("user_id", userId)
    .gte("created_at", todayUtcIso);
  const newIntroducedToday = introCount ?? 0;

  // 3) new 슬롯 잔여.
  const newSlotsRemaining = Math.max(
    0,
    settings.newPerDay - newIntroducedToday,
  );
  const totalSlotsRemaining = Math.max(
    0,
    settings.maxReviewsPerDay - due.length,
  );
  const newPickCount = Math.min(newSlotsRemaining, totalSlotsRemaining);

  // 4) new 항목 — review_states 없는 srs_items 중에서.
  let newItems: QueueItem[] = [];
  if (newPickCount > 0) {
    // 이미 본 itemIds 일괄 조회.
    const { data: seen } = await client
      .from("srs_review_states")
      .select("item_id")
      .eq("user_id", userId);
    const seenSet = new Set((seen ?? []).map((r) => r.item_id));

    // 신규 후보 fetch — 적당히 넉넉히 가져와 클라 필터.
    const { data: candidates } = await client
      .from("srs_items")
      .select("item_id, subject, topic, type, front, back, law_ref, source_type")
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(newPickCount + seenSet.size + 50);
    newItems = (candidates ?? [])
      .filter((it) => !seenSet.has(it.item_id))
      .slice(0, newPickCount)
      .map((it) => ({
        itemId: it.item_id,
        kind: "new" as const,
        subject: it.subject,
        topic: it.topic,
        type: it.type,
        front: it.front,
        back: it.back,
        lawRef: it.law_ref,
        sourceType: it.source_type,
        state: null,
        dueDate: null,
        intervalDays: null,
        repetitions: null,
        easeFactor: null,
      }));
  }

  // 5) 큐 합산 — due (오래된 순) 먼저, new 끝에. maxReviewsPerDay 한 번 더 trim.
  const items = [...due, ...newItems].slice(0, settings.maxReviewsPerDay);

  return {
    today,
    items,
    dueCount: due.length,
    newCount: newItems.length,
    newIntroducedToday,
    settings,
  };
}

/* ── 복습 제출 ─────────────────────────────────────────────────────── */

export interface ReviewInput {
  itemId: string;
  grade: Grade;
  elapsedMs?: number | null;
}

export interface ReviewResult {
  itemId: string;
  newState: SrsState;
  newInterval: number;
  newDueDate: string;
  newEf: number;
  newReps: number;
  newLapses: number;
}

/**
 * 시도 결과 기록.
 * 1) 현재 상태 fetch (없으면 newCardState).
 * 2) scheduleNext 로 계산.
 * 3) RPC srs_record_review 로 state upsert + log insert 원자 실행.
 */
export async function submitReview(
  client: SupabaseClient<Database>,
  userId: string,
  input: ReviewInput,
): Promise<ReviewResult> {
  // 현재 상태.
  const { data: existing } = await client
    .from("srs_review_states")
    .select("ease_factor, interval_days, repetitions, lapses, state")
    .eq("user_id", userId)
    .eq("item_id", input.itemId)
    .maybeSingle();

  const prev: SrsCardState = existing
    ? {
        easeFactor: Number(existing.ease_factor),
        intervalDays: existing.interval_days,
        repetitions: existing.repetitions,
        lapses: existing.lapses,
        state: existing.state as SrsState,
      }
    : newCardState();

  const now = srsNow();
  const next = scheduleNext(prev, input.grade, now);
  const dueDateStr = isoDate(next.dueDate);

  // source_type — items 에서 조회 (review_logs 에 동기화 저장).
  const { data: item } = await client
    .from("srs_items")
    .select("source_type")
    .eq("item_id", input.itemId)
    .maybeSingle();
  const sourceType = item?.source_type ?? null;

  const { error } = await client.rpc("srs_record_review", {
    p_item_id: input.itemId,
    p_grade: input.grade,
    p_prev_state: prev.state,
    p_prev_ef: prev.easeFactor,
    p_prev_interval: prev.intervalDays,
    p_new_state: next.state,
    p_new_ef: next.easeFactor,
    p_new_interval: next.intervalDays,
    p_new_reps: next.repetitions,
    p_new_lapses: next.lapses,
    p_new_due: dueDateStr,
    p_elapsed_ms: input.elapsedMs ?? undefined,
    p_source_type: sourceType ?? undefined,
  });
  if (error) throw error;

  return {
    itemId: input.itemId,
    newState: next.state,
    newInterval: next.intervalDays,
    newDueDate: dueDateStr,
    newEf: next.easeFactor,
    newReps: next.repetitions,
    newLapses: next.lapses,
  };
}

function isoDate(d: Date): string {
  // d 가 KST 자정 시각(UTC 전날 15:00)을 가리키면 그대로 UTC slice 하면 하루 빠진다.
  // +9h 보정 후 KST 기준 YYYY-MM-DD 추출.
  return new Date(d.getTime() + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

/* ── 통계 ───────────────────────────────────────────────────────────── */

export interface SrsStats {
  totalItems: number;          // 본인 보유 review_states 수
  totalReviewed: number;       // 누적 review_logs 수
  totalSuccess: number;        // grade >= 3
  retentionPct: number;        // success / totalReviewed * 100
  byDay: Array<{ date: string; reviewed: number; success: number }>; // 최근 30일
  forecast7d: Array<{ date: string; dueCount: number }>;             // 향후 7일
}

export async function getStats(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<SrsStats> {
  const today = srsToday();
  const todayMs = srsNow().getTime();
  const thirtyDaysAgoIso = new Date(todayMs - 30 * 86_400_000).toISOString();

  const [statesRes, logsRes, forecastRes, totalLogsRes, successLogsRes] =
    await Promise.all([
      client
        .from("srs_review_states")
        .select("state_id", { head: true, count: "exact" })
        .eq("user_id", userId),
      client
        .from("srs_review_logs")
        .select("reviewed_at, grade")
        .eq("user_id", userId)
        .gte("reviewed_at", thirtyDaysAgoIso)
        .order("reviewed_at", { ascending: true })
        .limit(20000),
      client
        .from("srs_review_states")
        .select("due_date")
        .eq("user_id", userId)
        .gte("due_date", today)
        .lte("due_date", isoDate(new Date(todayMs + 7 * 86_400_000)))
        .limit(20000),
      client
        .from("srs_review_logs")
        .select("log_id", { head: true, count: "exact" })
        .eq("user_id", userId),
      client
        .from("srs_review_logs")
        .select("log_id", { head: true, count: "exact" })
        .eq("user_id", userId)
        .gte("grade", 3),
    ]);

  // 일별 집계 (최근 30일).
  const dayMap = new Map<string, { reviewed: number; success: number }>();
  for (const r of logsRes.data ?? []) {
    const day = kstDateKey(r.reviewed_at);
    const b = dayMap.get(day) ?? { reviewed: 0, success: 0 };
    b.reviewed += 1;
    if ((r.grade ?? 0) >= 3) b.success += 1;
    dayMap.set(day, b);
  }
  const byDay: SrsStats["byDay"] = [];
  for (let i = 29; i >= 0; i--) {
    const d = isoDate(new Date(todayMs - i * 86_400_000 + 9 * 3600 * 1000));
    // ↑ KST 기준 일자 생성 (UTC 시점을 KST 자정으로 보정).
    const dKst = isoDate(
      new Date((todayMs - i * 86_400_000) + 9 * 60 * 60 * 1000),
    );
    const b = dayMap.get(dKst) ?? { reviewed: 0, success: 0 };
    byDay.push({ date: dKst, ...b });
    void d;
  }

  // 향후 7일 due 예측.
  const forecastMap = new Map<string, number>();
  for (const r of forecastRes.data ?? []) {
    forecastMap.set(r.due_date, (forecastMap.get(r.due_date) ?? 0) + 1);
  }
  const forecast7d: SrsStats["forecast7d"] = [];
  for (let i = 0; i < 7; i++) {
    const dKst = isoDate(
      new Date((todayMs + i * 86_400_000) + 9 * 60 * 60 * 1000),
    );
    forecast7d.push({ date: dKst, dueCount: forecastMap.get(dKst) ?? 0 });
  }

  const totalReviewed = totalLogsRes.count ?? 0;
  const totalSuccess = successLogsRes.count ?? 0;
  return {
    totalItems: statesRes.count ?? 0,
    totalReviewed,
    totalSuccess,
    retentionPct:
      totalReviewed > 0 ? Math.round((totalSuccess / totalReviewed) * 1000) / 10 : 0,
    byDay,
    forecast7d,
  };
}

function kstDateKey(iso: string): string {
  return new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

/* ── CSV export ────────────────────────────────────────────────────── */

export async function exportLogsCsv(
  client: SupabaseClient<Database>,
  userId: string,
  fromIso: string | null,
  toIso: string | null,
): Promise<string> {
  let q = client
    .from("srs_review_logs")
    .select(
      "log_id, item_id, reviewed_at, grade, prev_interval, new_interval, prev_ef, new_ef, prev_state, new_state, elapsed_ms, source_type, cohort_id",
    )
    .eq("user_id", userId)
    .order("reviewed_at", { ascending: true })
    .limit(50000);
  if (fromIso) q = q.gte("reviewed_at", fromIso);
  if (toIso) q = q.lte("reviewed_at", toIso);
  const { data, error } = await q;
  if (error) throw error;

  const header = [
    "log_id",
    "user_id",
    "item_id",
    "reviewed_at",
    "grade",
    "prev_interval",
    "new_interval",
    "prev_ef",
    "new_ef",
    "prev_state",
    "new_state",
    "elapsed_ms",
    "source_type",
    "cohort_id",
  ];
  const rows = [header.join(",")];
  for (const r of data ?? []) {
    rows.push(
      [
        r.log_id,
        userId,
        r.item_id,
        r.reviewed_at,
        r.grade,
        r.prev_interval,
        r.new_interval,
        r.prev_ef,
        r.new_ef,
        r.prev_state,
        r.new_state,
        r.elapsed_ms ?? "",
        csvField(r.source_type),
        r.cohort_id ?? "",
      ].join(","),
    );
  }
  // BOM 추가 — Excel 에서 한글 깨짐 방지.
  return "﻿" + rows.join("\n") + "\n";
}

function csvField(s: string | null): string {
  if (s === null) return "";
  if (/[,"\n\r]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}
