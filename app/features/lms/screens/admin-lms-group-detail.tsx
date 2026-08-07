// feat-11-008 P5 — 강의그룹 상세: /admin/lms/groups/:groupId.
// 라이브러리 콘텐츠 불러오기(검색→복수 선택→일괄 추가·중복 경고), 회차 번호/제목/공개/미리보기
// 편집, 순서 이동, 제거(원본 보존), 개설 강의(에디션) 연결 + 회차 가져오기(1회성 생성).
// 이후 회차 운영 편집은 기존 강의 콘텐츠(에디션 상세) 단일 경로 — 뮤테이션 이원화 금지.
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { useState } from "react";
import { Form, Link, data, redirect, useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/admin-lms-group-detail";

export function meta() {
  return [{ title: "강의그룹 구성 | 운영관리" }];
}

interface GroupItem {
  itemId: string;
  contentId: string;
  seq: number;
  lessonNo: number | null;
  title: string;
  contentTitle: string;
  durationSeconds: number;
  encodingStatus: string;
  isPreview: boolean;
  isPublic: boolean;
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const role = await getStaffRole(client, user.id);
  if (!role) throw redirect("/dashboard");

  const groupId = params.groupId ?? "";
  const { data: g } = await adminClient
    .from("content_groups")
    .select("group_id, name, year, is_active, linked_course_id")
    .eq("group_id", groupId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!g) throw redirect("/admin/lms/groups");

  const { data: itemRows } = await adminClient
    .from("content_group_items")
    .select(
      "item_id, content_id, seq, lesson_no, title, is_preview, is_public, content:video_contents(title, duration_seconds, encoding_status)",
    )
    .eq("group_id", groupId)
    .order("seq", { ascending: true });
  const items: GroupItem[] = (itemRows ?? []).map((r) => {
    const c = r.content as {
      title: string;
      duration_seconds: number | null;
      encoding_status: string | null;
    } | null;
    return {
      itemId: r.item_id,
      contentId: r.content_id,
      seq: r.seq,
      lessonNo: r.lesson_no,
      title: r.title ?? c?.title ?? "",
      contentTitle: c?.title ?? "",
      durationSeconds: c?.duration_seconds ?? 0,
      encodingStatus: c?.encoding_status ?? "-",
      isPreview: r.is_preview,
      isPublic: r.is_public,
    };
  });

  // 개설 강의(에디션) 선택지 + 연결된 강의 제목.
  const { data: courses } = await adminClient
    .from("courses")
    .select("course_id, edition_label, series:course_series!courses_series_id_fkey(title)")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200);
  const editions = (courses ?? []).map((c) => {
    const s = c.series as { title: string } | null;
    return {
      courseId: c.course_id,
      title: `${s?.title ?? ""} ${c.edition_label}`.trim(),
    };
  });

  return {
    role,
    group: {
      groupId: g.group_id,
      name: g.name,
      year: g.year,
      isActive: g.is_active,
      linkedCourseId: g.linked_course_id,
    },
    items,
    editions,
    totalSeconds: items.reduce((a, b) => a + b.durationSeconds, 0),
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });
  if (!(await getStaffRole(client, user.id)))
    return data({ error: "Forbidden" }, { status: 403 });
  const groupId = params.groupId ?? "";
  if (!groupId) return data({ error: "그룹이 없습니다." }, { status: 400 });

  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "");

  // 라이브러리 검색(불러오기 선택창) — 사용가능 콘텐츠 + 타 그룹 연결 수 표시.
  if (intent === "search_library") {
    const q = String(fd.get("q") ?? "").trim();
    let query = adminClient
      .from("video_contents")
      .select("content_id, title, content_key, duration_seconds, encoding_status")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(30);
    if (q) query = query.or(`title.ilike.%${q}%,content_key.ilike.%${q}%`);
    const { data: contents } = await query;
    const ids = (contents ?? []).map((c) => c.content_id);
    const linkCount = new Map<string, number>();
    const inThisGroup = new Set<string>();
    if (ids.length) {
      const { data: links } = await adminClient
        .from("content_group_items")
        .select("content_id, group_id")
        .in("content_id", ids);
      for (const l of links ?? []) {
        linkCount.set(l.content_id, (linkCount.get(l.content_id) ?? 0) + 1);
        if (l.group_id === groupId) inThisGroup.add(l.content_id);
      }
    }
    return data({
      library: (contents ?? []).map((c) => ({
        contentId: c.content_id,
        title: c.title,
        contentKey: c.content_key,
        durationSeconds: c.duration_seconds ?? 0,
        encodingStatus: c.encoding_status ?? "-",
        groupLinks: linkCount.get(c.content_id) ?? 0,
        alreadyInGroup: inThisGroup.has(c.content_id),
      })),
    });
  }

  if (intent === "add_contents") {
    const contentIds = fd.getAll("contentIds").map(String).filter(Boolean);
    if (contentIds.length === 0)
      return data({ error: "추가할 콘텐츠를 선택해 주세요." }, { status: 400 });
    const { data: maxRow } = await adminClient
      .from("content_group_items")
      .select("seq")
      .eq("group_id", groupId)
      .order("seq", { ascending: false })
      .limit(1);
    let seq = (maxRow?.[0]?.seq ?? 0) + 1;
    let added = 0;
    let dup = 0;
    for (const contentId of contentIds) {
      const { error } = await adminClient
        .from("content_group_items")
        .insert({ group_id: groupId, content_id: contentId, seq: seq });
      if (error) {
        if (error.code === "23505") dup++;
        else return data({ error: error.message }, { status: 400 });
      } else {
        added++;
        seq++;
      }
    }
    return data({ added: { count: added, dup } });
  }

  if (intent === "update_item") {
    const itemId = String(fd.get("itemId") ?? "");
    const lessonNoRaw = String(fd.get("lessonNo") ?? "").trim();
    const title = String(fd.get("title") ?? "").trim();
    const { error } = await adminClient
      .from("content_group_items")
      .update({
        lesson_no: lessonNoRaw ? Math.trunc(Number(lessonNoRaw)) : null,
        title: title || null,
        is_preview: fd.get("isPreview") === "on",
        is_public: fd.get("isPublic") === "on",
      })
      .eq("item_id", itemId)
      .eq("group_id", groupId);
    if (error) return data({ error: error.message }, { status: 400 });
    return redirect(`/admin/lms/groups/${groupId}`);
  }

  if (intent === "move_item") {
    const itemId = String(fd.get("itemId") ?? "");
    const dir = String(fd.get("dir") ?? "up");
    const { data: items } = await adminClient
      .from("content_group_items")
      .select("item_id, seq")
      .eq("group_id", groupId)
      .order("seq", { ascending: true });
    const list = items ?? [];
    const idx = list.findIndex((i) => i.item_id === itemId);
    const swap = dir === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || swap < 0 || swap >= list.length)
      return redirect(`/admin/lms/groups/${groupId}`);
    await Promise.all([
      adminClient
        .from("content_group_items")
        .update({ seq: list[swap].seq })
        .eq("item_id", list[idx].item_id),
      adminClient
        .from("content_group_items")
        .update({ seq: list[idx].seq })
        .eq("item_id", list[swap].item_id),
    ]);
    return redirect(`/admin/lms/groups/${groupId}`);
  }

  if (intent === "remove_item") {
    const itemId = String(fd.get("itemId") ?? "");
    // 그룹에서 제거만 — 라이브러리 원본 콘텐츠는 유지(요청서).
    const { error } = await adminClient
      .from("content_group_items")
      .delete()
      .eq("item_id", itemId)
      .eq("group_id", groupId);
    if (error) return data({ error: error.message }, { status: 400 });
    return redirect(`/admin/lms/groups/${groupId}`);
  }

  if (intent === "link_course") {
    const courseId = String(fd.get("courseId") ?? "").trim() || null;
    const { error } = await adminClient
      .from("content_groups")
      .update({ linked_course_id: courseId })
      .eq("group_id", groupId);
    if (error) return data({ error: error.message }, { status: 400 });
    return redirect(`/admin/lms/groups/${groupId}`);
  }

  // 개설 강의로 회차 가져오기 — 그룹 구성 기준으로 course_lessons+lesson_videos 를 생성(1회성).
  // 이후 회차의 운영 편집(공개·영상 교체 등)은 에디션 상세 단일 경로.
  if (intent === "import_lessons") {
    const { data: g } = await adminClient
      .from("content_groups")
      .select("linked_course_id")
      .eq("group_id", groupId)
      .single();
    const courseId = g?.linked_course_id;
    if (!courseId)
      return data({ error: "먼저 개설 강의를 연결해 주세요." }, { status: 400 });
    const { data: items } = await adminClient
      .from("content_group_items")
      .select(
        "content_id, seq, lesson_no, title, is_preview, is_public, content:video_contents(title, duration_seconds, drm_provider, content_key)",
      )
      .eq("group_id", groupId)
      .order("seq", { ascending: true });
    if (!(items ?? []).length)
      return data({ error: "가져올 콘텐츠가 없습니다." }, { status: 400 });
    // 기존 회차와 겹치지 않게 마지막 회차 번호 뒤에 이어붙인다(재실행 안전).
    const { data: lastLesson } = await adminClient
      .from("course_lessons")
      .select("lesson_no")
      .eq("course_id", courseId)
      .is("deleted_at", null)
      .order("lesson_no", { ascending: false })
      .limit(1);
    let no = lastLesson?.[0]?.lesson_no ?? 0;
    let created = 0;
    for (const it of items ?? []) {
      const c = it.content as {
        title: string;
        duration_seconds: number | null;
        drm_provider: string;
        content_key: string;
      } | null;
      no = it.lesson_no && it.lesson_no > no ? it.lesson_no : no + 1;
      const { data: lesson, error: le } = await adminClient
        .from("course_lessons")
        .insert({
          course_id: courseId,
          lesson_no: no,
          title: it.title ?? c?.title ?? `${no}강`,
          sort_order: no,
          is_preview: it.is_preview,
          is_published: it.is_public,
        })
        .select("lesson_id")
        .single();
      if (le) return data({ error: le.message }, { status: 400 });
      const { error: ve } = await adminClient.from("lesson_videos").insert({
        lesson_id: lesson.lesson_id,
        drm_provider: c?.drm_provider ?? "kollus",
        drm_video_id: c?.content_key ?? "",
        duration_seconds: c?.duration_seconds ?? 0,
        content_id: it.content_id,
        is_active: true,
        created_by: user.id,
      });
      if (ve) return data({ error: ve.message }, { status: 400 });
      created++;
    }
    return data({ imported: { count: created } });
  }

  return data({ error: "bad intent" }, { status: 400 });
}

function fmtDur(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function AdminLmsGroupDetail({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { role, group, items, editions, totalSeconds } = loaderData;
  const searchFetcher = useFetcher<typeof action>();
  const addFetcher = useFetcher<typeof action>();
  const [selected, setSelected] = useState<string[]>([]);
  const library =
    searchFetcher.data && "library" in searchFetcher.data
      ? searchFetcher.data.library
      : null;
  const added =
    addFetcher.data && "added" in addFetcher.data ? addFetcher.data.added : null;
  const imported =
    actionData && "imported" in actionData ? actionData.imported : null;

  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  const submitAdd = () => {
    const dup = (library ?? []).filter(
      (c) => selected.includes(c.contentId) && c.alreadyInGroup,
    );
    if (
      dup.length > 0 &&
      !window.confirm(
        `이미 이 그룹에 있는 콘텐츠 ${dup.length}개가 포함되어 있습니다(중복은 건너뜁니다). 계속할까요?`,
      )
    )
      return;
    const fd = new FormData();
    fd.set("intent", "add_contents");
    for (const id of selected) fd.append("contentIds", id);
    addFetcher.submit(fd, { method: "post" });
    setSelected([]);
  };

  return (
    <AdminShell
      cluster="lms"
      role={role}
      title={`강의그룹 — ${group.name}`}
      desc="라이브러리 콘텐츠를 불러와 회차와 순서를 구성하고, 개설 강의에 연결해 회차를 생성합니다."
    >
      <div className="mx-auto max-w-5xl space-y-6 p-5 md:p-8">
        <Link to="/admin/lms/groups" className="text-muted-foreground text-[13px] hover:underline">
          ← 강의그룹 목록
        </Link>

        {/* 개설 강의 연결 + 가져오기 */}
        <div className="border-border flex flex-wrap items-end gap-2 rounded-xl border p-4">
          <Form method="post" className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="intent" value="link_course" />
            <div className="space-y-1">
              <p className="text-muted-foreground text-[11px] font-semibold">개설 강의 연결</p>
              <select
                name="courseId"
                defaultValue={group.linkedCourseId ?? ""}
                className="border-border bg-background h-9 min-w-64 rounded-md border px-2 text-sm"
              >
                <option value="">(연결 안 함)</option>
                {editions.map((e) => (
                  <option key={e.courseId} value={e.courseId}>
                    {e.title}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" variant="outline" className="h-9">
              연결 저장
            </Button>
          </Form>
          <Form
            method="post"
            onSubmit={(e) => {
              if (
                !window.confirm(
                  "그룹 구성을 연결된 개설 강의의 회차로 가져올까요? 기존 회차 뒤에 이어서 생성되며, 생성 후 회차 편집은 강의 콘텐츠 화면에서 합니다.",
                )
              )
                e.preventDefault();
            }}
          >
            <input type="hidden" name="intent" value="import_lessons" />
            <Button type="submit" className="h-9" disabled={!group.linkedCourseId}>
              회차 가져오기
            </Button>
          </Form>
          <p className="text-muted-foreground ml-auto text-xs">
            콘텐츠 {items.length}개 · 총 {Math.round(totalSeconds / 60)}분
          </p>
        </div>

        {imported ? (
          <p className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">
            회차 {imported.count}개를 생성했습니다. 이후 편집은 강의 콘텐츠 화면에서 하세요.
          </p>
        ) : null}
        {actionData && "error" in actionData && actionData.error ? (
          <p className="text-destructive text-xs">{actionData.error}</p>
        ) : null}

        {/* 그룹 구성 목록 */}
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-muted/60">
              <tr>
                <th className="px-2 py-2 font-semibold">순서</th>
                <th className="px-2 py-2 font-semibold">회차</th>
                <th className="px-2 py-2 font-semibold">제목(회차명)</th>
                <th className="px-2 py-2 font-semibold">원본 콘텐츠</th>
                <th className="px-2 py-2 font-semibold">재생</th>
                <th className="px-2 py-2 font-semibold">공개/미리보기</th>
                <th className="px-2 py-2 font-semibold">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-muted-foreground px-3 py-8 text-center">
                    구성된 콘텐츠가 없습니다. 아래에서 라이브러리 콘텐츠를 불러오세요.
                  </td>
                </tr>
              ) : (
                items.map((it, idx) => (
                  <tr key={it.itemId} className="hover:bg-muted/30 align-top">
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground w-6 text-xs tabular-nums">
                          {idx + 1}
                        </span>
                        <Form method="post" className="inline">
                          <input type="hidden" name="intent" value="move_item" />
                          <input type="hidden" name="itemId" value={it.itemId} />
                          <input type="hidden" name="dir" value="up" />
                          <button type="submit" className="text-muted-foreground hover:text-foreground">
                            <ArrowUpIcon className="size-3.5" />
                          </button>
                        </Form>
                        <Form method="post" className="inline">
                          <input type="hidden" name="intent" value="move_item" />
                          <input type="hidden" name="itemId" value={it.itemId} />
                          <input type="hidden" name="dir" value="down" />
                          <button type="submit" className="text-muted-foreground hover:text-foreground">
                            <ArrowDownIcon className="size-3.5" />
                          </button>
                        </Form>
                      </div>
                    </td>
                    <td className="px-2 py-2" colSpan={2}>
                      <Form method="post" className="flex flex-wrap items-center gap-1.5">
                        <input type="hidden" name="intent" value="update_item" />
                        <input type="hidden" name="itemId" value={it.itemId} />
                        <Input
                          name="lessonNo"
                          type="number"
                          defaultValue={it.lessonNo ?? ""}
                          placeholder="회차"
                          className="h-8 w-16 text-xs"
                        />
                        <Input
                          name="title"
                          defaultValue={it.title}
                          className="h-8 w-56 text-xs"
                        />
                        <label className="flex items-center gap-1 text-[11px]">
                          <input type="checkbox" name="isPublic" defaultChecked={it.isPublic} />
                          공개
                        </label>
                        <label className="flex items-center gap-1 text-[11px]">
                          <input type="checkbox" name="isPreview" defaultChecked={it.isPreview} />
                          미리보기
                        </label>
                        <Button type="submit" size="sm" variant="outline" className="h-7 text-[11px]">
                          저장
                        </Button>
                      </Form>
                    </td>
                    <td className="text-muted-foreground px-2 py-2 text-xs">
                      {it.contentTitle}
                      <span className="ml-1 text-[10px]">({it.encodingStatus})</span>
                    </td>
                    <td className="text-muted-foreground px-2 py-2 text-xs tabular-nums">
                      {fmtDur(it.durationSeconds)}
                    </td>
                    <td className="text-muted-foreground px-2 py-2 text-[11px]">
                      {it.isPublic ? "공개" : "비공개"}
                      {it.isPreview ? " · 미리보기" : ""}
                    </td>
                    <td className="px-2 py-2">
                      <Form
                        method="post"
                        onSubmit={(e) => {
                          if (!window.confirm("그룹에서 제거할까요? 라이브러리 원본은 유지됩니다."))
                            e.preventDefault();
                        }}
                      >
                        <input type="hidden" name="intent" value="remove_item" />
                        <input type="hidden" name="itemId" value={it.itemId} />
                        <button type="submit" className="text-destructive text-xs hover:underline">
                          제거
                        </button>
                      </Form>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 라이브러리 불러오기 */}
        <div className="border-border rounded-xl border p-4">
          <h2 className="text-sm font-bold">라이브러리에서 콘텐츠 불러오기</h2>
          <searchFetcher.Form method="post" className="mt-2 flex gap-2">
            <input type="hidden" name="intent" value="search_library" />
            <Input
              name="q"
              placeholder="콘텐츠명 · 미디어 콘텐츠키 검색"
              className="h-9 max-w-sm text-sm"
            />
            <Button type="submit" variant="outline" className="h-9">
              {searchFetcher.state !== "idle" ? "검색 중…" : "검색"}
            </Button>
          </searchFetcher.Form>

          {library ? (
            library.length === 0 ? (
              <p className="text-muted-foreground mt-2 text-xs">검색 결과가 없습니다.</p>
            ) : (
              <>
                <div className="mt-2 overflow-x-auto rounded-lg border">
                  <table className="w-full text-left text-[12px]">
                    <thead className="bg-muted/60">
                      <tr>
                        <th className="w-8 px-2 py-1.5" />
                        <th className="px-2 py-1.5 font-semibold">콘텐츠명</th>
                        <th className="px-2 py-1.5 font-semibold">콘텐츠키</th>
                        <th className="px-2 py-1.5 font-semibold">재생</th>
                        <th className="px-2 py-1.5 font-semibold">인코딩</th>
                        <th className="px-2 py-1.5 font-semibold">그룹 연결</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {library.map((c) => (
                        <tr key={c.contentId} className="hover:bg-muted/30">
                          <td className="px-2 py-1.5">
                            <input
                              type="checkbox"
                              checked={selected.includes(c.contentId)}
                              onChange={() => toggle(c.contentId)}
                              aria-label={`${c.title} 선택`}
                            />
                          </td>
                          <td className="px-2 py-1.5">{c.title}</td>
                          <td className="text-muted-foreground px-2 py-1.5 font-mono text-[10px]">
                            {c.contentKey}
                          </td>
                          <td className="text-muted-foreground px-2 py-1.5 tabular-nums">
                            {fmtDur(c.durationSeconds)}
                          </td>
                          <td className="text-muted-foreground px-2 py-1.5">{c.encodingStatus}</td>
                          <td className="px-2 py-1.5">
                            {c.alreadyInGroup ? (
                              <span className="text-amber-600 dark:text-amber-400 font-semibold">
                                이 그룹에 있음
                              </span>
                            ) : c.groupLinks > 0 ? (
                              <span className="text-muted-foreground">{c.groupLinks}개 그룹</span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Button
                    type="button"
                    className="h-9"
                    disabled={selected.length === 0 || addFetcher.state !== "idle"}
                    onClick={submitAdd}
                  >
                    선택 콘텐츠 추가 ({selected.length}개)
                  </Button>
                  {added ? (
                    <span className="text-muted-foreground text-xs">
                      추가 {added.count}개
                      {added.dup > 0 ? ` · 중복 건너뜀 ${added.dup}개` : ""}
                    </span>
                  ) : null}
                </div>
              </>
            )
          ) : null}
        </div>
      </div>
    </AdminShell>
  );
}
