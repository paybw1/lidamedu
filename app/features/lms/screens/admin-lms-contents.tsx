// feat-11-006 Phase 1 S3 — 콜러스 콘텐츠 라이브러리 관리. staff 전용(lms_video_admin).
//   콘텐츠 목록·검색·상태필터 / 강의그룹 CRUD·그룹지정 / 영상확인(수강권·배수 차감 없이).
//   콘텐츠 키=학생 비노출 → staff RLS. 동기화 job(S2)·등록 재배선(S4)은 후속.
import { useEffect, useState } from "react";

import { FolderIcon, PlayIcon, PlusIcon, SearchIcon } from "lucide-react";
import { Form, data, useFetcher, useSearchParams } from "react-router";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "~/core/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/core/components/ui/dialog";
import { Input } from "~/core/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "~/core/components/ui/sheet";
import makeServerClient from "~/core/lib/supa-client.server";
import adminClient from "~/core/lib/supa-admin-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip, Field, IndexTable, TD, TR } from "~/features/admin/components/admin-ui";
import { hasDutyAccess } from "~/features/admin/lib/duties.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { buildKollusWebTokenUrl } from "~/features/lms/lib/kollus-token.server";
import {
  type ContentGroupRow,
  type VideoContentRow,
  listContentGroups,
  listVideoContents,
} from "~/features/lms/queries.server";

import type { Route } from "./+types/admin-lms-contents";

export const meta: Route.MetaFunction = () => [
  { title: "콘텐츠 라이브러리 | 리담변리사학원" },
];

const SUBJECT_OPTIONS = [
  { value: "patent", label: "특허법" },
  { value: "trademark", label: "상표법" },
  { value: "design", label: "디자인보호법" },
  { value: "civil", label: "민법" },
  { value: "civil-procedure", label: "민사소송법" },
  { value: "science", label: "자연과학" },
];

const STATUS_FILTERS = [
  { value: "all", label: "전체" },
  { value: "unassigned", label: "미분류" },
  { value: "available", label: "사용가능" },
  { value: "encoding", label: "인코딩중" },
  { value: "error", label: "오류" },
  { value: "inactive", label: "비활성" },
  { value: "stopped", label: "사용중지" },
] as const;

const ENCODING_OPTIONS = [
  { value: "available", label: "사용가능" },
  { value: "encoding", label: "인코딩중" },
  { value: "error", label: "오류" },
  { value: "unknown", label: "미확인" },
  { value: "deleted", label: "삭제됨" },
];

function encodingTone(s: string): "emerald" | "amber" | "coral" | "neutral" {
  if (s === "available") return "emerald";
  if (s === "encoding") return "amber";
  if (s === "error" || s === "deleted") return "coral";
  return "neutral";
}

function fmtDuration(sec: number | null): string {
  if (!sec || sec <= 0) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m}분 ${s}초` : `${m}분`;
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
    throw data("Forbidden — 관리자 관리에서 접근 권한을 배정받아야 합니다.", {
      status: 403,
    });
  }
  return { client, user, role };
}

export async function loader({ request }: Route.LoaderArgs) {
  const { client, role } = await requireStaff(request);
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const status = url.searchParams.get("status") ?? "all";

  const [allContents, groups, instructorsRes] = await Promise.all([
    listVideoContents(client),
    listContentGroups(client),
    adminClient
      .from("profiles")
      .select("profile_id, name")
      .in("role", ["instructor", "admin"])
      .order("name"),
  ]);

  const contents = allContents.filter((c) => {
    if (q) {
      const hay = `${c.title} ${c.originalFilename ?? ""} ${c.contentKey} ${c.groupName ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    switch (status) {
      case "unassigned":
        return c.groupId === null;
      case "available":
        return c.encodingStatus === "available";
      case "encoding":
        return c.encodingStatus === "encoding";
      case "error":
        return c.encodingStatus === "error";
      case "inactive":
        return !c.isActive;
      case "stopped":
        return c.useStatus === "stopped";
      default:
        return true;
    }
  });

  const groupCounts: Record<string, number> = {};
  for (const c of allContents) {
    if (c.groupId) groupCounts[c.groupId] = (groupCounts[c.groupId] ?? 0) + 1;
  }

  return {
    role,
    contents,
    groups,
    groupCounts,
    total: allContents.length,
    instructors: (instructorsRes.data ?? []).map((i) => ({
      profileId: i.profile_id,
      name: i.name ?? "(이름 없음)",
    })),
  };
}

// ── 액션 ─────────────────────────────────────────────────────────────────
const contentSchema = z.object({
  contentId: z.string().uuid().nullable(),
  drmProvider: z.string().trim().min(1).max(30),
  contentKey: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(200),
  originalFilename: z.string().trim().max(300).nullable(),
  durationSeconds: z.coerce.number().int().min(0).nullable(),
  encodingStatus: z.string().trim().min(1),
  groupId: z.string().uuid().nullable(),
  completionThreshold: z.coerce.number().min(0.01).max(1),
  useStatus: z.enum(["in_use", "stopped"]),
  isActive: z.boolean(),
  adminMemo: z.string().trim().max(1000).nullable(),
});

const groupSchema = z.object({
  groupId: z.string().uuid().nullable(),
  name: z.string().trim().min(1).max(150),
  year: z.coerce.number().int().min(2000).max(2100).nullable(),
  subjectCode: z.string().trim().nullable(),
  instructorId: z.string().uuid().nullable(),
  examTrack: z.string().trim().max(20).nullable(),
  courseType: z.string().trim().max(50).nullable(),
  bookTitle: z.string().trim().max(200).nullable(),
  staffMemo: z.string().trim().max(1000).nullable(),
});

function emptyToNull(v: FormDataEntryValue | null): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}

export async function action({ request }: Route.ActionArgs) {
  const { client, user } = await requireStaff(request);
  const fd = await request.formData();
  const intent = fd.get("intent");

  if (intent === "save_content") {
    const parsed = contentSchema.safeParse({
      contentId: emptyToNull(fd.get("contentId")),
      drmProvider: fd.get("drmProvider") || "kollus",
      contentKey: fd.get("contentKey"),
      title: fd.get("title"),
      originalFilename: emptyToNull(fd.get("originalFilename")),
      durationSeconds: emptyToNull(fd.get("durationSeconds")),
      encodingStatus: fd.get("encodingStatus") || "available",
      groupId: emptyToNull(fd.get("groupId")),
      completionThreshold: fd.get("completionThreshold") || "0.9",
      useStatus: fd.get("useStatus") || "in_use",
      isActive: fd.get("isActive") === "on",
      adminMemo: emptyToNull(fd.get("adminMemo")),
    });
    if (!parsed.success)
      return data({ error: "입력을 확인해 주세요." }, { status: 400 });
    const p = parsed.data;
    const row = {
      drm_provider: p.drmProvider,
      content_key: p.contentKey,
      title: p.title,
      original_filename: p.originalFilename,
      duration_seconds: p.durationSeconds,
      encoding_status: p.encodingStatus,
      group_id: p.groupId,
      completion_threshold: p.completionThreshold,
      use_status: p.useStatus,
      is_active: p.isActive,
      admin_memo: p.adminMemo,
    };
    if (p.contentId) {
      const { error } = await client
        .from("video_contents")
        .update(row)
        .eq("content_id", p.contentId);
      if (error) return data({ error: error.message }, { status: 400 });
    } else {
      const { error } = await client
        .from("video_contents")
        .insert({ ...row, created_by: user.id });
      if (error)
        return data(
          {
            error: error.message.includes("duplicate")
              ? "이미 등록된 콘텐츠 키입니다."
              : error.message,
          },
          { status: 400 },
        );
    }
    return data({ ok: true as const });
  }

  if (intent === "assign_group") {
    const contentId = z.string().uuid().safeParse(fd.get("contentId"));
    if (!contentId.success)
      return data({ error: "대상을 확인해 주세요." }, { status: 400 });
    const groupId = emptyToNull(fd.get("groupId"));
    const { error } = await client
      .from("video_contents")
      .update({ group_id: groupId })
      .eq("content_id", contentId.data);
    if (error) return data({ error: error.message }, { status: 400 });
    return data({ ok: true as const });
  }

  if (intent === "save_group") {
    const parsed = groupSchema.safeParse({
      groupId: emptyToNull(fd.get("groupId")),
      name: fd.get("name"),
      year: emptyToNull(fd.get("year")),
      subjectCode: emptyToNull(fd.get("subjectCode")),
      instructorId: emptyToNull(fd.get("instructorId")),
      examTrack: emptyToNull(fd.get("examTrack")),
      courseType: emptyToNull(fd.get("courseType")),
      bookTitle: emptyToNull(fd.get("bookTitle")),
      staffMemo: emptyToNull(fd.get("staffMemo")),
    });
    if (!parsed.success)
      return data({ error: "입력을 확인해 주세요." }, { status: 400 });
    const g = parsed.data;
    const row = {
      name: g.name,
      year: g.year,
      subject_code: g.subjectCode,
      instructor_id: g.instructorId,
      exam_track: g.examTrack,
      course_type: g.courseType,
      book_title: g.bookTitle,
      staff_memo: g.staffMemo,
    };
    if (g.groupId) {
      const { error } = await client
        .from("content_groups")
        .update(row)
        .eq("group_id", g.groupId);
      if (error) return data({ error: error.message }, { status: 400 });
    } else {
      const { error } = await client
        .from("content_groups")
        .insert({ ...row, created_by: user.id });
      if (error) return data({ error: error.message }, { status: 400 });
    }
    return data({ ok: true as const });
  }

  if (intent === "delete_group") {
    const groupId = z.string().uuid().safeParse(fd.get("groupId"));
    if (!groupId.success)
      return data({ error: "대상을 확인해 주세요." }, { status: 400 });
    // 삭제 제한 — 연결된 콘텐츠가 있으면 막는다.
    const { count } = await client
      .from("video_contents")
      .select("content_id", { count: "exact", head: true })
      .eq("group_id", groupId.data)
      .is("deleted_at", null);
    if ((count ?? 0) > 0)
      return data(
        { error: `콘텐츠 ${count}개가 연결돼 있어 삭제할 수 없습니다. 먼저 그룹을 옮겨 주세요.` },
        { status: 400 },
      );
    const { error } = await client
      .from("content_groups")
      .update({ deleted_at: new Date().toISOString() })
      .eq("group_id", groupId.data);
    if (error) return data({ error: error.message }, { status: 400 });
    return data({ ok: true as const });
  }

  if (intent === "preview") {
    const contentId = z.string().uuid().safeParse(fd.get("contentId"));
    if (!contentId.success)
      return data({ error: "대상을 확인해 주세요." }, { status: 400 });
    const { data: c } = await adminClient
      .from("video_contents")
      .select("content_key, drm_provider, title")
      .eq("content_id", contentId.data)
      .maybeSingle();
    if (!c) return data({ error: "콘텐츠를 찾을 수 없습니다." }, { status: 404 });
    const previewUrl =
      c.drm_provider === "kollus"
        ? buildKollusWebTokenUrl({
            mckey: c.content_key,
            cuid: user.id,
            expireSeconds: 600,
          })
        : null;
    return data({ ok: true as const, previewUrl, previewTitle: c.title });
  }

  return data({ error: "알 수 없는 요청" }, { status: 400 });
}

// ── 화면 ─────────────────────────────────────────────────────────────────
export default function AdminLmsContents({ loaderData }: Route.ComponentProps) {
  const { role, contents, groups, groupCounts, total, instructors } = loaderData;
  const [searchParams] = useSearchParams();
  const activeStatus = searchParams.get("status") ?? "all";

  const [editContent, setEditContent] = useState<VideoContentRow | "new" | null>(
    null,
  );
  const [editGroup, setEditGroup] = useState<ContentGroupRow | "new" | null>(
    null,
  );

  const previewFetcher = useFetcher<{ previewUrl?: string | null; previewTitle?: string; error?: string }>();
  const [previewOpen, setPreviewOpen] = useState(false);
  useEffect(() => {
    if (previewFetcher.state === "idle" && previewFetcher.data) {
      if (previewFetcher.data.error) toast.error(previewFetcher.data.error);
      else setPreviewOpen(true);
    }
  }, [previewFetcher.state, previewFetcher.data]);

  return (
    <AdminShell
      cluster="lms"
      role={role}
      title="콘텐츠 라이브러리"
      desc="콜러스 영상을 강의그룹으로 분류하고 회차에 연결합니다. 동기화·등록 재배선은 후속 단계."
      headerRight={
        <Button size="sm" onClick={() => setEditContent("new")}>
          <PlusIcon className="size-4" /> 콘텐츠 등록
        </Button>
      }
      width={1400}
    >
      {/* 강의그룹 */}
      <section className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold">강의그룹</h2>
          <Button size="sm" variant="outline" onClick={() => setEditGroup("new")}>
            <FolderIcon className="size-3.5" /> 그룹 생성
          </Button>
        </div>
        {groups.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-sm">
            강의그룹이 없습니다. 콜러스 영상을 촬영/과정 단위로 묶어 관리합니다.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {groups.map((g) => (
              <button
                key={g.groupId}
                type="button"
                onClick={() => setEditGroup(g)}
                className="border-border hover:bg-muted/40 rounded-lg border px-3 py-2 text-left transition-colors"
              >
                <div className="text-sm font-semibold">{g.name}</div>
                <div className="text-muted-foreground text-[11px]">
                  {[g.year, g.instructorName, g.examTrack]
                    .filter(Boolean)
                    .join(" · ")}
                  {" · "}
                  콘텐츠 {groupCounts[g.groupId] ?? 0}개
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* 검색·필터 */}
      <Form method="get" className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            name="q"
            defaultValue={searchParams.get("q") ?? ""}
            placeholder="콘텐츠명·파일명·키·그룹 검색"
            className="h-9 w-64 pl-8"
          />
        </div>
        {activeStatus !== "all" ? (
          <input type="hidden" name="status" value={activeStatus} />
        ) : null}
        <Button size="sm" variant="outline" type="submit">
          검색
        </Button>
        <div className="ml-auto flex flex-wrap gap-1">
          {STATUS_FILTERS.map((s) => {
            const params = new URLSearchParams(searchParams);
            if (s.value === "all") params.delete("status");
            else params.set("status", s.value);
            return (
              <a
                key={s.value}
                href={`?${params.toString()}`}
                className={
                  "rounded-full border px-3 py-1 text-xs font-semibold transition-colors " +
                  (activeStatus === s.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:text-foreground")
                }
              >
                {s.label}
              </a>
            );
          })}
        </div>
      </Form>

      {/* 콘텐츠 목록 */}
      <IndexTable
        minWidth={1100}
        headers={[
          { label: "상태" },
          { label: "콘텐츠명" },
          { label: "콘텐츠 키" },
          { label: "강의그룹" },
          { label: "재생시간", align: "center" },
          { label: "연결 강의", align: "center" },
          { label: "관리", align: "right" },
        ]}
        footer={
          <div className="text-muted-foreground border-t px-3 py-2 text-xs">
            {contents.length}개 표시 · 전체 {total}개
          </div>
        }
      >
        {contents.length === 0 ? (
          <TR>
            <TD colSpan={7} soft>
              조건에 맞는 콘텐츠가 없습니다.
            </TD>
          </TR>
        ) : (
          contents.map((c) => (
            <TR key={c.contentId}>
              <TD>
                <div className="flex flex-wrap gap-1">
                  <Chip tone={encodingTone(c.encodingStatus)}>
                    {ENCODING_OPTIONS.find((e) => e.value === c.encodingStatus)
                      ?.label ?? c.encodingStatus}
                  </Chip>
                  {c.useStatus === "stopped" ? (
                    <Chip tone="coral">중지</Chip>
                  ) : null}
                  {!c.isActive ? <Chip tone="outline">비활성</Chip> : null}
                </div>
              </TD>
              <TD>
                <span className="font-medium">{c.title}</span>
                {c.originalFilename ? (
                  <span className="text-muted-foreground block text-[11px]">
                    {c.originalFilename}
                  </span>
                ) : null}
              </TD>
              <TD mono soft>
                {c.contentKey}
              </TD>
              <TD>
                <AssignGroup content={c} groups={groups} />
              </TD>
              <TD align="center">{fmtDuration(c.durationSeconds)}</TD>
              <TD align="center">
                {c.connections.length > 0 ? (
                  <span
                    title={c.connections.map((x) => x.label).join("\n")}
                    className="cursor-help font-semibold"
                  >
                    {c.connections.length}개
                  </span>
                ) : (
                  <span className="text-muted-foreground">0개</span>
                )}
              </TD>
              <TD align="right">
                <div className="flex justify-end gap-1">
                  <previewFetcher.Form method="post">
                    <input type="hidden" name="intent" value="preview" />
                    <input type="hidden" name="contentId" value={c.contentId} />
                    <Button
                      type="submit"
                      size="sm"
                      variant="ghost"
                      disabled={previewFetcher.state !== "idle"}
                    >
                      <PlayIcon className="size-3.5" /> 영상확인
                    </Button>
                  </previewFetcher.Form>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditContent(c)}
                  >
                    수정
                  </Button>
                </div>
              </TD>
            </TR>
          ))
        )}
      </IndexTable>

      <ContentEditorSheet
        target={editContent}
        groups={groups}
        onClose={() => setEditContent(null)}
      />
      <GroupEditorSheet
        target={editGroup}
        instructors={instructors}
        contentCount={
          editGroup && editGroup !== "new" ? groupCounts[editGroup.groupId] ?? 0 : 0
        }
        onClose={() => setEditGroup(null)}
      />

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              영상 확인 — {previewFetcher.data?.previewTitle ?? ""}
            </DialogTitle>
          </DialogHeader>
          {previewFetcher.data?.previewUrl ? (
            <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
              <iframe
                src={previewFetcher.data.previewUrl}
                title="콘텐츠 미리보기"
                className="h-full w-full border-0"
                allow="autoplay; fullscreen; encrypted-media; picture-in-picture; local-network-access; loopback-network"
                allowFullScreen
              />
            </div>
          ) : (
            <p className="text-muted-foreground py-8 text-center text-sm">
              콜러스 재생 키가 설정되지 않아 미리보기를 재생할 수 없습니다.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}

// 행 내 그룹 지정(빠른 이동) — onChange 자동 제출.
function AssignGroup({
  content,
  groups,
}: {
  content: VideoContentRow;
  groups: ContentGroupRow[];
}) {
  const fetcher = useFetcher();
  return (
    <fetcher.Form method="post">
      <input type="hidden" name="intent" value="assign_group" />
      <input type="hidden" name="contentId" value={content.contentId} />
      <select
        name="groupId"
        defaultValue={content.groupId ?? ""}
        onChange={(e) => fetcher.submit(e.currentTarget.form)}
        className="border-border bg-background h-8 w-full max-w-[220px] rounded-md border px-2 text-xs"
      >
        <option value="">미분류</option>
        {groups.map((g) => (
          <option key={g.groupId} value={g.groupId}>
            {g.name}
          </option>
        ))}
      </select>
    </fetcher.Form>
  );
}

function ContentEditorSheet({
  target,
  groups,
  onClose,
}: {
  target: VideoContentRow | "new" | null;
  groups: ContentGroupRow[];
  onClose: () => void;
}) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      if (fetcher.data.error) toast.error(fetcher.data.error);
      else if (fetcher.data.ok) {
        toast.success("저장했습니다.");
        onClose();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);

  const c = target === "new" ? null : target;
  const open = target !== null;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{c ? "콘텐츠 수정" : "콘텐츠 등록"}</SheetTitle>
        </SheetHeader>
        <fetcher.Form
          method="post"
          key={c?.contentId ?? "new"}
          className="mt-4 space-y-3 px-4 pb-6"
        >
          <input type="hidden" name="intent" value="save_content" />
          <input type="hidden" name="contentId" value={c?.contentId ?? ""} />
          <Field label="콘텐츠명" required>
            <Input name="title" required defaultValue={c?.title ?? ""} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="제공자">
              <select
                name="drmProvider"
                defaultValue={c?.drmProvider ?? "kollus"}
                className="border-border bg-background h-9 w-full rounded-md border px-2 text-sm"
              >
                <option value="kollus">kollus</option>
              </select>
            </Field>
            <Field label="콘텐츠 키(mckey)" required>
              <Input name="contentKey" required defaultValue={c?.contentKey ?? ""} />
            </Field>
          </div>
          <Field label="원본 파일명" hint="콜러스 동기화 시 자동 수집">
            <Input name="originalFilename" defaultValue={c?.originalFilename ?? ""} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="재생시간(초)" hint="동기화 시 자동">
              <Input
                name="durationSeconds"
                type="number"
                min={0}
                defaultValue={c?.durationSeconds ?? ""}
              />
            </Field>
            <Field label="인코딩 상태">
              <select
                name="encodingStatus"
                defaultValue={c?.encodingStatus ?? "available"}
                className="border-border bg-background h-9 w-full rounded-md border px-2 text-sm"
              >
                {ENCODING_OPTIONS.map((e) => (
                  <option key={e.value} value={e.value}>
                    {e.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="강의그룹">
            <select
              name="groupId"
              defaultValue={c?.groupId ?? ""}
              className="border-border bg-background h-9 w-full rounded-md border px-2 text-sm"
            >
              <option value="">미분류</option>
              {groups.map((g) => (
                <option key={g.groupId} value={g.groupId}>
                  {g.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="진도율 인정 기준">
              <select
                name="completionThreshold"
                defaultValue={String(c?.completionThreshold ?? 0.9)}
                className="border-border bg-background h-9 w-full rounded-md border px-2 text-sm"
              >
                <option value="0.9">90% 이상</option>
                <option value="0.95">95% 이상</option>
                <option value="0.8">80% 이상</option>
                <option value="1">100%</option>
              </select>
            </Field>
            <Field label="사용 상태">
              <select
                name="useStatus"
                defaultValue={c?.useStatus ?? "in_use"}
                className="border-border bg-background h-9 w-full rounded-md border px-2 text-sm"
              >
                <option value="in_use">사용</option>
                <option value="stopped">중지(재생 즉시 차단)</option>
              </select>
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={c?.isActive ?? true}
              className="size-4"
            />
            활성 (비활성 시 기존 수강 유지, 신규 강의 연결 불가)
          </label>
          <Field label="관리자 메모">
            <textarea
              name="adminMemo"
              defaultValue={c?.adminMemo ?? ""}
              rows={2}
              className="border-border bg-background w-full rounded-md border px-2 py-1.5 text-sm"
            />
          </Field>
          {c && c.connections.length > 0 ? (
            <div className="rounded-lg border px-3 py-2 text-xs">
              <div className="text-muted-foreground mb-1 font-semibold">
                연결된 회차 {c.connections.length}개
              </div>
              <ul className="space-y-0.5">
                {c.connections.map((x) => (
                  <li key={x.lessonId}>
                    · {x.label}
                    {!x.isActive ? " (교체됨)" : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              취소
            </Button>
            <Button type="submit" disabled={fetcher.state !== "idle"}>
              저장
            </Button>
          </div>
        </fetcher.Form>
      </SheetContent>
    </Sheet>
  );
}

function GroupEditorSheet({
  target,
  instructors,
  contentCount,
  onClose,
}: {
  target: ContentGroupRow | "new" | null;
  instructors: Array<{ profileId: string; name: string }>;
  contentCount: number;
  onClose: () => void;
}) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      if (fetcher.data.error) toast.error(fetcher.data.error);
      else if (fetcher.data.ok) {
        toast.success("저장했습니다.");
        onClose();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);

  const g = target === "new" ? null : target;
  const open = target !== null;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{g ? "강의그룹 수정" : "강의그룹 생성"}</SheetTitle>
        </SheetHeader>
        <fetcher.Form
          method="post"
          key={g?.groupId ?? "new"}
          className="mt-4 space-y-3 px-4 pb-6"
        >
          <input type="hidden" name="intent" value="save_group" />
          <input type="hidden" name="groupId" value={g?.groupId ?? ""} />
          <Field label="그룹명" required hint="예: 김인배 디자인보호법 기본강의 15판">
            <Input name="name" required defaultValue={g?.name ?? ""} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="연도">
              <Input name="year" type="number" defaultValue={g?.year ?? ""} />
            </Field>
            <Field label="과목">
              <select
                name="subjectCode"
                defaultValue={g?.subjectCode ?? ""}
                className="border-border bg-background h-9 w-full rounded-md border px-2 text-sm"
              >
                <option value="">선택</option>
                {SUBJECT_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="강사">
            <select
              name="instructorId"
              defaultValue={g?.instructorId ?? ""}
              className="border-border bg-background h-9 w-full rounded-md border px-2 text-sm"
            >
              <option value="">선택</option>
              {instructors.map((i) => (
                <option key={i.profileId} value={i.profileId}>
                  {i.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="시험구분">
              <Input name="examTrack" defaultValue={g?.examTrack ?? ""} placeholder="1차/2차" />
            </Field>
            <Field label="과정유형">
              <Input name="courseType" defaultValue={g?.courseType ?? ""} placeholder="기본이론 등" />
            </Field>
          </div>
          <Field label="교재명">
            <Input name="bookTitle" defaultValue={g?.bookTitle ?? ""} />
          </Field>
          <Field label="관리자 메모">
            <textarea
              name="staffMemo"
              defaultValue={g?.staffMemo ?? ""}
              rows={2}
              className="border-border bg-background w-full rounded-md border px-2 py-1.5 text-sm"
            />
          </Field>
          <div className="flex items-center justify-between pt-2">
            {g ? (
              <DeleteGroupButton groupId={g.groupId} contentCount={contentCount} />
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                취소
              </Button>
              <Button type="submit" disabled={fetcher.state !== "idle"}>
                저장
              </Button>
            </div>
          </div>
        </fetcher.Form>
      </SheetContent>
    </Sheet>
  );
}

function DeleteGroupButton({
  groupId,
  contentCount,
}: {
  groupId: string;
  contentCount: number;
}) {
  const fetcher = useFetcher<{ error?: string }>();
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.error)
      toast.error(fetcher.data.error);
  }, [fetcher.state, fetcher.data]);
  if (contentCount > 0) {
    return (
      <span className="text-muted-foreground text-xs">
        콘텐츠 {contentCount}개 연결 — 삭제 불가
      </span>
    );
  }
  return (
    <fetcher.Form
      method="post"
      onSubmit={(e) => {
        if (!confirm("이 강의그룹을 삭제할까요?")) e.preventDefault();
      }}
    >
      <input type="hidden" name="intent" value="delete_group" />
      <input type="hidden" name="groupId" value={groupId} />
      <Button type="submit" variant="ghost" className="text-rose-600">
        삭제
      </Button>
    </fetcher.Form>
  );
}
