// 오류 신고(가배포 테스터용) 서버 쿼리. 타입/상수는 ./labels (클라 번들 안전).
// insert/본인조회는 RLS(supa-client), staff 전체 조회·상태변경은 admin client(RLS 우회 — 재귀 회피).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";

import type { BugReportRow, BugReportStatus } from "./labels";

export async function createBugReport(
  client: SupabaseClient<Database>,
  userId: string,
  input: { url: string; message: string; userAgent: string | null },
): Promise<{ ok: true; reportId: string } | { ok: false; error: string }> {
  const { data, error } = await client
    .from("bug_reports")
    .insert({
      reporter_id: userId,
      url: input.url.slice(0, 2000),
      message: input.message,
      user_agent: input.userAgent?.slice(0, 1000) ?? null,
    })
    .select("report_id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, reportId: data.report_id };
}

// staff 전용 — admin client. 신고자 이름은 profiles 별도 조회로 매핑.
export async function listAllBugReports(): Promise<BugReportRow[]> {
  const admin = adminClient as SupabaseClient<Database>;
  const { data, error } = await admin
    .from("bug_reports")
    .select(
      "report_id, reporter_id, url, message, user_agent, status, created_at, resolution_note, resolved_at",
    )
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  const rows = data ?? [];
  const reporterIds = [
    ...new Set(rows.map((r) => r.reporter_id).filter((v): v is string => !!v)),
  ];
  const nameById = new Map<string, string>();
  if (reporterIds.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("profile_id, name")
      .in("profile_id", reporterIds);
    for (const p of profiles ?? []) nameById.set(p.profile_id, p.name);
  }
  return rows.map((r) => ({
    reportId: r.report_id,
    reporterId: r.reporter_id,
    reporterName: r.reporter_id ? (nameById.get(r.reporter_id) ?? null) : null,
    url: r.url,
    message: r.message,
    userAgent: r.user_agent,
    status: r.status as BugReportStatus,
    createdAt: r.created_at,
    resolutionNote: r.resolution_note,
    resolvedAt: r.resolved_at,
  }));
}

export async function updateBugReportStatus(
  reportId: string,
  status: BugReportStatus,
  // 완료 "전환" 시에만 전달 — 처리 쪽지·처리 시각을 함께 영속(관리자 화면 표시용).
  resolution?: { note: string | null },
): Promise<void> {
  const admin = adminClient as SupabaseClient<Database>;
  await admin
    .from("bug_reports")
    .update(
      resolution
        ? {
            status,
            resolution_note: resolution.note,
            resolved_at: new Date().toISOString(),
          }
        : { status },
    )
    .eq("report_id", reportId);
}

/** 상태 전환 판정·알림용 단건 조회 (staff 경로 — admin client). */
export async function getBugReport(reportId: string): Promise<{
  reportId: string;
  reporterId: string | null;
  url: string;
  message: string;
  status: BugReportStatus;
} | null> {
  const admin = adminClient as SupabaseClient<Database>;
  const { data } = await admin
    .from("bug_reports")
    .select("report_id, reporter_id, url, message, status")
    .eq("report_id", reportId)
    .maybeSingle();
  if (!data) return null;
  return {
    reportId: data.report_id,
    reporterId: data.reporter_id,
    url: data.url,
    message: data.message,
    status: data.status as BugReportStatus,
  };
}
