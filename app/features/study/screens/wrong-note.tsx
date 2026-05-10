// 오답노트 — 가장 최근 시도가 오답인 문제 큐.
// 과목별 필터 + 클릭 시 problem-viewer 진입.

import {
  ArrowRightIcon,
  CheckSquareIcon,
  NotebookPenIcon,
  PlayIcon,
  TimerIcon,
} from "lucide-react";
import { Form, Link, data } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";
import {
  listOxWrongAttempts,
  listWrongAttempts,
} from "~/features/study/queries.server";

import type { Route } from "./+types/wrong-note";

export const meta: Route.MetaFunction = () => [
  { title: "오답노트 | Lidam Edu" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const subjectParam = url.searchParams.get("subject");
  const subject =
    subjectParam &&
    (LAW_SUBJECT_SLUGS as readonly string[]).includes(subjectParam)
      ? (subjectParam as LawSubjectSlug)
      : undefined;

  const [items, oxItems] = await Promise.all([
    listWrongAttempts(client, user.id, subject),
    listOxWrongAttempts(client, user.id, subject),
  ]);
  return { items, oxItems, subject: subject ?? null };
}

export default function WrongNote({ loaderData }: Route.ComponentProps) {
  const { items, oxItems, subject } = loaderData;
  const totalLabel = subject
    ? `${LAW_SUBJECTS[subject].name} 오답`
    : "전체 과목 오답";

  return (
    <div className="mx-auto w-full max-w-screen-lg px-5 py-6 md:px-10 md:py-8">
      <header className="mb-6 space-y-2">
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
          <NotebookPenIcon className="size-3.5" /> 학습 보조
        </p>
        <h1 className="text-2xl font-bold tracking-tight">오답노트</h1>
        <p className="text-muted-foreground text-sm">
          {totalLabel} · 객관식{" "}
          <span className="text-foreground font-bold">{items.length}</span>건 ·
          정오문제{" "}
          <span className="text-foreground font-bold">{oxItems.length}</span>건 ·
          가장 최근 시도가 오답인 항목만 노출됩니다. 다시 풀어 정답이면 자동 제거됩니다.
        </p>
      </header>

      {items.length > 0 ? (
        <Form
          method="post"
          action="/api/study/session-from-wrong"
          className="bg-primary/5 border-primary/30 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3"
        >
          <div className="flex items-center gap-2 text-sm">
            <PlayIcon className="text-primary size-4" />
            객관식 오답 {items.length}건을 한 세션으로 묶어 풀기
          </div>
          {subject ? (
            <input type="hidden" name="subject" value={subject} />
          ) : null}
          <div className="flex gap-2">
            <Button
              type="submit"
              name="mode"
              value="study"
              size="sm"
              variant="outline"
              className="h-8"
              data-testid="wrong-start-study"
            >
              학습 모드 <ArrowRightIcon className="size-3.5" />
            </Button>
            <Button
              type="submit"
              name="mode"
              value="exam"
              size="sm"
              className="h-8"
              data-testid="wrong-start-exam"
            >
              <TimerIcon className="size-3.5" /> 시험 모드
            </Button>
          </div>
        </Form>
      ) : null}

      <Form method="get" className="mb-4 flex flex-wrap items-center gap-2">
        <label className="flex flex-col gap-0.5 text-xs">
          <span className="text-muted-foreground tracking-wide">과목</span>
          <select
            name="subject"
            defaultValue={subject ?? ""}
            className="border-input bg-background h-8 rounded-md border px-2 text-xs"
          >
            <option value="">전체</option>
            {LAW_SUBJECT_SLUGS.map((s) => (
              <option key={s} value={s}>
                {LAW_SUBJECTS[s].name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="border-input bg-background hover:bg-accent h-8 rounded-md border px-3 text-xs"
        >
          적용
        </button>
      </Form>

      {items.length === 0 && oxItems.length === 0 ? (
        <div className="bg-muted/40 rounded-md border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-sm">
            오답이 없습니다. 문제를 풀어보세요.
          </p>
        </div>
      ) : (
        <>
          {items.length > 0 ? (
            <section className="mb-6">
              <h2 className="mb-2 text-sm font-semibold tracking-tight">
                객관식 오답
                <span className="text-muted-foreground ml-1.5 tabular-nums">
                  {items.length}
                </span>
              </h2>
              <div className="space-y-2">
                {items.map((item) => (
                  <Link
                    key={item.problemId}
                    to={`/subjects/${item.lawCode}/problems/${item.problemId}`}
                    viewTransition
                    className="group block"
                  >
                    <Card className="hover:border-primary transition-colors">
                      <CardHeader className="px-4 pb-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant="secondary" className="text-xs">
                            {LAW_SUBJECTS[item.lawCode].name}
                          </Badge>
                          {item.primaryArticleLabel ? (
                            <Badge variant="outline" className="text-xs">
                              {item.primaryArticleLabel}
                            </Badge>
                          ) : null}
                          {item.year ? (
                            <Badge variant="outline" className="text-xs">
                              {item.year}년
                              {item.problemNumber
                                ? ` · ${item.problemNumber}번`
                                : ""}
                            </Badge>
                          ) : null}
                          <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                            시도 {item.attempts}회
                          </span>
                        </div>
                      </CardHeader>
                      <CardContent className="px-4 pb-4">
                        <p className="text-sm leading-relaxed">
                          {item.bodySnippet}
                        </p>
                        <span className="text-primary mt-2 inline-flex items-center gap-1 text-xs">
                          다시 풀기 <ArrowRightIcon className="size-3" />
                        </span>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          {oxItems.length > 0 ? (
            <section data-testid="ox-wrong-section">
              <h2 className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold tracking-tight">
                <CheckSquareIcon className="size-3.5" />
                정오문제 오답
                <span className="text-muted-foreground ml-1 tabular-nums">
                  {oxItems.length}
                </span>
              </h2>
              <div className="space-y-2">
                {oxItems.map((item) => {
                  const navTarget = item.articleNumber
                    ? `/subjects/${item.lawCode}/articles/${item.articleNumber}`
                    : `/subjects/${item.lawCode}/problems/${item.problemId}`;
                  return (
                    <Link
                      key={`${item.refType}:${item.refId}`}
                      to={navTarget}
                      viewTransition
                      className="group block"
                    >
                      <Card className="hover:border-primary transition-colors">
                        <CardHeader className="px-4 pb-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge
                              variant="default"
                              className="bg-rose-600 text-xs hover:bg-rose-600"
                            >
                              OX
                            </Badge>
                            <Badge variant="secondary" className="text-xs">
                              {LAW_SUBJECTS[item.lawCode].name}
                            </Badge>
                            {item.primaryArticleLabel ? (
                              <Badge variant="outline" className="text-xs">
                                {item.primaryArticleLabel}
                              </Badge>
                            ) : null}
                            {item.year ? (
                              <Badge variant="outline" className="text-xs">
                                {item.year}년
                                {item.problemNumber
                                  ? ` · ${item.problemNumber}번`
                                  : ""}
                              </Badge>
                            ) : null}
                            <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                              시도 {item.attempts}회
                            </span>
                          </div>
                        </CardHeader>
                        <CardContent className="px-4 pb-4">
                          <p className="text-sm leading-relaxed">
                            {item.bodySnippet}
                          </p>
                          <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                            <span>
                              내 답:{" "}
                              <span className="text-rose-600 font-bold">
                                {item.myAnswer}
                              </span>
                            </span>
                            <span>
                              정답:{" "}
                              <span className="text-foreground font-bold">
                                {item.oxTruth}
                              </span>
                            </span>
                            <span className="text-primary ml-auto inline-flex items-center gap-1">
                              {item.articleNumber ? "조문에서 다시 풀기" : "원문제 보기"}{" "}
                              <ArrowRightIcon className="size-3" />
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
