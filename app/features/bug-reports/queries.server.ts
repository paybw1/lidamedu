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
    .select("report_id, reporter_id, url, message, user_agent, status, created_at")
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
  }));
}

export async function updateBugReportStatus(
  reportId: string,
  status: BugReportStatus,
): Promise<void> {
  const admin = adminClient as SupabaseClient<Database>;
  await admin.from("bug_reports").update({ status }).eq("report_id", reportId);
}
