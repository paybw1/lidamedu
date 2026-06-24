// feat-7-021 — cohort 단위 과제 목록 + 신규 + 커리큘럼 주차 자동 변환.

import {
  CalendarIcon,
  ClipboardListIcon,
  PlusIcon,
  WandSparklesIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  Link,
  data,
  useFetcher,
  useNavigate,
} from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import {
  Bar,
  Chip,
  IndexTable,
  TD,
  TR,
} from "~/features/admin/components/admin-ui";
import { listAssignmentsByCohort } from "~/features/assignments/queries.server";
import { getCohortById } from "~/features/cohorts/queries.server";
import {
  getCurriculumWithWeeks,
  listCohortCurricula,
} from "~/features/curricula/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { roleAtLeast } from "~/core/lib/roles";

import type { Route } from "./+types/admin-cohort-assignments";

export const meta: Route.MetaFunction = ({ data: d }) => {
  if (!d || !d.cohort) return [{ title: "과제 | 리담변리사학원" }];
  return [{ title: `${d.cohort.name} 과제 | 리담변리사학원` }];
};

export async function loader({ params, request }: Route.LoaderArgs) {
  if (!params.cohortId) throw data("Missing cohortId", { status: 404 });
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

  const [assignments, cohortCurricula] = await Promise.all([
    listAssignmentsByCohort(params.cohortId),
    listCohortCurricula(params.cohortId),
  ]);

  // 적용된 커리큘럼들의 주차 일람 (자동 변환 후보)
  const curriculumDetails = await Promise.all(
    cohortCurricula.map((cc) => getCurriculumWithWeeks(cc.curriculumId)),
  );
  const availableWeeks = curriculumDetails
    .filter((d) => d !== null)
    .flatMap((d) =>
      d!.weeks.map((w) => ({
        curriculumId: d!.curriculumId,
        curriculumName: d!.name,
        weekId: w.weekId,
        weekNumber: w.weekNumber,
        title: w.title,
        itemCount: w.items.length,
      })),
    );

  return { cohort, assignments, availableWeeks, role };
}

export default function AdminCohortAssignments({
  loaderData,
}: Route.ComponentProps) {
  const { cohort, assignments, availableWeeks, role } = loaderData;
  const [tab, setTab] = useState<"new" | "convert" | null>(null);

  const completePctAll = assignments.map((a) =>
    (a.totalMembers ?? 0) > 0
      ? Math.round(((a.completedMembers ?? 0) / (a.totalMembers as number)) * 100)
      : 0,
  );

  return (
    <AdminShell
      cluster="cohorts"
      role={role}
      title={`${cohort.name} — 과제`}
      desc={`총 ${assignments.length}건 · 자동(커리큘럼 주차) + 수동 병행`}
      headerRight={
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={tab === "convert" ? "default" : "outline"}
            onClick={() => setTab((v) => (v === "convert" ? null : "convert"))}
            disabled={availableWeeks.length === 0}
          >
            <WandSparklesIcon className="size-3.5" /> 커리큘럼 주차로 자동 생성
          </Button>
          <Button
            size="sm"
            variant={tab === "new" ? "default" : "outline"}
            onClick={() => setTab((v) => (v === "new" ? null : "new"))}
          >
            <PlusIcon className="size-3.5" /> 수동 신규
          </Button>
        </div>
      }
    >
      <Link
        to={`/admin/cohorts/${cohort.cohortId}`}
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-xs"
      >
        ← {cohort.name}
      </Link>

      {tab === "new" ? (
        <div className="mb-4">
          <NewAssignmentForm cohortId={cohort.cohortId} onClose={() => setTab(null)} />
        </div>
      ) : null}
      {tab === "convert" ? (
        <div className="mb-4">
          <ConvertWeekForm
            cohortId={cohort.cohortId}
            availableWeeks={availableWeeks}
            onClose={() => setTab(null)}
          />
        </div>
      ) : null}

      {assignments.length === 0 ? (
        <div className="border-border bg-card text-muted-foreground rounded-xl border py-16 text-center shadow-sm">
          <ClipboardListIcon className="mx-auto mb-2 size-8 opacity-30" />
          <p className="text-sm font-medium">아직 과제가 없습니다.</p>
          <p className="mt-1 text-xs">
            {availableWeeks.length > 0
              ? "위에서 커리큘럼 주차를 자동 변환하거나 수동으로 추가하세요."
              : "먼저 커리큘럼을 cohort에 적용하면 주차별로 한 번에 과제를 만들 수 있습니다."}
          </p>
        </div>
      ) : (
        <IndexTable
          minWidth={720}
          headers={[
            { label: "제목" },
            { label: "마감", width: "8rem" },
            { label: "항목", align: "right", width: "5rem" },
            { label: "완수율", align: "right", width: "10rem" },
            { label: "출처", width: "5rem" },
            { label: "", width: "3rem" },
          ]}
          footer={
            <div className="border-border/60 text-muted-foreground border-t px-3 py-2 text-[11px] font-medium tabular-nums">
              총 {assignments.length}건
            </div>
          }
        >
          {assignments.map((a, idx) => {
            const completePct = completePctAll[idx];
            const overdue =
              new Date(a.dueAt).getTime() < Date.now() && completePct < 100;
            return (
              <TR key={a.assignmentId}>
                <TD>
                  <Link
                    to={`/admin/cohorts/${cohort.cohortId}/assignments/${a.assignmentId}`}
                    viewTransition
                    className="hover:text-link text-[13px] font-medium"
                  >
                    {a.title}
                  </Link>
                </TD>
                <TD mono soft>
                  <span className={overdue ? "text-rose-600 dark:text-rose-400" : ""}>
                    <CalendarIcon className="mr-0.5 inline size-3 align-middle" />
                    {a.dueAt.slice(0, 10)}
                  </span>
                </TD>
                <TD align="right" mono>
                  {a.itemCount}
                </TD>
                <TD align="right">
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-[11px] tabular-nums text-foreground">
                      {a.completedMembers}/{a.totalMembers} ({completePct}%)
                    </span>
                    <Bar
                      value={completePct}
                      tone="auto"
                      className="w-20"
                    />
                  </div>
                </TD>
                <TD>
                  {a.sourceWeekId ? (
                    <Chip tone="blue">
                      <WandSparklesIcon className="size-2.5" /> 자동
                    </Chip>
                  ) : (
                    <Chip tone="neutral">수동</Chip>
                  )}
                </TD>
                <TD align="right">
                  <Link
                    to={`/admin/cohorts/${cohort.cohortId}/assignments/${a.assignmentId}`}
                    viewTransition
                    className="text-link text-xs font-semibold hover:underline"
                  >
                    편집
                  </Link>
                </TD>
              </TR>
            );
          })}
        </IndexTable>
      )}
    </AdminShell>
  );
}

// ─── 신규 폼 (수동) ───

function NewAssignmentForm({
  cohortId,
  onClose,
}: {
  cohortId: string;
  onClose: () => void;
}) {
  const fetcher = useFetcher<{ ok?: true; assignmentId?: string; error?: string }>();
  const navigate = useNavigate();
  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data &&
      "ok" in fetcher.data &&
      fetcher.data.ok &&
      fetcher.data.assignmentId
    ) {
      navigate(`/admin/cohorts/${cohortId}/assignments/${fetcher.data.assignmentId}`);
    }
  }, [fetcher.state, fetcher.data, navigate, cohortId]);
  const defaultDue = new Date(Date.now() + 7 * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 16);
  return (
    <fetcher.Form
      method="post"
      action="/api/admin/assignment"
      className="bg-card space-y-3 rounded-xl border p-4 shadow-sm"
    >
      <p className="text-xs font-semibold">수동 신규 과제</p>
      <input type="hidden" name="intent" value="create" />
      <input type="hidden" name="cohortId" value={cohortId} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_200px]">
        <div>
          <Label className="text-muted-foreground text-[11px]">제목 *</Label>
          <Input
            name="title"
            required
            maxLength={200}
            className="mt-1 h-8 text-xs"
            placeholder="예: 1주차 — 특허법 발명/특허요건 객관식 10문"
          />
        </div>
        <div>
          <Label className="text-muted-foreground text-[11px]">마감일시</Label>
          <Input
            name="dueAt"
            type="datetime-local"
            required
            defaultValue={defaultDue}
            className="mt-1 h-8 text-xs tabular-nums"
          />
        </div>
      </div>
      <div>
        <Label className="text-muted-foreground text-[11px]">설명</Label>
        <textarea
          name="descriptionMd"
          rows={2}
          maxLength={4000}
          className="border-input bg-background mt-1 w-full rounded-md border px-2 py-1 text-xs"
          placeholder="(선택)"
        />
      </div>
      {fetcher.data && "error" in fetcher.data ? (
        <p className="text-rose-600 text-xs">{fetcher.data.error}</p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          취소
        </Button>
        <Button type="submit" size="sm" disabled={fetcher.state !== "idle"}>
          생성
        </Button>
      </div>
    </fetcher.Form>
  );
}

// ─── 자동 변환 폼 (커리큘럼 주차 → 과제) ───

function ConvertWeekForm({
  cohortId,
  availableWeeks,
  onClose,
}: {
  cohortId: string;
  availableWeeks: Array<{
    curriculumId: string;
    curriculumName: string;
    weekId: string;
    weekNumber: number;
    title: string;
    itemCount: number;
  }>;
  onClose: () => void;
}) {
  const fetcher = useFetcher<{ ok?: true; assignmentId?: string; error?: string }>();
  const navigate = useNavigate();
  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data &&
      "ok" in fetcher.data &&
      fetcher.data.ok &&
      fetcher.data.assignmentId
    ) {
      navigate(`/admin/cohorts/${cohortId}/assignments/${fetcher.data.assignmentId}`);
    }
  }, [fetcher.state, fetcher.data, navigate, cohortId]);
  const defaultDue = new Date(Date.now() + 7 * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 16);
  return (
    <fetcher.Form
      method="post"
      action="/api/admin/assignment"
      className="bg-card space-y-3 rounded-xl border p-4 shadow-sm"
    >
      <p className="text-muted-foreground text-xs">
        커리큘럼 주차의 학습 항목들을 한 번에 과제로 변환합니다 (강의 항목은 자동 제외).
      </p>
      <input type="hidden" name="intent" value="convert_week" />
      <input type="hidden" name="cohortId" value={cohortId} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_200px]">
        <div>
          <Label className="text-muted-foreground text-[11px]">주차 *</Label>
          <select
            name="weekId"
            required
            className="border-input bg-background focus:border-primary mt-1 h-8 w-full rounded-md border px-2 text-xs outline-none"
          >
            {availableWeeks.map((w) => (
              <option key={w.weekId} value={w.weekId}>
                [{w.curriculumName}] W{w.weekNumber} {w.title} (항목 {w.itemCount})
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-muted-foreground text-[11px]">마감일시</Label>
          <Input
            name="dueAt"
            type="datetime-local"
            required
            defaultValue={defaultDue}
            className="mt-1 h-8 text-xs tabular-nums"
          />
        </div>
      </div>
      {fetcher.data && "error" in fetcher.data ? (
        <p className="text-rose-600 text-xs">{fetcher.data.error}</p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          취소
        </Button>
        <Button type="submit" size="sm" disabled={fetcher.state !== "idle"}>
          변환
        </Button>
      </div>
    </fetcher.Form>
  );
}
