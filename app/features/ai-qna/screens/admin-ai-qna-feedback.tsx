// feat-9-005 — 운영자 👎 메시지 큐.
// 사용자가 👎 누른 답변 목록 → 강사가 검토하여 강사 Q&A 로 에스컬레이션하거나
// 향후 eval 셋 라벨로 활용.

import {
  ArrowRightIcon,
  CheckCircleIcon,
  CircleSlashIcon,
  ClockIcon,
  MessageSquareIcon,
  SendIcon,
  ThumbsDownIcon,
} from "lucide-react";
import { Form, Link, data, redirect, useNavigation } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  listNegativeFeedback,
  setMessageReviewStatus,
  type ReviewStatus,
} from "~/features/ai-qna/queries.staff.server";

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

  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status");
  const reviewStatus: ReviewStatus | "all" =
    statusParam === "reviewed" ||
    statusParam === "escalated" ||
    statusParam === "dismissed" ||
    statusParam === "all"
      ? statusParam
      : "pending";

  const items = await listNegativeFeedback({ reviewStatus, limit: 100 });
  return { items, reviewStatus };
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
  if (intent === "set_review_status") {
    const messageId = String(fd.get("messageId") ?? "");
    const next = String(fd.get("next") ?? "");
    if (
      next !== "pending" &&
      next !== "reviewed" &&
      next !== "escalated" &&
      next !== "dismissed"
    ) {
      return data({ error: "next 잘못됨" }, { status: 400 });
    }
    if (!messageId)
      return data({ error: "messageId 필수" }, { status: 400 });
    const res = await setMessageReviewStatus(messageId, next, user.id);
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true });
  }
  return data({ error: "Unknown intent" }, { status: 400 });
}

function fmtTime(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const STATUS_TABS: { value: ReviewStatus | "all"; label: string }[] = [
  { value: "pending", label: "검토 대기" },
  { value: "reviewed", label: "검토 완료" },
  { value: "escalated", label: "강사 Q&A 이관" },
  { value: "dismissed", label: "무효" },
  { value: "all", label: "전체" },
];

const NEXT_STATUS_BUTTONS: Array<{
  status: Exclude<ReviewStatus, "pending">;
  label: string;
  Icon: typeof CheckCircleIcon;
}> = [
  { status: "reviewed", label: "검토 완료", Icon: CheckCircleIcon },
  { status: "escalated", label: "Q&A 이관", Icon: SendIcon },
  { status: "dismissed", label: "무효", Icon: CircleSlashIcon },
];

export default function AdminAiQnaFeedback({
  loaderData,
}: Route.ComponentProps) {
  const { items, reviewStatus } = loaderData;
  const navigation = useNavigation();
  const submitting = navigation.state !== "idle";
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
            <Link to="/qna" className="text-link underline-offset-4 hover:underline">
              Q&A 로 이동
            </Link>
            .
          </p>
          <div className="text-muted-foreground flex flex-wrap items-center gap-2 pt-2 text-xs">
            <Badge variant="secondary" className="tabular-nums">
              총 {items.length}건
            </Badge>
            <span>· 최근 100건 한정</span>
          </div>
        </header>

        {/* 검토 상태 탭 */}
        <nav className="flex flex-wrap gap-1.5">
          {STATUS_TABS.map((t) => (
            <Link
              key={t.value}
              to={`/admin/ai-qna/feedback?status=${t.value}`}
              className={cn(
                "rounded-full px-3 py-1 text-xs transition-colors",
                reviewStatus === t.value
                  ? "bg-primary text-primary-foreground"
                  : "border-border bg-card hover:bg-muted border",
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>

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
                  <ReviewStatusBadge status={it.reviewStatus} />
                  <Link
                    to={`/admin/ai-qna/eval/new?fromMessage=${it.messageId}`}
                    className="text-link ml-auto inline-flex items-center gap-1 text-[11px] underline-offset-4 hover:underline"
                  >
                    eval 로 승격 <ArrowRightIcon className="size-3" />
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

                {/* 검토 상태 전환 버튼들 */}
                <div className="border-border/60 mt-3 flex flex-wrap items-center gap-1.5 border-t pt-2">
                  <span className="text-muted-foreground text-[11px]">검토:</span>
                  {NEXT_STATUS_BUTTONS.map((b) => {
                    const isCurrent = it.reviewStatus === b.status;
                    const next = isCurrent ? "pending" : b.status;
                    return (
                      <Form key={b.status} method="post">
                        <input type="hidden" name="intent" value="set_review_status" />
                        <input type="hidden" name="messageId" value={it.messageId} />
                        <input type="hidden" name="next" value={next} />
                        <Button
                          type="submit"
                          size="sm"
                          variant={isCurrent ? "default" : "outline"}
                          disabled={submitting}
                          className="h-7 rounded-full px-2.5 text-[11px]"
                          title={
                            isCurrent ? "다시 검토 대기로" : `${b.label} 로 표시`
                          }
                        >
                          <b.Icon className="size-3" /> {b.label}
                        </Button>
                      </Form>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminShell>
  );
}

function ReviewStatusBadge({ status }: { status: ReviewStatus }) {
  if (status === "pending")
    return (
      <Badge
        variant="outline"
        className="border-amber-500/40 text-amber-700 dark:text-amber-300"
      >
        <ClockIcon className="size-3" /> 검토 대기
      </Badge>
    );
  if (status === "reviewed")
    return (
      <Badge
        variant="outline"
        className="border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
      >
        <CheckCircleIcon className="size-3" /> 검토 완료
      </Badge>
    );
  if (status === "escalated")
    return (
      <Badge variant="outline">
        <SendIcon className="size-3" /> 강사 Q&A 이관
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-muted-foreground">
      <CircleSlashIcon className="size-3" /> 무효
    </Badge>
  );
}
