// 학생 강의 viewer (feat-7-029).
// 외부 영상 URL 임베드 + YouTube/Vimeo postMessage 자동 진행률 추적 + 수동 "수강 완료" 버튼(폴백).

import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  ExternalLinkIcon,
  PlayCircleIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, data, useFetcher } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent } from "~/core/components/ui/card";
import makeServerClient from "~/core/lib/supa-client.server";
import { TrackedLectureFrame } from "~/features/lectures/components/tracked-lecture-frame";
import {
  getLectureItemForUser,
  getMyLectureView,
  toEmbedUrl,
} from "~/features/lectures/queries.server";

import type { Route } from "./+types/lecture-viewer";

export const meta: Route.MetaFunction = ({ data: d }) => {
  if (!d) return [{ title: "강의 | Lidam Patent Attorney Academy" }];
  return [{ title: `${d.item.lectureTitle} | Lidam Patent Attorney Academy` }];
};

export async function loader({ params, request }: Route.LoaderArgs) {
  if (!params.itemId) throw data("Missing itemId", { status: 404 });
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const item = await getLectureItemForUser(params.itemId, user.id);
  if (!item) throw data("강의에 접근할 권한이 없습니다", { status: 403 });
  const view = await getMyLectureView(params.itemId, user.id);
  return { item, view };
}

export default function LectureViewer({ loaderData }: Route.ComponentProps) {
  const { item, view } = loaderData;
  const embedUrl = toEmbedUrl(item.lectureUrl);
  const initialCompleted = !!view?.completedAt;
  const [autoCompleted, setAutoCompleted] = useState(false);
  const completed = initialCompleted || autoCompleted;
  const viewFetcher = useFetcher<{ ok?: true; error?: string }>();
  const completeFetcher = useFetcher<{ ok?: true; error?: string }>();

  // 페이지 진입 시 자동 view 기록 (best-effort, 1회만)
  useEffect(() => {
    if (view?.viewedAt) return; // 이미 본 강의는 skip
    const fd = new FormData();
    fd.append("intent", "view");
    fd.append("itemId", item.itemId);
    viewFetcher.submit(fd, {
      method: "post",
      action: "/api/student/lecture-progress",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.itemId]);

  return (
    <div className="mx-auto w-full max-w-screen-lg px-5 py-6 md:px-10 md:py-8">
      <Link
        to="/dashboard"
        className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-xs"
      >
        <ArrowLeftIcon className="size-3" /> 대시보드
      </Link>

      <header className="mb-4 space-y-2">
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
          <PlayCircleIcon className="size-3.5" /> {item.curriculumName} · W
          {item.weekNumber} {item.weekTitle}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold tracking-tight">
            {item.lectureTitle}
          </h1>
          {completed ? (
            <Badge variant="default" className="text-[10px]">
              <CheckCircle2Icon className="size-3" /> 수강 완료
            </Badge>
          ) : null}
        </div>
        <div className="text-muted-foreground inline-flex items-center gap-2 text-xs">
          {item.lectureDurationMin ? (
            <span>{item.lectureDurationMin}분</span>
          ) : null}
          <a
            href={item.lectureUrl}
            target="_blank"
            rel="noreferrer"
            className="text-primary inline-flex items-center gap-1 hover:underline"
          >
            <ExternalLinkIcon className="size-3" /> 외부에서 열기
          </a>
        </div>
      </header>

      {embedUrl ? (
        <Card>
          <CardContent className="p-0">
            <div className="bg-black" style={{ aspectRatio: "16 / 9" }}>
              <TrackedLectureFrame
                embedUrl={embedUrl}
                itemId={item.itemId}
                title={item.lectureTitle}
                initialPositionSec={view?.lastPositionSec ?? 0}
                alreadyCompleted={initialCompleted}
                onAutoComplete={() => setAutoCompleted(true)}
              />
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="bg-muted/40 rounded-md border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-sm">
            영상 URL 을 임베드할 수 없습니다. "외부에서 열기" 를 사용하세요.
          </p>
        </div>
      )}

      <div className="text-muted-foreground mt-3 text-[11px]">
        YouTube / Vimeo 는 약 85% 시청 시 자동으로 수강 완료 처리됩니다.
        그 외 영상은 아래 버튼으로 수동 표시하세요.
      </div>

      <div className="mt-2 flex justify-end">
        {completed ? (
          <Button size="sm" variant="outline" disabled>
            <CheckCircle2Icon className="size-3.5" /> 수강 완료됨
          </Button>
        ) : (
          <completeFetcher.Form
            method="post"
            action="/api/student/lecture-progress"
          >
            <input type="hidden" name="intent" value="complete" />
            <input type="hidden" name="itemId" value={item.itemId} />
            <Button
              type="submit"
              size="sm"
              disabled={completeFetcher.state !== "idle"}
            >
              <CheckCircle2Icon className="size-3.5" /> 수강 완료 표시
            </Button>
          </completeFetcher.Form>
        )}
      </div>
    </div>
  );
}
