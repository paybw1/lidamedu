// MCQ 팩(pack) 서버 쿼리. 색인 + CRUD + 문제 매핑 + mock 세션 시작.
// RLS: 학생은 published pack 만 read, staff 는 모든 pack read/write.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import type {
  McqPackItem,
  McqPackKind,
  McqPackProblemItem,
  McqPackSubjectScope,
} from "./labels";

export type {
  McqPackItem,
  McqPackKind,
  McqPackProblemItem,
  McqPackSubjectScope,
} from "./labels";
export {
  MCQ_PACK_KIND_LABELS,
  MCQ_PACK_KIND_SHORT,
  MCQ_PACK_SUBJECT_LABELS,
  isMockKind,
} from "./labels";

const LIST_COLUMNS =
  "pack_id, kind, subject_scope, title, description, year, exam_round_no, duration_min, video_url, result_doc_url, published_at, is_published, created_at, updated_at";

interface PackRow {
  pack_id: string;
  kind: string;
  subject_scope: string;
  title: string;
  description: string | null;
  year: number | null;
  exam_round_no: number | null;
  duration_min: number | null;
  video_url: string | null;
  result_doc_url: string | null;
  published_at: string | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

function isPackKind(value: string): value is McqPackKind {
  return (
    value === "past_exam" ||
    value === "mock_full" ||
    value === "mock_progressive" ||
    value === "other"
  );
}

function isSubjectScope(value: string): value is McqPackSubjectScope {
  return (
    value === "industrial" ||
    value === "civil" ||
    value === "civil_procedure" ||
    value === "science"
  );
}

function rowToItem(row: PackRow, problemCount: number): McqPackItem {
  return {
    packId: row.pack_id,
    kind: isPackKind(row.kind) ? row.kind : "other",
    subjectScope: isSubjectScope(row.subject_scope)
      ? row.subject_scope
      : "industrial",
    title: row.title,
    description: row.description,
    year: row.year,
    examRoundNo: row.exam_round_no,
    durationMin: row.duration_min,
    videoUrl: row.video_url,
    resultDocUrl: row.result_doc_url,
    publishedAt: row.published_at,
    isPublished: row.is_published,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    problemCount,
  };
}

export interface ListPacksOptions {
  subjectScope?: McqPackSubjectScope;
  kind?: McqPackKind;
  query?: string;
}

export async function listPacks(
  client: SupabaseClient<Database>,
  options: ListPacksOptions = {},
): Promise<McqPackItem[]> {
  let q = client
    .from("mcq_packs")
    .select(LIST_COLUMNS)
    .is("deleted_at", null);
  if (options.subjectScope) q = q.eq("subject_scope", options.subjectScope);
  if (options.kind) q = q.eq("kind", options.kind);
  const trimmed = options.query?.trim();
  if (trimmed) {
    const escaped = trimmed.replaceAll("%", "").replaceAll(",", " ");
    const pattern = `%${escaped}%`;
    q = q.or(`title.ilike.${pattern},description.ilike.${pattern}`);
  }
  const { data: packRows, error } = await q
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;

  const packs = (packRows ?? []) as PackRow[];
  if (packs.length === 0) return [];

  // 문제 수 일괄 조회.
  const { data: countRows } = await client
    .from("mcq_pack_problems")
    .select("pack_id")
    .in(
      "pack_id",
      packs.map((p) => p.pack_id),
    );
  const countByPack = new Map<string, number>();
  for (const r of countRows ?? []) {
    countByPack.set(r.pack_id, (countByPack.get(r.pack_id) ?? 0) + 1);
  }

  return packs.map((p) => rowToItem(p, countByPack.get(p.pack_id) ?? 0));
}

export async function getPackById(
  client: SupabaseClient<Database>,
  packId: string,
): Promise<McqPackItem | null> {
  const { data, error } = await client
    .from("mcq_packs")
    .select(LIST_COLUMNS)
    .eq("pack_id", packId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { count } = await client
    .from("mcq_pack_problems")
    .select("problem_id", { count: "exact", head: true })
    .eq("pack_id", packId);
  return rowToItem(data as PackRow, count ?? 0);
}

// 팩에 속한 문제들 — ord 순서. problem 본문 일부 포함.
export async function listPackProblems(
  client: SupabaseClient<Database>,
  packId: string,
): Promise<McqPackProblemItem[]> {
  const { data, error } = await client
    .from("mcq_pack_problems")
    .select(
      "ord, problem_id, problems!inner(problem_id, problem_number, format, origin, year, body_md, law_id, science_subject, laws(law_code))",
    )
    .eq("pack_id", packId)
    .order("ord", { ascending: true });
  if (error) throw error;
  return (data ?? [])
    .filter((r) => r.problems !== null)
    .map((r) => {
      const p = r.problems!;
      const bodyMd = p.body_md ?? "";
      const snippet =
        bodyMd.length > 160 ? bodyMd.slice(0, 160).trimEnd() + "…" : bodyMd;
      return {
        problemId: p.problem_id,
        ord: r.ord,
        problemNumber: p.problem_number,
        format: p.format,
        origin: p.origin,
        year: p.year,
        bodySnippet: snippet,
        lawCode: p.laws?.law_code ?? null,
        scienceSubject: p.science_subject ?? null,
      };
    });
}

// ---- 변경 ----
export interface UpsertPackInput {
  kind: McqPackKind;
  subjectScope: McqPackSubjectScope;
  title: string;
  description?: string | null;
  year?: number | null;
  examRoundNo?: number | null;
  durationMin?: number | null;
  videoUrl?: string | null;
  resultDocUrl?: string | null;
  publishedAt?: string | null;
  isPublished?: boolean;
}

export async function createPack(
  client: SupabaseClient<Database>,
  input: UpsertPackInput,
  authorId: string,
): Promise<{ ok: true; packId: string } | { ok: false; error: string }> {
  const { data, error } = await client
    .from("mcq_packs")
    .insert({
      kind: input.kind,
      subject_scope: input.subjectScope,
      title: input.title,
      description: input.description ?? null,
      year: input.year ?? null,
      exam_round_no: input.examRoundNo ?? null,
      duration_min: input.durationMin ?? null,
      video_url: input.videoUrl ?? null,
      result_doc_url: input.resultDocUrl ?? null,
      published_at: input.publishedAt ?? null,
      is_published: input.isPublished ?? true,
      created_by: authorId,
    })
    .select("pack_id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, packId: data.pack_id };
}

export async function updatePack(
  client: SupabaseClient<Database>,
  packId: string,
  patch: Partial<UpsertPackInput>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const update: Record<string, unknown> = {};
  if (patch.kind !== undefined) update.kind = patch.kind;
  if (patch.subjectScope !== undefined)
    update.subject_scope = patch.subjectScope;
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.year !== undefined) update.year = patch.year;
  if (patch.examRoundNo !== undefined) update.exam_round_no = patch.examRoundNo;
  if (patch.durationMin !== undefined) update.duration_min = patch.durationMin;
  if (patch.videoUrl !== undefined) update.video_url = patch.videoUrl;
  if (patch.resultDocUrl !== undefined)
    update.result_doc_url = patch.resultDocUrl;
  if (patch.publishedAt !== undefined) update.published_at = patch.publishedAt;
  if (patch.isPublished !== undefined) update.is_published = patch.isPublished;
  if (Object.keys(update).length === 0) return { ok: true };
  const { error } = await client
    .from("mcq_packs")
    .update(update)
    .eq("pack_id", packId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deletePack(
  client: SupabaseClient<Database>,
  packId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await client
    .from("mcq_packs")
    .update({ deleted_at: new Date().toISOString() })
    .eq("pack_id", packId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// problem_id 직접 add. ord 는 현재 최대 ord + 1.
export async function addPackProblem(
  client: SupabaseClient<Database>,
  packId: string,
  problemId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: maxRow } = await client
    .from("mcq_pack_problems")
    .select("ord")
    .eq("pack_id", packId)
    .order("ord", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrd = (maxRow?.ord ?? -1) + 1;
  const { error } = await client.from("mcq_pack_problems").insert({
    pack_id: packId,
    problem_id: problemId,
    ord: nextOrd,
  });
  if (error) {
    if (error.code === "23505") return { ok: true }; // 이미 추가됨
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function removePackProblem(
  client: SupabaseClient<Database>,
  packId: string,
  problemId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await client
    .from("mcq_pack_problems")
    .delete()
    .eq("pack_id", packId)
    .eq("problem_id", problemId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// 팩에 속한 problem_id 들을 ord 순으로 반환. session 시작에 사용.
export async function getPackProblemIds(
  client: SupabaseClient<Database>,
  packId: string,
): Promise<string[]> {
  const { data, error } = await client
    .from("mcq_pack_problems")
    .select("problem_id, ord")
    .eq("pack_id", packId)
    .order("ord", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => r.problem_id);
}

// 기출 팩 자동 재생성 — problems 의 (subject_scope, year) 별로 past_exam 1차 문제 묶음.
// 같은 (kind=past_exam, subject_scope, year) 페어가 이미 있으면 제목/문제 목록을 갱신.
// 자연과학(science) 은 subject_type='science' 로 분기.
export interface RegeneratePastExamResult {
  packsUpserted: number;
  problemsTotal: number;
  groups: Array<{
    subjectScope: McqPackSubjectScope;
    year: number;
    problemCount: number;
  }>;
}

function mapLawCodeToScope(
  code: string | null | undefined,
): McqPackSubjectScope | null {
  if (!code) return null;
  if (code === "patent" || code === "trademark" || code === "design")
    return "industrial";
  if (code === "civil") return "civil";
  if (code === "civil-procedure") return "civil_procedure";
  return null;
}

export async function regeneratePastExamPacks(
  client: SupabaseClient<Database>,
  authorId: string,
): Promise<RegeneratePastExamResult> {
  // 1차 객관식 기출만. (2차 주관식은 /latest/essay 영역, science 도 1차 선택과목이라 포함.)
  const PAGE = 1000;
  const allRows: Array<{
    problem_id: string;
    year: number | null;
    subject_type: string;
    laws: { law_code: string } | null;
  }> = [];
  let from = 0;
  for (;;) {
    const { data, error } = await client
      .from("problems")
      .select("problem_id, year, subject_type, laws(law_code)")
      .eq("origin", "past_exam")
      .eq("exam_round", "first")
      .is("deleted_at", null)
      .not("year", "is", null)
      .order("problem_number", { ascending: true, nullsFirst: false })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data) allRows.push(r as (typeof allRows)[number]);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  // (scope, year) 별 문제 ID 모음.
  const groups = new Map<
    string,
    { scope: McqPackSubjectScope; year: number; problemIds: string[] }
  >();
  for (const r of allRows) {
    if (r.year === null) continue;
    let scope: McqPackSubjectScope | null = null;
    if (r.subject_type === "science") {
      scope = "science";
    } else {
      scope = mapLawCodeToScope(r.laws?.law_code);
    }
    if (!scope) continue;
    const key = `${scope}|${r.year}`;
    const g = groups.get(key) ?? { scope, year: r.year, problemIds: [] };
    g.problemIds.push(r.problem_id);
    groups.set(key, g);
  }

  // 각 그룹 upsert.
  const summary: RegeneratePastExamResult["groups"] = [];
  for (const g of groups.values()) {
    const title = `${g.year}년 1차 기출`;
    const { data: existing } = await client
      .from("mcq_packs")
      .select("pack_id")
      .eq("kind", "past_exam")
      .eq("subject_scope", g.scope)
      .eq("year", g.year)
      .is("deleted_at", null)
      .maybeSingle();

    let packId: string;
    if (existing) {
      packId = existing.pack_id;
      const { error: upErr } = await client
        .from("mcq_packs")
        .update({ title })
        .eq("pack_id", packId);
      if (upErr) throw upErr;
    } else {
      const { data: inserted, error: insErr } = await client
        .from("mcq_packs")
        .insert({
          kind: "past_exam",
          subject_scope: g.scope,
          title,
          year: g.year,
          is_published: true,
          created_by: authorId,
        })
        .select("pack_id")
        .single();
      if (insErr) throw insErr;
      packId = inserted.pack_id;
    }

    // 기존 매핑 삭제 후 재삽입.
    const { error: delErr } = await client
      .from("mcq_pack_problems")
      .delete()
      .eq("pack_id", packId);
    if (delErr) throw delErr;
    if (g.problemIds.length > 0) {
      const rows = g.problemIds.map((pid, i) => ({
        pack_id: packId,
        problem_id: pid,
        ord: i,
      }));
      // 1000 한도 분할.
      const CHUNK = 1000;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const slice = rows.slice(i, i + CHUNK);
        const { error: insRowErr } = await client
          .from("mcq_pack_problems")
          .insert(slice);
        if (insRowErr) throw insRowErr;
      }
    }
    summary.push({
      subjectScope: g.scope,
      year: g.year,
      problemCount: g.problemIds.length,
    });
  }

  // 결과 정리: scope, year 내림차순.
  summary.sort((a, b) => {
    if (a.subjectScope !== b.subjectScope)
      return a.subjectScope.localeCompare(b.subjectScope);
    return b.year - a.year;
  });

  return {
    packsUpserted: groups.size,
    problemsTotal: allRows.length,
    groups: summary,
  };
}

// 통계 — 팩 안 모든 문제의 전체 attempt 집계.
export interface PackTypeStats {
  // format 별 (mc_short/mc_box/mc_case 등) 정답률
  byFormat: Record<string, { total: number; correct: number }>;
  // 지문 타입 별 (statute/precedent/theory)
  byChoiceType: Record<string, { total: number; correct: number }>;
}

// 한 세션 결과 + 팩 통계 묶음.
export interface PackResultDetail {
  packId: string;
  packTitle: string;
  sessionUserStats: PackTypeStats; // 본인 응답 기준
  sessionAggStats: PackTypeStats; // 같은 문제들에 대한 전체 사용자 응답 기준
}

export async function getPackResultStats(
  client: SupabaseClient<Database>,
  packId: string,
  sessionId: string,
  userId: string,
): Promise<PackResultDetail | null> {
  const pack = await getPackById(client, packId);
  if (!pack) return null;

  // 1) 세션의 본인 응답.
  const { data: myAttempts, error: myErr } = await client
    .from("user_problem_attempts")
    .select(
      "problem_id, selected_choice_id, is_correct, problems!inner(format)",
    )
    .eq("session_id", sessionId)
    .eq("user_id", userId);
  if (myErr) throw myErr;

  const sessionUserStats: PackTypeStats = {
    byFormat: {},
    byChoiceType: {},
  };

  const choiceIds = (myAttempts ?? [])
    .map((a) => a.selected_choice_id)
    .filter((x): x is string => x != null);
  let choiceTypeById = new Map<string, string | null>();
  if (choiceIds.length > 0) {
    const { data: choiceRows } = await client
      .from("problem_choices")
      .select("choice_id, choice_type")
      .in("choice_id", choiceIds);
    for (const c of choiceRows ?? []) {
      choiceTypeById.set(c.choice_id, c.choice_type ?? null);
    }
  }

  for (const a of myAttempts ?? []) {
    const fmt = a.problems?.format ?? "unknown";
    const f = (sessionUserStats.byFormat[fmt] ??= { total: 0, correct: 0 });
    f.total += 1;
    if (a.is_correct) f.correct += 1;
    const choiceType = a.selected_choice_id
      ? choiceTypeById.get(a.selected_choice_id) ?? null
      : null;
    if (choiceType) {
      const c = (sessionUserStats.byChoiceType[choiceType] ??= {
        total: 0,
        correct: 0,
      });
      c.total += 1;
      if (a.is_correct) c.correct += 1;
    }
  }

  // 2) 같은 문제들에 대한 전체 사용자 응답 (모든 시도).
  const problemIds = await getPackProblemIds(client, packId);
  const sessionAggStats: PackTypeStats = {
    byFormat: {},
    byChoiceType: {},
  };
  if (problemIds.length > 0) {
    const PAGE = 1000;
    let from = 0;
    for (;;) {
      const { data, error } = await client
        .from("user_problem_attempts")
        .select(
          "problem_id, selected_choice_id, is_correct, problems!inner(format)",
        )
        .in("problem_id", problemIds)
        .range(from, from + PAGE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      // 누락된 choice_type 추가 fetch.
      const newIds = data
        .map((a) => a.selected_choice_id)
        .filter(
          (x): x is string => x != null && !choiceTypeById.has(x),
        );
      if (newIds.length > 0) {
        const { data: rows } = await client
          .from("problem_choices")
          .select("choice_id, choice_type")
          .in("choice_id", newIds);
        for (const c of rows ?? []) {
          choiceTypeById.set(c.choice_id, c.choice_type ?? null);
        }
      }
      for (const a of data) {
        const fmt = a.problems?.format ?? "unknown";
        const f = (sessionAggStats.byFormat[fmt] ??= { total: 0, correct: 0 });
        f.total += 1;
        if (a.is_correct) f.correct += 1;
        const choiceType = a.selected_choice_id
          ? choiceTypeById.get(a.selected_choice_id) ?? null
          : null;
        if (choiceType) {
          const c = (sessionAggStats.byChoiceType[choiceType] ??= {
            total: 0,
            correct: 0,
          });
          c.total += 1;
          if (a.is_correct) c.correct += 1;
        }
      }
      if (data.length < PAGE) break;
      from += PAGE;
    }
  }

  return {
    packId: pack.packId,
    packTitle: pack.title,
    sessionUserStats,
    sessionAggStats,
  };
}
