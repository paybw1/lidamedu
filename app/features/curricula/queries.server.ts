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
  CurriculumListItem,
  CurriculumWeek,
} from "./labels";

export type {
  CohortCurriculumRow,
  CurriculumDetail,
  CurriculumItem,
  CurriculumItemKind,
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
        "item_id, week_id, ord, kind, article_id, case_id, problem_id, blank_set_id, lecture_title, lecture_url, lecture_duration_min, target_quantity, note, articles(display_label), cases(case_title, case_number), problems(body_md, year, problem_number), article_blank_sets(display_name, blanks)",
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
  const { data, error } = await admin
    .from("curriculum_items")
    .insert(base)
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
