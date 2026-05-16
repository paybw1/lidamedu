// feat-7-021 — cohort 단위 과제 목록 + 신규 + 커리큘럼 주차 자동 변환.

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CalendarIcon,
  ClipboardListIcon,
  PencilIcon,
  PlusIcon,
  WandSparklesIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  Form,
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
import { listAssignmentsByCohort } from "~/features/assignments/queries.server";
import { getCohortById } from "~/features/cohorts/queries.server";
import {
  listCohortCurricula,
  getCurriculumWithWeeks,
} from "~/features/curricula/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/admin-cohort-assignments";

export const meta: Route.MetaFunction = ({ data: d }) => {
  if (!d || !d.cohort) return [{ title: "과제 | Lidam Patent Attorney Academy" }];
  return [{ title: `${d.cohort.name} 과제 | Lidam Patent Attorney Academy` }];
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
  if (role !== "admin" && cohort.ownerId !== user.id) {
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

  return { cohort, assignments, availableWeeks };
}

export default function AdminCohortAssignments({
  loaderData,
}: Route.ComponentProps) {
  const { cohort, assignments, availableWeeks } = loaderData;
  const [tab, setTab] = useState<"new" | "convert" | null>(null);

  return (
    <div className="mx-auto w-full max-w-screen-xl px-5 py-6 md:px-10 md:py-8">
      <Link
        to={`/admin/cohorts/${cohort.cohortId}`}
        className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-xs"
      >
        <ArrowLeftIcon className="size-3" /> {cohort.name}
      </Link>

      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="inline-flex items-center gap-2 text-2xl font-bold tracking-tight">
            <ClipboardListIcon className="text-primary size-6" />
            {cohort.name} — 과제
          </h1>
          <p className="text-muted-foreground text-sm">
            총 {assignments.length}건 · 자동(커리큘럼 주차) + 수동 병행
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={tab === "convert" ? "default" : "outline"}
            onClick={() =>
              setTab((v) => (v === "convert" ? null : "convert"))
            }
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
      </header>

      {tab === "new" ? (
        <div className="mb-4">
          <NewAssignmentForm
            cohortId={cohort.cohortId}
            onClose={() => setTab(null)}
          />
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
        <div className="bg-muted/40 rounded-md border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-sm">
            아직 과제가 없습니다.
            {availableWeeks.length > 0
              ? " 위에서 커리큘럼 주차를 자동 변환하거나 수동으로 추가하세요."
              : " 먼저 커리큘럼을 cohort 에 적용하면 주차별로 한 번에 과제를 만들 수 있습니다."}
          </p>
        </div>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <Table className="min-w-[720px]">
              <TableHeader>
                <TableRow>
                  <TableHead>제목</TableHead>
                  <TableHead className="w-24">마감</TableHead>
                  <TableHead className="w-16 text-right">항목</TableHead>
                  <TableHead className="w-32 text-right">완수율</TableHead>
                  <TableHead className="w-20 text-xs">출처</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((a) => {
                  const completePct =
                    (a.totalMembers ?? 0) > 0
                      ? Math.round(
                          ((a.completedMembers ?? 0) /
                            (a.totalMembers as number)) *
                            100,
                        )
                      : 0;
                  const overdue =
                    new Date(a.dueAt).getTime() < Date.now() && completePct < 100;
                  return (
                    <TableRow key={a.assignmentId}>
                      <TableCell>
                        <Link
                          to={`/admin/cohorts/${cohort.cohortId}/assignments/${a.assignmentId}`}
                          viewTransition
                          className="hover:text-primary text-sm font-medium"
                        >
                          {a.title}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 text-xs tabular-nums",
                            overdue
                              ? "text-rose-600 dark:text-rose-400"
                              : "text-muted-foreground",
                          )}
                        >
                          <CalendarIcon className="size-3" />
                          {a.dueAt.slice(0, 10)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {a.itemCount}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {a.completedMembers}/{a.totalMembers} ({completePct}%)
                      </TableCell>
                      <TableCell className="text-[10px]">
                        {a.sourceWeekId ? (
                          <Badge variant="secondary" className="text-[10px]">
                            <WandSparklesIcon className="size-3" /> 자동
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">
                            수동
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Link
                          to={`/admin/cohorts/${cohort.cohortId}/assignments/${a.assignmentId}`}
                          viewTransition
                          className="text-primary inline-flex items-center text-xs hover:underline"
                        >
                          <PencilIcon className="size-3" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
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
      navigate(
        `/admin/cohorts/${cohortId}/assignments/${fetcher.data.assignmentId}`,
      );
    }
  }, [fetcher.state, fetcher.data, navigate, cohortId]);
  // 기본 마감일: 7일 후
  const defaultDue = new Date(Date.now() + 7 * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 16);
  return (
    <fetcher.Form
      method="post"
      action="/api/admin/assignment"
      className="bg-card space-y-2 rounded-md border p-4"
    >
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
      navigate(
        `/admin/cohorts/${cohortId}/assignments/${fetcher.data.assignmentId}`,
      );
    }
  }, [fetcher.state, fetcher.data, navigate, cohortId]);
  const defaultDue = new Date(Date.now() + 7 * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 16);
  return (
    <fetcher.Form
      method="post"
      action="/api/admin/assignment"
      className="bg-card space-y-2 rounded-md border p-4"
    >
      <input type="hidden" name="intent" value="convert_week" />
      <input type="hidden" name="cohortId" value={cohortId} />
      <p className="text-muted-foreground text-xs">
        커리큘럼 주차의 학습 항목들을 한 번에 과제로 변환합니다 (강의 항목은 자동 제외).
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_200px]">
        <div>
          <Label className="text-muted-foreground text-[11px]">주차 *</Label>
          <select
            name="weekId"
            required
            className="border-input bg-background mt-1 h-8 w-full rounded-md border px-2 text-xs"
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
