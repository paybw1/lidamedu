import { ArrowLeftIcon } from "lucide-react";
import { useState } from "react";
import { Link, data, redirect, useFetcher } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Input } from "~/core/components/ui/input";
import { Separator } from "~/core/components/ui/separator";
import { Textarea } from "~/core/components/ui/textarea";
import makeServerClient from "~/core/lib/supa-client.server";

import { QNA_TARGET_LABEL, qnaTargetTypeSchema } from "../labels";
import { resolveTargetDisplay } from "../lib/target-display.server";

import type { Route } from "./+types/qna-new";

export const meta: Route.MetaFunction = () => [
  { title: "새 Q&A 질문 | Lidam Edu" },
];

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
  const targetIdParse =
    targetIdRaw && /^[0-9a-f-]{36}$/i.test(targetIdRaw) ? targetIdRaw : null;

  if (!targetTypeParse.success || !targetIdParse) {
    throw data(
      "targetType 과 targetId 가 필요합니다. 조문/판례/문제 우측 패널에서 진입하세요.",
      { status: 400 },
    );
  }

  const target = await resolveTargetDisplay(
    client,
    targetTypeParse.data,
    targetIdParse,
  );

  return {
    targetType: targetTypeParse.data,
    targetId: targetIdParse,
    target,
  };
}

export default function QnaNew({ loaderData }: Route.ComponentProps) {
  const { targetType, targetId, target } = loaderData;
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
      <div className="mx-auto w-full max-w-screen-md px-5 py-10 text-center md:px-10">
        <h1 className="text-xl font-bold">질문이 등록되었습니다</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          답변자에게 알림 메일이 발송됩니다. 답변이 등록되면 메일로 알려드려요.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/qna" viewTransition>
              목록으로
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link to={`/qna/${newThreadId}`} viewTransition>
              내 질문 보기
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-screen-md px-5 py-6 md:px-10 md:py-8">
      <Link
        to="/qna"
        viewTransition
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeftIcon className="size-4" /> Q&A 목록
      </Link>

      <Card>
        <CardHeader>
          <h1 className="text-xl font-bold tracking-tight">새 질문</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="outline">{QNA_TARGET_LABEL[targetType]}</Badge>
            {target?.label ? (
              <span className="text-muted-foreground text-xs">
                {target.label}
              </span>
            ) : null}
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="space-y-3 pt-5">
          <fetcher.Form method="post" action="/api/qna/thread">
            <input type="hidden" name="intent" value="create" />
            <input type="hidden" name="targetType" value={targetType} />
            <input type="hidden" name="targetId" value={targetId} />

            <label className="block">
              <span className="mb-1 block text-xs font-medium">제목</span>
              <Input
                name="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="질문을 한 줄로 요약해 주세요"
                maxLength={200}
                required
              />
            </label>

            <label className="mt-3 block">
              <span className="mb-1 block text-xs font-medium">질문 내용</span>
              <Textarea
                name="questionMd"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="배경, 본인의 이해, 막히는 부분을 구체적으로 적으면 더 좋은 답변을 받을 수 있어요."
                rows={10}
                className="text-sm"
                required
              />
            </label>

            <div className="mt-4 flex justify-end gap-2">
              <Button asChild variant="outline" size="sm" type="button">
                <Link to="/qna" viewTransition>
                  취소
                </Link>
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isSubmitting || !title.trim() || !body.trim()}
              >
                질문 등록
              </Button>
            </div>
          </fetcher.Form>
        </CardContent>
      </Card>
    </div>
  );
}
