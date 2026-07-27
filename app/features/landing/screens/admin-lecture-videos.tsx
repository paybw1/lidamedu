// feat-12-002 강의 홈 짧은 영상 운영자 목록 — /admin/lecture-videos.
import { PlusIcon } from "lucide-react";
import { Link, redirect } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { getStaffRole } from "~/features/laws/queries.server";

import { AdminRowControls } from "../components/admin-row-controls";
import {
  LECTURE_VIDEO_CATEGORY_LABEL,
  type LectureVideoCategory,
  type LectureVideoProvider,
} from "../labels";
import { listLectureVideos } from "../queries.server";

import type { Route } from "./+types/admin-lecture-videos";

export function meta() {
  return [{ title: "강의 홈 영상 관리 | 운영관리" }];
}

const PROVIDER_LABEL: Record<LectureVideoProvider, string> = {
  youtube: "유튜브",
  kollus: "콜러스",
};

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const role = await getStaffRole(client, user.id);
  if (!role) throw redirect("/dashboard");
  const videos = await listLectureVideos(client, { includeUnpublished: true });
  return { role, videos };
}

export default function AdminLectureVideos({
  loaderData,
}: Route.ComponentProps) {
  const { role, videos } = loaderData;
  return (
    <AdminShell
      cluster="landing"
      role={role}
      title="강의 홈 영상 관리"
      desc="강의 홈(공부방법·맛보기)에 노출되는 짧은 영상을 등록·편집합니다. 순서(↑/↓)는 같은 카테고리 내 표시 순서입니다."
      headerRight={
        <Button asChild size="sm">
          <Link to="/admin/lecture-videos/new">
            <PlusIcon className="size-4" /> 영상 등록
          </Link>
        </Button>
      }
    >
      <div className="p-5 md:p-8">
        {videos.length === 0 ? (
          <div className="text-muted-foreground rounded-xl border border-dashed py-16 text-center text-sm">
            등록된 영상이 없습니다.
          </div>
        ) : (
          <ul className="divide-border bg-card divide-y rounded-xl border">
            {videos.map((v, i) => (
              <li
                key={v.video_id}
                className="flex items-center gap-3 px-3 py-3"
              >
                <AdminRowControls
                  entity="video"
                  id={v.video_id}
                  isFirst={i === 0}
                  isLast={i === videos.length - 1}
                />
                <Link
                  to={`/admin/lecture-videos/${v.video_id}/edit`}
                  className="hover:bg-muted/40 flex flex-1 items-center gap-3 rounded-lg px-2 py-1"
                >
                  <Badge variant="outline" className="shrink-0 text-[11px]">
                    {
                      LECTURE_VIDEO_CATEGORY_LABEL[
                        v.category as LectureVideoCategory
                      ]
                    }
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                    {v.title}
                  </span>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {PROVIDER_LABEL[v.provider as LectureVideoProvider]}
                  </span>
                  {v.published ? (
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
