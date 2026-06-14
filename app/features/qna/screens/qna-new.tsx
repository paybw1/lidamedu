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

import { QNA_TARGET_LABEL, qnaTargetTypeSchema, type QnaTargetType } from "../labels";
import { resolveTargetDisplay } from "../lib/target-display.server";

import type { Route } from "./+types/qna-new";

export const meta: Route.MetaFunction = () => [
  { title: "새 Q&A 질문 | Lidam Patent Attorney Academy" },
];

// 대상 칩 색 — 조문(primary) / 판례(violet) / 문제(amber).
const TARGET_TONE: Record<QnaTargetType, "primary" | "violet" | "amber"> = {
  article: "primary",
  case: "violet",
  problem: "amber",
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

  const targetTypeParse = qnaTargetTypeSchema.safeParse(
    url.searchParams.get("targetType"),
  );
  const targetIdRaw = url.searchParams.get("targetId");
  const targetId =
    targetIdRaw && /^[0-9a-f-]{36}$/i.test(targetIdRaw) ? targetIdRaw : null;

  // 대상(조문/판례/문제) 없이 진입한 경우 — 목록의 "새 질문" 버튼, AI 한도 폴백 "강사 Q&A" 등.
  // 예전엔 400 을 throw 해 "오류" 페이지가 떴다. Q&A 는 대상 스코프 기능이므로,
  // 에러 대신 "대상을 먼저 고르라"는 안내 화면을 렌더한다(어떤 경로로 와도 안 깨지게).
  if (!targetTypeParse.success || !targetId) {
    return { hasTarget: false as const };
  }

  const target = await resolveTargetDisplay(
    client,
    targetTypeParse.data,
    targetId,
  );

  return {
    hasTarget: true as const,
    targetType: targetTypeParse.data,
    targetId,
    target,
  };
}

export default function QnaNew({ loaderData }: Route.ComponentProps) {
  if (!loaderData.hasTarget) {
    return <NoTargetGuide />;
  }
  return (
    <QnaForm
      targetType={loaderData.targetType}
      targetId={loaderData.targetId}
      target={loaderData.target}
    />
  );
}

// 대상 없이 진입 시 안내 — Q&A 는 특정 조문/판례/문제에 대해서만 작성 가능.
function NoTargetGuide() {
  return (
    <CommunityShell
      category="qna"
      title="새 질문"
      backLink={{ to: "/qna", label: "Q&A 목록" }}
      width="narrow"
    >
      <div className="border-border bg-card flex flex-col items-center gap-2.5 rounded-2xl border px-8 py-14 text-center shadow-sm">
        <span className="text-primary mb-1 inline-flex size-14 items-center justify-center rounded-2xl bg-primary/10">
          <MessageCircleQuestionIcon className="size-7" />
        </span>
        <div className="text-base font-bold tracking-tight">
          질문할 대상을 먼저 선택하세요
        </div>
        <p className="text-muted-foreground max-w-md text-sm leading-relaxed">
          Q&amp;A 질문은 특정{" "}
          <strong className="text-foreground">조문 · 판례 · 문제</strong> 에 대해
          작성합니다. 학습 중인 조문 / 판례 / 문제 상세 화면 우측의{" "}
          <strong className="text-foreground">‘Q&amp;A’ 패널</strong> 에서
          ‘질문하기’ 를 눌러 시작해 주세요.
        </p>
        <div className="mt-3 flex justify-center gap-2">
          <Button asChild variant="outline" size="sm" className="rounded-full">
            <Link to="/qna" viewTransition>
              Q&amp;A 목록
            </Link>
          </Button>
          <Button asChild size="sm" className="rounded-full">
            <Link to="/dashboard" viewTransition>
              학습하러 가기
            </Link>
          </Button>
        </div>
      </div>
    </CommunityShell>
  );
}

function QnaForm({
  targetType,
  targetId,
  target,
}: {
  targetType: QnaTargetType;
  targetId: string;
  target: TargetDisplay;
}) {
  const fetcher = useFetcher();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
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
      desc="조문·판례·문제 화면에서 클릭한 대상에 대해 질문할 수 있습니다."
      backLink={{ to: "/qna", label: "Q&A 목록" }}
      width="narrow"
    >
      <div className="border-border bg-card rounded-2xl border p-5 shadow-sm md:p-6">
        <fetcher.Form method="post" action="/api/qna/thread">
          <input type="hidden" name="intent" value="create" />
          <input type="hidden" name="targetType" value={targetType} />
          <input type="hidden" name="targetId" value={targetId} />

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
              disabled={isSubmitting || !title.trim() || !body.trim()}
            >
              질문 등록 <SendIcon className="size-3.5" />
            </Button>
          </div>
        </fetcher.Form>
      </div>
    </CommunityShell>
  );
}
