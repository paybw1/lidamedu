// feat-6-011 고객센터 문의 — 서버 쿼리. 접근통제는 RLS(작성자+staff+공개글)가 DB에서 강제.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import type { CsCategory, CsStatus } from "./labels";

type Client = SupabaseClient<Database>;

export interface CsInquiryRow {
  inquiryId: string;
  displayNo: number;
  authorId: string | null;
  category: CsCategory;
  title: string;
  status: CsStatus;
  isPrivate: boolean;
  createdAt: string;
  answeredAt: string | null;
  replyCount: number;
}

export interface CsReplyRow {
  replyId: string;
  role: "student" | "staff";
  authorId: string | null;
  bodyMd: string;
  createdAt: string;
}

export interface CsInquiryDetail extends CsInquiryRow {
  bodyMd: string;
  replies: CsReplyRow[];
}

async function replyCounts(
  client: Client,
  inquiryIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (inquiryIds.length === 0) return map;
  const { data } = await client
    .from("cs_inquiry_replies")
    .select("inquiry_id")
    .in("inquiry_id", inquiryIds)
    .is("deleted_at", null);
  for (const r of data ?? [])
    map.set(r.inquiry_id, (map.get(r.inquiry_id) ?? 0) + 1);
  return map;
}

/** RLS 가시 문의 목록(작성자 본인 + 공개글, staff 는 전체). status 필터 선택. */
export async function listInquiries(
  client: Client,
  opts: { status?: CsStatus | null } = {},
): Promise<CsInquiryRow[]> {
  let q = client
    .from("cs_inquiries")
    .select(
      "inquiry_id, display_no, author_id, category, title, status, is_private, created_at, answered_at",
    )
    .is("deleted_at", null);
  if (opts.status) q = q.eq("status", opts.status);
  const { data, error } = await q
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  const rows = data ?? [];
  const counts = await replyCounts(
    client,
    rows.map((r) => r.inquiry_id),
  );
  return rows.map((r) => ({
    inquiryId: r.inquiry_id,
    displayNo: Number(r.display_no),
    authorId: r.author_id,
    category: r.category,
    title: r.title,
    status: r.status,
    isPrivate: r.is_private,
    createdAt: r.created_at,
    answeredAt: r.answered_at,
    replyCount: counts.get(r.inquiry_id) ?? 0,
  }));
}

export async function getInquiryDetail(
  client: Client,
  inquiryId: string,
): Promise<CsInquiryDetail | null> {
  const { data: i, error } = await client
    .from("cs_inquiries")
    .select(
      "inquiry_id, display_no, author_id, category, title, body_md, status, is_private, created_at, answered_at",
    )
    .eq("inquiry_id", inquiryId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!i) return null; // RLS 로 비가시면 null
  const { data: reps } = await client
    .from("cs_inquiry_replies")
    .select("reply_id, role, author_id, body_md, created_at")
    .eq("inquiry_id", inquiryId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  return {
    inquiryId: i.inquiry_id,
    displayNo: Number(i.display_no),
    authorId: i.author_id,
    category: i.category,
    title: i.title,
    bodyMd: i.body_md,
    status: i.status,
    isPrivate: i.is_private,
    createdAt: i.created_at,
    answeredAt: i.answered_at,
    replyCount: (reps ?? []).length,
    replies: (reps ?? []).map((r) => ({
      replyId: r.reply_id,
      role: r.role === "staff" ? "staff" : "student",
      authorId: r.author_id,
      bodyMd: r.body_md,
      createdAt: r.created_at,
    })),
  };
}

export async function createInquiry(
  client: Client,
  input: {
    authorId: string;
    category: CsCategory;
    title: string;
    bodyMd: string;
    isPrivate: boolean;
  },
): Promise<{ inquiryId: string; displayNo: number }> {
  const { data, error } = await client
    .from("cs_inquiries")
    .insert({
      author_id: input.authorId,
      category: input.category,
      title: input.title,
      body_md: input.bodyMd,
      is_private: input.isPrivate,
    })
    .select("inquiry_id, display_no")
    .single();
  if (error) throw error;
  return { inquiryId: data.inquiry_id, displayNo: Number(data.display_no) };
}

/** 작성자 본인 미답변(open) 문의 수정. RLS 가 open+본인 제약을 강제. */
export async function updateInquiry(
  client: Client,
  inquiryId: string,
  input: { category: CsCategory; title: string; bodyMd: string; isPrivate: boolean },
): Promise<void> {
  const { error } = await client
    .from("cs_inquiries")
    .update({
      category: input.category,
      title: input.title,
      body_md: input.bodyMd,
      is_private: input.isPrivate,
    })
    .eq("inquiry_id", inquiryId);
  if (error) throw error;
}

export async function addReply(
  client: Client,
  input: {
    inquiryId: string;
    authorId: string;
    role: "student" | "staff";
    bodyMd: string;
  },
): Promise<void> {
  const { error } = await client.from("cs_inquiry_replies").insert({
    inquiry_id: input.inquiryId,
    author_id: input.authorId,
    role: input.role,
    body_md: input.bodyMd,
  });
  if (error) throw error;
}

/** staff 답변 등록 시 상태를 answered 로 전환(최초 답변 시각·답변자 기록). */
export async function markAnswered(
  client: Client,
  inquiryId: string,
  staffId: string,
): Promise<void> {
  const { error } = await client
    .from("cs_inquiries")
    .update({
      status: "answered",
      answered_by: staffId,
      answered_at: new Date().toISOString(),
    })
    .eq("inquiry_id", inquiryId);
  if (error) throw error;
}

export async function setInquiryStatus(
  client: Client,
  inquiryId: string,
  status: CsStatus,
): Promise<void> {
  const { error } = await client
    .from("cs_inquiries")
    .update({ status })
    .eq("inquiry_id", inquiryId);
  if (error) throw error;
}

export async function softDeleteInquiry(
  client: Client,
  inquiryId: string,
): Promise<void> {
  const { error } = await client.rpc("soft_delete_cs_inquiry", {
    p_inquiry_id: inquiryId,
  });
  if (error) throw error;
}
