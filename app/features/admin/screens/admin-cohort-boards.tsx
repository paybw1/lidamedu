// feat-6-010 반별 게시판 — 운영자 관리 화면 (/admin/cohort-boards).
// 게시판 생성/수정/삭제 + write_scope(공지형/소통형) + 접근 반 다중선택. staff 가드(instructor=본인 담당, manager=전체).
import { MessageSquareIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { data, useFetcher, useRevalidator } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { Textarea } from "~/core/components/ui/textarea";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { roleAtLeast } from "~/core/lib/roles";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { listCohorts } from "~/features/cohorts/queries.server";
import {
  COHORT_BOARD_WRITE_SCOPES,
  WRITE_SCOPE_LABEL,
  WRITE_SCOPE_SHORT,
  type CohortBoardListItem,
  type CohortBoardWriteScope,
} from "~/features/cohort-boards/labels";
import { listBoardsForStaff } from "~/features/cohort-boards/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/admin-cohort-boards";

export const meta: Route.MetaFunction = () => [
  { title: "반별 게시판 | 리담변리사학원" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const isManager = roleAtLeast(role, "manager");
  const [boards, cohorts] = await Promise.all([
    listBoardsForStaff(role, user.id),
    listCohorts(client, { ownerId: isManager ? undefined : user.id }),
  ]);
  return {
    boards,
    cohorts: cohorts.map((c) => ({ cohortId: c.cohortId, name: c.name })),
    isManager,
  };
}

type CohortOpt = { cohortId: string; name: string };

export default function AdminCohortBoards({ loaderData }: Route.ComponentProps) {
  const { boards, cohorts } = loaderData;
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <AdminShell
      cluster="cohorts"
      title="반별 게시판"
      desc="반에 연결된 게시판을 만들고 공지형/소통형·접근 반을 지정합니다. 학생은 소속 반 게시판만 보입니다."
      headerRight={
        <Button
          size="sm"
          className="h-9 rounded-full"
          onClick={() => {
            setShowCreate((v) => !v);
            setEditingId(null);
          }}
        >
          <PlusIcon className="size-4" /> 새 게시판
        </Button>
      }
    >
      {cohorts.length === 0 ? (
        <p className="text-muted-foreground border-border mb-4 rounded-xl border border-dashed p-4 text-sm">
          담당하는 반이 없습니다. 먼저 <strong>반·강의 → 반 목록</strong>에서 반을
          만들어 주세요.
        </p>
      ) : null}

      {showCreate ? (
        <BoardForm
          cohorts={cohorts}
          onDone={() => setShowCreate(false)}
          key="create"
        />
      ) : null}

      {boards.length === 0 ? (
        <div className="border-border text-muted-foreground rounded-2xl border border-dashed py-12 text-center text-sm">
          아직 게시판이 없습니다. “새 게시판”으로 만들어 보세요.
        </div>
      ) : (
        <ul className="space-y-2">
          {boards.map((b) =>
            editingId === b.boardId ? (
              <li key={b.boardId}>
                <BoardForm
                  cohorts={cohorts}
                  initial={b}
                  onDone={() => setEditingId(null)}
                />
              </li>
            ) : (
              <li key={b.boardId}>
                <BoardRow
                  board={b}
                  onEdit={() => {
                    setEditingId(b.boardId);
                    setShowCreate(false);
                  }}
                />
              </li>
            ),
          )}
        </ul>
      )}
    </AdminShell>
  );
}

function ScopeChip({ scope }: { scope: CohortBoardWriteScope }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold",
        scope === "staff"
          ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
          : "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
      )}
    >
      {WRITE_SCOPE_SHORT[scope]}
    </span>
  );
}

function BoardRow({
  board,
  onEdit,
}: {
  board: CohortBoardListItem;
  onEdit: () => void;
}) {
  const fetcher = useFetcher<{ ok: boolean; error?: string }>();
  const revalidator = useRevalidator();
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) revalidator.revalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);

  return (
    <div className="border-border bg-card flex flex-wrap items-center gap-3 rounded-2xl border p-4 shadow-sm">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-bold tracking-tight">{board.title}</span>
          <ScopeChip scope={board.writeScope} />
          <span className="text-muted-foreground inline-flex items-center gap-1 text-[11px]">
            <MessageSquareIcon className="size-3" /> {board.postCount}
          </span>
        </div>
        {board.description ? (
          <p className="text-muted-foreground mt-0.5 line-clamp-1 text-xs">
            {board.description}
          </p>
        ) : null}
        <div className="mt-1.5 flex flex-wrap gap-1">
          {board.cohorts.length === 0 ? (
            <span className="text-muted-foreground text-[11px]">접근 반 없음</span>
          ) : (
            board.cohorts.map((c) => (
              <span
                key={c.cohortId}
                className="bg-muted text-foreground/80 inline-flex items-center rounded-full px-2 py-0.5 text-[11px]"
              >
                {c.name}
              </span>
            ))
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <Button variant="outline" size="sm" className="rounded-full" onClick={onEdit}>
          <PencilIcon className="size-3.5" /> 수정
        </Button>
        <fetcher.Form
          method="post"
          action="/api/admin/cohort-board"
          onSubmit={(e) => {
            if (!window.confirm("이 게시판을 삭제하시겠습니까? (글도 함께 숨겨집니다)"))
              e.preventDefault();
          }}
        >
          <input type="hidden" name="intent" value="delete" />
          <input type="hidden" name="boardId" value={board.boardId} />
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            className="text-rose-600 hover:text-rose-700 rounded-full"
          >
            <Trash2Icon className="size-3.5" /> 삭제
          </Button>
        </fetcher.Form>
      </div>
      {fetcher.data && !fetcher.data.ok ? (
        <p className="w-full text-xs text-rose-600">{fetcher.data.error}</p>
      ) : null}
    </div>
  );
}

function BoardForm({
  cohorts,
  initial,
  onDone,
}: {
  cohorts: CohortOpt[];
  initial?: CohortBoardListItem;
  onDone: () => void;
}) {
  const fetcher = useFetcher<{ ok: boolean; error?: string }>();
  const revalidator = useRevalidator();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [writeScope, setWriteScope] = useState<CohortBoardWriteScope>(
    initial?.writeScope ?? "members",
  );
  const [selected, setSelected] = useState<string[]>(
    initial?.cohorts.map((c) => c.cohortId) ?? [],
  );
  const submitting = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) {
      revalidator.revalidate();
      onDone();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);

  const submit = () => {
    const fd = new FormData();
    fd.set("intent", initial ? "update" : "create");
    if (initial) fd.set("boardId", initial.boardId);
    fd.set("title", title);
    fd.set("description", description);
    fd.set("writeScope", writeScope);
    fd.set("cohortIds", JSON.stringify(selected));
    fetcher.submit(fd, { method: "post", action: "/api/admin/cohort-board" });
  };

  return (
    <div className="border-primary/30 bg-primary/[0.02] mb-2 rounded-2xl border p-4 shadow-sm">
      <p className="mb-3 text-sm font-bold">
        {initial ? "게시판 수정" : "새 게시판"}
      </p>
      <div className="space-y-3">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="게시판 제목"
          maxLength={200}
        />
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="설명 (선택)"
          rows={2}
          className="text-sm"
        />
        <div>
          <p className="text-muted-foreground mb-1.5 text-xs font-bold">쓰기 권한</p>
          <div className="flex flex-wrap gap-2">
            {COHORT_BOARD_WRITE_SCOPES.map((s) => (
              <label
                key={s}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs",
                  writeScope === s
                    ? "border-primary bg-primary/[0.06] font-semibold"
                    : "border-border",
                )}
              >
                <input
                  type="radio"
                  name="write-scope"
                  checked={writeScope === s}
                  onChange={() => setWriteScope(s)}
                />
                {WRITE_SCOPE_LABEL[s]}
              </label>
            ))}
          </div>
        </div>
        <div>
          <p className="text-muted-foreground mb-1.5 text-xs font-bold">
            접근 반 (선택한 반의 학생·담당 강사만 열람)
          </p>
          {cohorts.length === 0 ? (
            <p className="text-muted-foreground text-xs">선택 가능한 반이 없습니다.</p>
          ) : (
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {cohorts.map((c) => (
                <label
                  key={c.cohortId}
                  className="border-border flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(c.cohortId)}
                    onChange={(e) =>
                      setSelected((prev) =>
                        e.target.checked
                          ? [...prev, c.cohortId]
                          : prev.filter((x) => x !== c.cohortId),
                      )
                    }
                  />
                  <span className="truncate">{c.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>
        {fetcher.data && !fetcher.data.ok ? (
          <p className="text-xs text-rose-600">{fetcher.data.error}</p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" className="rounded-full" onClick={onDone}>
            취소
          </Button>
          <Button
            size="sm"
            className="rounded-full"
            disabled={submitting || !title.trim() || selected.length === 0}
            onClick={submit}
          >
            {initial ? "저장" : "만들기"}
          </Button>
        </div>
      </div>
    </div>
  );
}
