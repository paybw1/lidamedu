// 이용 가이드 허브 — 기능 사용법(글+영상) 카드 목록. 카테고리별 묶음.
import { BookOpenIcon, CompassIcon, PlayCircleIcon } from "lucide-react";
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

// 카테고리 표시 순서 — 학습 흐름 순. 목록에 없는 새 카테고리는 뒤에 등장 순서대로.
const CATEGORY_ORDER = [
  "시작하기",
  "학습과목",
  "문제 풀이",
  "학습노트",
  "학습관리",
  "모의고사",
  "2차 대비",
  "학습정보",
  "질문하기",
  "커뮤니티",
  "수강권·결제",
  // staff 전용(RLS 로 학생에게 안 보임) — 맨 뒤.
  "종합반 운영",
];

export default function GuideIndex({ loaderData }: Route.ComponentProps) {
  const { guides } = loaderData;
  const categories: string[] = [];
  for (const g of guides) {
    if (!categories.includes(g.category)) categories.push(g.category);
  }
  categories.sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a);
    const bi = CATEGORY_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  return (
    <div className="mx-auto w-full max-w-screen-lg px-5 py-6 md:px-10 md:py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1.5">
          <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
            <BookOpenIcon className="size-3.5" /> 이용 가이드
          </p>
          <h1 className="text-2xl font-bold tracking-tight">
            이렇게 활용해 보세요
          </h1>
          <p className="text-muted-foreground text-sm">
            처음 오셨거나 기능이 낯설 때 여기서 사용법을 확인할 수 있습니다.
            짧은 글(영상)로 준비했습니다.
          </p>
        </div>
        {/* 가입 때 봤던 핵심 기능 투어를 언제든 재열람. */}
        <Link
          to="/onboarding/welcome?replay=1"
          className="border-border text-muted-foreground hover:border-primary hover:text-foreground inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors"
        >
          <CompassIcon className="size-3.5" /> 핵심 기능 둘러보기
        </Link>
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
                {guides.some(
                  (g) => g.category === cat && g.audience === "staff",
                ) ? (
                  <span className="ml-2 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                    운영자·강사 전용
                  </span>
                ) : null}
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
