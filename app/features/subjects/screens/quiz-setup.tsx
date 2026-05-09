// 맞춤 퀴즈 — 유형/연도/극성/범위 + 모드 + 문항수 골라서 세션 시작.
// scope_type='filter' 세션. 문항수 만큼 무작위 샘플링 후 quiz_sessions 에 freeze.

import {
  ArrowLeftIcon,
  PlayIcon,
  ShuffleIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import { Form, Link, data, redirect } from "react-router";
import { z } from "zod";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  FORMAT_LABEL,
  ORIGIN_LABEL,
  POLARITY_LABEL,
  SCOPE_LABEL,
  type ProblemFormat,
  type ProblemOrigin,
  type ProblemPolarity,
  type ProblemScope,
} from "~/features/problems/labels";
import {
  listProblemYears,
  listProblemsBySubject,
} from "~/features/problems/queries.server";
import { createQuizSession } from "~/features/study/queries.server";
import {
  LAW_SUBJECTS,
  lawSubjectSlugSchema,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/quiz-setup";

const ORIGIN_OPTS: ProblemOrigin[] = [
  "past_exam",
  "past_exam_variant",
  "mock",
  "expected",
];
const FORMAT_OPTS: ProblemFormat[] = ["mc_short", "mc_box", "mc_case"];
const POLARITY_OPTS: ProblemPolarity[] = ["positive", "negative"];
const SCOPE_OPTS: ProblemScope[] = ["unit", "comprehensive"];
const COUNT_OPTS = [10, 20, 30, 50, 100] as const;
const PER_PROBLEM_LIMIT_SEC = 90;

export const meta: Route.MetaFunction = ({ data: ld }) => {
  if (!ld) return [{ title: "맞춤 퀴즈 | Lidam Edu" }];
  return [{ title: `${ld.subject.name} 맞춤 퀴즈 | Lidam Edu` }];
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

  const years = await listProblemYears(client, lawCode);
  return { subject: LAW_SUBJECTS[lawCode], years };
}

const actionSchema = z.object({
  origin: z.enum(["past_exam", "past_exam_variant", "mock", "expected"]).optional(),
  year: z.coerce.number().int().min(1900).max(2100).optional(),
  format: z.enum(["mc_short", "mc_box", "mc_case"]).optional(),
  polarity: z.enum(["positive", "negative"]).optional(),
  scope: z.enum(["unit", "comprehensive"]).optional(),
  count: z.coerce.number().int().min(1).max(200).default(20),
  mode: z.enum(["study", "exam"]).default("study"),
  shuffle: z.union([z.literal("on"), z.literal("off")]).optional(),
});

export async function action({ params, request }: Route.ActionArgs) {
  const subjectParse = lawSubjectSlugSchema.safeParse(params.subject);
  if (!subjectParse.success) throw data("Unknown subject", { status: 404 });
  const lawCode = subjectParse.data;

  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const form = await request.formData();
  const raw: Record<string, FormDataEntryValue | undefined> = {};
  for (const [k, v] of form.entries()) {
    if (typeof v === "string" && v !== "") raw[k] = v;
  }
  const parsed = actionSchema.safeParse(raw);
  if (!parsed.success) {
    return data({ error: "Invalid input" }, { status: 400 });
  }
  const { origin, year, format, polarity, scope, count, mode } = parsed.data;
  const shuffle = parsed.data.shuffle !== "off"; // 기본 on

  const candidates = await listProblemsBySubject(client, lawCode, {
    origin,
    year,
    format,
    polarity,
    scope,
  });
  if (candidates.length === 0) {
    return data(
      { error: "조건에 맞는 문제가 없습니다. 필터를 완화해 주세요." },
      { status: 400 },
    );
  }

  // 샘플링.
  let pool = candidates.map((p) => p.problemId);
  if (shuffle) pool = shuffleArray(pool);
  const problemIds = pool.slice(0, Math.min(count, pool.length));

  const sessionId = await createQuizSession(client, user.id, {
    mode,
    lawCode,
    scopeType: "filter",
    scopePayload: {
      filters: { origin, year, format, polarity, scope },
      requestedCount: count,
      shuffle,
    },
    problemIds,
    timeLimitSec:
      mode === "exam" ? Math.max(60, problemIds.length * PER_PROBLEM_LIMIT_SEC) : null,
  });

  const params2 = new URLSearchParams();
  params2.set("session", sessionId);
  params2.set("mode", mode);
  return redirect(
    `/subjects/${lawCode}/problems/${problemIds[0]}?${params2.toString()}`,
  );
}

export default function QuizSetup({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { subject, years } = loaderData;
  const errorMsg =
    actionData && "error" in actionData ? actionData.error : null;

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
          <SlidersHorizontalIcon className="size-3.5" /> 맞춤 퀴즈
        </p>
        <h1 className="text-2xl font-bold tracking-tight">
          {subject.name} 맞춤 퀴즈 설정
        </h1>
        <p className="text-muted-foreground text-sm">
          유형·연도·극성을 골라 N문제 묶음으로 풀어보세요. 시험 모드는 문항당
          90초 제한 + 일괄 제출입니다.
        </p>
      </header>

      <Form method="post" className="space-y-5">
        <Card>
          <CardHeader>
            <p className="text-sm font-semibold">필터</p>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FieldSelect label="출처" name="origin" placeholder="전체">
              {ORIGIN_OPTS.map((o) => (
                <option key={o} value={o}>
                  {ORIGIN_LABEL[o]}
                </option>
              ))}
            </FieldSelect>
            <FieldSelect label="연도" name="year" placeholder="전체">
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}년
                </option>
              ))}
            </FieldSelect>
            <FieldSelect label="유형" name="format" placeholder="전체">
              {FORMAT_OPTS.map((f) => (
                <option key={f} value={f}>
                  {FORMAT_LABEL[f]}
                </option>
              ))}
            </FieldSelect>
            <FieldSelect label="극성" name="polarity" placeholder="전체">
              {POLARITY_OPTS.map((p) => (
                <option key={p} value={p}>
                  {POLARITY_LABEL[p]}
                </option>
              ))}
            </FieldSelect>
            <FieldSelect label="범위" name="scope" placeholder="전체">
              {SCOPE_OPTS.map((s) => (
                <option key={s} value={s}>
                  {SCOPE_LABEL[s]}
                </option>
              ))}
            </FieldSelect>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <p className="text-sm font-semibold">세션</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-muted-foreground mb-2 text-xs tracking-wide uppercase">
                문항수
              </p>
              <div className="flex flex-wrap gap-2">
                {COUNT_OPTS.map((n, i) => (
                  <RadioPill
                    key={n}
                    name="count"
                    value={String(n)}
                    label={`${n}문항`}
                    defaultChecked={i === 1}
                  />
                ))}
              </div>
            </div>

            <div>
              <p className="text-muted-foreground mb-2 text-xs tracking-wide uppercase">
                모드
              </p>
              <div className="flex flex-wrap gap-2">
                <RadioPill
                  name="mode"
                  value="study"
                  label="학습 모드 (즉시 해설)"
                  defaultChecked
                />
                <RadioPill
                  name="mode"
                  value="exam"
                  label="시험 모드 (타이머 + 일괄 제출)"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="shuffle"
                value="on"
                defaultChecked
                className="size-4"
              />
              <span className="inline-flex items-center gap-1">
                <ShuffleIcon className="size-3.5" /> 문제 순서 섞기
              </span>
            </label>
          </CardContent>
        </Card>

        {errorMsg ? (
          <p
            className="text-sm text-rose-600 dark:text-rose-400"
            role="alert"
            data-testid="setup-error"
          >
            {errorMsg}
          </p>
        ) : null}

        <div className="flex justify-end">
          <Button type="submit" size="lg" data-testid="setup-start">
            <PlayIcon className="size-4" /> 시작
          </Button>
        </div>
      </Form>
    </div>
  );
}

function FieldSelect({
  label,
  name,
  placeholder,
  children,
}: {
  label: string;
  name: string;
  placeholder: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-muted-foreground text-xs tracking-wide uppercase">
        {label}
      </span>
      <select
        name={name}
        defaultValue=""
        className="border-input bg-background h-9 rounded-md border px-2 text-sm"
      >
        <option value="">{placeholder}</option>
        {children}
      </select>
    </label>
  );
}

function RadioPill({
  name,
  value,
  label,
  defaultChecked,
}: {
  name: string;
  value: string;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label
      className={cn(
        "border-input hover:bg-accent inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm",
        "has-[:checked]:border-primary has-[:checked]:bg-primary/10",
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        className="peer sr-only"
      />
      <Badge
        variant="outline"
        className="bg-background hidden h-4 px-1 text-[10px] peer-checked:inline-flex"
      >
        선택
      </Badge>
      {label}
    </label>
  );
}

function shuffleArray<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
