// feat-7-021 — 과제 편집 + 학생 진척 (운영자).

import {
  CalendarIcon,
  ClipboardListIcon,
  PencilIcon,
  PlusIcon,
  PrinterIcon,
  Trash2Icon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
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
  OFFLINE_TEST_STATUS_LABEL,
  offlineTestSubjectName,
  type OfflineTestSummary,
} from "~/features/offline-tests/labels";
import { listOfflineTests } from "~/features/offline-tests/queries.server";
import { SCIENCE_SUBJECT_SLUGS, SCIENCE_SUBJECTS } from "~/features/subjects/lib/science";
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
import {
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-assignment-edit";

export const meta: Route.MetaFunction = ({ data: d }) => {
  if (!d || !d.assignment) return [{ title: "과제 | 리담변리사학원" }];
  return [{ title: `${d.assignment.title} | 리담변리사학원` }];
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

  const [progress, offlineTests] = await Promise.all([
    listAssignmentProgress(params.assignmentId),
    listOfflineTests(client, params.assignmentId),
  ]);
  return { cohort, assignment, progress, role, offlineTests };
}

// ★안정 identity 필수 — 성공 useEffect deps([fetcher.data, reload])에 사용. 매 렌더 새
// 함수면 fetcher.data.ok 가 계속 참인 동안 effect 가 무한 재실행돼 화면이 멈춘다.
function useReload() {
  const navigate = useNavigate();
  const location = useLocation();
  const ref = useRef<() => void>(() => {});
  ref.current = () =>
    navigate(location.pathname + location.search, {
      replace: true,
      preventScrollReset: true,
    });
  return useCallback(() => ref.current(), []);
}

export default function AdminAssignmentEdit({
  loaderData,
}: Route.ComponentProps) {
  const { cohort, assignment, progress, role, offlineTests } = loaderData;
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
        {/* feat-7-040 후속 — 반 공통 약점 문제 자동 추가(모의 picker seam 재사용) */}
        <WeakProblemsForm assignmentId={assignment.assignmentId} />
      </section>

      <Separator className="my-6" />

      {/* feat-7-042 — 오프라인 테스트 (시험지 제작·PDF·결과 입력) */}
      <OfflineTestsSection
        cohortId={cohort.cohortId}
        assignmentId={assignment.assignmentId}
        tests={offlineTests}
      />

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
            <ProgressRow
              key={m.profileId}
              m={m}
              late={
                assignment.deadlinePolicy === "late_allowed" &&
                m.status === "completed" &&
                m.completedAt != null &&
                new Date(m.completedAt).getTime() >
                  new Date(assignment.dueAt).getTime()
              }
            />
          ))}
        </IndexTable>
      </section>
    </AdminShell>
  );
}

function ProgressRow({
  m,
  late,
}: {
  m: MemberAssignmentProgress;
  late: boolean;
}) {
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
          className="hover:text-link text-[13px] font-medium"
        >
          {m.name}
        </Link>
        {m.email ? (
          <p className="text-muted-foreground text-[10px]">{m.email}</p>
        ) : null}
      </TD>
      <TD>
        <span className="inline-flex flex-wrap items-center gap-1">
          <StatusChip
            status={statusMap[m.status]}
            label={ASSIGNMENT_STATUS_LABEL[m.status]}
          />
          {late ? (
            <span className="rounded border border-amber-300 px-1 py-0.5 text-[10px] text-amber-700 dark:text-amber-400">
              지각
            </span>
          ) : null}
        </span>
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

// feat-7-042 — 오프라인 테스트 목록 + 새로 만들기. 만들면 빌더로 이동.
// 시험 삭제(soft) — 목록 항목별. fetcher 제출 후 라우트 loader 자동 재검증으로 목록 갱신.
function DeleteTestButton({ testId, title }: { testId: string; title: string }) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  return (
    <fetcher.Form
      method="post"
      action="/api/admin/offline-test"
      onSubmit={(e) => {
        if (!confirm(`"${title}" 시험을 삭제할까요?`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="intent" value="delete_test" />
      <input type="hidden" name="testId" value={testId} />
      <button
        type="submit"
        title="시험 삭제"
        disabled={fetcher.state !== "idle"}
        className="text-muted-foreground inline-flex items-center hover:text-rose-600 disabled:opacity-50"
      >
        <Trash2Icon className="size-3.5" />
      </button>
    </fetcher.Form>
  );
}

function OfflineTestsSection({
  cohortId,
  assignmentId,
  tests,
}: {
  cohortId: string;
  assignmentId: string;
  tests: OfflineTestSummary[];
}) {
  const navigate = useNavigate();
  const fetcher = useFetcher<{ ok?: true; testId?: string; error?: string }>();
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data &&
      "ok" in fetcher.data &&
      fetcher.data.ok &&
      fetcher.data.testId
    ) {
      navigate(
        `/admin/cohorts/${cohortId}/assignments/${assignmentId}/tests/${fetcher.data.testId}`,
      );
    }
  }, [fetcher.state, fetcher.data, navigate, cohortId, assignmentId]);

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">
        오프라인 테스트 ({tests.length})
      </h2>
      <p className="text-muted-foreground text-xs">
        빈칸·OX·객관식을 조합한 시험지를 만들어 인쇄(PDF)로 배포하고, 채점
        결과를 입력하면 학생 학습 통계에 합산됩니다.
      </p>
      {tests.length > 0 ? (
        <ul className="border-border bg-card divide-border divide-y rounded-xl border shadow-sm">
          {tests.map((t) => (
            <li key={t.testId} className="flex items-center gap-2 px-3 py-2">
              <Chip tone="outline">{offlineTestSubjectName(t)}</Chip>
              {/* Phase 1 T2 — 배포 상태. draft 는 학생 비노출. */}
              <Chip
                tone={
                  t.status === "published"
                    ? "emerald"
                    : t.status === "closed"
                      ? "amber"
                      : "outline"
                }
              >
                {OFFLINE_TEST_STATUS_LABEL[t.status]}
              </Chip>
              <Link
                to={`/admin/cohorts/${cohortId}/assignments/${assignmentId}/tests/${t.testId}`}
                className="hover:text-link min-w-0 flex-1 truncate text-xs font-medium"
              >
                {t.title}
              </Link>
              <span className="text-muted-foreground text-[11px] tabular-nums">
                {t.questionCount}문항 · {t.totalPoints}점
              </span>
              <span className="text-muted-foreground text-[11px] tabular-nums">
                결과 {t.resultCount}명
              </span>
              {/* 인쇄(PDF 저장) 바로가기 — 빌더 안 거치고 목록에서 즉시 */}
              <Link
                to={`/admin/cohorts/${cohortId}/assignments/${assignmentId}/tests/${t.testId}/print`}
                target="_blank"
                title="문제지 인쇄 / PDF 저장"
                className="text-muted-foreground hover:text-link inline-flex items-center gap-1 text-[11px] font-semibold"
              >
                <PrinterIcon className="size-3.5" /> 문제지
              </Link>
              <Link
                to={`/admin/cohorts/${cohortId}/assignments/${assignmentId}/tests/${t.testId}/print?answers=1`}
                target="_blank"
                title="정답·해설지 인쇄 / PDF 저장"
                className="text-muted-foreground hover:text-link inline-flex items-center gap-1 text-[11px] font-semibold"
              >
                <PrinterIcon className="size-3.5" /> 정답
              </Link>
              <DeleteTestButton testId={t.testId} title={t.title} />
            </li>
          ))}
        </ul>
      ) : null}
      {creating ? (
        <fetcher.Form
          method="post"
          action="/api/admin/offline-test"
          className="bg-muted/30 flex flex-wrap items-end gap-2 rounded-xl border p-3"
        >
          <input type="hidden" name="intent" value="create_test" />
          <input type="hidden" name="assignmentId" value={assignmentId} />
          <div className="flex min-w-48 flex-1 flex-col gap-1">
            <Label className="text-[11px]">시험명</Label>
            <Input
              name="title"
              required
              maxLength={200}
              placeholder="예: 특허법 중간점검 1회"
              className="h-9 text-xs"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-[11px]">과목</Label>
            <select
              name="subject"
              required
              className="border-input bg-background h-9 rounded-md border px-2 text-[13px]"
            >
              <optgroup label="법률">
                {LAW_SUBJECT_SLUGS.map((s) => (
                  <option key={s} value={s}>
                    {LAW_SUBJECTS[s].name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="자연과학 (객관식만)">
                {SCIENCE_SUBJECT_SLUGS.map((s) => (
                  <option key={s} value={`science:${s}`}>
                    {SCIENCE_SUBJECTS[s].name}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
          <Button type="submit" size="sm" disabled={fetcher.state !== "idle"}>
            만들기
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setCreating(false)}
          >
            취소
          </Button>
          {fetcher.data && "error" in fetcher.data && fetcher.data.error ? (
            <p className="w-full text-xs text-rose-600">{fetcher.data.error}</p>
          ) : null}
        </fetcher.Form>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          onClick={() => setCreating(true)}
        >
          <PlusIcon className="size-3.5" /> 오프라인 테스트 만들기
        </Button>
      )}
    </section>
  );
}

// feat-7-040 후속 — 반 공통 약점 → 과제 문제 자동 추가. 모의 picker 와 동일 seam.
function WeakProblemsForm({ assignmentId }: { assignmentId: string }) {
  const fetcher = useFetcher<{ ok?: true; added?: number; error?: string }>();
  const reload = useReload();
  const busy = fetcher.state !== "idle";
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
  return (
    <fetcher.Form
      method="post"
      action="/api/admin/assignment"
      className="border-border bg-muted/30 flex flex-wrap items-end gap-2 rounded-xl border p-3"
    >
      <input type="hidden" name="intent" value="add_weak_items" />
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <div className="flex flex-col gap-1">
        <Label className="text-[11px]">약점 과목</Label>
        <select
          name="lawCode"
          required
          className="border-input bg-background h-9 rounded-md border px-2 text-[13px]"
        >
          {LAW_SUBJECT_SLUGS.map((s) => (
            <option key={s} value={s}>
              {LAW_SUBJECTS[s].name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-[11px]">문항 수</Label>
        <Input
          name="n"
          type="number"
          min={1}
          max={50}
          defaultValue={10}
          className="h-9 w-20"
        />
      </div>
      <Button type="submit" size="sm" variant="outline" disabled={busy}>
        <PlusIcon className="size-3.5" /> 반 공통 약점 문제 자동 추가
      </Button>
      <p className="text-muted-foreground w-full text-[11px]">
        반 공통 약점 단원(서로 다른 학생 다수가 시도·정답률 낮음)에서 승인된 문제를
        가중 배분해 추가합니다. 표본 부족 시 추가되지 않습니다.
      </p>
      {fetcher.data && "error" in fetcher.data && fetcher.data.error ? (
        <p className="w-full text-xs text-rose-600">{fetcher.data.error}</p>
      ) : null}
      {fetcher.data && fetcher.data.ok && fetcher.data.added !== undefined ? (
        <p className="w-full text-xs text-emerald-700 dark:text-emerald-400">
          ✓ {fetcher.data.added}문 추가됨
        </p>
      ) : null}
    </fetcher.Form>
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
