// 맞춤 퀴즈 — 유형/연도/극성/범위 + 모드 + 문항수 골라서 세션 시작.
// scope_type='filter' 세션. 문항수 만큼 무작위 샘플링 후 quiz_sessions 에 freeze.

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  PlayIcon,
  ShuffleIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import { Form, Link, data, redirect } from "react-router";
import { z } from "zod";

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
  if (!ld) return [{ title: "맞춤 퀴즈 | 리담변리사학원" }];
  return [{ title: `${ld.subject.name} 맞춤 퀴즈 | 리담변리사학원` }];
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
            <SlidersHorizontalIcon className="size-3.5" />
            QUIZ SETUP
          </p>
          <h1 className="text-[28px] font-extrabold tracking-tight text-foreground leading-tight">
            맞춤 퀴즈 만들기
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
            필터로 범위를 좁히고, 풀이 모드를 선택하세요.
          </p>
        </header>

        <Form method="post" className="space-y-4">
          {/* Filter card */}
          <div className="rounded-xl border bg-card shadow-sm">
            <div className="px-6 pt-5 pb-1">
              <p className="font-mono text-[11px] font-bold tracking-[0.10em] uppercase text-link">
                필터
              </p>
            </div>
            <div className="divide-y divide-border/60 px-6 pb-4">
              <FilterRow label="출처">
                <FieldSelect name="origin" placeholder="전체">
                  {ORIGIN_OPTS.map((o) => (
                    <option key={o} value={o}>
                      {ORIGIN_LABEL[o]}
                    </option>
                  ))}
                </FieldSelect>
              </FilterRow>
              <FilterRow label="연도">
                <FieldSelect name="year" placeholder="전체">
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}년
                    </option>
                  ))}
                </FieldSelect>
              </FilterRow>
              <FilterRow label="유형">
                <FieldSelect name="format" placeholder="전체">
                  {FORMAT_OPTS.map((f) => (
                    <option key={f} value={f}>
                      {FORMAT_LABEL[f]}
                    </option>
                  ))}
                </FieldSelect>
              </FilterRow>
              <FilterRow label="극성">
                <FieldSelect name="polarity" placeholder="전체">
                  {POLARITY_OPTS.map((p) => (
                    <option key={p} value={p}>
                      {POLARITY_LABEL[p]}
                    </option>
                  ))}
                </FieldSelect>
              </FilterRow>
              <FilterRow label="범위">
                <FieldSelect name="scope" placeholder="전체">
                  {SCOPE_OPTS.map((s) => (
                    <option key={s} value={s}>
                      {SCOPE_LABEL[s]}
                    </option>
                  ))}
                </FieldSelect>
              </FilterRow>
            </div>
          </div>

          {/* Session card */}
          <div className="rounded-xl border bg-card shadow-sm">
            <div className="px-6 pt-5 pb-1">
              <p className="font-mono text-[11px] font-bold tracking-[0.10em] uppercase text-link">
                학습 회차
              </p>
            </div>
            <div className="divide-y divide-border/60 px-6 pb-4">
              <FilterRow label="문항 수">
                <div className="flex flex-wrap gap-1.5">
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
              </FilterRow>
              <FilterRow label="모드">
                <div className="flex flex-wrap gap-1.5">
                  <RadioPill
                    name="mode"
                    value="study"
                    label="학습 (즉시 해설)"
                    defaultChecked
                  />
                  <RadioPill
                    name="mode"
                    value="exam"
                    label="시험 (타이머)"
                  />
                </div>
              </FilterRow>
              <FilterRow label="기타">
                <label className="inline-flex cursor-pointer items-center gap-2 text-[13px]">
                  <input
                    type="checkbox"
                    name="shuffle"
                    value="on"
                    defaultChecked
                    className="size-4 accent-primary"
                  />
                  <ShuffleIcon className="size-3.5 text-muted-foreground" />
                  <span>선지 셔플</span>
                </label>
              </FilterRow>
            </div>
          </div>

          {/* Error */}
          {errorMsg ? (
            <p
              className="text-sm text-rose-600 dark:text-rose-400"
              role="alert"
              data-testid="setup-error"
            >
              {errorMsg}
            </p>
          ) : null}

          {/* CTA banner */}
          <div className="flex items-center justify-between gap-4 rounded-xl bg-primary/10 px-6 py-5 dark:bg-primary/15">
            <div>
              <p className="text-[14px] font-bold leading-[1.4] tracking-tight text-foreground">
                필터 설정 완료
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                퀴즈 시작 버튼을 눌러 바로 시작하세요
              </p>
            </div>
            <button
              type="submit"
              data-testid="setup-start"
              className={cn(
                "inline-flex h-11 shrink-0 items-center gap-2 rounded-full",
                "bg-primary px-[22px] text-[14px] font-semibold text-primary-foreground",
                "shadow-[0_0_0_1px_rgba(0,0,0,0.02),0_4px_12px_rgba(45,91,168,0.22)]",
                "transition-[transform,box-shadow] hover:-translate-y-px active:translate-y-0",
              )}
            >
              <PlayIcon className="size-4 shrink-0" />
              퀴즈 시작
              <ArrowRightIcon className="size-3.5 shrink-0" />
            </button>
          </div>
        </Form>
      </div>
    </div>
  );
}

function FilterRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[90px_1fr] items-center gap-3 py-2.5">
      <span className="text-[12px] font-semibold text-muted-foreground">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5 items-center">{children}</div>
    </div>
  );
}

function FieldSelect({
  name,
  placeholder,
  children,
}: {
  name: string;
  placeholder: string;
  children: React.ReactNode;
}) {
  return (
    <select
      name={name}
      defaultValue=""
      className="border-input bg-background h-8 rounded-full border px-3 text-[13px] font-medium focus:outline-none focus:ring-2 focus:ring-primary/40"
    >
      <option value="">{placeholder}</option>
      {children}
    </select>
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
        "inline-flex h-[26px] cursor-pointer items-center rounded-full border px-2.5",
        "text-[12px] font-semibold transition-colors whitespace-nowrap",
        "border-border bg-background text-foreground",
        "has-[:checked]:border-primary/50 has-[:checked]:bg-primary/10 has-[:checked]:text-link",
        "hover:bg-muted",
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        className="sr-only"
      />
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
