// feat-12 리담소식 운영자 목록 — /admin/lecture-news.
import { PinIcon, PlusIcon } from "lucide-react";
import { Link, redirect } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { getStaffRole } from "~/features/laws/queries.server";

import { AdminRowControls } from "../components/admin-row-controls";
import { NEWS_KIND_LABEL, type NewsKind } from "../labels";
import { listNews } from "../queries.server";

import type { Route } from "./+types/admin-news";

export function meta() {
  return [{ title: "리담소식 관리 | 운영관리" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const role = await getStaffRole(client, user.id);
  if (!role) throw redirect("/dashboard");
  const news = await listNews(client, { includeUnpublished: true });
  return { role, news };
}

export default function AdminNews({ loaderData }: Route.ComponentProps) {
  const { role, news } = loaderData;
  // 순서는 고정→최신순 자동이라 ↑/↓ 미제공(reorder 는 display_order 기반 배너/일정만).
  return (
    <AdminShell
      cluster="landing"
      role={role}
      title="리담소식 관리"
      desc="공지·이벤트·합격속보를 등록·편집합니다. 고정(pin)한 글이 먼저, 그다음 발행일 최신순."
      headerRight={
        <Button asChild size="sm">
          <Link to="/admin/lecture-news/new">
            <PlusIcon className="size-4" /> 소식 등록
          </Link>
        </Button>
      }
    >
      <div className="p-5 md:p-8">
        {news.length === 0 ? (
          <div className="text-muted-foreground rounded-xl border border-dashed py-16 text-center text-sm">
            등록된 소식이 없습니다.
          </div>
        ) : (
          <ul className="divide-border bg-card divide-y rounded-xl border">
            {news.map((it) => (
              <li key={it.news_id}>
                <Link
                  to={`/admin/lecture-news/${it.news_id}/edit`}
                  className="hover:bg-muted/40 flex items-center gap-3 px-4 py-3"
                >
                  <span className="text-muted-foreground w-20 shrink-0 text-xs tabular-nums">
                    {it.published_at.slice(0, 10)}
                  </span>
                  <Badge variant="outline" className="shrink-0 text-[11px]">
                    {NEWS_KIND_LABEL[it.kind as NewsKind]}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                    {it.pinned ? (
                      <PinIcon className="mr-1 inline size-3 text-amber-600" />
                    ) : null}
                    {it.title}
                  </span>
                  {it.published ? (
                    <Badge className="shrink-0 text-[11px]">공개</Badge>
                  ) : (
                    <Badge variant="secondary" className="shrink-0 text-[11px]">
                      비공개
                    </Badge>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminShell>
  );
}
