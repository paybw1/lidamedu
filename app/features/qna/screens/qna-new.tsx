import {
  CheckCircle2Icon,
  MessageCircleQuestionIcon,
  SendIcon,
} from "lucide-react";
import { useState } from "react";
import { Link, redirect, useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { Textarea } from "~/core/components/ui/textarea";
import { Chip } from "~/features/community/components/community-ui";
import { CommunityShell } from "~/features/community/components/community-shell";
import makeServerClient from "~/core/lib/supa-client.server";

import {
  QNA_SUBJECTS,
  QNA_SUBJECT_LABEL,
  QNA_TARGET_LABEL,
  qnaTargetTypeSchema,
  type QnaTargetType,
} from "../labels";
import { resolveTargetDisplay } from "../lib/target-display.server";

import type { Route } from "./+types/qna-new";

export const meta: Route.MetaFunction = () => [
  { title: "새 Q&A 질문 | 리담변리사학원" },
];

// 대상 칩 색 — 조문(primary) / 판례(violet) / 문제(amber).
const TARGET_TONE: Record<
  QnaTargetType,
  "primary" | "violet" | "amber" | "emerald"
> = {
  article: "primary",
  case: "violet",
  problem: "amber",
  study_method: "emerald",
};

type TargetDisplay = Awaited<ReturnType<typeof resolveTargetDisplay>>;

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    throw redirect("/login");
  }

  const targetTypeRaw = url.searchParams.get("targetType");

  // 공부방법 — 대상 콘텐츠 없이 과목만 선택해 작성(Q&A 화면에서 바로 질문).
  if (targetTypeRaw === "study_method") {
    return { mode: "study_method" as const };
  }

  const targetTypeParse = qnaTargetTypeSchema.safeParse(targetTypeRaw);
  const targetIdRaw = url.searchParams.get("targetId");
  const targetId =
    targetIdRaw && /^[0-9a-f-]{36}$/i.test(targetIdRaw) ? targetIdRaw : null;

  // 대상(조문/판례/문제) 없이 진입한 경우 — 에러 대신 안내(어떤 경로로 와도 안 깨지게).
  if (
    !targetTypeParse.success ||
    targetTypeParse.data === "study_method" ||
    !targetId
  ) {
    return { mode: "none" as const };
  }

  const target = await resolveTargetDisplay(
    client,
    targetTypeParse.data,
    targetId,
  );

  return {
    mode: "content" as const,
    targetType: targetTypeParse.data,
    targetId,
    target,
  };
}

export default function QnaNew({ loaderData }: Route.ComponentProps) {
  if (loaderData.mode === "study_method") {
    return <QnaForm mode="study_method" targetType="study_method" />;
  }
  if (loaderData.mode === "none") {
    return <NoTargetGuide />;
  }
  return (
    <QnaForm
      mode="content"
      targetType={loaderData.targetType}
      targetId={loaderData.targetId}
      target={loaderData.target}
    />
  );
}

// 대상 없이 진입 시 안내 — 콘텐츠 Q&A 는 조문/판례/문제 화면에서, 공부방법은 여기서 바로.
function NoTargetGuide() {
  return (
    <CommunityShell
      category="qna"
      title="새 질문"
      backLink={{ to: "/qna", label: "Q&A 목록" }}
      width="narrow"
    >
      <div className="border-border bg-card flex flex-col items-center gap-2.5 rounded-2xl border px-8 py-14 text-center shadow-sm">
        <span className="text-link mb-1 inline-flex size-14 items-center justify-center rounded-2xl bg-primary/10">
          <MessageCircleQuestionIcon className="size-7" />
        </span>
        <div className="text-base font-bold tracking-tight">
          질문할 대상을 선택하세요
        </div>
        <p className="text-muted-foreground max-w-md text-sm leading-relaxed">
          <strong className="text-foreground">조문 · 판례 · 문제</strong> 에 대한
          질문은 해당 상세 화면 우측 <strong className="text-foreground">‘Q&amp;A’</strong>{" "}
          패널에서, <strong className="text-foreground">공부방법</strong> 질문은
          아래 버튼으로 바로 작성할 수 있습니다. 답변은 강사가 답니다.
        </p>
        <div className="mt-3 flex justify-center gap-2">
          <Button asChild size="sm" className="rounded-full">
            <Link to="/qna/new?targetType=study_method" viewTransition>
              공부방법 질문하기
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="rounded-full">
            <Link to="/qna" viewTransition>
              Q&amp;A 목록
            </Link>
          </Button>
        </div>
      </div>
    </CommunityShell>
  );
}

function QnaForm({
  mode,
  targetType,
  targetId,
  target,
}: {
  mode: "content" | "study_method";
  targetType: QnaTargetType;
  targetId?: string;
  target?: TargetDisplay;
}) {
  const fetcher = useFetcher();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState("");
  const isSubmitting = fetcher.state !== "idle";
  const submitted =
    fetcher.state === "idle" &&
    fetcher.data &&
    typeof fetcher.data === "object" &&
    "ok" in fetcher.data &&
    fetcher.data.ok;
  const newThreadId =
    fetcher.data &&
    typeof fetcher.data === "object" &&
    "thread" in fetcher.data &&
    fetcher.data.thread &&
    typeof fetcher.data.thread === "object" &&
    "threadId" in fetcher.data.thread
      ? String(fetcher.data.thread.threadId)
      : null;

  if (submitted && newThreadId) {
    return (
      <CommunityShell
        category="qna"
        title="새 질문"
        backLink={{ to: "/qna", label: "Q&A 목록" }}
        width="narrow"
      >
        <div className="border-border bg-card flex flex-col items-center gap-2.5 rounded-2xl border px-8 py-14 text-center shadow-sm">
          <span className="mb-1 inline-flex size-14 items-center justify-center rounded-2xl bg-emerald-500/[0.12] text-emerald-600 dark:text-emerald-400">
            <CheckCircle2Icon className="size-7" />
          </span>
          <div className="text-base font-bold tracking-tight">
            질문이 등록되었습니다
          </div>
          <p className="text-muted-foreground max-w-md text-sm leading-relaxed">
            답변자에게 알림 메일이 발송됩니다. 답변이 등록되면 메일로 알려드려요.
          </p>
          <div className="mt-3 flex justify-center gap-2">
            <Button asChild variant="outline" size="sm" className="rounded-full">
              <Link to="/qna" viewTransition>
                목록으로
              </Link>
            </Button>
            <Button asChild size="sm" className="rounded-full">
              <Link to={`/qna/${newThreadId}`} viewTransition>
                내 질문 보기
              </Link>
            </Button>
          </div>
        </div>
      </CommunityShell>
    );
  }

  return (
    <CommunityShell
      category="qna"
      title="새 질문"
      desc={
        mode === "study_method"
          ? "공부방법에 대해 질문하면 강사가 답변합니다. 과목을 선택해 주세요."
          : "조문·판례·문제 화면에서 클릭한 대상에 대해 질문할 수 있습니다."
      }
      backLink={{ to: "/qna", label: "Q&A 목록" }}
      width="narrow"
    >
      <div className="border-border bg-card rounded-2xl border p-5 shadow-sm md:p-6">
        <fetcher.Form method="post" action="/api/qna/thread">
          <input type="hidden" name="intent" value="create" />
          <input type="hidden" name="targetType" value={targetType} />
          {mode === "content" && targetId ? (
            <input type="hidden" name="targetId" value={targetId} />
          ) : null}

          {mode === "content" ? (
            <div className="border-border bg-muted/40 mb-5 flex flex-wrap items-center gap-2 rounded-xl border p-3">
              <span className="text-muted-foreground font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
                대상
              </span>
              <Chip tone={TARGET_TONE[targetType]}>
                {QNA_TARGET_LABEL[targetType]}
              </Chip>
              {target?.label ? (
                <span className="text-sm font-bold tracking-tight">
                  {target.label}
                </span>
              ) : null}
            </div>
          ) : (
            <label className="mb-5 block">
              <span className="text-muted-foreground mb-1.5 block font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
                과목
              </span>
              <select
                name="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
                className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
              >
                <option value="" disabled>
                  과목 선택
                </option>
                {QNA_SUBJECTS.map((s) => (
                  <option key={s} value={s}>
                    {QNA_SUBJECT_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="block">
            <span className="text-muted-foreground mb-1.5 block font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
              제목
            </span>
            <Input
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="질문 요지를 한 줄로 요약해 주세요"
              maxLength={200}
              required
            />
          </label>

          <label className="mt-4 block">
            <span className="text-muted-foreground mb-1.5 block font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
              내용
            </span>
            <Textarea
              name="questionMd"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="질문 배경과 본인이 어디까지 정리했는지, 막히는 부분을 구체적으로 적으면 더 좋은 답변을 받을 수 있어요."
              rows={10}
              className="text-sm leading-relaxed"
              required
            />
          </label>

          <div className="mt-5 flex justify-end gap-2">
            <Button asChild variant="outline" size="sm" type="button" className="rounded-full">
              <Link to="/qna" viewTransition>
                취소
              </Link>
            </Button>
            <Button
              type="submit"
              size="sm"
              className="rounded-full"
              disabled={
                isSubmitting ||
                !title.trim() ||
                !body.trim() ||
                (mode === "study_method" && !subject)
              }
            >
              질문 등록 <SendIcon className="size-3.5" />
            </Button>
          </div>
        </fetcher.Form>
      </div>
    </CommunityShell>
  );
}
