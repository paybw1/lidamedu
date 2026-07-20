// feat-11-002 — 강의 시리즈·에디션 관리. staff 전용.
// 에디션 발행(publish) 시 판매중 T-PASS 연결 제안 (★M1 승인 단서 3).

import { useEffect, useState } from "react";
import {
  ClapperboardIcon,
  CopyIcon,
  PlusIcon,
  SendIcon,
  Trash2Icon,
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
import { getStaffRole } from "~/features/laws/queries.server";
import {
  LECTURE_TYPE_LABEL,
  toLectureType,
} from "~/features/lms/lib/lecture-type";
import {
  listCourseCategories,
  listSeriesWithEditions,
  listTpassLinkSuggestions,
  logCourseAudit,
  type CourseCategoryRow,
  type SeriesWithEditions,
  type TpassSuggestion,
} from "~/features/lms/queries.server";

import type { Route } from "./+types/admin-lms-courses";

export const meta: Route.MetaFunction = () => [
  { title: "강의 시리즈·에디션 | 리담변리사학원" },
];

const SUBJECT_OPTIONS = [
  { value: "patent", label: "특허법" },
  { value: "trademark", label: "상표법" },
  { value: "design", label: "디자인보호법" },
  { value: "civil", label: "민법" },
  { value: "civil-procedure", label: "민사소송법" },
  { value: "science", label: "자연과학" },
];

async function requireStaff(request: Request) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });
  // 4d — 접근 duty: 원장 항상 + 관리자 관리에서 '강의 영상·도서 등록' 배정 스태프.
  if (!(await hasDutyAccess("lms_video_admin", user.id, role))) {
    throw data("Forbidden — 관리자 관리에서 접근 권한을 배정받아야 합니다.", { status: 403 });
  }
  return { client, user, role };
}

export async function loader({ request }: Route.LoaderArgs) {
  const { client, role } = await requireStaff(request);
  const [series, categories, instructorsRes] = await Promise.all([
    listSeriesWithEditions(client),
    listCourseCategories(client),
    adminClient
      .from("profiles")
      .select("profile_id, name")
      .in("role", ["instructor", "admin"])
      .order("name"),
  ]);
  return {
    series,
    role,
    categories,
    instructors: (instructorsRes.data ?? []).map((i) => ({
      profileId: i.profile_id,
      name: i.name ?? "(이름 없음)",
    })),
  };
}

const createSeriesSchema = z.object({
  intent: z.literal("create_series"),
  title: z.string().trim().min(1).max(120),
  subjectCode: z.string().min(1),
  instructorId: z.string().uuid().nullable(),
});
const createEditionSchema = z.object({
  intent: z.literal("create_edition"),
  seriesId: z.string().uuid(),
  editionLabel: z.string().trim().min(1).max(30),
  editionYear: z.coerce.number().int().min(2020).max(2100),
});
const publishSchema = z.object({
  intent: z.literal("publish"),
  courseId: z.string().uuid(),
});
const linkTpassSchema = z.object({
  intent: z.literal("link_tpass"),
  courseId: z.string().uuid(),
  planIds: z.array(z.string().uuid()),
});

export async function action({ request }: Route.ActionArgs) {
  const { client, user } = await requireStaff(request);
  const fd = await request.formData();
  const intent = fd.get("intent");

  if (intent === "create_series") {
    const parsed = createSeriesSchema.safeParse({
      intent,
      title: fd.get("title"),
      subjectCode: fd.get("subjectCode"),
      instructorId: fd.get("instructorId") || null,
    });
    if (!parsed.success) return data({ error: "입력을 확인해 주세요." }, { status: 400 });
    const { error } = await client.from("course_series").insert({
      title: parsed.data.title,
      subject_code: parsed.data.subjectCode,
      instructor_id: parsed.data.instructorId,
    });
    if (error) return data({ error: error.message }, { status: 400 });
    return data({ ok: true as const });
  }

  if (intent === "create_edition") {
    const parsed = createEditionSchema.safeParse({
      intent,
      seriesId: fd.get("seriesId"),
      editionLabel: fd.get("editionLabel"),
      editionYear: fd.get("editionYear"),
    });
    if (!parsed.success) return data({ error: "입력을 확인해 주세요." }, { status: 400 });
    const { error } = await client.from("courses").insert({
      series_id: parsed.data.seriesId,
      edition_label: parsed.data.editionLabel,
      edition_year: parsed.data.editionYear,
    });
    if (error) return data({ error: error.message }, { status: 400 });
    return data({ ok: true as const });
  }

  if (intent === "publish") {
    const parsed = publishSchema.safeParse({ intent, courseId: fd.get("courseId") });
    if (!parsed.success) return data({ error: "입력을 확인해 주세요." }, { status: 400 });
    // 발행 = published + 시리즈 current 이전 (구 current 는 유지하되 current 해제 — 수강권·이력 보존)
    const { data: course } = await client
      .from("courses")
      .select("series_id")
      .eq("course_id", parsed.data.courseId)
      .maybeSingle();
    if (!course) return data({ error: "에디션을 찾을 수 없습니다." }, { status: 404 });
    const { error: clearErr } = await client
      .from("courses")
      .update({ is_current: false })
      .eq("series_id", course.series_id)
      .eq("is_current", true);
    if (clearErr) return data({ error: clearErr.message }, { status: 400 });
    const { error } = await client
      .from("courses")
      .update({ status: "published", is_current: true })
      .eq("course_id", parsed.data.courseId);
    if (error) return data({ error: error.message }, { status: 400 });
    // ★단서 3 — 판매중 T-PASS 연결 제안을 발행 응답으로 반환(클라가 제안 패널 표시)
    const suggestions = await listTpassLinkSuggestions(parsed.data.courseId);
    return data({
      ok: true as const,
      published: parsed.data.courseId,
      tpassSuggestions: suggestions,
    });
  }

  if (intent === "link_tpass") {
    const parsed = linkTpassSchema.safeParse({
      intent,
      courseId: fd.get("courseId"),
      planIds: fd.getAll("planIds").map(String),
    });
    if (!parsed.success) return data({ error: "입력을 확인해 주세요." }, { status: 400 });
    if (parsed.data.planIds.length > 0) {
      const { error } = await client.from("plan_courses").upsert(
        parsed.data.planIds.map((pid) => ({
          plan_id: pid,
          course_id: parsed.data.courseId,
        })),
        { onConflict: "plan_id,course_id" },
      );
      if (error) return data({ error: error.message }, { status: 400 });
    }
    void user;
    return data({ ok: true as const, linked: parsed.data.planIds.length });
  }

  if (intent === "clone_edition") {
    const courseId = z.string().uuid().safeParse(fd.get("courseId"));
    if (!courseId.success)
      return data({ error: "대상을 확인해 주세요." }, { status: 400 });
    // 원본 로드 → 새 에디션(초안·비노출) 생성 후 목차·영상·노드·강사 복제(수강기록 제외).
    const { data: src } = await client
      .from("courses")
      .select("series_id, edition_label, edition_year, course_type, category_id")
      .eq("course_id", courseId.data)
      .is("deleted_at", null)
      .maybeSingle();
    if (!src) return data({ error: "에디션을 찾을 수 없습니다." }, { status: 404 });
    const { data: newCourse, error: cErr } = await client
      .from("courses")
      .insert({
        series_id: src.series_id,
        edition_label: `${src.edition_label} (복사)`,
        edition_year: src.edition_year,
        status: "draft",
        is_current: false,
        is_visible: false,
        course_type: src.course_type,
        category_id: src.category_id,
      })
      .select("course_id")
      .single();
    if (cErr)
      return data(
        {
          error:
            cErr.code === "23505"
              ? "이미 '(복사)' 에디션이 있습니다. 먼저 이름을 바꿔 주세요."
              : cErr.message,
        },
        { status: 400 },
      );
    const newCourseId = newCourse.course_id;
    // 회차 복제(old lesson_id → new lesson_id 매핑).
    const { data: lessons } = await client
      .from("course_lessons")
      .select("lesson_id, lesson_no, title, sort_order, is_preview, is_published")
      .eq("course_id", courseId.data)
      .is("deleted_at", null);
    const lessonMap = new Map<string, string>();
    for (const l of lessons ?? []) {
      const { data: nl } = await client
        .from("course_lessons")
        .insert({
          course_id: newCourseId,
          lesson_no: l.lesson_no,
          title: l.title,
          sort_order: l.sort_order,
          is_preview: l.is_preview,
          is_published: l.is_published,
        })
        .select("lesson_id")
        .single();
      if (nl) lessonMap.set(l.lesson_id, nl.lesson_id);
    }
    const oldLessonIds = [...lessonMap.keys()];
    // active 영상 복제(콘텐츠 라이브러리 참조 — 블롭 공유 아님, 재생 안전).
    if (oldLessonIds.length > 0) {
      const { data: vids } = await client
        .from("lesson_videos")
        .select("lesson_id, content_id, drm_provider, drm_video_id, duration_seconds")
        .in("lesson_id", oldLessonIds)
        .eq("is_active", true);
      const vRows = (vids ?? [])
        .map((v) => {
          const nlid = lessonMap.get(v.lesson_id);
          if (!nlid) return null;
          return {
            lesson_id: nlid,
            content_id: v.content_id,
            drm_provider: v.drm_provider,
            drm_video_id: v.drm_video_id,
            duration_seconds: v.duration_seconds,
            created_by: user.id,
          };
        })
        .filter((v): v is NonNullable<typeof v> => v != null);
      if (vRows.length > 0) await client.from("lesson_videos").insert(vRows);
      // 회차↔노드 링크 복제.
      const { data: links } = await client
        .from("lesson_node_links")
        .select("lesson_id, node_id")
        .in("lesson_id", oldLessonIds);
      const lRows = (links ?? [])
        .map((x) => {
          const nlid = lessonMap.get(x.lesson_id);
          return nlid
            ? { lesson_id: nlid, node_id: x.node_id, created_by: user.id }
            : null;
        })
        .filter((x): x is NonNullable<typeof x> => x != null);
      if (lRows.length > 0) await client.from("lesson_node_links").insert(lRows);
    }
    // 담당 강사 복제.
    const { data: instr } = await client
      .from("course_instructors")
      .select("instructor_id, role, sort_order")
      .eq("course_id", courseId.data);
    if (instr && instr.length > 0) {
      await client.from("course_instructors").insert(
        instr.map((i) => ({
          course_id: newCourseId,
          instructor_id: i.instructor_id,
          role: i.role,
          sort_order: i.sort_order,
        })),
      );
    }
    await logCourseAudit(client, {
      courseId: newCourseId,
      actorId: user.id,
      action: "clone",
      summary: `"${src.edition_label}" 복사로 생성(초안·비노출, 자료 제외)`,
    });
    return data({
      ok: true as const,
      cloned: newCourseId,
      lessonCount: lessonMap.size,
    });
  }

  if (intent === "toggle_visible") {
    const courseId = z.string().uuid().safeParse(fd.get("courseId"));
    const value = fd.get("value") === "1";
    if (!courseId.success)
      return data({ error: "대상을 확인해 주세요." }, { status: 400 });
    const { error } = await client
      .from("courses")
      .update({ is_visible: value })
      .eq("course_id", courseId.data);
    if (error) return data({ error: error.message }, { status: 400 });
    await logCourseAudit(client, {
      courseId: courseId.data,
      actorId: user.id,
      action: "update_basic",
      summary: `노출 ${value ? "ON" : "OFF"}`,
    });
    return data({ ok: true as const });
  }

  if (intent === "save_category") {
    const categoryId = String(fd.get("categoryId") ?? "").trim();
    const name = String(fd.get("name") ?? "").trim();
    const parentId = String(fd.get("parentId") ?? "").trim() || null;
    const sortOrder = Math.trunc(Number(fd.get("sortOrder") ?? 0)) || 0;
    const isActive = fd.get("isActive") !== "0";
    if (!name || name.length > 60)
      return data({ error: "분류명을 확인해 주세요." }, { status: 400 });
    const row = {
      name,
      parent_id: parentId,
      sort_order: sortOrder,
      is_active: isActive,
    };
    if (categoryId) {
      if (parentId === categoryId)
        return data({ error: "자기 자신을 상위로 지정할 수 없습니다." }, { status: 400 });
      const { error } = await client
        .from("course_categories")
        .update(row)
        .eq("category_id", categoryId);
      if (error) return data({ error: error.message }, { status: 400 });
    } else {
      const { error } = await client.from("course_categories").insert(row);
      if (error) return data({ error: error.message }, { status: 400 });
    }
    return data({ ok: true as const });
  }

  if (intent === "delete_category") {
    const categoryId = z.string().uuid().safeParse(fd.get("categoryId"));
    if (!categoryId.success)
      return data({ error: "대상을 확인해 주세요." }, { status: 400 });
    const [{ count: childCount }, { count: courseCount }] = await Promise.all([
      client
        .from("course_categories")
        .select("category_id", { count: "exact", head: true })
        .eq("parent_id", categoryId.data),
      client
        .from("courses")
        .select("course_id", { count: "exact", head: true })
        .eq("category_id", categoryId.data)
        .is("deleted_at", null),
    ]);
    if ((childCount ?? 0) > 0)
      return data({ error: "하위 분류가 있어 삭제할 수 없습니다." }, { status: 400 });
    if ((courseCount ?? 0) > 0)
      return data(
        { error: `강의 ${courseCount}개가 이 분류에 있어 삭제할 수 없습니다.` },
        { status: 400 },
      );
    const { error } = await client
      .from("course_categories")
      .delete()
      .eq("category_id", categoryId.data);
    if (error) return data({ error: error.message }, { status: 400 });
    return data({ ok: true as const });
  }

  return data({ error: "Unknown intent" }, { status: 400 });
}

function fmtDuration(sec: number): string {
  if (sec <= 0) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "초안",
  published: "발행",
  archived: "보관",
};

export default function AdminLmsCourses({ loaderData }: Route.ComponentProps) {
  const { series, role, instructors, categories } = loaderData;
  return (
    <AdminShell
      cluster="lms"
      role={role}
      title="강의 시리즈·에디션"
      desc="강의 영상의 시리즈(정체성)와 연도판 에디션을 관리합니다. 전면 개편은 새 에디션으로, 소규모 수정은 에디션 상세에서 영상 교체로 처리합니다."
    >
      <CreateSeriesForm instructors={instructors} />
      <CategoryManager categories={categories} />
      <div className="mt-4 space-y-4">
        {series.length === 0 ? (
          <div className="border-border bg-card text-muted-foreground flex flex-col items-center gap-2 rounded-xl border py-16 text-center shadow-sm">
            <ClapperboardIcon className="size-8 opacity-30" />
            <p className="text-sm font-medium">등록된 시리즈가 없습니다.</p>
          </div>
        ) : (
          series.map((s) => <SeriesCard key={s.seriesId} series={s} />)
        )}
      </div>
    </AdminShell>
  );
}

// 카테고리 대/중/소 taxonomy 관리(접이식). 대분류=상위 없음, 중/소=상위 지정.
function CategoryManager({ categories }: { categories: CourseCategoryRow[] }) {
  const [open, setOpen] = useState(false);
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const [editId, setEditId] = useState<string | null>(null);
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.error) toast.error(fetcher.data.error);
    else if (fetcher.data.ok) {
      toast.success("저장했습니다.");
      setEditId(null);
    }
  }, [fetcher.state, fetcher.data]);

  const remove = (categoryId: string, name: string) => {
    if (!window.confirm(`분류 "${name}"을(를) 삭제할까요?`)) return;
    const fd = new FormData();
    fd.set("intent", "delete_category");
    fd.set("categoryId", categoryId);
    fetcher.submit(fd, { method: "post" });
  };
  const busy = fetcher.state !== "idle";

  return (
    <section className="border-border bg-card mt-3 rounded-xl border shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-bold"
      >
        <span>카테고리 관리 (대/중/소분류)</span>
        <span className="text-muted-foreground text-xs">
          {categories.length}개 · {open ? "접기" : "펼치기"}
        </span>
      </button>
      {open ? (
        <div className="border-t px-4 py-3">
          {categories.length > 0 ? (
            <ul className="mb-3 space-y-1">
              {categories.map((c) => (
                <li
                  key={c.categoryId}
                  className="border-border/60 bg-background flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm"
                  style={{ marginLeft: c.depth * 20 }}
                >
                  <span className="font-medium">{c.name}</span>
                  {!c.isActive ? <Chip tone="outline">비활성</Chip> : null}
                  <span className="text-muted-foreground text-[11px]">{c.path}</span>
                  <div className="ml-auto flex gap-1">
                    <button
                      type="button"
                      onClick={() => setEditId(editId === c.categoryId ? null : c.categoryId)}
                      className="text-muted-foreground hover:text-foreground text-xs font-semibold"
                    >
                      {editId === c.categoryId ? "닫기" : "수정"}
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(c.categoryId, c.name)}
                      disabled={busy}
                      className="text-muted-foreground hover:text-rose-600 p-0.5 disabled:opacity-40"
                      title="삭제"
                    >
                      <Trash2Icon className="size-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground mb-3 text-[12px]">
              등록된 분류가 없습니다. 대분류부터 추가하세요.
            </p>
          )}
          <CategoryForm
            categories={categories}
            editCategory={editId ? categories.find((c) => c.categoryId === editId) ?? null : null}
            fetcher={fetcher}
          />
        </div>
      ) : null}
    </section>
  );
}

function CategoryForm({
  categories,
  editCategory,
  fetcher,
}: {
  categories: CourseCategoryRow[];
  editCategory: CourseCategoryRow | null;
  fetcher: ReturnType<typeof useFetcher<{ ok?: boolean; error?: string }>>;
}) {
  return (
    <fetcher.Form
      method="post"
      key={editCategory?.categoryId ?? "new"}
      className="border-border/60 bg-muted/20 flex flex-wrap items-end gap-2 rounded-lg border p-2.5"
    >
      <input type="hidden" name="intent" value="save_category" />
      <input type="hidden" name="categoryId" value={editCategory?.categoryId ?? ""} />
      <label className="flex min-w-[140px] flex-1 flex-col gap-1">
        <span className="text-muted-foreground text-[10px] font-semibold">
          {editCategory ? "분류명 수정" : "새 분류명"}
        </span>
        <input
          name="name"
          required
          maxLength={60}
          defaultValue={editCategory?.name ?? ""}
          placeholder="예: 변리사 · 1차 · 특허법"
          className="border-input bg-background h-8 rounded-md border px-2 text-[12px]"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-muted-foreground text-[10px] font-semibold">상위 분류</span>
        <select
          name="parentId"
          defaultValue={editCategory?.parentId ?? ""}
          className="border-input bg-background h-8 rounded-md border px-2 text-[12px]"
        >
          <option value="">(대분류)</option>
          {categories
            .filter((c) => c.categoryId !== editCategory?.categoryId && c.depth < 2)
            .map((c) => (
              <option key={c.categoryId} value={c.categoryId}>
                {c.path}
              </option>
            ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-muted-foreground text-[10px] font-semibold">순서</span>
        <input
          name="sortOrder"
          type="number"
          defaultValue={editCategory?.sortOrder ?? 0}
          className="border-input bg-background h-8 w-16 rounded-md border px-2 text-[12px]"
        />
      </label>
      <label className="flex items-center gap-1.5 text-[12px]">
        <input
          type="checkbox"
          name="isActive"
          value="1"
          defaultChecked={editCategory?.isActive ?? true}
          className="size-3.5"
        />
        활성
      </label>
      <input type="hidden" name="isActive" value="0" />
      <Button type="submit" size="sm" variant="outline" className="h-8 text-[12px]" disabled={fetcher.state !== "idle"}>
        {editCategory ? "수정 저장" : "분류 추가"}
      </Button>
    </fetcher.Form>
  );
}

function CreateSeriesForm({
  instructors,
}: {
  instructors: Array<{ profileId: string; name: string }>;
}) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) toast.success("시리즈를 등록했습니다.");
    else if (fetcher.state === "idle" && fetcher.data?.error) toast.error(fetcher.data.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);
  return (
    <fetcher.Form
      method="post"
      className="border-border bg-card flex flex-wrap items-end gap-2.5 rounded-xl border p-3 shadow-sm"
    >
      <input type="hidden" name="intent" value="create_series" />
      <label className="flex min-w-[220px] flex-1 flex-col gap-1.5">
        <span className="text-muted-foreground text-[11px] font-semibold">시리즈명</span>
        <input
          name="title"
          required
          maxLength={120}
          placeholder="예: 특허법 기본강의"
          className="border-input bg-background h-9 rounded-lg border px-3 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-muted-foreground text-[11px] font-semibold">과목</span>
        <select name="subjectCode" className="border-input bg-background h-9 rounded-lg border px-2 text-sm">
          {SUBJECT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-muted-foreground text-[11px] font-semibold">대표 강사</span>
        <select name="instructorId" className="border-input bg-background h-9 rounded-lg border px-2 text-sm">
          <option value="">(미지정)</option>
          {instructors.map((i) => (
            <option key={i.profileId} value={i.profileId}>{i.name}</option>
          ))}
        </select>
      </label>
      <Button type="submit" size="sm" className="h-9" disabled={fetcher.state !== "idle"}>
        <PlusIcon className="size-3.5" /> 시리즈 추가
      </Button>
    </fetcher.Form>
  );
}

function SeriesCard({ series }: { series: SeriesWithEditions }) {
  const subjectLabel =
    SUBJECT_OPTIONS.find((o) => o.value === series.subjectCode)?.label ??
    series.subjectCode;
  return (
    <section className="border-border bg-card rounded-xl border p-4 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="text-[15px] font-bold">{series.title}</h3>
        <Chip tone="neutral">{subjectLabel}</Chip>
        {series.instructorName ? <Chip tone="outline">{series.instructorName}</Chip> : null}
        <div className="ml-auto">
          <CreateEditionForm seriesId={series.seriesId} />
        </div>
      </div>
      {series.editions.length === 0 ? (
        <p className="text-muted-foreground text-[12px]">에디션이 없습니다. 연도판을 추가하세요.</p>
      ) : (
        <IndexTable
          minWidth={680}
          headers={[
            { label: "에디션" },
            { label: "상태", width: "6rem" },
            { label: "회차", align: "right", width: "5rem" },
            { label: "총 재생시간", align: "right", width: "8rem" },
            { label: "", width: "16rem" },
          ]}
        >
          {series.editions.map((e) => (
            <EditionRow key={e.courseId} edition={e} />
          ))}
        </IndexTable>
      )}
    </section>
  );
}

function CreateEditionForm({ seriesId }: { seriesId: string }) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const year = 2026;
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.error) toast.error(fetcher.data.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);
  return (
    <fetcher.Form method="post" className="flex items-center gap-1.5">
      <input type="hidden" name="intent" value="create_edition" />
      <input type="hidden" name="seriesId" value={seriesId} />
      <input
        name="editionLabel"
        required
        placeholder={`${year}판`}
        className="border-input bg-background h-8 w-24 rounded-lg border px-2 text-[12px]"
      />
      <input
        name="editionYear"
        type="number"
        required
        defaultValue={year}
        min={2020}
        max={2100}
        className="border-input bg-background h-8 w-20 rounded-lg border px-2 text-[12px] tabular-nums"
      />
      <Button type="submit" size="sm" variant="outline" className="h-8 text-[12px]" disabled={fetcher.state !== "idle"}>
        <PlusIcon className="size-3" /> 에디션
      </Button>
    </fetcher.Form>
  );
}

function EditionRow({
  edition,
}: {
  edition: SeriesWithEditions["editions"][number];
}) {
  const fetcher = useFetcher<{
    ok?: boolean;
    error?: string;
    published?: string;
    tpassSuggestions?: TpassSuggestion[];
    linked?: number;
    cloned?: string;
    lessonCount?: number;
  }>();
  const [suggestions, setSuggestions] = useState<TpassSuggestion[] | null>(null);
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.error) toast.error(fetcher.data.error);
    else if (fetcher.data.cloned) {
      toast.success(
        `강의를 복사했습니다 (회차 ${fetcher.data.lessonCount ?? 0}개, 초안·비노출). 자료는 복제되지 않습니다.`,
      );
    } else if (fetcher.data.published) {
      toast.success("에디션을 발행했습니다. (신판 기본 노출)");
      const unlinked = (fetcher.data.tpassSuggestions ?? []).filter((s) => !s.alreadyLinked);
      // ★단서 3 — 판매중 T-PASS 가 있으면 연결 제안 패널 강제 표시
      setSuggestions(unlinked.length > 0 ? fetcher.data.tpassSuggestions! : null);
      if (unlinked.length === 0 && (fetcher.data.tpassSuggestions ?? []).length === 0) {
        toast.info("연결 제안할 판매중 T-PASS 상품이 없습니다.");
      }
    } else if (typeof fetcher.data.linked === "number") {
      toast.success(`T-PASS ${fetcher.data.linked}개 상품에 연결했습니다.`);
      setSuggestions(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);

  return (
    <>
      <TR>
        <TD>
          <div className="flex flex-wrap items-center gap-1.5">
            <Link
              to={`/admin/lms/courses/${edition.courseId}`}
              className="text-link font-semibold hover:underline"
            >
              {edition.editionLabel}
            </Link>
            {edition.publicNo != null ? (
              <Chip tone="neutral">C-{edition.publicNo}</Chip>
            ) : null}
            {edition.isCurrent ? <Chip tone="blue">기본 노출</Chip> : null}
            {edition.courseType ? (
              <Chip tone="outline">
                {LECTURE_TYPE_LABEL[toLectureType(edition.courseType)!] ??
                  edition.courseType}
              </Chip>
            ) : null}
            {edition.categoryName ? (
              <Chip tone="outline">{edition.categoryName}</Chip>
            ) : null}
            {!edition.isVisible ? <Chip tone="amber">미노출</Chip> : null}
          </div>
        </TD>
        <TD>
          <Chip tone={edition.status === "published" ? "emerald" : edition.status === "draft" ? "amber" : "neutral"}>
            {STATUS_LABEL[edition.status]}
          </Chip>
        </TD>
        <TD align="right" mono>{edition.lessonCount}</TD>
        <TD align="right" mono soft>{fmtDuration(edition.totalDurationSeconds)}</TD>
        <TD align="right">
          <div className="flex justify-end gap-1">
            <fetcher.Form method="post" className="inline">
              <input type="hidden" name="intent" value="toggle_visible" />
              <input type="hidden" name="courseId" value={edition.courseId} />
              <input type="hidden" name="value" value={edition.isVisible ? "0" : "1"} />
              <Button
                type="submit"
                size="sm"
                variant="ghost"
                className="h-7 text-[12px]"
                disabled={fetcher.state !== "idle"}
                title={edition.isVisible ? "목록에서 숨기기" : "목록에 노출"}
              >
                {edition.isVisible ? "숨기기" : "노출"}
              </Button>
            </fetcher.Form>
            <fetcher.Form
              method="post"
              className="inline"
              onSubmit={(e) => {
                if (!window.confirm("이 에디션을 복사해 새 초안을 만들까요? (자료 제외)"))
                  e.preventDefault();
              }}
            >
              <input type="hidden" name="intent" value="clone_edition" />
              <input type="hidden" name="courseId" value={edition.courseId} />
              <Button type="submit" size="sm" variant="ghost" className="h-7 text-[12px]" disabled={fetcher.state !== "idle"}>
                <CopyIcon className="size-3" /> 복사
              </Button>
            </fetcher.Form>
            {edition.status !== "published" ? (
              <fetcher.Form method="post" className="inline">
                <input type="hidden" name="intent" value="publish" />
                <input type="hidden" name="courseId" value={edition.courseId} />
                <Button type="submit" size="sm" variant="outline" className="h-7 text-[12px]" disabled={fetcher.state !== "idle"}>
                  <SendIcon className="size-3" /> 발행
                </Button>
              </fetcher.Form>
            ) : null}
          </div>
        </TD>
      </TR>
      {suggestions ? (
        <TR>
          <TD colSpan={5}>
            <fetcher.Form
              method="post"
              className="border-primary/30 bg-primary/5 my-1 rounded-lg border p-3"
            >
              <input type="hidden" name="intent" value="link_tpass" />
              <input type="hidden" name="courseId" value={edition.courseId} />
              <p className="mb-2 text-[12px] font-semibold">
                판매중 T-PASS 상품에 이 에디션을 연결하세요. 연결하지 않으면 T-PASS 수강생에게 신판이 노출되지 않습니다.
              </p>
              <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1">
                {suggestions.map((s) => (
                  <label key={s.planId} className="flex items-center gap-1.5 text-[12px]">
                    <input
                      type="checkbox"
                      name="planIds"
                      value={s.planId}
                      defaultChecked={!s.alreadyLinked}
                      disabled={s.alreadyLinked}
                      className="accent-primary size-3.5"
                    />
                    {s.name}
                    {s.alreadyLinked ? <span className="text-muted-foreground">(연결됨)</span> : null}
                  </label>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Button type="submit" size="sm" className="h-7 text-[12px]" disabled={fetcher.state !== "idle"}>
                  선택 연결
                </Button>
                <button
                  type="button"
                  onClick={() => setSuggestions(null)}
                  className="text-muted-foreground text-[12px] hover:underline"
                >
                  나중에
                </button>
              </div>
            </fetcher.Form>
          </TD>
        </TR>
      ) : null}
    </>
  );
}
