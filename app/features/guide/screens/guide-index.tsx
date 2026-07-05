// 이용 가이드 허브 — 기능 사용법(글+영상) 카드 목록. 카테고리별 묶음.
import { BookOpenIcon, PlayCircleIcon } from "lucide-react";
import { Link, data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { listPublishedGuides } from "~/features/guide/queries.server";

import type { Route } from "./+types/guide-index";

export const meta: Route.MetaFunction = () => [
  { title: "이용 가이드 | 리담변리사학원" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const guides = await listPublishedGuides(client);
  return { guides };
}

export default function GuideIndex({ loaderData }: Route.ComponentProps) {
  const { guides } = loaderData;
  // 카테고리 순서는 저장 순서(정렬된 목록의 등장 순서) 유지.
  const categories: string[] = [];
  for (const g of guides) {
    if (!categories.includes(g.category)) categories.push(g.category);
  }

  return (
    <div className="mx-auto w-full max-w-screen-lg px-5 py-6 md:px-10 md:py-8">
      <header className="mb-6 space-y-1.5">
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
          <BookOpenIcon className="size-3.5" /> 이용 가이드
        </p>
        <h1 className="text-2xl font-bold tracking-tight">
          이렇게 활용해 보세요
        </h1>
        <p className="text-muted-foreground text-sm">
          처음 오셨거나 기능이 낯설 때 여기서 사용법을 확인할 수 있습니다. 짧은
          글과 영상으로 준비했습니다.
        </p>
      </header>

      {guides.length === 0 ? (
        <div className="bg-muted/40 rounded-md border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-sm">
            가이드를 준비하고 있습니다. 곧 채워집니다.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {categories.map((cat) => (
            <section key={cat}>
              <h2 className="text-foreground mb-2.5 text-sm font-bold">
                {cat}
              </h2>
              <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {guides
                  .filter((g) => g.category === cat)
                  .map((g) => (
                    <li key={g.guideId}>
                      <Link
                        to={`/guide/${g.guideId}`}
                        className="border-border bg-card hover:border-primary block h-full rounded-xl border p-4 shadow-sm transition-colors"
                      >
                        <p className="text-foreground text-sm leading-snug font-semibold">
                          {g.title}
                        </p>
                        <p className="text-muted-foreground mt-1.5 inline-flex items-center gap-1 text-[11px]">
                          {g.youtubeUrl ? (
                            <>
                              <PlayCircleIcon className="size-3.5" /> 영상 포함
                            </>
                          ) : (
                            "글로 안내"
                          )}
                        </p>
                      </Link>
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
