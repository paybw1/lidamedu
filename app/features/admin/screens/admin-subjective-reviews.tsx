// 강사 주관식 첨삭 큐 + 검토 화면 — 한 화면에서 대기 큐 + 완료 이력 + 선택한 항목 채점.

import {
  CheckCircle2Icon,
  ClipboardCheckIcon,
  ClockIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Form, Link, data, useFetcher } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Separator } from "~/core/components/ui/separator";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  listPendingSubjectiveReviews,
  type PendingReviewItem,
  type SubjectiveAttempt,
} from "~/features/study/queries.server";

import type { Route } from "./+types/admin-subjective-reviews";

export const meta: Route.MetaFunction = () => [
  { title: "주관식 첨삭 큐 | Lidam Edu" },
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

  return { pending, completed };
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
  const { pending, completed } = loaderData;
  const [selected, setSelected] = useState<PendingReviewItem | null>(
    pending[0] ?? null,
  );

  useEffect(() => {
    if (!selected && pending.length > 0) setSelected(pending[0]);
  }, [selected, pending]);

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-5 py-6 md:px-10 md:py-8">
      <header className="mb-6 space-y-2">
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
          <ClipboardCheckIcon className="size-3.5" /> 운영자
        </p>
        <h1 className="text-2xl font-bold tracking-tight">주관식 첨삭 큐</h1>
        <p className="text-muted-foreground text-sm">
          학생이 첨삭을 요청한 답안 {pending.length}건 · 최근 완료 {completed.length}건
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <QueueList
            title="대기 중"
            items={pending}
            selectedId={selected?.attemptId ?? null}
            onSelect={setSelected}
            emptyMessage="대기 중인 요청이 없습니다."
            tone="pending"
          />
          <QueueList
            title="최근 완료"
            items={completed}
            selectedId={selected?.attemptId ?? null}
            onSelect={setSelected}
            emptyMessage="완료된 검토 이력이 없습니다."
            tone="done"
          />
        </aside>

        <main>
          {selected ? (
            <ReviewPanel item={selected} />
          ) : (
            <div className="bg-muted/40 rounded-md border border-dashed p-10 text-center">
              <p className="text-muted-foreground text-sm">
                좌측 큐에서 답안을 선택하세요.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function QueueList({
  title,
  items,
  selectedId,
  onSelect,
  emptyMessage,
  tone,
}: {
  title: string;
  items: PendingReviewItem[];
  selectedId: string | null;
  onSelect: (it: PendingReviewItem) => void;
  emptyMessage: string;
  tone: "pending" | "done";
}) {
  return (
    <Card>
      <CardHeader className="px-4 pb-2">
        <p className="text-sm font-semibold">
          {title}{" "}
          <span className="text-muted-foreground ml-1 tabular-nums">
            {items.length}
          </span>
        </p>
      </CardHeader>
      <Separator />
      <CardContent className="p-0">
        {items.length === 0 ? (
          <p className="text-muted-foreground p-4 text-xs">{emptyMessage}</p>
        ) : (
          <ul className="divide-y">
            {items.map((it) => (
              <li key={it.attemptId}>
                <button
                  type="button"
                  onClick={() => onSelect(it)}
                  className={cn(
                    "w-full px-4 py-2.5 text-left text-xs hover:bg-accent transition-colors",
                    selectedId === it.attemptId && "bg-accent",
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    {tone === "done" ? (
                      <CheckCircle2Icon className="size-3 text-emerald-600" />
                    ) : (
                      <ClockIcon className="text-muted-foreground size-3" />
                    )}
                    <span className="font-medium">
                      {it.userName || "(이름 없음)"}
                    </span>
                    {it.lawCode ? (
                      <Badge variant="outline" className="text-[10px]">
                        {it.lawCode}
                      </Badge>
                    ) : null}
                    <span className="text-muted-foreground ml-auto tabular-nums">
                      {formatRelative(it.requestedAt)}
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-1 line-clamp-1 tabular-nums">
                    {it.problemYear ? `${it.problemYear}년 ` : ""}
                    {it.problemNumber ? `${it.problemNumber}번 — ` : ""}
                    {it.problemBodySnippet}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ReviewPanel({ item }: { item: PendingReviewItem }) {
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
    fetcher.submit(fd, { method: "post", action: "/api/study/subjective-review" });
  };
  const isSaving = fetcher.state !== "idle";
  const completedAttempt =
    fetcher.data && "attempt" in fetcher.data ? fetcher.data.attempt : null;
  const error = fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;
  return (
    <Card>
      <CardHeader className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <Badge variant="default">주관식 첨삭</Badge>
          {item.lawCode ? <Badge variant="secondary">{item.lawCode}</Badge> : null}
          {item.problemYear ? (
            <Badge variant="outline" className="tabular-nums">
              {item.problemYear}년{item.problemNumber ? ` · ${item.problemNumber}번` : ""}
            </Badge>
          ) : null}
          <span className="text-muted-foreground ml-auto">
            요청 {formatRelative(item.requestedAt)}
            {" · "}
            제출 {item.submittedAt ? item.submittedAt.slice(0, 10) : "—"}
          </span>
        </div>
        <p className="text-sm">
          <span className="text-muted-foreground">학생:</span>{" "}
          <span className="font-semibold">
            {item.userName || "(이름 없음)"}
          </span>
          {item.selfScore !== null ? (
            <span className="text-muted-foreground ml-3">
              자기채점 {item.selfScore}점
            </span>
          ) : null}
        </p>
        <Link
          to={`/admin/problems/${item.problemId}`}
          className="text-primary text-xs hover:underline"
        >
          원본 문제 열기 →
        </Link>
      </CardHeader>
      <Separator />
      <CardContent className="space-y-4 pt-4">
        <section>
          <p className="text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase">
            학생 답안
          </p>
          <div className="bg-muted/30 rounded-md border p-3">
            <p className="font-serif text-sm leading-relaxed whitespace-pre-line">
              {item.answerMd || "(빈 답안)"}
            </p>
          </div>
        </section>

        <form onSubmit={onSubmit} className="space-y-3">
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            첨삭 코멘트
          </p>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={8}
            placeholder="잘된 점 / 보완할 점 / 빠진 논점을 자유롭게 작성하세요."
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            data-testid="review-comment"
          />
          <label className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground w-20 shrink-0">
              강사 점수 (0~100)
            </span>
            <input
              type="number"
              min={0}
              max={100}
              value={score}
              onChange={(e) => setScore(e.target.value)}
              placeholder="예: 78"
              className="border-input bg-background h-8 w-24 rounded-md border px-2 text-xs tabular-nums"
              data-testid="review-score"
            />
          </label>
          {error ? <p className="text-rose-600 text-xs">{error}</p> : null}
          {completedAttempt ? (
            <p className="text-emerald-600 text-xs">
              저장 완료 — 학생에게 코멘트가 표시됩니다.
            </p>
          ) : null}
          <div className="flex justify-end">
            <Button
              type="submit"
              size="sm"
              disabled={isSaving}
              data-testid="review-submit"
            >
              <CheckCircle2Icon className="size-3.5" /> 첨삭 저장
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
