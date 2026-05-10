// 자연과학 맞춤 퀴즈 — 단원 선택 + 모드 + 문항수 → 세션 생성.
// 풀이 화면(viewer) 은 5.4.A 의 객관식 viewer 와 분리해야 하므로 추후 별도 화면.
// 현 단계는 세션을 만들고 result 페이지로 redirect (문제 없으면 빈 세션 표시).

import { ArrowLeftIcon, PlayIcon, SlidersHorizontalIcon } from "lucide-react";
import { Form, Link, data, redirect } from "react-router";
import { z } from "zod";

import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { createQuizSession } from "~/features/study/queries.server";
import {
  SCIENCE_SUBJECTS,
  normalizeScienceSlug,
} from "~/features/subjects/lib/science";
import {
  listScienceProblems,
  listSectionsWithCounts,
} from "~/features/subjects/lib/science.server";

import type { Route } from "./+types/quiz-setup";

const COUNT_OPTS = [10, 20, 30, 50] as const;
const PER_PROBLEM_LIMIT_SEC = 60;

export const meta: Route.MetaFunction = ({ data: ld }) => {
  if (!ld) return [{ title: "자연과학 맞춤 퀴즈 | Lidam Edu" }];
  return [{ title: `${ld.subjectMeta.name} 맞춤 퀴즈 | Lidam Edu` }];
};

export async function loader({ params, request }: Route.LoaderArgs) {
  const subject = normalizeScienceSlug(params.scienceSubject ?? "");
  if (!subject) throw data("Unknown science subject", { status: 404 });

  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const sections = await listSectionsWithCounts(client, subject);
  return {
    scienceSubject: subject,
    subjectMeta: SCIENCE_SUBJECTS[subject],
    sections,
  };
}

const actionSchema = z.object({
  sectionIds: z.array(z.string().uuid()).optional(),
  count: z.coerce.number().int().min(1).max(200).default(20),
  mode: z.enum(["study", "exam"]).default("study"),
});

export async function action({ params, request }: Route.ActionArgs) {
  const subject = normalizeScienceSlug(params.scienceSubject ?? "");
  if (!subject) throw data("Unknown science subject", { status: 404 });

  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const form = await request.formData();
  const sectionIds = form.getAll("sectionIds").map(String).filter(Boolean);
  const parsed = actionSchema.safeParse({
    sectionIds,
    count: form.get("count"),
    mode: form.get("mode"),
  });
  if (!parsed.success) {
    return data({ error: "Invalid input" }, { status: 400 });
  }

  const candidates = await listScienceProblems(
    client,
    subject,
    parsed.data.sectionIds ?? [],
  );
  if (candidates.length === 0) {
    return data(
      {
        error:
          "조건에 맞는 자연과학 문제가 없습니다. 운영자에게 문제 등록을 요청해 주세요.",
      },
      { status: 400 },
    );
  }

  const pool = candidates.map((p) => p.problemId);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const problemIds = pool.slice(0, Math.min(parsed.data.count, pool.length));

  const sessionId = await createQuizSession(client, user.id, {
    mode: parsed.data.mode,
    scienceSubject: subject,
    scopeType: "filter",
    scopePayload: {
      sectionIds: parsed.data.sectionIds ?? [],
      requestedCount: parsed.data.count,
    },
    problemIds,
    timeLimitSec:
      parsed.data.mode === "exam"
        ? Math.max(60, problemIds.length * PER_PROBLEM_LIMIT_SEC)
        : null,
  });

  const sciencePath =
    subject === "earth_science" ? "earth-science" : subject;
  return redirect(
    `/subjects/science/${sciencePath}/problems/${problemIds[0]}?session=${sessionId}`,
  );
}

export default function ScienceQuizSetup({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { scienceSubject, subjectMeta, sections } = loaderData;
  const errorMsg =
    actionData && "error" in actionData ? actionData.error : null;
  const totalProblems = sections.reduce((s, x) => s + x.problemCount, 0);

  return (
    <div className="mx-auto w-full max-w-screen-md px-5 py-6 md:px-10 md:py-8">
      <Link
        to={`/subjects/science/${scienceSubject === "earth_science" ? "earth-science" : scienceSubject}`}
        viewTransition
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeftIcon className="size-4" /> {subjectMeta.name} 단원
      </Link>

      <header className="mb-6 space-y-2">
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
          <SlidersHorizontalIcon className="size-3.5" /> 자연과학 맞춤 퀴즈
        </p>
        <h1 className="text-2xl font-bold tracking-tight">
          <span className="mr-2">{subjectMeta.emoji}</span>
          {subjectMeta.name}
        </h1>
        <p className="text-muted-foreground text-xs">
          단원·문항 수·모드를 선택해 퀴즈 세션을 생성합니다. 총 등록된 문제:{" "}
          {totalProblems}.
        </p>
      </header>

      <Form method="post" className="space-y-5">
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold">단원 (선택 안 하면 전체)</h2>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {sections.map((s) => (
              <label
                key={s.sectionId}
                className={cn(
                  "flex items-center gap-2 rounded-md border p-2 text-sm",
                  s.problemCount === 0 && "opacity-50",
                )}
              >
                <input
                  type="checkbox"
                  name="sectionIds"
                  value={s.sectionId}
                  disabled={s.problemCount === 0}
                />
                <span className="flex-1">{s.label}</span>
                <span className="text-muted-foreground text-[11px] tabular-nums">
                  {s.problemCount} 문제
                </span>
              </label>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold">문항 수</h2>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {COUNT_OPTS.map((n) => (
              <label key={n} className="cursor-pointer">
                <input
                  type="radio"
                  name="count"
                  value={n}
                  defaultChecked={n === 20}
                  className="peer sr-only"
                />
                <span className="peer-checked:bg-primary peer-checked:text-primary-foreground peer-checked:border-primary inline-flex items-center justify-center rounded-md border px-3 py-1.5 text-sm">
                  {n}문제
                </span>
              </label>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold">모드</h2>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <label className="cursor-pointer">
              <input
                type="radio"
                name="mode"
                value="study"
                defaultChecked
                className="peer sr-only"
              />
              <span className="peer-checked:bg-primary peer-checked:text-primary-foreground peer-checked:border-primary inline-flex items-center justify-center rounded-md border px-3 py-1.5 text-sm">
                학습 (즉시 해설)
              </span>
            </label>
            <label className="cursor-pointer">
              <input
                type="radio"
                name="mode"
                value="exam"
                className="peer sr-only"
              />
              <span className="peer-checked:bg-primary peer-checked:text-primary-foreground peer-checked:border-primary inline-flex items-center justify-center rounded-md border px-3 py-1.5 text-sm">
                시험 (타이머 + 일괄 제출)
              </span>
            </label>
          </CardContent>
        </Card>

        {errorMsg ? (
          <p className="text-rose-600 text-sm">{errorMsg}</p>
        ) : null}

        <Button type="submit" className="w-full" disabled={totalProblems === 0}>
          <PlayIcon className="size-4" /> 시작
        </Button>
        {totalProblems === 0 ? (
          <p className="text-muted-foreground text-center text-xs">
            등록된 문제가 없습니다. 운영자가 문제를 추가하면 풀이를 시작할 수
            있습니다.
          </p>
        ) : null}
      </Form>

      <p className="text-muted-foreground mt-6 text-[11px]">
        ⓘ 자연과학 풀이 화면(viewer) 은 5.4.A 객관식 자산을 재사용/분기해 별도
        구현 예정. 현재는 세션 생성까지 동작합니다.
      </p>
    </div>
  );
}
