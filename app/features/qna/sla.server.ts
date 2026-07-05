// Q&A 응답 SLA 집계 — 운영 대시보드(/admin/qna/sla) 데이터. manager+ 전용
// (loader 게이트), 타 사용자 이름 조회가 필요해 adminClient 로 집계한다.
//
// "강사 응답" 판정은 셋 중 가장 빠른 시각:
//   ① 정식 답변 qna_threads.answered_at
//   ② AI 답변 '정확' 확인 qna_messages.verified_at (verdict=correct)
//   ③ 강사 메시지 qna_messages.created_at (role=instructor)
// AI 즉답만 있는 스레드(ai_answered)는 아직 미응답으로 센다.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";

import {
  QNA_SLA_BREACH_HOURS,
  QNA_SLA_TARGET_HOURS,
  type QnaSlaAnswererStat,
  type QnaSlaDashboard,
  type QnaSlaPendingItem,
  type QnaSlaWeekStat,
  type QnaStatus,
  type QnaTargetType,
} from "./labels";

const PAGE_SIZE = 1000;
const WINDOW_DAYS = 30;
const WEEKLY_WEEKS = 8;
const KST_OFFSET_MS = 9 * 3600_000;
const HOUR_MS = 3600_000;
const DAY_MS = 24 * HOUR_MS;

interface ThreadRow {
  thread_id: string;
  title: string;
  subject: string | null;
  target_type: QnaTargetType;
  status: QnaStatus;
  created_at: string;
  answered_at: string | null;
  answerer_id: string | null;
  asker: { profile_id: string; name: string } | null;
}

// 전량 페이징 조회 — ★.range() 페이징은 유일 정렬키 필수(thread_id 타이브레이커).
async function fetchAllThreads(
  admin: SupabaseClient<Database>,
): Promise<ThreadRow[]> {
  const out: ThreadRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from("qna_threads")
      .select(
        `thread_id, title, subject, target_type, status, created_at,
         answered_at, answerer_id,
         asker:profiles!qna_threads_asker_id_fkey ( profile_id, name )`,
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .order("thread_id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data as unknown as ThreadRow[] | null) ?? [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) return out;
  }
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** KST 기준 그 주 월요일 00:00 의 날짜 문자열(YYYY-MM-DD). */
function kstWeekStart(ts: number): string {
  const kst = new Date(ts + KST_OFFSET_MS);
  const dow = (kst.getUTCDay() + 6) % 7; // 월=0
  const monday = new Date(
    Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() - dow),
  );
  return monday.toISOString().slice(0, 10);
}

export async function getQnaSlaDashboard(): Promise<QnaSlaDashboard> {
  const admin = adminClient as SupabaseClient<Database>;
  const now = Date.now();

  const [threads, instructorMsgs, verifiedMsgs] = await Promise.all([
    fetchAllThreads(admin),
    admin
      .from("qna_messages")
      .select("thread_id, created_at, author_id")
      .eq("role", "instructor")
      .is("deleted_at", null)
      .then(({ data, error }) => {
        if (error) throw error;
        return data ?? [];
      }),
    admin
      .from("qna_messages")
      .select("thread_id, verified_at, verified_by")
      .eq("verdict", "correct")
      .not("verified_at", "is", null)
      .then(({ data, error }) => {
        if (error) throw error;
        return data ?? [];
      }),
  ]);

  // 스레드별 가장 빠른 강사 응답(시각 + 응답자).
  const response = new Map<string, { at: number; by: string | null }>();
  const consider = (threadId: string, at: number, by: string | null) => {
    const prev = response.get(threadId);
    if (!prev || at < prev.at) response.set(threadId, { at, by });
  };
  for (const t of threads) {
    if (t.answered_at) {
      consider(t.thread_id, new Date(t.answered_at).getTime(), t.answerer_id);
    }
  }
  for (const m of instructorMsgs) {
    consider(m.thread_id, new Date(m.created_at).getTime(), m.author_id);
  }
  for (const m of verifiedMsgs) {
    if (m.verified_at) {
      consider(m.thread_id, new Date(m.verified_at).getTime(), m.verified_by);
    }
  }

  // ── 대기 큐 — 미응답 + 상태도 대기(open/ai_answered). 오래된 순.
  const pending: QnaSlaPendingItem[] = threads
    .filter(
      (t) =>
        (t.status === "open" || t.status === "ai_answered") &&
        !response.has(t.thread_id),
    )
    .map((t) => ({
      threadId: t.thread_id,
      title: t.title,
      subject: t.subject,
      targetType: t.target_type,
      status: t.status,
      askerName: t.asker?.name ?? null,
      createdAt: t.created_at,
      ageHours: round1((now - new Date(t.created_at).getTime()) / HOUR_MS),
    }))
    .sort((a, b) => b.ageHours - a.ageHours);

  const pendingCounts = {
    total: pending.length,
    overTarget: pending.filter((p) => p.ageHours > QNA_SLA_TARGET_HOURS).length,
    overBreach: pending.filter((p) => p.ageHours > QNA_SLA_BREACH_HOURS)
      .length,
  };

  // ── 최근 30일(질문 등록 기준) 지표.
  const windowStart = now - WINDOW_DAYS * DAY_MS;
  const recent = threads.filter(
    (t) => new Date(t.created_at).getTime() >= windowStart,
  );
  const durations: number[] = [];
  let withinTarget = 0;
  let eligible = 0; // 응답됐거나 목표 시간을 넘긴 질문(신규 미답은 판정 유보).
  for (const t of recent) {
    const created = new Date(t.created_at).getTime();
    const res = response.get(t.thread_id);
    if (res) {
      const hours = (res.at - created) / HOUR_MS;
      durations.push(hours);
      eligible += 1;
      if (hours <= QNA_SLA_TARGET_HOURS) withinTarget += 1;
    } else if (now - created > QNA_SLA_TARGET_HOURS * HOUR_MS) {
      eligible += 1;
    }
  }
  const window30 = {
    asked: recent.length,
    responded: durations.length,
    responseRatePct:
      recent.length > 0
        ? Math.round((durations.length / recent.length) * 100)
        : null,
    medianHours: durations.length > 0 ? round1(median(durations)!) : null,
    avgHours:
      durations.length > 0
        ? round1(durations.reduce((a, b) => a + b, 0) / durations.length)
        : null,
    withinTargetPct:
      eligible > 0 ? Math.round((withinTarget / eligible) * 100) : null,
  };

  // ── 주별 추이(최근 8주, KST 월요일 시작).
  const weeklyMap = new Map<string, { asked: number; durations: number[] }>();
  const weeklyFloor = now - WEEKLY_WEEKS * 7 * DAY_MS;
  for (const t of threads) {
    const created = new Date(t.created_at).getTime();
    if (created < weeklyFloor) continue;
    const key = kstWeekStart(created);
    let bucket = weeklyMap.get(key);
    if (!bucket) {
      bucket = { asked: 0, durations: [] };
      weeklyMap.set(key, bucket);
    }
    bucket.asked += 1;
    const res = response.get(t.thread_id);
    if (res) bucket.durations.push((res.at - created) / HOUR_MS);
  }
  const weekly: QnaSlaWeekStat[] = [...weeklyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, b]) => ({
      weekStart,
      asked: b.asked,
      responded: b.durations.length,
      medianHours:
        b.durations.length > 0 ? round1(median(b.durations)!) : null,
      withinTarget: b.durations.filter((h) => h <= QNA_SLA_TARGET_HOURS)
        .length,
    }));

  // ── 응답자별(최근 30일, 응답 시각 기준).
  const byAnswerer = new Map<string, number[]>();
  for (const t of threads) {
    const res = response.get(t.thread_id);
    if (!res || !res.by || res.at < windowStart) continue;
    const created = new Date(t.created_at).getTime();
    const list = byAnswerer.get(res.by) ?? [];
    list.push((res.at - created) / HOUR_MS);
    byAnswerer.set(res.by, list);
  }
  const answererIds = [...byAnswerer.keys()];
  const nameMap = new Map<string, string | null>();
  if (answererIds.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("profile_id, name")
      .in("profile_id", answererIds);
    for (const p of profiles ?? []) nameMap.set(p.profile_id, p.name);
  }
  const answerers: QnaSlaAnswererStat[] = answererIds
    .map((id) => {
      const list = byAnswerer.get(id)!;
      return {
        profileId: id,
        name: nameMap.get(id) ?? null,
        responded: list.length,
        medianHours: list.length > 0 ? round1(median(list)!) : null,
      };
    })
    .sort((a, b) => b.responded - a.responded);

  return { pending, pendingCounts, window30, weekly, answerers };
}
