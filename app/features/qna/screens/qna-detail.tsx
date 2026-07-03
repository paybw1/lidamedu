import {
  CheckCircle2Icon,
  CheckIcon,
  ExternalLinkIcon,
  SparklesIcon,
  UserIcon,
  XIcon,
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
  type QnaCitation,
  type QnaMessage,
  type QnaQualityGrade,
  type QnaTargetType,
  type QnaVerdict,
  subjectLabel,
} from "../labels";
import { getThreadDetail, listThreadMessages } from "../queries.server";
import { resolveTargetDisplay } from "../lib/target-display.server";
import { MarkdownView } from "~/features/problems/components/markdown-view";

import type { Route } from "./+types/qna-detail";

// AI 출처칩 sourceType → 한글 라벨.
const CITATION_SOURCE_LABEL: Record<string, string> = {
  article: "법령",
  case: "판례",
  problem: "문제",
  textbook: "기본서",
  practice: "실무서",
};

// 대상 칩 색 — 조문(primary) / 판례(violet) / 문제(amber).
const TARGET_TONE: Record<
  QnaTargetType,
  "primary" | "violet" | "amber" | "emerald" | "neutral"
> = {
  article: "primary",
  node: "primary",
  case: "violet",
  problem: "amber",
  study_method: "emerald",
  general: "neutral",
};

export const meta: Route.MetaFunction = ({ data: loaderData }) => {
  if (!loaderData) return [{ title: "Q&A | 리담변리사학원" }];
  return [{ title: `${loaderData.thread.title} | Q&A | 리담변리사학원` }];
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

  // study_method 는 콘텐츠 앵커(targetId)가 없어 대상 표시 생략(과목 칩으로 분류 표시).
  const target = thread.targetId
    ? await resolveTargetDisplay(client, thread.targetType, thread.targetId)
    : null;

  // 타임라인 메시지(AI 즉답 등). 강사 정식답변은 thread.answerMd 로 별도 표시.
  const messages = await listThreadMessages(client, params.threadId);

  return {
    thread,
    messages,
    currentUserId: user.id,
    isStaff,
    target,
  };
}

export default function QnaDetail({ loaderData }: Route.ComponentProps) {
  const { thread, messages, currentUserId, isStaff, target } = loaderData;
  const isAsker = thread.askerId === currentUserId;
  // ai_answered/verified 도 강사 정식답변이 없는 상태 — AI 답변을 정확으로 확인한
  // 뒤에도 강사가 보완/정정 답변을 달 수 있다.
  const canAnswer =
    (thread.status === "open" ||
      thread.status === "ai_answered" ||
      thread.status === "verified") &&
    isStaff &&
    thread.answererId === null;
  const isWaiting = thread.status === "open";
  const aiMessages = messages.filter((m) => m.role === "ai");

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
          {thread.subject ? (
            <Chip tone="neutral">{subjectLabel(thread.subject)}</Chip>
          ) : null}
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
              className="text-link ml-auto inline-flex items-center gap-1 text-[11px] font-semibold hover:underline"
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
        <MarkdownView
          text={thread.questionMd}
          trusted={false}
          className="text-foreground/85 mt-3.5 text-[15px] leading-[1.85]"
        />
      </article>

      {/* AI 즉답 카드 — 질문 직후 자동 생성분. 강사 정식답변과 공존. */}
      {aiMessages.map((m) => (
        <AiAnswerCard key={m.messageId} message={m} isStaff={isStaff} />
      ))}

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
          <MarkdownView
            text={thread.answerMd}
            trusted={false}
            className="text-foreground/85 text-[15px] leading-[1.85]"
          />
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

// AI 즉답 카드 — 강사 답변(에메랄드)과 구분되는 인디고 톤 + AI 배지 + 출처칩 + 강사 정오 평가.
function AiAnswerCard({
  message,
  isStaff,
}: {
  message: QnaMessage;
  isStaff: boolean;
}) {
  return (
    <article className="bg-card mb-3.5 rounded-2xl rounded-l-md border border-l-4 border-indigo-500 p-5 shadow-sm md:p-6">
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <Chip tone="violet">
          <SparklesIcon className="size-2.5" /> AI 답변
        </Chip>
        {message.verdict === "correct" ? (
          <Chip tone="emerald">
            <CheckIcon className="size-2.5" /> 강사 확인 · 정확
          </Chip>
        ) : message.verdict === "incorrect" ? (
          <Chip tone="coral">
            <XIcon className="size-2.5" /> 강사 평가 · 부정확
          </Chip>
        ) : (
          <span className="text-muted-foreground text-[11px]">
            강사 확인 전 자동 생성 — 참고용
          </span>
        )}
        <span className="text-muted-foreground ml-auto text-[11px] tabular-nums">
          {new Date(message.createdAt).toLocaleString("ko-KR")}
        </span>
      </div>
      <MarkdownView
        text={message.bodyMd}
        trusted={false}
        className="text-foreground/85 text-[15px] leading-[1.85]"
      />
      {message.citations.length > 0 ? (
        <CitationList citations={message.citations} />
      ) : null}
      {message.verdict === "incorrect" && !isStaff ? (
        <p className="mt-3 rounded-lg bg-rose-500/[0.08] px-3 py-2 text-[12px] leading-relaxed text-rose-700 dark:text-rose-300">
          이 AI 답변은 강사가 <strong>부정확</strong> 으로 평가했습니다. 아래 강사
          답변을 확인하세요.
        </p>
      ) : null}
      {isStaff ? <VerdictControl message={message} /> : null}
    </article>
  );
}

// 강사 전용 — AI 답변 정오 평가(정확/부정확). 클릭 시 자동 재검증으로 배지·상태 갱신.
function VerdictControl({ message }: { message: QnaMessage }) {
  const fetcher = useFetcher();
  const isSubmitting = fetcher.state !== "idle";
  const options: { value: QnaVerdict; label: string; icon: typeof CheckIcon }[] =
    [
      { value: "correct", label: "정확", icon: CheckIcon },
      { value: "incorrect", label: "부정확", icon: XIcon },
    ];
  return (
    <div className="border-border/60 mt-4 flex flex-wrap items-center gap-2 border-t pt-3">
      <span className="text-muted-foreground text-xs font-semibold">
        AI 답변 평가
      </span>
      <fetcher.Form
        method="post"
        action="/api/qna/thread"
        className="flex flex-wrap items-center gap-1.5"
      >
        <input type="hidden" name="intent" value="verdict" />
        <input type="hidden" name="threadId" value={message.threadId} />
        <input type="hidden" name="messageId" value={message.messageId} />
        {options.map((o) => {
          const active = message.verdict === o.value;
          const Icon = o.icon;
          return (
            <button
              key={o.value}
              type="submit"
              name="verdict"
              value={o.value}
              disabled={isSubmitting}
              className={cn(
                "inline-flex h-[26px] items-center gap-1 rounded-full px-3 text-[12px] font-semibold transition-colors disabled:opacity-50",
                active
                  ? o.value === "correct"
                    ? "bg-emerald-500 text-white"
                    : "bg-rose-500 text-white"
                  : "bg-muted text-foreground/80 hover:bg-muted/70",
              )}
            >
              <Icon className="size-3" /> {o.label}
            </button>
          );
        })}
      </fetcher.Form>
      {message.verifiedByName && message.verdict ? (
        <span className="text-muted-foreground text-[11px]">
          {message.verifiedByName} 평가
          {message.verifiedAt
            ? ` · ${new Date(message.verifiedAt).toLocaleDateString("ko-KR")}`
            : ""}
        </span>
      ) : null}
    </div>
  );
}

function CitationList({ citations }: { citations: QnaCitation[] }) {
  return (
    <div className="border-border/60 mt-4 border-t pt-3">
      <p className="text-muted-foreground mb-1.5 font-mono text-[10px] font-bold tracking-[0.1em] uppercase">
        출처
      </p>
      <ul className="flex flex-col gap-1">
        {citations.map((c) => (
          <li
            key={`${c.label}-${c.sourceId}`}
            className="text-muted-foreground flex items-start gap-1.5 text-[12px] leading-relaxed"
          >
            <span className="text-foreground/70 font-bold tabular-nums">
              [{c.label}]
            </span>
            <Chip tone="neutral">
              {CITATION_SOURCE_LABEL[c.sourceType] ?? c.sourceType}
            </Chip>
            {c.headingPath ? <span>{c.headingPath}</span> : null}
          </li>
        ))}
      </ul>
    </div>
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
        충분히 답변되었나요? 종료하면 다른 학생에게 닫힌 스레드로 표시됩니다.
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
