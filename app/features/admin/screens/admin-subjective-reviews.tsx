// 강사 주관식 첨삭 큐 — 미처리 우선 단일 큐. 행을 인라인 펼침해 점수·코멘트 입력 후 제출.
// P6 REVIEW QUEUE 디자인 (lidam-admin/SubjReviewsScreen).

import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  ClockIcon,
  ExternalLinkIcon,
  InboxIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, data, useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Textarea } from "~/core/components/ui/textarea";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip, Field } from "~/features/admin/components/admin-ui";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  listPendingSubjectiveReviews,
  type PendingReviewItem,
  type SubjectiveAttempt,
} from "~/features/study/queries.server";

import type { Route } from "./+types/admin-subjective-reviews";

export const meta: Route.MetaFunction = () => [
  { title: "주관식 첨삭 큐 | 리담변리사학원" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const [pending, completed] = await Promise.all([
    listPendingSubjectiveReviews(client, { onlyCompleted: false, limit: 100 }),
    listPendingSubjectiveReviews(client, { onlyCompleted: true, limit: 30 }),
  ]);

  return { pending, completed, role };
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  return `${day}일 전`;
}

export default function AdminSubjectiveReviews({
  loaderData,
}: Route.ComponentProps) {
  const { pending, completed, role } = loaderData;
  // 미처리 우선 — 펼친 행 1개. 기본으로 첫 미처리 항목을 펼침.
  const [openId, setOpenId] = useState<string | null>(
    pending[0]?.attemptId ?? null,
  );

  return (
    <AdminShell
      cluster="comms"
      role={role}
      title="주관식 첨삭 큐"
      desc={
        <>
          학생이 첨삭을 요청한 답안 {pending.length}건 · 최근 완료{" "}
          {completed.length}건. 미처리 우선 정렬 — 행을 펼쳐 점수·코멘트 입력 후
          제출하세요.
        </>
      }
      headerRight={
        pending.length > 0 ? (
          <Chip tone="coral">
            <AlertTriangleIcon className="size-3" /> 미처리 {pending.length}
          </Chip>
        ) : (
          <Chip tone="emerald">
            <CheckCircle2Icon className="size-3" /> 대기 0
          </Chip>
        )
      }
    >
      <div className="flex flex-col gap-2.5">
        {/* ── 미처리 큐 ── */}
        {pending.length === 0 ? (
          <div className="border-border bg-card flex flex-col items-center gap-2 rounded-xl border p-12 text-center shadow-sm">
            <InboxIcon className="text-muted-foreground/60 size-8" />
            <p className="text-sm font-semibold">대기 중인 첨삭 요청이 없습니다</p>
            <p className="text-muted-foreground text-xs">
              학생이 답안 첨삭을 요청하면 이곳에 모입니다.
            </p>
          </div>
        ) : (
          pending.map((it) => (
            <ReviewRow
              key={it.attemptId}
              item={it}
              tone="pending"
              open={openId === it.attemptId}
              onToggle={() =>
                setOpenId((cur) =>
                  cur === it.attemptId ? null : it.attemptId,
                )
              }
            />
          ))
        )}

        {/* ── 최근 완료 ── */}
        {completed.length > 0 ? (
          <>
            <p className="text-muted-foreground mt-4 mb-0.5 font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
              최근 완료 · {completed.length}
            </p>
            {completed.map((it) => (
              <ReviewRow
                key={it.attemptId}
                item={it}
                tone="done"
                open={openId === it.attemptId}
                onToggle={() =>
                  setOpenId((cur) =>
                    cur === it.attemptId ? null : it.attemptId,
                  )
                }
              />
            ))}
          </>
        ) : null}
      </div>
    </AdminShell>
  );
}

function ReviewRow({
  item,
  tone,
  open,
  onToggle,
}: {
  item: PendingReviewItem;
  tone: "pending" | "done";
  open: boolean;
  onToggle: () => void;
}) {
  const initial = (item.userName || "?").trim().charAt(0) || "?";
  return (
    <div
      className={cn(
        "bg-card overflow-hidden rounded-xl border shadow-sm transition-colors",
        open ? "border-primary/40" : "border-border",
      )}
    >
      {/* 행 헤더 — 클릭 시 펼침 */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cn(
          "grid w-full grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3.5 px-4 py-3.5 text-left transition-colors md:px-5",
          open ? "bg-primary/[0.04]" : "hover:bg-muted/40",
        )}
      >
        <span
          className={cn(
            "inline-flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-bold",
            tone === "done"
              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
              : "bg-primary text-primary-foreground",
          )}
        >
          {initial}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-foreground text-sm font-bold">
              {item.userName || "(이름 없음)"}
            </span>
            {item.lawCode ? <Chip tone="neutral">{item.lawCode}</Chip> : null}
            {item.problemYear ? (
              <span className="text-muted-foreground text-xs tabular-nums">
                · {item.problemYear}년
                {item.problemNumber ? ` ${item.problemNumber}번` : ""}
              </span>
            ) : null}
          </div>
          <p className="text-muted-foreground mt-0.5 line-clamp-1 text-xs">
            {item.problemBodySnippet}
          </p>
        </div>
        {tone === "done" ? (
          <Chip tone="emerald">
            <CheckCircle2Icon className="size-3" /> 완료
          </Chip>
        ) : (
          <Chip tone="coral">
            <ClockIcon className="size-3" /> {formatRelative(item.requestedAt)}
          </Chip>
        )}
        <ChevronDownIcon
          className={cn(
            "text-muted-foreground size-4 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {/* 펼침 본문 */}
      {open ? (
        <div className="border-border/60 border-t p-4 md:p-5">
          <ReviewDetail item={item} />
        </div>
      ) : null}
    </div>
  );
}

function ReviewDetail({ item }: { item: PendingReviewItem }) {
  const fetcher = useFetcher<{
    ok?: true;
    attempt?: SubjectiveAttempt;
    error?: string;
  }>();
  const [score, setScore] = useState<string>(
    item.selfScore !== null ? String(item.selfScore) : "",
  );
  const [comment, setComment] = useState<string>("");
  // 항목이 바뀌면 폼 초기화.
  useEffect(() => {
    setScore(item.selfScore !== null ? String(item.selfScore) : "");
    setComment("");
  }, [item.attemptId]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const fd = new FormData();
    fd.set("intent", "complete");
    fd.set("attemptId", item.attemptId);
    if (score.trim()) fd.set("score", score.trim());
    if (comment.trim()) fd.set("commentMd", comment.trim());
    fetcher.submit(fd, {
      method: "post",
      action: "/api/study/subjective-review",
    });
  };
  const isSaving = fetcher.state !== "idle";
  const completedAttempt =
    fetcher.data && "attempt" in fetcher.data ? fetcher.data.attempt : null;
  const error =
    fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;

  return (
    <div className="space-y-4">
      {/* 메타 줄 */}
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span>
          요청{" "}
          <span className="text-foreground font-medium">
            {formatRelative(item.requestedAt)}
          </span>
        </span>
        <span>
          제출 {item.submittedAt ? item.submittedAt.slice(0, 10) : "—"}
        </span>
        {item.selfScore !== null ? (
          <span>
            자기채점{" "}
            <span className="text-foreground font-medium tabular-nums">
              {item.selfScore}점
            </span>
          </span>
        ) : null}
        <Link
          to={`/admin/problems/${item.problemId}`}
          className="text-link ml-auto inline-flex items-center gap-1 font-semibold hover:underline"
        >
          <ExternalLinkIcon className="size-3" /> 원본 문제 열기
        </Link>
      </div>

      {/* 학생 답안 */}
      <div>
        <p className="text-muted-foreground mb-1.5 font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
          학생 답안
        </p>
        <div className="bg-muted/40 border-border max-h-[280px] overflow-y-auto rounded-lg border p-4">
          <p className="font-serif text-sm leading-relaxed whitespace-pre-line">
            {item.answerMd || "(빈 답안)"}
          </p>
        </div>
      </div>

      {/* 점수 + 코멘트 + 제출 */}
      <form
        onSubmit={onSubmit}
        className="grid items-end gap-3 md:grid-cols-[140px_minmax(0,1fr)_auto]"
      >
        <Field label="강사 점수 (0~100)" htmlFor="review-score-input">
          <input
            id="review-score-input"
            type="number"
            min={0}
            max={100}
            value={score}
            onChange={(e) => setScore(e.target.value)}
            placeholder="예: 78"
            className="border-input bg-background focus:border-primary h-9 w-full rounded-md border px-3 text-[13px] tabular-nums outline-none"
            data-testid="review-score"
          />
        </Field>
        <Field label="첨삭 코멘트" htmlFor="review-comment-input">
          <Textarea
            id="review-comment-input"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            placeholder="잘된 점 / 보완할 점 / 빠진 논점을 자유롭게 작성하세요."
            className="text-sm"
            data-testid="review-comment"
          />
        </Field>
        <Button
          type="submit"
          disabled={isSaving}
          data-testid="review-submit"
          className="rounded-full"
        >
          <CheckCircle2Icon className="size-3.5" /> 첨삭 저장
        </Button>
      </form>
      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
      {completedAttempt ? (
        <p className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
          <CheckCircle2Icon className="size-3.5" /> 저장 완료 — 학생에게
          코멘트가 표시됩니다.
        </p>
      ) : null}
    </div>
  );
}
