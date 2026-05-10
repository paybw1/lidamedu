// 운영자 GS 회차 편집 — 메타 + 문제 목록(추가/수정/삭제) 한 화면.
// 새 회차는 /admin/gs/new (params.roundId === undefined) 로 진입.

import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  AwardIcon,
  BarChart3Icon,
  ClipboardCheckIcon,
  PlusIcon,
  SaveIcon,
  Trash2Icon,
  UsersIcon,
} from "lucide-react";
import { useState } from "react";
import { Form, Link, data, redirect, useFetcher } from "react-router";
import { z } from "zod";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Separator } from "~/core/components/ui/separator";
import { Textarea } from "~/core/components/ui/textarea";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  createGsRound,
  deleteGsQuestion,
  deleteGsRound,
  getGsRound,
  type GsSeries,
  listAllGsSeries,
  listGsQuestions,
  type GsRoundStatus,
  seedDefaultGsQuestions,
  updateGsRound,
  upsertGsQuestion,
} from "~/features/gs/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-gs-edit";

export const meta: Route.MetaFunction = ({ data: loaderData }) => [
  {
    title: loaderData?.round
      ? `${loaderData.round.title} 편집 | Lidam Edu`
      : "새 GS 회차 | Lidam Edu",
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
});

const questionSchema = z.object({
  questionId: z.string().uuid().optional().nullable(),
  orderIndex: z.coerce.number().int().min(0),
  title: z.string().optional().nullable(),
  bodyMd: z.string().min(1),
  modelAnswerMd: z.string().optional().nullable(),
  maxScore: z.coerce.number().int().min(1).max(1000),
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
    return { round: null, questions: [], allSeries };
  }
  const [round, questions] = await Promise.all([
    getGsRound(client, roundId),
    listGsQuestions(client, roundId),
  ]);
  if (!round) throw data("Round not found", { status: 404 });
  return { round, questions, allSeries };
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
    });
    return { ok: true };
  }

  if (intent === "seed-default") {
    if (!roundId) return { ok: false, error: "Save round first" } as const;
    const result = await seedDefaultGsQuestions(client, roundId);
    return { ok: true, seeded: result.seeded } as const;
  }

  if (intent === "save-question") {
    if (!roundId) return { ok: false, error: "Save round first" } as const;
    const parsed = questionSchema.safeParse({
      questionId: fd.get("questionId") || null,
      orderIndex: fd.get("orderIndex"),
      title: fd.get("title") || null,
      bodyMd: fd.get("bodyMd"),
      modelAnswerMd: fd.get("modelAnswerMd") || null,
      maxScore: fd.get("maxScore"),
    });
    if (!parsed.success) return { ok: false, error: "Invalid question" } as const;
    await upsertGsQuestion(client, {
      questionId: parsed.data.questionId ?? undefined,
      roundId,
      orderIndex: parsed.data.orderIndex,
      title: parsed.data.title ?? null,
      bodyMd: parsed.data.bodyMd,
      modelAnswerMd: parsed.data.modelAnswerMd ?? null,
      maxScore: parsed.data.maxScore,
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

  return { ok: false, error: "Unknown intent" } as const;
}

function toLocalInput(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminGsEdit({ loaderData }: Route.ComponentProps) {
  const { round, questions, allSeries } = loaderData;
  const isNew = round === null;
  const roundFetcher = useFetcher<typeof action>();
  const deleteFetcher = useFetcher<typeof action>();
  const seedFetcher = useFetcher<typeof action>();

  return (
    <div className="mx-auto w-full max-w-screen-xl px-5 py-6 md:px-10 md:py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <Link
            to="/admin/gs"
            className="text-muted-foreground inline-flex items-center gap-1 text-xs hover:underline"
          >
            <ArrowLeftIcon className="size-3" /> GS 회차 목록
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">
            {isNew ? "새 GS 회차" : round?.title}
          </h1>
        </div>
        {!isNew && round ? (
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to={`/admin/gs/${round.roundId}/grade`} viewTransition>
                <ClipboardCheckIcon className="size-3.5" /> 제출 채점
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to={`/admin/gs/${round.roundId}/peer-review`} viewTransition>
                <UsersIcon className="size-3.5" /> 동료 채점 배정
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to={`/admin/gs/${round.roundId}/disputes`} viewTransition>
                <AlertTriangleIcon className="size-3.5" /> 분쟁 문항
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to={`/admin/gs/${round.roundId}/stats`} viewTransition>
                <BarChart3Icon className="size-3.5" /> 회차 통계
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link
                to={`/admin/gs/${round.roundId}/distinctions`}
                viewTransition
              >
                <AwardIcon className="size-3.5" /> 우수 답안
              </Link>
            </Button>
            <deleteFetcher.Form method="post">
              <input type="hidden" name="intent" value="delete-round" />
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={(e) => {
                  if (
                    !confirm("이 회차와 모든 문제·제출을 삭제합니다. 계속할까요?")
                  )
                    e.preventDefault();
                }}
              >
                <Trash2Icon className="size-3.5" /> 회차 삭제
              </Button>
            </deleteFetcher.Form>
          </div>
        ) : null}
      </header>

      <Card className="mb-6">
        <CardHeader>
          <h2 className="text-sm font-semibold tracking-tight">회차 정보</h2>
        </CardHeader>
        <CardContent>
          <roundFetcher.Form method="post" className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="intent" value="save-round" />
            <label className="space-y-1 sm:col-span-2">
              <span className="text-muted-foreground text-xs font-medium">
                제목
              </span>
              <input
                type="text"
                name="title"
                required
                defaultValue={round?.title ?? ""}
                placeholder="예: 2026 1월 GS 1회 (특허법)"
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              />
            </label>
            <label className="space-y-1">
              <span className="text-muted-foreground text-xs font-medium">
                과목
              </span>
              <select
                name="subject"
                required
                defaultValue={round?.subject ?? "patent"}
                className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
              >
                {LAW_SUBJECT_SLUGS.map((s) => (
                  <option key={s} value={s}>
                    {LAW_SUBJECTS[s].name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-muted-foreground text-xs font-medium">
                상태
              </span>
              <select
                name="status"
                defaultValue={round?.status ?? "draft"}
                className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
              >
                <option value="draft">초안 (학생 비공개)</option>
                <option value="published">공개</option>
                <option value="closed">종료</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-muted-foreground text-xs font-medium">
                응시 시작
              </span>
              <input
                type="datetime-local"
                name="startAt"
                required
                defaultValue={toLocalInput(round?.startAt)}
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              />
            </label>
            <label className="space-y-1">
              <span className="text-muted-foreground text-xs font-medium">
                응시 종료
              </span>
              <input
                type="datetime-local"
                name="endAt"
                required
                defaultValue={toLocalInput(round?.endAt)}
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              />
            </label>
            <label className="space-y-1">
              <span className="text-muted-foreground text-xs font-medium">
                응시 제한 (분)
              </span>
              <input
                type="number"
                name="durationMin"
                required
                min={5}
                max={600}
                defaultValue={round?.durationMin ?? 120}
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm tabular-nums"
              />
            </label>
            <label className="space-y-1">
              <span className="text-muted-foreground text-xs font-medium">
                시리즈 (선택)
              </span>
              <select
                name="seriesId"
                defaultValue={round?.seriesId ?? ""}
                className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
              >
                <option value="">— 시리즈 미지정 —</option>
                {allSeries.map((s: GsSeries) => (
                  <option key={s.seriesId} value={s.seriesId}>
                    {s.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-muted-foreground text-xs font-medium">
                회차 번호 (시리즈 안)
              </span>
              <input
                type="number"
                name="roundNumber"
                min={1}
                max={50}
                defaultValue={round?.roundNumber ?? ""}
                placeholder="예: 1"
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm tabular-nums"
              />
            </label>
            <label className="space-y-1 sm:col-span-2">
              <span className="text-muted-foreground text-xs font-medium">
                안내 (마크다운, 선택)
              </span>
              <Textarea
                name="descriptionMd"
                rows={3}
                defaultValue={round?.descriptionMd ?? ""}
                placeholder="회차 안내·주의사항을 입력하세요."
              />
            </label>
            <div className="sm:col-span-2 flex items-center justify-end gap-2 pt-1">
              {roundFetcher.data && "ok" in roundFetcher.data && roundFetcher.data.ok ? (
                <span className="text-muted-foreground text-xs">저장됨</span>
              ) : null}
              <Button
                type="submit"
                disabled={roundFetcher.state !== "idle"}
                className="h-9"
              >
                <SaveIcon className="size-4" />
                {isNew ? "회차 생성" : "회차 저장"}
              </Button>
            </div>
          </roundFetcher.Form>
        </CardContent>
      </Card>

      {!isNew && round ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold tracking-tight">
                문제 목록 ({questions.length}문항)
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
    </div>
  );
}

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
  };
  isNew?: boolean;
}) {
  const fetcher = useFetcher<typeof action>();
  const deleteFetcher = useFetcher<typeof action>();
  const [draft, setDraft] = useState(initial);
  const saved = fetcher.data && "ok" in fetcher.data && fetcher.data.ok;

  return (
    <div
      className={cn(
        "rounded-md border p-4",
        isNew ? "bg-muted/30 border-dashed" : "bg-background",
      )}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {isNew ? (
          <Badge variant="outline" className="text-[10px]">
            <PlusIcon className="size-3" /> 새 문항
          </Badge>
        ) : (
          <Badge variant="secondary" className="text-[10px]">
            #{draft.orderIndex + 1}
          </Badge>
        )}
        <input
          type="text"
          value={draft.title}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          placeholder="문제 제목 (예: 문 1.)"
          className="border-input bg-background h-8 flex-1 rounded-md border px-2 text-sm"
        />
        <label className="text-xs">
          <span className="text-muted-foreground mr-1">순서</span>
          <input
            type="number"
            min={0}
            value={draft.orderIndex}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                orderIndex: Number(e.target.value) || 0,
              }))
            }
            className="border-input bg-background h-8 w-14 rounded-md border px-2 text-sm tabular-nums"
          />
        </label>
        <label className="text-xs">
          <span className="text-muted-foreground mr-1">배점</span>
          <input
            type="number"
            min={1}
            max={1000}
            value={draft.maxScore}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                maxScore: Number(e.target.value) || 100,
              }))
            }
            className="border-input bg-background h-8 w-16 rounded-md border px-2 text-sm tabular-nums"
          />
        </label>
      </div>
      <div className="space-y-2">
        <label className="space-y-1">
          <span className="text-muted-foreground text-xs font-medium">본문</span>
          <Textarea
            value={draft.bodyMd}
            onChange={(e) => setDraft((d) => ({ ...d, bodyMd: e.target.value }))}
            rows={5}
            placeholder="문제 본문을 입력하세요."
          />
        </label>
        <label className="space-y-1">
          <span className="text-muted-foreground text-xs font-medium">
            모범답안 (선택)
          </span>
          <Textarea
            value={draft.modelAnswerMd}
            onChange={(e) =>
              setDraft((d) => ({ ...d, modelAnswerMd: e.target.value }))
            }
            rows={5}
            placeholder="채점 기준·모범답안. 학생에게는 제출 후 노출됩니다."
          />
        </label>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        {saved ? (
          <span className="text-muted-foreground text-xs">저장됨</span>
        ) : null}
        {!isNew && draft.questionId ? (
          <deleteFetcher.Form method="post">
            <input type="hidden" name="intent" value="delete-question" />
            <input type="hidden" name="questionId" value={draft.questionId} />
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className="text-destructive h-8"
              onClick={(e) => {
                if (!confirm("이 문항을 삭제할까요? (관련 답안도 함께 삭제)"))
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
            <input
              type="hidden"
              name="questionId"
              value={draft.questionId}
            />
          ) : null}
          <input
            type="hidden"
            name="orderIndex"
            value={draft.orderIndex}
          />
          <input type="hidden" name="title" value={draft.title} />
          <input type="hidden" name="bodyMd" value={draft.bodyMd} />
          <input
            type="hidden"
            name="modelAnswerMd"
            value={draft.modelAnswerMd}
          />
          <input type="hidden" name="maxScore" value={draft.maxScore} />
          <Button
            type="submit"
            size="sm"
            disabled={fetcher.state !== "idle" || !draft.bodyMd.trim()}
            className="h-8"
          >
            <SaveIcon className="size-3.5" />
            {isNew ? "문항 추가" : "문항 저장"}
          </Button>
        </fetcher.Form>
      </div>
    </div>
  );
}
