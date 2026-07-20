// feat-11-002 — 에디션 상세: 회차 등록·순서·미리보기·공개, 영상 등록/교체(이력), 운영 메모.
// 영상 교체 시 duration 이 달라지면 배수 모수 조정은 M3(adjust 이벤트)에서 — 여기선 경고만.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  DownloadIcon,
  FileTextIcon,
  NetworkIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { Link, data, useFetcher } from "react-router";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";
import adminClient from "~/core/lib/supa-admin-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip, IndexTable, TD, TR } from "~/features/admin/components/admin-ui";
import { hasDutyAccess } from "~/features/admin/lib/duties.server";
import {
  getStaffRole,
  getSystematicSkeleton,
  type SystematicNode,
} from "~/features/laws/queries.server";
import {
  getCourseDetail,
  listCourseAuditLogs,
  listCourseCategories,
  listPickableContents,
  logCourseAudit,
  logEnrollmentAdminAction,
  type CourseAuditRow,
  type CourseCategoryRow,
  type CourseDetail,
  type PickableContent,
} from "~/features/lms/queries.server";
import {
  LECTURE_TYPE_LABEL,
  LECTURE_TYPES,
} from "~/features/lms/lib/lecture-type";
import {
  LAW_SUBJECT_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-lms-course-detail";

export const meta: Route.MetaFunction = () => [
  { title: "에디션 상세 | 리담변리사학원" },
];

const MATERIAL_BUCKET = "lesson-materials";
const MATERIAL_MAX_SIZE = 50 * 1024 * 1024;
// 강의 자료 허용 확장자 — 배포 자료(교재·판서·오피스·압축). 실행파일 등 차단.
const MATERIAL_EXTS = new Set([
  "pdf", "png", "jpg", "jpeg", "webp", "gif",
  "hwp", "hwpx", "ppt", "pptx", "doc", "docx", "xls", "xlsx", "zip",
]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface NodeOption {
  nodeId: string;
  label: string;
}

// 체계도 노드 → 선택지(조상 크럼 라벨, caseOnly 제외). 문제편집기 picker 와 동일 규칙.
function buildNodeOptions(skeleton: SystematicNode[]): NodeOption[] {
  const labelById = new Map(skeleton.map((n) => [n.nodeId, n.displayLabel]));
  const parentById = new Map(skeleton.map((n) => [n.nodeId, n.parentId]));
  const crumb = (id: string): string => {
    const parts: string[] = [];
    let cur: string | null = id;
    for (let guard = 0; cur && guard < 12; guard++) {
      parts.unshift(labelById.get(cur) ?? "");
      cur = parentById.get(cur) ?? null;
    }
    return parts.filter(Boolean).join(" › ");
  };
  // skeleton 은 트리 순서(path DFS) — 그대로 선택지 순서로 사용.
  return skeleton
    .filter((n) => !n.caseOnly)
    .map((n) => ({ nodeId: n.nodeId, label: crumb(n.nodeId) }));
}

async function requireStaff(request: Request) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });
  if (!(await hasDutyAccess("lms_video_admin", user.id, role))) {
    throw data("Forbidden — 관리자 관리에서 접근 권한을 배정받아야 합니다.", { status: 403 });
  }
  return { client, user, role };
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { client, role } = await requireStaff(request);
  const course = await getCourseDetail(client, params.courseId!);
  if (!course) throw data("Course not found", { status: 404 });
  // 회차↔노드 매핑 선택지 — 이 에디션 과목(subjectCode)의 체계도 노드.
  //   법률 과목이 아니면(번들·자연과학 등) 노드 없음 → 빈 목록.
  const nodeOptions = LAW_SUBJECT_SLUGS.includes(
    course.subjectCode as LawSubjectSlug,
  )
    ? buildNodeOptions(
        await getSystematicSkeleton(
          client,
          course.subjectCode as LawSubjectSlug,
        ),
      )
    : [];
  const [contents, categories, auditLogs, instructorsRes] = await Promise.all([
    listPickableContents(client),
    listCourseCategories(client),
    listCourseAuditLogs(client, params.courseId!),
    adminClient
      .from("profiles")
      .select("profile_id, name")
      .in("role", ["instructor", "admin"])
      .order("name"),
  ]);
  const allInstructors = (instructorsRes.data ?? []).map((i) => ({
    profileId: i.profile_id,
    name: i.name ?? "(이름 없음)",
  }));
  return { course, role, nodeOptions, contents, categories, auditLogs, allInstructors };
}

const addLessonSchema = z.object({
  lessonNo: z.coerce.number().int().min(1).max(999),
  title: z.string().trim().min(1).max(200),
});
const setVideoSchema = z.object({
  lessonId: z.string().uuid(),
  contentId: z.string().uuid(), // 콘텐츠 라이브러리에서 선택 — 키·재생시간은 콘텐츠에서 파생
  replacedReason: z.string().trim().max(300).optional(),
});
const saveBasicSchema = z.object({
  courseType: z.string().trim().nullable(),
  categoryId: z.string().uuid().nullable(),
  adminMemo: z.string().trim().max(2000).nullable(),
  isVisible: z.boolean(),
});

export async function action({ request, params }: Route.ActionArgs) {
  const { client, user } = await requireStaff(request);
  const courseId = params.courseId!;
  const fd = await request.formData();
  const intent = fd.get("intent");

  if (intent === "add_lesson") {
    const parsed = addLessonSchema.safeParse({
      lessonNo: fd.get("lessonNo"),
      title: fd.get("title"),
    });
    if (!parsed.success) return data({ error: "회차 번호·제목을 확인해 주세요." }, { status: 400 });
    const { error } = await client.from("course_lessons").insert({
      course_id: courseId,
      lesson_no: parsed.data.lessonNo,
      title: parsed.data.title,
      sort_order: parsed.data.lessonNo,
    });
    if (error) {
      return data(
        { error: error.code === "23505" ? "이미 있는 회차 번호입니다." : error.message },
        { status: 400 },
      );
    }
    return data({ ok: true as const });
  }

  if (intent === "toggle_lesson") {
    const lessonId = String(fd.get("lessonId") ?? "");
    const field = String(fd.get("field") ?? "");
    const value = fd.get("value") === "1";
    if (!lessonId || !["is_preview", "is_published"].includes(field)) {
      return data({ error: "잘못된 요청" }, { status: 400 });
    }
    const { error } = await client
      .from("course_lessons")
      .update({ [field]: value })
      .eq("lesson_id", lessonId);
    if (error) return data({ error: error.message }, { status: 400 });
    return data({ ok: true as const });
  }

  if (intent === "move_lesson") {
    // 노출 순서 교환 — 인접 회차와 sort_order swap
    const lessonId = String(fd.get("lessonId") ?? "");
    const dir = String(fd.get("dir") ?? "");
    const { data: lessons } = await client
      .from("course_lessons")
      .select("lesson_id, sort_order")
      .eq("course_id", courseId)
      .is("deleted_at", null)
      .order("sort_order")
      .order("lesson_no");
    const list = lessons ?? [];
    const idx = list.findIndex((l) => l.lesson_id === lessonId);
    const swapIdx = dir === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || swapIdx < 0 || swapIdx >= list.length) {
      return data({ ok: true as const }); // 경계 — 무시
    }
    const a = list[idx];
    const b = list[swapIdx];
    // sort_order 동률(초기값) 대비: 전체를 인덱스 순으로 재부여 후 교환
    const reordered = list.map((l, i) => ({ ...l, sort_order: i + 1 }));
    const tmp = reordered[idx].sort_order;
    reordered[idx].sort_order = reordered[swapIdx].sort_order;
    reordered[swapIdx].sort_order = tmp;
    for (const l of reordered) {
      const { error } = await client
        .from("course_lessons")
        .update({ sort_order: l.sort_order })
        .eq("lesson_id", l.lesson_id);
      if (error) return data({ error: error.message }, { status: 400 });
    }
    void a;
    void b;
    return data({ ok: true as const });
  }

  if (intent === "set_video") {
    const parsed = setVideoSchema.safeParse({
      lessonId: fd.get("lessonId"),
      contentId: fd.get("contentId"),
      replacedReason: fd.get("replacedReason") || undefined,
    });
    if (!parsed.success) return data({ error: "연결할 콘텐츠를 선택해 주세요." }, { status: 400 });
    // 콘텐츠 라이브러리에서 키·재생시간·공급자를 가져온다(수동 입력 폐지 — 단일 소스).
    const { data: content } = await client
      .from("video_contents")
      .select("content_key, drm_provider, duration_seconds")
      .eq("content_id", parsed.data.contentId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!content) return data({ error: "콘텐츠를 찾을 수 없습니다." }, { status: 404 });
    if (!content.duration_seconds || content.duration_seconds < 1)
      return data(
        { error: "이 콘텐츠는 재생시간이 확정되지 않았습니다. 콘텐츠 라이브러리에서 콜러스 동기화 후 다시 시도하세요." },
        { status: 400 },
      );
    // 교체 = 기존 active false + 새 행 (원자화)
    const { data: prev } = await client
      .from("lesson_videos")
      .select("video_id, duration_seconds")
      .eq("lesson_id", parsed.data.lessonId)
      .eq("is_active", true)
      .maybeSingle();
    if (prev) {
      const { error } = await client
        .from("lesson_videos")
        .update({ is_active: false, replaced_reason: parsed.data.replacedReason ?? null })
        .eq("video_id", prev.video_id);
      if (error) return data({ error: error.message }, { status: 400 });
    }
    // content_id 로 라이브러리를 참조하고, 재생 경로 호환을 위해 키·재생시간을 denormalize.
    const { error } = await client.from("lesson_videos").insert({
      lesson_id: parsed.data.lessonId,
      content_id: parsed.data.contentId,
      drm_provider: content.drm_provider,
      drm_video_id: content.content_key,
      duration_seconds: content.duration_seconds,
      created_by: user.id,
    });
    if (error) return data({ error: error.message }, { status: 400 });
    await logCourseAudit(client, {
      courseId,
      actorId: user.id,
      action: prev ? "video_replace" : "video_set",
      summary: prev ? "영상 교체" : "영상 연결",
    });
    // ★설계 §4.5 — duration 변경 시 배수 모수(스냅샷)는 자동 재계산하지 않고,
    //   영향 수강권 수·diff 를 응답해 관리자에게 조정 적용을 제안한다.
    const diffSeconds = prev
      ? content.duration_seconds - prev.duration_seconds
      : 0;
    let affectedCount = 0;
    if (diffSeconds !== 0) {
      const { count } = await adminClient
        .from("enrollments")
        .select("enrollment_id", { count: "exact", head: true })
        .eq("course_id", courseId)
        .in("status", ["active", "paused"])
        .not("multiplier_snapshot", "is", null);
      affectedCount = count ?? 0;
    }
    return data({
      ok: true as const,
      durationChanged: diffSeconds !== 0,
      diffSeconds,
      affectedCount,
    });
  }

  if (intent === "apply_duration_adjust") {
    // 교체로 변한 diff 초를 이 course 의 active/paused 수강권 모수 스냅샷에 반영 + 감사 로그.
    const diffSeconds = Math.trunc(Number(fd.get("diffSeconds") ?? 0));
    const reason = String(fd.get("reason") ?? "").trim() || "영상 교체에 따른 모수 조정";
    if (!diffSeconds) return data({ error: "조정할 차이가 없습니다." }, { status: 400 });
    const { data: enrollments, error: eErr } = await adminClient
      .from("enrollments")
      .select("enrollment_id, base_duration_snapshot_seconds")
      .eq("course_id", courseId)
      .in("status", ["active", "paused"])
      .not("multiplier_snapshot", "is", null);
    if (eErr) return data({ error: eErr.message }, { status: 400 });
    let adjusted = 0;
    for (const e of enrollments ?? []) {
      const next = Math.max(0, e.base_duration_snapshot_seconds + diffSeconds);
      const { error } = await adminClient
        .from("enrollments")
        .update({ base_duration_snapshot_seconds: next })
        .eq("enrollment_id", e.enrollment_id);
      if (error) return data({ error: error.message }, { status: 400 });
      await logEnrollmentAdminAction({
        enrollmentId: e.enrollment_id,
        actorId: user.id,
        action: "adjust_snapshot",
        before: { base_duration_snapshot_seconds: e.base_duration_snapshot_seconds },
        after: { base_duration_snapshot_seconds: next },
        reason,
      });
      adjusted++;
    }
    return data({ ok: true as const, adjusted });
  }

  if (intent === "add_material") {
    const lessonId = String(fd.get("lessonId") ?? "");
    const title = String(fd.get("title") ?? "").trim();
    const file = fd.get("file");
    if (!lessonId || !title) return data({ error: "회차·제목을 확인해 주세요." }, { status: 400 });
    if (title.length > 200) return data({ error: "제목은 200자 이하로 입력해 주세요." }, { status: 400 });
    if (!(file instanceof File) || file.size === 0) return data({ error: "파일을 선택해 주세요." }, { status: 400 });
    if (file.size > MATERIAL_MAX_SIZE) return data({ error: "파일은 50MB 이하만 올릴 수 있습니다." }, { status: 400 });
    const ext = (file.name.includes(".") ? file.name.split(".").pop()! : "").toLowerCase();
    if (!MATERIAL_EXTS.has(ext)) {
      return data(
        { error: "허용되지 않는 형식입니다 (PDF·이미지·한글·오피스·zip 만 가능)." },
        { status: 400 },
      );
    }
    // 정렬 순서 — 현재 자료 max + 1
    const { data: maxRow } = await client
      .from("lesson_materials")
      .select("sort_order")
      .eq("lesson_id", lessonId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextOrder = (maxRow?.sort_order ?? -1) + 1;
    const path = `${lessonId}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await adminClient.storage
      .from(MATERIAL_BUCKET)
      .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
    if (upErr) return data({ error: upErr.message }, { status: 400 });
    // DB insert 는 RLS client — lesson_materials_write_staff 가 최종 차단(실패 시 블롭 롤백).
    const { error: insErr } = await client.from("lesson_materials").insert({
      lesson_id: lessonId,
      title,
      storage_path: path,
      sort_order: nextOrder,
      is_published: false,
    });
    if (insErr) {
      void adminClient.storage.from(MATERIAL_BUCKET).remove([path]);
      return data({ error: insErr.message }, { status: 400 });
    }
    return data({ ok: true as const });
  }

  if (intent === "toggle_material") {
    const materialId = String(fd.get("materialId") ?? "");
    const value = fd.get("value") === "1";
    if (!materialId) return data({ error: "잘못된 요청" }, { status: 400 });
    const { error } = await client
      .from("lesson_materials")
      .update({ is_published: value })
      .eq("material_id", materialId);
    if (error) return data({ error: error.message }, { status: 400 });
    return data({ ok: true as const });
  }

  if (intent === "delete_material") {
    const materialId = String(fd.get("materialId") ?? "");
    if (!materialId) return data({ error: "잘못된 요청" }, { status: 400 });
    // RLS delete — 권한 0행이면 차단. 반환된 storage_path 블롭 제거.
    const { data: deleted, error } = await client
      .from("lesson_materials")
      .delete()
      .eq("material_id", materialId)
      .select("storage_path")
      .maybeSingle();
    if (error) return data({ error: error.message }, { status: 400 });
    if (deleted?.storage_path) void adminClient.storage.from(MATERIAL_BUCKET).remove([deleted.storage_path]);
    return data({ ok: true as const });
  }

  if (intent === "save_memo") {
    const lessonId = String(fd.get("lessonId") ?? "");
    const memo = String(fd.get("memo") ?? "").trim();
    if (!lessonId) return data({ error: "잘못된 요청" }, { status: 400 });
    if (memo.length === 0) {
      const { error } = await client.from("lesson_staff_memos").delete().eq("lesson_id", lessonId);
      if (error) return data({ error: error.message }, { status: 400 });
    } else {
      const { error } = await client.from("lesson_staff_memos").upsert(
        { lesson_id: lessonId, memo, updated_by: user.id, updated_at: new Date().toISOString() },
        { onConflict: "lesson_id" },
      );
      if (error) return data({ error: error.message }, { status: 400 });
    }
    return data({ ok: true as const });
  }

  if (intent === "set_lesson_nodes") {
    const lessonId = String(fd.get("lessonId") ?? "");
    if (!UUID_RE.test(lessonId)) return data({ error: "잘못된 요청" }, { status: 400 });
    // 회차가 이 에디션 소속인지 확인(교차 코스 쓰기 차단).
    const { data: lessonRow } = await client
      .from("course_lessons")
      .select("lesson_id")
      .eq("lesson_id", lessonId)
      .eq("course_id", courseId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!lessonRow) return data({ error: "회차를 찾을 수 없습니다." }, { status: 404 });
    // 제출된 노드 중 이 에디션 과목의 노드만 채택(교차 과목 오염 방지).
    const rawIds = [
      ...new Set(fd.getAll("nodeId").map(String).filter((v) => UUID_RE.test(v))),
    ];
    let validIds: string[] = [];
    if (rawIds.length > 0) {
      const { data: crow } = await client
        .from("courses")
        .select("series:course_series!courses_series_id_fkey(subject_code)")
        .eq("course_id", courseId)
        .maybeSingle();
      const subject =
        (crow?.series as { subject_code: string } | null)?.subject_code ?? "";
      const { data: nrows } = await client
        .from("systematic_nodes")
        .select("node_id")
        .in("node_id", rawIds)
        .eq("law_code", subject);
      validIds = (nrows ?? []).map((n) => n.node_id);
    }
    // 회차 기준 재설정: 기존 링크 삭제 → 선택 노드 삽입(다대다).
    const { error: delErr } = await client
      .from("lesson_node_links")
      .delete()
      .eq("lesson_id", lessonId);
    if (delErr) return data({ error: delErr.message }, { status: 400 });
    if (validIds.length > 0) {
      const { error: insErr } = await client.from("lesson_node_links").insert(
        validIds.map((nid) => ({
          lesson_id: lessonId,
          node_id: nid,
          created_by: user.id,
        })),
      );
      if (insErr) return data({ error: insErr.message }, { status: 400 });
    }
    return data({ ok: true as const, savedCount: validIds.length });
  }

  if (intent === "save_basic") {
    const emptyNull = (v: FormDataEntryValue | null) => {
      const s = typeof v === "string" ? v.trim() : "";
      return s === "" ? null : s;
    };
    const parsed = saveBasicSchema.safeParse({
      courseType: emptyNull(fd.get("courseType")),
      categoryId: emptyNull(fd.get("categoryId")),
      adminMemo: emptyNull(fd.get("adminMemo")),
      isVisible: fd.get("isVisible") === "on",
    });
    if (!parsed.success)
      return data({ error: "입력을 확인해 주세요." }, { status: 400 });
    const p = parsed.data;
    const { error } = await client
      .from("courses")
      .update({
        course_type: p.courseType,
        category_id: p.categoryId,
        admin_memo: p.adminMemo,
        is_visible: p.isVisible,
      })
      .eq("course_id", courseId);
    if (error) return data({ error: error.message }, { status: 400 });
    await logCourseAudit(client, {
      courseId,
      actorId: user.id,
      action: "update_basic",
      summary: `기본정보 수정 · 노출 ${p.isVisible ? "ON" : "OFF"}`,
    });
    return data({ ok: true as const });
  }

  if (intent === "add_instructor") {
    const instructorId = z.string().uuid().safeParse(fd.get("instructorId"));
    if (!instructorId.success)
      return data({ error: "강사를 선택해 주세요." }, { status: 400 });
    const role = String(fd.get("role") ?? "").trim() || null;
    // 정렬 순서 = 현재 max + 1
    const { data: rows } = await client
      .from("course_instructors")
      .select("sort_order")
      .eq("course_id", courseId)
      .order("sort_order", { ascending: false })
      .limit(1);
    const nextOrder = (rows?.[0]?.sort_order ?? -1) + 1;
    const { error } = await client.from("course_instructors").insert({
      course_id: courseId,
      instructor_id: instructorId.data,
      role,
      sort_order: nextOrder,
    });
    if (error)
      return data(
        {
          error: error.code === "23505" ? "이미 담당 강사입니다." : error.message,
        },
        { status: 400 },
      );
    await logCourseAudit(client, {
      courseId,
      actorId: user.id,
      action: "add_instructor",
      summary: "담당 강사 추가",
    });
    return data({ ok: true as const });
  }

  if (intent === "remove_instructor") {
    const instructorId = z.string().uuid().safeParse(fd.get("instructorId"));
    if (!instructorId.success)
      return data({ error: "잘못된 요청" }, { status: 400 });
    const { error } = await client
      .from("course_instructors")
      .delete()
      .eq("course_id", courseId)
      .eq("instructor_id", instructorId.data);
    if (error) return data({ error: error.message }, { status: 400 });
    await logCourseAudit(client, {
      courseId,
      actorId: user.id,
      action: "remove_instructor",
      summary: "담당 강사 제거",
    });
    return data({ ok: true as const });
  }

  return data({ error: "Unknown intent" }, { status: 400 });
}

function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

const TABS = [
  { key: "basic", label: "기본정보" },
  { key: "lessons", label: "강의목차" },
  { key: "audit", label: "변경이력" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default function AdminLmsCourseDetail({ loaderData }: Route.ComponentProps) {
  const { course, role, nodeOptions, contents, categories, auditLogs, allInstructors } =
    loaderData;
  const [tab, setTab] = useState<TabKey>("basic");
  return (
    <AdminShell
      cluster="lms"
      role={role}
      title={`${course.seriesTitle} — ${course.editionLabel}`}
      desc="회차와 영상을 관리합니다. 영상 교체는 회차를 유지한 채 수정본으로 바꾸는 것이고, 강 구성이 바뀌는 전면 개편은 시리즈에서 새 에디션을 발행하세요."
      headerRight={
        <div className="flex items-center gap-2">
          {course.publicNo != null ? (
            <Chip tone="neutral">강의 C-{course.publicNo}</Chip>
          ) : null}
          <Link to="/admin/lms/courses" className="text-link text-[12px] font-semibold hover:underline">
            ← 시리즈 목록
          </Link>
        </div>
      }
    >
      {/* 탭 */}
      <div className="border-border mb-4 flex gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={
              "-mb-px border-b-2 px-3.5 py-2 text-sm font-semibold transition-colors " +
              (tab === t.key
                ? "border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground border-transparent")
            }
          >
            {t.label}
            {t.key === "audit" && auditLogs.length > 0 ? (
              <span className="text-muted-foreground ml-1 text-xs">
                {auditLogs.length}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === "basic" ? (
        <BasicInfoTab
          course={course}
          categories={categories}
          allInstructors={allInstructors}
        />
      ) : null}

      {tab === "lessons" ? (
        <>
          <AddLessonForm />
          <div className="mt-4 space-y-3">
            {course.lessons.map((lesson, i) => (
              <LessonCard
                key={lesson.lessonId}
                lesson={lesson}
                nodeOptions={nodeOptions}
                contents={contents}
                isFirst={i === 0}
                isLast={i === course.lessons.length - 1}
              />
            ))}
            {course.lessons.length === 0 ? (
              <p className="text-muted-foreground rounded-xl border border-dashed px-4 py-10 text-center text-sm">
                회차가 없습니다. 위에서 1강부터 추가하세요.
              </p>
            ) : null}
          </div>
        </>
      ) : null}

      {tab === "audit" ? <AuditTab logs={auditLogs} /> : null}
    </AdminShell>
  );
}

const AUDIT_ACTION_LABEL: Record<string, string> = {
  update_basic: "기본정보 수정",
  add_instructor: "강사 추가",
  remove_instructor: "강사 제거",
  video_replace: "영상 교체",
  video_set: "영상 연결",
  clone: "강의 복사 생성",
};

function BasicInfoTab({
  course,
  categories,
  allInstructors,
}: {
  course: CourseDetail;
  categories: CourseCategoryRow[];
  allInstructors: Array<{ profileId: string; name: string }>;
}) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.error) toast.error(fetcher.data.error);
    else if (fetcher.data.ok) toast.success("기본정보를 저장했습니다.");
  }, [fetcher.state, fetcher.data]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <fetcher.Form
        method="post"
        className="border-border bg-card space-y-3 rounded-xl border p-4 shadow-sm"
      >
        <input type="hidden" name="intent" value="save_basic" />
        <h3 className="text-sm font-bold">강의 기본정보</h3>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-[11px] font-semibold">강의 유형</span>
            <select
              name="courseType"
              defaultValue={course.courseType ?? ""}
              className="border-input bg-background h-9 rounded-lg border px-2 text-sm"
            >
              <option value="">(미지정)</option>
              {LECTURE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {LECTURE_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-[11px] font-semibold">카테고리</span>
            <select
              name="categoryId"
              defaultValue={course.categoryId ?? ""}
              className="border-input bg-background h-9 rounded-lg border px-2 text-sm"
            >
              <option value="">(미분류)</option>
              {categories
                .filter((c) => c.isActive || c.categoryId === course.categoryId)
                .map((c) => (
                  <option key={c.categoryId} value={c.categoryId}>
                    {c.path}
                    {!c.isActive ? " (비활성)" : ""}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-muted-foreground text-[11px] font-semibold">관리자 메모</span>
          <textarea
            name="adminMemo"
            defaultValue={course.adminMemo ?? ""}
            rows={3}
            maxLength={2000}
            className="border-input bg-background rounded-lg border px-3 py-2 text-sm"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="isVisible"
            defaultChecked={course.isVisible}
            className="size-4"
          />
          목록·카탈로그 노출 (끄면 운영자에게만 보임 — 발행 상태와 별개)
        </label>
        <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 border-t pt-2 text-xs">
          <span>시리즈 · {course.seriesTitle}</span>
          <span>에디션 · {course.editionLabel} ({course.editionYear})</span>
          <span>고유번호 · {course.publicNo != null ? `C-${course.publicNo}` : "—"}</span>
          <Link
            to="/admin/plans"
            className="text-link font-semibold hover:underline"
          >
            판매정보·수강정책 관리 →
          </Link>
        </div>
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={fetcher.state !== "idle"}>
            저장
          </Button>
        </div>
      </fetcher.Form>

      <InstructorsManager
        instructors={course.instructors}
        allInstructors={allInstructors}
      />
    </div>
  );
}

function InstructorsManager({
  instructors,
  allInstructors,
}: {
  instructors: CourseDetail["instructors"];
  allInstructors: Array<{ profileId: string; name: string }>;
}) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.error) toast.error(fetcher.data.error);
    else if (fetcher.data.ok) formRef.current?.reset();
  }, [fetcher.state, fetcher.data]);

  const assigned = new Set(instructors.map((i) => i.instructorId));
  const available = allInstructors.filter((i) => !assigned.has(i.profileId));
  const busy = fetcher.state !== "idle";
  const remove = (instructorId: string, name: string) => {
    if (!window.confirm(`담당 강사 "${name}"을(를) 제거할까요?`)) return;
    const fd = new FormData();
    fd.set("intent", "remove_instructor");
    fd.set("instructorId", instructorId);
    fetcher.submit(fd, { method: "post" });
  };

  return (
    <div className="border-border bg-card space-y-3 rounded-xl border p-4 shadow-sm">
      <h3 className="text-sm font-bold">담당 강사 (복수 지정)</h3>
      {instructors.length === 0 ? (
        <p className="text-muted-foreground text-[12px]">
          지정된 담당 강사가 없습니다. 아래에서 추가하세요.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {instructors.map((i) => (
            <li
              key={i.instructorId}
              className="border-border/60 bg-background flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
            >
              <span className="font-medium">{i.name}</span>
              {i.role ? <Chip tone="outline">{i.role}</Chip> : null}
              <button
                type="button"
                onClick={() => remove(i.instructorId, i.name)}
                disabled={busy}
                className="text-muted-foreground hover:text-rose-600 ml-auto p-1 disabled:opacity-40"
                title="제거"
              >
                <Trash2Icon className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {available.length > 0 ? (
        <fetcher.Form
          ref={formRef}
          method="post"
          className="flex flex-wrap items-end gap-2 border-t pt-3"
        >
          <input type="hidden" name="intent" value="add_instructor" />
          <label className="flex min-w-[140px] flex-1 flex-col gap-1">
            <span className="text-muted-foreground text-[10px] font-semibold">강사</span>
            <select
              name="instructorId"
              required
              className="border-input bg-background h-8 rounded-md border px-2 text-[12px]"
            >
              {available.map((i) => (
                <option key={i.profileId} value={i.profileId}>
                  {i.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground text-[10px] font-semibold">역할(선택)</span>
            <input
              name="role"
              maxLength={30}
              placeholder="대표/공동 등"
              className="border-input bg-background h-8 w-28 rounded-md border px-2 text-[12px]"
            />
          </label>
          <Button type="submit" size="sm" variant="outline" className="h-8 text-[12px]" disabled={busy}>
            <PlusIcon className="size-3" /> 강사 추가
          </Button>
        </fetcher.Form>
      ) : (
        <p className="text-muted-foreground/70 border-t pt-3 text-[11px]">
          추가할 수 있는 강사가 없습니다(모두 지정됨).
        </p>
      )}
    </div>
  );
}

function AuditTab({ logs }: { logs: CourseAuditRow[] }) {
  if (logs.length === 0) {
    return (
      <p className="text-muted-foreground rounded-xl border border-dashed px-4 py-10 text-center text-sm">
        변경 이력이 없습니다.
      </p>
    );
  }
  return (
    <ul className="border-border bg-card divide-border divide-y rounded-xl border shadow-sm">
      {logs.map((l) => (
        <li key={l.logId} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
          <Chip tone="neutral">{AUDIT_ACTION_LABEL[l.action] ?? l.action}</Chip>
          <span>{l.summary ?? ""}</span>
          <span className="text-muted-foreground ml-auto text-xs">
            {l.actorName ?? "?"} · {fmtDateTime(l.createdAt)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function MaterialsSection({
  lessonId,
  materials,
}: {
  lessonId: string;
  materials: CourseDetail["lessons"][number]["materials"];
}) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.error) toast.error(fetcher.data.error);
    else if (fetcher.data.ok) formRef.current?.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);

  const busy = fetcher.state !== "idle";
  const setPublish = (materialId: string, value: boolean) => {
    const fd = new FormData();
    fd.set("intent", "toggle_material");
    fd.set("materialId", materialId);
    fd.set("value", value ? "1" : "0");
    fetcher.submit(fd, { method: "post" });
  };
  const remove = (materialId: string, title: string) => {
    if (!window.confirm(`"${title}" 자료를 삭제할까요?`)) return;
    const fd = new FormData();
    fd.set("intent", "delete_material");
    fd.set("materialId", materialId);
    fetcher.submit(fd, { method: "post" });
  };

  return (
    <div className="bg-muted/20 border-border/60 mt-2 rounded-lg border p-2.5">
      <p className="text-muted-foreground mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.06em]">
        <FileTextIcon className="size-3" /> 강의 자료
      </p>
      {materials.length > 0 ? (
        <ul className="mb-2 space-y-1">
          {materials.map((m) => (
            <li
              key={m.materialId}
              className="border-border/60 bg-background flex items-center gap-2 rounded-md border px-2 py-1.5"
            >
              <a
                href={`/api/lms/material/${m.materialId}`}
                target="_blank"
                rel="noreferrer"
                className="text-link inline-flex min-w-0 flex-1 items-center gap-1 text-[12px] font-medium hover:underline"
              >
                <DownloadIcon className="size-3 shrink-0" />
                <span className="truncate">{m.title}</span>
              </a>
              <Chip tone={m.isPublished ? "emerald" : "amber"}>
                {m.isPublished ? "공개" : "비공개"}
              </Chip>
              <button
                type="button"
                onClick={() => setPublish(m.materialId, !m.isPublished)}
                disabled={busy}
                className="border-border hover:bg-muted/50 h-6 rounded-md border px-2 text-[11px] font-medium disabled:opacity-40"
              >
                {m.isPublished ? "비공개로" : "공개로"}
              </button>
              <button
                type="button"
                onClick={() => remove(m.materialId, m.title)}
                disabled={busy}
                className="text-muted-foreground hover:text-rose-600 p-1 disabled:opacity-40"
                title="삭제"
              >
                <Trash2Icon className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground/70 mb-2 text-[11px]">
          등록된 자료가 없습니다.
        </p>
      )}
      <fetcher.Form
        ref={formRef}
        method="post"
        encType="multipart/form-data"
        className="flex flex-wrap items-end gap-2"
      >
        <input type="hidden" name="intent" value="add_material" />
        <input type="hidden" name="lessonId" value={lessonId} />
        <label className="flex min-w-[180px] flex-1 flex-col gap-1">
          <span className="text-muted-foreground text-[10px] font-semibold">자료 제목</span>
          <input
            name="title"
            required
            maxLength={200}
            placeholder="예: 1강 판서노트"
            className="border-input bg-background h-8 rounded-md border px-2 text-[12px]"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground text-[10px] font-semibold">
            파일 (PDF·이미지·한글·오피스·zip, 50MB↓)
          </span>
          <input
            name="file"
            type="file"
            required
            accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.hwp,.hwpx,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.zip"
            className="text-[12px] file:mr-2 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-[11px]"
          />
        </label>
        <Button type="submit" size="sm" variant="outline" className="h-8 text-[12px]" disabled={busy}>
          <UploadIcon className="size-3" /> 자료 업로드
        </Button>
      </fetcher.Form>
    </div>
  );
}

function LessonNodesSection({
  lessonId,
  nodeIds,
  nodeOptions,
}: {
  lessonId: string;
  nodeIds: string[];
  nodeOptions: NodeOption[];
}) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string; savedCount?: number }>();
  // 로컬 선택 상태 — 서버 저장 전 편집 소유. 서버 nodeIds 가 바뀌면(저장 반영) 동기화.
  const [selected, setSelected] = useState<Set<string>>(() => new Set(nodeIds));
  const [q, setQ] = useState("");
  const savedKey = nodeIds.join(",");
  useEffect(() => {
    setSelected(new Set(nodeIds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey]);
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.error) toast.error(fetcher.data.error);
    else if (fetcher.data.ok)
      toast.success(`단원 매핑을 저장했습니다 (${fetcher.data.savedCount ?? 0}개).`);
  }, [fetcher.state, fetcher.data]);

  const labelById = useMemo(
    () => new Map(nodeOptions.map((o) => [o.nodeId, o.label])),
    [nodeOptions],
  );
  const filtered = useMemo(() => {
    const query = q.trim();
    return query
      ? nodeOptions.filter((o) => o.label.includes(query))
      : nodeOptions;
  }, [q, nodeOptions]);

  const dirty =
    selected.size !== nodeIds.length ||
    [...selected].some((id) => !nodeIds.includes(id));
  const busy = fetcher.state !== "idle";

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const save = () => {
    const fd = new FormData();
    fd.set("intent", "set_lesson_nodes");
    fd.set("lessonId", lessonId);
    for (const id of selected) fd.append("nodeId", id);
    fetcher.submit(fd, { method: "post" });
  };

  if (nodeOptions.length === 0) {
    return (
      <div className="bg-muted/20 border-border/60 mt-2 rounded-lg border p-2.5">
        <p className="text-muted-foreground flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.06em]">
          <NetworkIcon className="size-3" /> 단원(체계도) 매핑
        </p>
        <p className="text-muted-foreground/70 mt-1 text-[11px]">
          이 과목은 체계도 노드가 없어 매핑할 수 없습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-muted/20 border-border/60 mt-2 rounded-lg border p-2.5">
      <p className="text-muted-foreground mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.06em]">
        <NetworkIcon className="size-3" /> 단원(체계도) 매핑
        <span className="text-muted-foreground/60 normal-case">
          — 이 강을 보면 해당 단원 복습이 채워집니다
        </span>
      </p>

      {/* 현재 선택 칩 */}
      {selected.size > 0 ? (
        <div className="mb-2 flex flex-wrap gap-1">
          {[...selected].map((id) => (
            <span
              key={id}
              className="border-border bg-background inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px]"
            >
              <span className="max-w-[280px] truncate">
                {labelById.get(id) ?? "(다른 과목/삭제된 단원)"}
              </span>
              <button
                type="button"
                onClick={() => toggle(id)}
                className="text-muted-foreground hover:text-rose-600"
                title="제거"
              >
                <XIcon className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground/70 mb-2 text-[11px]">
          매핑된 단원이 없습니다.
        </p>
      )}

      {/* 노드 선택 — 필터 + 체크박스 목록 */}
      <details className="group">
        <summary className="text-link cursor-pointer list-none text-[12px] font-medium hover:underline">
          단원 선택/변경 ▾
        </summary>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="단원명으로 검색…"
          className="border-input bg-background mt-2 h-8 w-full rounded-md border px-2 text-[12px]"
        />
        <div className="border-border/60 mt-1.5 max-h-56 overflow-y-auto rounded-md border">
          {filtered.length === 0 ? (
            <p className="text-muted-foreground/70 px-2 py-3 text-center text-[11px]">
              검색 결과가 없습니다.
            </p>
          ) : (
            filtered.map((o) => (
              <label
                key={o.nodeId}
                className="hover:bg-muted/50 flex cursor-pointer items-start gap-2 px-2 py-1 text-[12px]"
              >
                <input
                  type="checkbox"
                  checked={selected.has(o.nodeId)}
                  onChange={() => toggle(o.nodeId)}
                  className="mt-0.5"
                />
                <span>{o.label}</span>
              </label>
            ))
          )}
        </div>
      </details>

      {dirty ? (
        <div className="mt-2 flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-[12px]"
            onClick={save}
            disabled={busy}
          >
            단원 매핑 저장
          </Button>
          <button
            type="button"
            onClick={() => setSelected(new Set(nodeIds))}
            className="text-muted-foreground text-[12px] hover:underline"
          >
            되돌리기
          </button>
        </div>
      ) : null}
    </div>
  );
}

function AddLessonForm() {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.error) toast.error(fetcher.data.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);
  return (
    <fetcher.Form
      method="post"
      className="border-border bg-card flex flex-wrap items-end gap-2.5 rounded-xl border p-3 shadow-sm"
    >
      <input type="hidden" name="intent" value="add_lesson" />
      <label className="flex flex-col gap-1.5">
        <span className="text-muted-foreground text-[11px] font-semibold">회차</span>
        <input name="lessonNo" type="number" required min={1} max={999} placeholder="1"
          className="border-input bg-background h-9 w-20 rounded-lg border px-2 text-sm tabular-nums" />
      </label>
      <label className="flex min-w-[240px] flex-1 flex-col gap-1.5">
        <span className="text-muted-foreground text-[11px] font-semibold">제목</span>
        <input name="title" required maxLength={200} placeholder="예: 1강 — 특허법 총론"
          className="border-input bg-background h-9 rounded-lg border px-3 text-sm" />
      </label>
      <Button type="submit" size="sm" className="h-9" disabled={fetcher.state !== "idle"}>
        <PlusIcon className="size-3.5" /> 회차 추가
      </Button>
    </fetcher.Form>
  );
}

function LessonCard({
  lesson,
  nodeOptions,
  contents,
  isFirst,
  isLast,
}: {
  lesson: CourseDetail["lessons"][number];
  nodeOptions: NodeOption[];
  contents: PickableContent[];
  isFirst: boolean;
  isLast: boolean;
}) {
  const fetcher = useFetcher<{
    ok?: boolean;
    error?: string;
    durationChanged?: boolean;
    diffSeconds?: number;
    affectedCount?: number;
    adjusted?: number;
  }>();
  const [adjustProposal, setAdjustProposal] = useState<{
    diffSeconds: number;
    affectedCount: number;
  } | null>(null);
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.error) toast.error(fetcher.data.error);
    else if (typeof fetcher.data.adjusted === "number") {
      toast.success(`수강권 ${fetcher.data.adjusted}건의 배수 모수를 조정했습니다.`);
      setAdjustProposal(null);
    } else if (fetcher.data.durationChanged) {
      // ★§4.5 — 자동 재계산 금지: 관리자에게 조정 적용을 강제 제안
      if ((fetcher.data.affectedCount ?? 0) > 0) {
        setAdjustProposal({
          diffSeconds: fetcher.data.diffSeconds ?? 0,
          affectedCount: fetcher.data.affectedCount ?? 0,
        });
      } else {
        toast.info("재생시간이 달라졌지만 배수 적용 수강권이 없어 조정할 것이 없습니다.");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);

  const toggle = (field: "is_preview" | "is_published", value: boolean) => {
    const fd = new FormData();
    fd.set("intent", "toggle_lesson");
    fd.set("lessonId", lesson.lessonId);
    fd.set("field", field);
    fd.set("value", value ? "1" : "0");
    fetcher.submit(fd, { method: "post" });
  };
  const move = (dir: "up" | "down") => {
    const fd = new FormData();
    fd.set("intent", "move_lesson");
    fd.set("lessonId", lesson.lessonId);
    fd.set("dir", dir);
    fetcher.submit(fd, { method: "post" });
  };

  return (
    <section className="border-border bg-card rounded-xl border p-3.5 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-[12px] font-bold tabular-nums">{lesson.lessonNo}강</span>
        <h4 className="text-[14px] font-bold">{lesson.title}</h4>
        {lesson.isPreview ? <Chip tone="violet">미리보기</Chip> : null}
        <Chip tone={lesson.isPublished ? "emerald" : "amber"}>
          {lesson.isPublished ? "공개" : "비공개"}
        </Chip>
        {lesson.activeVideo ? (
          <Chip tone="neutral">
            {fmtDuration(lesson.activeVideo.durationSeconds)}
          </Chip>
        ) : (
          <Chip tone="coral">영상 없음</Chip>
        )}
        {lesson.replacedCount > 0 ? (
          <span className="text-muted-foreground text-[11px]">교체 {lesson.replacedCount}회</span>
        ) : null}
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => move("up")} disabled={isFirst}
            className="border-border text-muted-foreground hover:text-foreground inline-flex size-6 items-center justify-center rounded-md border disabled:opacity-30"
            title="위로">
            <ArrowUpIcon className="size-3" />
          </button>
          <button type="button" onClick={() => move("down")} disabled={isLast}
            className="border-border text-muted-foreground hover:text-foreground inline-flex size-6 items-center justify-center rounded-md border disabled:opacity-30"
            title="아래로">
            <ArrowDownIcon className="size-3" />
          </button>
          <button type="button" onClick={() => toggle("is_preview", !lesson.isPreview)}
            className="border-border hover:bg-muted/50 h-6 rounded-md border px-2 text-[11px] font-medium">
            {lesson.isPreview ? "미리보기 해제" : "미리보기 지정"}
          </button>
          <button type="button" onClick={() => toggle("is_published", !lesson.isPublished)}
            className="border-border hover:bg-muted/50 h-6 rounded-md border px-2 text-[11px] font-medium">
            {lesson.isPublished ? "비공개로" : "공개로"}
          </button>
        </div>
      </div>

      {/* 영상 등록/교체 — 콘텐츠 라이브러리에서 선택(키·재생시간 자동) */}
      <fetcher.Form method="post" className="bg-muted/20 border-border/60 flex flex-wrap items-end gap-2 rounded-lg border p-2.5">
        <input type="hidden" name="intent" value="set_video" />
        <input type="hidden" name="lessonId" value={lesson.lessonId} />
        <label className="flex min-w-[280px] flex-1 flex-col gap-1">
          <span className="text-muted-foreground text-[10px] font-semibold">콘텐츠 (라이브러리)</span>
          {contents.length === 0 ? (
            <span className="text-muted-foreground py-1.5 text-[12px]">
              등록된 콘텐츠가 없습니다 — <Link to="/admin/lms/contents" className="text-link font-semibold hover:underline">콘텐츠 라이브러리</Link>에서 콜러스 동기화 또는 콘텐츠를 먼저 등록하세요.
            </span>
          ) : (
            <select name="contentId" required defaultValue={lesson.activeVideo?.contentId ?? ""}
              className="border-input bg-background h-8 rounded-md border px-2 text-[12px]">
              <option value="" disabled>콘텐츠 선택…</option>
              {contents.map((c) => (
                <option key={c.contentId} value={c.contentId}>
                  {c.title}
                  {c.durationSeconds ? ` · ${fmtDuration(c.durationSeconds)}` : " · 재생시간 미확정"}
                  {c.groupName ? ` · ${c.groupName}` : ""}
                  {c.encodingStatus !== "available" ? ` · [${c.encodingStatus}]` : ""}
                </option>
              ))}
            </select>
          )}
        </label>
        {lesson.activeVideo ? (
          <label className="flex min-w-[160px] flex-col gap-1">
            <span className="text-muted-foreground text-[10px] font-semibold">교체 사유</span>
            <input name="replacedReason" maxLength={300} placeholder="오류 수정 / 화질 개선…"
              className="border-input bg-background h-8 rounded-md border px-2 text-[12px]" />
          </label>
        ) : null}
        <Button type="submit" size="sm" variant="outline" className="h-8 text-[12px]" disabled={contents.length === 0 || fetcher.state !== "idle"}>
          <RefreshCwIcon className="size-3" /> {lesson.activeVideo ? "영상 교체" : "영상 등록"}
        </Button>
      </fetcher.Form>

      {/* ★§4.5 — 영상 교체로 재생시간 변경 → 배수 모수 조정 제안 (자동 재계산 금지) */}
      {adjustProposal ? (
        <fetcher.Form
          method="post"
          className="border-amber-500/40 bg-amber-500/10 mt-2 rounded-lg border p-3"
        >
          <input type="hidden" name="intent" value="apply_duration_adjust" />
          <input type="hidden" name="diffSeconds" value={adjustProposal.diffSeconds} />
          <p className="mb-2 text-[12px] font-semibold">
            재생시간이 {adjustProposal.diffSeconds > 0 ? "+" : ""}
            {Math.round(adjustProposal.diffSeconds / 60)}분 변했습니다. 배수 적용 수강권{" "}
            {adjustProposal.affectedCount}건의 허용 시청량 모수에 이 차이를 반영할까요?
            (반영하지 않으면 기존 수강권은 이전 모수 그대로 유지됩니다 — 자동 재계산되지 않습니다.)
          </p>
          <input
            name="reason"
            maxLength={200}
            placeholder="조정 사유 (기본: 영상 교체에 따른 모수 조정)"
            className="border-input bg-background mb-2 h-8 w-full rounded-md border px-2 text-[12px]"
          />
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" className="h-7 text-[12px]" disabled={fetcher.state !== "idle"}>
              수강권 {adjustProposal.affectedCount}건 모수 조정 적용
            </Button>
            <button
              type="button"
              onClick={() => setAdjustProposal(null)}
              className="text-muted-foreground text-[12px] hover:underline"
            >
              반영 안 함
            </button>
          </div>
        </fetcher.Form>
      ) : null}

      {/* 회차↔체계도 노드 매핑 (선순환 — 강의→복습 시딩 브리지) */}
      <LessonNodesSection
        lessonId={lesson.lessonId}
        nodeIds={lesson.nodeIds}
        nodeOptions={nodeOptions}
      />

      {/* 강의 자료 (배포용 첨부 — 학생은 공개된 것만 서명 URL 로 열람) */}
      <MaterialsSection lessonId={lesson.lessonId} materials={lesson.materials} />

      {/* 운영 메모 (staff 전용 테이블) */}
      <fetcher.Form method="post" className="mt-2 flex items-end gap-2">
        <input type="hidden" name="intent" value="save_memo" />
        <input type="hidden" name="lessonId" value={lesson.lessonId} />
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-muted-foreground text-[10px] font-semibold">
            운영 메모 (스태프만 열람 — 개인정보·민감 내용 기재 금지)
          </span>
          <input name="memo" maxLength={500} defaultValue={lesson.staffMemo ?? ""}
            placeholder="예: 12:30 판서 오탈자 — 다음 교체 때 수정"
            className="border-input bg-background h-8 rounded-md border px-2 text-[12px]" />
        </label>
        <Button type="submit" size="sm" variant="ghost" className="h-8 text-[12px]" disabled={fetcher.state !== "idle"}>
          메모 저장
        </Button>
      </fetcher.Form>
    </section>
  );
}
