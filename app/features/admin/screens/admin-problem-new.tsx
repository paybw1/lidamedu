// 객관식 문제 신규 출제 (feat-7-006).
// 최소 메타 + 본문 입력 → INSERT 후 상세 편집(/admin/problems/:problemId) 로 redirect.
// P3 EDIT FORM 패턴 — AdminShell + Field + AdminSelect 통일.

import { SaveIcon } from "lucide-react";
import { useState } from "react";
import { Form, Link, data } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Input } from "~/core/components/ui/input";
import { Textarea } from "~/core/components/ui/textarea";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { AdminSelect, Field } from "~/features/admin/components/admin-ui";
import { listAllGsRounds } from "~/features/gs/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { MCQ_PACK_KIND_SHORT } from "~/features/mcq-packs/labels";
import { listPacks } from "~/features/mcq-packs/queries.server";
import {
  FORMAT_LABEL,
  ORIGIN_LABEL,
  POLARITY_LABEL,
  SCOPE_LABEL,
} from "~/features/problems/labels";
import {
  FIRST_EXAM_LAW_SLUGS,
  LAW_SUBJECTS,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-problem-new";

// lawCode (`civil-procedure`) → pack subject_scope (`civil_procedure`) 매핑.
function lawCodeToPackScope(slug: string): string {
  return slug === "civil-procedure" ? "civil_procedure" : slug;
}

export const meta: Route.MetaFunction = () => [
  { title: "문제 신규 출제 | 리담변리사학원" },
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

  // 객관식 pack 후보 (자연과학 제외). 클라이언트에서 lawCode 변경 시 필터.
  const allPacks = await listPacks(client);
  const packs = allPacks
    .filter((p) => p.subjectScope !== "science")
    .map((p) => ({
      packId: p.packId,
      title: p.title,
      kind: p.kind,
      subjectScope: p.subjectScope,
      year: p.year,
      examRoundNo: p.examRoundNo,
    }));

  // 주관식: GS 회차 후보 (draft/published 모두 — closed 는 등록 의미 없음).
  const allRounds = await listAllGsRounds(client);
  const gsRounds = allRounds
    .filter((r) => r.status === "draft" || r.status === "published")
    .map((r) => ({
      roundId: r.roundId,
      title: r.title,
      subject: r.subject,
      status: r.status,
      roundNumber: r.roundNumber,
    }));

  return { defaultFormat, defaultExamRound, packs, gsRounds, role };
}

export default function AdminProblemNew({
  loaderData,
}: Route.ComponentProps) {
  const { defaultFormat, defaultExamRound, packs, gsRounds, role } = loaderData;
  // lawCode 와 format 을 React state 로 추적 → 그에 맞는 mcq pack / GS round 옵션을 클라이언트에서 필터.
  const [lawCode, setLawCode] = useState<string>("patent");
  const [format, setFormat] = useState<string>(defaultFormat);
  const isMcqFormat =
    format === "mc_short" || format === "mc_box" || format === "mc_case";
  const isSubjective = format === "subjective";
  const availablePacks = packs.filter((p) => {
    const lawScope = lawCodeToPackScope(lawCode);
    // 같은 과목 또는 industrial (산업재산권 통합 모의고사 — 특허/상표/디자인 모두 포함 가능).
    if (p.subjectScope === lawScope) return true;
    if (
      p.subjectScope === "industrial" &&
      (lawScope === "patent" ||
        lawScope === "trademark" ||
        lawScope === "design")
    ) {
      return true;
    }
    return false;
  });
  // GS 회차는 lawCode 와 정확히 일치하는 subject 만 (industrial 통합 GS 는 없음).
  const availableGsRounds = gsRounds.filter((r) => r.subject === lawCode);

  const pageTitle =
    defaultFormat === "subjective" ? "주관식 신규 출제" : "객관식 신규 출제";

  return (
    <AdminShell
      cluster="problems"
      role={role}
      width={960}
      title={pageTitle}
      desc="최소 메타 + 본문을 입력하고 저장하면 상세 편집 화면(지문·해설·연관 조문/판례)으로 이동합니다."
      headerRight={
        <Button type="submit" form="admin-problem-new-form" size="sm">
          <SaveIcon className="size-3.5" /> 저장 후 상세 편집으로 이동
        </Button>
      }
    >
      <Form
        id="admin-problem-new-form"
        method="post"
        action="/api/admin/problem-create"
        className="space-y-4"
      >
        <Card>
          <CardHeader>
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              분류
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="과목" required htmlFor="lawCode">
              <AdminSelect
                id="lawCode"
                name="lawCode"
                value={lawCode}
                onChange={(e) => setLawCode(e.target.value)}
                required
                className="w-full"
              >
                {/* /admin/problems 는 1차 객관식 전용 — 2차(주관식) 과목 제외. */}
                {FIRST_EXAM_LAW_SLUGS.map((s) => (
                  <option key={s} value={s}>
                    {LAW_SUBJECTS[s].name}
                  </option>
                ))}
              </AdminSelect>
            </Field>

            <Field label="시험 차수" required htmlFor="examRound">
              <AdminSelect
                id="examRound"
                name="examRound"
                defaultValue={defaultExamRound}
                className="w-full"
              >
                <option value="first">1차</option>
                <option value="second">2차</option>
              </AdminSelect>
            </Field>

            <Field label="출처" required htmlFor="origin">
              <AdminSelect
                id="origin"
                name="origin"
                defaultValue="past_exam"
                required
                className="w-full"
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
              </AdminSelect>
            </Field>

            <Field label="유형" required htmlFor="format">
              <AdminSelect
                id="format"
                name="format"
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                required
                className="w-full"
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
              </AdminSelect>
            </Field>

            <Field label="극성" htmlFor="polarity">
              <AdminSelect
                id="polarity"
                name="polarity"
                defaultValue=""
                className="w-full"
              >
                <option value="">선택 안 함</option>
                <option value="positive">{POLARITY_LABEL.positive}</option>
                <option value="negative">{POLARITY_LABEL.negative}</option>
              </AdminSelect>
            </Field>

            <Field label="단원/종합" htmlFor="scope">
              <AdminSelect
                id="scope"
                name="scope"
                defaultValue=""
                className="w-full"
              >
                <option value="">선택 안 함</option>
                <option value="unit">{SCOPE_LABEL.unit}</option>
                <option value="comprehensive">{SCOPE_LABEL.comprehensive}</option>
              </AdminSelect>
            </Field>

            <Field label="연도" htmlFor="year">
              <Input
                id="year"
                type="number"
                name="year"
                min={1990}
                max={2099}
              />
            </Field>

            <Field label="회차" htmlFor="examRoundNo">
              <Input
                id="examRoundNo"
                type="number"
                name="examRoundNo"
                min={1}
                max={99}
              />
            </Field>

            <Field label="문제 번호" htmlFor="problemNumber">
              <Input
                id="problemNumber"
                type="number"
                name="problemNumber"
                min={1}
                max={9999}
              />
            </Field>

            <Field label="지문 수 (mc 계열만)" htmlFor="choiceCount">
              <Input
                id="choiceCount"
                type="number"
                name="choiceCount"
                defaultValue={5}
                min={2}
                max={10}
              />
            </Field>
          </CardContent>
        </Card>

        {isSubjective ? (
          <Card>
            <CardHeader>
              <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                2차 모의고사 회차 등록{" "}
                <span className="font-normal normal-case">(선택)</span>
              </p>
            </CardHeader>
            <CardContent>
              <Field
                label="이 문제를 등록할 GS 회차"
                htmlFor="gsRoundId"
                hint={
                  <>
                    선택하면 그 GS 회차의 문제로도 자동 등록되어 학생이 채점·통계
                    흐름을 탈 수 있습니다. 새 회차는{" "}
                    <Link
                      to="/admin/gs/new"
                      className="text-link hover:underline"
                      target="_blank"
                    >
                      /admin/gs/new
                    </Link>{" "}
                    에서 만들고 돌아오세요.
                  </>
                }
              >
                <AdminSelect
                  id="gsRoundId"
                  name="gsRoundId"
                  defaultValue=""
                  className="w-full"
                >
                  <option value="">없음 (나중에 GS 회차에서 추가)</option>
                  {availableGsRounds.length === 0 ? (
                    <option value="" disabled>
                      이 과목의 진행 중 GS 회차 없음
                    </option>
                  ) : (
                    availableGsRounds.map((r) => (
                      <option key={r.roundId} value={r.roundId}>
                        [{r.status === "draft" ? "초안" : "공개"}]{" "}
                        {r.roundNumber ? `${r.roundNumber}회 · ` : ""}
                        {r.title}
                      </option>
                    ))
                  )}
                </AdminSelect>
              </Field>
            </CardContent>
          </Card>
        ) : null}

        {isMcqFormat ? (
          <Card>
            <CardHeader>
              <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                객관식 pack 매핑{" "}
                <span className="font-normal normal-case">(선택)</span>
              </p>
            </CardHeader>
            <CardContent>
              <Field
                label="이 문제를 추가할 pack"
                htmlFor="mcqPackId"
                hint={
                  <>
                    pack에 추가하면{" "}
                    <span className="font-semibold">
                      최신 정보 → 객관식 문제
                    </span>
                    에서 학생이 풀이를 시작할 수 있습니다. 새 pack은{" "}
                    <Link
                      to="/latest/mcq"
                      className="text-link hover:underline"
                      target="_blank"
                    >
                      /latest/mcq
                    </Link>{" "}
                    에서 먼저 만들고 돌아오세요.
                  </>
                }
              >
                <AdminSelect
                  id="mcqPackId"
                  name="mcqPackId"
                  defaultValue=""
                  className="w-full"
                >
                  <option value="">없음 (나중에 매핑)</option>
                  {availablePacks.length === 0 ? (
                    <option value="" disabled>
                      이 과목에 해당하는 pack 없음
                    </option>
                  ) : (
                    availablePacks.map((p) => (
                      <option key={p.packId} value={p.packId}>
                        [{MCQ_PACK_KIND_SHORT[p.kind]}] {p.title}
                        {p.year ? ` (${p.year}년` : ""}
                        {p.examRoundNo
                          ? `${p.year ? " " : " ("}${p.examRoundNo}회`
                          : ""}
                        {p.year || p.examRoundNo ? ")" : ""}
                      </option>
                    ))
                  )}
                </AdminSelect>
              </Field>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              본문
            </p>
          </CardHeader>
          <CardContent>
            <Field hint="저장 후 상세 편집에서 지문·해설을 채웁니다.">
              <Textarea
                name="bodyMd"
                required
                rows={8}
                placeholder="문제 본문(Markdown). 저장 후 상세 편집에서 지문·해설을 채웁니다."
                className="font-mono text-sm"
              />
            </Field>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" size="sm">
            <SaveIcon className="size-3.5" /> 저장 후 상세 편집으로 이동
          </Button>
        </div>
      </Form>
    </AdminShell>
  );
}
