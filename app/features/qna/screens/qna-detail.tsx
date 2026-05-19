import {
  CheckCircle2Icon,
  CheckIcon,
  ExternalLinkIcon,
  UserIcon,
} from "lucide-react";
import { useState } from "react";
import { Link, data, useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Textarea } from "~/core/components/ui/textarea";
import { cn } from "~/core/lib/utils";
import { Chip } from "~/features/community/components/community-ui";
import { CommunityShell } from "~/features/community/components/community-shell";
import makeServerClient from "~/core/lib/supa-client.server";

import {
  QNA_QUALITY_GRADES,
  QNA_QUALITY_LABEL,
  QNA_STATUS_LABEL,
  QNA_TARGET_LABEL,
  type QnaQualityGrade,
  type QnaTargetType,
} from "../labels";
import { getThreadDetail } from "../queries.server";
import { resolveTargetDisplay } from "../lib/target-display.server";

import type { Route } from "./+types/qna-detail";

// 대상 칩 색 — 조문(primary) / 판례(violet) / 문제(amber).
const TARGET_TONE: Record<QnaTargetType, "primary" | "violet" | "amber"> = {
  article: "primary",
  case: "violet",
  problem: "amber",
};

export const meta: Route.MetaFunction = ({ data: loaderData }) => {
  if (!loaderData) return [{ title: "Q&A | Lidam Patent Attorney Academy" }];
  return [{ title: `${loaderData.thread.title} | Q&A | Lidam Patent Attorney Academy` }];
};

export async function loader({ params, request }: Route.LoaderArgs) {
  if (!params.threadId) {
    throw data("Missing thread id", { status: 404 });
  }
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    throw data("Unauthorized", { status: 401 });
  }

  const thread = await getThreadDetail(client, params.threadId);
  if (!thread) {
    throw data("Not found", { status: 404 });
  }

  const { data: profile } = await client
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .maybeSingle();
  const role = profile?.role ?? "student";
  const isStaff =
    role === "instructor" || role === "manager" || role === "admin";

  const target = await resolveTargetDisplay(
    client,
    thread.targetType,
    thread.targetId,
  );

  return {
    thread,
    currentUserId: user.id,
    isStaff,
    target,
  };
}

export default function QnaDetail({ loaderData }: Route.ComponentProps) {
  const { thread, currentUserId, isStaff, target } = loaderData;
  const isAsker = thread.askerId === currentUserId;
  const canAnswer =
    thread.status === "open" && isStaff && thread.answererId === null;
  const isWaiting = thread.status === "open";

  return (
    <CommunityShell
      category="qna"
      title="Q&A 상세"
      backLink={{ to: "/qna", label: "Q&A 목록" }}
      width="narrow"
    >
      {/* 질문 카드 */}
      <article className="border-border bg-card mb-3.5 rounded-2xl border p-5 shadow-sm md:p-6">
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <Chip tone={TARGET_TONE[thread.targetType]}>
            {QNA_TARGET_LABEL[thread.targetType]}
          </Chip>
          <Chip tone={isWaiting ? "coral" : "emerald"}>
            {QNA_STATUS_LABEL[thread.status]}
          </Chip>
          {thread.qualityGrade ? (
            <Chip tone="amber">
              ★ 질문 수준 {QNA_QUALITY_LABEL[thread.qualityGrade]}
            </Chip>
          ) : null}
          {target?.href ? (
            <Link
              to={target.href}
              viewTransition
              className="text-primary ml-auto inline-flex items-center gap-1 text-[11px] font-semibold hover:underline"
            >
              {target.label} <ExternalLinkIcon className="size-3" />
            </Link>
          ) : target?.label ? (
            <span className="text-muted-foreground ml-auto text-[11px]">
              {target.label}
            </span>
          ) : null}
        </div>
        <h2 className="text-[22px] leading-snug font-extrabold tracking-tight">
          {thread.title}
        </h2>
        <div className="mt-2.5 flex items-center gap-2">
          <span className="bg-primary text-primary-foreground inline-flex size-6 items-center justify-center rounded-full text-[11px] font-bold">
            {(thread.askerName ?? "?").slice(0, 1)}
          </span>
          <span className="text-[13px] font-bold">
            {thread.askerName ?? "알 수 없음"}
          </span>
          <span className="text-muted-foreground text-[11px] tabular-nums">
            {new Date(thread.createdAt).toLocaleString("ko-KR")}
          </span>
        </div>
        <p className="text-foreground/85 mt-3.5 text-[15px] leading-[1.85] whitespace-pre-line">
          {thread.questionMd}
        </p>
      </article>

      {/* 답변 카드 — 에메랄드 좌측 보더 */}
      {thread.answerMd ? (
        <article className="bg-card mb-3.5 rounded-2xl rounded-l-md border border-l-4 border-emerald-500 p-5 shadow-sm md:p-6">
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <Chip tone="emerald">
              <CheckIcon className="size-2.5" /> 답변
            </Chip>
            <Chip tone="primary">강사</Chip>
          </div>
          <div className="mb-3.5 flex items-center gap-2">
            <span className="inline-flex size-6 items-center justify-center rounded-full bg-emerald-500 text-white">
              <UserIcon className="size-3" />
            </span>
            <span className="text-[13px] font-bold">
              {thread.answererName ?? "강사"}
            </span>
            {thread.answeredAt ? (
              <span className="text-muted-foreground text-[11px] tabular-nums">
                {new Date(thread.answeredAt).toLocaleString("ko-KR")}
              </span>
            ) : null}
          </div>
          <p className="text-foreground/85 text-[15px] leading-[1.85] whitespace-pre-line">
            {thread.answerMd}
          </p>
        </article>
      ) : null}

      {canAnswer ? (
        <AnswerForm threadId={thread.threadId} />
      ) : isStaff && thread.status === "open" ? (
        <div className="border-border bg-muted/40 text-muted-foreground rounded-2xl border p-4 text-sm">
          이미 다른 강사가 답변 중인 스레드입니다.
        </div>
      ) : null}

      {isAsker && thread.status === "answered" ? (
        <CloseButton threadId={thread.threadId} />
      ) : null}

      {thread.status === "closed" ? (
        <div className="flex items-center gap-2 rounded-2xl border border-transparent bg-emerald-500/[0.1] p-4 text-emerald-700 dark:text-emerald-300">
          <CheckCircle2Icon className="size-4" />
          <span className="text-[13px] font-bold">스레드가 종료됐습니다</span>
        </div>
      ) : null}
    </CommunityShell>
  );
}

function AnswerForm({ threadId }: { threadId: string }) {
  const fetcher = useFetcher();
  const [grade, setGrade] = useState<QnaQualityGrade>("mid");
  const [draft, setDraft] = useState("");
  const isSubmitting = fetcher.state !== "idle";

  return (
    <div className="border-border bg-card rounded-2xl border p-5 shadow-sm md:p-6">
      <p className="text-sm font-bold tracking-tight">답변 등록</p>
      <p className="text-muted-foreground mt-1 text-xs">
        답변자가 되면 같은 질문에 다른 강사는 답변할 수 없습니다.
      </p>
      <fetcher.Form method="post" action="/api/qna/thread" className="mt-4">
        <input type="hidden" name="intent" value="answer" />
        <input type="hidden" name="threadId" value={threadId} />
        <input type="hidden" name="qualityGrade" value={grade} />
        <Textarea
          name="answerMd"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="답변을 작성하세요"
          rows={6}
          className="text-sm leading-relaxed"
          required
        />

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground mr-1 text-xs">
            질문 수준 평가
          </span>
          {QNA_QUALITY_GRADES.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGrade(g)}
              className={cn(
                "h-[22px] rounded-full px-2.5 text-[11px] font-semibold transition-colors",
                grade === g
                  ? "bg-amber-500 text-white"
                  : "bg-muted text-foreground/80 hover:bg-muted/70",
              )}
            >
              {QNA_QUALITY_LABEL[g]}
            </button>
          ))}
        </div>

        <div className="mt-4 flex justify-end">
          <Button
            type="submit"
            size="sm"
            className="rounded-full"
            disabled={isSubmitting || !draft.trim()}
          >
            답변 등록
          </Button>
        </div>
      </fetcher.Form>
    </div>
  );
}

function CloseButton({ threadId }: { threadId: string }) {
  const fetcher = useFetcher();
  const isSubmitting = fetcher.state !== "idle";
  return (
    <fetcher.Form
      method="post"
      action="/api/qna/thread"
      className="border-border bg-card flex flex-wrap items-center gap-3 rounded-2xl border p-4 shadow-sm"
    >
      <input type="hidden" name="intent" value="close" />
      <input type="hidden" name="threadId" value={threadId} />
      <CheckCircle2Icon className="size-4 text-emerald-600 dark:text-emerald-400" />
      <p className="text-muted-foreground min-w-[12rem] flex-1 text-[13px] leading-relaxed">
        충분히 답변되었나요? 종료하면 다른 수험생에게 닫힌 스레드로 표시됩니다.
      </p>
      <Button
        type="submit"
        variant="outline"
        size="sm"
        className="rounded-full"
        disabled={isSubmitting}
      >
        스레드 종료
      </Button>
    </fetcher.Form>
  );
}
