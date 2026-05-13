// feat-7-021 — 과제 편집 + 학생 진척 (운영자).

import {
  ArrowLeftIcon,
  CalendarIcon,
  CheckCircle2Icon,
  ClipboardListIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  Link,
  data,
  useFetcher,
  useLocation,
  useNavigate,
} from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import { Separator } from "~/core/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/core/components/ui/table";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  getAssignmentWithItems,
  listAssignmentProgress,
} from "~/features/assignments/queries.server";
import {
  ASSIGNMENT_ITEM_KINDS,
  ASSIGNMENT_ITEM_KIND_LABEL,
  ASSIGNMENT_STATUS_LABEL,
  type AssignmentDetail,
  type AssignmentItem,
  type AssignmentItemKind,
  type AssignmentStatus,
  type MemberAssignmentProgress,
} from "~/features/assignments/labels";
import { getCohortById } from "~/features/cohorts/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/admin-assignment-edit";

export const meta: Route.MetaFunction = ({ data: d }) => {
  if (!d || !d.assignment) return [{ title: "과제 | Lidam Edu" }];
  return [{ title: `${d.assignment.title} | Lidam Edu` }];
};

export async function loader({ params, request }: Route.LoaderArgs) {
  if (!params.cohortId || !params.assignmentId)
    throw data("Missing params", { status: 404 });
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const cohort = await getCohortById(client, params.cohortId);
  if (!cohort) throw data("Cohort not found", { status: 404 });
  if (role !== "admin" && cohort.ownerId !== user.id) {
    throw data("본인 소유 반만 접근 가능", { status: 403 });
  }

  const assignment = await getAssignmentWithItems(params.assignmentId);
  if (!assignment) throw data("Assignment not found", { status: 404 });
  if (assignment.cohortId !== params.cohortId) {
    throw data("cohort 불일치", { status: 400 });
  }

  const progress = await listAssignmentProgress(params.assignmentId);
  return { cohort, assignment, progress };
}

const STATUS_TONE: Record<AssignmentStatus, string> = {
  pending: "text-muted-foreground",
  partial: "text-amber-600 dark:text-amber-400",
  completed: "text-emerald-600 dark:text-emerald-400",
};

function useReload() {
  const navigate = useNavigate();
  const location = useLocation();
  return () =>
    navigate(location.pathname + location.search, {
      replace: true,
      preventScrollReset: true,
    });
}

export default function AdminAssignmentEdit({
  loaderData,
}: Route.ComponentProps) {
  const { cohort, assignment, progress } = loaderData;
  const navigate = useNavigate();
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  useEffect(() => {
    // delete 응답이 ok 면 목록으로. 그 외 intent (예: update) 는 reload 가 알아서.
    if (
      fetcher.state === "idle" &&
      fetcher.data &&
      "ok" in fetcher.data &&
      fetcher.data.ok
    ) {
      // 단순히 새로 fetch — delete 의 경우 row 가 없어져 404 처리는 라우터가
      navigate(`/admin/cohorts/${cohort.cohortId}/assignments`);
    }
  }, [fetcher.state, fetcher.data, navigate, cohort.cohortId]);

  return (
    <div className="mx-auto w-full max-w-screen-xl px-5 py-6 md:px-10 md:py-8">
      <Link
        to={`/admin/cohorts/${cohort.cohortId}/assignments`}
        className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-xs"
      >
        <ArrowLeftIcon className="size-3" /> 과제 목록
      </Link>

      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="inline-flex items-center gap-2 text-2xl font-bold tracking-tight">
            <ClipboardListIcon className="text-primary size-6" />
            {assignment.title}
          </h1>
          <p className="text-muted-foreground inline-flex items-center gap-2 text-xs">
            <CalendarIcon className="size-3" />
            마감 {assignment.dueAt.slice(0, 16).replace("T", " ")}
            <span>·</span>
            <UsersIcon className="size-3" />
            {assignment.completedMembers}/{assignment.totalMembers} 완수
          </p>
          {assignment.descriptionMd ? (
            <p className="text-muted-foreground mt-1 text-sm whitespace-pre-line">
              {assignment.descriptionMd}
            </p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <fetcher.Form method="post" action="/api/admin/assignment">
            <input type="hidden" name="intent" value="delete" />
            <input type="hidden" name="assignmentId" value={assignment.assignmentId} />
            <Button
              type="submit"
              size="sm"
              variant="ghost"
              className="text-rose-600 hover:text-rose-700"
              onClick={(e) => {
                if (!confirm(`"${assignment.title}" 을(를) 삭제(soft)합니까?`)) {
                  e.preventDefault();
                }
              }}
              disabled={fetcher.state !== "idle"}
            >
              <Trash2Icon className="size-3.5" /> 삭제
            </Button>
          </fetcher.Form>
        </div>
      </header>

      <AssignmentMetaForm assignment={assignment} />

      <Separator className="my-6" />

      <section className="mb-6 space-y-3">
        <h2 className="text-lg font-semibold">학습 항목 ({assignment.items.length})</h2>
        {assignment.items.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            항목이 없습니다. 아래에서 추가하세요.
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {assignment.items.map((item) => (
              <ItemRow key={item.itemId} item={item} />
            ))}
          </ul>
        )}
        <NewItemForm
          assignmentId={assignment.assignmentId}
          nextOrd={assignment.items.length}
        />
      </section>

      <Separator className="my-6" />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">학생별 진척 ({progress.length}명)</h2>
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <Table className="min-w-[600px]">
              <TableHeader>
                <TableRow>
                  <TableHead>학생</TableHead>
                  <TableHead className="w-20 text-xs">상태</TableHead>
                  <TableHead className="w-24 text-right">진척</TableHead>
                  <TableHead className="w-32 text-right">완수 시각</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {progress.map((m) => (
                  <TableRow key={m.profileId}>
                    <TableCell>
                      <Link
                        to={`/admin/students/${m.profileId}`}
                        viewTransition
                        className="hover:text-primary text-sm font-medium"
                      >
                        {m.name}
                      </Link>
                      {m.email ? (
                        <p className="text-muted-foreground text-[10px]">
                          {m.email}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          m.status === "completed"
                            ? "default"
                            : m.status === "partial"
                              ? "secondary"
                              : "outline"
                        }
                        className={cn("text-[10px]", STATUS_TONE[m.status])}
                      >
                        {m.status === "completed" ? (
                          <CheckCircle2Icon className="size-3" />
                        ) : null}
                        {ASSIGNMENT_STATUS_LABEL[m.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {m.completedItems}/{m.totalItems}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {m.completedAt
                        ? m.completedAt.slice(0, 16).replace("T", " ")
                        : "—"}
                    </TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function AssignmentMetaForm({ assignment }: { assignment: AssignmentDetail }) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const reload = useReload();
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data &&
      "ok" in fetcher.data &&
      fetcher.data.ok
    ) {
      setEditing(false);
      reload();
    }
  }, [fetcher.state, fetcher.data, reload]);

  if (!editing) {
    return (
      <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
        <PencilIcon className="size-3.5" /> 메타 편집
      </Button>
    );
  }

  return (
    <fetcher.Form
      method="post"
      action="/api/admin/assignment"
      className="bg-card mt-2 space-y-2 rounded-md border p-4"
    >
      <input type="hidden" name="intent" value="update" />
      <input type="hidden" name="assignmentId" value={assignment.assignmentId} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_200px]">
        <div>
          <Label className="text-muted-foreground text-[11px]">제목</Label>
          <Input
            name="title"
            defaultValue={assignment.title}
            required
            maxLength={200}
            className="mt-1 h-8 text-xs"
          />
        </div>
        <div>
          <Label className="text-muted-foreground text-[11px]">마감</Label>
          <Input
            name="dueAt"
            type="datetime-local"
            defaultValue={assignment.dueAt.slice(0, 16)}
            className="mt-1 h-8 text-xs tabular-nums"
          />
        </div>
      </div>
      <div>
        <Label className="text-muted-foreground text-[11px]">설명</Label>
        <textarea
          name="descriptionMd"
          defaultValue={assignment.descriptionMd ?? ""}
          rows={3}
          maxLength={4000}
          className="border-input bg-background mt-1 w-full rounded-md border px-2 py-1 text-xs"
        />
      </div>
      {fetcher.data && "error" in fetcher.data ? (
        <p className="text-rose-600 text-xs">{fetcher.data.error}</p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setEditing(false)}
        >
          <XIcon className="size-3.5" /> 취소
        </Button>
        <Button type="submit" size="sm" disabled={fetcher.state !== "idle"}>
          저장
        </Button>
      </div>
    </fetcher.Form>
  );
}

function ItemRow({ item }: { item: AssignmentItem }) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const reload = useReload();
  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data &&
      "ok" in fetcher.data &&
      fetcher.data.ok
    ) {
      reload();
    }
  }, [fetcher.state, fetcher.data, reload]);
  const refLabel =
    item.kind === "article_read" || item.kind === "recitation"
      ? (item.articleLabel ?? item.articleId ?? "—")
      : item.kind === "case_read"
        ? (item.caseTitle ?? item.caseId ?? "—")
        : item.kind === "problem"
          ? (item.problemSnippet ?? item.problemId ?? "—")
          : (item.blankSetLabel ?? item.blankSetId ?? "—");
  return (
    <li className="flex items-center gap-2 px-3 py-2">
      <span className="text-muted-foreground w-6 text-center text-xs tabular-nums">
        {item.ord + 1}
      </span>
      <Badge variant="outline" className="w-20 justify-center text-[10px]">
        {ASSIGNMENT_ITEM_KIND_LABEL[item.kind]}
      </Badge>
      <div className="min-w-0 flex-1 truncate text-xs">{refLabel}</div>
      {item.targetQuantity ? (
        <Badge variant="secondary" className="text-[10px]">
          x{item.targetQuantity}
        </Badge>
      ) : null}
      {item.note ? (
        <span className="text-muted-foreground truncate text-[10px] italic">
          {item.note}
        </span>
      ) : null}
      <fetcher.Form method="post" action="/api/admin/assignment">
        <input type="hidden" name="intent" value="delete_item" />
        <input type="hidden" name="itemId" value={item.itemId} />
        <Button
          type="submit"
          size="icon"
          variant="ghost"
          className="size-6 text-rose-600 hover:text-rose-700"
          onClick={(e) => {
            if (!confirm("이 항목을 삭제합니까?")) {
              e.preventDefault();
            }
          }}
          disabled={fetcher.state !== "idle"}
        >
          <Trash2Icon className="size-3" />
        </Button>
      </fetcher.Form>
    </li>
  );
}

function NewItemForm({
  assignmentId,
  nextOrd,
}: {
  assignmentId: string;
  nextOrd: number;
}) {
  const [kind, setKind] = useState<AssignmentItemKind>("article_read");
  const [open, setOpen] = useState(false);
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const reload = useReload();
  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data &&
      "ok" in fetcher.data &&
      fetcher.data.ok
    ) {
      setOpen(false);
      reload();
    }
  }, [fetcher.state, fetcher.data, reload]);
  if (!open) {
    return (
      <Button
        size="sm"
        variant="outline"
        className="w-full"
        onClick={() => setOpen(true)}
      >
        <PlusIcon className="size-3.5" /> 항목 추가
      </Button>
    );
  }
  return (
    <fetcher.Form
      method="post"
      action="/api/admin/assignment"
      className="bg-muted/30 space-y-2 rounded-md border p-3"
    >
      <input type="hidden" name="intent" value="upsert_item" />
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <input type="hidden" name="ord" value={nextOrd} />
      <div className="grid grid-cols-[140px_1fr] gap-2">
        <select
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as AssignmentItemKind)}
          className="border-input bg-background h-8 rounded-md border px-2 text-xs"
        >
          {ASSIGNMENT_ITEM_KINDS.map((k) => (
            <option key={k} value={k}>
              {ASSIGNMENT_ITEM_KIND_LABEL[k]}
            </option>
          ))}
        </select>
        <Input
          name={
            kind === "case_read"
              ? "caseId"
              : kind === "problem"
                ? "problemId"
                : kind === "blank_set"
                  ? "blankSetId"
                  : "articleId"
          }
          placeholder={`${ASSIGNMENT_ITEM_KIND_LABEL[kind]} UUID (다른 화면에서 복사)`}
          required
          className="h-8 text-xs"
        />
      </div>
      <div className="grid grid-cols-[100px_1fr] gap-2">
        <Input
          name="targetQuantity"
          type="number"
          min={0}
          placeholder="횟수 (선택)"
          className="h-8 text-xs tabular-nums"
        />
        <Input
          name="note"
          placeholder="메모 (선택)"
          maxLength={2000}
          className="h-8 text-xs"
        />
      </div>
      {fetcher.data && "error" in fetcher.data ? (
        <p className="text-rose-600 text-xs">{fetcher.data.error}</p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setOpen(false)}
        >
          취소
        </Button>
        <Button type="submit" size="sm" disabled={fetcher.state !== "idle"}>
          추가
        </Button>
      </div>
    </fetcher.Form>
  );
}
