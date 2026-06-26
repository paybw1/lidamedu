// 운영자 우수 답안 선정 — 회차 종합 + 4문제 각각.
// 자동 추천(상위 N) + 수동 마킹·해제 + 공개/익명/포인트 설정.
// P6 REVIEW QUEUE 디자인. cluster="gs".

import {
  AwardIcon,
  CheckIcon,
  CrownIcon,
  EyeIcon,
  EyeOffIcon,
  Trash2Icon,
  UserIcon,
  UsersIcon,
} from "lucide-react";
import { type ReactNode } from "react";
import { Form, data, redirect, useFetcher } from "react-router";
import { z } from "zod";

import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";
import { cn } from "~/core/lib/utils";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip, Field } from "~/features/admin/components/admin-ui";
import {
  type Distinction,
  listDistinctionsForRound,
  markDistinguished,
  unmarkDistinguished,
  updateDistinction,
} from "~/features/gs/queries-distinctions.server";
import {
  getGsRound,
  getRoundQuestionStats,
  getRoundStudentStats,
  listGsQuestions,
  listGsSubmissionsForRound,
} from "~/features/gs/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { LAW_SUBJECTS } from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-gs-distinctions";

export const meta: Route.MetaFunction = ({ data: loaderData }) => [
  {
    title: loaderData?.round
      ? `${loaderData.round.title} 우수 답안 | 리담변리사학원`
      : "우수 답안 선정 | 리담변리사학원",
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

  const userIds = Array.from(new Set(submissions.map((s) => s.userId)));
  const { data: profiles } = await client
    .from("profiles")
    .select("profile_id, name")
    .in("profile_id", userIds);
  const nameMap = new Map<string, string | null>();
  for (const p of profiles ?? []) nameMap.set(p.profile_id, p.name);

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
    role,
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
      questionId: parsed.data.questionId === "" ? null : parsed.data.questionId,
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
    userByIdJson,
    role,
  } = loaderData;

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
    <AdminShell
      cluster="gs"
      role={role}
      title={`${round.title} — 우수 답안`}
      desc={`${LAW_SUBJECTS[round.subject]?.name ?? round.subject} · 마킹 시 답안 작성자에게 포인트가 지급됩니다. 마킹 해제 시 자동 회수됩니다.`}
      headerRight={
        distinctions.length > 0 ? (
          <Chip tone="amber">
            <CrownIcon className="size-3" /> {distinctions.length}명 마킹됨
          </Chip>
        ) : undefined
      }
      width={1280}
    >
      <div className="space-y-6">
        {/* 회차 종합 우수자 */}
        <SectionCard
          icon={<CrownIcon className="text-amber-500 size-4" />}
          title="회차 종합 우수자"
          badge={`${totalDistinctions.length}명 마킹됨`}
          desc="총점 상위 학생을 회차 종합 우수자로 선정합니다. 후보는 채점 완료된 학생 중 상위 10명입니다."
        >
          {students.length === 0 ? (
            <EmptyState text="아직 채점된 답안이 없습니다." />
          ) : (
            <ul className="divide-border divide-y">
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
        </SectionCard>

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
            <SectionCard
              key={q.questionId}
              icon={
                <span className="border-border bg-muted inline-flex h-[22px] items-center rounded-full border px-2 text-[11px] font-semibold tabular-nums">
                  #{q.orderIndex + 1}
                </span>
              }
              title={q.title ?? `문 ${q.orderIndex + 1}`}
              badge={`${q.maxScore}점 만점 · ${marked.length}명 마킹됨`}
            >
              {top.length === 0 ? (
                <EmptyState text="아직 채점된 답안이 없습니다." />
              ) : (
                <ul className="divide-border divide-y">
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
            </SectionCard>
          );
        })}
      </div>
    </AdminShell>
  );
}

/* ── SectionCard ───────────────────────────────────────────────────────── */

function SectionCard({
  icon,
  title,
  badge,
  desc,
  children,
}: {
  icon?: ReactNode;
  title: string;
  badge?: string;
  desc?: string;
  children: ReactNode;
}) {
  return (
    <div className="bg-card border-border overflow-hidden rounded-xl border shadow-sm">
      <div className="border-border/60 border-b px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          {icon}
          <h2 className="text-sm font-semibold">{title}</h2>
          {badge ? (
            <span className="text-muted-foreground bg-muted inline-flex h-[22px] items-center rounded-full px-2 text-[11px] font-semibold">
              {badge}
            </span>
          ) : null}
        </div>
        {desc ? (
          <p className="text-muted-foreground mt-1 text-xs">{desc}</p>
        ) : null}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

/* ── EmptyState ────────────────────────────────────────────────────────── */

function EmptyState({ text }: { text: string }) {
  return (
    <p className="text-muted-foreground py-6 text-center text-sm">{text}</p>
  );
}

/* ── CandidateRow ──────────────────────────────────────────────────────── */

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
  questionId: string;
  distinction: Distinction | null;
  defaultPoints: number;
}) {
  const fetcher = useFetcher();
  const removeFetcher = useFetcher();
  const updateFetcher = useFetcher();
  const isMarked = distinction != null;

  return (
    <li className="flex flex-wrap items-center gap-2 py-2.5">
      {/* 순위 */}
      <span
        className={cn(
          "inline-flex w-10 h-[22px] items-center justify-center rounded-full text-[11px] font-semibold tabular-nums",
          rank <= 3
            ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
            : "bg-muted text-muted-foreground",
        )}
      >
        {rank}위
      </span>

      {/* 학생 정보 */}
      <div className="min-w-[160px]">
        <p className="text-sm font-medium">
          {userName ?? (
            <span className="text-muted-foreground italic">미설정</span>
          )}
        </p>
        <p className="text-muted-foreground font-mono text-[10px] tabular-nums">
          {userId.slice(0, 8)}
        </p>
      </div>

      <span className="text-foreground text-sm font-semibold tabular-nums">
        {score}
      </span>

      {isMarked ? (
        /* 마킹됨 상태 — 공개/익명 토글 + 해제 */
        <>
          <Chip tone="emerald">
            <CheckIcon className="size-3" /> 우수자
          </Chip>
          <span className="text-muted-foreground text-[11px] tabular-nums">
            +{distinction.pointsAwarded}P
          </span>

          {/* 공개 토글 */}
          <updateFetcher.Form method="post" className="inline">
            <input type="hidden" name="intent" value="update" />
            <input type="hidden" name="distinctionId" value={distinction.distinctionId} />
            <input
              type="hidden"
              name="isPublished"
              value={distinction.isPublished ? "false" : "true"}
            />
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className="h-7 rounded-full px-2 text-[11px]"
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

          {/* 익명 토글 */}
          <updateFetcher.Form method="post" className="inline">
            <input type="hidden" name="intent" value="update" />
            <input type="hidden" name="distinctionId" value={distinction.distinctionId} />
            <input
              type="hidden"
              name="isAnonymous"
              value={distinction.isAnonymous ? "false" : "true"}
            />
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className="h-7 rounded-full px-2 text-[11px]"
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

          {/* 마킹 해제 — 코랄 위험 동작 */}
          <removeFetcher.Form method="post" className="ml-auto inline">
            <input type="hidden" name="intent" value="remove" />
            <input type="hidden" name="distinctionId" value={distinction.distinctionId} />
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className="text-rose-600 hover:text-rose-700 h-7 rounded-full"
              onClick={(e) => {
                if (
                  !confirm(
                    "마킹을 해제하면 지급된 포인트가 자동 회수됩니다. 진행하시겠습니까?",
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
        /* 미마킹 상태 — 마킹 폼 */
        <fetcher.Form
          method="post"
          className="ml-auto inline-flex flex-wrap items-center gap-2"
        >
          <input type="hidden" name="intent" value="mark" />
          <input type="hidden" name="submissionId" value={submissionId} />
          <input type="hidden" name="questionId" value={questionId} />
          <Field label="선정 사유" htmlFor={`reason-${submissionId}-${questionId}`}>
            <input
              id={`reason-${submissionId}-${questionId}`}
              type="text"
              name="reason"
              placeholder="선정 사유 (선택)"
              className="border-input bg-background focus:border-primary h-8 w-40 rounded-md border px-2 text-[12px] outline-none"
            />
          </Field>
          <Field label="포인트 (P)" htmlFor={`pts-${submissionId}-${questionId}`}>
            <input
              id={`pts-${submissionId}-${questionId}`}
              type="number"
              name="pointsAwarded"
              min={0}
              max={10000}
              defaultValue={defaultPoints}
              className="border-input bg-background focus:border-primary h-8 w-16 rounded-md border px-2 text-[12px] tabular-nums outline-none"
            />
          </Field>
          <Button type="submit" size="sm" className="h-8 rounded-full">
            <AwardIcon className="size-3" /> 우수 마킹
          </Button>
        </fetcher.Form>
      )}
    </li>
  );
}

