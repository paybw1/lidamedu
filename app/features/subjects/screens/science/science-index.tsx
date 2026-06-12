// /subjects/science — 자연과학 허브. nav 의 "자연과학" 단일 진입점에서 도달한다.
// 상단 과목 탭(물/화/생/지)을 클릭하면 다른 화면으로 넘어가지 않고, 같은 허브
// 화면에서 그 과목 내용(과목별 ScienceHub 뷰)이 바로 교체되어 보인다(?subject=).
// 진입 게이트(area_subjects)는 상위 subjects.layout 이 담당.

import { Link } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { cn } from "~/core/lib/utils";
import ScienceHubView from "~/features/subjects/components/science-hub";
import {
  SCIENCE_SUBJECT_SLUGS,
  SCIENCE_SUBJECTS,
  type ScienceSubjectSlug,
  normalizeScienceSlug,
} from "~/features/subjects/lib/science";
import {
  getScienceProgress,
  listScienceYears,
  listSectionsWithStats,
} from "~/features/subjects/lib/science.server";

import type { Route } from "./+types/science-index";

export const meta: Route.MetaFunction = () => [
  { title: "자연과학 | Lidam Patent Attorney Academy" },
];

// earth_science 만 URL 표기가 다름(earth-science). 그 외는 동일.
function toParam(slug: ScienceSubjectSlug): string {
  return slug === "earth_science" ? "earth-science" : slug;
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const subject: ScienceSubjectSlug =
    normalizeScienceSlug(url.searchParams.get("subject") ?? "physics") ??
    "physics";
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  const [sections, years, progress] = await Promise.all([
    listSectionsWithStats(client, subject, user?.id ?? null),
    listScienceYears(client, subject),
    user
      ? getScienceProgress(client, user.id, subject)
      : Promise.resolve({ attempted: 0, correct: 0, total: 0 }),
  ]);
  return { subject, sections, years, progress };
}

export default function ScienceIndex({ loaderData }: Route.ComponentProps) {
  const { subject, sections, years, progress } = loaderData;
  return (
    <div className="bg-background">
      {/* 과목 탭 — 클릭 시 같은 화면에서 내용만 교체(페이지 전환 아님). */}
      <div className="mx-auto w-full max-w-screen-lg px-5 pt-6 md:px-10">
        <p className="text-primary mb-2 font-mono text-[11px] font-bold tracking-widest uppercase">
          자연과학 · 1차 필수
        </p>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {SCIENCE_SUBJECT_SLUGS.map((slug) => {
            const active = slug === subject;
            const m = SCIENCE_SUBJECTS[slug];
            return (
              <Link
                key={slug}
                to={`/subjects/science?subject=${toParam(slug)}`}
                preventScrollReset
                viewTransition
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-border bg-card hover:border-primary hover:text-primary",
                )}
              >
                <span aria-hidden="true">{m.emoji}</span>
                {m.name}
              </Link>
            );
          })}
        </div>
      </div>

      {/* 선택 과목 내용 — 과목별 화면과 동일 뷰를 인라인으로 */}
      <ScienceHubView
        subject={subject}
        sections={sections}
        years={years}
        progress={progress}
        hideBackLink
      />
    </div>
  );
}
