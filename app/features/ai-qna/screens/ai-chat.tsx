// feat-9-004 AI Q&A 채팅 화면 — /ai
//
// URL 파라미터:
//   ?c=<conversationId>   활성 대화. 없으면 빈 상태 + 추천 질문.
//   ?anchor=type:id        뷰어에서 진입 시 새 대화의 앵커 (조문/판례/문제 ID).
//   ?q=<seed>              뷰어에서 초안 질문 자동 전송 (옵션).
//
// 동작:
//   - 좌측 사이드바: 본인 대화 목록(deleted_at null, updated_at desc).
//   - 우측: 활성 대화 메시지 + 출처 카드 + 입력창.
//   - 메시지 전송 = fetch POST /api/ai-qna/ask + SSE 스트림 처리. 클라 상태에 점진적 누적.
//   - 신규 대화는 응답 첫 이벤트(conversation)에서 conversationId 받아 URL 갱신(navigate).
//
// 단일 페이지 + searchParams 분기. revalidate 는 메시지 저장 직후 가벼운 useRevalidator() 호출.

import {
  ArrowUpIcon,
  CornerUpRightIcon,
  Loader2Icon,
  MessageSquareIcon,
  PlusIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Form,
  Link,
  data,
  redirect,
  useFetcher,
  useNavigate,
  useRevalidator,
  useSearchParams,
} from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Textarea } from "~/core/components/ui/textarea";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { MarkdownView } from "~/features/problems/components/markdown-view";
import {
  getConversationWithMessages,
  listMyConversations,
  setMessageFeedback,
  softDeleteConversation,
  type ConversationMessage,
  type ConversationSummary,
} from "~/features/ai-qna/conversations.server";
import type { Citation } from "~/features/ai-qna/lib/citations";
import {
  getQuotaState,
  type QuotaState,
} from "~/features/ai-qna/settings.server";

import type { Route } from "./+types/ai-chat";

export const meta: Route.MetaFunction = () => [
  { title: "AI Q&A | Lidam Patent Attorney Academy" },
];

// ── loader ────────────────────────────────────────────────────────────────

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");

  const url = new URL(request.url);
  const activeId = url.searchParams.get("c");

  const [conversations, quota] = await Promise.all([
    listMyConversations(client, user.id, 50),
    getQuotaState(client, user.id),
  ]);

  let active: {
    conversation: ConversationSummary;
    messages: ConversationMessage[];
  } | null = null;
  if (activeId) {
    active = await getConversationWithMessages(client, activeId);
  }

  return { conversations, active, quota };
}

// ── action — delete / feedback ────────────────────────────────────────────

export async function action({ request }: Route.ActionArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });

  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "");

  if (intent === "delete_conversation") {
    const conversationId = String(fd.get("conversationId") ?? "");
    if (!conversationId)
      return data({ error: "conversationId 필수" }, { status: 400 });
    await softDeleteConversation(client, conversationId);
    return data({ ok: true });
  }

  if (intent === "feedback") {
    const messageId = String(fd.get("messageId") ?? "");
    const value = Number(fd.get("feedback") ?? 0);
    const noteRaw = fd.get("note");
    const note =
      typeof noteRaw === "string" && noteRaw.trim().length > 0
        ? noteRaw.trim().slice(0, 1000)
        : null;
    if (!messageId)
      return data({ error: "messageId 필수" }, { status: 400 });
    if (value !== 1 && value !== -1 && value !== 0)
      return data({ error: "feedback 은 -1/0/1" }, { status: 400 });
    await setMessageFeedback(client, messageId, value as 1 | -1 | 0, note);
    return data({ ok: true });
  }

  return data({ error: "Unknown intent" }, { status: 400 });
}

// ── 추천 질문 ─────────────────────────────────────────────────────────────

const SUGGESTED_QUESTIONS: string[] = [
  "특허법 제29조 진보성 판단 기준을 알려줘.",
  "디자인보호법상 신규성 상실 예외를 어떻게 적용해?",
  "민사소송법상 제소전 화해와 화해권고결정의 차이는?",
  "상표법 제90조 비침해 항변 사유를 정리해줘.",
];

// ── 컴포넌트 ──────────────────────────────────────────────────────────────

interface StreamingState {
  /** 신규 대화면 응답 후 받은 id. */
  conversationId: string | null;
  /** 현재 표시 중인 메시지 누적 텍스트. */
  assistantText: string;
  /** 검색 결과 hits (출처 카드). */
  hits: Array<{
    label: number;
    chunkId: string;
    sourceType: "article" | "case" | "problem";
    sourceId: string;
    headingPath: string | null;
  }>;
  citations: Citation[];
  done: boolean;
  error: string | null;
}

const INITIAL_STREAM: StreamingState = {
  conversationId: null,
  assistantText: "",
  hits: [],
  citations: [],
  done: false,
  error: null,
};

export default function AiChat({ loaderData }: Route.ComponentProps) {
  const { conversations, active, quota } = loaderData;
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const revalidator = useRevalidator();

  const activeId = active?.conversation.conversationId ?? null;
  const anchorParam = searchParams.get("anchor");
  const seedQ = searchParams.get("q");

  const [input, setInput] = useState<string>("");
  const [sending, setSending] = useState(false);
  const [stream, setStream] = useState<StreamingState>(INITIAL_STREAM);
  const [quotaBlock, setQuotaBlock] = useState<{
    tier: string;
    dailyLimit: number;
    usedToday: number;
    message: string;
  } | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  // seed 자동 전송 — 한 번만.
  const autoSentRef = useRef(false);
  useEffect(() => {
    if (autoSentRef.current) return;
    if (!seedQ) return;
    if (active && active.messages.length > 0) return; // 기존 대화면 seed 무시
    autoSentRef.current = true;
    void send(seedQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedQ]);

  async function send(question: string) {
    if (sending) return;
    const trimmed = question.trim();
    if (!trimmed) return;
    setSending(true);
    setStream({ ...INITIAL_STREAM });
    setInput("");

    const fd = new FormData();
    fd.set("question", trimmed);
    if (activeId) fd.set("conversationId", activeId);
    if (anchorParam) {
      const m = anchorParam.match(/^(article|case|problem):(.+)$/);
      if (m) {
        fd.set("anchorType", m[1]);
        fd.set("anchorId", m[2]);
      }
    }

    try {
      const resp = await fetch("/api/ai-qna/ask", { method: "POST", body: fd });
      // feat-9-006 한도 초과 — 429 응답 JSON 으로 인라인 배너 처리.
      if (resp.status === 429) {
        const json = (await resp.json().catch(() => ({}))) as {
          tier?: string;
          dailyLimit?: number;
          usedToday?: number;
          message?: string;
        };
        setQuotaBlock({
          tier: json.tier ?? quota.tier,
          dailyLimit: json.dailyLimit ?? quota.dailyLimit,
          usedToday: json.usedToday ?? quota.usedToday,
          message:
            json.message ??
            "오늘의 AI 사용 한도에 도달했습니다. 강사 Q&A 를 이용해 주세요.",
        });
        setStream({ ...INITIAL_STREAM });
        return;
      }
      if (!resp.ok || !resp.body) {
        const text = await resp.text().catch(() => "");
        throw new Error(text || `HTTP ${resp.status}`);
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;
          const json = part.slice(6);
          let payload: Record<string, unknown>;
          try {
            payload = JSON.parse(json);
          } catch {
            continue;
          }
          handleEvent(payload);
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStream((s) => ({ ...s, error: msg, done: true }));
    } finally {
      setSending(false);
      // 신규/기존 무관 — 저장된 메시지 반영을 위해 loader 재호출.
      revalidator.revalidate();
      // 신규 대화면 URL 갱신 (활성화).
      setStream((s) => {
        if (s.conversationId && s.conversationId !== activeId) {
          navigate(`/ai?c=${s.conversationId}`, { replace: false });
        }
        return s;
      });
    }
  }

  function handleEvent(payload: Record<string, unknown>) {
    const type = payload.type;
    if (type === "conversation") {
      const cid = typeof payload.conversationId === "string" ? payload.conversationId : null;
      setStream((s) => ({ ...s, conversationId: cid }));
    } else if (type === "search") {
      const hits = Array.isArray(payload.hits)
        ? (payload.hits as StreamingState["hits"])
        : [];
      setStream((s) => ({ ...s, hits }));
    } else if (type === "text") {
      const delta = typeof payload.delta === "string" ? payload.delta : "";
      setStream((s) => ({ ...s, assistantText: s.assistantText + delta }));
    } else if (type === "done") {
      const citations = Array.isArray(payload.citations)
        ? (payload.citations as Citation[])
        : [];
      setStream((s) => ({ ...s, citations, done: true }));
    } else if (type === "error") {
      const message = typeof payload.message === "string" ? payload.message : "오류";
      setStream((s) => ({ ...s, error: message, done: true }));
    }
  }

  function handleComposerSubmit(e: React.FormEvent) {
    e.preventDefault();
    void send(input);
  }

  // streaming 종료 후 활성 대화로 revalidate 되면 stream state 비움.
  useEffect(() => {
    if (stream.done && !sending) {
      // 약간 지연 후 정리 — 사용자가 done 직후 ui 갱신을 인지하도록.
      const id = setTimeout(() => {
        setStream(INITIAL_STREAM);
      }, 500);
      return () => clearTimeout(id);
    }
  }, [stream.done, sending]);

  return (
    <div className="bg-background flex h-[calc(100vh-3.5rem)]">
      {/* 사이드바 */}
      <aside className="border-border bg-card hidden w-64 shrink-0 flex-col border-r md:flex">
        <div className="border-border flex items-center justify-between border-b px-3 py-3">
          <p className="text-sm font-bold tracking-tight">AI 대화</p>
          <Button asChild size="sm" variant="default" className="h-7 rounded-full px-2.5">
            <Link to="/ai">
              <PlusIcon className="size-3" /> 새 대화
            </Link>
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {conversations.length === 0 ? (
            <p className="text-muted-foreground p-3 text-center text-xs">
              아직 대화가 없습니다.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {conversations.map((c) => (
                <li key={c.conversationId}>
                  <Link
                    to={`/ai?c=${c.conversationId}`}
                    className={cn(
                      "hover:bg-muted block rounded-md px-2 py-2 text-xs transition-colors",
                      c.conversationId === activeId &&
                        "bg-muted text-foreground font-semibold",
                    )}
                  >
                    <p className="line-clamp-1 text-foreground">
                      {c.title ?? "(제목 없음)"}
                    </p>
                    {c.lastSnippet ? (
                      <p className="text-muted-foreground mt-0.5 line-clamp-1">
                        {c.lastSnippet}
                      </p>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* 메인 영역 */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="border-border flex items-center gap-2 border-b px-4 py-3">
          <MessageSquareIcon className="text-primary size-4" />
          <h1 className="text-sm font-bold tracking-tight">
            {active ? active.conversation.title ?? "(제목 없음)" : "새 대화"}
          </h1>
          {active?.conversation.anchor ? (
            <Badge variant="outline" className="ml-2 text-[11px]">
              앵커: {active.conversation.anchor.sourceType} ·{" "}
              {active.conversation.anchor.sourceId.slice(0, 8)}
            </Badge>
          ) : null}
          {/* feat-9-006 한도 표시 — staff/회원3 = tier1, 그 외 = free */}
          <QuotaBadge quota={quota} />
          {active ? (
            <DeleteConversationButton
              conversationId={active.conversation.conversationId}
            />
          ) : null}
        </header>

        {quotaBlock ? <QuotaBanner block={quotaBlock} /> : null}

        <div className="flex-1 overflow-y-auto px-4 py-6">
          {!active && stream.assistantText === "" && !sending ? (
            <EmptyState onPick={(q) => void send(q)} />
          ) : (
            <div className="mx-auto max-w-3xl space-y-5">
              {active?.messages.map((m) => (
                <MessageBubble key={m.messageId} message={m} />
              ))}
              {(sending || stream.assistantText) && (
                <StreamingBubble stream={stream} sending={sending} />
              )}
            </div>
          )}
        </div>

        <Composer
          ref={composerRef}
          value={input}
          sending={sending}
          onChange={setInput}
          onSubmit={handleComposerSubmit}
        />
      </main>
    </div>
  );
}

// ── 메시지 버블 ────────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: ConversationMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex gap-3", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
          isUser
            ? "bg-primary text-primary-foreground whitespace-pre-wrap"
            : "bg-card border-border border",
        )}
      >
        {isUser ? (
          message.bodyMd
        ) : (
          <MarkdownView text={message.bodyMd} className="text-sm leading-relaxed" />
        )}
        {!isUser && message.citations.length > 0 ? (
          <CitationsRow citations={message.citations} />
        ) : null}
        {!isUser ? (
          <FeedbackButtons
            messageId={message.messageId}
            feedback={message.feedback}
            feedbackNote={message.feedbackNote}
          />
        ) : null}
      </div>
    </div>
  );
}

function StreamingBubble({
  stream,
  sending,
}: {
  stream: StreamingState;
  sending: boolean;
}) {
  return (
    <div className="flex gap-3">
      <div className="bg-card border-border max-w-[85%] rounded-2xl border px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">
        {stream.assistantText || (
          <span className="text-muted-foreground inline-flex items-center gap-1.5">
            <Loader2Icon className="size-3.5 animate-spin" /> 검색·생성 중…
          </span>
        )}
        {stream.error ? (
          <p className="mt-2 text-xs text-rose-600">오류: {stream.error}</p>
        ) : null}
        {stream.hits.length > 0 ? (
          <div className="text-muted-foreground mt-3 flex flex-wrap gap-1 border-t border-border/60 pt-2 text-[11px]">
            {stream.hits.slice(0, 6).map((h) => (
              <Badge key={h.chunkId} variant="outline" className="font-normal">
                [{h.label}] {h.headingPath ?? h.sourceType}
              </Badge>
            ))}
            {stream.hits.length > 6 ? (
              <span className="text-[10px]">+{stream.hits.length - 6}</span>
            ) : null}
          </div>
        ) : null}
        {sending && !stream.done ? (
          <p className="text-muted-foreground mt-2 text-[11px]">
            응답 생성 중…
          </p>
        ) : null}
      </div>
    </div>
  );
}

function CitationsRow({ citations }: { citations: ReadonlyArray<Citation> }) {
  return (
    <div className="border-border/60 mt-3 flex flex-wrap gap-1 border-t pt-2 text-[11px]">
      {citations.map((c) => {
        const href = citationHref(c);
        return (
          <Link
            key={`${c.label}-${c.chunkId}`}
            to={href}
            className="bg-muted hover:bg-muted-foreground/10 inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-normal transition-colors"
          >
            <CornerUpRightIcon className="size-3" />[{c.label}] {c.headingPath}
          </Link>
        );
      })}
    </div>
  );
}

function citationHref(c: Citation): string {
  if (c.sourceType === "case") return `/latest/cases/${c.sourceId}`;
  if (c.sourceType === "problem") return `/latest/essay/${c.sourceId}`;
  // article — 식별자 변환은 미보유, fallback 으로 latest/laws 인덱스로.
  return `/latest/laws`;
}

function FeedbackButtons({
  messageId,
  feedback,
  feedbackNote,
}: {
  messageId: string;
  feedback: number | null;
  feedbackNote: string | null;
}) {
  const fetcher = useFetcher();
  const submitting = fetcher.state !== "idle";
  const [noteDraft, setNoteDraft] = useState<string>(feedbackNote ?? "");
  const [noteOpen, setNoteOpen] = useState<boolean>(false);

  function set(value: 1 | -1) {
    const next = feedback === value ? 0 : value;
    const fd = new FormData();
    fd.set("intent", "feedback");
    fd.set("messageId", messageId);
    fd.set("feedback", String(next));
    // 👎 토글 켤 때 사유 입력 영역 노출. 끌 때 닫고 사유 비움.
    if (next === -1) {
      setNoteOpen(true);
    } else {
      setNoteOpen(false);
      setNoteDraft("");
      fd.set("note", "");
    }
    fetcher.submit(fd, { method: "post" });
  }

  function submitNote() {
    if (feedback !== -1) return;
    const trimmed = noteDraft.trim();
    if (trimmed === (feedbackNote ?? "")) return; // 변경 없음
    const fd = new FormData();
    fd.set("intent", "feedback");
    fd.set("messageId", messageId);
    fd.set("feedback", "-1");
    fd.set("note", trimmed);
    fetcher.submit(fd, { method: "post" });
  }

  return (
    <div className="border-border/60 mt-2 space-y-2 border-t pt-2">
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => set(1)}
          disabled={submitting}
          aria-pressed={feedback === 1}
          className={cn(
            "hover:bg-muted inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] transition-colors",
            feedback === 1 && "text-emerald-700 dark:text-emerald-300",
          )}
        >
          <ThumbsUpIcon className="size-3" />
        </button>
        <button
          type="button"
          onClick={() => set(-1)}
          disabled={submitting}
          aria-pressed={feedback === -1}
          className={cn(
            "hover:bg-muted inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] transition-colors",
            feedback === -1 && "text-rose-700 dark:text-rose-300",
          )}
        >
          <ThumbsDownIcon className="size-3" />
        </button>
        {feedback === -1 && !noteOpen ? (
          <button
            type="button"
            onClick={() => setNoteOpen(true)}
            className="text-muted-foreground hover:bg-muted inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] transition-colors"
          >
            사유 {feedbackNote ? "수정" : "추가"}
          </button>
        ) : null}
      </div>
      {feedback === -1 && noteOpen ? (
        <div className="space-y-1.5">
          <Textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            onBlur={submitNote}
            rows={2}
            maxLength={1000}
            placeholder="무엇이 부정확했나요? (예: 출처가 맞지 않음 / 누락된 조문 / 거짓 사실 등)"
            className="text-xs"
          />
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => {
                setNoteOpen(false);
                setNoteDraft(feedbackNote ?? "");
              }}
              className="text-muted-foreground hover:bg-muted rounded-full px-2 py-0.5 text-[11px]"
            >
              닫기
            </button>
            <button
              type="button"
              onClick={submitNote}
              disabled={submitting}
              className="bg-primary text-primary-foreground rounded-full px-2.5 py-0.5 text-[11px]"
            >
              사유 저장
            </button>
          </div>
        </div>
      ) : feedback === -1 && feedbackNote ? (
        <p className="text-muted-foreground text-[11px] leading-snug">
          사유: {feedbackNote}
        </p>
      ) : null}
    </div>
  );
}

// ── 빈 상태 ───────────────────────────────────────────────────────────────

function EmptyState({ onPick }: { onPick: (q: string) => void }) {
  const items = useMemo(() => SUGGESTED_QUESTIONS, []);
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 py-12">
      <MessageSquareIcon className="text-muted-foreground size-10" />
      <h2 className="text-xl font-bold tracking-tight">AI 학습 Q&A</h2>
      <p className="text-muted-foreground text-center text-sm leading-relaxed">
        조문·판례·문제를 색인한 AI가 출처를 인용해 즉답합니다.
        <br />
        근거가 부족하면 답하지 않고 강사 Q&A 를 안내합니다.
      </p>
      <ul className="mt-3 grid w-full max-w-xl gap-2">
        {items.map((q) => (
          <li key={q}>
            <button
              type="button"
              onClick={() => onPick(q)}
              className="border-border hover:border-primary/40 hover:bg-muted/40 w-full rounded-xl border px-3 py-2.5 text-left text-sm transition-colors"
            >
              {q}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Composer ──────────────────────────────────────────────────────────────

interface ComposerProps {
  value: string;
  sending: boolean;
  onChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}

function Composer({
  value,
  sending,
  onChange,
  onSubmit,
  ref,
}: ComposerProps & { ref?: React.Ref<HTMLTextAreaElement> }) {
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      onSubmit(e as unknown as React.FormEvent);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="border-border bg-card border-t px-4 py-3"
    >
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <Textarea
          ref={ref}
          placeholder="질문을 입력하세요. (Enter 전송, Shift+Enter 줄바꿈)"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={sending}
          rows={2}
          className="min-h-[60px] flex-1 resize-none rounded-2xl"
        />
        <Button
          type="submit"
          size="icon"
          disabled={sending || !value.trim()}
          className="size-10 rounded-full"
        >
          {sending ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <ArrowUpIcon className="size-4" />
          )}
        </Button>
      </div>
    </form>
  );
}

function QuotaBadge({ quota }: { quota: QuotaState }) {
  const danger = quota.remaining === 0;
  const warn = quota.remaining > 0 && quota.remaining <= 2;
  return (
    <Badge
      variant="outline"
      className={cn(
        "ml-auto text-[11px] tabular-nums",
        danger
          ? "border-rose-500/40 text-rose-700 dark:text-rose-300"
          : warn
            ? "border-amber-500/40 text-amber-700 dark:text-amber-300"
            : "",
      )}
      title={`tier=${quota.tier} · 한도 ${quota.dailyLimit}/일 · 출력토큰 ${quota.quotas.maxOutputTokens} · 컨텍스트 ${quota.quotas.maxContextChunks}`}
    >
      오늘 {quota.usedToday}/{quota.dailyLimit}
    </Badge>
  );
}

function QuotaBanner({
  block,
}: {
  block: {
    tier: string;
    dailyLimit: number;
    usedToday: number;
    message: string;
  };
}) {
  return (
    <div className="border-rose-500/30 bg-rose-500/[0.05] flex items-start gap-3 border-b px-4 py-3 text-sm">
      <div className="min-w-0 flex-1">
        <p className="text-rose-700 font-semibold dark:text-rose-300">
          오늘의 AI 사용 한도에 도달했습니다 ({block.usedToday}/{block.dailyLimit})
        </p>
        <p className="text-foreground/80 mt-1 text-xs leading-relaxed">
          {block.message}
        </p>
      </div>
      <Link
        to="/qna/new"
        className="text-primary text-xs underline-offset-4 hover:underline"
      >
        강사 Q&A →
      </Link>
    </div>
  );
}

function DeleteConversationButton({
  conversationId,
}: {
  conversationId: string;
}) {
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const submitting = fetcher.state !== "idle";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!confirm("이 대화를 삭제하시겠습니까? (휴지통 보관 — 복구 가능)")) return;
    const fd = new FormData();
    fd.set("intent", "delete_conversation");
    fd.set("conversationId", conversationId);
    fetcher.submit(fd, { method: "post" });
    navigate("/ai", { replace: true });
  }

  return (
    <Form onSubmit={handleSubmit} className="ml-auto">
      <Button
        type="submit"
        size="sm"
        variant="ghost"
        disabled={submitting}
        className="h-7 rounded-full px-2.5 text-xs text-rose-600 hover:bg-rose-500/10 hover:text-rose-700"
      >
        삭제
      </Button>
    </Form>
  );
}
