// feat-11-008 P3 — 강의 카테고리 관리: /admin/lecture-categories.
// course_categories 를 카탈로그·강의 분류의 SSOT 로 관리(상·하위 2단계, 사용 여부, 노출 순서,
// 연결 강의 수, 삭제 가드). 카탈로그 탭·강의 상품 폼이 이 테이블을 파생 소비한다.
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { Form, data, redirect } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/admin-lecture-categories";

export function meta() {
  return [{ title: "강의 카테고리 | 운영관리" }];
}

interface CategoryRow {
  categoryId: string;
  parentId: string | null;
  name: string;
  sortOrder: number;
  isActive: boolean;
  courseCount: number;
  planCount: number;
  childCount: number;
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const role = await getStaffRole(client, user.id);
  if (!role) throw redirect("/dashboard");

  const { data: cats } = await client
    .from("course_categories")
    .select("category_id, parent_id, name, sort_order, is_active")
    .order("sort_order", { ascending: true });
  const rows = cats ?? [];
  const ids = rows.map((c) => c.category_id);

  // 연결 수 — 강의(courses)·판매 상품(subscription_plans). 삭제 가드·목록 표시 공용.
  const courseCount = new Map<string, number>();
  const planCount = new Map<string, number>();
  if (ids.length > 0) {
    const [{ data: courses }, { data: plans }] = await Promise.all([
      client
        .from("courses")
        .select("category_id")
        .in("category_id", ids)
        .is("deleted_at", null),
      client.from("subscription_plans").select("category_id").in("category_id", ids),
    ]);
    for (const c of courses ?? [])
      if (c.category_id)
        courseCount.set(c.category_id, (courseCount.get(c.category_id) ?? 0) + 1);
    for (const p of plans ?? [])
      if (p.category_id)
        planCount.set(p.category_id, (planCount.get(p.category_id) ?? 0) + 1);
  }

  const categories: CategoryRow[] = rows.map((c) => ({
    categoryId: c.category_id,
    parentId: c.parent_id,
    name: c.name,
    sortOrder: c.sort_order,
    isActive: c.is_active,
    courseCount: courseCount.get(c.category_id) ?? 0,
    planCount: planCount.get(c.category_id) ?? 0,
    childCount: rows.filter((r) => r.parent_id === c.category_id).length,
  }));
  return { role, categories };
}

export async function action({ request }: Route.ActionArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });
  if (!(await getStaffRole(client, user.id)))
    return data({ error: "Forbidden" }, { status: 403 });

  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "");

  if (intent === "create") {
    const name = String(fd.get("name") ?? "").trim();
    const parentId = String(fd.get("parentId") ?? "").trim() || null;
    const sortOrder = Math.trunc(Number(fd.get("sortOrder") ?? 0)) || 0;
    if (!name) return data({ error: "카테고리명을 입력해 주세요." }, { status: 400 });
    const { error } = await client
      .from("course_categories")
      .insert({ name, parent_id: parentId, sort_order: sortOrder });
    if (error) return data({ error: error.message }, { status: 400 });
    return redirect("/admin/lecture-categories");
  }

  const categoryId = String(fd.get("categoryId") ?? "");
  if (!categoryId) return data({ error: "대상이 없습니다." }, { status: 400 });

  if (intent === "update") {
    const name = String(fd.get("name") ?? "").trim();
    const sortOrder = Math.trunc(Number(fd.get("sortOrder") ?? 0)) || 0;
    if (!name) return data({ error: "카테고리명을 입력해 주세요." }, { status: 400 });
    const { error } = await client
      .from("course_categories")
      .update({ name, sort_order: sortOrder })
      .eq("category_id", categoryId);
    if (error) return data({ error: error.message }, { status: 400 });
    return redirect("/admin/lecture-categories");
  }

  if (intent === "toggle_active") {
    const { data: cur } = await client
      .from("course_categories")
      .select("is_active")
      .eq("category_id", categoryId)
      .single();
    const { error } = await client
      .from("course_categories")
      .update({ is_active: !(cur?.is_active ?? true) })
      .eq("category_id", categoryId);
    if (error) return data({ error: error.message }, { status: 400 });
    return redirect("/admin/lecture-categories");
  }

  if (intent === "delete") {
    // 삭제 가드 — 하위 카테고리·연결 강의·연결 상품이 있으면 즉시 삭제 불가(이동/해제 안내).
    const [{ data: children }, { data: courses }, { data: plans }] =
      await Promise.all([
        client
          .from("course_categories")
          .select("category_id")
          .eq("parent_id", categoryId)
          .limit(1),
        client
          .from("courses")
          .select("course_id")
          .eq("category_id", categoryId)
          .is("deleted_at", null)
          .limit(1),
        client
          .from("subscription_plans")
          .select("plan_id")
          .eq("category_id", categoryId)
          .limit(1),
      ]);
    if ((children ?? []).length > 0)
      return data(
        { error: "하위 카테고리가 있어 삭제할 수 없습니다. 먼저 하위를 정리해 주세요." },
        { status: 400 },
      );
    if ((courses ?? []).length > 0 || (plans ?? []).length > 0)
      return data(
        {
          error:
            "연결된 강의·상품이 있어 삭제할 수 없습니다. 연결을 이동하거나 해제한 뒤 삭제하거나, 미사용으로 전환해 주세요.",
        },
        { status: 400 },
      );
    const { error } = await client
      .from("course_categories")
      .delete()
      .eq("category_id", categoryId);
    if (error) return data({ error: error.message }, { status: 400 });
    return redirect("/admin/lecture-categories");
  }

  return data({ error: "bad intent" }, { status: 400 });
}

function CategoryTr({ c, depth }: { c: CategoryRow; depth: number }) {
  const [editing, setEditing] = useState(false);
  return (
    <tr className="hover:bg-muted/30">
      <td className="px-3 py-2" style={{ paddingLeft: 12 + depth * 24 }}>
        {editing ? (
          <Form
            method="post"
            className="flex items-center gap-2"
            onSubmit={() => setEditing(false)}
          >
            <input type="hidden" name="intent" value="update" />
            <input type="hidden" name="categoryId" value={c.categoryId} />
            <Input name="name" defaultValue={c.name} className="h-8 w-44 text-sm" />
            <Input
              name="sortOrder"
              type="number"
              defaultValue={c.sortOrder}
              className="h-8 w-20 text-sm"
            />
            <Button type="submit" size="sm" variant="outline" className="h-8">
              저장
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8"
              onClick={() => setEditing(false)}
            >
              취소
            </Button>
          </Form>
        ) : (
          <span className={c.isActive ? "font-medium" : "text-muted-foreground"}>
            {depth > 0 ? "└ " : ""}
            {c.name}
          </span>
        )}
      </td>
      <td className="text-muted-foreground px-3 py-2 text-xs tabular-nums">
        {c.sortOrder}
      </td>
      <td className="px-3 py-2 text-xs">
        {c.isActive ? (
          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
            사용
          </span>
        ) : (
          <span className="text-muted-foreground">미사용</span>
        )}
      </td>
      <td className="text-muted-foreground px-3 py-2 text-xs tabular-nums">
        강의 {c.courseCount} · 상품 {c.planCount}
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-2 text-xs">
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="text-link hover:underline"
          >
            수정
          </button>
          <Form method="post" className="inline">
            <input type="hidden" name="intent" value="toggle_active" />
            <input type="hidden" name="categoryId" value={c.categoryId} />
            <button type="submit" className="text-link hover:underline">
              {c.isActive ? "미사용 전환" : "사용 전환"}
            </button>
          </Form>
          <Form
            method="post"
            className="inline"
            onSubmit={(e) => {
              if (!window.confirm(`"${c.name}" 카테고리를 삭제할까요?`))
                e.preventDefault();
            }}
          >
            <input type="hidden" name="intent" value="delete" />
            <input type="hidden" name="categoryId" value={c.categoryId} />
            <button type="submit" className="text-destructive hover:underline">
              삭제
            </button>
          </Form>
        </div>
      </td>
    </tr>
  );
}

export default function AdminLectureCategories({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { role, categories } = loaderData;
  const tops = categories.filter((c) => !c.parentId);
  return (
    <AdminShell
      cluster="lms"
      role={role}
      title="강의 카테고리"
      desc="강의 개설·수정과 수강신청 카테고리 탭에 공용으로 쓰이는 분류를 관리합니다. 미사용 카테고리는 새로 선택할 수 없고 탭에서 숨겨집니다."
    >
      <div className="mx-auto max-w-4xl p-5 md:p-8">
        <Form
          method="post"
          className="border-border mb-5 flex flex-wrap items-end gap-2 rounded-xl border p-4"
        >
          <input type="hidden" name="intent" value="create" />
          <div className="space-y-1">
            <p className="text-muted-foreground text-[11px] font-semibold">카테고리명</p>
            <Input name="name" required className="h-9 w-48 text-sm" placeholder="예: 기본이론 강의" />
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground text-[11px] font-semibold">상위 카테고리</p>
            <select
              name="parentId"
              className="border-border bg-background h-9 rounded-md border px-2 text-sm"
            >
              <option value="">(최상위)</option>
              {tops.map((t) => (
                <option key={t.categoryId} value={t.categoryId}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground text-[11px] font-semibold">노출 순서</p>
            <Input
              name="sortOrder"
              type="number"
              defaultValue={((tops.at(-1)?.sortOrder ?? 0) + 10).toString()}
              className="h-9 w-24 text-sm"
            />
          </div>
          <Button type="submit" className="h-9">
            <PlusIcon className="size-4" /> 추가
          </Button>
        </Form>

        {actionData && "error" in actionData && actionData.error ? (
          <p className="text-destructive mb-2 text-xs">{actionData.error}</p>
        ) : null}

        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-muted/60">
              <tr>
                <th className="px-3 py-2 font-semibold">카테고리</th>
                <th className="px-3 py-2 font-semibold">순서</th>
                <th className="px-3 py-2 font-semibold">사용</th>
                <th className="px-3 py-2 font-semibold">연결</th>
                <th className="px-3 py-2 font-semibold">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {tops.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-muted-foreground px-3 py-8 text-center">
                    카테고리가 없습니다.
                  </td>
                </tr>
              ) : (
                tops.flatMap((t) => [
                  <CategoryTr key={t.categoryId} c={t} depth={0} />,
                  ...categories
                    .filter((c) => c.parentId === t.categoryId)
                    .map((c) => <CategoryTr key={c.categoryId} c={c} depth={1} />),
                ])
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  );
}
