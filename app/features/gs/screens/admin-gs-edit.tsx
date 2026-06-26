// 운영자 GS 회차 편집 — 메타 + 문제 목록(추가/수정/삭제) 한 화면.
// 새 회차는 /admin/gs/new (params.roundId === undefined) 로 진입.
// 패턴 P3 EDIT FORM. AdminShell cluster="gs" width=960.

import {
  AlertTriangleIcon,
  AwardIcon,
  BarChart3Icon,
  CheckCircle2Icon,
  ClipboardCheckIcon,
  FileTextIcon,
  PlusIcon,
  SaveIcon,
  Trash2Icon,
  UploadIcon,
  UsersIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Form, Link, data, redirect, useFetcher } from "react-router";
import { z } from "zod";

import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Separator } from "~/core/components/ui/separator";
import { Textarea } from "~/core/components/ui/textarea";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { AdminSelect, Chip, Field } from "~/features/admin/components/admin-ui";
import {
  createGsRound,
  deleteGsQuestion,
  deleteGsRound,
  getGsPaperSignedUrl,
  getGsRound,
  type GsPaperKind,
  type GsSeries,
  type RubricCriterion,
  listAllGsSeries,
  listGsQuestions,
  type GsRoundStatus,
  seedDefaultGsQuestions,
  setGsRoundPaperPath,
  updateGsRound,
  upsertGsQuestion,
} from "~/features/gs/queries.server";
import {
  getPromotedLinks,
  promoteRoundToProblemBank,
} from "~/features/gs/queries-promotion.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
  SECOND_EXAM_LAW_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-gs-edit";

export const meta: Route.MetaFunction = ({ data: loaderData }) => [
  {
    title: loaderData?.round
      ? `${loaderData.round.title} 편집 | 리담변리사학원`
      : "새 GS 회차 | 리담변리사학원",
  },
];

const roundSchema = z.object({
  title: z.string().min(1).max(200),
  subject: z.enum(LAW_SUBJECT_SLUGS),
  descriptionMd: z.string().optional().nullable(),
  startAt: z.string().min(1),
  endAt: z.string().min(1),
  durationMin: z.coerce.number().int().min(5).max(600),
  status: z.enum(["draft", "published", "closed"]),
  seriesId: z.string().uuid().optional().nullable(),
  roundNumber: z.coerce.number().int().min(1).max(50).optional().nullable(),
  expectedPages: z.coerce.number().int().min(1).max(100),
});

const rubricCriterionSchema = z.object({
  criterionId: z.string().min(1),
  label: z.string().min(1).max(200),
  maxPoints: z.coerce.number().min(0).max(1000),
  descriptionMd: z.string().optional().nullable(),
});

const questionSchema = z.object({
  questionId: z.string().uuid().optional().nullable(),
  orderIndex: z.coerce.number().int().min(0),
  title: z.string().optional().nullable(),
  bodyMd: z.string().min(1),
  modelAnswerMd: z.string().optional().nullable(),
  maxScore: z.coerce.number().int().min(1).max(1000),
  rubric: z.array(rubricCriterionSchema).optional(),
});

export async function loader({ params, request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const roundId = params.roundId;
  const allSeries = await listAllGsSeries(client);
  if (!roundId || roundId === "new") {
    return {
      round: null,
      questions: [],
      allSeries,
      paperUrl: null,
      answerKeyUrl: null,
      role,
      promotedLinks: {} as Record<string, string>,
    };
  }
  const [round, questions] = await Promise.all([
    getGsRound(client, roundId),
    listGsQuestions(client, roundId),
  ]);
  if (!round) throw data("Round not found", { status: 404 });

  const [paperUrl, answerKeyUrl] = await Promise.all([
    round.paperPdfPath ? getGsPaperSignedUrl(client, round.paperPdfPath) : null,
    round.answerKeyPdfPath
      ? getGsPaperSignedUrl(client, round.answerKeyPdfPath)
      : null,
  ]);
  const promoted = await getPromotedLinks(
    client,
    questions.map((q) => q.questionId),
  );
  return {
    round,
    questions,
    allSeries,
    paperUrl,
    answerKeyUrl,
    role,
    promotedLinks: Object.fromEntries(promoted),
  };
}

export async function action({ params, request }: Route.ActionArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" } as const;
  const role = await getStaffRole(client, user.id);
  if (!role) return { ok: false, error: "Forbidden" } as const;

  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "");
  const roundId = params.roundId === "new" ? undefined : params.roundId;

  if (intent === "save-round") {
    const parsed = roundSchema.safeParse({
      title: fd.get("title"),
      subject: fd.get("subject"),
      descriptionMd: fd.get("descriptionMd") || null,
      startAt: fd.get("startAt"),
      endAt: fd.get("endAt"),
      durationMin: fd.get("durationMin"),
      status: fd.get("status"),
      seriesId: fd.get("seriesId") || null,
      roundNumber: fd.get("roundNumber") || null,
      expectedPages: fd.get("expectedPages"),
    });
    if (!parsed.success) return { ok: false, error: "Invalid input" } as const;
    if (!roundId) {
      const created = await createGsRound(client, user.id, {
        title: parsed.data.title,
        subject: parsed.data.subject as LawSubjectSlug,
        descriptionMd: parsed.data.descriptionMd ?? null,
        startAt: parsed.data.startAt,
        endAt: parsed.data.endAt,
        durationMin: parsed.data.durationMin,
        status: parsed.data.status as GsRoundStatus,
        seriesId: parsed.data.seriesId ?? null,
        roundNumber: parsed.data.roundNumber ?? null,
        expectedPages: parsed.data.expectedPages,
      });
      return redirect(`/admin/gs/${created.roundId}`);
    }
    await updateGsRound(client, roundId, {
      title: parsed.data.title,
      subject: parsed.data.subject as LawSubjectSlug,
      descriptionMd: parsed.data.descriptionMd ?? null,
      startAt: parsed.data.startAt,
      endAt: parsed.data.endAt,
      durationMin: parsed.data.durationMin,
      status: parsed.data.status as GsRoundStatus,
      seriesId: parsed.data.seriesId ?? null,
      roundNumber: parsed.data.roundNumber ?? null,
      expectedPages: parsed.data.expectedPages,
    });
    return { ok: true };
  }

  if (intent === "seed-default") {
    if (!roundId) return { ok: false, error: "Save round first" } as const;
    const result = await seedDefaultGsQuestions(client, roundId);
    return { ok: true, seeded: result.seeded } as const;
  }

  if (intent === "upload-paper" || intent === "upload-answer-key") {
    if (!roundId) return { ok: false, error: "Save round first" } as const;
    const kind: GsPaperKind = intent === "upload-paper" ? "paper" : "answer_key";
    const file = fd.get("file");
    if (!(file instanceof File))
      return { ok: false, error: "파일이 없습니다." } as const;
    if (file.type !== "application/pdf")
      return { ok: false, error: "PDF 만 업로드할 수 있습니다." } as const;
    if (file.size > 30 * 1024 * 1024)
      return { ok: false, error: "30MB 를 초과합니다." } as const;

    // 기존 파일 있으면 먼저 제거.
    const round = await getGsRound(client, roundId);
    if (round) {
      const existing =
        kind === "paper" ? round.paperPdfPath : round.answerKeyPdfPath;
      if (existing) {
        await client.storage.from("gs-papers").remove([existing]);
      }
    }

    const path = `${roundId}/${kind}-${Date.now()}.pdf`;
    const buf = await file.arrayBuffer();
    const upload = await client.storage
      .from("gs-papers")
      .upload(path, buf, { contentType: "application/pdf", upsert: false });
    if (upload.error) {
      return { ok: false, error: `업로드 실패: ${upload.error.message}` } as const;
    }
    await setGsRoundPaperPath(client, roundId, kind, path);
    return { ok: true } as const;
  }

  if (intent === "remove-paper" || intent === "remove-answer-key") {
    if (!roundId) return { ok: false, error: "Save round first" } as const;
    const kind: GsPaperKind = intent === "remove-paper" ? "paper" : "answer_key";
    const round = await getGsRound(client, roundId);
    if (round) {
      const existing =
        kind === "paper" ? round.paperPdfPath : round.answerKeyPdfPath;
      if (existing) {
        await client.storage.from("gs-papers").remove([existing]);
      }
    }
    await setGsRoundPaperPath(client, roundId, kind, null);
    return { ok: true } as const;
  }

  if (intent === "save-question") {
    if (!roundId) return { ok: false, error: "Save round first" } as const;
    // rubric 은 hidden input 에 JSON 으로 직렬화돼서 들어옴.
    const rubricRaw = fd.get("rubric");
    let rubricParsed: z.infer<typeof rubricCriterionSchema>[] | undefined;
    if (typeof rubricRaw === "string" && rubricRaw.length > 0) {
      try {
        const arr = JSON.parse(rubricRaw);
        const r = z.array(rubricCriterionSchema).safeParse(arr);
        if (!r.success) return { ok: false, error: "Invalid rubric" } as const;
        rubricParsed = r.data;
      } catch {
        return { ok: false, error: "Invalid rubric JSON" } as const;
      }
    }

    const parsed = questionSchema.safeParse({
      questionId: fd.get("questionId") || null,
      orderIndex: fd.get("orderIndex"),
      title: fd.get("title") || null,
      bodyMd: fd.get("bodyMd"),
      modelAnswerMd: fd.get("modelAnswerMd") || null,
      maxScore: fd.get("maxScore"),
    });
    if (!parsed.success) return { ok: false, error: "Invalid question" } as const;

    // rubric 항목 합 ≤ max_score 가드 (소수점 오차 0.01 허용).
    if (rubricParsed && rubricParsed.length > 0) {
      const sum = rubricParsed.reduce((s, c) => s + c.maxPoints, 0);
      if (sum > parsed.data.maxScore + 0.01) {
        return {
          ok: false,
          error: `채점 항목 배점 합(${sum})이 만점(${parsed.data.maxScore})을 초과합니다.`,
        } as const;
      }
    }

    await upsertGsQuestion(client, {
      questionId: parsed.data.questionId ?? undefined,
      roundId,
      orderIndex: parsed.data.orderIndex,
      title: parsed.data.title ?? null,
      bodyMd: parsed.data.bodyMd,
      modelAnswerMd: parsed.data.modelAnswerMd ?? null,
      maxScore: parsed.data.maxScore,
      rubric: rubricParsed?.map((c) => ({
        criterionId: c.criterionId,
        label: c.label,
        maxPoints: c.maxPoints,
        descriptionMd: c.descriptionMd ?? undefined,
      })),
    });
    return { ok: true };
  }

  if (intent === "delete-question") {
    const qId = String(fd.get("questionId") ?? "");
    if (!qId) return { ok: false, error: "Missing questionId" } as const;
    await deleteGsQuestion(client, qId);
    return { ok: true };
  }

  if (intent === "delete-round") {
    if (!roundId) return { ok: false, error: "No round" } as const;
    await deleteGsRound(client, roundId);
    return redirect("/admin/gs");
  }

  if (intent === "promote-to-problems") {
    if (!roundId)
      return { ok: false, error: "회차를 먼저 저장하세요." } as const;
    const result = await promoteRoundToProblemBank(client, roundId, user.id);
    if (!result.ok) {
      return { ok: false, error: result.error ?? "승격 실패" } as const;
    }
    return {
      ok: true,
      promoted: result.promoted,
      skipped: result.skipped,
    } as const;
  }

  return { ok: false, error: "Unknown intent" } as const;
}

function toLocalInput(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminGsEdit({ loaderData }: Route.ComponentProps) {
  const { round, questions, allSeries, paperUrl, answerKeyUrl, role, promotedLinks } =
    loaderData;
  const isNew = round === null;
  const roundFetcher = useFetcher<typeof action>();
  const deleteFetcher = useFetcher<typeof action>();
  const seedFetcher = useFetcher<typeof action>();

  return (
    <AdminShell
      cluster="gs"
      role={role}
      width={960}
      title={isNew ? "새 GS 회차" : (round?.title ?? "회차 편집")}
      desc={
        isNew
          ? "회차 기본 정보를 입력한 뒤 저장하면 문제를 추가할 수 있습니다."
          : "회차 정보와 문제를 편집합니다."
      }
      headerRight={
        !isNew && round ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to={`/admin/gs/${round.roundId}/grade`} viewTransition>
                <ClipboardCheckIcon className="size-3.5" /> 제출 채점
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to={`/admin/gs/${round.roundId}/peer-review`} viewTransition>
                <UsersIcon className="size-3.5" /> 동료 채점
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to={`/admin/gs/${round.roundId}/disputes`} viewTransition>
                <AlertTriangleIcon className="size-3.5" /> 분쟁 문항
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to={`/admin/gs/${round.roundId}/stats`} viewTransition>
                <BarChart3Icon className="size-3.5" /> 통계
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to={`/admin/gs/${round.roundId}/distinctions`} viewTransition>
                <AwardIcon className="size-3.5" /> 우수 답안
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to={`/admin/gs/${round.roundId}/issues`} viewTransition>
                <ClipboardCheckIcon className="size-3.5" /> 논점 관리
              </Link>
            </Button>
            <deleteFetcher.Form method="post">
              <input type="hidden" name="intent" value="delete-round" />
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className="text-rose-600 dark:text-rose-400"
                onClick={(e) => {
                  if (!confirm("이 회차와 모든 문제·제출을 삭제합니다. 계속하시겠습니까?"))
                    e.preventDefault();
                }}
              >
                <Trash2Icon className="size-3.5" /> 회차 삭제
              </Button>
            </deleteFetcher.Form>
          </div>
        ) : null
      }
    >
      {/* 회차 정보 폼 */}
      <Card className="mb-6">
        <CardHeader>
          <h2 className="text-sm font-semibold tracking-tight">회차 정보</h2>
        </CardHeader>
        <CardContent>
          <roundFetcher.Form method="post" className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="intent" value="save-round" />

            <Field label="제목" required className="sm:col-span-2">
              <input
                type="text"
                name="title"
                required
                defaultValue={round?.title ?? ""}
                placeholder="예: 2026 1월 GS 1회 (특허법)"
                className="border-input bg-background focus:border-primary h-9 w-full rounded-md border px-3 text-[13px] outline-none"
              />
            </Field>

            <Field label="과목" required>
              <AdminSelect
                name="subject"
                required
                defaultValue={round?.subject ?? "patent"}
                className="w-full"
              >
                <optgroup label="2차 · 주관식">
                  {SECOND_EXAM_LAW_SLUGS.map((s) => (
                    <option key={s} value={s}>
                      {LAW_SUBJECTS[s].name}
                    </option>
                  ))}
                </optgroup>
              </AdminSelect>
            </Field>

            <Field label="상태">
              <AdminSelect
                name="status"
                defaultValue={round?.status ?? "draft"}
                className="w-full"
              >
                <option value="draft">초안 (학생 비공개)</option>
                <option value="published">공개</option>
                <option value="closed">종료</option>
              </AdminSelect>
            </Field>

            <Field label="응시 시작" required>
              <input
                type="datetime-local"
                name="startAt"
                required
                defaultValue={toLocalInput(round?.startAt)}
                className="border-input bg-background focus:border-primary h-9 w-full rounded-md border px-3 text-[13px] outline-none"
              />
            </Field>

            <Field label="응시 종료" required>
              <input
                type="datetime-local"
                name="endAt"
                required
                defaultValue={toLocalInput(round?.endAt)}
                className="border-input bg-background focus:border-primary h-9 w-full rounded-md border px-3 text-[13px] outline-none"
              />
            </Field>

            <Field label="응시 제한 (분)" required>
              <input
                type="number"
                name="durationMin"
                required
                min={5}
                max={600}
                defaultValue={round?.durationMin ?? 120}
                className="border-input bg-background focus:border-primary h-9 w-full rounded-md border px-3 text-[13px] tabular-nums outline-none"
              />
            </Field>

            <Field label="시리즈 (선택)">
              <AdminSelect
                name="seriesId"
                defaultValue={round?.seriesId ?? ""}
                className="w-full"
              >
                <option value="">— 시리즈 미지정 —</option>
                {allSeries.map((s: GsSeries) => (
                  <option key={s.seriesId} value={s.seriesId}>
                    {s.title}
                  </option>
                ))}
              </AdminSelect>
            </Field>

            <Field label="회차 번호 (시리즈 안)">
              <input
                type="number"
                name="roundNumber"
                min={1}
                max={50}
                defaultValue={round?.roundNumber ?? ""}
                placeholder="예: 1"
                className="border-input bg-background focus:border-primary h-9 w-full rounded-md border px-3 text-[13px] tabular-nums outline-none"
              />
            </Field>

            <Field
              label="답안지 페이지 수"
              required
              hint="학생 응시 화면의 슬롯 수 (변리사 표준 답안지: 25페이지)."
            >
              <input
                type="number"
                name="expectedPages"
                required
                min={1}
                max={100}
                defaultValue={round?.expectedPages ?? 25}
                placeholder="25"
                className="border-input bg-background focus:border-primary h-9 w-full rounded-md border px-3 text-[13px] tabular-nums outline-none"
              />
            </Field>

            <Field label="안내 (마크다운, 선택)" className="sm:col-span-2">
              <Textarea
                name="descriptionMd"
                rows={3}
                defaultValue={round?.descriptionMd ?? ""}
                placeholder="회차 안내·주의사항을 입력하세요."
              />
            </Field>

            <div className="sm:col-span-2 flex items-center justify-end gap-2 pt-1">
              {roundFetcher.data &&
              "ok" in roundFetcher.data &&
              roundFetcher.data.ok ? (
                <span className="text-muted-foreground text-xs">저장됨</span>
              ) : null}
              {roundFetcher.data &&
              "error" in roundFetcher.data &&
              roundFetcher.data.error ? (
                <span className="text-rose-600 text-xs">
                  {roundFetcher.data.error}
                </span>
              ) : null}
              <Button
                type="submit"
                disabled={roundFetcher.state !== "idle"}
              >
                <SaveIcon className="size-4" />
                {isNew ? "회차 생성" : "회차 저장"}
              </Button>
            </div>
          </roundFetcher.Form>
        </CardContent>
      </Card>

      {/* 시험지 / 모범답안 PDF */}
      {!isNew && round ? (
        <Card className="mb-6">
          <CardHeader>
            <h2 className="text-sm font-semibold tracking-tight">
              시험지 / 모범답안 PDF
            </h2>
            <p className="text-muted-foreground text-xs">
              학생은 응시 화면에서 시험지 PDF 를 다운로드해 답안을 작성합니다.
              모범답안 PDF 는 채점 완료 후 학생 결과 화면에 노출됩니다. PDF, 30MB 이하.
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <PaperSlot
              label="시험지"
              kind="paper"
              currentUrl={paperUrl}
              hasFile={round.paperPdfPath != null}
            />
            <PaperSlot
              label="모범답안"
              kind="answer-key"
              currentUrl={answerKeyUrl}
              hasFile={round.answerKeyPdfPath != null}
            />
          </CardContent>
          {paperUrl ? (
            <CardContent className="pt-0">
              <PaperPageHint
                paperUrl={paperUrl}
                expectedPages={round.expectedPages}
              />
            </CardContent>
          ) : null}
        </Card>
      ) : null}

      {/* 문제 목록 */}
      {!isNew && round ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold tracking-tight">
                문제 목록{" "}
                <span className="text-muted-foreground font-normal">
                  ({questions.length}문항)
                </span>
              </h2>
              {questions.length === 0 ? (
                <seedFetcher.Form method="post">
                  <input type="hidden" name="intent" value="seed-default" />
                  <Button type="submit" size="sm" variant="outline">
                    <PlusIcon className="size-3.5" /> 변리사 4문제 시드
                    <span className="text-muted-foreground ml-1 text-[10px]">
                      30·20·30·20
                    </span>
                  </Button>
                </seedFetcher.Form>
              ) : null}
            </div>
            {seedFetcher.data &&
            "seeded" in seedFetcher.data &&
            typeof seedFetcher.data.seeded === "number" ? (
              <p className="text-muted-foreground text-xs">
                {seedFetcher.data.seeded > 0
                  ? `${seedFetcher.data.seeded}문제가 추가되었습니다. 본문/모범답안을 채워 주세요.`
                  : "이미 문제가 있어 시드는 생략되었습니다."}
              </p>
            ) : null}
          </CardHeader>
          <Separator />
          <CardContent className="space-y-4 pt-4">
            {questions.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                아직 등록된 문제가 없습니다. 아래에서 문제를 추가하세요.
              </p>
            ) : (
              questions.map((q) => (
                <QuestionEditor
                  key={q.questionId}
                  initial={{
                    questionId: q.questionId,
                    orderIndex: q.orderIndex,
                    title: q.title ?? "",
                    bodyMd: q.bodyMd,
                    modelAnswerMd: q.modelAnswerMd ?? "",
                    maxScore: q.maxScore,
                    rubric: q.rubric,
                  }}
                />
              ))
            )}
            <QuestionEditor
              key={`new:${questions.length}`}
              initial={{
                questionId: null,
                orderIndex: questions.length,
                title: "",
                bodyMd: "",
                modelAnswerMd: "",
                maxScore: 100,
                rubric: [],
              }}
              isNew
            />
          </CardContent>
        </Card>
      ) : (
        <p className="text-muted-foreground text-sm">
          회차를 먼저 저장하면 문제를 추가할 수 있습니다.
        </p>
      )}

      {!isNew && round ? (
        <PromotionPanel
          round={{ roundId: round.roundId, status: round.status }}
          questions={questions}
          promotedLinks={promotedLinks}
        />
      ) : null}
    </AdminShell>
  );
}

/* ── 문항 편집 카드 ─────────────────────────────────────────────────────── */

function QuestionEditor({
  initial,
  isNew = false,
}: {
  initial: {
    questionId: string | null;
    orderIndex: number;
    title: string;
    bodyMd: string;
    modelAnswerMd: string;
    maxScore: number;
    rubric: RubricCriterion[];
  };
  isNew?: boolean;
}) {
  const fetcher = useFetcher<typeof action>();
  const deleteFetcher = useFetcher<typeof action>();
  const [draft, setDraft] = useState(initial);

  const rubricSum = draft.rubric.reduce((s, c) => s + c.maxPoints, 0);
  const rubricOver = rubricSum > draft.maxScore + 0.01;
  const addCriterion = () =>
    setDraft((d) => ({
      ...d,
      rubric: [
        ...d.rubric,
        { criterionId: crypto.randomUUID(), label: "", maxPoints: 0 },
      ],
    }));
  const updateCriterion = (idx: number, patch: Partial<RubricCriterion>) =>
    setDraft((d) => ({
      ...d,
      rubric: d.rubric.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    }));
  const removeCriterion = (idx: number) =>
    setDraft((d) => ({
      ...d,
      rubric: d.rubric.filter((_, i) => i !== idx),
    }));
  const saved = fetcher.data && "ok" in fetcher.data && fetcher.data.ok;

  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        isNew ? "bg-muted/30 border-dashed" : "bg-card",
      )}
    >
      {/* 문항 헤더 */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Chip tone={isNew ? "amber" : "neutral"}>
          {isNew ? "새 문항" : `#${draft.orderIndex + 1}`}
        </Chip>
        <input
          type="text"
          value={draft.title}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          placeholder="문제 제목 (예: 문 1.)"
          className="border-input bg-background focus:border-primary h-8 flex-1 rounded-md border px-2 text-[13px] outline-none"
        />
        <label className="inline-flex items-center gap-1 text-xs">
          <span className="text-muted-foreground">순서</span>
          <input
            type="number"
            min={0}
            value={draft.orderIndex}
            onChange={(e) =>
              setDraft((d) => ({ ...d, orderIndex: Number(e.target.value) || 0 }))
            }
            className="border-input bg-background focus:border-primary h-8 w-14 rounded-md border px-2 text-[13px] tabular-nums outline-none"
          />
        </label>
        <label className="inline-flex items-center gap-1 text-xs">
          <span className="text-muted-foreground">배점</span>
          <input
            type="number"
            min={1}
            max={1000}
            value={draft.maxScore}
            onChange={(e) =>
              setDraft((d) => ({ ...d, maxScore: Number(e.target.value) || 100 }))
            }
            className="border-input bg-background focus:border-primary h-8 w-16 rounded-md border px-2 text-[13px] tabular-nums outline-none"
          />
        </label>
      </div>

      <div className="space-y-3">
        <Field label="본문" required>
          <Textarea
            value={draft.bodyMd}
            onChange={(e) => setDraft((d) => ({ ...d, bodyMd: e.target.value }))}
            rows={5}
            placeholder="문제 본문을 입력하세요."
          />
        </Field>

        <Field label="모범답안 (선택)">
          <Textarea
            value={draft.modelAnswerMd}
            onChange={(e) => setDraft((d) => ({ ...d, modelAnswerMd: e.target.value }))}
            rows={5}
            placeholder="채점 기준·모범답안. 학생에게는 제출 후 노출됩니다."
          />
        </Field>

        {/* rubric */}
        <div className="bg-muted/30 rounded-lg border p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <p className="text-muted-foreground text-xs font-semibold">
              채점 항목 (rubric, 선택)
            </p>
            <span
              className={cn(
                "ml-auto font-mono text-[11px] tabular-nums",
                rubricOver
                  ? "text-rose-600 font-semibold"
                  : "text-muted-foreground",
              )}
            >
              합 {rubricSum} / 만점 {draft.maxScore}
              {rubricOver ? " (초과!)" : ""}
            </span>
          </div>
          {draft.rubric.length === 0 ? (
            <p className="text-muted-foreground mb-2 text-[11px] italic">
              항목 없음 — 단일 점수 모드. 추가하면 채점 화면이 항목별 점수 입력으로 전환됩니다.
            </p>
          ) : (
            <div className="mb-2 space-y-1.5">
              {draft.rubric.map((c, idx) => (
                <div key={c.criterionId} className="flex flex-wrap items-center gap-1.5">
                  <span className="text-muted-foreground w-5 text-[10px] tabular-nums">
                    {idx + 1}
                  </span>
                  <input
                    type="text"
                    value={c.label}
                    onChange={(e) => updateCriterion(idx, { label: e.target.value })}
                    placeholder="항목 — 예: 신규성 인정 여부"
                    className="border-input bg-background focus:border-primary h-7 flex-1 rounded-md border px-2 text-xs outline-none"
                  />
                  <input
                    type="number"
                    min={0}
                    max={1000}
                    step="0.5"
                    value={c.maxPoints}
                    onChange={(e) =>
                      updateCriterion(idx, { maxPoints: Number(e.target.value) || 0 })
                    }
                    placeholder="배점"
                    className="border-input bg-background focus:border-primary h-7 w-16 rounded-md border px-2 text-xs tabular-nums outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => removeCriterion(idx)}
                    className="text-muted-foreground hover:text-rose-600"
                    aria-label="항목 삭제"
                  >
                    <Trash2Icon className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addCriterion}
            className="h-7 text-[11px]"
          >
            <PlusIcon className="size-3" /> 항목 추가
          </Button>
        </div>
      </div>

      {/* 저장/삭제 */}
      <div className="mt-3 flex items-center justify-end gap-2">
        {saved ? (
          <span className="text-muted-foreground text-xs">저장됨</span>
        ) : null}
        {fetcher.data &&
        "error" in fetcher.data &&
        fetcher.data.error ? (
          <span className="text-rose-600 text-xs">{fetcher.data.error}</span>
        ) : null}
        {!isNew && draft.questionId ? (
          <deleteFetcher.Form method="post">
            <input type="hidden" name="intent" value="delete-question" />
            <input type="hidden" name="questionId" value={draft.questionId} />
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className="text-rose-600 dark:text-rose-400 h-8"
              onClick={(e) => {
                if (!confirm("이 문항을 삭제하시겠습니까? (관련 답안도 함께 삭제)"))
                  e.preventDefault();
              }}
            >
              <Trash2Icon className="size-3.5" />
            </Button>
          </deleteFetcher.Form>
        ) : null}
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="save-question" />
          {draft.questionId ? (
            <input type="hidden" name="questionId" value={draft.questionId} />
          ) : null}
          <input type="hidden" name="orderIndex" value={draft.orderIndex} />
          <input type="hidden" name="title" value={draft.title} />
          <input type="hidden" name="bodyMd" value={draft.bodyMd} />
          <input type="hidden" name="modelAnswerMd" value={draft.modelAnswerMd} />
          <input type="hidden" name="maxScore" value={draft.maxScore} />
          <input
            type="hidden"
            name="rubric"
            value={draft.rubric.length > 0 ? JSON.stringify(draft.rubric) : ""}
          />
          <Button
            type="submit"
            size="sm"
            disabled={fetcher.state !== "idle" || !draft.bodyMd.trim() || rubricOver}
            className="h-8"
            title={rubricOver ? "rubric 합이 만점 초과 — 배점 재조정 필요" : undefined}
          >
            <SaveIcon className="size-3.5" />
            {isNew ? "문항 추가" : "문항 저장"}
          </Button>
        </fetcher.Form>
      </div>
    </div>
  );
}

/* ── PDF 슬롯 ───────────────────────────────────────────────────────────── */

function PaperSlot({
  label,
  kind,
  currentUrl,
  hasFile,
}: {
  label: string;
  kind: "paper" | "answer-key";
  currentUrl: string | null;
  hasFile: boolean;
}) {
  const uploadFetcher = useFetcher<typeof action>();
  const removeFetcher = useFetcher<typeof action>();
  const inputRef = useRef<HTMLInputElement>(null);
  const intent = kind === "paper" ? "upload-paper" : "upload-answer-key";
  const removeIntent = kind === "paper" ? "remove-paper" : "remove-answer-key";

  return (
    <div className="bg-muted/30 rounded-xl border p-3">
      <div className="flex items-center gap-2">
        <FileTextIcon className="text-muted-foreground size-4" />
        <span className="text-sm font-medium">{label}</span>
        {hasFile ? (
          <Chip tone="emerald">업로드됨</Chip>
        ) : (
          <Chip tone="neutral">없음</Chip>
        )}
        {currentUrl ? (
          <a
            href={currentUrl}
            target="_blank"
            rel="noreferrer"
            className="text-link ml-auto text-xs font-semibold hover:underline"
          >
            다운로드
          </a>
        ) : null}
      </div>
      <uploadFetcher.Form method="post" encType="multipart/form-data" className="mt-3">
        <input type="hidden" name="intent" value={intent} />
        <input
          ref={inputRef}
          type="file"
          name="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.[0]) e.currentTarget.form?.requestSubmit();
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={uploadFetcher.state !== "idle"}
            className="h-8"
          >
            <UploadIcon className="size-3.5" />
            {uploadFetcher.state !== "idle" ? "업로드 중…" : hasFile ? "교체" : "PDF 선택"}
          </Button>
          {hasFile ? (
            <removeFetcher.Form method="post" className="inline">
              <input type="hidden" name="intent" value={removeIntent} />
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className="text-rose-600 dark:text-rose-400 h-8"
                onClick={(e) => {
                  if (!confirm("이 PDF 를 삭제하시겠습니까?")) e.preventDefault();
                }}
              >
                <Trash2Icon className="size-3.5" /> 삭제
              </Button>
            </removeFetcher.Form>
          ) : null}
        </div>
        {uploadFetcher.data &&
        "error" in uploadFetcher.data &&
        uploadFetcher.data.error ? (
          <p className="mt-2 text-xs text-rose-600">{uploadFetcher.data.error}</p>
        ) : null}
      </uploadFetcher.Form>
    </div>
  );
}

/* ── 시험지 페이지 수 힌트 ─────────────────────────────────────────────── */

function PaperPageHint({
  paperUrl,
  expectedPages,
}: {
  paperUrl: string;
  expectedPages: number;
}) {
  const [paperPages, setPaperPages] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPaperPages(null);
    setError(null);
    (async () => {
      try {
        const res = await fetch(paperUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        const file = new File([buf], "paper.pdf", { type: "application/pdf" });
        const { getPdfPageCount } = await import(
          "~/features/gs/lib/pdf-split.client"
        );
        const n = await getPdfPageCount(file);
        if (!cancelled) setPaperPages(n);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [paperUrl]);

  if (error) {
    return (
      <p className="text-muted-foreground text-[11px]">
        시험지 페이지 수 추출 실패: {error}
      </p>
    );
  }
  if (paperPages == null) {
    return (
      <p className="text-muted-foreground text-[11px]">시험지 페이지 수 분석 중…</p>
    );
  }

  const matches = paperPages === expectedPages;
  if (matches) {
    return (
      <div className="border-emerald-300 bg-emerald-50/40 dark:border-emerald-700/40 dark:bg-emerald-950/20 inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] text-emerald-800 dark:text-emerald-200">
        <CheckCircle2Icon className="size-3" />
        시험지 {paperPages}페이지 = 답안지 페이지 수 {expectedPages}. 일치.
      </div>
    );
  }

  const setExpectedTo = (n: number) => {
    const input = document.querySelector<HTMLInputElement>(
      'input[name="expectedPages"]',
    );
    if (!input) return;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, String(n));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div className="border-amber-300 bg-amber-50/40 dark:border-amber-700/40 dark:bg-amber-950/20 flex flex-wrap items-center gap-2 rounded-lg border p-2 text-[11px] text-amber-900 dark:text-amber-200">
      <AlertTriangleIcon className="size-3.5" />
      <span>
        시험지 <strong>{paperPages}페이지</strong> ≠ 답안지 페이지 수{" "}
        <strong>{expectedPages}</strong>. 답안지를 시험지와 같은 페이지 수로 맞추는 게 일반적입니다.
      </span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="ml-auto h-7"
        onClick={() => setExpectedTo(paperPages)}
      >
        답안지 페이지 수를 {paperPages}로 맞추기
      </Button>
    </div>
  );
}

/* ── 주관식 문제은행 승격 패널 (feat-10-001) ───────────────────────────── */

function PromotionPanel({
  round,
  questions,
  promotedLinks,
}: {
  round: { roundId: string; status: GsRoundStatus };
  questions: { questionId: string; orderIndex: number; title: string | null }[];
  promotedLinks: Record<string, string>;
}) {
  const fetcher = useFetcher<typeof action>();
  const isClosed = round.status === "closed";
  const promotedCount = questions.filter(
    (q) => promotedLinks[q.questionId],
  ).length;
  const pendingCount = questions.length - promotedCount;
  const result = fetcher.data;

  return (
    <Card className="mt-6">
      <CardHeader>
        <h2 className="text-sm font-semibold tracking-tight">
          주관식 문제은행 등록
        </h2>
        <p className="text-muted-foreground text-xs">
          이 회차 문항을 학습과목 주관식 문제(출처: 모의고사)로 등록합니다. 등록된
          문제는 학습정보 · 학습과목 주관식 풀이에 노출됩니다.
        </p>
      </CardHeader>
      <Separator />
      <CardContent className="space-y-3 pt-4">
        {!isClosed ? (
          <p className="text-muted-foreground text-sm">
            회차를 <strong>종료</strong> 상태로 바꾸면 등록할 수 있습니다 — 시험
            종료 전 문항이 문제은행에 노출되지 않도록.
          </p>
        ) : questions.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            등록할 문항이 없습니다.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              <Chip tone="neutral">{questions.length}문항</Chip>
              <Chip tone={promotedCount > 0 ? "emerald" : "neutral"}>
                등록됨 {promotedCount}
              </Chip>
              {pendingCount > 0 ? (
                <Chip tone="amber">미등록 {pendingCount}</Chip>
              ) : null}
            </div>

            <ul className="space-y-1">
              {questions
                .slice()
                .sort((a, b) => a.orderIndex - b.orderIndex)
                .map((q) => {
                  const problemId = promotedLinks[q.questionId];
                  return (
                    <li
                      key={q.questionId}
                      className="flex items-center gap-2 text-[13px]"
                    >
                      <span className="text-muted-foreground tabular-nums">
                        #{q.orderIndex + 1}
                      </span>
                      <span className="flex-1 truncate">
                        {q.title || "(제목 없음)"}
                      </span>
                      {problemId ? (
                        <Link
                          to={`/admin/problems/${problemId}`}
                          viewTransition
                          className="text-link text-xs font-semibold hover:underline"
                        >
                          등록됨 — 문제 편집 ↗
                        </Link>
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          미등록
                        </span>
                      )}
                    </li>
                  );
                })}
            </ul>

            {pendingCount > 0 ? (
              <fetcher.Form method="post">
                <input type="hidden" name="intent" value="promote-to-problems" />
                <Button
                  type="submit"
                  size="sm"
                  disabled={fetcher.state !== "idle"}
                >
                  <ClipboardCheckIcon className="size-3.5" />
                  미등록 {pendingCount}개 문제은행에 등록
                </Button>
              </fetcher.Form>
            ) : (
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                모든 문항이 문제은행에 등록되었습니다.
              </p>
            )}

            {result && "ok" in result && result.ok && result.promoted !== undefined ? (
              <p className="text-muted-foreground text-xs">
                {result.promoted > 0
                  ? `${result.promoted}개 문항을 등록했습니다.`
                  : "새로 등록할 문항이 없습니다."}
              </p>
            ) : null}
            {result && "error" in result && result.error ? (
              <p className="text-xs text-rose-600">{result.error}</p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
