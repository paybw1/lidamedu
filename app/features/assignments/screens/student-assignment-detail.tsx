// feat-7-021 — 학생 본인 과제 상세 (자동 완수 표시).

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CalendarIcon,
  CheckCircle2Icon,
  CircleIcon,
  ClipboardListIcon,
  RefreshCwIcon,
} from "lucide-react";
import { Link, data, useNavigate, useLocation } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent } from "~/core/components/ui/card";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { getStudentAssignment } from "~/features/assignments/queries.server";
import {
  ASSIGNMENT_ITEM_KIND_LABEL,
  ASSIGNMENT_STATUS_LABEL,
  type AssignmentStatus,
} from "~/features/assignments/labels";

import type { Route } from "./+types/student-assignment-detail";

export const meta: Route.MetaFunction = ({ data: d }) => {
  if (!d) return [{ title: "과제 | Lidam Patent Attorney Academy" }];
  return [{ title: `${d.detail.title} | Lidam Patent Attorney Academy` }];
};

export async function loader({ params, request }: Route.LoaderArgs) {
  if (!params.assignmentId) throw data("Missing assignmentId", { status: 404 });
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const res = await getStudentAssignment(params.assignmentId, user.id);
  if (!res) throw data("과제를 찾을 수 없거나 접근 권한이 없습니다", { status: 404 });
  return res;
}

const STATUS_TONE: Record<AssignmentStatus, string> = {
  pending: "text-muted-foreground",
  partial: "text-amber-600 dark:text-amber-400",
  completed: "text-emerald-600 dark:text-emerald-400",
};

export default function StudentAssignmentDetail({
  loaderData,
}: Route.ComponentProps) {
  const { detail, submission } = loaderData;
  const navigate = useNavigate();
  const location = useLocation();
  const status: AssignmentStatus = submission?.status ?? "pending";
  const pct =
    submission && submission.totalItems > 0
      ? Math.round((submission.completedItems / submission.totalItems) * 100)
      : 0;
  const overdue =
    new Date(detail.dueAt).getTime() < Date.now() && status !== "completed";

  return (
    <div className="mx-auto w-full max-w-screen-lg px-5 py-6 md:px-10 md:py-8">
      <Link
        to="/assignments"
        className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-xs"
      >
        <ArrowLeftIcon className="size-3" /> 내 과제
      </Link>

      <header className="mb-4 space-y-2">
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
          <ClipboardListIcon className="size-3.5" /> 과제
        </p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold tracking-tight">{detail.title}</h1>
          <Badge
            variant={
              status === "completed"
                ? "default"
                : status === "partial"
                  ? "secondary"
                  : "outline"
            }
            className={cn("text-[10px]", STATUS_TONE[status])}
          >
            {status === "completed" ? <CheckCircle2Icon className="size-3" /> : null}
            {ASSIGNMENT_STATUS_LABEL[status]}
          </Badge>
        </div>
        {detail.descriptionMd ? (
          <p className="text-muted-foreground text-sm whitespace-pre-line">
            {detail.descriptionMd}
          </p>
        ) : null}
        <p className="text-muted-foreground inline-flex items-center gap-2 text-xs tabular-nums">
          <CalendarIcon className="size-3" />
          마감 {detail.dueAt.slice(0, 16).replace("T", " ")}
          {overdue ? (
            <span className="text-rose-600 dark:text-rose-400">(지남)</span>
          ) : null}
          <span>·</span>
          진척 {submission?.completedItems ?? 0}/
          {submission?.totalItems ?? detail.items.length} ({pct}%)
        </p>
        <div className="bg-muted/40 relative h-2 overflow-hidden rounded">
          <div
            className={cn(
              "absolute inset-y-0 left-0 transition-all",
              status === "completed"
                ? "bg-emerald-500"
                : status === "partial"
                  ? "bg-amber-500"
                  : "bg-muted-foreground/40",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              navigate(location.pathname + location.search, {
                replace: true,
                preventScrollReset: true,
              })
            }
          >
            <RefreshCwIcon className="size-3.5" /> 자동 완수 재확인
          </Button>
        </div>
      </header>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">학습 항목</h2>
        {detail.items.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            아직 항목이 등록되지 않았습니다.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {detail.items.map((item) => (
              <ItemCard key={item.itemId} item={item} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ItemCard({
  item,
}: {
  item: Awaited<
    ReturnType<typeof import("../queries.server").getStudentAssignment>
  > extends infer X
    ? X extends { detail: { items: Array<infer I> } }
      ? I
      : never
    : never;
}) {
  const refLabel =
    item.kind === "article_read" || item.kind === "recitation"
      ? (item.articleLabel ?? "(조문)")
      : item.kind === "case_read"
        ? (item.caseTitle ?? "(판례)")
        : item.kind === "problem"
          ? (item.problemSnippet ?? "(문제)")
          : (item.blankSetLabel ?? "(빈칸 세트)");

  const inner = (
    <Card
      className={cn(
        "transition-colors",
        item.entryUrl ? "hover:border-primary" : "",
      )}
    >
      <CardContent className="flex items-center gap-3 px-4 py-3">
        <CircleIcon className="text-muted-foreground size-4" />
        <Badge variant="outline" className="w-20 justify-center text-[10px]">
          {ASSIGNMENT_ITEM_KIND_LABEL[item.kind]}
        </Badge>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-1 text-sm">{refLabel}</p>
          {item.note ? (
            <p className="text-muted-foreground text-[10px] italic">
              {item.note}
            </p>
          ) : null}
        </div>
        {item.targetQuantity ? (
          <Badge variant="secondary" className="text-[10px]">
            x{item.targetQuantity}
          </Badge>
        ) : null}
        {item.entryUrl ? (
          <span className="text-primary inline-flex items-center gap-1 text-xs">
            학습하러 가기 <ArrowRightIcon className="size-3" />
          </span>
        ) : null}
      </CardContent>
    </Card>
  );

  return (
    <li>
      {item.entryUrl ? (
        <Link to={item.entryUrl} viewTransition className="block">
          {inner}
        </Link>
      ) : (
        inner
      )}
    </li>
  );
}
