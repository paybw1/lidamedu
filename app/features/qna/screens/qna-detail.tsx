import {
  CheckCircle2Icon,
  CheckIcon,
  CornerUpRightIcon,
  ExternalLinkIcon,
  PencilIcon,
  SparklesIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
  Trash2Icon,
  UserIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  Link,
  data,
  redirect,
  useFetcher,
  useNavigate,
  useRevalidator,
} from "react-router";

import { Button } from "~/core/components/ui/button";
import { QnaImageTextarea } from "~/features/qna/components/qna-image-textarea";
import { cn } from "~/core/lib/utils";
import { Chip } from "~/features/community/components/community-ui";
import { CommunityShell } from "~/features/community/components/community-shell";
import makeServerClient from "~/core/lib/supa-client.server";

import {
  type CitationHrefMap,
  citationKey,
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
import {
  getNeighborThreads,
  getThreadDetail,
  listThreadMessages,
  parseQnaNeighborCtx,
} from "../queries.server";
import { resolveCitationHrefs } from "../lib/citation-links.server";
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
  qna: "강사 Q&A",
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
    // 삭제 직후 재검증 등 — 빈 404 대신 목록으로 복귀.
    throw redirect("/qna");
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
    ? await resolveTargetDisplay(
        client,
        thread.targetType,
        thread.targetId,
        thread.nodeId,
      )
    : null;

  // 타임라인 메시지(AI 즉답·후속 질문 등). 강사 정식답변은 thread.answerMd 로 별도 표시.
  const messages = await listThreadMessages(client, params.threadId);
  // AI 출처 → 뷰어 링크(조문/판례/문제). textbook·practice 는 링크 없음.
  const citationHrefs = await resolveCitationHrefs(client, messages);

  // prev/next — 진입한 목록(?from=node:.../artnode:.../target:...)과 동일한 필터·정렬
  // 기준 이웃. 컨텍스트 없으면 /qna 전체 목록 기준. 아카이브는 같은 시각(09:00) 다수라
  // (created_at, thread_id) 복합 타이브레이크.
  const fromRaw = new URL(request.url).searchParams.get("from");
  const ctx = parseQnaNeighborCtx(fromRaw);
  const { prev, next } = await getNeighborThreads(client, ctx, {
    threadId: thread.threadId,
    createdAt: thread.createdAt,
  });

  return {
    thread,
    messages,
    citationHrefs,
    currentUserId: user.id,
    isStaff,
    target,
    // 목록이 최신순이므로 '이전(위)' = 더 최신, '다음(아래)' = 더 과거.
    prevThread: prev,
    nextThread: next,
    fromCtx: ctx ? fromRaw : null,
  };
}

export default function QnaDetail({ loaderData }: Route.ComponentProps) {
  const {
    thread,
    messages,
    citationHrefs,
    currentUserId,
    isStaff,
    target,
    prevThread,
    nextThread,
    fromCtx,
  } = loaderData;
  // prev/next·삭제 이동 시 목록 컨텍스트 유지.
  const fromQuery = fromCtx ? `?from=${encodeURIComponent(fromCtx)}` : "";
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
  // 강사·관리자 — 질문·답변 본문 인라인 수정 모드.
  const [editing, setEditing] = useState(false);

  return (
    <CommunityShell
      category="qna"
      title="Q&A 상세"
      backLink={{ to: "/qna", label: "Q&A 목록" }}
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
          {/* 질문 수준 — 강사·관리자에게만 노출 (원장 지시 2026-07-07) */}
          {isStaff && thread.qualityGrade ? (
            <Chip tone="amber">
              ★ 질문 수준 {QNA_QUALITY_LABEL[thread.qualityGrade]}
            </Chip>
          ) : null}
          {isStaff ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setEditing((v) => !v)}
                className="text-muted-foreground hover:text-foreground h-6 gap-1 px-2 text-[11px]"
                title="질문·답변 수정 (강사·관리자)"
              >
                <PencilIcon className="size-3" /> {editing ? "수정 취소" : "수정"}
              </Button>
              <DeleteThreadButton
                threadId={thread.threadId}
                afterHref={
                  nextThread
                    ? `/qna/${nextThread.threadId}${fromQuery}`
                    : prevThread
                      ? `/qna/${prevThread.threadId}${fromQuery}`
                      : "/qna"
                }
              />
            </>
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
          <span className="text-muted-foreground mr-2 align-middle text-[13px] font-bold tabular-nums">
            Q-{thread.displayNo}
          </span>
          {thread.title}
        </h2>
        <div className="mt-2.5 flex items-center gap-2">
          <span className="bg-primary text-primary-foreground inline-flex size-6 items-center justify-center rounded-full text-[11px] font-bold">
            {(thread.askerName ?? "?").slice(0, 1)}
          </span>
          {/* 강사·관리자 — 질문자 클릭 시 프로필(질문 이력·수준·쪽지) 화면으로 */}
          {isStaff && thread.askerId ? (
            <Link
              to={`/qna/asker/${thread.askerId}`}
              viewTransition
              className="text-link text-[13px] font-bold hover:underline"
              title="질문자 정보 보기 (강사·관리자)"
            >
              {thread.askerName ?? "미상"}
            </Link>
          ) : (
            <span className="text-[13px] font-bold">
              {thread.askerName ?? "미상"}
            </span>
          )}
          <span className="text-muted-foreground text-[11px] tabular-nums">
            {new Date(thread.createdAt).toLocaleString("ko-KR")}
          </span>
        </div>
        {editing ? (
          <EditThreadForm thread={thread} onDone={() => setEditing(false)} />
        ) : (
          <MarkdownView
            text={thread.questionMd}
            trusted={false}
            breaks
            literalNumbering
            className="text-foreground/85 mt-3.5 text-[15px] leading-[1.85]"
          />
        )}
      </article>

      {/* 타임라인 — 시간 순서: 질문 → (답변 전 메시지) → 정식 답변 → 추가질문·재답변.
          아카이브 스레드는 정식 답변 뒤에 후속 문답이 이어지므로 answeredAt 기준으로
          메시지를 답변 앞/뒤에 배치한다. */}
      {(thread.answerMd && thread.answeredAt
        ? messages.filter(
            (m) => Date.parse(m.createdAt) < Date.parse(thread.answeredAt!),
          )
        : messages
      ).map((m) =>
        m.role === "ai" ? (
          <AiAnswerCard
            key={m.messageId}
            message={m}
            isStaff={isStaff}
            isAsker={isAsker}
            citationHrefs={citationHrefs}
          />
        ) : (
          <FollowUpCard
            key={m.messageId}
            message={m}
            threadId={thread.threadId}
            isStaff={isStaff}
          />
        ),
      )}

      {/* 답변 카드 — 에메랄드 좌측 보더 (수정 모드에서는 편집 폼이 답변 필드를 포함) */}
      {thread.answerMd && !editing ? (
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
            breaks
            literalNumbering
            className="text-foreground/85 text-[15px] leading-[1.85]"
          />
        </article>
      ) : null}

      {/* 정식 답변 이후의 후속 문답(추가 질문·재답변) — 시간 순 */}
      {thread.answerMd && thread.answeredAt
        ? messages
            .filter(
              (m) => Date.parse(m.createdAt) >= Date.parse(thread.answeredAt!),
            )
            .map((m) =>
              m.role === "ai" ? (
                <AiAnswerCard
                  key={m.messageId}
                  message={m}
                  isStaff={isStaff}
                  isAsker={isAsker}
                  citationHrefs={citationHrefs}
                />
              ) : (
                <FollowUpCard
                  key={m.messageId}
                  message={m}
                  threadId={thread.threadId}
                  isStaff={isStaff}
                />
              ),
            )
        : null}

      {canAnswer ? (
        <AnswerForm threadId={thread.threadId} />
      ) : isStaff && thread.status === "open" ? (
        <div className="border-border bg-muted/40 text-muted-foreground rounded-2xl border p-4 text-sm">
          이미 다른 강사가 답변 중인 질문입니다.
        </div>
      ) : null}

      {/* 강사 추가 답변 — 정식 답변 이후 보충 설명·정정(타임라인에 이어붙음, 종료 후에도 가능). */}
      {isStaff && thread.answerMd && !editing ? (
        <InstructorFollowUpForm
          threadId={thread.threadId}
          initialGrade={thread.qualityGrade}
        />
      ) : null}

      {/* 질문자 후속 질문(멀티턴) — 종료 전까지. AI 가 대화 맥락을 이어받아 재응답. */}
      {isAsker && thread.status !== "closed" ? (
        <FollowUpForm threadId={thread.threadId} />
      ) : null}

      {isAsker && thread.status === "answered" ? (
        <CloseButton threadId={thread.threadId} />
      ) : null}

      {thread.status === "closed" ? (
        <div className="flex items-center gap-2 rounded-2xl border border-transparent bg-emerald-500/[0.1] p-4 text-emerald-700 dark:text-emerald-300">
          <CheckCircle2Icon className="size-4" />
          <span className="text-[13px] font-bold">질문이 종료되었습니다</span>
        </div>
      ) : null}

      {/* prev/next — 목록(최신순) 기준 이웃 질문 이동 */}
      {prevThread || nextThread ? (
        <nav className="mt-4 grid gap-2 sm:grid-cols-2">
          {prevThread ? (
            <Link
              to={`/qna/${prevThread.threadId}${fromQuery}`}
              viewTransition
              className="border-border bg-card hover:bg-accent/50 rounded-xl border p-3 transition-colors"
            >
              <span className="text-muted-foreground text-[10px] font-bold tracking-wide uppercase">
                ← 이전 질문
              </span>
              <span className="mt-0.5 line-clamp-1 block text-[13px] font-medium">
                {prevThread.title}
              </span>
            </Link>
          ) : (
            <span />
          )}
          {nextThread ? (
            <Link
              to={`/qna/${nextThread.threadId}${fromQuery}`}
              viewTransition
              className="border-border bg-card hover:bg-accent/50 rounded-xl border p-3 text-right transition-colors"
            >
              <span className="text-muted-foreground text-[10px] font-bold tracking-wide uppercase">
                다음 질문 →
              </span>
              <span className="mt-0.5 line-clamp-1 block text-[13px] font-medium">
                {nextThread.title}
              </span>
            </Link>
          ) : null}
        </nav>
      ) : null}
    </CommunityShell>
  );
}

// 질문·답변 본문 수정 폼 — 강사·관리자 전용(intent=edit). 답변 없는 스레드는 질문만.
function EditThreadForm({
  thread,
  onDone,
}: {
  thread: Route.ComponentProps["loaderData"]["thread"];
  onDone: () => void;
}) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const revalidator = useRevalidator();
  const doneRef = useRef(false);
  // 이미지 붙여넣기(QnaImageTextarea)는 제어 컴포넌트라 본문을 state 로 관리.
  const [questionDraft, setQuestionDraft] = useState(thread.questionMd);
  const [answerDraft, setAnswerDraft] = useState(thread.answerMd ?? "");
  useEffect(() => {
    if (fetcher.data?.ok && !doneRef.current) {
      doneRef.current = true;
      revalidator.revalidate();
      onDone();
    }
  }, [fetcher.data, revalidator, onDone]);
  return (
    <fetcher.Form method="post" action="/api/qna/thread" className="mt-3.5 space-y-3">
      <input type="hidden" name="intent" value="edit" />
      <input type="hidden" name="threadId" value={thread.threadId} />
      <div>
        <label className="text-muted-foreground mb-1 block text-[11px] font-bold">제목</label>
        <input
          name="title"
          defaultValue={thread.title}
          required
          maxLength={200}
          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="text-muted-foreground mb-1 block text-[11px] font-bold">질문</label>
        <QnaImageTextarea
          name="questionMd"
          value={questionDraft}
          onChange={setQuestionDraft}
          required
          rows={8}
        />
      </div>
      {thread.answerMd ? (
        <div>
          <label className="text-muted-foreground mb-1 block text-[11px] font-bold">답변</label>
          <QnaImageTextarea
            name="answerMd"
            value={answerDraft}
            onChange={setAnswerDraft}
            required
            rows={10}
          />
        </div>
      ) : null}
      {fetcher.data?.ok === false ? (
        <p className="text-xs text-rose-600">저장 실패: {fetcher.data.error}</p>
      ) : null}
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={fetcher.state !== "idle"}>
          {fetcher.state !== "idle" ? "저장 중…" : "저장"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          취소
        </Button>
      </div>
    </fetcher.Form>
  );
}

// 스레드 삭제(soft delete) — 강사·관리자 전용. 성공 시 다음 질문으로(없으면 이전→목록).
function DeleteThreadButton({
  threadId,
  afterHref = "/qna",
}: {
  threadId: string;
  afterHref?: string;
}) {
  const fetcher = useFetcher<{ ok?: boolean }>();
  const navigate = useNavigate();
  useEffect(() => {
    if (fetcher.data?.ok) navigate(afterHref, { replace: true });
  }, [fetcher.data, navigate, afterHref]);
  return (
    <fetcher.Form
      method="post"
      action="/api/qna/thread"
      onSubmit={(e) => {
        if (!confirm("이 질문과 답변을 삭제할까요?")) e.preventDefault();
      }}
    >
      <input type="hidden" name="intent" value="delete" />
      <input type="hidden" name="threadId" value={threadId} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={fetcher.state !== "idle"}
        className="h-6 gap-1 px-2 text-[11px] text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/20"
        title="질문·답변 삭제 (강사·관리자)"
      >
        <Trash2Icon className="size-3" /> 삭제
      </Button>
    </fetcher.Form>
  );
}

// 질문자 후속 질문 / 강사 메시지 카드 — 타임라인 중간 턴.
function FollowUpCard({
  message,
  threadId,
  isStaff,
}: {
  message: QnaMessage;
  threadId: string;
  isStaff: boolean;
}) {
  const isStudent = message.role === "student";
  const [editing, setEditing] = useState(false);
  return (
    <article
      className={cn(
        "bg-card mb-3.5 rounded-2xl border p-4 shadow-sm md:p-5",
        isStudent ? "border-border" : "border-emerald-300/60",
      )}
    >
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <Chip tone={isStudent ? "primary" : "emerald"}>
          <CornerUpRightIcon className="size-2.5" />
          {isStudent ? "추가 질문" : "강사"}
        </Chip>
        <span className="text-[13px] font-bold">
          {message.authorName ?? (isStudent ? "질문자" : "강사")}
        </span>
        <span className="text-muted-foreground ml-auto text-[11px] tabular-nums">
          {new Date(message.createdAt).toLocaleString("ko-KR")}
        </span>
        {isStaff ? (
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]"
            title="본문 수정 (강사·관리자)"
          >
            <PencilIcon className="size-2.5" /> {editing ? "취소" : "수정"}
          </button>
        ) : null}
      </div>
      {editing ? (
        <EditMessageForm
          threadId={threadId}
          messageId={message.messageId}
          initial={message.bodyMd}
          onDone={() => setEditing(false)}
        />
      ) : (
        <MarkdownView
          text={message.bodyMd}
          trusted={false}
          breaks
          literalNumbering
          className="text-foreground/85 text-[14px] leading-[1.8]"
        />
      )}
    </article>
  );
}

// 타임라인 메시지(추가 질문·강사 추가 답변) 본문 수정 — 강사·관리자 전용(intent=edit_message).
function EditMessageForm({
  threadId,
  messageId,
  initial,
  onDone,
}: {
  threadId: string;
  messageId: string;
  initial: string;
  onDone: () => void;
}) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const revalidator = useRevalidator();
  const doneRef = useRef(false);
  const [draft, setDraft] = useState(initial);
  useEffect(() => {
    if (fetcher.data?.ok && !doneRef.current) {
      doneRef.current = true;
      revalidator.revalidate();
      onDone();
    }
  }, [fetcher.data, revalidator, onDone]);
  return (
    <fetcher.Form method="post" action="/api/qna/thread" className="space-y-2">
      <input type="hidden" name="intent" value="edit_message" />
      <input type="hidden" name="threadId" value={threadId} />
      <input type="hidden" name="messageId" value={messageId} />
      <QnaImageTextarea
        name="bodyMd"
        value={draft}
        onChange={setDraft}
        rows={6}
        required
      />
      {fetcher.data?.ok === false ? (
        <p className="text-xs text-rose-600">저장 실패: {fetcher.data.error}</p>
      ) : null}
      <div className="flex items-center gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={fetcher.state !== "idle" || !draft.trim()}
        >
          {fetcher.state !== "idle" ? "저장 중…" : "저장"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          취소
        </Button>
      </div>
    </fetcher.Form>
  );
}

// AI 즉답 카드 — 강사 답변(에메랄드)과 구분되는 인디고 톤 + AI 배지 + 출처칩 + 강사 정오 평가.
function AiAnswerCard({
  message,
  isStaff,
  isAsker,
  citationHrefs,
}: {
  message: QnaMessage;
  isStaff: boolean;
  isAsker: boolean;
  citationHrefs: CitationHrefMap;
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
        <CitationList citations={message.citations} hrefs={citationHrefs} />
      ) : null}
      {message.verdict === "incorrect" && !isStaff ? (
        <p className="mt-3 rounded-lg bg-rose-500/[0.08] px-3 py-2 text-[12px] leading-relaxed text-rose-700 dark:text-rose-300">
          이 AI 답변은 강사가 <strong>부정확</strong>으로 평가했습니다. 아래 강사
          답변을 확인해 주세요.
        </p>
      ) : null}
      {isAsker ? <FeedbackButtons message={message} /> : null}
      {isStaff ? <VerdictControl message={message} /> : null}
    </article>
  );
}

// 질문자 전용 — AI 답변 도움됐어요 피드백(👍/👎 토글, 같은 값 다시 누르면 해제).
function FeedbackButtons({ message }: { message: QnaMessage }) {
  const fetcher = useFetcher();
  const isSubmitting = fetcher.state !== "idle";
  const current = message.feedback ?? 0;
  const options = [
    { value: 1, label: "도움됐어요", Icon: ThumbsUpIcon },
    { value: -1, label: "아쉬워요", Icon: ThumbsDownIcon },
  ] as const;
  return (
    <div className="border-border/60 mt-4 flex flex-wrap items-center gap-2 border-t pt-3">
      <span className="text-muted-foreground text-xs font-semibold">
        이 답변이 도움됐나요?
      </span>
      {options.map((o) => {
        const active = current === o.value;
        return (
          <fetcher.Form key={o.value} method="post" action="/api/qna/thread">
            <input type="hidden" name="intent" value="feedback" />
            <input type="hidden" name="messageId" value={message.messageId} />
            <input
              type="hidden"
              name="feedback"
              value={active ? 0 : o.value}
            />
            <button
              type="submit"
              disabled={isSubmitting}
              aria-pressed={active}
              className={cn(
                "inline-flex h-[26px] items-center gap-1 rounded-full px-3 text-[12px] font-semibold transition-colors disabled:opacity-50",
                active
                  ? o.value === 1
                    ? "bg-emerald-500 text-white"
                    : "bg-rose-500 text-white"
                  : "bg-muted text-foreground/80 hover:bg-muted/70",
              )}
            >
              <o.Icon className="size-3" /> {o.label}
            </button>
          </fetcher.Form>
        );
      })}
      <span className="text-muted-foreground text-[11px]">
        피드백은 답변 품질 개선에 사용됩니다.
      </span>
    </div>
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

function CitationList({
  citations,
  hrefs,
}: {
  citations: QnaCitation[];
  hrefs: CitationHrefMap;
}) {
  return (
    <div className="border-border/60 mt-4 border-t pt-3">
      <p className="text-muted-foreground mb-1.5 font-mono text-[10px] font-bold tracking-[0.1em] uppercase">
        출처
      </p>
      <ul className="flex flex-col gap-1">
        {citations.map((c) => {
          const href = hrefs[citationKey(c)];
          return (
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
              {href ? (
                <Link
                  to={href}
                  viewTransition
                  className="text-link inline-flex items-center gap-1 hover:underline"
                >
                  {c.headingPath || "원문 보기"}
                  <ExternalLinkIcon className="size-3 shrink-0" />
                </Link>
              ) : c.headingPath ? (
                <span>{c.headingPath}</span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// 강사 추가 답변 입력 — 정식 답변(answerMd)을 덮지 않고 타임라인에 instructor 메시지로
// 이어붙인다(보충 설명·정정). 질문 수준 재평가 동봉 가능. 질문자에게 새 답변 알림 발송.
function InstructorFollowUpForm({
  threadId,
  initialGrade,
}: {
  threadId: string;
  initialGrade: QnaQualityGrade | null;
}) {
  const fetcher = useFetcher<{ ok?: boolean }>();
  const [draft, setDraft] = useState("");
  const [grade, setGrade] = useState<QnaQualityGrade>(initialGrade ?? "mid");
  const isSubmitting = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) setDraft("");
  }, [fetcher.state, fetcher.data]);

  return (
    <div className="border-border bg-card mb-3.5 rounded-2xl border p-4 shadow-sm md:p-5">
      <p className="text-sm font-bold tracking-tight">추가 답변 (강사)</p>
      <p className="text-muted-foreground mt-1 text-xs">
        정식 답변을 수정하지 않고 보충 설명·정정을 이어붙입니다. 질문자에게 알림이
        발송됩니다.
      </p>
      <fetcher.Form method="post" action="/api/qna/thread" className="mt-3">
        <input type="hidden" name="intent" value="instructor_reply" />
        <input type="hidden" name="threadId" value={threadId} />
        <input type="hidden" name="qualityGrade" value={grade} />
        <QnaImageTextarea
          name="bodyMd"
          value={draft}
          onChange={setDraft}
          placeholder="보충 설명이나 정정 내용을 입력하세요."
          rows={4}
          maxLength={10000}
          required
        />
        {/* 질문 수준 재평가 — 정식 답변 폼과 동일 UI. 현재 평가가 기본 선택. */}
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
        <div className="mt-2.5 flex justify-end">
          <Button
            type="submit"
            size="sm"
            className="rounded-full"
            disabled={isSubmitting || !draft.trim()}
          >
            {isSubmitting ? "등록 중…" : "추가 답변 등록"}
          </Button>
        </div>
      </fetcher.Form>
    </div>
  );
}

// 질문자 후속 질문 입력 — 등록 시 AI 가 대화 이력을 이어받아 background 재응답.
function FollowUpForm({ threadId }: { threadId: string }) {
  const fetcher = useFetcher<{ ok?: boolean; aiPending?: boolean }>();
  const revalidator = useRevalidator();
  const [draft, setDraft] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSubmitting = fetcher.state !== "idle";
  const aiPending =
    fetcher.state === "idle" && fetcher.data?.ok && fetcher.data.aiPending;

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) {
      setDraft("");
      // AI 재응답은 background 생성 — 잠시 후 한 번 재조회해 자연 갱신.
      if (fetcher.data.aiPending && !timerRef.current) {
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          revalidator.revalidate();
        }, 8000);
      }
    }
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);

  return (
    <div className="border-border bg-card mb-3.5 rounded-2xl border p-4 shadow-sm md:p-5">
      <p className="text-sm font-bold tracking-tight">추가 질문</p>
      <p className="text-muted-foreground mt-1 text-xs">
        답변에 이어서 궁금한 점을 물어보세요. AI 가 대화 맥락을 이어받아
        답하고, 강사가 확인합니다.
      </p>
      <fetcher.Form method="post" action="/api/qna/thread" className="mt-3">
        <input type="hidden" name="intent" value="reply" />
        <input type="hidden" name="threadId" value={threadId} />
        <QnaImageTextarea
          name="bodyMd"
          value={draft}
          onChange={setDraft}
          placeholder="예: 그럼 출원공개 전에 침해가 있었던 경우는 어떻게 되나요?"
          rows={3}
          maxLength={4000}
          required
        />
        <div className="mt-2.5 flex items-center justify-between gap-2">
          {aiPending ? (
            <span className="text-muted-foreground inline-flex items-center gap-1 text-[11px]">
              <SparklesIcon className="size-3" /> AI 답변을 준비하고 있습니다 —
              잠시 후 표시됩니다.
            </span>
          ) : (
            <span />
          )}
          <Button
            type="submit"
            size="sm"
            className="rounded-full"
            disabled={isSubmitting || !draft.trim()}
          >
            {isSubmitting ? "등록 중…" : "추가 질문 등록"}
          </Button>
        </div>
      </fetcher.Form>
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
        <QnaImageTextarea
          name="answerMd"
          value={draft}
          onChange={setDraft}
          placeholder="답변을 작성하세요"
          rows={6}
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
        충분히 답변되었나요? 종료하면 다른 학생에게 종료된 질문으로 표시됩니다.
      </p>
      <Button
        type="submit"
        variant="outline"
        size="sm"
        className="rounded-full"
        disabled={isSubmitting}
      >
        질문 종료
      </Button>
    </fetcher.Form>
  );
}
