import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  ExternalLinkIcon,
} from "lucide-react";
import { useState } from "react";
import { Link, data, useFetcher } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Separator } from "~/core/components/ui/separator";
import { Textarea } from "~/core/components/ui/textarea";
import makeServerClient from "~/core/lib/supa-client.server";
import { cn } from "~/core/lib/utils";

import {
  QNA_QUALITY_GRADES,
  QNA_QUALITY_LABEL,
  QNA_STATUS_LABEL,
  QNA_TARGET_LABEL,
  type QnaQualityGrade,
} from "../labels";
import { getThreadDetail } from "../queries.server";
import { resolveTargetDisplay } from "../lib/target-display.server";

import type { Route } from "./+types/qna-detail";

export const meta: Route.MetaFunction = ({ data: loaderData }) => {
  if (!loaderData) return [{ title: "Q&A | Lidam Edu" }];
  return [{ title: `${loaderData.thread.title} | Q&A | Lidam Edu` }];
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
  const isStaff = role === "instructor" || role === "admin";

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

  return (
    <div className="mx-auto w-full max-w-screen-md px-5 py-6 md:px-10 md:py-8">
      <Link
        to="/qna"
        viewTransition
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeftIcon className="size-4" /> Q&A 목록
      </Link>

      <Card className="mb-4">
        <CardHeader>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant="outline">
              {QNA_TARGET_LABEL[thread.targetType]}
            </Badge>
            <Badge
              variant={thread.status === "answered" ? "default" : "secondary"}
            >
              {QNA_STATUS_LABEL[thread.status]}
            </Badge>
            {thread.qualityGrade ? (
              <Badge variant="outline" className="border-amber-400 text-amber-600">
                질문 수준 {QNA_QUALITY_LABEL[thread.qualityGrade]}
              </Badge>
            ) : null}
            {target?.href ? (
              <Link
                to={target.href}
                viewTransition
                className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
              >
                {target.label} <ExternalLinkIcon className="size-3" />
              </Link>
            ) : target?.label ? (
              <span className="text-muted-foreground text-xs">
                {target.label}
              </span>
            ) : null}
          </div>
          <h1 className="text-xl font-bold tracking-tight">{thread.title}</h1>
          <p className="text-muted-foreground text-xs">
            {thread.askerName ?? "알 수 없음"} ·{" "}
            {new Date(thread.createdAt).toLocaleString("ko-KR")}
          </p>
        </CardHeader>
        <Separator />
        <CardContent className="pt-5">
          <p className="text-sm leading-relaxed whitespace-pre-line">
            {thread.questionMd}
          </p>
        </CardContent>
      </Card>

      {thread.answerMd ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="default" className="bg-emerald-600">
                <CheckCircle2Icon className="size-3" /> 답변
              </Badge>
              <p className="text-muted-foreground text-xs">
                {thread.answererName ?? "강사"}
                {thread.answeredAt
                  ? ` · ${new Date(thread.answeredAt).toLocaleString("ko-KR")}`
                  : ""}
              </p>
            </div>
          </CardHeader>
          <Separator />
          <CardContent className="pt-5">
            <p className="text-sm leading-relaxed whitespace-pre-line">
              {thread.answerMd}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {canAnswer ? (
        <AnswerForm threadId={thread.threadId} />
      ) : isStaff && thread.status === "open" ? (
        <p className="text-muted-foreground mt-6 text-sm">
          이미 다른 강사가 답변 중인 스레드입니다.
        </p>
      ) : null}

      {isAsker && thread.status === "answered" ? (
        <CloseButton threadId={thread.threadId} />
      ) : null}
    </div>
  );
}

function AnswerForm({ threadId }: { threadId: string }) {
  const fetcher = useFetcher();
  const [grade, setGrade] = useState<QnaQualityGrade>("mid");
  const [draft, setDraft] = useState("");
  const isSubmitting = fetcher.state !== "idle";

  return (
    <Card className="mt-4">
      <CardHeader>
        <p className="text-sm font-semibold">답변 등록</p>
        <p className="text-muted-foreground text-xs">
          답변자가 되면 같은 질문에 다른 강사는 답변할 수 없습니다.
        </p>
      </CardHeader>
      <Separator />
      <CardContent className="space-y-3 pt-5">
        <fetcher.Form method="post" action="/api/qna/thread">
          <input type="hidden" name="intent" value="answer" />
          <input type="hidden" name="threadId" value={threadId} />
          <input type="hidden" name="qualityGrade" value={grade} />
          <Textarea
            name="answerMd"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="답변을 작성하세요"
            rows={6}
            className="text-sm"
            required
          />

          <div className="mt-3 flex flex-wrap items-center gap-1">
            <span className="text-muted-foreground mr-1 text-xs">
              질문 수준 평가:
            </span>
            {QNA_QUALITY_GRADES.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGrade(g)}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-xs transition-colors",
                  grade === g
                    ? "bg-amber-500 text-white border-amber-500"
                    : "bg-background hover:bg-accent text-muted-foreground border-input",
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
              disabled={isSubmitting || !draft.trim()}
            >
              답변 등록
            </Button>
          </div>
        </fetcher.Form>
      </CardContent>
    </Card>
  );
}

function CloseButton({ threadId }: { threadId: string }) {
  const fetcher = useFetcher();
  const isSubmitting = fetcher.state !== "idle";
  return (
    <fetcher.Form method="post" action="/api/qna/thread" className="mt-4">
      <input type="hidden" name="intent" value="close" />
      <input type="hidden" name="threadId" value={threadId} />
      <Button type="submit" variant="outline" size="sm" disabled={isSubmitting}>
        스레드 종료
      </Button>
    </fetcher.Form>
  );
}
