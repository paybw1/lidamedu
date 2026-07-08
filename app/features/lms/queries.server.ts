// feat-11-002 — LMS 시청 골격 쿼리. 설계: docs/features/lidamedu-이전-M1-설계.md §3.1~3.4
// 콘텐츠 읽기/쓰기 = 요청 클라이언트(RLS staff 게이트).
// 수강권(enrollments) 쓰기 = adminClient 전용(RLS 에 쓰기 정책 없음 — 서버 권위).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";

type Client = SupabaseClient<Database>;

// ── 시리즈·에디션 ───────────────────────────────────────────────────────────

export interface SeriesWithEditions {
  seriesId: string;
  title: string;
  subjectCode: string;
  instructorId: string | null;
  instructorName: string | null;
  editions: Array<{
    courseId: string;
    editionLabel: string;
    editionYear: number;
    isCurrent: boolean;
    status: "draft" | "published" | "archived";
    lessonCount: number;
    totalDurationSeconds: number;
  }>;
}

export async function listSeriesWithEditions(
  client: Client,
): Promise<SeriesWithEditions[]> {
  const { data: series, error } = await client
    .from("course_series")
    .select(
      "series_id, title, subject_code, instructor_id, instructor:profiles!course_series_instructor_id_fkey(name)",
    )
    .order("created_at", { ascending: false });
  if (error) throw error;
  const { data: courses, error: cErr } = await client
    .from("courses")
    .select("course_id, series_id, edition_label, edition_year, is_current, status")
    .is("deleted_at", null)
    .order("edition_year", { ascending: false });
  if (cErr) throw cErr;
  const courseIds = (courses ?? []).map((c) => c.course_id);
  // 회차·재생시간 집계 (active 영상 기준)
  const lessonAgg = new Map<string, { count: number; duration: number }>();
  if (courseIds.length > 0) {
    const { data: lessons } = await client
      .from("course_lessons")
      .select("lesson_id, course_id")
      .in("course_id", courseIds)
      .is("deleted_at", null);
    const lessonToCourse = new Map(
      (lessons ?? []).map((l) => [l.lesson_id, l.course_id]),
    );
    for (const l of lessons ?? []) {
      const agg = lessonAgg.get(l.course_id) ?? { count: 0, duration: 0 };
      agg.count++;
      lessonAgg.set(l.course_id, agg);
    }
    const lessonIds = [...lessonToCourse.keys()];
    for (let i = 0; i < lessonIds.length; i += 150) {
      const { data: vids } = await client
        .from("lesson_videos")
        .select("lesson_id, duration_seconds")
        .in("lesson_id", lessonIds.slice(i, i + 150))
        .eq("is_active", true);
      for (const v of vids ?? []) {
        const cid = lessonToCourse.get(v.lesson_id);
        if (!cid) continue;
        const agg = lessonAgg.get(cid) ?? { count: 0, duration: 0 };
        agg.duration += v.duration_seconds;
        lessonAgg.set(cid, agg);
      }
    }
  }
  return (series ?? []).map((s) => ({
    seriesId: s.series_id,
    title: s.title,
    subjectCode: s.subject_code,
    instructorId: s.instructor_id,
    instructorName:
      (s.instructor as { name: string | null } | null)?.name ?? null,
    editions: (courses ?? [])
      .filter((c) => c.series_id === s.series_id)
      .map((c) => ({
        courseId: c.course_id,
        editionLabel: c.edition_label,
        editionYear: c.edition_year,
        isCurrent: c.is_current,
        status: c.status as "draft" | "published" | "archived",
        lessonCount: lessonAgg.get(c.course_id)?.count ?? 0,
        totalDurationSeconds: lessonAgg.get(c.course_id)?.duration ?? 0,
      })),
  }));
}

// ── 에디션 상세 (회차·영상·자료·메모) ──────────────────────────────────────

export interface CourseDetail {
  courseId: string;
  seriesId: string;
  seriesTitle: string;
  subjectCode: string;
  editionLabel: string;
  editionYear: number;
  isCurrent: boolean;
  status: "draft" | "published" | "archived";
  lessons: Array<{
    lessonId: string;
    lessonNo: number;
    title: string;
    sortOrder: number;
    isPreview: boolean;
    isPublished: boolean;
    staffMemo: string | null;
    activeVideo: {
      videoId: string;
      drmProvider: string;
      drmVideoId: string;
      durationSeconds: number;
    } | null;
    replacedCount: number;
    materials: Array<{ materialId: string; title: string; isPublished: boolean }>;
    nodeIds: string[];
  }>;
}

export async function getCourseDetail(
  client: Client,
  courseId: string,
): Promise<CourseDetail | null> {
  const { data: course, error } = await client
    .from("courses")
    .select(
      "course_id, series_id, edition_label, edition_year, is_current, status, series:course_series!courses_series_id_fkey(title, subject_code)",
    )
    .eq("course_id", courseId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!course) return null;
  const { data: lessons, error: lErr } = await client
    .from("course_lessons")
    .select("lesson_id, lesson_no, title, sort_order, is_preview, is_published")
    .eq("course_id", courseId)
    .is("deleted_at", null)
    .order("sort_order")
    .order("lesson_no");
  if (lErr) throw lErr;
  const lessonIds = (lessons ?? []).map((l) => l.lesson_id);
  const [videosRes, materialsRes, memosRes, linksRes] = await Promise.all([
    lessonIds.length
      ? client.from("lesson_videos").select("video_id, lesson_id, drm_provider, drm_video_id, duration_seconds, is_active").in("lesson_id", lessonIds)
      : Promise.resolve({ data: [], error: null }),
    lessonIds.length
      ? client.from("lesson_materials").select("material_id, lesson_id, title, is_published").in("lesson_id", lessonIds).order("sort_order")
      : Promise.resolve({ data: [], error: null }),
    lessonIds.length
      ? client.from("lesson_staff_memos").select("lesson_id, memo").in("lesson_id", lessonIds)
      : Promise.resolve({ data: [], error: null }),
    lessonIds.length
      ? client.from("lesson_node_links").select("lesson_id, node_id").in("lesson_id", lessonIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const memoByLesson = new Map(
    (memosRes.data ?? []).map((m) => [m.lesson_id, m.memo]),
  );
  const series = course.series as { title: string; subject_code: string };
  return {
    courseId: course.course_id,
    seriesId: course.series_id,
    seriesTitle: series.title,
    subjectCode: series.subject_code,
    editionLabel: course.edition_label,
    editionYear: course.edition_year,
    isCurrent: course.is_current,
    status: course.status as CourseDetail["status"],
    lessons: (lessons ?? []).map((l) => {
      const vids = (videosRes.data ?? []).filter((v) => v.lesson_id === l.lesson_id);
      const active = vids.find((v) => v.is_active) ?? null;
      return {
        lessonId: l.lesson_id,
        lessonNo: l.lesson_no,
        title: l.title,
        sortOrder: l.sort_order,
        isPreview: l.is_preview,
        isPublished: l.is_published,
        staffMemo: memoByLesson.get(l.lesson_id) ?? null,
        activeVideo: active
          ? {
              videoId: active.video_id,
              drmProvider: active.drm_provider,
              drmVideoId: active.drm_video_id,
              durationSeconds: active.duration_seconds,
            }
          : null,
        replacedCount: vids.filter((v) => !v.is_active).length,
        materials: (materialsRes.data ?? [])
          .filter((m) => m.lesson_id === l.lesson_id)
          .map((m) => ({ materialId: m.material_id, title: m.title, isPublished: m.is_published })),
        nodeIds: (linksRes.data ?? [])
          .filter((x) => x.lesson_id === l.lesson_id)
          .map((x) => x.node_id),
      };
    }),
  };
}

/** course 의 active 영상 총 재생시간 — 지급 시 배수 모수 스냅샷. */
export async function getCourseTotalDuration(courseId: string): Promise<number> {
  const { data: lessons } = await adminClient
    .from("course_lessons")
    .select("lesson_id")
    .eq("course_id", courseId)
    .is("deleted_at", null);
  const ids = (lessons ?? []).map((l) => l.lesson_id);
  if (ids.length === 0) return 0;
  let total = 0;
  for (let i = 0; i < ids.length; i += 150) {
    const { data: vids } = await adminClient
      .from("lesson_videos")
      .select("duration_seconds")
      .in("lesson_id", ids.slice(i, i + 150))
      .eq("is_active", true);
    for (const v of vids ?? []) total += v.duration_seconds;
  }
  return total;
}

// ── T-PASS 연결 제안 (★M1 승인 단서 3 — 에디션 발행 시) ────────────────────

export interface TpassSuggestion {
  planId: string;
  name: string;
  saleStatus: string;
  alreadyLinked: boolean;
}

/** 발행 시점에 판매중(scheduled/on_sale/paused) T-PASS 상품 목록 + 이 에디션 연결 여부. */
export async function listTpassLinkSuggestions(
  courseId: string,
): Promise<TpassSuggestion[]> {
  const { data: plans } = await adminClient
    .from("subscription_plans")
    .select("plan_id, name, sale_status")
    .eq("product_kind", "tpass")
    .in("sale_status", ["scheduled", "on_sale", "paused"]);
  if (!plans || plans.length === 0) return [];
  const { data: links } = await adminClient
    .from("plan_courses")
    .select("plan_id")
    .eq("course_id", courseId)
    .in("plan_id", plans.map((p) => p.plan_id));
  const linked = new Set((links ?? []).map((l) => l.plan_id));
  return plans.map((p) => ({
    planId: p.plan_id,
    name: p.name,
    saleStatus: p.sale_status,
    alreadyLinked: linked.has(p.plan_id),
  }));
}

// ── 수강권 (adminClient 전용 쓰기) ──────────────────────────────────────────

export interface EnrollmentRow {
  enrollmentId: string;
  userId: string;
  userName: string | null;
  memberNo: number | null;
  courseId: string;
  courseLabel: string;
  planName: string | null;
  source: string;
  startsAt: string;
  expiresAt: string;
  status: string;
  multiplierSnapshot: number | null;
  baseDurationSnapshotSeconds: number;
  adminNote: string | null;
}

export async function listEnrollments(options: {
  query?: string;
  courseId?: string;
  limit?: number;
}): Promise<EnrollmentRow[]> {
  let q = adminClient
    .from("enrollments")
    .select(
      "enrollment_id, user_id, course_id, plan_id, source, starts_at, expires_at, status, multiplier_snapshot, base_duration_snapshot_seconds, admin_note, user:profiles!enrollments_user_id_fkey(name, member_no), course:courses!enrollments_course_id_fkey(edition_label, series:course_series!courses_series_id_fkey(title)), plan:subscription_plans!enrollments_plan_id_fkey(name)",
    )
    .order("created_at", { ascending: false })
    .limit(Math.min(options.limit ?? 100, 300));
  if (options.courseId) q = q.eq("course_id", options.courseId);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []).map((r) => {
    const user = r.user as { name: string | null; member_no: number | null } | null;
    const course = r.course as {
      edition_label: string;
      series: { title: string } | null;
    } | null;
    return {
      enrollmentId: r.enrollment_id,
      userId: r.user_id,
      userName: user?.name ?? null,
      memberNo: user?.member_no ?? null,
      courseId: r.course_id,
      courseLabel: course
        ? `${course.series?.title ?? ""} ${course.edition_label}`.trim()
        : r.course_id,
      planName: (r.plan as { name: string } | null)?.name ?? null,
      source: r.source,
      startsAt: r.starts_at,
      expiresAt: r.expires_at,
      status: r.status,
      multiplierSnapshot: r.multiplier_snapshot,
      baseDurationSnapshotSeconds: r.base_duration_snapshot_seconds,
      adminNote: r.admin_note,
    };
  });
  const query = options.query?.trim();
  if (!query) return rows;
  return rows.filter(
    (r) =>
      (r.userName ?? "").includes(query) ||
      String(r.memberNo ?? "").includes(query) ||
      r.courseLabel.includes(query),
  );
}

export interface WatchBalance {
  allowedSeconds: number | null; // null=배수 미적용
  usedSeconds: number;
  remainingSeconds: number | null;
}

/** 수강권별 배수 사용/잔여 — v_enrollment_watch_balance 일괄 조회. */
export async function getWatchBalances(
  enrollmentIds: string[],
): Promise<Map<string, WatchBalance>> {
  const out = new Map<string, WatchBalance>();
  for (let i = 0; i < enrollmentIds.length; i += 150) {
    const { data } = await adminClient
      .from("v_enrollment_watch_balance")
      .select("enrollment_id, allowed_seconds, used_seconds, remaining_seconds")
      .in("enrollment_id", enrollmentIds.slice(i, i + 150));
    for (const r of data ?? []) {
      if (!r.enrollment_id) continue;
      out.set(r.enrollment_id, {
        allowedSeconds: r.allowed_seconds,
        usedSeconds: r.used_seconds ?? 0,
        remainingSeconds: r.remaining_seconds,
      });
    }
  }
  return out;
}

// enrollment 조치 → cs_actions 공통 원장 매핑 (4d — CS 처리 이력 한 화면 조회)
const CS_KIND_BY_ACTION: Record<string, string> = {
  grant: "enrollment_grant",
  extend: "period_extend",
  revoke: "enrollment_revoke",
  block: "enrollment_block",
  watch_credit: "multiplier_credit",
  watch_reset: "multiplier_reset",
  pause: "pause_admin",
  resume: "pause_admin",
  adjust_snapshot: "memo",
};

export async function logEnrollmentAdminAction(input: {
  enrollmentId: string;
  actorId: string;
  action: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  reason: string;
}): Promise<void> {
  const { error } = await adminClient.from("enrollment_admin_logs").insert({
    enrollment_id: input.enrollmentId,
    actor_id: input.actorId,
    action: input.action,
    before: (input.before ?? null) as never,
    after: (input.after ?? null) as never,
    reason: input.reason,
  });
  if (error) console.error("[lms] admin log failed:", error.message);
  // cs_actions 미러 — 대상 회원 기준 CS 이력 통합 조회용.
  try {
    const { data: enr } = await adminClient
      .from("enrollments")
      .select("user_id")
      .eq("enrollment_id", input.enrollmentId)
      .maybeSingle();
    if (enr) {
      await adminClient.from("cs_actions").insert({
        user_id: enr.user_id,
        actor_id: input.actorId,
        kind: CS_KIND_BY_ACTION[input.action] ?? "memo",
        ref_table: "enrollment_admin_logs",
        ref_id: input.enrollmentId,
        note: input.reason,
      });
    }
  } catch (e) {
    console.error("[lms] cs mirror failed:", e);
  }
}
