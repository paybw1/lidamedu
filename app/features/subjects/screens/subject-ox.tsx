// 과목 전체 OX 풀이 — 무작위 순으로 풀어 나가는 단일 화면.

import { ArrowLeftIcon, ShuffleIcon } from "lucide-react";
import { useMemo } from "react";
import { Link, data } from "react-router";

import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import makeServerClient from "~/core/lib/supa-client.server";
import { OxQuestionsPanel } from "~/features/problems/components/ox-questions-panel";
import { getOxQuestionsForSubject } from "~/features/problems/queries.server";
import {
  LAW_SUBJECTS,
  lawSubjectSlugSchema,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/subject-ox";

export const meta: Route.MetaFunction = ({ data: ld }) => {
  if (!ld) return [{ title: "정오문제 풀이 | Lidam Edu" }];
  return [{ title: `${ld.subject.name} 정오문제 | Lidam Edu` }];
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

  const items = await getOxQuestionsForSubject(client, lawCode, 200);
  return { subject: LAW_SUBJECTS[lawCode], items };
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
  const { subject, items } = loaderData;
  // 진입 시 1회 셔플 (서버 사이드 useMemo 는 idempotent — Date.now seed 없음).
  const shuffled = useMemo(() => shuffle(items), [items]);

  return (
    <div className="mx-auto w-full max-w-screen-md px-5 py-6 md:px-10 md:py-8">
      <Link
        to={`/subjects/${subject.slug}?tab=problems`}
        viewTransition
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeftIcon className="size-4" /> {subject.name} 문제 색인
      </Link>

      <header className="mb-6 space-y-2">
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
          <ShuffleIcon className="size-3.5" /> 정오문제 무작위 풀이
        </p>
        <h1 className="text-2xl font-bold tracking-tight">
          {subject.name} 정오문제
        </h1>
        <p className="text-muted-foreground text-sm">
          전체 OX 가능 지문{" "}
          <span className="text-foreground font-bold">{shuffled.length}</span>
          건 · 무작위 순서
        </p>
      </header>

      <Card>
        <CardHeader>
          <p className="text-sm font-semibold">지문</p>
        </CardHeader>
        <CardContent>
          <OxQuestionsPanel items={shuffled} subject={subject.slug} />
        </CardContent>
      </Card>
    </div>
  );
}
