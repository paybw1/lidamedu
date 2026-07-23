// 과제 서버 쿼리 (feat-7-021).
// staff 권한 검사는 caller(loader/action) 선행. 함수 내부 admin client 우회.
// 자동 완수 판정: recomputeSubmission(assignmentId, userId).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";

import type {
  AssignmentDetail,
  AssignmentItem,
  AssignmentItemKind,
  AssignmentListItem,
  AssignmentStatus,
  AssignmentSubmission,
  DeadlinePolicy,
  MemberAssignmentProgress,
  StudentAssignmentRow,
} from "./labels";

export type {
  AssignmentDetail,
  AssignmentItem,
  AssignmentItemKind,
  AssignmentListItem,
  AssignmentStatus,
  AssignmentSubmission,
  MemberAssignmentProgress,
  StudentAssignmentRow,
} from "./labels";

// ─── 목록 (cohort 단위) ───

export async function listAssignmentsByCohort(
  cohortId: string,
): Promise<AssignmentListItem[]> {
  const admin = adminClient as SupabaseClient<Database>;
  const { data: rows, error } = await admin
    .from("assignments")
    .select(
      "assignment_id, cohort_id, title, description_md, assigned_at, due_at, created_by, source_curriculum_id, source_week_id, deadline_policy, target_profile_id, profiles!assignments_target_profile_id_fkey(name)",
    )
    .eq("cohort_id", cohortId)
    .is("deleted_at", null)
    .order("due_at", { ascending: false });
  if (error) throw error;
  const list = rows ?? [];
  if (list.length === 0) return [];

  const ids = list.map((r) => r.assignment_id);

  // 항목 카운트
  const { data: itemCounts } = await admin
    .from("assignment_items")
    .select("assignment_id")
    .in("assignment_id", ids);
  const itemByA = new Map<string, number>();
  for (const r of itemCounts ?? [])
    itemByA.set(r.assignment_id, (itemByA.get(r.assignment_id) ?? 0) + 1);

  // 멤버 수
  const { count: totalMembers } = await admin
    .from("cohort_members")
    .select("profile_id", { head: true, count: "exact" })
    .eq("cohort_id", cohortId);

  // 완수 멤버 (submission.status='completed') 수
  const { data: subRows } = await admin
    .from("assignment_submissions")
    .select("assignment_id, status")
    .in("assignment_id", ids);
  const completedByA = new Map<string, number>();
  for (const r of subRows ?? []) {
    if (r.status === "completed")
      completedByA.set(
        r.assignment_id,
        (completedByA.get(r.assignment_id) ?? 0) + 1,
      );
  }

  return list.map((r) => ({
    assignmentId: r.assignment_id,
    cohortId: r.cohort_id,
    title: r.title,
    descriptionMd: r.description_md,
    assignedAt: r.assigned_at,
    dueAt: r.due_at,
    createdBy: r.created_by,
    sourceCurriculumId: r.source_curriculum_id,
    sourceWeekId: r.source_week_id,
    deadlinePolicy: r.deadline_policy,
    targetProfileId: r.target_profile_id,
    targetName: r.profiles?.name ?? null,
    itemCount: itemByA.get(r.assignment_id) ?? 0,
    // 개인 과제는 대상 1명 기준으로 완수율 계산.
    totalMembers: r.target_profile_id ? 1 : (totalMembers ?? 0),
    completedMembers: completedByA.get(r.assignment_id) ?? 0,
  }));
}

// ─── 단일 + 항목 + 라벨 ───

export async function getAssignmentWithItems(
  assignmentId: string,
): Promise<AssignmentDetail | null> {
  const admin = adminClient as SupabaseClient<Database>;
  const { data: a, error } = await admin
    .from("assignments")
    .select(
      "assignment_id, cohort_id, title, description_md, assigned_at, due_at, created_by, source_curriculum_id, source_week_id, deadline_policy, target_profile_id",
    )
    .eq("assignment_id", assignmentId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!a) return null;

  const { data: itemRows } = await admin
    .from("assignment_items")
    .select(
      "item_id, ord, kind, article_id, case_id, problem_id, blank_set_id, target_quantity, note, articles(display_label, article_number, laws(law_code)), cases(case_title, case_number, subject_laws), problems(body_md, year, problem_number, laws(law_code)), article_blank_sets(display_name, blanks, articles(article_number, laws(law_code)))",
    )
    .eq("assignment_id", assignmentId)
    .order("ord", { ascending: true });

  const items: AssignmentItem[] = (itemRows ?? []).map((r) => {
    const body = r.problems?.body_md ?? "";
    const blanksArr = Array.isArray(r.article_blank_sets?.blanks)
      ? (r.article_blank_sets!.blanks as unknown[])
      : [];
    // 진입 URL 계산
    const articleLawCode = r.articles?.laws?.law_code ?? null;
    const articleNum = r.articles?.article_number ?? null;
    const caseLawCode = Array.isArray(r.cases?.subject_laws)
      ? (r.cases!.subject_laws[0] ?? null)
      : null;
    const problemLawCode = r.problems?.laws?.law_code ?? null;
    const bsLawCode = r.article_blank_sets?.articles?.laws?.law_code ?? null;
    const bsArticleNum = r.article_blank_sets?.articles?.article_number ?? null;
    let entryUrl: string | null = null;
    if (r.kind === "article_read" && articleLawCode && articleNum) {
      entryUrl = `/subjects/${articleLawCode}/articles/${articleNum}`;
    } else if (r.kind === "recitation" && articleLawCode && articleNum) {
      entryUrl = `/subjects/${articleLawCode}/articles/${articleNum}?recitation=1`;
    } else if (r.kind === "case_read" && caseLawCode && r.case_id) {
      entryUrl = `/subjects/${caseLawCode}/cases/${r.case_id}`;
    } else if (r.kind === "problem" && problemLawCode && r.problem_id) {
      entryUrl = `/subjects/${problemLawCode}/problems/${r.problem_id}`;
    } else if (
      r.kind === "blank_set" &&
      bsLawCode &&
      bsArticleNum &&
      r.blank_set_id
    ) {
      entryUrl = `/subjects/${bsLawCode}/articles/${bsArticleNum}?blank=${r.blank_set_id}`;
    }
    return {
      itemId: r.item_id,
      ord: r.ord,
      kind: r.kind as AssignmentItemKind,
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
        ? `${r.article_blank_sets.display_name ?? "(이름없음)"} · ${blanksArr.length}칸`
        : null,
      blankSetTotalBlanks: r.article_blank_sets ? blanksArr.length : null,
      entryUrl,
      targetQuantity: r.target_quantity,
      note: r.note,
    };
  });

  // 멤버 수 + 완수 멤버 수
  const { count: totalMembers } = await admin
    .from("cohort_members")
    .select("profile_id", { head: true, count: "exact" })
    .eq("cohort_id", a.cohort_id);
  const { count: completedMembers } = await admin
    .from("assignment_submissions")
    .select("submission_id", { head: true, count: "exact" })
    .eq("assignment_id", assignmentId)
    .eq("status", "completed");

  return {
    assignmentId: a.assignment_id,
    cohortId: a.cohort_id,
    title: a.title,
    descriptionMd: a.description_md,
    assignedAt: a.assigned_at,
    dueAt: a.due_at,
    createdBy: a.created_by,
    sourceCurriculumId: a.source_curriculum_id,
    sourceWeekId: a.source_week_id,
    deadlinePolicy: a.deadline_policy,
    targetProfileId: a.target_profile_id,
    itemCount: items.length,
    totalMembers: a.target_profile_id ? 1 : (totalMembers ?? 0),
    completedMembers: completedMembers ?? 0,
    items,
  };
}

// ─── CRUD ───

export interface CreateAssignmentInput {
  cohortId: string;
  title: string;
  descriptionMd?: string | null;
  dueAt: string; // ISO
  createdBy: string;
  sourceCurriculumId?: string | null;
  sourceWeekId?: string | null;
  deadlinePolicy?: DeadlinePolicy;
  // feat-7-045 — 개인 과제 대상. 지정 시 반 전체 공지 fanout 을 생략한다.
  targetProfileId?: string | null;
}

export async function createAssignment(
  client: SupabaseClient<Database>,
  input: CreateAssignmentInput,
): Promise<{ ok: true; assignmentId: string } | { ok: false; error: string }> {
  // (나) feat-7-021b — 요청 클라이언트면 RLS(user_owns_cohort)가 소유권 강제. cron 은 adminClient 전달.
  const admin = client;
  const { data, error } = await admin
    .from("assignments")
    .insert({
      cohort_id: input.cohortId,
      title: input.title,
      description_md: input.descriptionMd ?? null,
      due_at: input.dueAt,
      created_by: input.createdBy,
      source_curriculum_id: input.sourceCurriculumId ?? null,
      source_week_id: input.sourceWeekId ?? null,
      deadline_policy: input.deadlinePolicy ?? "recommended",
      target_profile_id: input.targetProfileId ?? null,
    })
    .select("assignment_id")
    .single();
  if (error) return { ok: false, error: error.message };
  // best-effort 알림 발송 — cohort fanout. 개인 과제는 반 전체 공지가 무의미해 생략
  // (학생 노출은 /assignments 목록·대시보드 마감 임박·주간 리포트가 담당).
  if (!input.targetProfileId) {
    await postAssignmentAnnouncement(admin, {
      assignmentId: data.assignment_id,
      cohortId: input.cohortId,
      title: input.title,
      dueAt: input.dueAt,
      description: input.descriptionMd ?? null,
      authorId: input.createdBy,
    });
  }
  return { ok: true, assignmentId: data.assignment_id };
}

// ─── 알림 fanout (feat-7-021 Step D) ───
// announcements + announcement_audiences(cohort) 두 row insert.
// 실패해도 assignment 생성 자체는 성공으로 처리 — 알림은 best-effort.

async function postAssignmentAnnouncement(
  client: SupabaseClient<Database>,
  input: {
    assignmentId: string;
    cohortId: string;
    title: string;
    dueAt: string;
    description: string | null;
    authorId: string;
  },
): Promise<void> {
  const admin = client;
  try {
    const dueLabel = input.dueAt.slice(0, 16).replace("T", " ");
    const body = [
      `**마감**: ${dueLabel}`,
      input.description ? `\n${input.description}` : "",
      `\n\n[지금 풀러가기](/assignments/${input.assignmentId})`,
    ]
      .filter(Boolean)
      .join("");
    const { data: ann, error: aErr } = await admin
      .from("announcements")
      .insert({
        title: `[새 과제] ${input.title}`,
        body_md: body,
        author_id: input.authorId,
        audience_kind: "cohort",
        published_at: new Date().toISOString(),
      })
      .select("announcement_id")
      .single();
    if (aErr || !ann) {
      console.warn(
        "[postAssignmentAnnouncement] announcement insert failed",
        aErr?.message,
      );
      return;
    }
    const { error: audErr } = await admin.from("announcement_audiences").insert({
      announcement_id: ann.announcement_id,
      audience_type: "cohort",
      audience_id: input.cohortId,
      added_by: input.authorId,
    });
    if (audErr) {
      console.warn(
        "[postAssignmentAnnouncement] audience insert failed",
        audErr.message,
      );
    }
  } catch (e) {
    console.warn(
      "[postAssignmentAnnouncement] threw",
      e instanceof Error ? e.message : String(e),
    );
  }
}

export async function updateAssignment(
  client: SupabaseClient<Database>,
  assignmentId: string,
  patch: {
    title?: string;
    descriptionMd?: string | null;
    dueAt?: string;
    deadlinePolicy?: DeadlinePolicy;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = client;
  const u: Record<string, unknown> = {};
  if (patch.title !== undefined) u.title = patch.title;
  if (patch.descriptionMd !== undefined) u.description_md = patch.descriptionMd;
  if (patch.dueAt !== undefined) u.due_at = patch.dueAt;
  if (patch.deadlinePolicy !== undefined)
    u.deadline_policy = patch.deadlinePolicy;
  const { error } = await admin
    .from("assignments")
    .update(u)
    .eq("assignment_id", assignmentId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteAssignment(
  client: SupabaseClient<Database>,
  assignmentId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = client;
  const { error } = await admin
    .from("assignments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("assignment_id", assignmentId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export interface UpsertAssignmentItemInput {
  itemId?: string;
  assignmentId: string;
  ord: number;
  kind: AssignmentItemKind;
  articleId?: string | null;
  caseId?: string | null;
  problemId?: string | null;
  blankSetId?: string | null;
  targetQuantity?: number | null;
  note?: string | null;
}

export async function upsertAssignmentItem(
  client: SupabaseClient<Database>,
  input: UpsertAssignmentItemInput,
): Promise<{ ok: true; itemId: string } | { ok: false; error: string }> {
  const admin = client;
  const base = {
    assignment_id: input.assignmentId,
    ord: input.ord,
    kind: input.kind,
    article_id: null as string | null,
    case_id: null as string | null,
    problem_id: null as string | null,
    blank_set_id: null as string | null,
    target_quantity: input.targetQuantity ?? null,
    note: input.note ?? null,
  };
  if (input.kind === "article_read" || input.kind === "recitation") {
    base.article_id = input.articleId ?? null;
  } else if (input.kind === "case_read") {
    base.case_id = input.caseId ?? null;
  } else if (input.kind === "problem") {
    base.problem_id = input.problemId ?? null;
  } else if (input.kind === "blank_set") {
    base.blank_set_id = input.blankSetId ?? null;
  }
  if (input.itemId) {
    const { error } = await admin
      .from("assignment_items")
      .update(base)
      .eq("item_id", input.itemId);
    if (error) return { ok: false, error: error.message };
    return { ok: true, itemId: input.itemId };
  }
  const { data, error } = await admin
    .from("assignment_items")
    .insert(base)
    .select("item_id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, itemId: data.item_id };
}

// feat-7-040 후속(약점→과제) — problem 항목 다건 일괄 추가. 기존 최대 ord 뒤에 이어붙임.
// 요청 클라이언트 전달 시 RLS(소유권) 적용.
export async function addAssignmentProblemItems(
  client: SupabaseClient<Database>,
  assignmentId: string,
  problemIds: readonly string[],
): Promise<{ ok: true; added: number } | { ok: false; error: string }> {
  if (problemIds.length === 0) return { ok: true, added: 0 };
  const { data: maxRow } = await client
    .from("assignment_items")
    .select("ord")
    .eq("assignment_id", assignmentId)
    .order("ord", { ascending: false })
    .limit(1)
    .maybeSingle();
  let ord = (maxRow?.ord ?? -1) + 1;
  const rows = problemIds.map((pid) => ({
    assignment_id: assignmentId,
    ord: ord++,
    kind: "problem" as const,
    problem_id: pid,
  }));
  const { error } = await client.from("assignment_items").insert(rows);
  if (error) return { ok: false, error: error.message };
  return { ok: true, added: rows.length };
}

export async function deleteAssignmentItem(
  client: SupabaseClient<Database>,
  itemId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = client;
  const { error } = await admin
    .from("assignment_items")
    .delete()
    .eq("item_id", itemId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ─── 자동 완수 판정 ───

function rowToSubmission(r: {
  submission_id: string;
  assignment_id: string;
  user_id: string;
  status: string;
  completed_items: number;
  total_items: number;
  completed_at: string | null;
  last_checked_at: string;
}): AssignmentSubmission {
  return {
    submissionId: r.submission_id,
    assignmentId: r.assignment_id,
    userId: r.user_id,
    status: r.status as AssignmentStatus,
    completedItems: r.completed_items,
    totalItems: r.total_items,
    completedAt: r.completed_at,
    lastCheckedAt: r.last_checked_at,
  };
}

export interface RecomputeResult {
  submission: AssignmentSubmission | null;
  /** itemId → 완료 여부 (⑥ 항목별 완료 노출용 — 카운트와 동일 recompute 소스라 일치). */
  doneByItem: Record<string, boolean>;
}

export async function recomputeSubmission(
  assignmentId: string,
  userId: string,
): Promise<RecomputeResult> {
  const admin = adminClient as SupabaseClient<Database>;

  // 1) items
  const { data: items } = await admin
    .from("assignment_items")
    .select(
      "item_id, kind, article_id, case_id, problem_id, blank_set_id, target_quantity, article_blank_sets(blanks)",
    )
    .eq("assignment_id", assignmentId);
  const itemList = items ?? [];
  const total = itemList.length;
  if (total === 0) {
    return {
      submission: await upsertSubmission(
        assignmentId,
        userId,
        "pending",
        0,
        0,
        null,
      ),
      doneByItem: {},
    };
  }

  // 2) 학생 활동 데이터 fetch
  const problemIds = itemList
    .filter((i) => i.kind === "problem")
    .map((i) => i.problem_id)
    .filter(Boolean) as string[];
  const articleIds = itemList
    .filter((i) => i.kind === "article_read" || i.kind === "recitation")
    .map((i) => i.article_id)
    .filter(Boolean) as string[];
  const caseIds = itemList
    .filter((i) => i.kind === "case_read")
    .map((i) => i.case_id)
    .filter(Boolean) as string[];
  const blankSetIds = itemList
    .filter((i) => i.kind === "blank_set")
    .map((i) => i.blank_set_id)
    .filter(Boolean) as string[];

  // problem 정답 횟수 — target_quantity 회(기본 1) 이상 정답이면 완수.
  const correctProblemCount = new Map<string, number>();
  if (problemIds.length > 0) {
    const { data } = await admin
      .from("user_problem_attempts")
      .select("problem_id")
      .eq("user_id", userId)
      .eq("is_correct", true)
      .in("problem_id", problemIds);
    for (const r of data ?? [])
      correctProblemCount.set(
        r.problem_id,
        (correctProblemCount.get(r.problem_id) ?? 0) + 1,
      );
  }

  // article/case 열람 횟수 — target_quantity 회(기본 1) 이상이면 완수.
  const articleVisits = new Map<string, number>();
  const caseVisits = new Map<string, number>();
  if (articleIds.length > 0 || caseIds.length > 0) {
    const { data } = await admin
      .from("study_sessions")
      .select("scope")
      .eq("user_id", userId)
      .limit(5000);
    for (const r of data ?? []) {
      const scope = r.scope as {
        target_type?: string;
        target_id?: string;
      } | null;
      if (!scope?.target_id) continue;
      if (scope.target_type === "article")
        articleVisits.set(
          scope.target_id,
          (articleVisits.get(scope.target_id) ?? 0) + 1,
        );
      else if (scope.target_type === "case")
        caseVisits.set(
          scope.target_id,
          (caseVisits.get(scope.target_id) ?? 0) + 1,
        );
    }
  }

  // blank_set 완수 — 해당 set 의 모든 blank_idx 가 한 번이라도 정답
  const completedBlankSets = new Set<string>();
  if (blankSetIds.length > 0) {
    const { data: attempts } = await admin
      .from("user_blank_attempts")
      .select("set_id, blank_idx")
      .eq("user_id", userId)
      .eq("is_correct", true)
      .in("set_id", blankSetIds);
    const correctIdxBySet = new Map<string, Set<number>>();
    for (const r of attempts ?? []) {
      if (!correctIdxBySet.has(r.set_id))
        correctIdxBySet.set(r.set_id, new Set());
      correctIdxBySet.get(r.set_id)!.add(r.blank_idx);
    }
    for (const item of itemList) {
      if (item.kind !== "blank_set" || !item.blank_set_id) continue;
      const blanksArr = Array.isArray(item.article_blank_sets?.blanks)
        ? (item.article_blank_sets!.blanks as unknown[])
        : [];
      const total = blanksArr.length;
      const correctSet = correctIdxBySet.get(item.blank_set_id);
      if (total > 0 && correctSet && correctSet.size >= total) {
        completedBlankSets.add(item.blank_set_id);
      }
    }
  }

  // recitation 완료 횟수 — target_quantity 회(기본 1) 이상.
  const recitationCount = new Map<string, number>();
  if (articleIds.length > 0) {
    const { data } = await admin
      .from("user_recitation_attempts")
      .select("article_id")
      .eq("user_id", userId)
      .eq("is_complete", true)
      .in("article_id", articleIds);
    for (const r of data ?? [])
      recitationCount.set(
        r.article_id,
        (recitationCount.get(r.article_id) ?? 0) + 1,
      );
  }

  // 3) 매칭 — 항목별 done 수집(⑥). 카운트(completed)와 동일 소스.
  let completed = 0;
  const doneByItem: Record<string, boolean> = {};
  for (const item of itemList) {
    // 반복 목표 — target_quantity 회(기본 1) 이상이면 완수. blank_set 은 전 칸 정답(횟수 무관).
    const need = Math.max(1, item.target_quantity ?? 1);
    let done = false;
    if (item.kind === "problem" && item.problem_id) {
      done = (correctProblemCount.get(item.problem_id) ?? 0) >= need;
    } else if (item.kind === "article_read" && item.article_id) {
      done = (articleVisits.get(item.article_id) ?? 0) >= need;
    } else if (item.kind === "case_read" && item.case_id) {
      done = (caseVisits.get(item.case_id) ?? 0) >= need;
    } else if (item.kind === "blank_set" && item.blank_set_id) {
      done = completedBlankSets.has(item.blank_set_id);
    } else if (item.kind === "recitation" && item.article_id) {
      done = (recitationCount.get(item.article_id) ?? 0) >= need;
    }
    doneByItem[item.item_id] = done;
    if (done) completed += 1;
  }

  // 마감 정책 + completed_at 고정(feat-7-021b ④). 완료시각=최초 완료 1회 기록·이후 보존(표류 정지).
  const { data: asg } = await admin
    .from("assignments")
    .select("due_at, deadline_policy")
    .eq("assignment_id", assignmentId)
    .maybeSingle();
  const { data: prior } = await admin
    .from("assignment_submissions")
    .select("completed_at")
    .eq("assignment_id", assignmentId)
    .eq("user_id", userId)
    .maybeSingle();
  const dueAt = asg?.due_at ?? null;
  const policy = asg?.deadline_policy ?? "recommended";

  let status: AssignmentStatus;
  let completedAt: string | null = null;
  if (completed === total) {
    // 전 항목 완료 — 완료시각은 기존값 보존(없으면 최초 관측 now()). 매 recompute now() 표류 제거.
    const firstCompletedAt = prior?.completed_at ?? new Date().toISOString();
    const isLate =
      dueAt !== null &&
      new Date(firstCompletedAt).getTime() > new Date(dueAt).getTime();
    if (policy === "strict" && isLate) {
      // 마감형: 마감 후 완료는 불인정 → 미완(partial) 유지. 학습 자체는 무차단.
      status = "partial";
      completedAt = null;
    } else {
      status = "completed";
      completedAt = firstCompletedAt;
    }
  } else {
    status = completed === 0 ? "pending" : "partial";
    completedAt = null;
  }

  return {
    submission: await upsertSubmission(
      assignmentId,
      userId,
      status,
      completed,
      total,
      completedAt,
    ),
    doneByItem,
  };
}

async function upsertSubmission(
  assignmentId: string,
  userId: string,
  status: AssignmentStatus,
  completedItems: number,
  totalItems: number,
  completedAt: string | null,
): Promise<AssignmentSubmission | null> {
  const admin = adminClient as SupabaseClient<Database>;
  const { data, error } = await admin
    .from("assignment_submissions")
    .upsert(
      {
        assignment_id: assignmentId,
        user_id: userId,
        status,
        completed_items: completedItems,
        total_items: totalItems,
        completed_at: completedAt,
        last_checked_at: new Date().toISOString(),
      },
      { onConflict: "assignment_id,user_id" },
    )
    .select(
      "submission_id, assignment_id, user_id, status, completed_items, total_items, completed_at, last_checked_at",
    )
    .single();
  if (error) {
    console.error("[upsertSubmission] error", error.message);
    return null;
  }
  return rowToSubmission(data);
}

// ─── 진척 (운영자 화면) ───

export async function listAssignmentProgress(
  assignmentId: string,
): Promise<MemberAssignmentProgress[]> {
  const admin = adminClient as SupabaseClient<Database>;

  // assignment 의 cohort 확인
  const { data: a } = await admin
    .from("assignments")
    .select("cohort_id, target_profile_id")
    .eq("assignment_id", assignmentId)
    .maybeSingle();
  if (!a) return [];

  // 멤버 가져옴 — 개인 과제는 대상 학생만. 종합반 관리자(staff)는 통계에서 제외(수험생만).
  const { data: members } = await admin
    .from("cohort_members")
    .select(
      "profile_id, profiles!cohort_members_profile_id_fkey(name, role)",
    )
    .eq("cohort_id", a.cohort_id);
  const memberList = (members ?? []).filter(
    (m) =>
      (m.profiles?.role ?? "student") === "student" &&
      (!a.target_profile_id || m.profile_id === a.target_profile_id),
  );
  if (memberList.length === 0) return [];

  // 각 멤버 submission 재계산
  await Promise.all(
    memberList.map((m) => recomputeSubmission(assignmentId, m.profile_id)),
  );

  // submission 조회
  const { data: subs } = await admin
    .from("assignment_submissions")
    .select("user_id, status, completed_items, total_items, completed_at")
    .eq("assignment_id", assignmentId);
  const subByUser = new Map<
    string,
    {
      status: AssignmentStatus;
      completed_items: number;
      total_items: number;
      completed_at: string | null;
    }
  >();
  for (const s of subs ?? [])
    subByUser.set(s.user_id, {
      status: s.status as AssignmentStatus,
      completed_items: s.completed_items,
      total_items: s.total_items,
      completed_at: s.completed_at,
    });

  // 이메일 (admin listUsers — throw 방어)
  const emailById = new Map<string, string | null>();
  try {
    const list = await adminClient.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (!list.error) {
      for (const u of list.data.users) emailById.set(u.id, u.email ?? null);
    }
  } catch (e) {
    console.warn(
      "[listAssignmentProgress] listUsers threw",
      e instanceof Error ? e.message : String(e),
    );
  }

  return memberList.map((m) => {
    const sub = subByUser.get(m.profile_id);
    return {
      profileId: m.profile_id,
      name: m.profiles?.name ?? "(이름없음)",
      email: emailById.get(m.profile_id) ?? null,
      status: sub?.status ?? "pending",
      completedItems: sub?.completed_items ?? 0,
      totalItems: sub?.total_items ?? 0,
      completedAt: sub?.completed_at ?? null,
    };
  });
}

// ─── 학생 화면 — 본인 과제 ───

export async function listStudentAssignments(
  userId: string,
): Promise<StudentAssignmentRow[]> {
  const admin = adminClient as SupabaseClient<Database>;
  // 본인 cohort
  const { data: memberRows } = await admin
    .from("cohort_members")
    .select("cohort_id")
    .eq("profile_id", userId);
  const cohortIds = (memberRows ?? []).map((r) => r.cohort_id);
  if (cohortIds.length === 0) return [];

  const { data: rows } = await admin
    .from("assignments")
    .select(
      "assignment_id, cohort_id, title, description_md, assigned_at, due_at, created_by, source_curriculum_id, source_week_id, deadline_policy, target_profile_id",
    )
    .in("cohort_id", cohortIds)
    .is("deleted_at", null)
    // feat-7-045 — 반 공통 + 본인 개인 과제만 (타인 개인 과제 제외).
    .or(`target_profile_id.is.null,target_profile_id.eq.${userId}`)
    .order("due_at", { ascending: true });
  const list = rows ?? [];
  if (list.length === 0) return [];

  // 자동 재계산
  await Promise.all(
    list.map((r) => recomputeSubmission(r.assignment_id, userId)),
  );

  const { data: subs } = await admin
    .from("assignment_submissions")
    .select(
      "submission_id, assignment_id, user_id, status, completed_items, total_items, completed_at, last_checked_at",
    )
    .eq("user_id", userId)
    .in("assignment_id", list.map((r) => r.assignment_id));
  const subByA = new Map<string, AssignmentSubmission>();
  for (const s of subs ?? []) subByA.set(s.assignment_id, rowToSubmission(s));

  // 항목 카운트
  const { data: itemCounts } = await admin
    .from("assignment_items")
    .select("assignment_id")
    .in(
      "assignment_id",
      list.map((r) => r.assignment_id),
    );
  const itemByA = new Map<string, number>();
  for (const r of itemCounts ?? [])
    itemByA.set(r.assignment_id, (itemByA.get(r.assignment_id) ?? 0) + 1);

  return list.map((r) => ({
    assignmentId: r.assignment_id,
    cohortId: r.cohort_id,
    title: r.title,
    descriptionMd: r.description_md,
    assignedAt: r.assigned_at,
    dueAt: r.due_at,
    createdBy: r.created_by,
    sourceCurriculumId: r.source_curriculum_id,
    sourceWeekId: r.source_week_id,
    deadlinePolicy: r.deadline_policy,
    targetProfileId: r.target_profile_id,
    itemCount: itemByA.get(r.assignment_id) ?? 0,
    submission: subByA.get(r.assignment_id) ?? null,
  }));
}

export async function getStudentAssignment(
  assignmentId: string,
  userId: string,
): Promise<{ detail: AssignmentDetail; submission: AssignmentSubmission | null } | null> {
  const admin = adminClient as SupabaseClient<Database>;

  // cohort 멤버 검증
  const detail = await getAssignmentWithItems(assignmentId);
  if (!detail) return null;
  // feat-7-045 — 타인의 개인 과제 접근 차단.
  if (detail.targetProfileId && detail.targetProfileId !== userId) return null;
  const { data: member } = await admin
    .from("cohort_members")
    .select("cohort_id")
    .eq("cohort_id", detail.cohortId)
    .eq("profile_id", userId)
    .maybeSingle();
  if (!member) return null;

  // 자동 재계산 — submission 카운트 + 항목별 done(⑥) 머지.
  const { submission, doneByItem } = await recomputeSubmission(
    assignmentId,
    userId,
  );
  const items = detail.items.map((it) => ({
    ...it,
    done: doneByItem[it.itemId] ?? false,
  }));
  return { detail: { ...detail, items }, submission };
}

// ─── 자동 변환: 커리큘럼 주차 → 과제 ───

export async function convertWeekToAssignment(
  client: SupabaseClient<Database>,
  input: {
    weekId: string;
    cohortId: string;
    dueAt: string;
    createdBy: string;
  },
): Promise<{ ok: true; assignmentId: string } | { ok: false; error: string }> {
  // (나) — action=요청 클라이언트(RLS), cron(curriculum-weekly)=adminClient(시스템) 전달.
  const admin = client;

  // 주차 + 항목
  const { data: week } = await admin
    .from("curriculum_weeks")
    .select(
      "week_id, curriculum_id, week_number, title, goal_md, curricula!inner(name)",
    )
    .eq("week_id", input.weekId)
    .maybeSingle();
  if (!week) return { ok: false, error: "주차를 찾을 수 없습니다" };
  const { data: items } = await admin
    .from("curriculum_items")
    .select(
      "ord, kind, article_id, case_id, problem_id, blank_set_id, target_quantity, note",
    )
    .eq("week_id", input.weekId)
    .order("ord", { ascending: true });

  // assignment 생성
  const title = `[${week.curricula.name}] W${week.week_number} ${week.title}`;
  const { data: a, error } = await admin
    .from("assignments")
    .insert({
      cohort_id: input.cohortId,
      title,
      description_md: week.goal_md ?? null,
      due_at: input.dueAt,
      created_by: input.createdBy,
      source_curriculum_id: week.curriculum_id,
      source_week_id: week.week_id,
      deadline_policy: "recommended",
    })
    .select("assignment_id")
    .single();
  if (error || !a) return { ok: false, error: error?.message ?? "fail" };

  // 항목 변환 — curriculum kind 를 assignment kind 로 매핑 (lecture 는 skip)
  const itemRows = (items ?? [])
    .filter((it) => it.kind !== "lecture") // lecture 는 자동 채점 못함 — skip
    .map((it) => {
      const kind: AssignmentItemKind =
        it.kind === "article"
          ? "article_read"
          : it.kind === "case"
            ? "case_read"
            : (it.kind as AssignmentItemKind); // problem | blank_set | recitation
      return {
        assignment_id: a.assignment_id,
        ord: it.ord,
        kind,
        article_id: it.article_id,
        case_id: it.case_id,
        problem_id: it.problem_id,
        blank_set_id: it.blank_set_id,
        target_quantity: it.target_quantity,
        note: it.note,
      };
    });
  if (itemRows.length > 0) {
    const { error: itErr } = await admin
      .from("assignment_items")
      .insert(itemRows);
    if (itErr) {
      // 롤백
      await admin
        .from("assignments")
        .delete()
        .eq("assignment_id", a.assignment_id);
      return { ok: false, error: itErr.message };
    }
  }
  // 알림 fanout
  await postAssignmentAnnouncement(admin, {
    assignmentId: a.assignment_id,
    cohortId: input.cohortId,
    title,
    dueAt: input.dueAt,
    description: week.goal_md ?? null,
    authorId: input.createdBy,
  });
  return { ok: true, assignmentId: a.assignment_id };
}
