// feat-11-006 Phase 4 — 수강평/교재평(course_reviews) 서버 쿼리 + 구매자 게이트.
//   ★구매자 전용 작성은 여기(action 경유)서 강제한다 — RLS 는 author 기준이라 이 게이트가 유일 방어.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";
import { getLessonProgressForUser } from "~/features/lms/watch.server";

type Client = SupabaseClient<Database>;
export type ReviewTargetType = "plan" | "book";

export interface ReviewRow {
  reviewId: string;
  authorId: string;
  authorName: string | null;
  rating: number;
  body: string;
  isBest: boolean;
  isPublic: boolean;
  isBlinded: boolean;
  adminReply: string | null;
  adminReplyAt: string | null;
  createdAt: string;
}

export interface ReviewSummary {
  count: number;
  average: number; // 0 = 리뷰 없음
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

/** 구매자 여부 — 강의(plan)=수강권 존재, 교재(book)=결제완료 주문 항목. */
export async function isPurchaser(
  _client: Client,
  userId: string,
  targetType: ReviewTargetType,
  targetId: string,
): Promise<boolean> {
  // 구매 검증은 adminClient 로 조회한다 — 주문(orders/order_items) 자기조회 RLS 가
  //   제한적이라(book-detail 의 owned 판정도 adminClient 사용) 요청 client 로는 정구매자를
  //   놓칠 수 있다. 읽기 전용 게이트라 RLS 우회 부작용 없음.
  if (targetType === "plan") {
    const { count } = await adminClient
      .from("enrollments")
      .select("enrollment_id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("plan_id", targetId);
    return (count ?? 0) > 0;
  }
  // book — 결제완료(paid) 주문의 항목에 이 교재가 있는가.
  const { data } = await adminClient
    .from("order_items")
    .select("order_item_id, orders!inner(user_id, status)")
    .eq("book_id", targetId)
    .eq("orders.user_id", userId)
    .eq("orders.status", "paid")
    .limit(1);
  return (data ?? []).length > 0;
}

/** 강의 완강 여부 — 강의(plan) 후기 작성 게이트(구매 아닌 '완강한 사람만'). 서버 권위.
 *   판정: 이 사용자+plan 의 수강권이 걸린 course 중 하나라도 **게시된 전 회차를 모두 완강**했는가.
 *   완강 기준은 getLessonProgressForUser(콘텐츠별 completion_threshold)와 동일 — 내 강의 진도와 일치. */
export async function isPlanCourseCompleted(
  userId: string,
  planId: string,
): Promise<boolean> {
  const { data: enrs } = await adminClient
    .from("enrollments")
    .select("course_id")
    .eq("user_id", userId)
    .eq("plan_id", planId);
  const courseIds = [
    ...new Set((enrs ?? []).map((e) => e.course_id).filter(Boolean)),
  ] as string[];
  if (courseIds.length === 0) return false;

  const { data: lessons } = await adminClient
    .from("course_lessons")
    .select("lesson_id, course_id")
    .in("course_id", courseIds)
    .eq("is_published", true)
    .is("deleted_at", null);
  const byCourse = new Map<string, string[]>();
  for (const l of lessons ?? []) {
    const arr = byCourse.get(l.course_id) ?? [];
    arr.push(l.lesson_id);
    byCourse.set(l.course_id, arr);
  }
  const allLessonIds = [...byCourse.values()].flat();
  if (allLessonIds.length === 0) return false; // 회차 없는 강의는 완강 판정 불가

  const progress = await getLessonProgressForUser(userId, allLessonIds);
  for (const lids of byCourse.values()) {
    if (lids.length > 0 && lids.every((lid) => progress.get(lid)?.completed)) {
      return true;
    }
  }
  return false;
}

/** 공개 리뷰 목록 + 별점 요약(공개·미블라인드만). 베스트 먼저, 최신순. */
export async function listPublicReviews(
  client: Client,
  targetType: ReviewTargetType,
  targetId: string,
): Promise<{ reviews: ReviewRow[]; summary: ReviewSummary }> {
  const { data } = await client
    .from("course_reviews")
    .select(
      "review_id, author_id, rating, body, is_best, is_public, is_blinded, admin_reply, admin_reply_at, created_at, profiles!course_reviews_author_id_fkey(name)",
    )
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .eq("is_public", true)
    .eq("is_blinded", false)
    .is("deleted_at", null)
    .order("is_best", { ascending: false })
    .order("created_at", { ascending: false });
  const reviews = mapRows(data ?? []);
  return { reviews, summary: summarize(reviews) };
}

/** 내 리뷰(작성/수정 폼 초기값). 공개·블라인드 무관, 본인 것. */
export async function getMyReview(
  client: Client,
  userId: string,
  targetType: ReviewTargetType,
  targetId: string,
): Promise<ReviewRow | null> {
  const { data } = await client
    .from("course_reviews")
    .select(
      "review_id, author_id, rating, body, is_best, is_public, is_blinded, admin_reply, admin_reply_at, created_at, profiles!course_reviews_author_id_fkey(name)",
    )
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .eq("author_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  return data ? mapRows([data])[0] : null;
}

/** "내 강의" 카드 CTA 상태 — planId → 내 리뷰 요약(있으면) + 보상 지급 여부. */
export interface PlanReviewState {
  rating: number;
  body: string;
  isPublic: boolean;
  /** 이 대상에 보상 포인트가 이미 지급됐는지(재지급 안내 억제용). */
  rewarded: boolean;
}

/** 내 강의(수강권)별 내 리뷰 배치 조회. */
export async function getMyPlanReviews(
  client: Client,
  userId: string,
  planIds: string[],
): Promise<Map<string, PlanReviewState>> {
  const uniq = [...new Set(planIds)];
  if (uniq.length === 0) return new Map();
  const { data } = await client
    .from("course_reviews")
    .select("target_id, rating, body, is_public, points_awarded_at")
    .eq("target_type", "plan")
    .eq("author_id", userId)
    .in("target_id", uniq)
    .is("deleted_at", null);
  const byPlan = new Map<string, PlanReviewState>();
  for (const row of data ?? []) {
    byPlan.set(row.target_id, {
      rating: row.rating,
      body: row.body,
      isPublic: row.is_public,
      rewarded: row.points_awarded_at !== null,
    });
  }
  return byPlan;
}

function mapRows(
  rows: Array<{
    review_id: string;
    author_id: string;
    rating: number;
    body: string;
    is_best: boolean;
    is_public: boolean;
    is_blinded: boolean;
    admin_reply: string | null;
    admin_reply_at: string | null;
    created_at: string;
    profiles: { name: string | null } | null;
  }>,
): ReviewRow[] {
  return rows.map((r) => ({
    reviewId: r.review_id,
    authorId: r.author_id,
    authorName: r.profiles?.name ?? null,
    rating: r.rating,
    body: r.body,
    isBest: r.is_best,
    isPublic: r.is_public,
    isBlinded: r.is_blinded,
    adminReply: r.admin_reply,
    adminReplyAt: r.admin_reply_at,
    createdAt: r.created_at,
  }));
}

function summarize(reviews: ReviewRow[]): ReviewSummary {
  const dist: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;
  for (const r of reviews) {
    const k = Math.min(5, Math.max(1, r.rating)) as 1 | 2 | 3 | 4 | 5;
    dist[k]++;
    sum += r.rating;
  }
  return {
    count: reviews.length,
    average: reviews.length ? Math.round((sum / reviews.length) * 10) / 10 : 0,
    distribution: dist,
  };
}

// ── 운영자 관리 ──────────────────────────────────────────────────────────────

export interface AdminReviewRow extends ReviewRow {
  targetType: ReviewTargetType;
  targetId: string;
  targetLabel: string;
  reportCount: number;
  deletedAt: string | null;
  isFeatured: boolean;
}

/** 운영자 리뷰 목록 — 대상 라벨 조인, 필터(blinded/reported/best/featured/all). */
export async function listReviewsForAdmin(
  client: Client,
  filter: "all" | "blinded" | "reported" | "best" | "featured",
): Promise<AdminReviewRow[]> {
  let q = client
    .from("course_reviews")
    .select(
      "review_id, target_type, target_id, author_id, rating, body, is_best, is_featured, is_public, is_blinded, admin_reply, admin_reply_at, created_at, deleted_at, profiles!course_reviews_author_id_fkey(name)",
    )
    .order("created_at", { ascending: false })
    .limit(300);
  if (filter === "blinded") q = q.eq("is_blinded", true);
  else if (filter === "best") q = q.eq("is_best", true);
  else if (filter === "featured") q = q.eq("is_featured", true);
  const { data } = await q;
  let rows = data ?? [];

  // 신고 수는 course_review_reports 에서 집계(학생은 타인 리뷰 UPDATE 불가 → 카운터 미저장).
  const { data: reports } = await client
    .from("course_review_reports")
    .select("review_id");
  const reportCount = new Map<string, number>();
  for (const r of reports ?? [])
    reportCount.set(r.review_id, (reportCount.get(r.review_id) ?? 0) + 1);
  if (filter === "reported")
    rows = rows.filter((r) => (reportCount.get(r.review_id) ?? 0) > 0);

  // 대상 라벨 배치 조회.
  const planIds = [...new Set(rows.filter((r) => r.target_type === "plan").map((r) => r.target_id))];
  const bookIds = [...new Set(rows.filter((r) => r.target_type === "book").map((r) => r.target_id))];
  const [plansRes, booksRes] = await Promise.all([
    planIds.length
      ? client.from("subscription_plans").select("plan_id, name").in("plan_id", planIds)
      : Promise.resolve({ data: [] }),
    bookIds.length
      ? client.from("books").select("book_id, title").in("book_id", bookIds)
      : Promise.resolve({ data: [] }),
  ]);
  const planName = new Map((plansRes.data ?? []).map((p) => [p.plan_id, p.name]));
  const bookTitle = new Map((booksRes.data ?? []).map((b) => [b.book_id, b.title]));

  return rows.map((r) => ({
    reviewId: r.review_id,
    authorId: r.author_id,
    authorName: (r.profiles as { name: string | null } | null)?.name ?? null,
    rating: r.rating,
    body: r.body,
    isBest: r.is_best,
    isPublic: r.is_public,
    isBlinded: r.is_blinded,
    adminReply: r.admin_reply,
    adminReplyAt: r.admin_reply_at,
    createdAt: r.created_at,
    targetType: r.target_type as ReviewTargetType,
    targetId: r.target_id,
    targetLabel:
      r.target_type === "plan"
        ? planName.get(r.target_id) ?? "(삭제된 상품)"
        : bookTitle.get(r.target_id) ?? "(삭제된 교재)",
    reportCount: reportCount.get(r.review_id) ?? 0,
    deletedAt: r.deleted_at,
    isFeatured: r.is_featured,
  }));
}

// ── 강의 랜딩 노출(큐레이션) ─────────────────────────────────────────────────
export interface FeaturedReviewRow {
  reviewId: string;
  rating: number;
  body: string;
  authorName: string | null;
  targetType: ReviewTargetType;
  targetLabel: string;
}

/** 강의 랜딩(/lecture/home) 노출용 큐레이션 후기 — is_featured·공개·미블라인드만, 최근 지정 순. */
export async function listFeaturedReviews(
  client: Client,
  limit = 6,
): Promise<FeaturedReviewRow[]> {
  const { data } = await client
    .from("course_reviews")
    .select(
      "review_id, target_type, target_id, rating, body, profiles!course_reviews_author_id_fkey(name)",
    )
    .eq("is_featured", true)
    .eq("is_public", true)
    .eq("is_blinded", false)
    .is("deleted_at", null)
    .order("featured_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  const rows = data ?? [];
  if (rows.length === 0) return [];

  // 대상(강의/교재) 라벨 배치 조회.
  const planIds = [
    ...new Set(rows.filter((r) => r.target_type === "plan").map((r) => r.target_id)),
  ];
  const bookIds = [
    ...new Set(rows.filter((r) => r.target_type === "book").map((r) => r.target_id)),
  ];
  const [plansRes, booksRes] = await Promise.all([
    planIds.length
      ? client.from("subscription_plans").select("plan_id, name").in("plan_id", planIds)
      : Promise.resolve({ data: [] as { plan_id: string; name: string }[] }),
    bookIds.length
      ? client.from("books").select("book_id, title").in("book_id", bookIds)
      : Promise.resolve({ data: [] as { book_id: string; title: string }[] }),
  ]);
  const planName = new Map((plansRes.data ?? []).map((p) => [p.plan_id, p.name]));
  const bookTitle = new Map((booksRes.data ?? []).map((b) => [b.book_id, b.title]));

  return rows.map((r) => ({
    reviewId: r.review_id,
    rating: r.rating,
    body: r.body,
    authorName: (r.profiles as { name: string | null } | null)?.name ?? null,
    targetType: r.target_type as ReviewTargetType,
    targetLabel:
      r.target_type === "plan"
        ? planName.get(r.target_id) ?? "강의"
        : bookTitle.get(r.target_id) ?? "교재",
  }));
}
