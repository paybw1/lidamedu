// 자연과학 지문 텍스트 전사 검수 — 대기(pending) 초안 목록.
// 호출 loader 가 staff 권한 검증했다고 가정하고 adminClient(RLS 우회)로 읽는다.
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";

export type ScienceSubject = Database["public"]["Enums"]["science_subject"];

const SUBJECT_KO: Record<string, string> = {
  physics: "물리",
  chemistry: "화학",
  biology: "생물",
  earth_science: "지구과학",
};

export interface TextDraftItem {
  draftId: string;
  problemId: string;
  year: number | null;
  problemNumber: number | null;
  scienceSubject: string | null;
  scienceSubjectKo: string;
  originalBodyMd: string; // 현재 운영 본문(원본 이미지 마크다운)
  stemMd: string;
  choices: string[];
  hasFigure: boolean;
  recropPath: string | null;
  createdAt: string;
}

export interface TextDraftListOpts {
  subject?: ScienceSubject;
  year?: number;
  figureOnly?: boolean;
  page?: number;
  pageSize?: number;
}

interface RawRow {
  draft_id: string;
  stem_md: string;
  choices: unknown;
  has_figure: boolean;
  recrop_path: string | null;
  created_at: string;
  problems: {
    problem_id: string;
    year: number | null;
    problem_number: number | null;
    science_subject: string | null;
    body_md: string;
  };
}

export interface TextDraftListResult {
  items: TextDraftItem[];
  filteredTotal: number;
  page: number;
  pageSize: number;
  pendingTotal: number;
  figureTotal: number;
  approvedTotal: number;
}

export async function listTextDrafts(
  opts: TextDraftListOpts = {},
): Promise<TextDraftListResult> {
  const pageSize = opts.pageSize ?? 20;
  const page = Math.max(1, opts.page ?? 1);
  const from = (page - 1) * pageSize;

  let q = adminClient
    .from("problem_text_drafts")
    .select(
      "draft_id, stem_md, choices, has_figure, recrop_path, created_at, problems!inner(problem_id, year, problem_number, science_subject, body_md)",
      { count: "exact" },
    )
    .eq("status", "pending");
  if (opts.subject) q = q.eq("problems.science_subject", opts.subject);
  if (typeof opts.year === "number") q = q.eq("problems.year", opts.year);
  if (opts.figureOnly) q = q.eq("has_figure", true);
  q = q
    .order("created_at", { ascending: true })
    .range(from, from + pageSize - 1);

  const { data, error, count: filteredTotal } = await q;
  if (error) throw error;
  const rows = (data as unknown as RawRow[] | null) ?? [];

  const items: TextDraftItem[] = rows.map((r) => {
    const p = r.problems;
    return {
      draftId: r.draft_id,
      problemId: p.problem_id,
      year: p.year,
      problemNumber: p.problem_number,
      scienceSubject: p.science_subject,
      scienceSubjectKo: p.science_subject
        ? (SUBJECT_KO[p.science_subject] ?? p.science_subject)
        : "",
      originalBodyMd: p.body_md,
      stemMd: r.stem_md,
      choices: Array.isArray(r.choices) ? (r.choices as string[]) : [],
      hasFigure: r.has_figure,
      recropPath: r.recrop_path,
      createdAt: r.created_at,
    };
  });

  const countByStatus = (status: "pending" | "approved" | "rejected") =>
    adminClient
      .from("problem_text_drafts")
      .select("draft_id", { count: "exact", head: true })
      .eq("status", status);
  const [pendingRes, figureRes, approvedRes] = await Promise.all([
    countByStatus("pending"),
    countByStatus("pending").eq("has_figure", true),
    countByStatus("approved"),
  ]);

  return {
    items,
    filteredTotal: filteredTotal ?? 0,
    page,
    pageSize,
    pendingTotal: pendingRes.count ?? 0,
    figureTotal: figureRes.count ?? 0,
    approvedTotal: approvedRes.count ?? 0,
  };
}
