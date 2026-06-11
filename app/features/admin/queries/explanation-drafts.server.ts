// feat-3-305 기출 해설 검수 — 대기(pending) 초안 목록 조회 + 검수 진행률 집계.
// 호출 loader 가 staff 권한을 검증했다고 가정하고 adminClient(RLS 우회)로 읽는다
// (problems/problem_choices join — profiles 처럼 staff 교차읽기 안전을 위해 admin 사용).
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";

export type ScienceSubject = Database["public"]["Enums"]["science_subject"];

const CIRCLED = ["", "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];
const SUBJECT_KO: Record<string, string> = {
  physics: "물리",
  chemistry: "화학",
  biology: "생물",
  earth_science: "지구과학",
};
const DEFAULT_PAGE_SIZE = 20;

export interface ExplanationDraftItem {
  draftId: string;
  problemId: string;
  year: number | null;
  problemNumber: number | null;
  scienceSubject: string | null;
  scienceSubjectKo: string;
  bodyMd: string;
  aiAnswer: string | null;
  answerMatch: boolean | null;
  officialAnswer: string;
  contentMd: string;
  createdAt: string;
}

export interface ExplanationDraftListOpts {
  subject?: ScienceSubject;
  year?: number;
  mismatchOnly?: boolean;
  page?: number; // 1-based
  pageSize?: number;
}

export interface ExplanationDraftListResult {
  items: ExplanationDraftItem[];
  /** 현재 필터(과목/연도/불일치)에 매칭되는 대기 초안 총수 — 페이지네이션 기준 */
  filteredTotal: number;
  page: number;
  pageSize: number;
  /** 전역 검수 진행률 KPI (필터 무관) */
  pendingTotal: number;
  mismatchTotal: number;
  approvedTotal: number;
  rejectedTotal: number;
}

interface RawDraftRow {
  draft_id: string;
  content_md: string;
  ai_answer: string | null;
  answer_match: boolean | null;
  created_at: string;
  problems: {
    problem_id: string;
    year: number | null;
    problem_number: number | null;
    science_subject: string | null;
    body_md: string;
  };
}

export async function listExplanationDrafts(
  opts: ExplanationDraftListOpts = {},
): Promise<ExplanationDraftListResult> {
  const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;
  const page = Math.max(1, opts.page ?? 1);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = adminClient
    .from("problem_explanation_drafts")
    .select(
      "draft_id, content_md, ai_answer, answer_match, created_at, problems!inner(problem_id, year, problem_number, science_subject, body_md)",
      { count: "exact" },
    )
    .eq("status", "pending");
  if (opts.subject) q = q.eq("problems.science_subject", opts.subject);
  if (typeof opts.year === "number") q = q.eq("problems.year", opts.year);
  if (opts.mismatchOnly) q = q.or("answer_match.is.null,answer_match.is.false");
  q = q
    .order("answer_match", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true })
    .range(from, to);

  const { data, error, count: filteredTotal } = await q;
  if (error) throw error;
  const rows = (data as unknown as RawDraftRow[] | null) ?? [];

  const problemIds = rows.map((r) => r.problems.problem_id);
  const officialMap = new Map<string, number[]>();
  if (problemIds.length > 0) {
    const { data: ch } = await adminClient
      .from("problem_choices")
      .select("problem_id, choice_index")
      .eq("is_correct", true)
      .in("problem_id", problemIds);
    for (const c of ch ?? []) {
      const arr = officialMap.get(c.problem_id) ?? [];
      arr.push(c.choice_index);
      officialMap.set(c.problem_id, arr);
    }
  }

  const items: ExplanationDraftItem[] = rows.map((r) => {
    const p = r.problems;
    const official = (officialMap.get(p.problem_id) ?? [])
      .sort((a, b) => a - b)
      .map((i) => CIRCLED[i] ?? String(i))
      .join(", ");
    return {
      draftId: r.draft_id,
      problemId: p.problem_id,
      year: p.year,
      problemNumber: p.problem_number,
      scienceSubject: p.science_subject,
      scienceSubjectKo: p.science_subject
        ? (SUBJECT_KO[p.science_subject] ?? p.science_subject)
        : "",
      bodyMd: p.body_md,
      aiAnswer: r.ai_answer,
      answerMatch: r.answer_match,
      officialAnswer: official,
      contentMd: r.content_md,
      createdAt: r.created_at,
    };
  });

  // 전역 진행률 KPI (필터 무관) — 검수가 끝을 향해 가는지 가늠.
  const countByStatus = (status: "pending" | "approved" | "rejected") =>
    adminClient
      .from("problem_explanation_drafts")
      .select("draft_id", { count: "exact", head: true })
      .eq("status", status);
  const [pendingRes, mismatchRes, approvedRes, rejectedRes] = await Promise.all([
    countByStatus("pending"),
    countByStatus("pending").or("answer_match.is.null,answer_match.is.false"),
    countByStatus("approved"),
    countByStatus("rejected"),
  ]);

  return {
    items,
    filteredTotal: filteredTotal ?? 0,
    page,
    pageSize,
    pendingTotal: pendingRes.count ?? 0,
    mismatchTotal: mismatchRes.count ?? 0,
    approvedTotal: approvedRes.count ?? 0,
    rejectedTotal: rejectedRes.count ?? 0,
  };
}
