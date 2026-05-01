// 운영자 객관식 문제 편집 — 메타 (출처/유형/극성/연도/회차/scope) + 본문 + 5지문.

import { ArrowLeftIcon, SaveIcon } from "lucide-react";
import { Form, Link, data, redirect } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Textarea } from "~/core/components/ui/textarea";
import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  CHOICE_TYPE_COLOR,
  CHOICE_TYPE_LABEL,
  FORMAT_LABEL,
  ORIGIN_HAS_ROUND,
  ORIGIN_LABEL,
  POLARITY_LABEL,
  SCOPE_LABEL,
  getProblemById,
  type ProblemChoiceType,
  type ProblemFormat,
  type ProblemOrigin,
  type ProblemPolarity,
  type ProblemScope,
} from "~/features/problems/queries.server";
import { cn } from "~/core/lib/utils";

import type { Route } from "./+types/admin-problem-edit";

export const meta: Route.MetaFunction = ({ data: loaderData }) => {
  if (!loaderData) return [{ title: "문제 편집 | Lidam Edu" }];
  return [
    {
      title: `문제 #${loaderData.problem.problemNumber ?? "?"} 편집 | Lidam Edu`,
    },
  ];
};

const ORIGINS: ProblemOrigin[] = [
  "past_exam",
  "past_exam_variant",
  "mock",
  "expected",
];
const FORMATS: ProblemFormat[] = ["mc_short", "mc_box", "mc_case"];
const POLARITIES: ProblemPolarity[] = ["positive", "negative"];
const SCOPES: ProblemScope[] = ["unit", "comprehensive"];
const CHOICE_TYPES: ProblemChoiceType[] = ["statute", "precedent", "theory"];

export async function loader({ params, request }: Route.LoaderArgs) {
  const problemId = params.problemId;
  if (!problemId) throw data("Missing problemId", { status: 404 });
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });
  const problem = await getProblemById(client, problemId);
  if (!problem) throw data("Problem not found", { status: 404 });
  return { problem };
}

export async function action({ params, request }: Route.ActionArgs) {
  const problemId = params.problemId;
  if (!problemId) return { ok: false, error: "Missing problemId" } as const;
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" } as const;
  const role = await getStaffRole(client, user.id);
  if (!role) return { ok: false, error: "Forbidden" } as const;

  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "save");
  if (intent === "delete") {
    await client
      .from("problems")
      .update({ deleted_at: new Date().toISOString() })
      .eq("problem_id", problemId);
    throw redirect("/admin/problems");
  }

  // 메타 + body 업데이트.
  const update: Record<string, unknown> = {
    body_md: String(fd.get("bodyMd") ?? ""),
    origin: String(fd.get("origin") ?? "past_exam"),
    format: String(fd.get("format") ?? "mc_short"),
    polarity: stringOrNull(fd.get("polarity")),
    scope: stringOrNull(fd.get("scope")),
    year: numberOrNull(fd.get("year")),
    exam_round_no: numberOrNull(fd.get("examRoundNo")),
    problem_number: numberOrNull(fd.get("problemNumber")),
    updated_at: new Date().toISOString(),
  };
  const { error: pErr } = await client
    .from("problems")
    .update(update)
    .eq("problem_id", problemId);
  if (pErr) return { ok: false, error: pErr.message } as const;

  // choices — 각 choice 별로 독립 update. correct_index 도 함께.
  const correctIndex = numberOrNull(fd.get("correctIndex"));
  const choiceCount = numberOrNull(fd.get("choiceCount")) ?? 0;
  for (let i = 1; i <= choiceCount; i++) {
    const choiceId = String(fd.get(`choice_${i}_id`) ?? "");
    if (!choiceId) continue;
    const cUpdate: Record<string, unknown> = {
      body_md: String(fd.get(`choice_${i}_body`) ?? ""),
      explanation_md: stringOrNull(fd.get(`choice_${i}_explanation`)),
      choice_type: stringOrNull(fd.get(`choice_${i}_type`)),
      is_correct: correctIndex === i,
    };
    await client.from("problem_choices").update(cUpdate).eq("choice_id", choiceId);
  }
  return { ok: true } as const;
}

export default function AdminProblemEdit({ loaderData }: Route.ComponentProps) {
  const { problem } = loaderData;
  const showRound = ORIGIN_HAS_ROUND[problem.origin];
  const correctIndex =
    problem.choices.find((c) => c.isCorrect)?.choiceIndex ?? 0;
  return (
    <div className="mx-auto w-full max-w-screen-xl px-5 py-6 md:px-10 md:py-8">
      <Link
        to="/admin/problems"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeftIcon className="size-4" /> 객관식 문제 목록
      </Link>
      <header className="mb-6 space-y-2">
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          편집
        </p>
        <h1 className="text-2xl font-bold tracking-tight">
          {problem.primaryArticleLabel ?? "조문 미연결"}{" "}
          {problem.problemNumber ? (
            <span className="text-muted-foreground text-base font-normal">
              · 문제 #{problem.problemNumber}
            </span>
          ) : null}
        </h1>
      </header>

      <Form method="post" className="space-y-4">
        <input type="hidden" name="intent" value="save" />
        <input
          type="hidden"
          name="choiceCount"
          value={problem.choices.length}
        />

        <Card>
          <CardHeader>
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              메타
            </p>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <FormSelect
              name="origin"
              label="출처"
              defaultValue={problem.origin}
              options={ORIGINS.map((v) => ({
                value: v,
                label: ORIGIN_LABEL[v],
              }))}
            />
            <FormSelect
              name="format"
              label="유형"
              defaultValue={problem.format}
              options={FORMATS.map((v) => ({
                value: v,
                label: FORMAT_LABEL[v],
              }))}
            />
            <FormSelect
              name="polarity"
              label="극성"
              defaultValue={problem.polarity ?? ""}
              options={[
                { value: "", label: "—" },
                ...POLARITIES.map((v) => ({
                  value: v,
                  label: POLARITY_LABEL[v],
                })),
              ]}
            />
            <FormSelect
              name="scope"
              label="단원 / 종합"
              defaultValue={problem.scope ?? ""}
              options={[
                { value: "", label: "—" },
                ...SCOPES.map((v) => ({ value: v, label: SCOPE_LABEL[v] })),
              ]}
            />
            <FormInput
              name="year"
              label="연도"
              type="number"
              defaultValue={problem.year ?? ""}
              disabled={!showRound}
            />
            <FormInput
              name="examRoundNo"
              label="회차"
              type="number"
              defaultValue={problem.examRoundNo ?? ""}
              disabled={!showRound}
            />
            <FormInput
              name="problemNumber"
              label="문제 번호"
              type="number"
              defaultValue={problem.problemNumber ?? ""}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              본문
            </p>
          </CardHeader>
          <CardContent>
            <Textarea
              name="bodyMd"
              defaultValue={problem.bodyMd}
              rows={4}
              className="font-mono text-sm"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                지문 ({problem.choices.length})
              </p>
              {problem.unclassifiedChoices > 0 ? (
                <Badge
                  variant="outline"
                  className="border-amber-500 bg-amber-50 text-[10px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                >
                  미분류 {problem.unclassifiedChoices}
                </Badge>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {problem.choices.map((c) => (
              <div
                key={c.choiceId}
                className="border-input rounded-md border p-3 space-y-2"
              >
                <input
                  type="hidden"
                  name={`choice_${c.choiceIndex}_id`}
                  value={c.choiceId}
                />
                <div className="flex items-center gap-2">
                  <span className="bg-muted text-foreground inline-flex size-6 items-center justify-center rounded-full text-xs font-bold">
                    {c.choiceIndex}
                  </span>
                  <label className="inline-flex items-center gap-1 text-xs">
                    <input
                      type="radio"
                      name="correctIndex"
                      value={c.choiceIndex}
                      defaultChecked={c.choiceIndex === correctIndex}
                    />
                    정답
                  </label>
                  <div className="ml-auto">
                    <ChoiceTypeSelect
                      name={`choice_${c.choiceIndex}_type`}
                      defaultValue={c.choiceType ?? ""}
                    />
                  </div>
                </div>
                <Textarea
                  name={`choice_${c.choiceIndex}_body`}
                  defaultValue={c.bodyMd}
                  rows={2}
                  className="text-sm"
                />
                <Textarea
                  name={`choice_${c.choiceIndex}_explanation`}
                  defaultValue={c.explanationMd ?? ""}
                  rows={2}
                  placeholder="해설 (답안 hwp 에서 자동 분류 + 운영자 보강)"
                  className="text-muted-foreground text-xs"
                />
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex items-center justify-between">
          <button
            type="submit"
            name="intent"
            value="delete"
            onClick={(e) => {
              if (!confirm("이 문제를 삭제하시겠습니까? (soft delete)")) {
                e.preventDefault();
              }
            }}
            className="text-rose-600 text-xs hover:underline"
          >
            문제 삭제
          </button>
          <Button type="submit" className="gap-1">
            <SaveIcon className="size-4" /> 저장
          </Button>
        </div>
      </Form>
    </div>
  );
}

function FormSelect({
  name,
  label,
  defaultValue,
  options,
  disabled,
}: {
  name: string;
  label: string;
  defaultValue: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
        {label}
      </span>
      <select
        name={name}
        defaultValue={defaultValue}
        disabled={disabled}
        className="border-input bg-background h-9 rounded-md border px-2 text-sm disabled:opacity-50"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function FormInput({
  name,
  label,
  type = "text",
  defaultValue,
  disabled,
}: {
  name: string;
  label: string;
  type?: string;
  defaultValue: string | number;
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
        {label}
      </span>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        disabled={disabled}
        className="border-input bg-background h-9 rounded-md border px-2 text-sm disabled:opacity-50"
      />
    </label>
  );
}

function ChoiceTypeSelect({
  name,
  defaultValue,
}: {
  name: string;
  defaultValue: string;
}) {
  const cls = defaultValue
    ? CHOICE_TYPE_COLOR[defaultValue as ProblemChoiceType]
    : "bg-muted text-muted-foreground";
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      className={cn(
        "border-input rounded-md border px-2 py-1 text-[11px] font-medium",
        cls,
      )}
    >
      <option value="">미분류</option>
      {CHOICE_TYPES.map((t) => (
        <option key={t} value={t}>
          {CHOICE_TYPE_LABEL[t]}
        </option>
      ))}
    </select>
  );
}

function stringOrNull(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function numberOrNull(v: FormDataEntryValue | null): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
