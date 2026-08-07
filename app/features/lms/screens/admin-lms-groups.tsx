// feat-11-008 P5 — 강의그룹 목록: /admin/lms/groups.
// 라이브러리(원본 보관·검색)와 분리된 저작 공간 — 그룹 생성 후 상세에서 라이브러리 콘텐츠를
// 불러와 회차·순서를 구성하고 개설 강의(에디션)에 연결한다.
import { FolderIcon, PlusIcon } from "lucide-react";
import { Form, Link, data, redirect } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { roleAtLeast } from "~/core/lib/roles";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/admin-lms-groups";

export function meta() {
  return [{ title: "강의그룹 | 운영관리" }];
}

interface GroupRow {
  groupId: string;
  name: string;
  year: number | null;
  isActive: boolean;
  itemCount: number;
  totalSeconds: number;
  linkedCourseTitle: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const role = await getStaffRole(client, user.id);
  if (!role) throw redirect("/dashboard");

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";

  let query = adminClient
    .from("content_groups")
    .select("group_id, name, year, is_active, linked_course_id, created_at, updated_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (q) query = query.ilike("name", `%${q}%`);
  const { data: groups } = await query;
  const rows = groups ?? [];
  const groupIds = rows.map((g) => g.group_id);

  // 구성 콘텐츠 수·총 재생시간.
  const itemCount = new Map<string, number>();
  const totalSec = new Map<string, number>();
  if (groupIds.length) {
    const { data: items } = await adminClient
      .from("content_group_items")
      .select("group_id, content:video_contents(duration_seconds)")
      .in("group_id", groupIds);
    for (const it of items ?? []) {
      itemCount.set(it.group_id, (itemCount.get(it.group_id) ?? 0) + 1);
      const c = it.content as { duration_seconds: number | null } | null;
      totalSec.set(it.group_id, (totalSec.get(it.group_id) ?? 0) + (c?.duration_seconds ?? 0));
    }
  }
  // 연결 강의 제목.
  const courseIds = [...new Set(rows.map((g) => g.linked_course_id).filter(Boolean))] as string[];
  const courseTitle = new Map<string, string>();
  if (courseIds.length) {
    const { data: courses } = await adminClient
      .from("courses")
      .select("course_id, edition_label, series:course_series!courses_series_id_fkey(title)")
      .in("course_id", courseIds);
    for (const c of courses ?? []) {
      const s = c.series as { title: string } | null;
      courseTitle.set(c.course_id, `${s?.title ?? ""} ${c.edition_label}`.trim());
    }
  }

  const list: GroupRow[] = rows.map((g) => ({
    groupId: g.group_id,
    name: g.name,
    year: g.year,
    isActive: g.is_active,
    itemCount: itemCount.get(g.group_id) ?? 0,
    totalSeconds: totalSec.get(g.group_id) ?? 0,
    linkedCourseTitle: g.linked_course_id
      ? (courseTitle.get(g.linked_course_id) ?? null)
      : null,
    createdAt: g.created_at,
    updatedAt: g.updated_at,
  }));
  return { role, list, q };
}

export async function action({ request }: Route.ActionArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) return data({ error: "Forbidden" }, { status: 403 });

  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "");

  if (intent === "create") {
    const name = String(fd.get("name") ?? "").trim();
    const yearRaw = String(fd.get("year") ?? "").trim();
    if (!name) return data({ error: "그룹명을 입력해 주세요." }, { status: 400 });
    const { data: ins, error } = await adminClient
      .from("content_groups")
      .insert({
        name,
        year: yearRaw ? Math.trunc(Number(yearRaw)) : null,
        created_by: user.id,
      })
      .select("group_id")
      .single();
    if (error) return data({ error: error.message }, { status: 400 });
    return redirect(`/admin/lms/groups/${ins.group_id}`);
  }

  const groupId = String(fd.get("groupId") ?? "");
  if (!groupId) return data({ error: "대상이 없습니다." }, { status: 400 });

  if (intent === "toggle_active") {
    const { data: cur } = await adminClient
      .from("content_groups")
      .select("is_active")
      .eq("group_id", groupId)
      .single();
    const { error } = await adminClient
      .from("content_groups")
      .update({ is_active: !(cur?.is_active ?? true) })
      .eq("group_id", groupId);
    if (error) return data({ error: error.message }, { status: 400 });
    return redirect("/admin/lms/groups");
  }

  if (intent === "copy") {
    const { data: src } = await adminClient
      .from("content_groups")
      .select("name, year, subject_code, instructor_id, exam_track, course_type, book_title, staff_memo")
      .eq("group_id", groupId)
      .single();
    if (!src) return data({ error: "그룹이 없습니다." }, { status: 404 });
    const { data: ins, error } = await adminClient
      .from("content_groups")
      .insert({ ...src, name: `${src.name} (복사)`, created_by: user.id })
      .select("group_id")
      .single();
    if (error) return data({ error: error.message }, { status: 400 });
    const { data: items } = await adminClient
      .from("content_group_items")
      .select("content_id, seq, lesson_no, title, is_preview, is_public")
      .eq("group_id", groupId);
    if ((items ?? []).length) {
      await adminClient
        .from("content_group_items")
        .insert((items ?? []).map((it) => ({ ...it, group_id: ins.group_id })));
    }
    return redirect(`/admin/lms/groups/${ins.group_id}`);
  }

  if (intent === "delete") {
    if (!roleAtLeast(role, "admin"))
      return data({ error: "삭제는 최고관리자(원장)만 할 수 있습니다." }, { status: 403 });
    const { data: g } = await adminClient
      .from("content_groups")
      .select("linked_course_id")
      .eq("group_id", groupId)
      .single();
    if (g?.linked_course_id)
      return data(
        { error: "강의에 연결되어 사용 중인 그룹입니다. 연결 해제 후 삭제해 주세요." },
        { status: 400 },
      );
    // soft delete — 라이브러리 원본 콘텐츠는 보존(정션만 함께 정리).
    const { error } = await adminClient
      .from("content_groups")
      .update({ deleted_at: new Date().toISOString() })
      .eq("group_id", groupId);
    if (error) return data({ error: error.message }, { status: 400 });
    return redirect("/admin/lms/groups");
  }

  return data({ error: "bad intent" }, { status: 400 });
}

function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}

export default function AdminLmsGroups({ loaderData, actionData }: Route.ComponentProps) {
  const { role, list, q } = loaderData;
  return (
    <AdminShell
      cluster="lms"
      role={role}
      title="강의그룹"
      desc="라이브러리 콘텐츠를 불러와 회차·순서를 구성하고 개설 강의에 연결하는 저작 공간입니다. 원본 영상 관리는 라이브러리에서 합니다."
    >
      <div className="p-5 md:p-8">
        <div className="mb-4 flex flex-wrap items-end gap-2">
          <Form method="get" className="flex items-end gap-2">
            <Input name="q" defaultValue={q} placeholder="그룹명 검색" className="h-9 w-56 text-sm" />
            <Button type="submit" variant="outline" className="h-9">
              검색
            </Button>
          </Form>
          <Form method="post" className="ml-auto flex items-end gap-2">
            <input type="hidden" name="intent" value="create" />
            <Input name="name" required placeholder="새 그룹명" className="h-9 w-56 text-sm" />
            <Input name="year" type="number" placeholder="연도(선택)" className="h-9 w-28 text-sm" />
            <Button type="submit" className="h-9">
              <PlusIcon className="size-4" /> 그룹 등록
            </Button>
          </Form>
        </div>

        {actionData && "error" in actionData && actionData.error ? (
          <p className="text-destructive mb-2 text-xs">{actionData.error}</p>
        ) : null}

        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-muted/60">
              <tr>
                <th className="px-3 py-2 font-semibold">그룹명</th>
                <th className="px-3 py-2 font-semibold">연결 강의</th>
                <th className="px-3 py-2 font-semibold">콘텐츠</th>
                <th className="px-3 py-2 font-semibold">총 재생시간</th>
                <th className="px-3 py-2 font-semibold">사용</th>
                <th className="px-3 py-2 font-semibold">등록/수정</th>
                <th className="px-3 py-2 font-semibold">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {list.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-muted-foreground px-3 py-8 text-center">
                    강의그룹이 없습니다. 그룹을 등록한 뒤 라이브러리 콘텐츠를 불러오세요.
                  </td>
                </tr>
              ) : (
                list.map((g) => (
                  <tr key={g.groupId} className="hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <Link
                        to={`/admin/lms/groups/${g.groupId}`}
                        className="inline-flex items-center gap-1.5 font-medium hover:underline"
                      >
                        <FolderIcon className="text-muted-foreground size-3.5" />
                        {g.name}
                        {g.year ? (
                          <span className="text-muted-foreground text-xs">({g.year})</span>
                        ) : null}
                      </Link>
                    </td>
                    <td className="text-muted-foreground px-3 py-2 text-xs">
                      {g.linkedCourseTitle ?? "-"}
                    </td>
                    <td className="px-3 py-2 text-xs tabular-nums">{g.itemCount}개</td>
                    <td className="text-muted-foreground px-3 py-2 text-xs tabular-nums">
                      {fmtDuration(g.totalSeconds)}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {g.isActive ? (
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                          사용
                        </span>
                      ) : (
                        <span className="text-muted-foreground">중지</span>
                      )}
                    </td>
                    <td className="text-muted-foreground px-3 py-2 text-[11px] tabular-nums">
                      {g.createdAt.slice(0, 10)}
                      <br />
                      {g.updatedAt.slice(0, 10)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2 text-xs">
                        <Link
                          to={`/admin/lms/groups/${g.groupId}`}
                          className="text-link hover:underline"
                        >
                          콘텐츠 관리
                        </Link>
                        <Form method="post" className="inline">
                          <input type="hidden" name="intent" value="copy" />
                          <input type="hidden" name="groupId" value={g.groupId} />
                          <button type="submit" className="text-link hover:underline">
                            복사
                          </button>
                        </Form>
                        <Form method="post" className="inline">
                          <input type="hidden" name="intent" value="toggle_active" />
                          <input type="hidden" name="groupId" value={g.groupId} />
                          <button type="submit" className="text-link hover:underline">
                            {g.isActive ? "사용중지" : "사용"}
                          </button>
                        </Form>
                        {role === "admin" ? (
                          <Form
                            method="post"
                            className="inline"
                            onSubmit={(e) => {
                              if (
                                !window.confirm(
                                  `"${g.name}" 그룹을 삭제할까요? 라이브러리 원본 콘텐츠는 유지됩니다.`,
                                )
                              )
                                e.preventDefault();
                            }}
                          >
                            <input type="hidden" name="intent" value="delete" />
                            <input type="hidden" name="groupId" value={g.groupId} />
                            <button type="submit" className="text-destructive hover:underline">
                              삭제
                            </button>
                          </Form>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  );
}
