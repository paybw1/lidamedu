// 객관식 문제 신규 출제 (feat-7-006).
// 최소 메타 + 본문 입력 → INSERT 후 상세 편집(/admin/problems/:problemId) 로 redirect.

import { ArrowLeftIcon, ListChecksIcon, SaveIcon } from "lucide-react";
import { Form, Link, data } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import { Textarea } from "~/core/components/ui/textarea";
import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  FORMAT_LABEL,
  ORIGIN_LABEL,
  POLARITY_LABEL,
  SCOPE_LABEL,
} from "~/features/problems/labels";
import {
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-problem-new";

export const meta: Route.MetaFunction = () => [
  { title: "문제 신규 출제 | Lidam Edu" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });
  const url = new URL(request.url);
  const formatParam = url.searchParams.get("format");
  const allowedFormats = [
    "mc_short",
    "mc_box",
    "mc_case",
    "ox",
    "blank",
    "subjective",
  ];
  const defaultFormat =
    formatParam && allowedFormats.includes(formatParam)
      ? formatParam
      : "mc_short";
  const defaultExamRound = defaultFormat === "subjective" ? "second" : "first";
  return { defaultFormat, defaultExamRound };
}

export default function AdminProblemNew({
  loaderData,
}: Route.ComponentProps) {
  const { defaultFormat, defaultExamRound } = loaderData;
  return (
    <div className="mx-auto w-full max-w-screen-md px-5 py-6 md:px-10 md:py-8">
      <Link
        to="/admin/problems"
        className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-xs"
      >
        <ArrowLeftIcon className="size-3" /> 객관식 문제 관리
      </Link>
      <header className="mb-6">
        <h1 className="inline-flex items-center gap-2 text-2xl font-bold tracking-tight">
          <ListChecksIcon className="text-primary size-6" /> 문제 신규 출제
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          저장하면 상세 편집 화면(지문·해설·연관 조문/판례)으로 이동합니다.
        </p>
      </header>

      <Form
        method="post"
        action="/api/admin/problem-create"
        className="space-y-4"
      >
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold">분류</h2>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Field label="과목" required>
              <select
                name="lawCode"
                defaultValue="patent"
                required
                className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
              >
                {LAW_SUBJECT_SLUGS.map((s) => (
                  <option key={s} value={s}>
                    {LAW_SUBJECTS[s].name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="시험 차수" required>
              <select
                name="examRound"
                defaultValue={defaultExamRound}
                className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
              >
                <option value="first">1차</option>
                <option value="second">2차</option>
              </select>
            </Field>
            <Field label="출처" required>
              <select
                name="origin"
                defaultValue="past_exam"
                required
                className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
              >
                {(
                  [
                    "past_exam",
                    "past_exam_variant",
                    "mock",
                    "expected",
                  ] as const
                ).map((o) => (
                  <option key={o} value={o}>
                    {ORIGIN_LABEL[o]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="유형" required>
              <select
                name="format"
                defaultValue={defaultFormat}
                required
                className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
              >
                {(
                  [
                    "mc_short",
                    "mc_box",
                    "mc_case",
                    "ox",
                    "blank",
                    "subjective",
                  ] as const
                ).map((f) => (
                  <option key={f} value={f}>
                    {FORMAT_LABEL[f]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="극성">
              <select
                name="polarity"
                defaultValue=""
                className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
              >
                <option value="">선택 안 함</option>
                <option value="positive">{POLARITY_LABEL.positive}</option>
                <option value="negative">{POLARITY_LABEL.negative}</option>
              </select>
            </Field>
            <Field label="단원/종합">
              <select
                name="scope"
                defaultValue=""
                className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
              >
                <option value="">선택 안 함</option>
                <option value="unit">{SCOPE_LABEL.unit}</option>
                <option value="comprehensive">{SCOPE_LABEL.comprehensive}</option>
              </select>
            </Field>
            <Field label="연도">
              <Input type="number" name="year" min={1990} max={2099} />
            </Field>
            <Field label="회차">
              <Input type="number" name="examRoundNo" min={1} max={99} />
            </Field>
            <Field label="문제 번호">
              <Input type="number" name="problemNumber" min={1} max={9999} />
            </Field>
            <Field label="지문 수 (mc 계열만)">
              <Input
                type="number"
                name="choiceCount"
                defaultValue={5}
                min={2}
                max={10}
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold">본문</h2>
          </CardHeader>
          <CardContent>
            <Textarea
              name="bodyMd"
              required
              rows={8}
              placeholder="문제 본문(Markdown). 저장 후 상세 편집에서 지문·해설을 채웁니다."
              className="text-sm"
            />
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" size="sm">
            <SaveIcon className="size-3.5" /> 저장 후 상세 편집으로 이동
          </Button>
        </div>
      </Form>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="text-muted-foreground mb-1 block text-[11px]">
        {label}
        {required ? (
          <Badge variant="outline" className="ml-1 text-[9px]">
            필수
          </Badge>
        ) : null}
      </Label>
      {children}
    </div>
  );
}
