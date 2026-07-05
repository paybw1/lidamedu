// 이용 가이드 상세 — 영상(있으면) + 마크다운 본문.
import { ArrowLeftIcon, BookOpenIcon } from "lucide-react";
import { Link, data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { getPublishedGuide } from "~/features/guide/queries.server";
import { MarkdownView } from "~/features/problems/components/markdown-view";

import type { Route } from "./+types/guide-detail";

export const meta: Route.MetaFunction = ({ data: d }) => [
  { title: `${d?.guide.title ?? "이용 가이드"} | 리담변리사학원` },
];

// 유튜브 영상 ID 추출 — watch?v= / youtu.be/ / shorts/ / embed/ 수용.
function extractYoutubeId(url: string): string | null {
  const m =
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,20})/.exec(
      url,
    );
  return m?.[1] ?? null;
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const guide = await getPublishedGuide(client, params.guideId!);
  if (!guide) throw data("가이드를 찾을 수 없습니다.", { status: 404 });
  return { guide };
}

export default function GuideDetail({ loaderData }: Route.ComponentProps) {
  const { guide } = loaderData;
  const videoId = guide.youtubeUrl ? extractYoutubeId(guide.youtubeUrl) : null;

  return (
    <div className="mx-auto w-full max-w-screen-md px-5 py-6 md:px-10 md:py-8">
      <Link
        to="/guide"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-xs font-semibold"
      >
        <ArrowLeftIcon className="size-3.5" /> 이용 가이드
      </Link>
      <header className="mb-5 space-y-1.5">
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
          <BookOpenIcon className="size-3.5" /> {guide.category}
        </p>
        <h1 className="text-2xl font-bold tracking-tight">{guide.title}</h1>
      </header>

      {videoId ? (
        <div className="border-border mb-5 aspect-video w-full overflow-hidden rounded-xl border shadow-sm">
          <iframe
            src={`https://www.youtube.com/embed/${videoId}`}
            title={guide.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="h-full w-full"
          />
        </div>
      ) : null}

      {guide.bodyMd.trim() ? (
        <div className="text-[15px] leading-relaxed">
          <MarkdownView text={guide.bodyMd} trusted={false} />
        </div>
      ) : null}
    </div>
  );
}
