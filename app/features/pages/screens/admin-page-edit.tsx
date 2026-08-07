// feat-11-008 P2 — 페이지 등록/수정: /admin/pages/new · /admin/pages/:pageId/edit.
// 본문=공지사항과 동일한 통합 HtmlEditor(비주얼·소스·미리보기·전체화면·이미지 업로드).
import { useState } from "react";
import { Form, Link, data, redirect, useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { getStaffRole } from "~/features/laws/queries.server";
import { HtmlEditor } from "~/features/lms/components/html-editor";

import {
  customPageCodeExists,
  getCustomPage,
  snapshotCustomPage,
} from "../queries.server";

import type { Route } from "./+types/admin-page-edit";

export function meta() {
  return [{ title: "페이지 편집 | 운영관리" }];
}

const CODE_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;

export async function loader({ request, params }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const role = await getStaffRole(client, user.id);
  if (!role) throw redirect("/dashboard");
  const page = params.pageId ? await getCustomPage(client, params.pageId) : null;
  if (params.pageId && !page) throw redirect("/admin/pages");
  return { role, page };
}

export async function action({ request, params }: Route.ActionArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });
  if (!(await getStaffRole(client, user.id)))
    return data({ error: "Forbidden" }, { status: 403 });

  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "save");

  // 코드 중복 확인(버튼) — fetcher 소비.
  if (intent === "check_code") {
    const code = String(fd.get("code") ?? "").trim().toLowerCase();
    if (!CODE_RE.test(code))
      return data({
        check: { ok: false, message: "영문 소문자·숫자·하이픈 2~64자로 입력해 주세요." },
      });
    const exists = await customPageCodeExists(client, code, params.pageId);
    return data({
      check: exists
        ? { ok: false, message: "이미 사용 중인 코드입니다." }
        : { ok: true, message: "사용할 수 있는 코드입니다." },
    });
  }

  const title = String(fd.get("title") ?? "").trim();
  const code = String(fd.get("code") ?? "").trim().toLowerCase();
  const bodyHtml = String(fd.get("body_html") ?? "");
  const status = String(fd.get("status") ?? "stopped") === "use" ? "use" : "stopped";
  const adminMemo = String(fd.get("admin_memo") ?? "").trim() || null;
  if (!title) return data({ error: "페이지명을 입력해 주세요." }, { status: 400 });
  if (!CODE_RE.test(code))
    return data(
      { error: "코드명은 영문 소문자·숫자·하이픈 2~64자입니다." },
      { status: 400 },
    );
  // 저장 전 중복 확인(서버 권위 — 버튼 확인과 별개로 항상 검사).
  if (await customPageCodeExists(client, code, params.pageId))
    return data({ error: "이미 사용 중인 코드명입니다." }, { status: 400 });

  if (params.pageId) {
    await snapshotCustomPage(client, params.pageId, user.id);
    const { error } = await client
      .from("custom_pages")
      .update({
        title,
        code,
        body_html: bodyHtml,
        status,
        admin_memo: adminMemo,
        updated_at: new Date().toISOString(),
      })
      .eq("page_id", params.pageId);
    if (error) return data({ error: error.message }, { status: 400 });
    return redirect("/admin/pages");
  }
  const { error } = await client.from("custom_pages").insert({
    title,
    code,
    body_html: bodyHtml,
    status,
    admin_memo: adminMemo,
    created_by: user.id,
  });
  if (error) return data({ error: error.message }, { status: 400 });
  return redirect("/admin/pages");
}

export default function AdminPageEdit({ loaderData, actionData }: Route.ComponentProps) {
  const { role, page } = loaderData;
  const checkFetcher = useFetcher<typeof action>();
  const [code, setCode] = useState(page?.code ?? "");
  const check =
    checkFetcher.data && "check" in checkFetcher.data ? checkFetcher.data.check : null;
  return (
    <AdminShell
      cluster="ops"
      role={role}
      title={page ? "페이지 수정" : "페이지 등록"}
      desc="코드명은 페이지 주소(/page/코드명)에 사용되는 고유값입니다."
    >
      <div className="mx-auto max-w-4xl p-5 md:p-8">
        <Link
          to="/admin/pages"
          className="text-muted-foreground text-[13px] hover:underline"
        >
          ← 페이지관리
        </Link>

        <Form method="post" className="mt-4 space-y-4">
          <input type="hidden" name="intent" value="save" />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">
                페이지명 <span className="text-rose-500">*</span>
              </Label>
              <Input
                name="title"
                defaultValue={page?.title ?? ""}
                required
                className="h-9 text-sm"
                placeholder="예: 2026 신년 이벤트"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">
                코드명 <span className="text-rose-500">*</span>
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  name="code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  className="h-9 font-mono text-sm"
                  placeholder="new-year-2026"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 shrink-0"
                  onClick={() => {
                    const fd = new FormData();
                    fd.set("intent", "check_code");
                    fd.set("code", code);
                    checkFetcher.submit(fd, { method: "post" });
                  }}
                >
                  중복 확인
                </Button>
              </div>
              <p className="text-muted-foreground text-xs">
                주소 미리보기: /page/{code || "코드명"}
                {check ? (
                  <span
                    className={
                      check.ok
                        ? "ml-2 font-semibold text-emerald-600 dark:text-emerald-400"
                        : "text-destructive ml-2 font-semibold"
                    }
                  >
                    {check.message}
                  </span>
                ) : null}
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">활성 상태</Label>
              <div className="flex items-center gap-4 pt-1 text-sm">
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="status"
                    value="use"
                    defaultChecked={page?.status === "use"}
                  />
                  사용
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="status"
                    value="stopped"
                    defaultChecked={(page?.status ?? "stopped") === "stopped"}
                  />
                  중지
                </label>
              </div>
              <p className="text-muted-foreground text-xs">
                중지 상태는 사용자에게 준비 중 안내가 표시되고, 운영자는 미리보기로 볼 수
                있습니다.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">관리자 메모</Label>
              <Input
                name="admin_memo"
                defaultValue={page?.adminMemo ?? ""}
                className="h-9 text-sm"
                placeholder="이벤트 기간, 연결 상품 등 내부 메모(선택)"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[13px] font-semibold">페이지 내용</Label>
            <HtmlEditor
              name="body_html"
              defaultValue={page?.bodyHtml ?? ""}
              uploadUrl="/api/lms/editor-image"
              minHeight={420}
            />
          </div>

          {actionData && "error" in actionData && actionData.error ? (
            <p className="text-destructive text-sm">{actionData.error}</p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button asChild variant="ghost">
              <Link to="/admin/pages">취소</Link>
            </Button>
            <Button type="submit">{page ? "저장" : "등록"}</Button>
          </div>
        </Form>
      </div>
    </AdminShell>
  );
}
