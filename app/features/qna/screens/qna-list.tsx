import { PencilLineIcon, SearchIcon } from "lucide-react";
import { Form, Link, useSearchParams } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent } from "~/core/components/ui/card";
import { Input } from "~/core/components/ui/input";
import makeServerClient from "~/core/lib/supa-client.server";
import { cn } from "~/core/lib/utils";

import {
  QNA_STATUS_LABEL,
  QNA_TARGET_LABEL,
  qnaTargetTypeSchema,
  type QnaTargetType,
} from "../labels";
import { listThreads, type ListFilter } from "../queries.server";

import type { Route } from "./+types/qna-list";

type Scope = ListFilter["scope"];

const SCOPE_LABELS: Record<Scope, string> = {
  all: "전체",
  "asked-by-me": "내 질문",
  "answered-by-me": "내 답변",
  open: "답변 대기",
};

const SCOPE_VALUES: Scope[] = ["all", "asked-by-me", "answered-by-me", "open"];

export const meta: Route.MetaFunction = () => [{ title: "Q&A | Lidam Edu" }];

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const rawScope = url.searchParams.get("scope") ?? "all";
  const scope: Scope = SCOPE_VALUES.includes(rawScope as Scope)
    ? (rawScope as Scope)
    : "all";

  const rawTarget = url.searchParams.get("target");
  const targetParse = rawTarget ? qnaTargetTypeSchema.safeParse(rawTarget) : null;
  const targetType: QnaTargetType | undefined = targetParse?.success
    ? targetParse.data
    : undefined;

  const query = url.searchParams.get("q") ?? "";

  const threads = await listThreads(client, user.id, {
    scope,
    targetType,
    query,
  });

  return { threads, scope, targetType, query, currentUserId: user.id };
}

export default function QnaList({ loaderData }: Route.ComponentProps) {
  const { threads, scope, targetType, query, currentUserId } = loaderData;
  const [searchParams] = useSearchParams();

  const buildHref = (overrides: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(overrides)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    return `/qna?${next.toString()}`;
  };

  return (
    <div className="mx-auto w-full max-w-screen-lg px-5 py-6 md:px-10 md:py-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Q&A</h1>
        <Button asChild size="sm">
          <Link to="/qna/new" viewTransition>
            <PencilLineIcon className="size-4" /> 새 질문
          </Link>
        </Button>
      </div>

      <Form method="get" className="mb-4 flex items-center gap-2">
        <div className="relative flex-1">
          <SearchIcon className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="제목 / 질문 / 답변 검색"
            className="pl-9"
          />
        </div>
        {scope !== "all" ? (
          <input type="hidden" name="scope" value={scope} />
        ) : null}
        {targetType ? (
          <input type="hidden" name="target" value={targetType} />
        ) : null}
        <Button type="submit" size="sm">
          검색
        </Button>
      </Form>

      <div className="mb-3 flex flex-wrap items-center gap-1">
        <span className="text-muted-foreground mr-1 text-[10px] font-medium tracking-wide uppercase">
          분류
        </span>
        {SCOPE_VALUES.map((s) => (
          <Link
            key={s}
            to={buildHref({ scope: s === "all" ? null : s })}
            className={cn(
              "rounded-md border px-2 py-0.5 text-xs transition-colors",
              scope === s
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background hover:bg-accent text-muted-foreground border-input",
            )}
          >
            {SCOPE_LABELS[s]}
          </Link>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-1">
        <span className="text-muted-foreground mr-1 text-[10px] font-medium tracking-wide uppercase">
          대상
        </span>
        <Link
          to={buildHref({ target: null })}
          className={cn(
            "rounded-md border px-2 py-0.5 text-xs transition-colors",
            !targetType
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background hover:bg-accent text-muted-foreground border-input",
          )}
        >
          전체
        </Link>
        {(["article", "case", "problem"] as QnaTargetType[]).map((t) => (
          <Link
            key={t}
            to={buildHref({ target: t })}
            className={cn(
              "rounded-md border px-2 py-0.5 text-xs transition-colors",
              targetType === t
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background hover:bg-accent text-muted-foreground border-input",
            )}
          >
            {QNA_TARGET_LABEL[t]}
          </Link>
        ))}
      </div>

      {threads.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground text-sm">
              조건에 맞는 질문이 없습니다.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {threads.map((t) => {
            const isMine = t.askerId === currentUserId;
            const isMyAnswer = t.answererId === currentUserId;
            return (
              <li key={t.threadId}>
                <Link
                  to={`/qna/${t.threadId}`}
                  viewTransition
                  className="hover:bg-accent block rounded-md border p-3 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px]">
                          {QNA_TARGET_LABEL[t.targetType]}
                        </Badge>
                        <Badge
                          variant={
                            t.status === "answered" ? "default" : "secondary"
                          }
                          className="text-[10px]"
                        >
                          {QNA_STATUS_LABEL[t.status]}
                        </Badge>
                        {isMine ? (
                          <Badge variant="outline" className="text-[10px]">
                            내 질문
                          </Badge>
                        ) : null}
                        {isMyAnswer ? (
                          <Badge variant="outline" className="text-[10px]">
                            내 답변
                          </Badge>
                        ) : null}
                      </div>
                      <p className="truncate text-sm font-medium">{t.title}</p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {t.askerName ?? "알 수 없음"}
                        {t.answererName ? ` → ${t.answererName}` : ""} ·{" "}
                        {new Date(t.createdAt).toLocaleDateString("ko-KR")}
                      </p>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
