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
  "pack_id, kind, subject_scope, title, description, year, exam_round_no, duration_min, video_url, result_doc_url, published_at, is_published, pass_score, created_at, updated_at";

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
  pass_score: number | null;
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
    value === "patent" ||
    value === "trademark" ||
    value === "design" ||
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
      : "patent",
    title: row.title,
    description: row.description,
    year: row.year,
    examRoundNo: row.exam_round_no,
    durationMin: row.duration_min,
    videoUrl: row.video_url,
    resultDocUrl: row.result_doc_url,
    publishedAt: row.published_at,
    isPublished: row.is_published,
    passScore: row.pass_score,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    problemCount,
  };
}

export interface ListPacksOptions {
  subjectScope?: McqPackSubjectScope;
  kind?: McqPackKind;
  /** 여러 kind 통합 필터 — kinds 와 kind 둘 다 있으면 kinds 우선. */
  kinds?: McqPackKind[];
  query?: string;
  year?: number;
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
  if (options.kinds && options.kinds.length > 0) q = q.in("kind", options.kinds);
  else if (options.kind) q = q.eq("kind", options.kind);
  if (options.year !== undefined) q = q.eq("year", options.year);
  const trimmed = options.query?.trim();
  if (trimmed) {
    const escaped = trimmed.replaceAll("%", "").replaceAll(",", " ");
    const pattern = `%${escaped}%`;
    q = q.or(`title.ilike.${pattern},description.ilike.${pattern}`);
  }
  // 명칭(연도) 내림차순 — year DESC, year 없으면 published_at, 그래도 없으면 created_at.
  const { data: packRows, error } = await q
    .order("year", { ascending: false, nullsFirst: false })
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
// 본인의 OX 시험 응시 이력 list — /me/ox-sessions 화면용.
// quiz_sessions.scope_payload->>exam_kind = 'ox' 인 row + attempts 통계 + pack 메타.
export interface OxSessionRow {
  sessionId: string;
  packId: string | null;
  packTitle: string | null;
  packKind: string | null;
  packSubjectScope: string | null;
  startedAt: string;
  completedAt: string | null;
  total: number; // scope_payload.ref_count
  correct: number;
  wrong: number;
  blank: number; // total - (correct + wrong)
  durationSec: number | null;
}

export async function listMyOxSessions(
  client: SupabaseClient<Database>,
  userId: string,
  opts: { limit?: number; packId?: string } = {},
): Promise<OxSessionRow[]> {
  const { limit = 50, packId } = opts;
  let query = client
    .from("quiz_sessions")
    .select(
      "session_id, pack_id, started_at, completed_at, scope_payload, mcq_packs:pack_id(title, kind, subject_scope)",
    )
    .eq("user_id", userId)
    .filter("scope_payload->>exam_kind", "eq", "ox");
  if (packId) query = query.eq("pack_id", packId);
  const { data: sessions, error: sErr } = await query
    .order("completed_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (sErr) throw sErr;
  const sessionList = sessions ?? [];
  if (sessionList.length === 0) return [];

  const sessionIds = sessionList.map((s) => s.session_id);
  const { data: attempts } = await client
    .from("user_problem_attempts")
    .select("session_id, is_correct")
    .in("session_id", sessionIds);
  const statsMap = new Map<string, { c: number; w: number }>();
  for (const a of attempts ?? []) {
    if (!a.session_id) continue;
    const s = statsMap.get(a.session_id) ?? { c: 0, w: 0 };
    if (a.is_correct) s.c++;
    else s.w++;
    statsMap.set(a.session_id, s);
  }

  return sessionList.map((s) => {
    const stats = statsMap.get(s.session_id) ?? { c: 0, w: 0 };
    const total =
      (s.scope_payload as { ref_count?: number } | null)?.ref_count ??
      stats.c + stats.w;
    const durationSec =
      s.completed_at && s.started_at
        ? Math.max(
            0,
            Math.round(
              (new Date(s.completed_at).getTime() -
                new Date(s.started_at).getTime()) /
                1000,
            ),
          )
        : null;
    const mp = s.mcq_packs as unknown as
      | { title: string; kind: string; subject_scope: string }
      | null;
    return {
      sessionId: s.session_id,
      packId: s.pack_id,
      packTitle: mp?.title ?? null,
      packKind: mp?.kind ?? null,
      packSubjectScope: mp?.subject_scope ?? null,
      startedAt: s.started_at,
      completedAt: s.completed_at,
      total,
      correct: stats.c,
      wrong: stats.w,
      blank: Math.max(0, total - stats.c - stats.w),
      durationSec,
    };
  });
}

export async function listPackProblems(
  client: SupabaseClient<Database>,
  packId: string,
): Promise<McqPackProblemItem[]> {
  const { data, error } = await client
    .from("mcq_pack_problems")
    .select(
      "ord, problem_id, problems!inner(problem_id, problem_number, format, origin, released_at, year, body_md, law_id, science_subject, laws(law_code))",
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
        releasedAt: p.released_at ?? null,
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
  passScore?: number | null;
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
      pass_score: input.passScore ?? null,
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
  if (patch.passScore !== undefined) update.pass_score = patch.passScore;
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
  // soft-delete 는 SECURITY DEFINER RPC 로 — SELECT 정책(deleted_at IS NULL)이
  // UPDATE 새 행을 막아 직접 UPDATE 는 RLS(42501)로 실패. RPC 가 staff 검사 후 우회.
  const { error } = await client.rpc("soft_delete_mcq_pack", { p_id: packId });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// problem_id 직접 add. ord 는 현재 최대 ord + 1.
export async function addPackProblem(
  client: SupabaseClient<Database>,
  packId: string,
  problemId: string,
): Promise<
  { ok: true } | { ok: false; error: string; unapproved?: true }
> {
  // feat — 강사 검증 게이트. 단건 호출도 미승인 차단.
  const { data: prob, error: revErr } = await client
    .from("problems")
    .select("review_status")
    .eq("problem_id", problemId)
    .is("deleted_at", null)
    .maybeSingle();
  if (revErr) return { ok: false, error: revErr.message };
  if (!prob) return { ok: false, error: "Problem not found" };
  if (prob.review_status !== "approved") {
    return { ok: false, error: "검증 미승인 문제는 팩에 추가할 수 없습니다.", unapproved: true };
  }
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

// 여러 problem_id 일괄 추가 — 이미 들어있는 문제는 건너뛴다 (멱등). feat-10-002.
// feat — 강사 검증 게이트. 미승인(draft/rejected) 문제는 picker 가 우회되어도 서버에서
//   재검증해 차단. skippedUnapproved 로 호출부에 통지 (UI 토스트).
export async function addPackProblems(
  client: SupabaseClient<Database>,
  packId: string,
  problemIds: string[],
): Promise<
  | { ok: true; added: number; skipped: number; skippedUnapproved: number }
  | { ok: false; error: string }
> {
  if (problemIds.length === 0)
    return { ok: true, added: 0, skipped: 0, skippedUnapproved: 0 };
  const { data: existing, error: exErr } = await client
    .from("mcq_pack_problems")
    .select("problem_id")
    .eq("pack_id", packId)
    .in("problem_id", problemIds);
  if (exErr) return { ok: false, error: exErr.message };
  const existingSet = new Set((existing ?? []).map((r) => r.problem_id));
  const candidate = problemIds.filter((id) => !existingSet.has(id));

  // 강사 미승인 문제 차단 — 서버 재검증.
  let skippedUnapproved = 0;
  let fresh = candidate;
  if (candidate.length > 0) {
    const { data: approvedRows, error: revErr } = await client
      .from("problems")
      .select("problem_id")
      .in("problem_id", candidate)
      .eq("review_status", "approved")
      .is("deleted_at", null);
    if (revErr) return { ok: false, error: revErr.message };
    const approvedSet = new Set((approvedRows ?? []).map((r) => r.problem_id));
    fresh = candidate.filter((id) => approvedSet.has(id));
    skippedUnapproved = candidate.length - fresh.length;
  }

  if (fresh.length === 0) {
    return {
      ok: true,
      added: 0,
      skipped: problemIds.length - skippedUnapproved,
      skippedUnapproved,
    };
  }
  const { data: maxRow } = await client
    .from("mcq_pack_problems")
    .select("ord")
    .eq("pack_id", packId)
    .order("ord", { ascending: false })
    .limit(1)
    .maybeSingle();
  const baseOrd = (maxRow?.ord ?? -1) + 1;
  const rows = fresh.map((problemId, i) => ({
    pack_id: packId,
    problem_id: problemId,
    ord: baseOrd + i,
  }));
  const { error } = await client.from("mcq_pack_problems").insert(rows);
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    added: fresh.length,
    skipped: problemIds.length - fresh.length - skippedUnapproved,
    skippedUnapproved,
  };
}

// feat-10-002 — 팩의 mock 문제를 학습과목에 공개 (released_at 설정).
// origin=mock + 미공개 인 것만 갱신. 멱등 — 이미 공개분은 건너뜀.
export async function releasePackProblems(
  client: SupabaseClient<Database>,
  packId: string,
): Promise<{ ok: true; released: number } | { ok: false; error: string }> {
  const problemIds = await getPackProblemIds(client, packId);
  if (problemIds.length === 0) return { ok: true, released: 0 };
  const { data, error } = await client
    .from("problems")
    .update({ released_at: new Date().toISOString() })
    .in("problem_id", problemIds)
    .eq("origin", "mock")
    .is("released_at", null)
    .is("deleted_at", null)
    .select("problem_id");
  if (error) return { ok: false, error: error.message };
  return { ok: true, released: data?.length ?? 0 };
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
  if (code === "patent") return "patent";
  if (code === "trademark") return "trademark";
  if (code === "design") return "design";
  if (code === "civil") return "civil";
  if (code === "civil-procedure") return "civil_procedure";
  return null;
}

export async function regeneratePastExamPacks(
  client: SupabaseClient<Database>,
  authorId: string,
): Promise<RegeneratePastExamResult> {
  // 1차 객관식 기출 + 기출변형 모두 포함. (2차 주관식은 /latest/essay 영역.)
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
      .in("origin", ["past_exam", "past_exam_variant"])
      .eq("exam_round", "first")
      .is("deleted_at", null)
      .not("year", "is", null)
      .order("problem_number", { ascending: true, nullsFirst: false })
      // ★ problem_id 타이브레이커 필수 — problem_number 는 distinct 40개뿐(과목·연도마다
      //   1~40 반복)이라 비유일 정렬 위 range() 페이징은 페이지 경계에서 행이 중복·누락된다.
      //   PK=(pack_id,problem_id) 라 중복이 mcq_pack_problems insert 를 throw → 재생성 전체
      //   실패(성공 이력 0의 원인). 유일 정렬키 추가로 안정·완전 페이징.
      .order("problem_id", { ascending: true })
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
    // 방어적 중복 제거 — 혹시 모를 중복 문제로 PK(pack_id,problem_id) 위반 방지.
    const problemIds = [...new Set(g.problemIds)];
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
    if (problemIds.length > 0) {
      const rows = problemIds.map((pid, i) => ({
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
      problemCount: problemIds.length,
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

// feat-10-004 — 팩 exam 응시 등수. RPC 가 호출자(auth.uid()) 본인 통계만 반환.
export interface PackAttemptRanking {
  correct: number;
  total: number;
  /** 정답률 % */
  score: number;
  rank: number;
  totalTakers: number;
  percentile: number;
  zScore: number;
}

export async function getPackAttemptRanking(
  client: SupabaseClient<Database>,
  packId: string,
): Promise<PackAttemptRanking | null> {
  const { data, error } = await client.rpc("mcq_pack_attempt_stats", {
    p_pack_id: packId,
  });
  if (error) throw error;
  const row = (data ?? [])[0];
  if (!row) return null;
  return {
    correct: row.correct,
    total: row.total,
    score: row.score,
    rank: row.rank,
    totalTakers: row.total_takers,
    percentile: row.percentile,
    zScore: row.z_score,
  };
}
