// 메모 (조문/판례/문제) 서버 쿼리.
// 폴리모픽 — target_type + target_id. 강사·수험생 모두 작성.
// 가시성(feat-8-023): 강사 작성 메모는 전체 공개, 수험생 작성 메모는 본인 전용 (RLS).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import {
  scienceProblemHref,
  scienceSubjectName,
} from "~/features/subjects/lib/science";

export type CommentTargetType = "article" | "case" | "problem";

export interface ContentComment {
  commentId: string;
  targetType: CommentTargetType;
  targetId: string;
  bodyMd: string;
  authorId: string | null;
  authorName: string | null;
  /** 작성자가 강사·원장인지. true = 전체 공개 메모, false = 작성자 본인 전용. */
  authorIsStaff: boolean;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
}

const COMMENT_COLUMNS =
  "comment_id, target_type, target_id, body_md, author_id, is_pinned, created_at, updated_at, profiles!content_comments_author_id_fkey(name, role)";

type CommentRow = {
  comment_id: string;
  target_type: string;
  target_id: string;
  body_md: string;
  author_id: string | null;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
  profiles: { name: string | null; role: string } | null;
};

function mapComment(r: CommentRow): ContentComment {
  return {
    commentId: r.comment_id,
    targetType: r.target_type as CommentTargetType,
    targetId: r.target_id,
    bodyMd: r.body_md,
    authorId: r.author_id,
    authorName: r.profiles?.name ?? null,
    authorIsStaff:
      r.profiles?.role === "instructor" ||
      r.profiles?.role === "manager" ||
      r.profiles?.role === "admin",
    isPinned: r.is_pinned,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// 여러 target 일괄 fetch — chapter/systematic 뷰어처럼 N개 조문이 한 화면에 노출될 때.
export async function listCommentsBulk(
  client: SupabaseClient<Database>,
  targetType: CommentTargetType,
  targetIds: string[],
): Promise<Record<string, ContentComment[]>> {
  if (targetIds.length === 0) return {};
  const { data, error } = await client
    .from("content_comments")
    .select(COMMENT_COLUMNS)
    .eq("target_type", targetType)
    .in("target_id", targetIds)
    .is("deleted_at", null)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  const out: Record<string, ContentComment[]> = {};
  for (const r of (data ?? []) as CommentRow[]) {
    const item = mapComment(r);
    if (!out[item.targetId]) out[item.targetId] = [];
    out[item.targetId].push(item);
  }
  return out;
}

export async function listComments(
  client: SupabaseClient<Database>,
  targetType: CommentTargetType,
  targetId: string,
): Promise<ContentComment[]> {
  const { data, error } = await client
    .from("content_comments")
    .select(COMMENT_COLUMNS)
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .is("deleted_at", null)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as CommentRow[]).map(mapComment);
}

export async function createComment(
  client: SupabaseClient<Database>,
  input: {
    targetType: CommentTargetType;
    targetId: string;
    authorId: string;
    bodyMd: string;
    isPinned?: boolean;
  },
): Promise<{ ok: true; commentId: string } | { ok: false; error: string }> {
  const { data, error } = await client
    .from("content_comments")
    .insert({
      target_type: input.targetType,
      target_id: input.targetId,
      body_md: input.bodyMd,
      author_id: input.authorId,
      is_pinned: input.isPinned ?? false,
    })
    .select("comment_id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, commentId: data.comment_id };
}

export async function updateComment(
  client: SupabaseClient<Database>,
  commentId: string,
  patch: { bodyMd?: string; isPinned?: boolean },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const update: Record<string, unknown> = {};
  if (patch.bodyMd !== undefined) update.body_md = patch.bodyMd;
  if (patch.isPinned !== undefined) update.is_pinned = patch.isPinned;
  if (Object.keys(update).length === 0)
    return { ok: false, error: "변경할 내용 없음" };
  const { error } = await client
    .from("content_comments")
    .update(update)
    .eq("comment_id", commentId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// soft delete — 수험생 작성 메모는 학습 데이터이므로 deleted_at 으로만 삭제 (CLAUDE.md #9).
export async function deleteComment(
  client: SupabaseClient<Database>,
  commentId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await client
    .from("content_comments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("comment_id", commentId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ── 메모 모아보기 (/study/comments 학습보조 화면) ─────────────────────────

export interface CommentListItem {
  commentId: string;
  targetType: CommentTargetType;
  /** 자연과학 문제는 law 가 없어 null. */
  lawCode: string | null;
  /** 대상 콘텐츠 제목 (조문 라벨 / 판례명 / 문제 연도·번호). */
  primaryLabel: string;
  secondaryLabel: string | null;
  /** 문제 메모일 때 발문 일부. */
  bodySnippet: string | null;
  bodyMd: string;
  href: string;
  updatedAt: string;
}

// 한 사용자가 작성한 메모(content_comments) 전체 — 최근 수정 순. 대상 콘텐츠로
// 진입할 수 있도록 조문/판례/문제 라벨·링크를 함께 해소한다. listAllMemos 본뜸.
export async function listAllComments(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<CommentListItem[]> {
  const { data: rows, error } = await client
    .from("content_comments")
    .select("comment_id, target_type, target_id, body_md, updated_at")
    .eq("author_id", userId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(2000);
  if (error) throw error;
  const list = (rows ?? []) as Array<{
    comment_id: string;
    target_type: string;
    target_id: string;
    body_md: string;
    updated_at: string;
  }>;
  if (list.length === 0) return [];

  const articleIds = list
    .filter((r) => r.target_type === "article")
    .map((r) => r.target_id);
  const caseIds = list
    .filter((r) => r.target_type === "case")
    .map((r) => r.target_id);
  const problemIds = list
    .filter((r) => r.target_type === "problem")
    .map((r) => r.target_id);

  const { articleSlug } = await import("~/features/laws/lib/identifier");

  const articleMap = new Map<
    string,
    { displayLabel: string; lawCode: string; pathSlug: string }
  >();
  if (articleIds.length > 0) {
    const { data: rs } = await client
      .from("articles")
      .select("article_id, article_number, display_label, laws!inner(law_code)")
      .in("article_id", articleIds);
    for (const r of rs ?? []) {
      if (!r.article_number) continue;
      articleMap.set(r.article_id, {
        displayLabel: r.display_label,
        lawCode: r.laws.law_code,
        pathSlug: articleSlug(r.article_number),
      });
    }
  }

  const caseMap = new Map<
    string,
    { caseNumber: string; caseTitle: string | null; lawCode: string }
  >();
  if (caseIds.length > 0) {
    const { data: rs } = await client
      .from("cases")
      .select("case_id, case_number, case_title, subject_laws")
      .in("case_id", caseIds);
    for (const r of rs ?? []) {
      caseMap.set(r.case_id, {
        caseNumber: r.case_number,
        caseTitle: r.case_title,
        lawCode: (r.subject_laws as string[] | null)?.[0] ?? "patent",
      });
    }
  }

  const problemMap = new Map<
    string,
    {
      year: number | null;
      problemNumber: number | null;
      bodySnippet: string;
      lawCode: string | null;
      scienceSubject: string | null;
    }
  >();
  if (problemIds.length > 0) {
    const { data: ps } = await client
      .from("problems")
      .select(
        "problem_id, year, problem_number, body_md, science_subject, laws(law_code)",
      )
      .in("problem_id", problemIds);
    for (const p of ps ?? []) {
      const body = p.body_md ?? "";
      problemMap.set(p.problem_id, {
        year: p.year,
        problemNumber: p.problem_number,
        bodySnippet: body.length > 80 ? `${body.slice(0, 80)}…` : body,
        lawCode: p.laws?.law_code ?? null,
        scienceSubject: p.science_subject,
      });
    }
  }

  return list.flatMap((r): CommentListItem[] => {
    const base = {
      commentId: r.comment_id,
      targetType: r.target_type as CommentTargetType,
      bodyMd: r.body_md,
      updatedAt: r.updated_at,
    };
    if (r.target_type === "article") {
      const a = articleMap.get(r.target_id);
      if (!a) return [];
      return [
        {
          ...base,
          lawCode: a.lawCode,
          primaryLabel: a.displayLabel,
          secondaryLabel: null,
          bodySnippet: null,
          href: `/subjects/${a.lawCode}/articles/${a.pathSlug}`,
        },
      ];
    }
    if (r.target_type === "case") {
      const c = caseMap.get(r.target_id);
      if (!c) return [];
      return [
        {
          ...base,
          lawCode: c.lawCode,
          primaryLabel: c.caseTitle ?? c.caseNumber,
          secondaryLabel: c.caseTitle ? c.caseNumber : null,
          bodySnippet: null,
          href: `/subjects/${c.lawCode}/cases/${r.target_id}`,
        },
      ];
    }
    if (r.target_type === "problem") {
      const p = problemMap.get(r.target_id);
      if (!p) return [];
      const sci = p.scienceSubject;
      if (!p.lawCode && !sci) return [];
      const yearLabel = p.year
        ? `${p.year}년${p.problemNumber ? ` · ${p.problemNumber}번` : ""}`
        : "문제";
      return [
        {
          ...base,
          lawCode: sci ? null : p.lawCode,
          primaryLabel: sci ? `${scienceSubjectName(sci)} ${yearLabel}` : yearLabel,
          secondaryLabel: null,
          bodySnippet: p.bodySnippet,
          href: sci
            ? scienceProblemHref(sci, r.target_id)
            : `/subjects/${p.lawCode}/problems/${r.target_id}`,
        },
      ];
    }
    return [];
  });
}
