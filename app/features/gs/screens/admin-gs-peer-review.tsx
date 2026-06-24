// 운영자 동료 채점 배정 + 진행 현황. 학생-답안 매트릭스로 한눈에 보기.
// P5 WORKSPACE 디자인. cluster="gs".

import { CheckCircle2Icon, ShuffleIcon, UsersIcon } from "lucide-react";
import { Form, data } from "react-router";
import { z } from "zod";

import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";
import { cn } from "~/core/lib/utils";
import { runAfterResponse } from "~/core/lib/wait-until.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import {
  Bar,
  Chip,
  Field,
  IndexTable,
  TD,
  TR,
} from "~/features/admin/components/admin-ui";
import { notifyPeerAssignments } from "~/features/gs/notify.server";
import {
  getGsRound,
  listGsSubmissionsForRound,
} from "~/features/gs/queries.server";
import {
  assignPeerReviewers,
  deletePeerAssignment,
  listPeerAssignmentsForRound,
} from "~/features/gs/queries-peer.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { LAW_SUBJECTS } from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-gs-peer-review";

export const meta: Route.MetaFunction = ({ data: loaderData }) => [
  {
    title: loaderData?.round
      ? `${loaderData.round.title} 동료 채점 | 리담변리사학원`
      : "동료 채점 | 리담변리사학원",
  },
];

const assignSchema = z.object({
  intent: z.literal("assign"),
  perSubmission: z.coerce.number().int().min(1).max(10),
});
const deleteSchema = z.object({
  intent: z.literal("delete-assignment"),
  assignmentId: z.string().uuid(),
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

  const round = await getGsRound(client, roundId);
  if (!round) throw data("Round not found", { status: 404 });

  const [submissions, assignments] = await Promise.all([
    listGsSubmissionsForRound(client, roundId),
    listPeerAssignmentsForRound(client, roundId),
  ]);

  // 학생 이름 lookup.
  const allUserIds = Array.from(
    new Set([
      ...submissions.map((s) => s.userId),
      ...assignments.map((a) => a.reviewerUserId),
    ]),
  );
  const { data: profiles } = await client
    .from("profiles")
    .select("profile_id, name")
    .in("profile_id", allUserIds);
  const nameMap: Record<string, string | null> = {};
  for (const p of profiles ?? []) nameMap[p.profile_id] = p.name;

  return { round, submissions, assignments, nameMap, role };
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

  if (intent === "assign") {
    const parsed = assignSchema.safeParse({
      intent,
      perSubmission: fd.get("perSubmission"),
    });
    if (!parsed.success) return { ok: false, error: "Invalid input" } as const;
    const result = await assignPeerReviewers(
      client,
      roundId,
      parsed.data.perSubmission,
    );
    if (result.newAssignments.length > 0) {
      const round = await client
        .from("gs_rounds")
        .select("round_id, title, subject, end_at")
        .eq("round_id", roundId)
        .maybeSingle();
      if (round.data) {
        const notifyTask = notifyPeerAssignments(result.newAssignments, [
          {
            roundId: round.data.round_id,
            title: round.data.title,
            subject: round.data.subject,
            endAt: round.data.end_at,
          },
        ]);
        runAfterResponse(notifyTask);
      }
    }
    return { ok: true, created: result.created, skipped: result.skipped } as const;
  }

  if (intent === "delete-assignment") {
    const parsed = deleteSchema.safeParse({
      intent,
      assignmentId: fd.get("assignmentId"),
    });
    if (!parsed.success) return { ok: false, error: "Invalid input" } as const;
    await deletePeerAssignment(client, parsed.data.assignmentId);
    return { ok: true } as const;
  }

  return { ok: false, error: "Unknown intent" } as const;
}

export default function AdminGsPeerReview({
  loaderData,
}: Route.ComponentProps) {
  const { round, submissions, assignments, nameMap, role } = loaderData;
  const submitted = submissions.filter((s) => s.submittedAt != null);
  const submittedIds = new Set(submitted.map((s) => s.submissionId));

  const assignmentsBySubmission = new Map<string, typeof assignments>();
  for (const a of assignments) {
    const list = assignmentsBySubmission.get(a.submissionId) ?? [];
    list.push(a);
    assignmentsBySubmission.set(a.submissionId, list);
  }

  const reviewerStats = new Map<
    string,
    { assigned: number; submitted: number }
  >();
  for (const a of assignments) {
    const cur = reviewerStats.get(a.reviewerUserId) ?? {
      assigned: 0,
      submitted: 0,
    };
    cur.assigned += 1;
    if (a.submittedAt) cur.submitted += 1;
    reviewerStats.set(a.reviewerUserId, cur);
  }

  const completedCount = assignments.filter((a) => a.submittedAt).length;

  return (
    <AdminShell
      cluster="gs"
      role={role}
      title={`${round.title} — 동료 채점`}
      desc={`${LAW_SUBJECTS[round.subject]?.name ?? round.subject} · 제출 ${submitted.length}건 · 배정 ${assignments.length}건 · 완료 ${completedCount}건`}
      headerRight={
        assignments.length > 0 && completedCount === assignments.length ? (
          <Chip tone="emerald">
            <CheckCircle2Icon className="size-3" /> 전체 완료
          </Chip>
        ) : undefined
      }
      width={1280}
    >
      <div className="space-y-6">
        {/* 배정 실행 */}
        <div className="bg-card border-border rounded-xl border p-5 shadow-sm">
          <p className="mb-1 text-sm font-semibold">동료 채점 배정</p>
          <p className="text-muted-foreground mb-4 text-xs">
            제출한 학생들을 셔플해 답안 1건당 N명에게 배정합니다. 자기 답안은
            배정되지 않으며, 이미 배정된 (답안, 채점자) 쌍은 보존됩니다. 부담을
            균등하게 분배합니다.
          </p>
          <Form method="post" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="intent" value="assign" />
            <Field label="답안당 채점자 수" htmlFor="per-submission-input">
              <input
                id="per-submission-input"
                type="number"
                name="perSubmission"
                min={1}
                max={10}
                defaultValue={3}
                className="border-input bg-background h-9 w-20 rounded-md border px-3 text-[13px] tabular-nums outline-none"
              />
            </Field>
            <Button
              type="submit"
              disabled={submitted.length < 2}
              className="rounded-full"
              onClick={(e) => {
                if (
                  !confirm(
                    "셔플하여 부족분만 추가 배정합니다. 진행할까요?\n(이미 배정된 쌍은 유지됩니다)",
                  )
                )
                  e.preventDefault();
              }}
            >
              <ShuffleIcon className="size-3.5" /> 배정 실행
            </Button>
            {submitted.length < 2 ? (
              <span className="text-muted-foreground text-xs">
                제출 답안이 2건 이상이어야 동료 채점이 가능합니다.
              </span>
            ) : null}
          </Form>
        </div>

        {/* 학생별 채점 부담 */}
        <div>
          <p className="text-muted-foreground mb-2 font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
            학생별 채점 부담
          </p>
          {reviewerStats.size === 0 ? (
            <div className="border-border bg-card flex flex-col items-center gap-2 rounded-xl border p-10 text-center shadow-sm">
              <UsersIcon className="text-muted-foreground/60 size-7" />
              <p className="text-muted-foreground text-sm">아직 배정이 없습니다.</p>
            </div>
          ) : (
            <IndexTable
              headers={[
                { label: "학생" },
                { label: "배정", align: "right", width: "80px" },
                { label: "완료", align: "right", width: "80px" },
                { label: "진행률", width: "180px" },
              ]}
              minWidth={420}
            >
              {Array.from(reviewerStats.entries())
                .sort(([, a], [, b]) => b.assigned - a.assigned)
                .map(([uid, st]) => {
                  const pct = Math.round((st.submitted / st.assigned) * 100);
                  return (
                    <TR key={uid}>
                      <TD>
                        {nameMap[uid] ?? (
                          <span className="text-muted-foreground italic">미설정</span>
                        )}
                        <p className="text-muted-foreground mt-0.5 font-mono text-[10px] tabular-nums">
                          {uid.slice(0, 8)}
                        </p>
                      </TD>
                      <TD align="right" mono>{st.assigned}</TD>
                      <TD align="right" mono>{st.submitted}</TD>
                      <TD>
                        <div className="flex items-center gap-2">
                          <Bar
                            value={st.submitted}
                            max={st.assigned}
                            tone={
                              pct === 100
                                ? "emerald"
                                : pct > 0
                                  ? "amber"
                                  : "coral"
                            }
                            className="w-16"
                          />
                          <span className="text-muted-foreground tabular-nums text-[11px]">
                            {pct}%
                          </span>
                        </div>
                      </TD>
                    </TR>
                  );
                })}
            </IndexTable>
          )}
        </div>

        {/* 답안별 배정 */}
        <div>
          <p className="text-muted-foreground mb-2 font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
            답안별 배정
          </p>
          {submitted.length === 0 ? (
            <div className="border-border bg-card flex flex-col items-center gap-2 rounded-xl border p-10 text-center shadow-sm">
              <UsersIcon className="text-muted-foreground/60 size-7" />
              <p className="text-muted-foreground text-sm">아직 제출된 답안이 없습니다.</p>
            </div>
          ) : (
            <IndexTable
              headers={[
                { label: "답안 작성자", width: "220px" },
                { label: "배정된 채점자" },
              ]}
              minWidth={500}
            >
              {submitted.map((s) => {
                const list = (assignmentsBySubmission.get(s.submissionId) ?? []) as typeof assignments;
                return (
                  <TR key={s.submissionId}>
                    <TD>
                      <span className="font-semibold">
                        {nameMap[s.userId] ?? (
                          <span className="text-muted-foreground font-normal italic">미설정</span>
                        )}
                      </span>
                      <p className="text-muted-foreground mt-0.5 font-mono text-[10px] tabular-nums">
                        {s.userId.slice(0, 8)}
                      </p>
                    </TD>
                    <TD>
                      {list.length === 0 ? (
                        <span className="text-muted-foreground text-xs italic">미배정</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {list.map((a) => (
                            <ReviewerChip
                              key={a.assignmentId}
                              assignmentId={a.assignmentId}
                              name={nameMap[a.reviewerUserId] ?? "(미설정)"}
                              userIdShort={a.reviewerUserId.slice(0, 8)}
                              done={a.submittedAt != null}
                              visible={submittedIds.has(s.submissionId)}
                            />
                          ))}
                        </div>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </IndexTable>
          )}
        </div>
      </div>
    </AdminShell>
  );
}

/* ── ReviewerChip ──────────────────────────────────────────────────────── */

function ReviewerChip({
  assignmentId,
  name,
  userIdShort,
  done,
  visible,
}: {
  assignmentId: string;
  name: string;
  userIdShort: string;
  done: boolean;
  visible: boolean;
}) {
  return (
    <Form method="post" className="inline-flex">
      <input type="hidden" name="intent" value="delete-assignment" />
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <button
        type="submit"
        title="클릭하여 배정 취소"
        onClick={(e) => {
          if (!visible) e.preventDefault();
          if (!confirm("이 채점 배정을 취소합니다. 진행할까요?"))
            e.preventDefault();
        }}
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors hover:bg-rose-50 hover:border-rose-300 dark:hover:bg-rose-950/30",
          done
            ? "bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-700/50 dark:text-emerald-300"
            : "bg-background border-input text-foreground",
        )}
      >
        <span
          className={cn(
            "inline-flex h-4 items-center rounded-full px-1 text-[9px] font-semibold",
            done
              ? "border border-emerald-500 text-emerald-700"
              : "border border-input text-muted-foreground",
          )}
        >
          {done ? "완료" : "진행중"}
        </span>
        <span>{name}</span>
        <span className="text-muted-foreground tabular-nums">·{userIdShort}</span>
      </button>
    </Form>
  );
}
