// feat-3-305 기출 해설 검수 — 대기(pending) 초안 목록 조회.
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
  limit?: number;
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

export async function listExplanationDrafts(opts: ExplanationDraftListOpts = {}): Promise<{
  items: ExplanationDraftItem[];
  pendingTotal: number;
  mismatchTotal: number;
}> {
  const limit = opts.limit ?? 50;
  let q = adminClient
    .from("problem_explanation_drafts")
    .select(
      "draft_id, content_md, ai_answer, answer_match, created_at, problems!inner(problem_id, year, problem_number, science_subject, body_md)",
    )
    .eq("status", "pending");
  if (opts.subject) q = q.eq("problems.science_subject", opts.subject);
  if (typeof opts.year === "number") q = q.eq("problems.year", opts.year);
  if (opts.mismatchOnly) q = q.or("answer_match.is.null,answer_match.is.false");
  q = q
    .order("answer_match", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true })
    .limit(limit);

  const { data, error } = await q;
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
      scienceSubjectKo: p.science_subject ? (SUBJECT_KO[p.science_subject] ?? p.science_subject) : "",
      bodyMd: p.body_md,
      aiAnswer: r.ai_answer,
      answerMatch: r.answer_match,
      officialAnswer: official,
      contentMd: r.content_md,
      createdAt: r.created_at,
    };
  });

  const { count: pendingTotal } = await adminClient
    .from("problem_explanation_drafts")
    .select("draft_id", { count: "exact", head: true })
    .eq("status", "pending");
  const { count: mismatchTotal } = await adminClient
    .from("problem_explanation_drafts")
    .select("draft_id", { count: "exact", head: true })
    .eq("status", "pending")
    .or("answer_match.is.null,answer_match.is.false");

  return { items, pendingTotal: pendingTotal ?? 0, mismatchTotal: mismatchTotal ?? 0 };
}
