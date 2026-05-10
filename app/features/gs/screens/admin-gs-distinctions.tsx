// 운영자 우수 답안 선정 — 회차 종합 + 4문제 각각.
// 자동 추천(상위 N) + 수동 마킹·해제 + 공개/익명/포인트 설정.

import {
  ArrowLeftIcon,
  AwardIcon,
  CheckIcon,
  CrownIcon,
  EyeIcon,
  EyeOffIcon,
  Trash2Icon,
  UserIcon,
  UsersIcon,
} from "lucide-react";
import { Form, Link, data, redirect, useFetcher } from "react-router";
import { z } from "zod";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Separator } from "~/core/components/ui/separator";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  getGsRound,
  getRoundQuestionStats,
  getRoundStudentStats,
  listGsQuestions,
  listGsSubmissionsForRound,
} from "~/features/gs/queries.server";
import {
  type Distinction,
  listDistinctionsForRound,
  markDistinguished,
  unmarkDistinguished,
  updateDistinction,
} from "~/features/gs/queries-distinctions.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { LAW_SUBJECTS } from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-gs-distinctions";

export const meta: Route.MetaFunction = ({ data: loaderData }) => [
  {
    title: loaderData?.round
      ? `${loaderData.round.title} 우수 답안 | Lidam Edu`
      : "우수 답안 선정 | Lidam Edu",
  },
];

const markSchema = z.object({
  intent: z.literal("mark"),
  submissionId: z.string().uuid(),
  questionId: z.union([z.string().uuid(), z.literal("")]),
  reason: z.string().optional(),
  pointsAwarded: z.coerce.number().min(0).max(10000),
  isPublished: z.union([z.literal("true"), z.literal("false")]).optional(),
  isAnonymous: z.union([z.literal("true"), z.literal("false")]).optional(),
});
const updateSchema = z.object({
  intent: z.literal("update"),
  distinctionId: z.string().uuid(),
  isPublished: z.union([z.literal("true"), z.literal("false")]).optional(),
  isAnonymous: z.union([z.literal("true"), z.literal("false")]).optional(),
});
const removeSchema = z.object({
  intent: z.literal("remove"),
  distinctionId: z.string().uuid(),
});

export async function loader({ params, request }: Route.LoaderArgs) {
  const roundId = params.roundId;
  if (!roundId) throw data("Missing roundId", { status: 404 });
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const [round, questions, students, qStats, distinctions, submissions] =
    await Promise.all([
      getGsRound(client, roundId),
      listGsQuestions(client, roundId),
      getRoundStudentStats(client, roundId),
      getRoundQuestionStats(client, roundId),
      listDistinctionsForRound(client, roundId),
      listGsSubmissionsForRound(client, roundId),
    ]);
  if (!round) throw data("Round not found", { status: 404 });

  // 문항별 점수 (gs_answers 직접 조회) — 자동 추천 용.
  const submissionByUser = new Map(
    submissions.map((s) => [s.submissionId, s.userId] as const),
  );
  const userById = new Map(submissions.map((s) => [s.userId, s.submissionId]));
  const { data: ans } = await client
    .from("gs_answers")
    .select("submission_id, question_id, score")
    .in(
      "submission_id",
      submissions.map((s) => s.submissionId),
    );

  // user 이름.
  const userIds = Array.from(new Set(submissions.map((s) => s.userId)));
  const { data: profiles } = await client
    .from("profiles")
    .select("profile_id, name")
    .in("profile_id", userIds);
  const nameMap = new Map<string, string | null>();
  for (const p of profiles ?? []) nameMap.set(p.profile_id, p.name);

  // 문항별 상위 답안 후보 (점수 내림차순).
  const perQuestionTop = new Map<
    string,
    { submissionId: string; userId: string; userName: string | null; score: number }[]
  >();
  for (const q of questions) {
    const list = (ans ?? [])
      .filter((a) => a.question_id === q.questionId && a.score != null)
      .map((a) => ({
        submissionId: a.submission_id,
        userId: submissionByUser.get(a.submission_id) ?? "",
        userName: nameMap.get(submissionByUser.get(a.submission_id) ?? "") ?? null,
        score: Number(a.score),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
    perQuestionTop.set(q.questionId, list);
  }

  return {
    round,
    questions,
    qStats,
    students: students.slice(0, 10),
    perQuestionTopJson: Object.fromEntries(perQuestionTop.entries()),
    distinctions,
    nameMap: Object.fromEntries(nameMap.entries()),
    submissionByUser: Object.fromEntries(submissionByUser.entries()),
    userByIdJson: Object.fromEntries(userById.entries()),
  };
}

export async function action({ params, request }: Route.ActionArgs) {
  const roundId = params.roundId;
  if (!roundId) return { ok: false, error: "Missing roundId" } as const;
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" } as const;
  const role = await getStaffRole(client, user.id);
  if (!role) return { ok: false, error: "Forbidden" } as const;

  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "");

  if (intent === "mark") {
    const parsed = markSchema.safeParse({
      intent,
      submissionId: fd.get("submissionId"),
      questionId: fd.get("questionId") ?? "",
      reason: fd.get("reason") ?? undefined,
      pointsAwarded: fd.get("pointsAwarded"),
      isPublished: fd.get("isPublished") ?? undefined,
      isAnonymous: fd.get("isAnonymous") ?? undefined,
    });
    if (!parsed.success) return { ok: false, error: "Invalid input" } as const;
    await markDistinguished(client, user.id, {
      roundId,
      submissionId: parsed.data.submissionId,
      questionId:
        parsed.data.questionId === "" ? null : parsed.data.questionId,
      reason: parsed.data.reason?.trim() || null,
      pointsAwarded: parsed.data.pointsAwarded,
      isPublished: parsed.data.isPublished !== "false",
      isAnonymous: parsed.data.isAnonymous !== "false",
    });
    return { ok: true } as const;
  }

  if (intent === "update") {
    const parsed = updateSchema.safeParse({
      intent,
      distinctionId: fd.get("distinctionId"),
      isPublished: fd.get("isPublished") ?? undefined,
      isAnonymous: fd.get("isAnonymous") ?? undefined,
    });
    if (!parsed.success) return { ok: false, error: "Invalid input" } as const;
    await updateDistinction(client, parsed.data.distinctionId, {
      isPublished:
        parsed.data.isPublished === undefined
          ? undefined
          : parsed.data.isPublished === "true",
      isAnonymous:
        parsed.data.isAnonymous === undefined
          ? undefined
          : parsed.data.isAnonymous === "true",
    });
    return { ok: true } as const;
  }

  if (intent === "remove") {
    const parsed = removeSchema.safeParse({
      intent,
      distinctionId: fd.get("distinctionId"),
    });
    if (!parsed.success) return { ok: false, error: "Invalid input" } as const;
    await unmarkDistinguished(client, parsed.data.distinctionId, user.id);
    return { ok: true } as const;
  }

  return redirect(`/admin/gs/${roundId}/distinctions`);
}

export default function AdminGsDistinctions({
  loaderData,
}: Route.ComponentProps) {
  const {
    round,
    questions,
    students,
    distinctions,
    perQuestionTopJson,
    nameMap,
    submissionByUser,
    userByIdJson,
  } = loaderData;

  // 분류 — 종합(question_id null) vs 문항별.
  const totalDistinctions = distinctions.filter((d) => d.questionId == null);
  const byQuestion = new Map<string, Distinction[]>();
  for (const d of distinctions) {
    if (d.questionId) {
      const list = byQuestion.get(d.questionId) ?? [];
      list.push(d);
      byQuestion.set(d.questionId, list);
    }
  }

  return (
    <div className="mx-auto w-full max-w-screen-xl px-5 py-6 md:px-10 md:py-8">
      <header className="mb-6 space-y-1">
        <Link
          to={`/admin/gs/${round.roundId}`}
          className="text-muted-foreground inline-flex items-center gap-1 text-xs hover:underline"
        >
          <ArrowLeftIcon className="size-3" /> 회차 편집
        </Link>
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
          <AwardIcon className="size-3.5" /> 우수 답안 선정
        </p>
        <h1 className="text-2xl font-bold tracking-tight">{round.title}</h1>
        <p className="text-muted-foreground text-sm">
          {LAW_SUBJECTS[round.subject]?.name ?? round.subject} · 마킹 시 답안
          작성자에게 포인트가 지급됩니다. 마킹 해제 시 자동 회수.
        </p>
      </header>

      {/* 회차 종합 우수자 */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CrownIcon className="text-amber-500 size-5" />
            <h2 className="text-sm font-semibold tracking-tight">
              회차 종합 우수자
            </h2>
            <Badge variant="outline" className="text-[10px]">
              {totalDistinctions.length}명 마킹됨
            </Badge>
          </div>
          <p className="text-muted-foreground text-xs">
            총점 상위 학생을 회차 종합 우수자로 선정. 후보는 채점 완료된 학생 중
            상위 10명.
          </p>
        </CardHeader>
        <CardContent>
          {students.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-sm">
              아직 채점된 답안이 없습니다.
            </p>
          ) : (
            <ul className="divide-y">
              {students.map((s) => {
                const sid = userByIdJson[s.userId];
                if (!sid) return null;
                const existing = totalDistinctions.find(
                  (d) => d.submissionId === sid,
                );
                return (
                  <CandidateRow
                    key={s.userId}
                    rank={s.rank}
                    userName={s.userName}
                    userId={s.userId}
                    submissionId={sid}
                    score={`${s.totalScore} (z ${s.zScore > 0 ? "+" : ""}${s.zScore.toFixed(2)}σ)`}
                    questionId=""
                    distinction={existing ?? null}
                    defaultPoints={100}
                  />
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* 문항별 우수자 */}
      {questions.map((q) => {
        const top = (perQuestionTopJson[q.questionId] ?? []) as {
          submissionId: string;
          userId: string;
          userName: string | null;
          score: number;
        }[];
        const marked = byQuestion.get(q.questionId) ?? [];
        return (
          <Card key={q.questionId} className="mb-6">
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-[10px]">
                  #{q.orderIndex + 1}
                </Badge>
                <h2 className="text-sm font-semibold tracking-tight">
                  {q.title ?? `문 ${q.orderIndex + 1}`}
                </h2>
                <Badge variant="secondary" className="text-[10px]">
                  {q.maxScore}점 만점
                </Badge>
                <Badge variant="outline" className="ml-auto text-[10px]">
                  {marked.length}명 마킹됨
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {top.length === 0 ? (
                <p className="text-muted-foreground py-4 text-center text-sm">
                  아직 채점된 답안이 없습니다.
                </p>
              ) : (
                <ul className="divide-y">
                  {top.map((t, i) => {
                    const existing = marked.find(
                      (d) => d.submissionId === t.submissionId,
                    );
                    return (
                      <CandidateRow
                        key={t.submissionId}
                        rank={i + 1}
                        userName={t.userName}
                        userId={t.userId}
                        submissionId={t.submissionId}
                        score={`${t.score} / ${q.maxScore}`}
                        questionId={q.questionId}
                        distinction={existing ?? null}
                        defaultPoints={50}
                      />
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function CandidateRow({
  rank,
  userName,
  userId,
  submissionId,
  score,
  questionId,
  distinction,
  defaultPoints,
}: {
  rank: number;
  userName: string | null;
  userId: string;
  submissionId: string;
  score: string;
  questionId: string; // "" = 종합
  distinction: Distinction | null;
  defaultPoints: number;
}) {
  const fetcher = useFetcher();
  const removeFetcher = useFetcher();
  const updateFetcher = useFetcher();
  const isMarked = distinction != null;

  return (
    <li className="flex flex-wrap items-center gap-2 py-2">
      <Badge
        variant={rank <= 3 ? "default" : "outline"}
        className="w-10 justify-center text-[11px] tabular-nums"
      >
        {rank}위
      </Badge>
      <div className="min-w-[180px]">
        <p className="text-sm font-medium">
          {userName ?? (
            <span className="text-muted-foreground italic">미설정</span>
          )}
        </p>
        <p className="text-muted-foreground text-[10px] tabular-nums">
          {userId.slice(0, 8)}
        </p>
      </div>
      <span className="text-foreground text-sm font-semibold tabular-nums">
        {score}
      </span>

      {isMarked ? (
        <>
          <Badge className="bg-emerald-600 text-white text-[10px] hover:bg-emerald-600">
            <CheckIcon className="size-3" /> 우수자
          </Badge>
          <span className="text-muted-foreground text-[11px] tabular-nums">
            +{distinction.pointsAwarded}P
          </span>
          {/* 공개·익명 토글 */}
          <updateFetcher.Form method="post" className="inline">
            <input type="hidden" name="intent" value="update" />
            <input
              type="hidden"
              name="distinctionId"
              value={distinction.distinctionId}
            />
            <input
              type="hidden"
              name="isPublished"
              value={distinction.isPublished ? "false" : "true"}
            />
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px]"
              title={distinction.isPublished ? "비공개로" : "공개로"}
            >
              {distinction.isPublished ? (
                <EyeIcon className="text-emerald-600 size-3.5" />
              ) : (
                <EyeOffIcon className="text-muted-foreground size-3.5" />
              )}
              {distinction.isPublished ? "공개" : "비공개"}
            </Button>
          </updateFetcher.Form>
          <updateFetcher.Form method="post" className="inline">
            <input type="hidden" name="intent" value="update" />
            <input
              type="hidden"
              name="distinctionId"
              value={distinction.distinctionId}
            />
            <input
              type="hidden"
              name="isAnonymous"
              value={distinction.isAnonymous ? "false" : "true"}
            />
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px]"
              title={distinction.isAnonymous ? "이름 노출" : "익명으로"}
            >
              {distinction.isAnonymous ? (
                <UsersIcon className="size-3.5" />
              ) : (
                <UserIcon className="size-3.5" />
              )}
              {distinction.isAnonymous ? "익명" : "이름 노출"}
            </Button>
          </updateFetcher.Form>
          <removeFetcher.Form method="post" className="inline ml-auto">
            <input type="hidden" name="intent" value="remove" />
            <input
              type="hidden"
              name="distinctionId"
              value={distinction.distinctionId}
            />
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className="text-destructive h-7"
              onClick={(e) => {
                if (
                  !confirm(
                    "마킹을 해제하면 지급된 포인트가 자동 회수됩니다. 진행할까요?",
                  )
                )
                  e.preventDefault();
              }}
            >
              <Trash2Icon className="size-3" /> 해제
            </Button>
          </removeFetcher.Form>
        </>
      ) : (
        <fetcher.Form method="post" className="ml-auto inline-flex items-center gap-2">
          <input type="hidden" name="intent" value="mark" />
          <input type="hidden" name="submissionId" value={submissionId} />
          <input type="hidden" name="questionId" value={questionId} />
          <input
            type="text"
            name="reason"
            placeholder="선정 사유 (선택)"
            className="border-input bg-background h-7 w-44 rounded-md border px-2 text-[11px]"
          />
          <label className="text-[11px]">
            <span className="text-muted-foreground mr-1">P</span>
            <input
              type="number"
              name="pointsAwarded"
              min={0}
              max={10000}
              defaultValue={defaultPoints}
              className="border-input bg-background h-7 w-16 rounded-md border px-2 text-[11px] tabular-nums"
            />
          </label>
          <Button type="submit" size="sm" className="h-7 text-xs">
            <AwardIcon className="size-3" /> 우수 마킹
          </Button>
        </fetcher.Form>
      )}
    </li>
  );
}

// linter shut-up — submissionByUser/nameMap 은 이름 lookup 에 활용되며 props 로 직접 안 쓰임.
// (loader 가 반환한 그대로 전달, 향후 확장 여지)
const _unused = () => ({ submissionByUser: 0, nameMap: 0 });
void _unused;

// hint 기능 미구현(향후): score 수치를 정렬해 색상 강조 등.
function _h(_v: number) {
  return cn(_v > 0 && "");
}
void _h;
