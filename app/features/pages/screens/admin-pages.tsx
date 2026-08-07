// feat-11-008 P2 — 페이지관리 목록: /admin/pages (운영·시스템). 게시판형 목록+검색+등록.
import { CopyIcon, PlusIcon } from "lucide-react";
import { Form, Link, data, redirect, useSearchParams } from "react-router";
import { toast } from "sonner";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { getStaffRole } from "~/features/laws/queries.server";

import { listCustomPages } from "../queries.server";

import type { Route } from "./+types/admin-pages";

export function meta() {
  return [{ title: "페이지관리 | 운영관리" }];
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
  const statusRaw = url.searchParams.get("status");
  const status = statusRaw === "use" || statusRaw === "stopped" ? statusRaw : null;
  const sort = url.searchParams.get("sort") ?? "created";
  const pages = await listCustomPages(client, { q: q || undefined, status, sort });
  return { role, pages, q, status: status ?? "", sort, origin: url.origin };
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
  const pageId = String(fd.get("pageId") ?? "");
  if (!pageId) return data({ error: "대상이 없습니다." }, { status: 400 });

  const { getCustomPage, snapshotCustomPage } = await import("../queries.server");

  // 사용/중지 토글 — 일반관리자 가능.
  if (intent === "toggle_status") {
    const page = await getCustomPage(client, pageId);
    if (!page) return data({ error: "페이지가 없습니다." }, { status: 404 });
    await snapshotCustomPage(client, pageId, user.id);
    const { error } = await client
      .from("custom_pages")
      .update({
        status: page.status === "use" ? "stopped" : "use",
        updated_at: new Date().toISOString(),
      })
      .eq("page_id", pageId);
    if (error) return data({ error: error.message }, { status: 400 });
    return redirect("/admin/pages");
  }

  // 복사 — 코드는 자동 접미(-copy-N), 중지 상태로 생성 후 편집으로 이동(코드 재입력·중복확인 유도).
  if (intent === "copy") {
    const src = await getCustomPage(client, pageId);
    if (!src) return data({ error: "페이지가 없습니다." }, { status: 404 });
    const { customPageCodeExists } = await import("../queries.server");
    let code = "";
    for (let i = 1; i <= 20; i++) {
      const cand = `${src.code}-copy${i > 1 ? `-${i}` : ""}`;
      if (!(await customPageCodeExists(client, cand))) {
        code = cand;
        break;
      }
    }
    if (!code) return data({ error: "복사 코드 생성 실패" }, { status: 400 });
    const { data: ins, error } = await client
      .from("custom_pages")
      .insert({
        title: `${src.title} (복사)`,
        code,
        body_html: src.bodyHtml,
        status: "stopped",
        admin_memo: src.adminMemo,
        created_by: user.id,
      })
      .select("page_id")
      .single();
    if (error) return data({ error: error.message }, { status: 400 });
    return redirect(`/admin/pages/${ins.page_id}/edit`);
  }

  // 삭제 — 최고관리자(원장) 전용, soft delete. 사용 중 페이지는 중지 후 삭제 권장이라 차단.
  if (intent === "delete") {
    if (role !== "admin")
      return data({ error: "삭제는 최고관리자(원장)만 할 수 있습니다." }, { status: 403 });
    const page = await getCustomPage(client, pageId);
    if (!page) return data({ error: "페이지가 없습니다." }, { status: 404 });
    if (page.status === "use")
      return data(
        { error: "사용 중인 페이지입니다. 먼저 사용중지로 전환해 주세요." },
        { status: 400 },
      );
    await snapshotCustomPage(client, pageId, user.id);
    const { error } = await client
      .from("custom_pages")
      .update({ deleted_at: new Date().toISOString() })
      .eq("page_id", pageId);
    if (error) return data({ error: error.message }, { status: 400 });
    return redirect("/admin/pages");
  }

  return data({ error: "bad intent" }, { status: 400 });
}

export default function AdminPages({ loaderData, actionData }: Route.ComponentProps) {
  const { role, pages, q, status, sort, origin } = loaderData;
  const [, setSearchParams] = useSearchParams();
  const copyUrl = (code: string) => {
    void navigator.clipboard.writeText(`${origin}/page/${code}`);
    toast.success("페이지 주소를 복사했습니다.");
  };
  return (
    <AdminShell
      cluster="ops"
      role={role}
      title="페이지관리"
      desc="이벤트·소개용 풀페이지를 제작하고 /page/코드명 주소로 노출합니다."
    >
      <div className="p-5 md:p-8">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Form method="get" className="flex flex-wrap items-center gap-2">
            <Input
              name="q"
              defaultValue={q}
              placeholder="페이지명 · 코드명 검색"
              className="h-9 w-56 text-sm"
            />
            <select
              name="status"
              defaultValue={status}
              className="border-border bg-background h-9 rounded-md border px-2 text-sm"
            >
              <option value="">상태 전체</option>
              <option value="use">사용</option>
              <option value="stopped">중지</option>
            </select>
            <select
              name="sort"
              defaultValue={sort}
              className="border-border bg-background h-9 rounded-md border px-2 text-sm"
            >
              <option value="created">최근 등록순</option>
              <option value="updated">최근 수정순</option>
              <option value="title">페이지명순</option>
            </select>
            <Button type="submit" variant="outline" className="h-9">
              검색
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-9"
              onClick={() => setSearchParams({})}
            >
              초기화
            </Button>
          </Form>
          <div className="ml-auto">
            <Button asChild className="h-9">
              <Link to="/admin/pages/new">
                <PlusIcon className="size-4" /> 페이지 등록
              </Link>
            </Button>
          </div>
        </div>

        <p className="text-muted-foreground mb-2 text-xs">총 {pages.length}개</p>
        {actionData && "error" in actionData && actionData.error ? (
          <p className="text-destructive mb-2 text-xs">{actionData.error}</p>
        ) : null}

        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-muted/60">
              <tr>
                <th className="px-3 py-2 font-semibold">페이지명</th>
                <th className="px-3 py-2 font-semibold">코드명</th>
                <th className="px-3 py-2 font-semibold">페이지 주소</th>
                <th className="px-3 py-2 font-semibold">상태</th>
                <th className="px-3 py-2 font-semibold">등록일</th>
                <th className="px-3 py-2 font-semibold">수정일</th>
                <th className="px-3 py-2 font-semibold">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {pages.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-muted-foreground px-3 py-8 text-center">
                    등록된 페이지가 없습니다.
                  </td>
                </tr>
              ) : (
                pages.map((p) => (
                  <tr key={p.pageId} className="hover:bg-muted/30">
                    <td className="px-3 py-2 font-medium">
                      <Link to={`/admin/pages/${p.pageId}/edit`} className="hover:underline">
                        {p.title}
                      </Link>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{p.code}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => copyUrl(p.code)}
                        className="text-link inline-flex items-center gap-1 text-xs hover:underline"
                      >
                        /page/{p.code} <CopyIcon className="size-3" />
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      {p.status === "use" ? (
                        <span className="text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
                          사용
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">중지</span>
                      )}
                    </td>
                    <td className="text-muted-foreground px-3 py-2 text-xs tabular-nums">
                      {p.createdAt.slice(0, 10)}
                    </td>
                    <td className="text-muted-foreground px-3 py-2 text-xs tabular-nums">
                      {p.updatedAt.slice(0, 10)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <a
                          href={`/page/${p.code}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-link hover:underline"
                        >
                          미리보기
                        </a>
                        <Link
                          to={`/admin/pages/${p.pageId}/edit`}
                          className="text-link hover:underline"
                        >
                          수정
                        </Link>
                        <Form method="post" className="inline">
                          <input type="hidden" name="intent" value="copy" />
                          <input type="hidden" name="pageId" value={p.pageId} />
                          <button type="submit" className="text-link hover:underline">
                            복사
                          </button>
                        </Form>
                        <Form method="post" className="inline">
                          <input type="hidden" name="intent" value="toggle_status" />
                          <input type="hidden" name="pageId" value={p.pageId} />
                          <button type="submit" className="text-link hover:underline">
                            {p.status === "use" ? "사용중지" : "사용"}
                          </button>
                        </Form>
                        {role === "admin" ? (
                          <Form
                            method="post"
                            className="inline"
                            onSubmit={(e) => {
                              if (
                                !window.confirm(
                                  `"${p.title}" 페이지를 삭제할까요? 되돌리기 어렵습니다.`,
                                )
                              )
                                e.preventDefault();
                            }}
                          >
                            <input type="hidden" name="intent" value="delete" />
                            <input type="hidden" name="pageId" value={p.pageId} />
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
      </div>
    </AdminShell>
  );
}
