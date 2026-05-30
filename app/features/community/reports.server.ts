// feat-6-007 모더레이션 — 신고 큐 헬퍼.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";

export type ReportTarget = "post" | "comment";
export type ReportStatus = "pending" | "resolved" | "dismissed";

export interface ReportItem {
  reportId: string;
  targetType: ReportTarget;
  targetId: string;
  reporterId: string;
  reporterName: string | null;
  reason: string;
  status: ReportStatus;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  actionNote: string | null;
  /** 신고 대상 컨텍스트 — post 면 title/board, comment 면 본문 발췌. */
  targetTitle: string | null;
  targetBoard: string | null;
  targetSnippet: string | null;
  targetDeleted: boolean;
}

/** 모든 신고 list (manager+ 호출 가정). 상태 필터 선택. */
export async function listReports(
  status: ReportStatus | "all" = "pending",
  limit = 100,
): Promise<ReportItem[]> {
  const admin = adminClient as SupabaseClient<Database>;
  let q = admin
    .from("community_reports")
    .select(
      "report_id, target_type, target_id, reporter_id, reason, status, created_at, resolved_at, resolved_by, action_note",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (status !== "all") q = q.eq("status", status);
  const { data: rows, error } = await q;
  if (error) throw error;
  const list = rows ?? [];
  if (list.length === 0) return [];

  // reporter 이름 lookup (profiles 는 별도 join — FK 가 auth.users 라 PostgREST embed 불가).
  const reporterIds = [...new Set(list.map((r) => r.reporter_id))];
  const reporterMap = new Map<string, string>();
  if (reporterIds.length > 0) {
    const { data: profs } = await admin
      .from("profiles")
      .select("profile_id, name")
      .in("profile_id", reporterIds);
    for (const p of profs ?? []) {
      reporterMap.set(p.profile_id, p.name);
    }
  }

  // 대상 컨텍스트 일괄 조회.
  const postIds = list
    .filter((r) => r.target_type === "post")
    .map((r) => r.target_id);
  const commentIds = list
    .filter((r) => r.target_type === "comment")
    .map((r) => r.target_id);
  const postMap = new Map<
    string,
    { title: string; board: string; deleted: boolean }
  >();
  if (postIds.length > 0) {
    const { data: posts } = await admin
      .from("community_posts")
      .select("post_id, title, board, deleted_at")
      .in("post_id", postIds);
    for (const p of posts ?? []) {
      postMap.set(p.post_id, {
        title: p.title,
        board: p.board,
        deleted: p.deleted_at !== null,
      });
    }
  }
  const commentMap = new Map<
    string,
    { snippet: string; postId: string; postTitle: string | null; postBoard: string | null; deleted: boolean }
  >();
  if (commentIds.length > 0) {
    const { data: comments } = await admin
      .from("community_post_comments")
      .select(
        "comment_id, body_md, post_id, deleted_at, community_posts!inner(title, board)",
      )
      .in("comment_id", commentIds);
    for (const c of comments ?? []) {
      commentMap.set(c.comment_id, {
        snippet: (c.body_md ?? "").slice(0, 100),
        postId: c.post_id,
        postTitle: c.community_posts?.title ?? null,
        postBoard: c.community_posts?.board ?? null,
        deleted: c.deleted_at !== null,
      });
    }
  }

  return list.map((r) => {
    let targetTitle: string | null = null;
    let targetBoard: string | null = null;
    let targetSnippet: string | null = null;
    let targetDeleted = false;
    if (r.target_type === "post") {
      const p = postMap.get(r.target_id);
      targetTitle = p?.title ?? null;
      targetBoard = p?.board ?? null;
      targetDeleted = p?.deleted ?? false;
    } else {
      const c = commentMap.get(r.target_id);
      targetSnippet = c?.snippet ?? null;
      targetTitle = c?.postTitle ?? null;
      targetBoard = c?.postBoard ?? null;
      targetDeleted = c?.deleted ?? false;
    }
    return {
      reportId: r.report_id,
      targetType: r.target_type as ReportTarget,
      targetId: r.target_id,
      reporterId: r.reporter_id,
      reporterName: reporterMap.get(r.reporter_id) ?? null,
      reason: r.reason,
      status: r.status as ReportStatus,
      createdAt: r.created_at,
      resolvedAt: r.resolved_at,
      resolvedBy: r.resolved_by,
      actionNote: r.action_note,
      targetTitle,
      targetBoard,
      targetSnippet,
      targetDeleted,
    };
  });
}

export interface ReportCounts {
  pending: number;
  resolvedToday: number;
}

export async function getReportCounts(): Promise<ReportCounts> {
  const admin = adminClient as SupabaseClient<Database>;
  const kstTodayStart = new Date(
    Math.floor(
      (Date.now() + 9 * 3600 * 1000) / 86_400_000,
    ) *
      86_400_000 -
      9 * 3600 * 1000,
  ).toISOString();
  const [pendingRes, resolvedRes] = await Promise.all([
    admin
      .from("community_reports")
      .select("report_id", { head: true, count: "exact" })
      .eq("status", "pending"),
    admin
      .from("community_reports")
      .select("report_id", { head: true, count: "exact" })
      .neq("status", "pending")
      .gte("resolved_at", kstTodayStart),
  ]);
  return {
    pending: pendingRes.count ?? 0,
    resolvedToday: resolvedRes.count ?? 0,
  };
}

export async function resolveReport(input: {
  reportId: string;
  status: "resolved" | "dismissed";
  managerId: string;
  actionNote?: string | null;
  /** 함께 신고 대상 soft delete. status='resolved' 일 때만 의미. */
  alsoDelete?: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = adminClient as SupabaseClient<Database>;
  // 대상 정보 조회.
  const { data: row, error: getErr } = await admin
    .from("community_reports")
    .select("target_type, target_id")
    .eq("report_id", input.reportId)
    .maybeSingle();
  if (getErr) return { ok: false, error: getErr.message };
  if (!row) return { ok: false, error: "not_found" };

  // 신고 status 업데이트.
  const { error: updErr } = await admin
    .from("community_reports")
    .update({
      status: input.status,
      resolved_at: new Date().toISOString(),
      resolved_by: input.managerId,
      action_note: input.actionNote ?? null,
    })
    .eq("report_id", input.reportId);
  if (updErr) return { ok: false, error: updErr.message };

  // 함께 삭제.
  if (input.alsoDelete && input.status === "resolved") {
    const nowIso = new Date().toISOString();
    if (row.target_type === "post") {
      await admin
        .from("community_posts")
        .update({ deleted_at: nowIso })
        .eq("post_id", row.target_id);
    } else {
      await admin
        .from("community_post_comments")
        .update({ deleted_at: nowIso })
        .eq("comment_id", row.target_id);
    }
  }
  return { ok: true };
}
