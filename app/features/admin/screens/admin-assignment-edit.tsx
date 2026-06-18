// feat-7-021 — 과제 편집 + 학생 진척 (운영자).

import {
  CalendarIcon,
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

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import { Separator } from "~/core/components/ui/separator";
import makeServerClient from "~/core/lib/supa-client.server";
import { ContentPicker } from "~/features/admin/components/content-picker";
import { AdminShell } from "~/features/admin/components/admin-shell";
import {
  Chip,
  IndexTable,
  StatusChip,
  TD,
  TR,
} from "~/features/admin/components/admin-ui";
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
import { roleAtLeast } from "~/core/lib/roles";

import type { Route } from "./+types/admin-assignment-edit";

export const meta: Route.MetaFunction = ({ data: d }) => {
  if (!d || !d.assignment) return [{ title: "과제 | Lidam Patent Attorney Academy" }];
  return [{ title: `${d.assignment.title} | Lidam Patent Attorney Academy` }];
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
  if (!roleAtLeast(role, "manager") && cohort.ownerId !== user.id) {
    throw data("본인 소유 반만 접근 가능", { status: 403 });
  }

  const assignment = await getAssignmentWithItems(params.assignmentId);
  if (!assignment) throw data("Assignment not found", { status: 404 });
  if (assignment.cohortId !== params.cohortId) {
    throw data("cohort 불일치", { status: 400 });
  }

  const progress = await listAssignmentProgress(params.assignmentId);
  return { cohort, assignment, progress, role };
}

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
  const { cohort, assignment, progress, role } = loaderData;
  const navigate = useNavigate();
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data &&
      "ok" in fetcher.data &&
      fetcher.data.ok
    ) {
      navigate(`/admin/cohorts/${cohort.cohortId}/assignments`);
    }
  }, [fetcher.state, fetcher.data, navigate, cohort.cohortId]);

  const completePct =
    (assignment.totalMembers ?? 0) > 0
      ? Math.round(
          ((assignment.completedMembers ?? 0) / (assignment.totalMembers as number)) * 100,
        )
      : 0;

  return (
    <AdminShell
      cluster="cohorts"
      role={role}
      width={960}
      title={assignment.title}
      desc={`마감 ${assignment.dueAt.slice(0, 16).replace("T", " ")} · ${assignment.completedMembers}/${assignment.totalMembers} 완수`}
      headerRight={
        <fetcher.Form method="post" action="/api/admin/assignment">
          <input type="hidden" name="intent" value="delete" />
          <input type="hidden" name="assignmentId" value={assignment.assignmentId} />
          <Button
            type="submit"
            size="sm"
            variant="outline"
            className="border-rose-300 text-rose-600 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-950/20"
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
      }
    >
      <Link
        to={`/admin/cohorts/${cohort.cohortId}/assignments`}
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-xs"
      >
        ← 과제 목록
      </Link>

      {/* 진척 요약 칩 */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Chip tone="neutral">
          <CalendarIcon className="size-3" />
          마감 {assignment.dueAt.slice(0, 10)}
        </Chip>
        <Chip tone="neutral">
          <UsersIcon className="size-3" />
          {assignment.completedMembers}/{assignment.totalMembers} 완수 ({completePct}%)
        </Chip>
        {assignment.descriptionMd ? (
          <p className="text-muted-foreground w-full text-xs whitespace-pre-line">
            {assignment.descriptionMd}
          </p>
        ) : null}
      </div>

      <AssignmentMetaForm assignment={assignment} />

      <Separator className="my-6" />

      {/* 학습 항목 */}
      <section className="mb-6 space-y-3">
        <h2 className="text-base font-semibold">
          학습 항목 ({assignment.items.length})
        </h2>
        {assignment.items.length === 0 ? (
          <div className="border-border bg-card rounded-xl border py-10 text-center">
            <ClipboardListIcon className="text-muted-foreground mx-auto mb-2 size-6 opacity-40" />
            <p className="text-muted-foreground text-xs">
              항목이 없습니다. 아래에서 추가하세요.
            </p>
          </div>
        ) : (
          <ul className="border-border bg-card divide-border divide-y rounded-xl border shadow-sm">
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

      {/* 학생별 진척 */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">
          학생별 진척 ({progress.length}명)
        </h2>
        <IndexTable
          minWidth={600}
          headers={[
            { label: "학생" },
            { label: "상태", width: "6rem" },
            { label: "진척", align: "right", width: "6rem" },
            { label: "완수 시각", align: "right", width: "9rem" },
          ]}
        >
          {progress.map((m) => (
            <ProgressRow key={m.profileId} m={m} />
          ))}
        </IndexTable>
      </section>
    </AdminShell>
  );
}

function ProgressRow({ m }: { m: MemberAssignmentProgress }) {
  const statusMap: Record<AssignmentStatus, Parameters<typeof StatusChip>[0]["status"]> = {
    pending: "pending",
    partial: "warn",
    completed: "completed",
  };
  return (
    <TR>
      <TD>
        <Link
          to={`/admin/students/${m.profileId}`}
          viewTransition
          className="hover:text-primary text-[13px] font-medium"
        >
          {m.name}
        </Link>
        {m.email ? (
          <p className="text-muted-foreground text-[10px]">{m.email}</p>
        ) : null}
      </TD>
      <TD>
        <StatusChip
          status={statusMap[m.status]}
          label={ASSIGNMENT_STATUS_LABEL[m.status]}
        />
      </TD>
      <TD align="right" mono>
        {m.completedItems}/{m.totalItems}
      </TD>
      <TD align="right" soft mono>
        {m.completedAt ? m.completedAt.slice(0, 16).replace("T", " ") : "—"}
      </TD>
    </TR>
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
      className="bg-card mt-2 space-y-3 rounded-xl border p-4 shadow-sm"
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
      <div>
        <Label className="text-muted-foreground text-[11px]">마감 정책</Label>
        <select
          name="deadlinePolicy"
          defaultValue={assignment.deadlinePolicy}
          className="border-input bg-background mt-1 h-8 w-full rounded-md border px-2 text-xs"
        >
          <option value="recommended">권장형 — 마감 후에도 완료 인정</option>
          <option value="late_allowed">
            지각 인정형 — 완료 인정 + 지각 완료 표시
          </option>
          <option value="strict">마감형 — 마감 후 완료 불인정(학습은 가능)</option>
        </select>
      </div>
      {fetcher.data && "error" in fetcher.data ? (
        <p className="text-rose-600 text-xs">{fetcher.data.error}</p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
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
      <Chip tone="outline">{ASSIGNMENT_ITEM_KIND_LABEL[item.kind]}</Chip>
      <div className="min-w-0 flex-1 truncate text-xs">{refLabel}</div>
      {item.targetQuantity ? (
        <Chip tone="neutral">x{item.targetQuantity}</Chip>
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
      <Button size="sm" variant="outline" className="w-full" onClick={() => setOpen(true)}>
        <PlusIcon className="size-3.5" /> 항목 추가
      </Button>
    );
  }
  return (
    <fetcher.Form
      method="post"
      action="/api/admin/assignment"
      className="bg-muted/30 space-y-2 rounded-xl border p-3"
    >
      <input type="hidden" name="intent" value="upsert_item" />
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <input type="hidden" name="ord" value={nextOrd} />
      <div className="grid grid-cols-[140px_1fr] gap-2">
        <select
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as AssignmentItemKind)}
          className="border-input bg-background focus:border-primary h-8 rounded-md border px-2 text-xs outline-none"
        >
          {ASSIGNMENT_ITEM_KINDS.map((k) => (
            <option key={k} value={k}>
              {ASSIGNMENT_ITEM_KIND_LABEL[k]}
            </option>
          ))}
        </select>
        {kind === "case_read" ? (
          <ContentPicker kind="case" name="caseId" required />
        ) : kind === "problem" ? (
          <ContentPicker kind="problem" name="problemId" required />
        ) : kind === "blank_set" ? (
          <ContentPicker kind="blank_set" name="blankSetId" required />
        ) : (
          <ContentPicker kind="article" name="articleId" required />
        )}
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
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          취소
        </Button>
        <Button type="submit" size="sm" disabled={fetcher.state !== "idle"}>
          추가
        </Button>
      </div>
    </fetcher.Form>
  );
}
