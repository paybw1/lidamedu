// 자연과학 맞춤 퀴즈 — 단원 선택 + 모드 + 문항수 → 세션 생성.
// 풀이 화면(viewer) 은 5.4.A 의 객관식 viewer 와 분리해야 하므로 추후 별도 화면.
// 현 단계는 세션을 만들고 result 페이지로 redirect (문제 없으면 빈 세션 표시).

import { ArrowLeftIcon, PlayIcon, SlidersHorizontalIcon } from "lucide-react";
import { Form, Link, data, redirect } from "react-router";
import { z } from "zod";

import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { createQuizSession } from "~/features/study/queries.server";
import {
  SCIENCE_SUBJECTS,
  normalizeScienceSlug,
} from "~/features/subjects/lib/science";
import {
  listScienceProblems,
  listScienceYears,
  listSectionsWithCounts,
} from "~/features/subjects/lib/science.server";

import type { Route } from "./+types/quiz-setup";

const COUNT_OPTS = [10, 20, 30, 50] as const;
const PER_PROBLEM_LIMIT_SEC = 60;

export const meta: Route.MetaFunction = ({ data: ld }) => {
  if (!ld) return [{ title: "자연과학 맞춤 퀴즈 | 리담변리사학원" }];
  return [{ title: `${ld.subjectMeta.name} 맞춤 퀴즈 | 리담변리사학원` }];
};

export async function loader({ params, request }: Route.LoaderArgs) {
  const subject = normalizeScienceSlug(params.scienceSubject ?? "");
  if (!subject) throw data("Unknown science subject", { status: 404 });

  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const [sections, years] = await Promise.all([
    listSectionsWithCounts(client, subject),
    listScienceYears(client, subject),
  ]);
  return {
    scienceSubject: subject,
    subjectMeta: SCIENCE_SUBJECTS[subject],
    sections,
    years,
  };
}

const actionSchema = z.object({
  sectionIds: z.array(z.string().uuid()).optional(),
  years: z.array(z.coerce.number().int()).optional(),
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
  const years = form.getAll("years").map(String).filter(Boolean);
  const parsed = actionSchema.safeParse({
    sectionIds,
    years,
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
    parsed.data.years ?? [],
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

  // 연도별 "바로 풀기"(ordered) 는 번호 순서대로 전부, 그 외엔 무작위 + 문항수 제한.
  const ordered = form.get("ordered") === "1";
  let problemIds: string[];
  if (ordered) {
    problemIds = [...candidates]
      .sort((a, b) => (a.problemNumber ?? 0) - (b.problemNumber ?? 0))
      .map((p) => p.problemId);
  } else {
    const pool = candidates.map((p) => p.problemId);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    problemIds = pool.slice(0, Math.min(parsed.data.count, pool.length));
  }

  const sessionId = await createQuizSession(client, user.id, {
    mode: parsed.data.mode,
    scienceSubject: subject,
    scopeType: "filter",
    scopePayload: {
      sectionIds: parsed.data.sectionIds ?? [],
      years: parsed.data.years ?? [],
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
  const { scienceSubject, subjectMeta, sections, years } = loaderData;
  const errorMsg =
    actionData && "error" in actionData ? actionData.error : null;
  const totalProblems = sections.reduce((s, x) => s + x.problemCount, 0);
  const sciencePath =
    scienceSubject === "earth_science" ? "earth-science" : scienceSubject;

  return (
    <div className="min-h-[calc(100vh-56px)] bg-background">
      <div className="mx-auto w-full max-w-screen-md px-5 py-8 md:px-10 md:py-10">
        <Link
          to={`/subjects/science/${sciencePath}`}
          viewTransition
          className="text-muted-foreground hover:text-foreground mb-5 inline-flex items-center gap-1 text-sm transition-colors"
        >
          <ArrowLeftIcon className="size-4" /> {subjectMeta.name} 단원
        </Link>

        <header className="mb-8 space-y-2">
          <p className="text-link inline-flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-widest">
            <SlidersHorizontalIcon className="size-3" /> 자연과학 맞춤 퀴즈
          </p>
          <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">
            <span className="mr-2 text-xl">{subjectMeta.emoji}</span>
            {subjectMeta.name}
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            단원·문항 수·모드를 선택해 퀴즈 회차를 생성합니다.
            총 등록된 문제: <span className="tabular-nums font-semibold">{totalProblems}</span>.
          </p>
        </header>

        <Form method="post" className="space-y-4">

          {/* Section filter card */}
          <div className="rounded-xl border bg-card shadow-sm">
            <div className="border-b px-6 py-4">
              <h2 className="text-sm font-bold">단원</h2>
              <p className="text-muted-foreground mt-0.5 text-xs">
                선택하지 않으면 전체 단원에서 출제됩니다.
              </p>
            </div>
            <div className="divide-y px-6 py-2">
              {sections.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  등록된 단원이 없습니다.
                </p>
              ) : (
                sections.map((s) => (
                  <label
                    key={s.sectionId}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 py-3 text-sm transition-colors hover:text-foreground",
                      s.problemCount === 0
                        ? "cursor-not-allowed opacity-40"
                        : "text-foreground",
                    )}
                  >
                    <input
                      type="checkbox"
                      name="sectionIds"
                      value={s.sectionId}
                      disabled={s.problemCount === 0}
                      className="size-4 accent-primary"
                    />
                    <span className="flex-1">{s.label}</span>
                    <span className="text-muted-foreground font-mono text-[11px] tabular-nums">
                      {s.problemCount}문제
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>

          {/* Year filter card — 기출 연도별 분류 */}
          {years.length > 0 ? (
            <div className="rounded-xl border bg-card shadow-sm">
              <div className="border-b px-6 py-4">
                <h2 className="text-sm font-bold">출제 연도</h2>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  선택하지 않으면 전체 연도에서 출제됩니다.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 px-6 py-4">
                {years.map((y) => (
                  <label key={y.year} className="cursor-pointer">
                    <input
                      type="checkbox"
                      name="years"
                      value={y.year}
                      className="peer sr-only"
                    />
                    <span
                      className={cn(
                        "inline-flex h-9 items-center justify-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition-all",
                        "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground",
                        "peer-checked:border-primary peer-checked:bg-primary/10 peer-checked:text-link",
                      )}
                    >
                      {y.year}년
                      <span className="text-[11px] font-normal tabular-nums opacity-70">
                        {y.count}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          {/* Count card */}
          <div className="rounded-xl border bg-card shadow-sm">
            <div className="border-b px-6 py-4">
              <h2 className="text-sm font-bold">문항 수</h2>
            </div>
            <div className="flex flex-wrap gap-2 px-6 py-4">
              {COUNT_OPTS.map((n) => (
                <label key={n} className="cursor-pointer">
                  <input
                    type="radio"
                    name="count"
                    value={n}
                    defaultChecked={n === 20}
                    className="peer sr-only"
                  />
                  <span
                    className={cn(
                      "inline-flex h-9 items-center justify-center rounded-full border px-4 text-sm font-semibold transition-all",
                      "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground",
                      "peer-checked:border-primary peer-checked:bg-primary/10 peer-checked:text-link",
                    )}
                  >
                    {n}문제
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Mode card */}
          <div className="rounded-xl border bg-card shadow-sm">
            <div className="border-b px-6 py-4">
              <h2 className="text-sm font-bold">모드</h2>
            </div>
            <div className="flex flex-wrap gap-2 px-6 py-4">
              {(
                [
                  { value: "study", label: "학습 모드 (즉시 해설)", defaultChecked: true },
                  { value: "exam", label: "시험 모드 (타이머 + 일괄 제출)", defaultChecked: false },
                ] as const
              ).map(({ value, label, defaultChecked }) => (
                <label key={value} className="cursor-pointer">
                  <input
                    type="radio"
                    name="mode"
                    value={value}
                    defaultChecked={defaultChecked}
                    className="peer sr-only"
                  />
                  <span
                    className={cn(
                      "inline-flex h-9 items-center justify-center rounded-full border px-4 text-sm font-semibold transition-all",
                      "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground",
                      "peer-checked:border-primary peer-checked:bg-primary/10 peer-checked:text-link",
                    )}
                  >
                    {label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {errorMsg ? (
            <p
              className="text-sm text-rose-600 dark:text-rose-400"
              role="alert"
            >
              {errorMsg}
            </p>
          ) : null}

          <div className="pt-1">
            <button
              type="submit"
              disabled={totalProblems === 0}
              className={cn(
                "inline-flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-bold transition-all",
                totalProblems > 0
                  ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
                  : "cursor-not-allowed bg-muted text-muted-foreground",
              )}
            >
              <PlayIcon className="size-4" /> 퀴즈 시작
            </button>
            {totalProblems === 0 ? (
              <p className="text-muted-foreground mt-2 text-center text-xs">
                등록된 문제가 없습니다. 운영자가 문제를 추가하면 풀이를 시작할 수 있습니다.
              </p>
            ) : null}
          </div>
        </Form>

        <p className="text-muted-foreground mt-8 text-[11px]">
          ⓘ 자연과학 풀이 화면(viewer) 은 5.4.A 객관식 자산을 재사용/분기해 별도
          구현 예정. 현재는 회차 생성까지 동작합니다.
        </p>
      </div>
    </div>
  );
}
