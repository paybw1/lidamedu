// feat-12 리담소식 등록/수정 — /admin/lecture-news/new · /:id/edit.
import { Form, Link, redirect } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { getStaffRole } from "~/features/laws/queries.server";

import { getNews } from "../queries.server";

import type { Route } from "./+types/admin-news-edit";

export function meta() {
  return [{ title: "소식 편집 | 운영관리" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const role = await getStaffRole(client, user.id);
  if (!role) throw redirect("/dashboard");
  const row = params.newsId ? await getNews(client, params.newsId) : null;
  return { role, row };
}

const IN = "h-9 text-sm";
const TA = "border-input bg-background w-full rounded-md border px-3 py-2 text-sm leading-relaxed";

export default function AdminNewsEdit({ loaderData }: Route.ComponentProps) {
  const { role, row: n } = loaderData;
  // datetime-local 은 초 없는 로컬 시각. 저장 시 그대로 문자열 → published_at.
  const dtLocal = n?.published_at ? n.published_at.slice(0, 16) : "";
  return (
    <AdminShell cluster="landing" role={role} title={n ? "소식 편집" : "소식 등록"} desc="공개를 켜야 랜딩·리담소식에 노출됩니다.">
      <div className="mx-auto max-w-2xl p-5 md:p-8">
        <Link to="/admin/lecture-news" className="text-muted-foreground hover:text-foreground mb-4 inline-block text-sm">
          ← 소식 목록
        </Link>
        <Form method="post" action="/api/admin/landing" className="flex flex-col gap-4">
          <input type="hidden" name="entity" value="news" />
          <input type="hidden" name="intent" value="save" />
          {n ? <input type="hidden" name="id" value={n.news_id} /> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-[13px]">종류</Label>
              <select name="kind" defaultValue={n?.kind ?? "notice"} className="border-input bg-background h-9 rounded-md border px-2 text-sm">
                <option value="notice">공지</option>
                <option value="event">이벤트</option>
                <option value="passer">합격속보</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-[13px]">발행 일시</Label>
              <Input type="datetime-local" name="published_at" defaultValue={dtLocal} className={IN} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-[13px]">제목</Label>
            <Input name="title" required maxLength={200} defaultValue={n?.title} className={IN} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-[13px]">
              내용
              <span className="text-muted-foreground ml-2 text-[11px] font-normal">마크다운 지원(표·굵게 등)</span>
            </Label>
            <textarea name="body_md" rows={10} defaultValue={n?.body_md ?? ""} className={TA} />
          </div>

          <div className="flex items-center gap-5">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="pinned" defaultChecked={n?.pinned ?? false} /> 상단 고정
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="published" defaultChecked={n?.published ?? true} /> 공개
            </label>
          </div>

          <div className="flex justify-end gap-2 border-t pt-4">
            <Button asChild variant="ghost">
              <Link to="/admin/lecture-news">취소</Link>
            </Button>
            <Button type="submit">{n ? "저장" : "등록"}</Button>
          </div>
        </Form>
      </div>
    </AdminShell>
  );
}
