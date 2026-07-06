// 커리큘럼 서버 쿼리 (feat-7-020).
// staff 권한 검사는 caller(loader/action) 에서 선행. 함수 내부는 admin client 로 우회.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";

import type {
  CohortCurriculumRow,
  CurriculumDetail,
  CurriculumItem,
  CurriculumItemKind,
  CurriculumItemPhase,
  CurriculumListItem,
  CurriculumWeek,
} from "./labels";

export type {
  CohortCurriculumRow,
  CurriculumDetail,
  CurriculumItem,
  CurriculumItemKind,
  CurriculumItemPhase,
  CurriculumListItem,
  CurriculumWeek,
} from "./labels";

// ─── 목록 ───

export async function listCurricula(): Promise<CurriculumListItem[]> {
  const admin = adminClient as SupabaseClient<Database>;
  const { data: rows, error } = await admin
    .from("curricula")
    .select(
      "curriculum_id, name, description, duration_weeks, subject_laws, owner_id, is_published, updated_at, profiles!owner_id(name)",
    )
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  if (error) throw error;

  if (!rows || rows.length === 0) return [];
  const ids = rows.map((r) => r.curriculum_id);

  // 주차 카운트
  const { data: weekCounts } = await admin
    .from("curriculum_weeks")
    .select("curriculum_id")
    .in("curriculum_id", ids);
  const weekByCurriculum = new Map<string, number>();
  for (const r of weekCounts ?? [])
    weekByCurriculum.set(
      r.curriculum_id,
      (weekByCurriculum.get(r.curriculum_id) ?? 0) + 1,
    );

  // 항목 카운트 — weeks 조인
  const { data: itemCounts } = await admin
    .from("curriculum_items")
    .select("week_id, curriculum_weeks!inner(curriculum_id)")
    .in("curriculum_weeks.curriculum_id", ids);
  const itemByCurriculum = new Map<string, number>();
  for (const r of itemCounts ?? []) {
    const cid = r.curriculum_weeks?.curriculum_id;
    if (cid) itemByCurriculum.set(cid, (itemByCurriculum.get(cid) ?? 0) + 1);
  }

  // 적용 cohort 카운트
  const { data: cohortRows } = await admin
    .from("cohort_curricula")
    .select("curriculum_id")
    .in("curriculum_id", ids);
  const cohortByCurriculum = new Map<string, number>();
  for (const r of cohortRows ?? [])
    cohortByCurriculum.set(
      r.curriculum_id,
      (cohortByCurriculum.get(r.curriculum_id) ?? 0) + 1,
    );

  return rows.map((r) => ({
    curriculumId: r.curriculum_id,
    name: r.name,
    description: r.description,
    durationWeeks: r.duration_weeks,
    subjectLaws: r.subject_laws ?? [],
    ownerId: r.owner_id,
    ownerName: r.profiles?.name ?? null,
    isPublished: r.is_published,
    weekCount: weekByCurriculum.get(r.curriculum_id) ?? 0,
    itemCount: itemByCurriculum.get(r.curriculum_id) ?? 0,
    cohortCount: cohortByCurriculum.get(r.curriculum_id) ?? 0,
    updatedAt: r.updated_at,
  }));
}

// ─── 단일 + 주차 + 항목 ───

export async function getCurriculumWithWeeks(
  curriculumId: string,
): Promise<CurriculumDetail | null> {
  const admin = adminClient as SupabaseClient<Database>;
  const { data: c, error } = await admin
    .from("curricula")
    .select(
      "curriculum_id, name, description, duration_weeks, subject_laws, owner_id, is_published, updated_at, profiles!owner_id(name)",
    )
    .eq("curriculum_id", curriculumId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!c) return null;

  // 주차
  const { data: weeks } = await admin
    .from("curriculum_weeks")
    .select("week_id, week_number, title, goal_md")
    .eq("curriculum_id", curriculumId)
    .order("week_number", { ascending: true });
  const weekRows = weeks ?? [];
  const weekIds = weekRows.map((w) => w.week_id);

  // 항목 + 표시 라벨 조인
  const items: CurriculumItem[] = [];
  if (weekIds.length > 0) {
    const { data: itemRows } = await admin
      .from("curriculum_items")
      .select(
        "item_id, week_id, ord, kind, phase, article_id, case_id, problem_id, blank_set_id, lecture_title, lecture_url, lecture_duration_min, target_quantity, note, articles(display_label), cases(case_title, case_number), problems(body_md, year, problem_number), article_blank_sets(display_name, blanks)",
      )
      .in("week_id", weekIds)
      .order("ord", { ascending: true });
    for (const r of itemRows ?? []) {
      const body = r.problems?.body_md ?? "";
      const blankCount = Array.isArray(r.article_blank_sets?.blanks)
        ? (r.article_blank_sets!.blanks as unknown[]).length
        : 0;
      items.push({
        itemId: r.item_id,
        weekId: r.week_id,
        ord: r.ord,
        kind: r.kind as CurriculumItemKind,
        articleId: r.article_id,
        articleLabel: r.articles?.display_label ?? null,
        caseId: r.case_id,
        caseTitle: r.cases
          ? (r.cases.case_title ?? r.cases.case_number ?? null)
          : null,
        problemId: r.problem_id,
        problemSnippet:
          body.length > 0
            ? `${r.problems?.year ?? ""}${r.problems?.problem_number ? ` ${r.problems.problem_number}번` : ""} ${body.slice(0, 60)}${body.length > 60 ? "…" : ""}`.trim()
            : null,
        blankSetId: r.blank_set_id,
        blankSetLabel: r.article_blank_sets
          ? `${r.article_blank_sets.display_name ?? "(이름없음)"} · ${blankCount}칸`
          : null,
        lectureTitle: r.lecture_title,
        lectureUrl: r.lecture_url,
        lectureDurationMin: r.lecture_duration_min,
        targetQuantity: r.target_quantity,
        note: r.note,
        phase: (r.phase as CurriculumItem["phase"]) ?? null,
      });
    }
  }

  const weeksOut: CurriculumWeek[] = weekRows.map((w) => ({
    weekId: w.week_id,
    weekNumber: w.week_number,
    title: w.title,
    goalMd: w.goal_md,
    items: items.filter((i) => i.weekId === w.week_id),
  }));

  // 적용 cohort 카운트
  const { count: cohortCount } = await admin
    .from("cohort_curricula")
    .select("cohort_id", { head: true, count: "exact" })
    .eq("curriculum_id", curriculumId);

  return {
    curriculumId: c.curriculum_id,
    name: c.name,
    description: c.description,
    durationWeeks: c.duration_weeks,
    subjectLaws: c.subject_laws ?? [],
    ownerId: c.owner_id,
    ownerName: c.profiles?.name ?? null,
    isPublished: c.is_published,
    weekCount: weekRows.length,
    itemCount: items.length,
    cohortCount: cohortCount ?? 0,
    updatedAt: c.updated_at,
    weeks: weeksOut,
  };
}

// ─── 커리큘럼 본체 CRUD ───

export interface CreateCurriculumInput {
  name: string;
  description?: string | null;
  durationWeeks: number;
  subjectLaws: string[];
  ownerId: string;
}

export async function createCurriculum(
  input: CreateCurriculumInput,
): Promise<{ ok: true; curriculumId: string } | { ok: false; error: string }> {
  const admin = adminClient as SupabaseClient<Database>;
  const { data, error } = await admin
    .from("curricula")
    .insert({
      name: input.name,
      description: input.description ?? null,
      duration_weeks: input.durationWeeks,
      subject_laws: input.subjectLaws,
      owner_id: input.ownerId,
    })
    .select("curriculum_id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, curriculumId: data.curriculum_id };
}

export async function updateCurriculum(
  curriculumId: string,
  patch: Partial<
    Pick<CreateCurriculumInput, "name" | "description" | "durationWeeks" | "subjectLaws">
  > & { isPublished?: boolean },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = adminClient as SupabaseClient<Database>;
  const u: Record<string, unknown> = {};
  if (patch.name !== undefined) u.name = patch.name;
  if (patch.description !== undefined) u.description = patch.description;
  if (patch.durationWeeks !== undefined) u.duration_weeks = patch.durationWeeks;
  if (patch.subjectLaws !== undefined) u.subject_laws = patch.subjectLaws;
  if (patch.isPublished !== undefined) u.is_published = patch.isPublished;
  const { error } = await admin
    .from("curricula")
    .update(u)
    .eq("curriculum_id", curriculumId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteCurriculum(
  curriculumId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = adminClient as SupabaseClient<Database>;
  const { error } = await admin
    .from("curricula")
    .update({ deleted_at: new Date().toISOString() })
    .eq("curriculum_id", curriculumId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ─── 주차 CRUD ───

export async function upsertWeek(input: {
  weekId?: string;
  curriculumId: string;
  weekNumber: number;
  title: string;
  goalMd?: string | null;
}): Promise<{ ok: true; weekId: string } | { ok: false; error: string }> {
  const admin = adminClient as SupabaseClient<Database>;
  if (input.weekId) {
    const { error } = await admin
      .from("curriculum_weeks")
      .update({
        week_number: input.weekNumber,
        title: input.title,
        goal_md: input.goalMd ?? null,
      })
      .eq("week_id", input.weekId);
    if (error) return { ok: false, error: error.message };
    return { ok: true, weekId: input.weekId };
  }
  const { data, error } = await admin
    .from("curriculum_weeks")
    .insert({
      curriculum_id: input.curriculumId,
      week_number: input.weekNumber,
      title: input.title,
      goal_md: input.goalMd ?? null,
    })
    .select("week_id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, weekId: data.week_id };
}

export async function deleteWeek(
  weekId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = adminClient as SupabaseClient<Database>;
  const { error } = await admin
    .from("curriculum_weeks")
    .delete()
    .eq("week_id", weekId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ─── 항목 CRUD ───

export interface UpsertItemInput {
  itemId?: string;
  weekId: string;
  ord: number;
  kind: CurriculumItemKind;
  articleId?: string | null;
  caseId?: string | null;
  problemId?: string | null;
  blankSetId?: string | null;
  lectureTitle?: string | null;
  lectureUrl?: string | null;
  lectureDurationMin?: number | null;
  targetQuantity?: number | null;
  note?: string | null;
  /** 플립드 러닝 — 예습/복습. null=미지정. */
  phase?: CurriculumItemPhase | null;
}

export async function upsertItem(
  input: UpsertItemInput,
): Promise<{ ok: true; itemId: string } | { ok: false; error: string }> {
  const admin = adminClient as SupabaseClient<Database>;
  // kind 별 대응 컬럼만 채우고 나머지는 null 로 강제 (CHECK constraint 만족)
  const base = {
    week_id: input.weekId,
    ord: input.ord,
    kind: input.kind,
    article_id: null as string | null,
    case_id: null as string | null,
    problem_id: null as string | null,
    blank_set_id: null as string | null,
    lecture_title: null as string | null,
    lecture_url: null as string | null,
    lecture_duration_min: null as number | null,
    target_quantity: input.targetQuantity ?? null,
    note: input.note ?? null,
    phase: input.phase ?? null,
  };
  if (input.kind === "article" || input.kind === "recitation") {
    base.article_id = input.articleId ?? null;
  } else if (input.kind === "case") {
    base.case_id = input.caseId ?? null;
  } else if (input.kind === "problem") {
    base.problem_id = input.problemId ?? null;
  } else if (input.kind === "blank_set") {
    base.blank_set_id = input.blankSetId ?? null;
  } else if (input.kind === "lecture") {
    base.lecture_title = input.lectureTitle ?? null;
    base.lecture_url = input.lectureUrl ?? null;
    base.lecture_duration_min = input.lectureDurationMin ?? null;
  }

  if (input.itemId) {
    const { error } = await admin
      .from("curriculum_items")
      .update(base)
      .eq("item_id", input.itemId);
    if (error) return { ok: false, error: error.message };
    return { ok: true, itemId: input.itemId };
  }
  // 새 항목은 서버가 ord 를 소유한다 — 클라이언트 nextOrd(=items.length) 는 연속 추가 시
  // stale 가능해 (week_id, ord) 충돌/오류를 유발한다. 주차 내 max(ord)+1 로 append.
  const { data: maxRow } = await admin
    .from("curriculum_items")
    .select("ord")
    .eq("week_id", input.weekId)
    .order("ord", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await admin
    .from("curriculum_items")
    .insert({ ...base, ord: (maxRow?.ord ?? -1) + 1 })
    .select("item_id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, itemId: data.item_id };
}

export async function deleteItem(
  itemId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = adminClient as SupabaseClient<Database>;
  const { error } = await admin
    .from("curriculum_items")
    .delete()
    .eq("item_id", itemId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// 기존 항목의 예습/복습 태그만 변경 — kind 참조 컬럼을 건드리지 않는 경량 경로.
export async function setItemPhase(
  itemId: string,
  phase: CurriculumItemPhase | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = adminClient as SupabaseClient<Database>;
  const { error } = await admin
    .from("curriculum_items")
    .update({ phase })
    .eq("item_id", itemId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ─── cohort 적용 ───

export async function listCohortCurricula(
  cohortId: string,
): Promise<CohortCurriculumRow[]> {
  const admin = adminClient as SupabaseClient<Database>;
  const { data, error } = await admin
    .from("cohort_curricula")
    .select(
      "cohort_id, curriculum_id, start_date, is_active, assigned_at, curricula!inner(name, deleted_at)",
    )
    .eq("cohort_id", cohortId);
  if (error) throw error;
  return (data ?? [])
    .filter((r) => r.curricula?.deleted_at === null)
    .map((r) => ({
      cohortId: r.cohort_id,
      curriculumId: r.curriculum_id,
      curriculumName: r.curricula!.name,
      startDate: r.start_date,
      isActive: r.is_active,
      assignedAt: r.assigned_at,
    }));
}

export async function applyCurriculumToCohort(
  cohortId: string,
  curriculumId: string,
  startDate: string,
  assignedBy: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = adminClient as SupabaseClient<Database>;
  const { error } = await admin.from("cohort_curricula").upsert(
    {
      cohort_id: cohortId,
      curriculum_id: curriculumId,
      start_date: startDate,
      is_active: true,
      assigned_by: assignedBy,
    },
    { onConflict: "cohort_id,curriculum_id" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function removeCurriculumFromCohort(
  cohortId: string,
  curriculumId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = adminClient as SupabaseClient<Database>;
  const { error } = await admin
    .from("cohort_curricula")
    .delete()
    .eq("cohort_id", cohortId)
    .eq("curriculum_id", curriculumId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ─── 학생: 현재 주차 트랙 (대시보드 "이번 주" 카드) ───
// 자동 cron 의 daysBetweenKst 와 같은 방식으로 KST midnight 기준 weekNumber 계산.

export interface WeekTrackItem {
  itemId: string;
  ord: number;
  kind: CurriculumItemKind;
  /** 플립드 러닝 — 예습/복습. null=미지정. */
  phase: CurriculumItemPhase | null;
  label: string;
  hint: string | null;
  entryUrl: string | null;
  isDone: boolean;
}

export interface WeekTrack {
  cohortId: string;
  cohortName: string;
  curriculumId: string;
  curriculumName: string;
  weekId: string;
  weekNumber: number;
  weekTitle: string;
  goalMd: string | null;
  durationWeeks: number;
  startDate: string;
  weekStartDate: string;
  weekEndDate: string;
  items: WeekTrackItem[];
  completedCount: number;
  totalCount: number;
  assignmentId: string | null;
}

function ymdKstFromDate(d: Date): string {
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  return k.toISOString().slice(0, 10);
}

function addDaysIso(ymd: string, days: number): string {
  const t = new Date(`${ymd}T00:00:00+09:00`).getTime();
  return ymdKstFromDate(new Date(t + days * 86_400_000));
}

function daysBetweenKstStrict(from: string, today: Date): number {
  const start = new Date(`${from}T00:00:00+09:00`).getTime();
  const todayKst = new Date(`${ymdKstFromDate(today)}T00:00:00+09:00`).getTime();
  return Math.floor((todayKst - start) / 86_400_000);
}

export async function getCurrentWeekTrack(
  userId: string,
): Promise<WeekTrack | null> {
  const admin = adminClient as SupabaseClient<Database>;

  // 1) 학생 cohort 멤버십
  const { data: memberRows } = await admin
    .from("cohort_members")
    .select("cohort_id")
    .eq("profile_id", userId);
  const cohortIds = (memberRows ?? []).map((r) => r.cohort_id);
  if (cohortIds.length === 0) return null;

  // 2) 활성 cohort_curricula — 시작일/duration 으로 weekNumber 후보 산출.
  const { data: curRows } = await admin
    .from("cohort_curricula")
    .select(
      "cohort_id, curriculum_id, start_date, is_active, cohorts!inner(name, is_archived, deleted_at), curricula!inner(name, duration_weeks, is_published, deleted_at)",
    )
    .in("cohort_id", cohortIds)
    .eq("is_active", true);

  const today = new Date();
  const candidates = (curRows ?? [])
    .filter(
      (r) =>
        r.cohorts &&
        !r.cohorts.is_archived &&
        r.cohorts.deleted_at === null &&
        r.curricula &&
        r.curricula.is_published &&
        r.curricula.deleted_at === null,
    )
    .map((r) => {
      const days = daysBetweenKstStrict(r.start_date, today);
      const weekNumber = Math.floor(days / 7) + 1;
      return { ...r, days, weekNumber };
    })
    .filter((r) => r.days >= 0 && r.weekNumber <= r.curricula!.duration_weeks);

  if (candidates.length === 0) return null;
  // 여러 cohort 가 같은 학생을 다른 커리큘럼에 묶을 수 있으나, 대시보드는 한 트랙만 노출.
  // 시작일 가장 최근 + (동률 시) weekNumber 작은 쪽 = 진행 초반에 가까운 것 우선.
  candidates.sort((a, b) => {
    if (a.start_date !== b.start_date)
      return a.start_date < b.start_date ? 1 : -1;
    return a.weekNumber - b.weekNumber;
  });
  const pick = candidates[0];

  // 3) 주차 row
  const { data: week } = await admin
    .from("curriculum_weeks")
    .select("week_id, week_number, title, goal_md")
    .eq("curriculum_id", pick.curriculum_id)
    .eq("week_number", pick.weekNumber)
    .maybeSingle();
  if (!week) return null;

  // 4) 항목
  const { data: itemRows } = await admin
    .from("curriculum_items")
    .select(
      "item_id, ord, kind, phase, article_id, case_id, problem_id, blank_set_id, lecture_title, lecture_url, lecture_duration_min, target_quantity, note, articles(display_label, article_number, laws(law_code)), cases(case_title, case_number, subject_laws), problems(body_md, year, problem_number, laws(law_code)), article_blank_sets(display_name, blanks, articles(article_number, laws(law_code)))",
    )
    .eq("week_id", week.week_id)
    .order("ord", { ascending: true });
  const rawItems = itemRows ?? [];
  if (rawItems.length === 0) {
    return {
      cohortId: pick.cohort_id,
      cohortName: pick.cohorts!.name,
      curriculumId: pick.curriculum_id,
      curriculumName: pick.curricula!.name,
      weekId: week.week_id,
      weekNumber: week.week_number,
      weekTitle: week.title,
      goalMd: week.goal_md,
      durationWeeks: pick.curricula!.duration_weeks,
      startDate: pick.start_date,
      weekStartDate: addDaysIso(pick.start_date, (week.week_number - 1) * 7),
      weekEndDate: addDaysIso(pick.start_date, week.week_number * 7 - 1),
      items: [],
      completedCount: 0,
      totalCount: 0,
      assignmentId: null,
    };
  }

  // 5) 완수 판정용 fetch
  const articleIds = rawItems
    .filter((i) => i.kind === "article" || i.kind === "recitation")
    .map((i) => i.article_id)
    .filter(Boolean) as string[];
  const caseIds = rawItems
    .filter((i) => i.kind === "case")
    .map((i) => i.case_id)
    .filter(Boolean) as string[];
  const problemIds = rawItems
    .filter((i) => i.kind === "problem")
    .map((i) => i.problem_id)
    .filter(Boolean) as string[];
  const blankSetIds = rawItems
    .filter((i) => i.kind === "blank_set")
    .map((i) => i.blank_set_id)
    .filter(Boolean) as string[];
  const lectureItemIds = rawItems
    .filter((i) => i.kind === "lecture")
    .map((i) => i.item_id);

  const [
    correctProblemsRes,
    studyScopesRes,
    blankAttemptsRes,
    recitationRes,
    lectureRes,
  ] = await Promise.all([
    problemIds.length > 0
      ? admin
          .from("user_problem_attempts")
          .select("problem_id")
          .eq("user_id", userId)
          .eq("is_correct", true)
          .in("problem_id", problemIds)
      : Promise.resolve({ data: [] as { problem_id: string }[] }),
    articleIds.length > 0 || caseIds.length > 0
      ? admin
          .from("study_sessions")
          .select("scope")
          .eq("user_id", userId)
          .limit(5000)
      : Promise.resolve({ data: [] as { scope: unknown }[] }),
    blankSetIds.length > 0
      ? admin
          .from("user_blank_attempts")
          .select("set_id, blank_idx")
          .eq("user_id", userId)
          .eq("is_correct", true)
          .in("set_id", blankSetIds)
      : Promise.resolve({ data: [] as { set_id: string; blank_idx: number }[] }),
    articleIds.length > 0
      ? admin
          .from("user_recitation_attempts")
          .select("article_id")
          .eq("user_id", userId)
          .eq("is_complete", true)
          .in("article_id", articleIds)
      : Promise.resolve({ data: [] as { article_id: string }[] }),
    lectureItemIds.length > 0
      ? admin
          .from("lecture_views")
          .select("item_id, completed_at, last_position_sec")
          .eq("user_id", userId)
          .in("item_id", lectureItemIds)
      : Promise.resolve({
          data: [] as {
            item_id: string;
            completed_at: string | null;
            last_position_sec: number;
          }[],
        }),
  ]);

  const correctProblems = new Set<string>();
  for (const r of correctProblemsRes.data ?? [])
    correctProblems.add(r.problem_id);

  const visitedArticles = new Set<string>();
  const visitedCases = new Set<string>();
  for (const r of studyScopesRes.data ?? []) {
    const scope = r.scope as
      | { target_type?: string; target_id?: string }
      | null;
    if (!scope?.target_id) continue;
    if (scope.target_type === "article") visitedArticles.add(scope.target_id);
    else if (scope.target_type === "case") visitedCases.add(scope.target_id);
  }

  const correctIdxBySet = new Map<string, Set<number>>();
  for (const r of blankAttemptsRes.data ?? []) {
    if (!correctIdxBySet.has(r.set_id)) correctIdxBySet.set(r.set_id, new Set());
    correctIdxBySet.get(r.set_id)!.add(r.blank_idx);
  }

  const completedRecitations = new Set<string>();
  for (const r of recitationRes.data ?? [])
    completedRecitations.add(r.article_id);

  const lectureCompleted = new Set<string>();
  for (const r of lectureRes.data ?? []) {
    if (r.completed_at) lectureCompleted.add(r.item_id);
  }

  // 6) 항목 매핑
  const items: WeekTrackItem[] = rawItems.map((r) => {
    const articleLawCode = r.articles?.laws?.law_code ?? null;
    const articleNum = r.articles?.article_number ?? null;
    const caseLawCode = Array.isArray(r.cases?.subject_laws)
      ? (r.cases!.subject_laws[0] ?? null)
      : null;
    const problemLawCode = r.problems?.laws?.law_code ?? null;
    const bsLawCode = r.article_blank_sets?.articles?.laws?.law_code ?? null;
    const bsArticleNum =
      r.article_blank_sets?.articles?.article_number ?? null;

    let entryUrl: string | null = null;
    let label = "";
    let hint: string | null = r.note ?? null;
    let isDone = false;

    if (r.kind === "article") {
      label = r.articles?.display_label ?? "(조문)";
      if (articleLawCode && articleNum)
        entryUrl = `/subjects/${articleLawCode}/articles/${articleNum}`;
      if (r.article_id) isDone = visitedArticles.has(r.article_id);
    } else if (r.kind === "recitation") {
      label = r.articles?.display_label ?? "(조문 암기)";
      if (articleLawCode && articleNum)
        entryUrl = `/subjects/${articleLawCode}/articles/${articleNum}?recitation=1`;
      if (r.article_id) isDone = completedRecitations.has(r.article_id);
    } else if (r.kind === "case") {
      label = r.cases?.case_title ?? r.cases?.case_number ?? "(판례)";
      if (caseLawCode && r.case_id)
        entryUrl = `/subjects/${caseLawCode}/cases/${r.case_id}`;
      if (r.case_id) isDone = visitedCases.has(r.case_id);
    } else if (r.kind === "problem") {
      const body = r.problems?.body_md ?? "";
      label = body.length > 0
        ? `${r.problems?.year ?? ""}${r.problems?.problem_number ? ` ${r.problems.problem_number}번` : ""} ${body.slice(0, 50)}${body.length > 50 ? "…" : ""}`.trim()
        : "(문제)";
      if (problemLawCode && r.problem_id)
        entryUrl = `/subjects/${problemLawCode}/problems/${r.problem_id}`;
      if (r.problem_id) isDone = correctProblems.has(r.problem_id);
    } else if (r.kind === "blank_set") {
      const blanksArr = Array.isArray(r.article_blank_sets?.blanks)
        ? (r.article_blank_sets!.blanks as unknown[])
        : [];
      label = r.article_blank_sets?.display_name ?? "(빈칸 세트)";
      hint = `${blanksArr.length}칸${r.note ? ` · ${r.note}` : ""}`;
      if (bsLawCode && bsArticleNum && r.blank_set_id)
        entryUrl = `/subjects/${bsLawCode}/articles/${bsArticleNum}?blank=${r.blank_set_id}`;
      if (r.blank_set_id && blanksArr.length > 0) {
        const correctSet = correctIdxBySet.get(r.blank_set_id);
        isDone = !!correctSet && correctSet.size >= blanksArr.length;
      }
    } else if (r.kind === "lecture") {
      label = r.lecture_title ?? "(강의)";
      hint = r.lecture_duration_min
        ? `${r.lecture_duration_min}분${r.note ? ` · ${r.note}` : ""}`
        : (r.note ?? null);
      entryUrl = `/lectures/${r.item_id}`;
      isDone = lectureCompleted.has(r.item_id);
    }

    return {
      itemId: r.item_id,
      ord: r.ord,
      kind: r.kind as CurriculumItemKind,
      phase: (r.phase as CurriculumItemPhase | null) ?? null,
      label,
      hint,
      entryUrl,
      isDone,
    };
  });

  // 7) 자동 생성된 assignment id (있으면)
  const { data: existingAssignment } = await admin
    .from("assignments")
    .select("assignment_id")
    .eq("cohort_id", pick.cohort_id)
    .eq("source_week_id", week.week_id)
    .is("deleted_at", null)
    .maybeSingle();

  const completedCount = items.filter((i) => i.isDone).length;
  return {
    cohortId: pick.cohort_id,
    cohortName: pick.cohorts!.name,
    curriculumId: pick.curriculum_id,
    curriculumName: pick.curricula!.name,
    weekId: week.week_id,
    weekNumber: week.week_number,
    weekTitle: week.title,
    goalMd: week.goal_md,
    durationWeeks: pick.curricula!.duration_weeks,
    startDate: pick.start_date,
    weekStartDate: addDaysIso(pick.start_date, (week.week_number - 1) * 7),
    weekEndDate: addDaysIso(pick.start_date, week.week_number * 7 - 1),
    items,
    completedCount,
    totalCount: items.length,
    assignmentId: existingAssignment?.assignment_id ?? null,
  };
}
