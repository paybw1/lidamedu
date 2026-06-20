// feat-9-005 v1.1 — AI Q&A eval 데이터셋 list + 인라인 archive/restore.
// 신규 추가는 /admin/ai-qna/eval/new (별도 파일).

import {
  ArchiveIcon,
  BookmarkIcon,
  PlayIcon,
  PlusIcon,
  RotateCcwIcon,
} from "lucide-react";
import { Form, Link, data, redirect, useNavigation } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { runSingleEval } from "~/features/ai-qna/lib/eval-runner.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  getLastRunsForItems,
  listEvalItems,
  setEvalItemStatus,
} from "~/features/ai-qna/queries.staff.server";

import type { Route } from "./+types/admin-ai-qna-eval";

export const meta: Route.MetaFunction = () => [
  { title: "AI Q&A eval 셋 | 운영자" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const role = await getStaffRole(client, user.id);
  if (!role) throw redirect("/admin");

  const url = new URL(request.url);
  const status = url.searchParams.get("status") === "archived" ? "archived" : "active";
  const lawCode = url.searchParams.get("lawCode") ?? undefined;
  const search = url.searchParams.get("q") ?? undefined;

  const items = await listEvalItems({
    status,
    lawCode,
    search,
    limit: 200,
  });
  const lastRuns = await getLastRunsForItems(items.map((i) => i.evalItemId));
  const itemsWithLast = items.map((i) => ({
    ...i,
    lastRun: lastRuns.get(i.evalItemId) ?? null,
  }));
  return { items: itemsWithLast, filter: { status, lawCode, search } };
}

export async function action({ request }: Route.ActionArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) return data({ error: "Forbidden" }, { status: 403 });

  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "");
  if (intent === "archive" || intent === "restore") {
    const evalItemId = String(fd.get("evalItemId") ?? "");
    if (!evalItemId)
      return data({ error: "evalItemId 필수" }, { status: 400 });
    const res = await setEvalItemStatus(
      evalItemId,
      intent === "archive" ? "archived" : "active",
    );
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true });
  }
  if (intent === "run") {
    const evalItemId = String(fd.get("evalItemId") ?? "");
    if (!evalItemId)
      return data({ error: "evalItemId 필수" }, { status: 400 });
    if (!process.env.ANTHROPIC_API_KEY || !process.env.VOYAGE_API_KEY) {
      return data(
        { error: "ANTHROPIC_API_KEY 또는 VOYAGE_API_KEY 미설정" },
        { status: 503 },
      );
    }
    try {
      const r = await runSingleEval(evalItemId, { triggeredBy: user.id });
      return data({
        ok: true,
        runId: r.runId,
        score: r.score,
        verdict: r.verdict,
      });
    } catch (e) {
      return data(
        { error: e instanceof Error ? e.message : String(e) },
        { status: 500 },
      );
    }
  }
  return data({ error: "Unknown intent" }, { status: 400 });
}

const LAW_OPTIONS = [
  { code: "patent", label: "특허" },
  { code: "trademark", label: "상표" },
  { code: "design", label: "디자인" },
  { code: "civil", label: "민법" },
  { code: "civil-procedure", label: "민소" },
];

export default function AdminAiQnaEval({ loaderData }: Route.ComponentProps) {
  const { items, filter } = loaderData;
  const navigation = useNavigation();
  const submitting = navigation.state !== "idle";

  return (
    <AdminShell title="AI Q&A eval 셋" cluster="comms">
      <div className="mx-auto max-w-5xl space-y-4">
        <header className="space-y-1">
          <h1 className="inline-flex items-center gap-2 text-xl font-bold tracking-tight">
            <BookmarkIcon className="text-link size-5" />
            eval 데이터셋
          </h1>
          <p className="text-muted-foreground text-sm">
            강사가 라벨링한 골드 정답 셋. 자동 평가 cron(v1.2) 의 입력.{" "}
            <Link
              to="/admin/ai-qna/feedback"
              className="text-link underline-offset-4 hover:underline"
            >
              부정 피드백 큐
            </Link>{" "}
            의 👎 케이스를 그대로 eval 항목으로 승격할 수 있습니다.
          </p>
        </header>

        {/* 필터 + 신규 */}
        <Form
          method="get"
          className="border-border bg-card flex flex-wrap items-center gap-2 rounded-2xl border p-3 shadow-sm"
        >
          <div className="flex items-center gap-1.5 text-xs">
            <Link
              to="/admin/ai-qna/eval"
              className={
                filter.status === "active"
                  ? "rounded-full bg-primary px-3 py-1 text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground px-3 py-1"
              }
            >
              활성
            </Link>
            <Link
              to="/admin/ai-qna/eval?status=archived"
              className={
                filter.status === "archived"
                  ? "rounded-full bg-primary px-3 py-1 text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground px-3 py-1"
              }
            >
              아카이브
            </Link>
          </div>
          <select
            name="lawCode"
            defaultValue={filter.lawCode ?? ""}
            className="border-input bg-background h-8 rounded-md border px-2 text-xs"
          >
            <option value="">전체 과목</option>
            {LAW_OPTIONS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
          <Input
            name="q"
            placeholder="질문/답변 검색"
            defaultValue={filter.search ?? ""}
            className="h-8 flex-1 text-xs"
          />
          <input type="hidden" name="status" value={filter.status} />
          <Button type="submit" size="sm" variant="outline" className="h-8 rounded-full text-xs">
            필터 적용
          </Button>
          <Button asChild size="sm" className="ml-auto h-8 rounded-full text-xs">
            <Link to="/admin/ai-qna/eval/new">
              <PlusIcon className="size-3.5" /> 신규
            </Link>
          </Button>
        </Form>

        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed py-12 text-center">
            <BookmarkIcon className="text-muted-foreground mx-auto size-10" />
            <p className="text-muted-foreground mt-3 text-sm">
              아직 eval 항목이 없습니다.
              <br />
              부정 피드백 큐에서 "eval 로 승격" 또는 신규 추가로 시작하세요.
            </p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {items.map((it) => (
              <li
                key={it.evalItemId}
                className="border-border bg-card rounded-2xl border p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <Badge variant="outline" className="tabular-nums">
                    난이도 {it.difficulty}/5
                  </Badge>
                  {it.lawCodes.map((c) => (
                    <Badge key={c} variant="secondary">
                      {LAW_OPTIONS.find((l) => l.code === c)?.label ?? c}
                    </Badge>
                  ))}
                  {it.tags.map((t) => (
                    <Badge key={t} variant="outline" className="font-normal">
                      #{t}
                    </Badge>
                  ))}
                  {it.sourceMessageId ? (
                    <Badge variant="outline" className="text-[10px]">
                      👎 승격
                    </Badge>
                  ) : null}
                  <span className="text-muted-foreground ml-auto tabular-nums">
                    {it.createdAt.slice(0, 10)}
                  </span>
                </div>
                <p className="text-foreground mt-3 text-sm font-semibold leading-snug">
                  Q. {it.question.length > 200 ? it.question.slice(0, 200) + "…" : it.question}
                </p>
                <p className="text-foreground/80 mt-2 line-clamp-3 text-sm leading-relaxed">
                  A. {it.referenceAnswer}
                </p>
                {it.notes ? (
                  <p className="text-muted-foreground mt-2 text-xs italic">
                    메모: {it.notes}
                  </p>
                ) : null}
                {it.lastRun ? (
                  <div className="border-border/60 mt-3 flex items-center gap-2 border-t pt-2 text-[11px]">
                    <span className="text-muted-foreground">최근 평가:</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "tabular-nums",
                        it.lastRun.judgeVerdict === "pass"
                          ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                          : it.lastRun.judgeVerdict === "partial"
                            ? "border-amber-500/40 text-amber-700 dark:text-amber-300"
                            : "border-rose-500/40 text-rose-700 dark:text-rose-300",
                      )}
                    >
                      {it.lastRun.judgeScore}/5 · {it.lastRun.judgeVerdict}
                    </Badge>
                    <span className="text-muted-foreground tabular-nums">
                      {it.lastRun.createdAt.slice(0, 16).replace("T", " ")}
                    </span>
                    <Link
                      to={`/admin/ai-qna/eval/${it.evalItemId}/runs`}
                      className="text-link ml-auto underline-offset-4 hover:underline"
                    >
                      이력 →
                    </Link>
                  </div>
                ) : (
                  <p className="text-muted-foreground border-border/60 mt-3 border-t pt-2 text-[11px]">
                    아직 평가 이력 없음.
                  </p>
                )}

                <div className="mt-3 flex gap-2">
                  <Form method="post">
                    <input type="hidden" name="intent" value="run" />
                    <input type="hidden" name="evalItemId" value={it.evalItemId} />
                    <Button
                      type="submit"
                      size="sm"
                      variant="default"
                      disabled={submitting || it.status !== "active"}
                      className="h-7 rounded-full px-3 text-xs"
                      title={
                        it.status !== "active"
                          ? "아카이브 항목은 평가 불가"
                          : "지금 한 번 평가 (RAG → 답변 → judge)"
                      }
                    >
                      <PlayIcon className="size-3" /> 지금 평가
                    </Button>
                  </Form>
                  <Button
                    asChild
                    size="sm"
                    variant="outline"
                    className="h-7 rounded-full px-3 text-xs"
                  >
                    <Link to={`/admin/ai-qna/eval/${it.evalItemId}`}>편집</Link>
                  </Button>
                  <Form method="post">
                    <input
                      type="hidden"
                      name="intent"
                      value={it.status === "active" ? "archive" : "restore"}
                    />
                    <input type="hidden" name="evalItemId" value={it.evalItemId} />
                    <Button
                      type="submit"
                      size="sm"
                      variant="ghost"
                      disabled={submitting}
                      className="h-7 rounded-full px-3 text-xs"
                    >
                      {it.status === "active" ? (
                        <>
                          <ArchiveIcon className="size-3" /> 아카이브
                        </>
                      ) : (
                        <>
                          <RotateCcwIcon className="size-3" /> 복원
                        </>
                      )}
                    </Button>
                  </Form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminShell>
  );
}
