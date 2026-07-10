// 과목 전체 OX 풀이 — 무작위 순으로 풀어 나가는 단일 화면.

import { ArrowLeftIcon, ShuffleIcon } from "lucide-react";
import { useMemo } from "react";
import { Link, data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { OxQuestionsPanel } from "~/features/problems/components/ox-questions-panel";
import { getOxQuestionsForSubject } from "~/features/problems/queries.server";
import {
  LAW_SUBJECTS,
  lawSubjectSlugSchema,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/subject-ox";

export const meta: Route.MetaFunction = ({ data: ld }) => {
  if (!ld) return [{ title: "정오문제 풀이 | 리담변리사학원" }];
  return [{ title: `${ld.subject.name} 정오문제 | 리담변리사학원` }];
};

export async function loader({ params, request }: Route.LoaderArgs) {
  const subjectParse = lawSubjectSlugSchema.safeParse(params.subject);
  if (!subjectParse.success) throw data("Unknown subject", { status: 404 });
  const lawCode = subjectParse.data;

  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const role = await getStaffRole(client, user.id);
  const items = await getOxQuestionsForSubject(client, lawCode, 200, {
    includeUnapproved: role !== null,
  });
  return {
    subject: LAW_SUBJECTS[lawCode],
    items,
    isStaff: role !== null,
    currentUserId: user.id,
    isAdmin: role === "admin" || role === "manager",
  };
}

function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export default function SubjectOx({ loaderData }: Route.ComponentProps) {
  const { subject, items, isStaff, currentUserId, isAdmin } = loaderData;
  // 셔플은 지문 구성(refId 시그니처)이 바뀔 때만 재계산한다.
  // ★채점(attempt) POST 는 loader 를 revalidate 하여 items 배열이 새 참조로 다시 내려오는데,
  //   [items] 참조로 memo 하면 그때마다 재셔플→현재 카드가 다른 지문으로 교체되어
  //   "해설 보는 중 다음 문제로 튀는" 버그가 났다. 내용 시그니처로 고정해 방지.
  const itemsSig = items.map((it) => it.refId).join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const shuffled = useMemo(() => shuffle(items), [itemsSig]);

  return (
    <div className="min-h-[calc(100vh-56px)] bg-background">
      <div className="mx-auto w-full max-w-[720px] px-6 py-8 pb-20">
        {/* Back link */}
        <div className="mb-4">
          <Link
            to={`/subjects/${subject.slug}?tab=problems`}
            viewTransition
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-link hover:text-link/80 transition-colors"
          >
            <ArrowLeftIcon className="size-3.5" />
            {subject.name} 문제 색인
          </Link>
        </div>

        {/* Header */}
        <header className="mb-6">
          <p className="mb-2 inline-flex items-center gap-1.5 font-mono text-[11px] font-bold tracking-[0.10em] uppercase text-link">
            <ShuffleIcon className="size-3.5" />
            정오문제 퀴즈
          </p>
          <h1 className="text-[28px] font-extrabold tracking-tight text-foreground leading-tight">
            정오문제 무작위
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
            {shuffled.length > 0 ? (
              <>
                정오문제로 풀 수 있는 전체 지문{" "}
                <span className="font-bold tabular-nums text-foreground">
                  {shuffled.length}
                </span>
                건 · 무작위 순서 · 학습 모드 (즉시 피드백)
              </>
            ) : (
              "등록된 정오문제 지문이 없습니다."
            )}
          </p>
        </header>

        {shuffled.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-20 text-center">
            <ShuffleIcon className="mb-3 size-10 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">
              정오문제로 풀 수 있는 지문이 아직 없습니다.
            </p>
          </div>
        ) : (
          /* OX panel — redesigned outer shell, preserve inner panel component */
          <div className="rounded-xl border bg-card shadow-sm">
            {/* Card header — eyebrow label */}
            <div className="border-b border-border/60 px-6 py-4">
              <p className="font-mono text-[11px] font-bold tracking-[0.10em] uppercase text-muted-foreground">
                지문
              </p>
            </div>

            {/* Panel content — OxQuestionsPanel handles all logic/state */}
            <div className="px-6 py-5">
              <OxQuestionsPanel
                items={shuffled}
                subject={subject.slug}
                isStaff={isStaff}
                currentUserId={currentUserId}
                isAdmin={isAdmin}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
