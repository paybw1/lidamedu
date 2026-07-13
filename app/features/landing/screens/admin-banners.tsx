// feat-12 히어로 배너 운영자 목록 — /admin/landing-banners. 추가/삭제로 배너 개수 조절.
import { PlusIcon } from "lucide-react";
import { Link, redirect } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { getStaffRole } from "~/features/laws/queries.server";

import { AdminRowControls } from "../components/admin-row-controls";
import {
  BANNER_ACCENT_LABEL,
  BANNER_KIND_LABEL,
  type BannerAccent,
  type BannerKind,
} from "../labels";
import { listBanners } from "../queries.server";

import type { Route } from "./+types/admin-banners";

export function meta() {
  return [{ title: "히어로 배너 관리 | 운영관리" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const role = await getStaffRole(client, user.id);
  if (!role) throw redirect("/dashboard");
  const banners = await listBanners(client, { includeUnpublished: true });
  return { role, banners };
}

export default function AdminBanners({ loaderData }: Route.ComponentProps) {
  const { role, banners } = loaderData;
  return (
    <AdminShell
      cluster="landing"
      role={role}
      title="히어로 배너 관리"
      desc="랜딩 상단에서 자동 순환하는 배너를 추가·삭제·정렬합니다. 공개된 배너만 순서(↑/↓)대로 노출됩니다."
      headerRight={
        <Button asChild size="sm">
          <Link to="/admin/landing-banners/new">
            <PlusIcon className="size-4" /> 배너 추가
          </Link>
        </Button>
      }
    >
      <div className="p-5 md:p-8">
        {banners.length === 0 ? (
          <div className="text-muted-foreground rounded-xl border border-dashed py-16 text-center text-sm">
            등록된 배너가 없습니다. 배너를 추가하면 랜딩 히어로에 노출됩니다.
          </div>
        ) : (
          <ul className="divide-border bg-card divide-y rounded-xl border">
            {banners.map((b, i) => (
              <li key={b.banner_id} className="flex items-center gap-3 px-3 py-3">
                <AdminRowControls
                  entity="banner"
                  id={b.banner_id}
                  isFirst={i === 0}
                  isLast={i === banners.length - 1}
                />
                <Link
                  to={`/admin/landing-banners/${b.banner_id}/edit`}
                  className="hover:bg-muted/40 flex flex-1 items-center gap-3 rounded-lg px-2 py-1"
                >
                  <span className="text-muted-foreground w-6 shrink-0 text-center text-xs tabular-nums">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-sm font-semibold">{b.headline}</span>
                    <span className="text-muted-foreground ml-2 text-xs">
                      {BANNER_KIND_LABEL[b.kind as BannerKind]} ·{" "}
                      {BANNER_ACCENT_LABEL[b.accent as BannerAccent]}
                    </span>
                  </span>
                  {b.published ? (
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
