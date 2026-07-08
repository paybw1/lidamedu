// feat-11-002 — 에디션 상세: 회차 등록·순서·미리보기·공개, 영상 등록/교체(이력), 운영 메모.
// 영상 교체 시 duration 이 달라지면 배수 모수 조정은 M3(adjust 이벤트)에서 — 여기선 경고만.

import { useEffect } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  PlusIcon,
  RefreshCwIcon,
} from "lucide-react";
import { Link, data, useFetcher } from "react-router";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip, IndexTable, TD, TR } from "~/features/admin/components/admin-ui";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  getCourseDetail,
  type CourseDetail,
} from "~/features/lms/queries.server";

import type { Route } from "./+types/admin-lms-course-detail";

export const meta: Route.MetaFunction = () => [
  { title: "에디션 상세 | 리담변리사학원" },
];

async function requireStaff(request: Request) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });
  return { client, user, role };
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { client, role } = await requireStaff(request);
  const course = await getCourseDetail(client, params.courseId!);
  if (!course) throw data("Course not found", { status: 404 });
  return { course, role };
}

const addLessonSchema = z.object({
  lessonNo: z.coerce.number().int().min(1).max(999),
  title: z.string().trim().min(1).max(200),
});
const setVideoSchema = z.object({
  lessonId: z.string().uuid(),
  drmProvider: z.string().trim().min(1).max(40),
  drmVideoId: z.string().trim().min(1).max(300),
  durationSeconds: z.coerce.number().int().min(1),
  replacedReason: z.string().trim().max(300).optional(),
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
      drmProvider: fd.get("drmProvider"),
      drmVideoId: fd.get("drmVideoId"),
      durationSeconds: fd.get("durationSeconds"),
      replacedReason: fd.get("replacedReason") || undefined,
    });
    if (!parsed.success) return data({ error: "영상 정보(ID·재생시간)를 확인해 주세요." }, { status: 400 });
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
    const { error } = await client.from("lesson_videos").insert({
      lesson_id: parsed.data.lessonId,
      drm_provider: parsed.data.drmProvider,
      drm_video_id: parsed.data.drmVideoId,
      duration_seconds: parsed.data.durationSeconds,
      created_by: user.id,
    });
    if (error) return data({ error: error.message }, { status: 400 });
    const durationChanged = prev && prev.duration_seconds !== parsed.data.durationSeconds;
    return data({
      ok: true as const,
      // ★설계 §4.5 — 모수 변경 경고(조정 이벤트는 M3 배수 회계에서)
      durationChanged: !!durationChanged,
    });
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

  return data({ error: "Unknown intent" }, { status: 400 });
}

function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

export default function AdminLmsCourseDetail({ loaderData }: Route.ComponentProps) {
  const { course, role } = loaderData;
  return (
    <AdminShell
      cluster="lms"
      role={role}
      title={`${course.seriesTitle} — ${course.editionLabel}`}
      desc="회차와 영상을 관리합니다. 영상 교체는 회차를 유지한 채 수정본으로 바꾸는 것이고, 강 구성이 바뀌는 전면 개편은 시리즈에서 새 에디션을 발행하세요."
      headerRight={
        <Link to="/admin/lms/courses" className="text-link text-[12px] font-semibold hover:underline">
          ← 시리즈 목록
        </Link>
      }
    >
      <AddLessonForm />
      <div className="mt-4 space-y-3">
        {course.lessons.map((lesson, i) => (
          <LessonCard
            key={lesson.lessonId}
            lesson={lesson}
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
    </AdminShell>
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
  isFirst,
  isLast,
}: {
  lesson: CourseDetail["lessons"][number];
  isFirst: boolean;
  isLast: boolean;
}) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string; durationChanged?: boolean }>();
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.error) toast.error(fetcher.data.error);
    else if (fetcher.data.durationChanged) {
      toast.warning(
        "재생시간이 달라졌습니다. 기존 수강권의 배수 모수 조정은 배수 회계(M3)에서 처리됩니다 — 자동 재계산되지 않습니다.",
        { duration: 8000 },
      );
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

      {/* 영상 등록/교체 */}
      <fetcher.Form method="post" className="bg-muted/20 border-border/60 flex flex-wrap items-end gap-2 rounded-lg border p-2.5">
        <input type="hidden" name="intent" value="set_video" />
        <input type="hidden" name="lessonId" value={lesson.lessonId} />
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground text-[10px] font-semibold">DRM 공급자</span>
          <select name="drmProvider" defaultValue={lesson.activeVideo?.drmProvider ?? "kollus"}
            className="border-input bg-background h-8 rounded-md border px-2 text-[12px]">
            <option value="kollus">콜러스</option>
            <option value="starplayer">스타플레이어</option>
          </select>
        </label>
        <label className="flex min-w-[220px] flex-1 flex-col gap-1">
          <span className="text-muted-foreground text-[10px] font-semibold">영상 ID (외부 콘텐츠 키)</span>
          <input name="drmVideoId" required maxLength={300}
            defaultValue={lesson.activeVideo?.drmVideoId ?? ""}
            className="border-input bg-background h-8 rounded-md border px-2 font-mono text-[12px]" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground text-[10px] font-semibold">재생시간(초)</span>
          <input name="durationSeconds" type="number" required min={1}
            defaultValue={lesson.activeVideo?.durationSeconds ?? ""}
            className="border-input bg-background h-8 w-24 rounded-md border px-2 text-[12px] tabular-nums" />
        </label>
        {lesson.activeVideo ? (
          <label className="flex min-w-[160px] flex-col gap-1">
            <span className="text-muted-foreground text-[10px] font-semibold">교체 사유</span>
            <input name="replacedReason" maxLength={300} placeholder="오류 수정 / 화질 개선…"
              className="border-input bg-background h-8 rounded-md border px-2 text-[12px]" />
          </label>
        ) : null}
        <Button type="submit" size="sm" variant="outline" className="h-8 text-[12px]" disabled={fetcher.state !== "idle"}>
          <RefreshCwIcon className="size-3" /> {lesson.activeVideo ? "영상 교체" : "영상 등록"}
        </Button>
      </fetcher.Form>

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
