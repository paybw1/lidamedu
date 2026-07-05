// /subjects/science — 자연과학 허브. nav 의 "자연과학" 단일 진입점에서 도달한다.
// 상단 과목 바(물/화/생/지, sticky)를 클릭하면 다른 화면으로 넘어가지 않고, 같은
// 허브 화면에서 그 과목 내용(과목별 ScienceHub 뷰)이 바로 교체되어 보인다(?subject=).
// 진입 게이트(area_subjects)는 상위 subjects.layout 이 담당.

import makeServerClient from "~/core/lib/supa-client.server";
import ScienceHubView from "~/features/subjects/components/science-hub";
import { ScienceSubjectBar } from "~/features/subjects/components/science-subject-bar";
import {
  type ScienceSubjectSlug,
  normalizeScienceSlug,
} from "~/features/subjects/lib/science";
import {
  getAllScienceSubjectsProgress,
  loadScienceHubData,
} from "~/features/subjects/lib/science.server";

import type { Route } from "./+types/science-index";

export const meta: Route.MetaFunction = () => [
  { title: "자연과학 | 리담변리사학원" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const subject: ScienceSubjectSlug =
    normalizeScienceSlug(url.searchParams.get("subject") ?? "physics") ??
    "physics";
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  const [hub, allProgress] = await Promise.all([
    loadScienceHubData(client, user?.id ?? null, subject),
    user ? getAllScienceSubjectsProgress(client, user.id) : Promise.resolve(null),
  ]);
  return { subject, ...hub, allProgress };
}

export default function ScienceIndex({ loaderData }: Route.ComponentProps) {
  const {
    subject,
    sections,
    years,
    progress,
    bookmarks,
    resume,
    wrongCount,
    allProgress,
  } = loaderData;
  return (
    <div className="bg-background">
      <ScienceSubjectBar
        active={subject}
        progress={allProgress}
        preventScrollReset
      />

      {/* 선택 과목 내용 — 과목별 화면과 동일 뷰를 인라인으로 */}
      <ScienceHubView
        subject={subject}
        sections={sections}
        years={years}
        progress={progress}
        bookmarks={bookmarks}
        resume={resume}
        wrongCount={wrongCount}
      />
    </div>
  );
}
