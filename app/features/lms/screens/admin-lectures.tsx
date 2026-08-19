// feat-11-008 P4 — 강의개설 통합 목록: /admin/lectures.
// 판매 상품(subscription_plans course·tpass) 기준으로 연결 강의·카테고리를 병합해
// 검색·필터·정렬·페이징으로 관리한다(260807 요청서). 등록·수정 폼은 기존 상품 관리
// (/admin/pricing)·목차는 강의 콘텐츠(/admin/lms/courses/:id)를 재사용 — 뮤테이션 경로 단일 유지.
import { PlusIcon } from "lucide-react";
import { Form, Link, data, redirect, useSearchParams } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { roleAtLeast } from "~/core/lib/roles";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { getStaffRole } from "~/features/laws/queries.server";
import { listLectureCategoryOptions } from "~/features/lms/queries.server";

import type { Route } from "./+types/admin-lectures";

export function meta() {
  return [{ title: "강의개설 | 운영관리" }];
}

const SALE_LABEL: Record<string, string> = {
  scheduled: "판매 예정",
  on_sale: "판매중",
  paused: "판매중지",
  ended: "판매 종료",
  hidden: "비노출",
};
const PAGE_SIZES = [20, 50, 100] as const;

interface LectureRow {
  planId: string;
  code: string;
  name: string;
  priceKrw: number;
  listPriceKrw: number | null; // 정상가 — 판매가보다 크면 취소선+할인율 표시
  productKind: string;
  saleStatus: string;
  isActive: boolean;
  availableFrom: string | null;
  createdAt: string;
  updatedAt: string;
  categoryName: string | null;
  courseTitles: string[];
  instructorNames: string[];
  firstCourseId: string | null;
  thumbnailUrl: string | null;
  enrollCount: number;
  orderCount: number;
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
  const cat = url.searchParams.get("cat") ?? "";
  const kind = url.searchParams.get("kind") ?? "";
  const sale = url.searchParams.get("sale") ?? "";
  const sort = url.searchParams.get("sort") ?? "created";
  const size = PAGE_SIZES.includes(Number(url.searchParams.get("size")) as 20)
    ? Number(url.searchParams.get("size"))
    : 20;
  const page = Math.max(1, Math.trunc(Number(url.searchParams.get("page")) || 1));

  let query = adminClient
    .from("subscription_plans")
    .select(
      "plan_id, code, name, price_krw, list_price_krw, product_kind, sale_status, is_active, available_from, created_at, updated_at, category_id",
      { count: "exact" },
    )
    .in("product_kind", ["course", "tpass"]);
  if (q) query = query.or(`name.ilike.%${q}%,code.ilike.%${q}%`);
  if (cat) query = query.eq("category_id", cat);
  if (kind) query = query.eq("product_kind", kind);
  if (sale) query = query.eq("sale_status", sale);
  if (sort === "updated") query = query.order("updated_at", { ascending: false });
  else if (sort === "name") query = query.order("name", { ascending: true });
  else if (sort === "code") query = query.order("code", { ascending: true });
  else if (sort === "available")
    query = query.order("available_from", { ascending: false, nullsFirst: false });
  else if (sort === "order") query = query.order("display_order", { ascending: true });
  else query = query.order("created_at", { ascending: false });
  // ★range 페이징 — 유일 정렬키 타이브레이커 필수(중복 방지).
  query = query.order("plan_id", { ascending: true });
  const from = (page - 1) * size;
  const { data: plans, count, error } = await query.range(from, from + size - 1);
  if (error) throw error;
  const rows = plans ?? [];
  const planIds = rows.map((p) => p.plan_id);

  // 병합 데이터 — 카테고리명·연결 강의(제목·썸네일)·수강생·주문 수(삭제 가드 표시용).
  const catIds = [...new Set(rows.map((p) => p.category_id).filter(Boolean))] as string[];
  const [cats, links, enrolls, orderItems, categoryOptions] = await Promise.all([
    catIds.length
      ? adminClient
          .from("course_categories")
          .select("category_id, name")
          .in("category_id", catIds)
          .then((r) => r.data ?? [])
      : Promise.resolve([]),
    planIds.length
      ? adminClient
          .from("plan_courses")
          .select("plan_id, course_id")
          .in("plan_id", planIds)
          .then((r) => r.data ?? [])
      : Promise.resolve([]),
    planIds.length
      ? adminClient
          .from("enrollments")
          .select("plan_id")
          .in("plan_id", planIds)
          .then((r) => r.data ?? [])
      : Promise.resolve([]),
    planIds.length
      ? adminClient
          .from("order_items")
          .select("plan_id")
          .in("plan_id", planIds)
          .then((r) => r.data ?? [])
      : Promise.resolve([]),
    listLectureCategoryOptions(client),
  ]);
  const catName = new Map(cats.map((c) => [c.category_id, c.name]));
  const courseIds = [...new Set(links.map((l) => l.course_id))];
  // 강의별 강사명 — 목록의 '강사' 열(요청서: 강사명 표시). 데이터 없으면 빈 배열.
  const instructorsByCourse = new Map<string, string[]>();
  if (courseIds.length) {
    const { data: ins } = await adminClient
      .from("course_instructors")
      .select(
        "course_id, sort_order, profiles!course_instructors_instructor_id_fkey(name)",
      )
      .in("course_id", courseIds)
      .order("sort_order", { ascending: true });
    for (const r of ins ?? []) {
      const name = (r.profiles as { name: string } | null)?.name;
      if (!name) continue;
      instructorsByCourse.set(r.course_id, [
        ...(instructorsByCourse.get(r.course_id) ?? []),
        name,
      ]);
    }
  }
  const courseMeta = new Map<string, { title: string; thumbnail: string | null }>();
  if (courseIds.length) {
    const { data: courses } = await adminClient
      .from("courses")
      .select(
        "course_id, edition_label, thumbnail_path, series:course_series!courses_series_id_fkey(title)",
      )
      .in("course_id", courseIds)
      .is("deleted_at", null);
    for (const c of courses ?? []) {
      const series = c.series as { title: string } | null;
      courseMeta.set(c.course_id, {
        title: `${series?.title ?? ""} ${c.edition_label}`.trim(),
        thumbnail: c.thumbnail_path
          ? adminClient.storage.from("course-assets").getPublicUrl(c.thumbnail_path)
              .data.publicUrl
          : null,
      });
    }
  }
  const enrollCount = new Map<string, number>();
  for (const e of enrolls)
    if (e.plan_id) enrollCount.set(e.plan_id, (enrollCount.get(e.plan_id) ?? 0) + 1);
  const orderCount = new Map<string, number>();
  for (const o of orderItems)
    if (o.plan_id) orderCount.set(o.plan_id, (orderCount.get(o.plan_id) ?? 0) + 1);

  const lectures: LectureRow[] = rows.map((p) => {
    const linked = links.filter((l) => l.plan_id === p.plan_id);
    const titles = linked
      .map((l) => courseMeta.get(l.course_id)?.title)
      .filter((t): t is string => Boolean(t));
    const thumb =
      linked.map((l) => courseMeta.get(l.course_id)?.thumbnail).find(Boolean) ?? null;
    return {
      planId: p.plan_id,
      code: p.code,
      name: p.name,
      priceKrw: p.price_krw,
      listPriceKrw: p.list_price_krw,
      productKind: p.product_kind,
      saleStatus: p.sale_status,
      isActive: p.is_active,
      availableFrom: p.available_from,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
      categoryName: p.category_id ? (catName.get(p.category_id) ?? null) : null,
      courseTitles: titles,
      instructorNames: [
        ...new Set(linked.flatMap((l) => instructorsByCourse.get(l.course_id) ?? [])),
      ],
      firstCourseId: linked[0]?.course_id ?? null,
      thumbnailUrl: thumb,
      enrollCount: enrollCount.get(p.plan_id) ?? 0,
      orderCount: orderCount.get(p.plan_id) ?? 0,
    };
  });

  return {
    role,
    lectures,
    total: count ?? lectures.length,
    page,
    size,
    q,
    cat,
    kind,
    sale,
    sort,
    categoryOptions,
  };
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
  const planId = String(fd.get("planId") ?? "");
  if (intent !== "delete" || !planId)
    return data({ error: "bad intent" }, { status: 400 });

  // 삭제 — 최고관리자(원장) 전용 + 수강생·주문 이력 존재 시 차단(260807 요청서).
  if (!roleAtLeast(role, "admin"))
    return data(
      { error: "삭제는 최고관리자(원장)만 할 수 있습니다. 비노출·판매중지로 전환해 주세요." },
      { status: 403 },
    );
  const [{ data: enrolls }, { data: items }] = await Promise.all([
    adminClient.from("enrollments").select("enrollment_id").eq("plan_id", planId).limit(1),
    adminClient.from("order_items").select("order_item_id").eq("plan_id", planId).limit(1),
  ]);
  if ((enrolls ?? []).length > 0)
    return data({ error: "수강생이 있는 강의는 삭제할 수 없습니다." }, { status: 400 });
  if ((items ?? []).length > 0)
    return data(
      { error: "주문·결제 이력이 있는 강의는 삭제할 수 없습니다." },
      { status: 400 },
    );
  // subscription_plans 는 soft-delete 컬럼이 없어 판매 이력 없는 상품만 하드 삭제.
  const { error } = await adminClient
    .from("subscription_plans")
    .delete()
    .eq("plan_id", planId);
  if (error) return data({ error: error.message }, { status: 400 });
  return redirect("/admin/lectures");
}

export default function AdminLectures({ loaderData, actionData }: Route.ComponentProps) {
  const {
    role,
    lectures,
    total,
    page,
    size,
    q,
    cat,
    kind,
    sale,
    sort,
    categoryOptions,
  } = loaderData;
  const [searchParams] = useSearchParams();
  const totalPages = Math.max(1, Math.ceil(total / size));
  const pageHref = (p: number) => {
    const next = new URLSearchParams(searchParams);
    next.set("page", String(p));
    return `?${next.toString()}`;
  };
  return (
    <AdminShell
      cluster="lms"
      role={role}
      title="강의개설"
      desc="판매 강의를 검색·관리합니다. 신규 강의는 '강의등록'으로 개설하고, 목록에서 수정·목차·수강생 관리로 이동합니다."
    >
      <div className="p-5 md:p-8">
        <div className="mb-4 flex flex-wrap items-end gap-2">
          <Form method="get" className="flex flex-wrap items-end gap-2">
            <Input
              name="q"
              defaultValue={q}
              placeholder="강의명 · 강의 UID 검색"
              className="h-9 w-52 text-sm"
            />
            <select
              name="cat"
              defaultValue={cat}
              className="border-border bg-background h-9 rounded-md border px-2 text-sm"
            >
              <option value="">카테고리 전체</option>
              {categoryOptions.map((c) => (
                <option key={c.categoryId} value={c.categoryId}>
                  {c.label}
                </option>
              ))}
            </select>
            <select
              name="kind"
              defaultValue={kind}
              className="border-border bg-background h-9 rounded-md border px-2 text-sm"
            >
              <option value="">구분 전체</option>
              <option value="course">온라인 강의</option>
              <option value="tpass">T-PASS(기간권)</option>
            </select>
            <select
              name="sale"
              defaultValue={sale}
              className="border-border bg-background h-9 rounded-md border px-2 text-sm"
            >
              <option value="">판매 상태 전체</option>
              {Object.entries(SALE_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <select
              name="sort"
              defaultValue={sort}
              className="border-border bg-background h-9 rounded-md border px-2 text-sm"
            >
              <option value="created">최근 등록순</option>
              <option value="updated">최근 수정순</option>
              <option value="name">강의명순</option>
              <option value="code">강의 UID순</option>
              <option value="available">수강신청 시작일순</option>
              <option value="order">노출 순서순</option>
            </select>
            <select
              name="size"
              defaultValue={String(size)}
              className="border-border bg-background h-9 rounded-md border px-2 text-sm"
            >
              {PAGE_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}개 보기
                </option>
              ))}
            </select>
            <Button type="submit" variant="outline" className="h-9">
              검색
            </Button>
            <Button asChild type="button" variant="ghost" className="h-9">
              <Link to="/admin/lectures">초기화</Link>
            </Button>
          </Form>
          <div className="ml-auto">
            <Button asChild className="h-9">
              <Link to="/admin/pricing">
                <PlusIcon className="size-4" /> 강의등록
              </Link>
            </Button>
          </div>
        </div>

        <p className="text-muted-foreground mb-2 text-xs">
          검색 결과 {total.toLocaleString("ko-KR")}건 · {page}/{totalPages} 페이지
        </p>
        {actionData && "error" in actionData && actionData.error ? (
          <p className="text-destructive mb-2 text-xs">{actionData.error}</p>
        ) : null}

        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-muted/60">
              <tr>
                <th className="px-3 py-2 font-semibold">강의</th>
                <th className="px-3 py-2 font-semibold">강사</th>
                <th className="px-3 py-2 font-semibold">카테고리</th>
                <th className="px-3 py-2 font-semibold">구분</th>
                <th className="px-3 py-2 font-semibold">신청 시작</th>
                <th className="px-3 py-2 font-semibold">판매가</th>
                <th className="px-3 py-2 font-semibold">판매 상태</th>
                <th className="px-3 py-2 font-semibold">수강생</th>
                <th className="px-3 py-2 font-semibold">등록/수정</th>
                <th className="px-3 py-2 font-semibold">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {lectures.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-muted-foreground px-3 py-8 text-center">
                    조건에 맞는 강의가 없습니다.
                  </td>
                </tr>
              ) : (
                lectures.map((l) => (
                  <tr key={l.planId} className="hover:bg-muted/30 align-top">
                    <td className="px-3 py-2">
                      <div className="flex items-start gap-2">
                        {l.thumbnailUrl ? (
                          <img
                            src={l.thumbnailUrl}
                            alt=""
                            className="h-10 w-16 shrink-0 rounded border object-cover"
                          />
                        ) : null}
                        <div className="min-w-0">
                          <p className="font-medium">{l.name}</p>
                          <p className="text-muted-foreground font-mono text-[11px]">
                            {l.code}
                          </p>
                          {l.courseTitles.length > 0 ? (
                            <p className="text-muted-foreground truncate text-[11px]">
                              {l.courseTitles.slice(0, 2).join(" · ")}
                              {l.courseTitles.length > 2
                                ? ` 외 ${l.courseTitles.length - 2}`
                                : ""}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {l.instructorNames.length > 0 ? (
                        l.instructorNames.join(" · ")
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">{l.categoryName ?? "-"}</td>
                    <td className="px-3 py-2 text-xs">
                      {l.productKind === "tpass" ? "T-PASS" : "온라인"}
                    </td>
                    <td className="text-muted-foreground px-3 py-2 text-xs tabular-nums">
                      {l.availableFrom ? l.availableFrom.slice(0, 10) : "-"}
                    </td>
                    <td className="px-3 py-2 text-xs tabular-nums">
                      {/* 정상가가 판매가보다 크면 취소선으로 병기(할인 표시) */}
                      {l.listPriceKrw != null && l.listPriceKrw > l.priceKrw ? (
                        <span className="text-muted-foreground mr-1 line-through">
                          {l.listPriceKrw.toLocaleString("ko-KR")}
                        </span>
                      ) : null}
                      {l.priceKrw.toLocaleString("ko-KR")}원
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <span
                        className={
                          l.saleStatus === "on_sale"
                            ? "font-semibold text-emerald-600 dark:text-emerald-400"
                            : "text-muted-foreground"
                        }
                      >
                        {SALE_LABEL[l.saleStatus] ?? l.saleStatus}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs tabular-nums">{l.enrollCount}</td>
                    <td className="text-muted-foreground px-3 py-2 text-[11px] tabular-nums">
                      {l.createdAt.slice(0, 10)}
                      <br />
                      {l.updatedAt.slice(0, 10)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-1 text-xs">
                        <a
                          href={`/lecture/catalog/${l.code}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-link hover:underline"
                        >
                          상세보기
                        </a>
                        {/* 목록을 다시 거치지 않고 해당 상품의 수정폼으로 직행
                            (원장 요청 2026-08-20). ?plan= 을 admin-plans 가 받아 펼친다. */}
                        <Link
                          to={`/admin/pricing?plan=${l.planId}`}
                          className="text-link hover:underline"
                        >
                          강의수정
                        </Link>
                        {l.firstCourseId ? (
                          <Link
                            to={`/admin/lms/courses/${l.firstCourseId}`}
                            className="text-link hover:underline"
                          >
                            목차관리
                          </Link>
                        ) : null}
                        <Link
                          to="/admin/lms/enrollments"
                          className="text-link hover:underline"
                        >
                          수강생관리
                        </Link>
                        {role === "admin" && l.enrollCount === 0 && l.orderCount === 0 ? (
                          <Form
                            method="post"
                            onSubmit={(e) => {
                              if (
                                !window.confirm(
                                  `"${l.name}" 강의를 삭제할까요? 되돌릴 수 없습니다.`,
                                )
                              )
                                e.preventDefault();
                            }}
                          >
                            <input type="hidden" name="intent" value="delete" />
                            <input type="hidden" name="planId" value={l.planId} />
                            <button
                              type="submit"
                              className="text-destructive hover:underline"
                            >
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

        {totalPages > 1 ? (
          <div className="mt-3 flex items-center gap-1 text-sm">
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => Math.abs(p - page) <= 3 || p === 1 || p === totalPages)
              .map((p, idx, arr) => (
                <span key={p} className="flex items-center gap-1">
                  {idx > 0 && arr[idx - 1] !== p - 1 ? (
                    <span className="text-muted-foreground">…</span>
                  ) : null}
                  <Link
                    to={pageHref(p)}
                    className={
                      p === page
                        ? "bg-primary text-primary-foreground rounded px-2 py-0.5 font-semibold"
                        : "text-link rounded px-2 py-0.5 hover:underline"
                    }
                  >
                    {p}
                  </Link>
                </span>
              ))}
          </div>
        ) : null}
      </div>
    </AdminShell>
  );
}
