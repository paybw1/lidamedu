// feat-9-005 — 운영자 👎 메시지 큐.
// 사용자가 👎 누른 답변 목록 → 강사가 검토하여 강사 Q&A 로 에스컬레이션하거나
// 향후 eval 셋 라벨로 활용.

import { ArrowRightIcon, MessageSquareIcon, ThumbsDownIcon } from "lucide-react";
import { Link, redirect } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { getStaffRole } from "~/features/laws/queries.server";
import { listNegativeFeedback } from "~/features/ai-qna/queries.staff.server";

import type { Route } from "./+types/admin-ai-qna-feedback";

export const meta: Route.MetaFunction = () => [
  { title: "AI Q&A 부정 피드백 | 운영자" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const role = await getStaffRole(client, user.id);
  if (!role) throw redirect("/admin");
  const items = await listNegativeFeedback(client, 100);
  return { items };
}

function fmtTime(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function AdminAiQnaFeedback({
  loaderData,
}: Route.ComponentProps) {
  const { items } = loaderData;
  return (
    <AdminShell title="AI Q&A 부정 피드백" cluster="comms">
      <div className="mx-auto max-w-5xl space-y-4">
        <header className="space-y-1">
          <h1 className="inline-flex items-center gap-2 text-xl font-bold tracking-tight">
            <ThumbsDownIcon className="text-rose-600 size-5" /> 부정 피드백 큐
          </h1>
          <p className="text-muted-foreground text-sm">
            사용자가 👎 누른 답변 목록입니다. 사유·출처·질문을 함께 표시합니다.
            오답 패턴을 정리해 시스템 프롬프트 또는 콘텐츠 보강 작업으로
            연결하세요. 강사 Q&A 로 직접 답변하려면{" "}
            <Link to="/qna" className="text-primary underline-offset-4 hover:underline">
              Q&A 로 이동
            </Link>
            .
          </p>
          <div className="text-muted-foreground flex flex-wrap items-center gap-2 pt-2 text-xs">
            <Badge variant="secondary" className="tabular-nums">
              총 {items.length}건
            </Badge>
            <span>
              · 최근 100건 한정 (더 보려면 별도 export — 향후 추가)
            </span>
          </div>
        </header>

        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed py-12 text-center">
            <MessageSquareIcon className="text-muted-foreground mx-auto size-10" />
            <p className="text-muted-foreground mt-3 text-sm">
              아직 부정 피드백이 없습니다.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((it) => (
              <li
                key={it.messageId}
                className="border-border bg-card rounded-2xl border p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <Badge variant="outline" className="tabular-nums">
                    {fmtTime(it.feedbackAt ?? it.createdAt)}
                  </Badge>
                  <Badge variant="outline">
                    user {it.userId.slice(0, 8)}
                  </Badge>
                  <Badge variant="outline" className="tabular-nums">
                    출처 {it.citations.length}
                  </Badge>
                  <Link
                    to={`/qna/new?ref=${encodeURIComponent(it.precedingQuestion ?? "")}`}
                    className="text-primary ml-auto inline-flex items-center gap-1 text-[11px] underline-offset-4 hover:underline"
                  >
                    강사 Q&A 로 옮기기 <ArrowRightIcon className="size-3" />
                  </Link>
                </div>

                {it.precedingQuestion ? (
                  <div className="mt-3 space-y-1">
                    <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide">
                      질문
                    </p>
                    <p className="text-foreground text-sm leading-relaxed whitespace-pre-wrap">
                      {it.precedingQuestion.length > 400
                        ? it.precedingQuestion.slice(0, 400) + "…"
                        : it.precedingQuestion}
                    </p>
                  </div>
                ) : null}

                <div className="mt-3 space-y-1">
                  <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide">
                    AI 답변
                  </p>
                  <p className="text-foreground/90 text-sm leading-relaxed whitespace-pre-wrap">
                    {it.assistantBody.length > 600
                      ? it.assistantBody.slice(0, 600) + "…"
                      : it.assistantBody}
                  </p>
                </div>

                {it.feedbackNote ? (
                  <div className="border-rose-500/30 bg-rose-500/[0.04] mt-3 rounded-xl border p-3">
                    <p className="text-rose-700 text-[11px] font-semibold uppercase tracking-wide dark:text-rose-300">
                      사용자 사유
                    </p>
                    <p className="text-foreground mt-1 text-sm leading-relaxed whitespace-pre-wrap">
                      {it.feedbackNote}
                    </p>
                  </div>
                ) : (
                  <p className="text-muted-foreground mt-3 text-[11px]">
                    (사유 미입력)
                  </p>
                )}

                {it.citations.length > 0 ? (
                  <div className="border-border/60 mt-3 flex flex-wrap gap-1 border-t pt-2 text-[11px]">
                    {it.citations.map((c) => (
                      <Badge
                        key={`${c.label}-${c.chunkId}`}
                        variant="outline"
                        className="font-normal"
                      >
                        [{c.label}] {c.headingPath || c.sourceType}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminShell>
  );
}
