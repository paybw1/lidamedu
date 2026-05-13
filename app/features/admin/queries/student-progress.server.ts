// 학생 진도 모니터링 (feat-7-010) — staff 가 자기 반 학생들 학습 데이터 조회.
// 학생 자체 RLS 가 본인만 read 이므로 admin client(service_role) 로 우회.
// staff 권한 검사는 caller(loader) 에서 선행해야 함.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";
import {
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

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
    .select(
      "profile_id, joined_at, profiles!cohort_members_profile_id_fkey(name)",
    )
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

// ─── cohort 평균/분포 통계 (feat-7-019) ────────────────────────────────────

export type AccuracyBucket = "80+" | "60-79" | "40-59" | "20-39" | "0-19" | "none";

export interface CohortAggregateStats {
  memberCount: number;
  // 평균 KPI (학생 단위 평균; null 학생은 평균에서 제외)
  avgAccuracyPct: number | null;
  avgProblemsAttempted: number;
  avgArticlesViewed: number;
  avgBlanksAttempts: number;
  active7dCount: number;
  // 정답률 분포
  accuracyDistribution: Array<{ bucket: AccuracyBucket; count: number }>;
  // 5과목 평균
  bySubject: Array<{
    lawCode: LawSubjectSlug;
    name: string;
    avgProblemsAttempted: number;
    avgAccuracyPct: number | null;
    avgArticlesViewed: number;
  }>;
  // 상/하위 5명 (정답률 기준 — 시도 ≥ 5만 후보)
  topByAccuracy: Array<{
    profileId: string;
    name: string;
    accuracyPct: number;
    problemsAttempted: number;
  }>;
  bottomByAccuracy: Array<{
    profileId: string;
    name: string;
    accuracyPct: number;
    problemsAttempted: number;
  }>;
}

const AVG_ACCURACY_MIN_ATTEMPTS = 5;

function avg(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function avgOrNull(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function bucketAccuracy(pct: number | null): AccuracyBucket {
  if (pct === null) return "none";
  if (pct >= 80) return "80+";
  if (pct >= 60) return "60-79";
  if (pct >= 40) return "40-59";
  if (pct >= 20) return "20-39";
  return "0-19";
}

export async function getCohortAggregateStats(
  cohortId: string,
): Promise<CohortAggregateStats> {
  const admin = adminClient as SupabaseClient<Database>;

  // 1) cohort 멤버 + 학생별 진척(기존 함수 재사용)
  const members = await listCohortProgressSummary(cohortId);
  if (members.length === 0) {
    return {
      memberCount: 0,
      avgAccuracyPct: null,
      avgProblemsAttempted: 0,
      avgArticlesViewed: 0,
      avgBlanksAttempts: 0,
      active7dCount: 0,
      accuracyDistribution: (
        ["80+", "60-79", "40-59", "20-39", "0-19", "none"] as AccuracyBucket[]
      ).map((b) => ({ bucket: b, count: 0 })),
      bySubject: LAW_SUBJECT_SLUGS.map((slug) => ({
        lawCode: slug,
        name: LAW_SUBJECTS[slug].name,
        avgProblemsAttempted: 0,
        avgAccuracyPct: null,
        avgArticlesViewed: 0,
      })),
      topByAccuracy: [],
      bottomByAccuracy: [],
    };
  }

  const profileIds = members.map((m) => m.profileId);

  // 2) 평균 KPI
  const accuraciesValid = members
    .filter((m) => m.problemsAttempted >= AVG_ACCURACY_MIN_ATTEMPTS && m.accuracyPct !== null)
    .map((m) => m.accuracyPct as number);
  const avgAccuracyPct = avgOrNull(accuraciesValid);
  const avgProblemsAttempted = avg(members.map((m) => m.problemsAttempted));
  const avgArticlesViewed = avg(members.map((m) => m.articlesViewed));
  const avgBlanksAttempts = avg(members.map((m) => m.blanksAttempts));

  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const active7dCount = members.filter(
    (m) =>
      m.lastActivityAt !== null &&
      now - new Date(m.lastActivityAt).getTime() < SEVEN_DAYS_MS,
  ).length;

  // 3) 정답률 분포
  const bucketCounts = new Map<AccuracyBucket, number>();
  for (const m of members) {
    const pct =
      m.problemsAttempted >= AVG_ACCURACY_MIN_ATTEMPTS ? m.accuracyPct : null;
    const b = bucketAccuracy(pct);
    bucketCounts.set(b, (bucketCounts.get(b) ?? 0) + 1);
  }
  const accuracyDistribution = (
    ["80+", "60-79", "40-59", "20-39", "0-19", "none"] as AccuracyBucket[]
  ).map((b) => ({ bucket: b, count: bucketCounts.get(b) ?? 0 }));

  // 4) 과목별 평균 — cohort 멤버 attempts/sessions를 한 번에 가져와서 집계
  const PAGE = 1000;
  const memberLaw = new Map<
    string,
    Map<string, { att: Set<string>; cor: Set<string> }>
  >();
  let from = 0;
  for (;;) {
    const { data, error } = await admin
      .from("user_problem_attempts")
      .select(
        "user_id, problem_id, is_correct, problems!inner(law_id, laws!inner(law_code))",
      )
      .in("user_id", profileIds)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data) {
      const code = r.problems?.laws?.law_code;
      if (!code) continue;
      let memMap = memberLaw.get(r.user_id);
      if (!memMap) {
        memMap = new Map();
        memberLaw.set(r.user_id, memMap);
      }
      let entry = memMap.get(code);
      if (!entry) {
        entry = { att: new Set(), cor: new Set() };
        memMap.set(code, entry);
      }
      entry.att.add(r.problem_id);
      if (r.is_correct) entry.cor.add(r.problem_id);
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }

  const memberArt = new Map<string, Map<string, Set<string>>>();
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
      const scope = r.scope as {
        subject?: string;
        target_type?: string;
        target_id?: string;
      } | null;
      if (!scope || scope.target_type !== "article" || !scope.target_id || !scope.subject)
        continue;
      let memMap = memberArt.get(r.user_id);
      if (!memMap) {
        memMap = new Map();
        memberArt.set(r.user_id, memMap);
      }
      let s = memMap.get(scope.subject);
      if (!s) {
        s = new Set();
        memMap.set(scope.subject, s);
      }
      s.add(scope.target_id);
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }

  const bySubject = LAW_SUBJECT_SLUGS.map((slug) => {
    const attemptedCounts: number[] = [];
    const accuracies: number[] = [];
    const articleViews: number[] = [];
    for (const m of members) {
      const law = memberLaw.get(m.profileId)?.get(slug);
      const articles = memberArt.get(m.profileId)?.get(slug);
      const att = law?.att.size ?? 0;
      attemptedCounts.push(att);
      if (att >= AVG_ACCURACY_MIN_ATTEMPTS && law) {
        accuracies.push((law.cor.size / att) * 100);
      }
      articleViews.push(articles?.size ?? 0);
    }
    return {
      lawCode: slug,
      name: LAW_SUBJECTS[slug].name,
      avgProblemsAttempted: avg(attemptedCounts),
      avgAccuracyPct: avgOrNull(accuracies),
      avgArticlesViewed: avg(articleViews),
    };
  });

  // 5) 상/하위 5명 (정답률, 시도 ≥ 5)
  const sortable = members
    .filter(
      (m) =>
        m.problemsAttempted >= AVG_ACCURACY_MIN_ATTEMPTS &&
        m.accuracyPct !== null,
    )
    .map((m) => ({
      profileId: m.profileId,
      name: m.name,
      accuracyPct: m.accuracyPct as number,
      problemsAttempted: m.problemsAttempted,
    }));
  const topByAccuracy = [...sortable]
    .sort((a, b) => b.accuracyPct - a.accuracyPct)
    .slice(0, 5);
  const bottomByAccuracy = [...sortable]
    .sort((a, b) => a.accuracyPct - b.accuracyPct)
    .slice(0, 5);

  return {
    memberCount: members.length,
    avgAccuracyPct: avgAccuracyPct === null ? null : Math.round(avgAccuracyPct * 10) / 10,
    avgProblemsAttempted: Math.round(avgProblemsAttempted * 10) / 10,
    avgArticlesViewed: Math.round(avgArticlesViewed * 10) / 10,
    avgBlanksAttempts: Math.round(avgBlanksAttempts * 10) / 10,
    active7dCount,
    accuracyDistribution,
    bySubject: bySubject.map((s) => ({
      ...s,
      avgProblemsAttempted: Math.round(s.avgProblemsAttempted * 10) / 10,
      avgArticlesViewed: Math.round(s.avgArticlesViewed * 10) / 10,
      avgAccuracyPct:
        s.avgAccuracyPct === null ? null : Math.round(s.avgAccuracyPct * 10) / 10,
    })),
    topByAccuracy,
    bottomByAccuracy,
  };
}

// ─── cohort 주별 추이 (feat-7-019 A) ────────────────────────────────────

export interface CohortWeeklyTrendItem {
  weekStart: string; // YYYY-MM-DD (KST, Monday)
  label: string; // "이번 주", "1주 전", ...
  totalAttempts: number;
  correctAttempts: number;
  accuracyPct: number | null;
  activeMemberCount: number;
}

export interface CohortWeeklyTrend {
  weeks: CohortWeeklyTrendItem[]; // 가장 오래된 → 최신 순
}

function ymdKst(d: Date): string {
  // KST = UTC+9 — 단순 변환.
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  return k.toISOString().slice(0, 10);
}

function mondayStartKst(d: Date): Date {
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  const day = k.getUTCDay(); // 0 일~6 토
  const diff = (day + 6) % 7; // 월요일까지 후퇴
  k.setUTCHours(0, 0, 0, 0);
  k.setUTCDate(k.getUTCDate() - diff);
  // 다시 UTC 기준 (KST 0시 = UTC 전날 15시)
  return new Date(k.getTime() - 9 * 3600 * 1000);
}

export async function getCohortAccuracyTrend(
  cohortId: string,
  weekCount = 4,
): Promise<CohortWeeklyTrend> {
  const admin = adminClient as SupabaseClient<Database>;

  const { data: members } = await admin
    .from("cohort_members")
    .select("profile_id")
    .eq("cohort_id", cohortId);
  const ids = (members ?? []).map((m) => m.profile_id);
  if (ids.length === 0) {
    return { weeks: [] };
  }

  // 이번 주 월요일 → 가장 오래된 주 월요일
  const thisWeekStart = mondayStartKst(new Date());
  const oldestStart = new Date(
    thisWeekStart.getTime() - (weekCount - 1) * 7 * 24 * 3600 * 1000,
  );

  const PAGE = 1000;
  const attemptsByWeek = new Map<
    string,
    { total: number; correct: number; active: Set<string> }
  >();
  let from = 0;
  for (;;) {
    const { data, error } = await admin
      .from("user_problem_attempts")
      .select("user_id, is_correct, attempted_at")
      .in("user_id", ids)
      .gte("attempted_at", oldestStart.toISOString())
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data) {
      const weekStart = mondayStartKst(new Date(r.attempted_at));
      const key = ymdKst(weekStart);
      const entry = attemptsByWeek.get(key) ?? {
        total: 0,
        correct: 0,
        active: new Set<string>(),
      };
      entry.total += 1;
      if (r.is_correct) entry.correct += 1;
      entry.active.add(r.user_id);
      attemptsByWeek.set(key, entry);
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }

  const weeks: CohortWeeklyTrendItem[] = [];
  for (let i = weekCount - 1; i >= 0; i--) {
    const weekStart = new Date(
      thisWeekStart.getTime() - i * 7 * 24 * 3600 * 1000,
    );
    const key = ymdKst(weekStart);
    const entry = attemptsByWeek.get(key);
    const total = entry?.total ?? 0;
    const correct = entry?.correct ?? 0;
    const label =
      i === 0 ? "이번 주" : i === 1 ? "1주 전" : `${i}주 전`;
    weeks.push({
      weekStart: key,
      label,
      totalAttempts: total,
      correctAttempts: correct,
      accuracyPct: total > 0 ? Math.round((correct / total) * 1000) / 10 : null,
      activeMemberCount: entry?.active.size ?? 0,
    });
  }
  return { weeks };
}

// ─── 학생 detail — 본인 vs 소속 cohort 평균 비교 (feat-7-019 B) ────────────

export interface StudentCohortComparison {
  cohortId: string;
  cohortName: string;
  memberCount: number;
  // 본인
  selfAccuracyPct: number | null;
  selfProblemsAttempted: number;
  selfArticlesViewed: number;
  // 반 평균
  avgAccuracyPct: number | null;
  avgProblemsAttempted: number;
  avgArticlesViewed: number;
  // 차이 (본인 - 평균; 양수면 평균 이상)
  diffAccuracyPct: number | null;
  diffProblemsAttempted: number;
  diffArticlesViewed: number;
  // 본인의 cohort 내 정답률 분위 (1=하위 25%, 4=상위 25%; null=시도 < 5)
  quartile: 1 | 2 | 3 | 4 | null;
}

export async function getStudentCohortComparisons(
  profileId: string,
): Promise<StudentCohortComparison[]> {
  const admin = adminClient as SupabaseClient<Database>;

  // 학생이 속한 cohort 목록
  const { data: memberships, error } = await admin
    .from("cohort_members")
    .select(
      "cohort_id, cohorts!inner(cohort_id, name, deleted_at, is_archived)",
    )
    .eq("profile_id", profileId);
  if (error) throw error;
  const activeCohorts = (memberships ?? []).filter(
    (m) => m.cohorts && m.cohorts.deleted_at === null,
  );
  if (activeCohorts.length === 0) return [];

  const out: StudentCohortComparison[] = [];
  for (const m of activeCohorts) {
    const cohortId = m.cohort_id;
    const cohortName = m.cohorts!.name;
    const summary = await listCohortProgressSummary(cohortId);
    const self = summary.find((s) => s.profileId === profileId);
    if (!self || summary.length === 0) continue;

    // 반 평균 (학생 단위 평균)
    const accuraciesValid = summary
      .filter(
        (s) =>
          s.problemsAttempted >= AVG_ACCURACY_MIN_ATTEMPTS &&
          s.accuracyPct !== null,
      )
      .map((s) => s.accuracyPct as number);
    const avgAccuracyPct = avgOrNull(accuraciesValid);
    const avgProblemsAttempted = avg(summary.map((s) => s.problemsAttempted));
    const avgArticlesViewed = avg(summary.map((s) => s.articlesViewed));

    // 본인 분위 — 시도 ≥ 5 학생들 중 정답률 정렬해 본인 위치
    let quartile: 1 | 2 | 3 | 4 | null = null;
    if (self.problemsAttempted >= AVG_ACCURACY_MIN_ATTEMPTS && self.accuracyPct !== null) {
      const sorted = [...accuraciesValid].sort((a, b) => a - b);
      const rank = sorted.findIndex((v) => v >= (self.accuracyPct as number));
      const pos = rank === -1 ? sorted.length - 1 : rank;
      const ratio = (pos + 1) / sorted.length;
      quartile = ratio <= 0.25 ? 1 : ratio <= 0.5 ? 2 : ratio <= 0.75 ? 3 : 4;
    }

    const diffAcc =
      self.accuracyPct !== null && avgAccuracyPct !== null
        ? self.accuracyPct - avgAccuracyPct
        : null;

    out.push({
      cohortId,
      cohortName,
      memberCount: summary.length,
      selfAccuracyPct: self.accuracyPct,
      selfProblemsAttempted: self.problemsAttempted,
      selfArticlesViewed: self.articlesViewed,
      avgAccuracyPct:
        avgAccuracyPct === null ? null : Math.round(avgAccuracyPct * 10) / 10,
      avgProblemsAttempted: Math.round(avgProblemsAttempted * 10) / 10,
      avgArticlesViewed: Math.round(avgArticlesViewed * 10) / 10,
      diffAccuracyPct: diffAcc === null ? null : Math.round(diffAcc * 10) / 10,
      diffProblemsAttempted:
        Math.round((self.problemsAttempted - avgProblemsAttempted) * 10) / 10,
      diffArticlesViewed:
        Math.round((self.articlesViewed - avgArticlesViewed) * 10) / 10,
      quartile,
    });
  }
  return out;
}
