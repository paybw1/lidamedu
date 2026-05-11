// 학생 진도 모니터링 (feat-7-010) — staff 가 자기 반 학생들 학습 데이터 조회.
// 학생 자체 RLS 가 본인만 read 이므로 admin client(service_role) 로 우회.
// staff 권한 검사는 caller(loader) 에서 선행해야 함.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";

export interface CohortMemberProgress {
  profileId: string;
  name: string;
  email: string | null;
  joinedAt: string;
  // 학습 활동.
  problemsAttempted: number;
  problemsCorrect: number;
  accuracyPct: number | null;
  articlesViewed: number;
  blanksAttempts: number;
  blanksCorrect: number;
  blanksAccuracyPct: number | null;
  // 학습 보조 활동 (feat-7-003) — 학생이 능동적으로 표시한 것.
  memos: number;
  bookmarks: number;
  highlights: number;
  lastActivityAt: string | null;
}

// 한 cohort 의 모든 멤버 + 학습 요약. admin client 로 RLS 우회.
export async function listCohortProgressSummary(
  cohortId: string,
): Promise<CohortMemberProgress[]> {
  const admin = adminClient as SupabaseClient<Database>;

  // 멤버 + 프로필.
  const { data: members, error: mErr } = await admin
    .from("cohort_members")
    .select("profile_id, joined_at, profiles!profile_id(name)")
    .eq("cohort_id", cohortId);
  if (mErr) throw mErr;
  if (!members || members.length === 0) return [];

  const profileIds = members.map((m) => m.profile_id);

  // 이메일은 auth.users 에서.
  const authList = await adminClient.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  const emailById = new Map<string, string | null>();
  if (!authList.error) {
    for (const u of authList.data.users) emailById.set(u.id, u.email ?? null);
  }

  // 문제 풀이 집계 — distinct problem_id 기준.
  const PAGE = 1000;
  const attemptsByUser = new Map<
    string,
    { attempted: Set<string>; correct: Set<string>; lastAt: string | null }
  >();
  let from = 0;
  for (;;) {
    const { data, error } = await admin
      .from("user_problem_attempts")
      .select("user_id, problem_id, is_correct, attempted_at")
      .in("user_id", profileIds)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data) {
      const cur = attemptsByUser.get(r.user_id) ?? {
        attempted: new Set<string>(),
        correct: new Set<string>(),
        lastAt: null,
      };
      cur.attempted.add(r.problem_id);
      if (r.is_correct) cur.correct.add(r.problem_id);
      if (!cur.lastAt || r.attempted_at > cur.lastAt) cur.lastAt = r.attempted_at;
      attemptsByUser.set(r.user_id, cur);
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }

  // 조문 열람 — study_sessions 에서 target_type='article' 기준 distinct.
  const articlesByUser = new Map<string, Set<string>>();
  from = 0;
  for (;;) {
    const { data, error } = await admin
      .from("study_sessions")
      .select("user_id, scope")
      .in("user_id", profileIds)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data) {
      const scope = r.scope as Record<string, unknown> | null;
      if (!scope) continue;
      if (scope.target_type !== "article") continue;
      const tid = scope.target_id;
      if (typeof tid !== "string") continue;
      const set = articlesByUser.get(r.user_id) ?? new Set<string>();
      set.add(tid);
      articlesByUser.set(r.user_id, set);
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }

  // 학습 보조 (memo / bookmark / highlight) 합산 — deleted_at IS NULL.
  const memosByUser = new Map<string, number>();
  const bookmarksByUser = new Map<string, number>();
  const highlightsByUser = new Map<string, number>();
  const [memoRes, bookmarkRes, highlightRes] = await Promise.all([
    admin
      .from("user_memos")
      .select("user_id")
      .in("user_id", profileIds)
      .is("deleted_at", null),
    admin
      .from("user_bookmarks")
      .select("user_id, star_level")
      .in("user_id", profileIds)
      .is("deleted_at", null)
      .gt("star_level", 0),
    admin
      .from("user_highlights")
      .select("user_id")
      .in("user_id", profileIds)
      .is("deleted_at", null),
  ]);
  for (const r of memoRes.data ?? [])
    memosByUser.set(r.user_id, (memosByUser.get(r.user_id) ?? 0) + 1);
  for (const r of bookmarkRes.data ?? [])
    bookmarksByUser.set(r.user_id, (bookmarksByUser.get(r.user_id) ?? 0) + 1);
  for (const r of highlightRes.data ?? [])
    highlightsByUser.set(r.user_id, (highlightsByUser.get(r.user_id) ?? 0) + 1);

  // 빈칸 시도.
  const blanksByUser = new Map<
    string,
    { attempts: number; correct: number; lastAt: string | null }
  >();
  from = 0;
  for (;;) {
    const { data, error } = await admin
      .from("user_blank_attempts")
      .select("user_id, is_correct, attempted_at")
      .in("user_id", profileIds)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data) {
      const cur = blanksByUser.get(r.user_id) ?? {
        attempts: 0,
        correct: 0,
        lastAt: null as string | null,
      };
      cur.attempts += 1;
      if (r.is_correct) cur.correct += 1;
      if (!cur.lastAt || r.attempted_at > cur.lastAt) cur.lastAt = r.attempted_at;
      blanksByUser.set(r.user_id, cur);
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return members.map((m) => {
    const a = attemptsByUser.get(m.profile_id);
    const b = blanksByUser.get(m.profile_id);
    const arts = articlesByUser.get(m.profile_id);
    const problemsAttempted = a?.attempted.size ?? 0;
    const problemsCorrect = a?.correct.size ?? 0;
    const accuracyPct =
      problemsAttempted > 0
        ? Math.round((problemsCorrect / problemsAttempted) * 100)
        : null;
    const blanksAttempts = b?.attempts ?? 0;
    const blanksCorrect = b?.correct ?? 0;
    const blanksAccuracyPct =
      blanksAttempts > 0
        ? Math.round((blanksCorrect / blanksAttempts) * 100)
        : null;
    // 가장 최근 활동: 문제풀이/빈칸 중 max.
    const lastActivityAt = [a?.lastAt ?? null, b?.lastAt ?? null]
      .filter((x): x is string => !!x)
      .sort()
      .pop() ?? null;
    return {
      profileId: m.profile_id,
      name: m.profiles?.name ?? "",
      email: emailById.get(m.profile_id) ?? null,
      joinedAt: m.joined_at,
      problemsAttempted,
      problemsCorrect,
      accuracyPct,
      articlesViewed: arts?.size ?? 0,
      blanksAttempts,
      blanksCorrect,
      blanksAccuracyPct,
      memos: memosByUser.get(m.profile_id) ?? 0,
      bookmarks: bookmarksByUser.get(m.profile_id) ?? 0,
      highlights: highlightsByUser.get(m.profile_id) ?? 0,
      lastActivityAt,
    };
  });
}

// 한 학생 상세 — 과목별 진도/통계 + 최근 활동.
export interface StudentDetail {
  profileId: string;
  name: string;
  email: string | null;
  role: "student" | "instructor" | "admin";
  joinedAt: string;
  // 과목별.
  bySubject: Array<{
    lawCode: string;
    lawName: string;
    articlesViewed: number;
    problemsAttempted: number;
    problemsCorrect: number;
    accuracyPct: number | null;
  }>;
  // 자연과학.
  byScience: Array<{
    slug: string;
    name: string;
    attempted: number;
    correct: number;
    total: number;
    accuracyPct: number | null;
  }>;
  // 최근 활동 N건.
  recent: Array<{
    targetType: string;
    targetId: string;
    subject: string | null;
    occurredAt: string;
  }>;
  // 빈칸.
  blanks: {
    attempts: number;
    correct: number;
    accuracyPct: number | null;
  };
  totals: {
    problemsAttempted: number;
    problemsCorrect: number;
    accuracyPct: number | null;
    articlesViewed: number;
  };
}

export async function getStudentDetail(
  profileId: string,
): Promise<StudentDetail | null> {
  const admin = adminClient as SupabaseClient<Database>;

  // 프로필.
  const { data: profile } = await admin
    .from("profiles")
    .select("profile_id, name, role, created_at")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (!profile) return null;

  // 이메일.
  let email: string | null = null;
  try {
    const { data: authUser } = await adminClient.auth.admin.getUserById(profileId);
    email = authUser.user?.email ?? null;
  } catch {
    email = null;
  }

  // 문제 풀이 (과목별 분류 위해 law join).
  const PAGE = 1000;
  type AttemptRow = {
    problem_id: string;
    is_correct: boolean;
    attempted_at: string;
    problems: {
      law_id: string | null;
      subject_type: string;
      science_subject: string | null;
      laws: { law_code: string; short_label: string | null } | null;
    } | null;
  };
  const allAttempts: AttemptRow[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await admin
      .from("user_problem_attempts")
      .select(
        "problem_id, is_correct, attempted_at, problems!inner(law_id, subject_type, science_subject, laws(law_code, short_label))",
      )
      .eq("user_id", profileId)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data) allAttempts.push(r as AttemptRow);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  // 법별·자연과학별 그룹핑.
  const bySubjectMap = new Map<
    string,
    { name: string; attemptedSet: Set<string>; correctSet: Set<string> }
  >();
  const byScienceMap = new Map<
    string,
    { attemptedSet: Set<string>; correctSet: Set<string> }
  >();
  for (const a of allAttempts) {
    if (a.problems?.subject_type === "science") {
      const sub = a.problems.science_subject;
      if (!sub) continue;
      const cur = byScienceMap.get(sub) ?? {
        attemptedSet: new Set<string>(),
        correctSet: new Set<string>(),
      };
      cur.attemptedSet.add(a.problem_id);
      if (a.is_correct) cur.correctSet.add(a.problem_id);
      byScienceMap.set(sub, cur);
    } else if (a.problems?.laws?.law_code) {
      const code = a.problems.laws.law_code;
      const cur = bySubjectMap.get(code) ?? {
        name: a.problems.laws.short_label ?? code,
        attemptedSet: new Set<string>(),
        correctSet: new Set<string>(),
      };
      cur.attemptedSet.add(a.problem_id);
      if (a.is_correct) cur.correctSet.add(a.problem_id);
      bySubjectMap.set(code, cur);
    }
  }

  // 조문 열람 — study_sessions.
  const articleIdsByLaw = new Map<string, Set<string>>();
  const allArticleIds = new Set<string>();
  from = 0;
  for (;;) {
    const { data, error } = await admin
      .from("study_sessions")
      .select("scope")
      .eq("user_id", profileId)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data) {
      const scope = r.scope as Record<string, unknown> | null;
      if (!scope || scope.target_type !== "article") continue;
      const aid = scope.target_id;
      const subj = scope.subject;
      if (typeof aid !== "string") continue;
      allArticleIds.add(aid);
      if (typeof subj === "string") {
        const set = articleIdsByLaw.get(subj) ?? new Set<string>();
        set.add(aid);
        articleIdsByLaw.set(subj, set);
      }
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }

  const bySubject: StudentDetail["bySubject"] = [];
  for (const [code, info] of bySubjectMap) {
    const articles = articleIdsByLaw.get(code)?.size ?? 0;
    const attempted = info.attemptedSet.size;
    const correct = info.correctSet.size;
    bySubject.push({
      lawCode: code,
      lawName: info.name,
      articlesViewed: articles,
      problemsAttempted: attempted,
      problemsCorrect: correct,
      accuracyPct:
        attempted > 0 ? Math.round((correct / attempted) * 100) : null,
    });
  }
  // 문제 풀이 없는데 조문만 열람한 과목도 표시.
  for (const [code, set] of articleIdsByLaw) {
    if (bySubjectMap.has(code)) continue;
    bySubject.push({
      lawCode: code,
      lawName: code,
      articlesViewed: set.size,
      problemsAttempted: 0,
      problemsCorrect: 0,
      accuracyPct: null,
    });
  }
  bySubject.sort((a, b) => b.problemsAttempted - a.problemsAttempted);

  // 자연과학 — 총 문제 수도 가져와서 통합.
  const byScience: StudentDetail["byScience"] = [];
  const scienceNames: Record<string, string> = {
    physics: "물리",
    chemistry: "화학",
    biology: "생물",
    earth_science: "지구과학",
  };
  // 총 문제 수.
  const { data: totals } = await admin
    .from("problems")
    .select("science_subject")
    .eq("subject_type", "science")
    .is("deleted_at", null);
  const totalBySci = new Map<string, number>();
  for (const r of totals ?? []) {
    if (!r.science_subject) continue;
    totalBySci.set(
      r.science_subject,
      (totalBySci.get(r.science_subject) ?? 0) + 1,
    );
  }
  for (const slug of ["physics", "chemistry", "biology", "earth_science"]) {
    const info = byScienceMap.get(slug);
    const attempted = info?.attemptedSet.size ?? 0;
    const correct = info?.correctSet.size ?? 0;
    const total = totalBySci.get(slug) ?? 0;
    if (attempted === 0 && total === 0) continue;
    byScience.push({
      slug,
      name: scienceNames[slug] ?? slug,
      attempted,
      correct,
      total,
      accuracyPct:
        attempted > 0 ? Math.round((correct / attempted) * 100) : null,
    });
  }

  // 최근 활동 12건.
  const { data: recentSessions } = await admin
    .from("study_sessions")
    .select("scope, started_at")
    .eq("user_id", profileId)
    .order("started_at", { ascending: false })
    .limit(20);
  const recent: StudentDetail["recent"] = [];
  for (const r of recentSessions ?? []) {
    const scope = r.scope as Record<string, unknown> | null;
    if (!scope) continue;
    recent.push({
      targetType: typeof scope.target_type === "string" ? scope.target_type : "",
      targetId: typeof scope.target_id === "string" ? scope.target_id : "",
      subject: typeof scope.subject === "string" ? scope.subject : null,
      occurredAt: r.started_at ?? "",
    });
    if (recent.length >= 12) break;
  }

  // 빈칸.
  const { data: blankRows } = await admin
    .from("user_blank_attempts")
    .select("is_correct")
    .eq("user_id", profileId);
  const blankAttempts = blankRows?.length ?? 0;
  const blankCorrect = (blankRows ?? []).filter((r) => r.is_correct).length;

  const totalProblemsAttempted = allAttempts.reduce(
    (acc, a) => acc.add(a.problem_id),
    new Set<string>(),
  ).size;
  const totalProblemsCorrect = allAttempts
    .filter((a) => a.is_correct)
    .reduce((acc, a) => acc.add(a.problem_id), new Set<string>()).size;

  return {
    profileId: profile.profile_id,
    name: profile.name,
    email,
    role: profile.role as StudentDetail["role"],
    joinedAt: profile.created_at,
    bySubject,
    byScience,
    recent,
    blanks: {
      attempts: blankAttempts,
      correct: blankCorrect,
      accuracyPct:
        blankAttempts > 0
          ? Math.round((blankCorrect / blankAttempts) * 100)
          : null,
    },
    totals: {
      problemsAttempted: totalProblemsAttempted,
      problemsCorrect: totalProblemsCorrect,
      accuracyPct:
        totalProblemsAttempted > 0
          ? Math.round((totalProblemsCorrect / totalProblemsAttempted) * 100)
          : null,
      articlesViewed: allArticleIds.size,
    },
  };
}
