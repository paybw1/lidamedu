// feat-2-009 오늘의 학습 메뉴 — 서버 합성 엔진.
// 캐싱: user + KST_date 별 1회 픽 고정 (user_daily_recommendations 스냅샷).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "database.types";

import {
  type DailyMenuItem,
  type DailyMenuKind,
  parseRecommendationPrefs,
  sortDailyMenu,
} from "~/features/study/lib/daily-menu";
import { getDueBlankSets } from "~/features/blanks/srs.server";
import { getCurrentWeekTrack } from "~/features/curricula/queries.server";
import { getDueArticleReviews } from "~/features/study/article-review.server";
import { getWeakAreas } from "~/features/study/queries.server";
import { getDueProblems } from "~/features/study/srs.server";
import {
  getRound1SubjectStats,
  type SubjectStat,
} from "~/features/exam-results/official-stats";
import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";

/**
 * 공식 통계상 "통계적 과락 위험" 라벨. 약점 슬롯 body 에 컨텍스트로 보강.
 * 1차 과목 한정 (산업재산권법/민법개론/자연과학개론) — 2차는 fail_rate 가 더 변동성 큼.
 *
 * lawCode → 공식 통계 과목명 매핑:
 *   patent/trademark/design → 산업재산권법
 *   civil → 민법개론
 *   (자연과학은 별도 LawSubjectSlug 가 아님 — daily-menu 약점은 law 만 다룸)
 */
function officialFailRateLabel(lawCode: LawSubjectSlug): string | null {
  const subject =
    lawCode === "civil"
      ? "민법개론"
      : lawCode === "patent" || lawCode === "trademark" || lawCode === "design"
        ? "산업재산권법"
        : null;
  if (!subject) return null;
  const stats: SubjectStat[] = getRound1SubjectStats(5);
  const row = stats.find((s) => s.subject === subject);
  if (!row) return null;
  return `공식 통계 과락률 ${row.failRateAcrossYears}%`;
}

/** KST 자정 기준 오늘 날짜 YYYY-MM-DD. */
export function kstToday(now: Date = new Date()): string {
  const kstMs = now.getTime() + 9 * 60 * 60 * 1000;
  return new Date(kstMs).toISOString().slice(0, 10);
}

/* ── 메인 진입점 ──────────────────────────────────────────────────────── */

export async function getOrComposeDailyMenu(
  client: SupabaseClient<Database>,
  userId: string,
  date: string = kstToday(),
): Promise<DailyMenuItem[]> {
  // 1. 스냅샷 조회.
  const { data: cached } = await client
    .from("user_daily_recommendations")
    .select("items")
    .eq("user_id", userId)
    .eq("recommendation_date", date)
    .maybeSingle();
  if (cached?.items) {
    return cached.items as unknown as DailyMenuItem[];
  }
  // 2. 신규 합성 + upsert.
  const items = await composeDailyMenu(client, userId);
  await client.from("user_daily_recommendations").insert({
    user_id: userId,
    recommendation_date: date,
    items: items as unknown as Json,
  });
  return items;
}

/** 학생이 오늘 화면을 처음 열 때 view 기록 — analytics 용. */
export async function markDailyMenuViewed(
  client: SupabaseClient<Database>,
  userId: string,
  date: string = kstToday(),
): Promise<void> {
  await client
    .from("user_daily_recommendations")
    .update({ viewed_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("recommendation_date", date)
    .is("viewed_at", null);
}

/* ── 합성 엔진 ────────────────────────────────────────────────────────── */

export async function composeDailyMenu(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<DailyMenuItem[]> {
  // feat-2-021 — 사용자 슬롯 ON/OFF 설정 로딩.
  const { data: profile } = await client
    .from("profiles")
    .select("recommendation_prefs")
    .eq("profile_id", userId)
    .maybeSingle();
  const enabled = parseRecommendationPrefs(profile?.recommendation_prefs);

  // 7 슬롯 병렬 평가 — 비활성 슬롯은 즉시 null.
  const [
    weakProblem,
    weakArticle,
    unreadCase,
    blankDue,
    gapProblems,
    cohortTrack,
    articleReview,
  ] = await Promise.all([
    enabled.weak_problem ? pickWeakProblem(client, userId) : null,
    enabled.weak_article ? pickWeakArticle(client, userId) : null,
    enabled.unread_case ? pickUnreadCase(client, userId) : null,
    enabled.blank_due ? pickBlankDue(client, userId) : null,
    enabled.gap_problems ? pickGapProblems(client, userId) : null,
    enabled.cohort_track ? pickCohortTrack(userId) : null,
    enabled.article_review ? pickArticleReview(client, userId) : null,
  ]);

  const items = [
    weakProblem,
    weakArticle,
    unreadCase,
    blankDue,
    gapProblems,
    cohortTrack,
    articleReview,
  ].filter((x): x is DailyMenuItem => x !== null);
  return sortDailyMenu(items);
}

/* ── 슬롯 1: weak_problem — SRS due 우선 + fallback weak areas ────── */

async function pickWeakProblem(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<DailyMenuItem | null> {
  // 1순위 — SRS 복습 due. 항목이 있으면 SRS 큐 길이를 noted.
  const due = await getDueProblems(client, userId, 5);
  if (due.length > 0) {
    const top = due[0];
    const overdueDays = -top.daysUntilDue;
    const extraCount = due.length - 1;
    return {
      kind: "weak_problem",
      title: `복습 due — ${top.primaryArticleLabel ?? "미분류"}`,
      body:
        extraCount > 0
          ? `복습 시점 도래. SRS 큐 ${due.length}건 (${overdueDays}일 지남).`
          : `복습 시점 도래 (${overdueDays}일 지남). 간격 ${top.intervalDays}일 · 실패 ${top.lapses}회.`,
      ctaLabel: extraCount > 0 ? `복습 시작 (+${extraCount}건)` : "이 문제 풀기",
      ctaUrl: `/subjects/${top.lawCode}/problems/${top.problemId}`,
      estimatedMinutes: 3,
      priority: "high",
      metadata: {
        problemId: top.problemId,
        lawCode: top.lawCode,
        srsDueCount: due.length,
      },
    };
  }
  // 2순위 — 기존 weak areas (SRS 이력 없음 = 신규 학생).
  const weak = await getWeakAreas(client, userId, 1);
  const top = weak[0];
  if (!top) return null;
  const failHint = officialFailRateLabel(top.lawCode);
  return {
    kind: "weak_problem",
    title: `약점 문제 재시도 — ${top.primaryArticleLabel ?? "미분류"}`,
    body: `최근 오답이면서 전체 정답률이 가장 낮은 문제. 글로벌 ${
      top.globalAccuracyPct ?? "—"
    }%${failHint ? ` · ${failHint}` : ""}`,
    ctaLabel: "이 문제 풀기",
    ctaUrl: `/subjects/${top.lawCode}/problems/${top.problemId}`,
    estimatedMinutes: 3,
    priority: "high",
    metadata: { problemId: top.problemId, lawCode: top.lawCode },
  };
}

/* ── 슬롯 2: weak_article — 약점 단원의 미열람 조문 ────────────────── */

async function pickWeakArticle(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<DailyMenuItem | null> {
  // 약점 5개 중 primary_article_id 있는 것들 picker.
  const weak = await getWeakAreas(client, userId, 5);
  if (weak.length === 0) return null;

  // primary article 후보 조회.
  const { data: problems } = await client
    .from("problems")
    .select(
      "primary_article_id, articles!primary_article_id(article_id, article_number, display_label, importance, laws!inner(law_code))",
    )
    .in(
      "problem_id",
      weak.map((w) => w.problemId),
    );

  // 본인 조문 study_sessions distinct.
  const { data: sess } = await client
    .from("study_sessions")
    .select("scope")
    .eq("user_id", userId)
    .limit(5000);
  const visited = new Set<string>();
  for (const r of sess ?? []) {
    const sc = r.scope as { target_type?: string; target_id?: string } | null;
    if (sc?.target_type === "article" && sc.target_id) visited.add(sc.target_id);
  }

  // 미열람 + importance 높은 순.
  const candidates = (problems ?? [])
    .filter((p) => p.articles && !visited.has(p.articles.article_id))
    .map((p) => ({
      articleId: p.articles!.article_id,
      articleNumber: p.articles!.article_number,
      displayLabel: p.articles!.display_label,
      importance: p.articles!.importance ?? 0,
      lawCode: p.articles!.laws.law_code as LawSubjectSlug,
    }));
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.importance - a.importance);
  const pick = candidates[0];

  return {
    kind: "weak_article",
    title: `약점 조문 학습 — ${pick.displayLabel}`,
    body: "최근 오답 문제의 근거 조문. 아직 학습 기록이 없는 핵심 조문부터.",
    ctaLabel: "조문 읽기",
    ctaUrl: `/subjects/${pick.lawCode}/articles/${pick.articleNumber}`,
    estimatedMinutes: 7,
    priority: "high",
    metadata: { articleId: pick.articleId, lawCode: pick.lawCode },
  };
}

/* ── 슬롯 3: unread_case — 미열람 중요 판례 ───────────────────────── */

async function pickUnreadCase(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<DailyMenuItem | null> {
  const { data: sess } = await client
    .from("study_sessions")
    .select("scope")
    .eq("user_id", userId)
    .limit(5000);
  const visited = new Set<string>();
  for (const r of sess ?? []) {
    const sc = r.scope as { target_type?: string; target_id?: string } | null;
    if (sc?.target_type === "case" && sc.target_id) visited.add(sc.target_id);
  }

  // importance≥3 + 본인이 읽지 않은 판례. 선고일 최신순.
  const { data: cases } = await client
    .from("cases")
    .select("case_id, case_number, case_title, subject_laws, decided_at, importance")
    .gte("importance", 3)
    .is("deleted_at", null)
    .order("decided_at", { ascending: false, nullsFirst: false })
    .limit(50);
  const pick = (cases ?? []).find((c) => !visited.has(c.case_id));
  if (!pick) return null;
  const lawCode =
    (pick.subject_laws?.[0] as LawSubjectSlug | undefined) ?? "patent";

  return {
    kind: "unread_case",
    title: `중요 판례 정독 — ${pick.case_title ?? pick.case_number}`,
    body: `중요도 ${pick.importance}★ · 아직 안 열어본 핵심 판례.`,
    ctaLabel: "판례 보기",
    ctaUrl: `/subjects/${lawCode}/cases/${pick.case_id}`,
    estimatedMinutes: 5,
    priority: "medium",
    metadata: { caseId: pick.case_id, lawCode },
  };
}

/* ── 슬롯 4: blank_due — 빈칸 SRS due 우선 + fallback 미시도 ────── */

async function pickBlankDue(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<DailyMenuItem | null> {
  // 1순위 — 빈칸 SRS due (가장 오래된 due 의 set).
  const dueSets = await getDueBlankSets(client, userId, 5);
  if (dueSets.length > 0) {
    const top = dueSets[0];
    const overdueDays = -top.daysUntilDue;
    const extra = dueSets.length - 1;
    return {
      kind: "blank_due",
      title: `빈칸 복습 due — ${top.displayLabel}`,
      body:
        extra > 0
          ? `${top.dueBlankCount}개 빈칸 복습 시점 도래 (${overdueDays}일 지남). 다른 ${extra}개 세트도 due.`
          : `${top.dueBlankCount}개 빈칸 복습 시점 도래 (${overdueDays}일 지남).`,
      ctaLabel: "복습 시작",
      ctaUrl: `/subjects/${top.lawCode}/articles/${top.articleNumber}?blank=${top.setId}`,
      estimatedMinutes: 5,
      priority: "high",
      metadata: {
        setId: top.setId,
        lawCode: top.lawCode,
        dueBlankCount: top.dueBlankCount,
        dueSetsCount: dueSets.length,
      },
    };
  }

  // 2순위 — 신규 미시도 빈칸 세트.
  const { data: tried } = await client
    .from("user_blank_attempts")
    .select("set_id")
    .eq("user_id", userId);
  const triedSet = new Set((tried ?? []).map((r) => r.set_id));

  const { data: sets } = await client
    .from("article_blank_sets")
    .select(
      "set_id, article_id, articles!inner(article_id, article_number, display_label, importance, laws!inner(law_code))",
    )
    .order("created_at", { ascending: false })
    .limit(50);
  const candidates = (sets ?? [])
    .filter((s) => !triedSet.has(s.set_id))
    .map((s) => ({
      setId: s.set_id,
      articleNumber: s.articles.article_number,
      displayLabel: s.articles.display_label,
      importance: s.articles.importance ?? 0,
      lawCode: s.articles.laws.law_code as LawSubjectSlug,
    }));
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.importance - a.importance);
  const pick = candidates[0];

  return {
    kind: "blank_due",
    title: `빈칸 학습 — ${pick.displayLabel}`,
    body: "아직 한 번도 시도하지 않은 빈칸 세트. 핵심 문구 암기.",
    ctaLabel: "빈칸 풀기",
    ctaUrl: `/subjects/${pick.lawCode}/articles/${pick.articleNumber}?blank=${pick.setId}`,
    estimatedMinutes: 5,
    priority: "medium",
    metadata: { setId: pick.setId, lawCode: pick.lawCode },
  };
}

/* ── 슬롯 5: gap_problems — 새 5문항 진도 보충 ────────────────────── */

async function pickGapProblems(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<DailyMenuItem | null> {
  // 본인의 next_exam_round + next_exam_year 기반 과목.
  const { data: profile } = await client
    .from("profiles")
    .select("next_exam_year, next_exam_round")
    .eq("profile_id", userId)
    .maybeSingle();
  const round = profile?.next_exam_round;
  // 1차 = 산업재산권 3법 + 민법 / 2차 = 산업재산권 3법 + 민소법.
  const laws: LawSubjectSlug[] =
    round === "second"
      ? ["patent", "trademark", "design", "civil-procedure"]
      : ["patent", "trademark", "design", "civil"];

  // 본인 시도 problem_id.
  const { data: attempted } = await client
    .from("user_problem_attempts")
    .select("problem_id")
    .eq("user_id", userId)
    .limit(10000);
  const attemptedSet = new Set((attempted ?? []).map((r) => r.problem_id));

  // 후보 문제 — 미풀이 객관식, 본인 응시 과목.
  const { data: problems } = await client
    .from("problems")
    .select("problem_id, laws!inner(law_code)")
    .in("format", ["mc_short", "mc_box", "mc_case"])
    .is("deleted_at", null)
    .in(
      "laws.law_code",
      laws as string[],
    )
    .limit(500);

  const candidates = (problems ?? []).filter(
    (p) => !attemptedSet.has(p.problem_id),
  );
  if (candidates.length < 5) return null;

  // 랜덤 5개 (단순 셔플 + slice).
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const picks = candidates.slice(0, 5);
  const lawCode = (picks[0].laws.law_code as LawSubjectSlug) ?? "patent";

  return {
    kind: "gap_problems",
    title: "새 객관식 5문항",
    body: "응시 과목 중 아직 풀지 않은 문제 5개. 진도 채우기.",
    ctaLabel: "5문항 풀기",
    // 첫 문제 viewer 진입. 풀이 후 next/prev 로 이어 풀이 가능.
    ctaUrl: `/subjects/${lawCode}/problems/${picks[0].problem_id}`,
    estimatedMinutes: 15,
    priority: "low",
    metadata: {
      problemIds: picks.map((p) => p.problem_id),
      lawCode,
    },
  };
}

/* ── 슬롯 6: cohort_track — 이번 주 트랙 미완 항목 1개 ──────────── */

async function pickCohortTrack(userId: string): Promise<DailyMenuItem | null> {
  const track = await getCurrentWeekTrack(userId);
  if (!track) return null;
  // 미완 항목 중 ord 가장 작은 것.
  const next = track.items.find((it) => !it.isDone && it.entryUrl);
  if (!next) return null;
  return {
    kind: "cohort_track",
    title: `이번 주 트랙 — ${next.label}`,
    body: `${track.cohortName} · ${track.weekNumber}주차 (${track.completedCount}/${track.totalCount} 완수). 다음 항목.`,
    ctaLabel: "트랙 항목 시작",
    ctaUrl: next.entryUrl ?? `/dashboard`,
    estimatedMinutes: 10,
    priority: "high",
    metadata: {
      cohortId: track.cohortId,
      weekId: track.weekId,
      itemId: next.itemId,
      kind: next.kind,
    },
  };
}

/* ── 슬롯 7: article_review — 조문 정독 복습 due ─────────────────── */

async function pickArticleReview(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<DailyMenuItem | null> {
  const due = await getDueArticleReviews(client, userId, 5);
  if (due.length === 0) return null;
  const top = due[0];
  const extra = due.length - 1;
  const overdueDays = -top.daysUntilDue;
  return {
    kind: "article_review",
    title: `조문 복습 — ${top.displayLabel}`,
    body:
      extra > 0
        ? `${top.visitCount}회 방문 · ${overdueDays}일 지남. 다른 ${extra}개 조문도 복습 시점.`
        : `${top.visitCount}회 방문 후 ${overdueDays}일 지남. 다시 한 번 정독.`,
    ctaLabel: "조문 보기",
    ctaUrl: `/subjects/${top.lawCode}/articles/${top.articleNumber}`,
    estimatedMinutes: 5,
    priority: "medium",
    metadata: {
      articleId: top.articleId,
      lawCode: top.lawCode,
      visitCount: top.visitCount,
    },
  };
}

/* ── kind helpers ────────────────────────────────────────────────────── */

export const ALL_KINDS: DailyMenuKind[] = [
  "weak_problem",
  "weak_article",
  "unread_case",
  "blank_due",
  "gap_problems",
  "cohort_track",
  "article_review",
];
