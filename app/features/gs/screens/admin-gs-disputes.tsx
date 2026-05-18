// 운영자 — 동료 채점 표준편차가 큰 (제출, 문항) 쌍 모아 보기.
// 채점자 간 의견 차이가 큰 문항(분쟁 가능성) 우선 검토용.
// P6 REVIEW QUEUE 디자인. cluster="gs".

import { AlertTriangleIcon, ArrowRightIcon, SlidersHorizontalIcon } from "lucide-react";
import { Form, Link, data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { cn } from "~/core/lib/utils";
import { AdminShell } from "~/features/admin/components/admin-shell";
import {
  AdminSelect,
  Chip,
  Field,
  FilterBar,
  FilterGroup,
  IndexTable,
  TD,
  TR,
} from "~/features/admin/components/admin-ui";
import {
  getGsRound,
  listGsQuestions,
  listGsSubmissionsForRound,
} from "~/features/gs/queries.server";
import { listPeerStdevForRound } from "~/features/gs/queries-peer.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { LAW_SUBJECTS } from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-gs-disputes";

export const meta: Route.MetaFunction = ({ data: loaderData }) => [
  {
    title: loaderData?.round
      ? `${loaderData.round.title} 분쟁 문항 | Lidam Patent Attorney Academy`
      : "분쟁 문항 | Lidam Patent Attorney Academy",
  },
];

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

  const url = new URL(request.url);
  // threshold: 0~1 의 만점 대비 비율. default 0.15. 클수록 분쟁만 좁게 본다.
  const tParam = Number(url.searchParams.get("t") ?? 0.15);
  const threshold = Number.isFinite(tParam) && tParam > 0 ? tParam : 0.15;
  // 최소 채점자 수.
  const mParam = Number(url.searchParams.get("min") ?? 2);
  const minReviewers = Number.isFinite(mParam) && mParam >= 2 ? mParam : 2;

  const [stdevRows, submissions, questions] = await Promise.all([
    listPeerStdevForRound(client, roundId),
    listGsSubmissionsForRound(client, roundId),
    listGsQuestions(client, roundId),
  ]);

  const questionMap = new Map(questions.map((q) => [q.questionId, q]));
  const userIds = Array.from(new Set(submissions.map((s) => s.userId)));
  const { data: profiles } = await client
    .from("profiles")
    .select("profile_id, name")
    .in("profile_id", userIds);
  const nameMap = new Map<string, string | null>();
  for (const p of profiles ?? []) nameMap.set(p.profile_id, p.name);
  const submissionAuthor = new Map(
    submissions.map((s) => [s.submissionId, s.userId] as const),
  );

  const filtered = stdevRows
    .map((r) => {
      const q = questionMap.get(r.questionId);
      const max = q?.maxScore ?? 100;
      return { ...r, maxScore: max, ratio: max > 0 ? r.stdev / max : 0 };
    })
    .filter((r) => r.count >= minReviewers && r.ratio >= threshold)
    .sort((a, b) => b.ratio - a.ratio);

  return {
    round,
    threshold,
    minReviewers,
    rows: filtered.map((r) => {
      const authorId = submissionAuthor.get(r.submissionId);
      return {
        submissionId: r.submissionId,
        questionId: r.questionId,
        questionTitle: questionMap.get(r.questionId)?.title ?? null,
        questionOrder: questionMap.get(r.questionId)?.orderIndex ?? 0,
        maxScore: r.maxScore,
        scores: r.scores,
        count: r.count,
        avg: r.avg,
        min: r.min,
        max: r.max,
        stdev: r.stdev,
        ratio: r.ratio,
        authorName: authorId ? nameMap.get(authorId) ?? null : null,
        authorIdShort: authorId ? authorId.slice(0, 8) : "",
      };
    }),
    totalConsidered: stdevRows.length,
    role,
  };
}

export default function AdminGsDisputes({ loaderData }: Route.ComponentProps) {
  const { round, threshold, minReviewers, rows, totalConsidered, role } = loaderData;
  const tPct = Math.round(threshold * 100);

  return (
    <AdminShell
      cluster="gs"
      role={role}
      title={`${round.title} — 분쟁 문항`}
      desc={`${LAW_SUBJECTS[round.subject]?.name ?? round.subject} · 동료 채점이 ${minReviewers}명 이상 도착, 표준편차 만점 대비 ${tPct}% 이상인 문항. 채점자 간 의견 차이가 큰 문항이라 직접 검토를 권합니다.`}
      headerRight={
        rows.length > 0 ? (
          <Chip tone="coral">
            <AlertTriangleIcon className="size-3" /> 분쟁 {rows.length}건
          </Chip>
        ) : undefined
      }
      width={1280}
    >
      {/* 필터 바 (GET Form) */}
      <Form method="get">
        <div className="border-border bg-card mb-4 flex flex-wrap items-end gap-3 rounded-xl border p-4 shadow-sm">
          <FilterGroup label="임계 (만점 대비)">
            <AdminSelect
              name="t"
              defaultValue={String(threshold)}
            >
              <option value="0.05">5%</option>
              <option value="0.10">10%</option>
              <option value="0.15">15% (기본)</option>
              <option value="0.20">20%</option>
              <option value="0.25">25%</option>
              <option value="0.30">30%</option>
            </AdminSelect>
          </FilterGroup>
          <Field label="최소 채점자" htmlFor="min-reviewers-input">
            <input
              id="min-reviewers-input"
              type="number"
              name="min"
              min={2}
              max={10}
              defaultValue={minReviewers}
              className="border-input bg-background focus:border-primary h-9 w-20 rounded-md border px-3 text-[13px] tabular-nums outline-none"
            />
          </Field>
          <button
            type="submit"
            className="bg-primary text-primary-foreground inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold"
          >
            <SlidersHorizontalIcon className="size-3.5" /> 적용
          </button>
          <span className="text-muted-foreground ml-auto self-center text-xs tabular-nums">
            집계 대상 {totalConsidered}건 중 임계 통과{" "}
            <span className="text-foreground font-semibold">{rows.length}건</span>
          </span>
        </div>
      </Form>

      {rows.length === 0 ? (
        <div className="border-border bg-card flex flex-col items-center gap-2 rounded-xl border p-12 text-center shadow-sm">
          <AlertTriangleIcon className="text-muted-foreground/60 size-8" />
          <p className="text-sm font-semibold">
            현재 임계를 넘는 분쟁 문항이 없습니다
          </p>
          <p className="text-muted-foreground text-xs">
            {totalConsidered === 0
              ? "아직 동료 채점이 도착하지 않았을 수 있습니다."
              : "임계를 낮춰 보거나 다른 회차를 확인해 보세요."}
          </p>
        </div>
      ) : (
        <IndexTable
          headers={[
            { label: "답안 작성자", width: "180px" },
            { label: "문항", width: "100px" },
            { label: "평균", align: "right", width: "140px" },
            { label: "범위", align: "right", width: "120px" },
            { label: "표준편차", align: "right", width: "130px" },
            { label: "개별 점수" },
            { label: "", width: "100px" },
          ]}
          minWidth={700}
        >
          {rows.map((r) => (
            <TR key={`${r.submissionId}:${r.questionId}`}>
              <TD>
                <span className="font-semibold">
                  {r.authorName ?? (
                    <span className="text-muted-foreground font-normal italic">미설정</span>
                  )}
                </span>
                <p className="text-muted-foreground mt-0.5 font-mono text-[10px] tabular-nums">
                  {r.authorIdShort}
                </p>
              </TD>
              <TD>
                <span className="border-border bg-muted inline-flex h-[22px] items-center rounded-full border px-2 text-[11px] font-semibold tabular-nums">
                  #{r.questionOrder + 1}
                </span>
                {r.questionTitle ? (
                  <p className="text-muted-foreground mt-0.5 truncate text-[11px]">
                    {r.questionTitle}
                  </p>
                ) : null}
              </TD>
              <TD align="right" mono>
                {r.avg} / {r.maxScore}
              </TD>
              <TD align="right" mono>
                {r.min} ~ {r.max}
              </TD>
              <TD align="right">
                <span
                  className={cn(
                    "font-semibold tabular-nums",
                    r.ratio >= 0.25
                      ? "text-rose-700 dark:text-rose-400"
                      : r.ratio >= 0.15
                        ? "text-amber-700 dark:text-amber-400"
                        : "text-foreground",
                  )}
                >
                  ±{r.stdev}
                </span>
                <span className="text-muted-foreground ml-1 text-[10px] tabular-nums">
                  ({Math.round(r.ratio * 100)}%)
                </span>
              </TD>
              <TD>
                <div className="flex flex-wrap gap-1">
                  {r.scores.map((s, i) => (
                    <span
                      key={i}
                      className="border-border inline-flex h-[20px] items-center rounded-full border px-2 text-[10px] tabular-nums"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </TD>
              <TD>
                <Link
                  to={`/admin/gs/${round.roundId}/grade/${r.submissionId}#question-${r.questionId}`}
                  className="text-primary inline-flex items-center gap-1 text-xs font-semibold hover:underline"
                >
                  검토 <ArrowRightIcon className="size-3" />
                </Link>
              </TD>
            </TR>
          ))}
        </IndexTable>
      )}
    </AdminShell>
  );
}

