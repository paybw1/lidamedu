// 반 상세 + 멤버 관리. 본인 소유 반(또는 admin)만 접근.

import {
  ArchiveIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  BarChart3Icon,
  BookCheckIcon,
  CalendarRangeIcon,
  MailIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  TrendingUpIcon,
  UserIcon,
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
import makeServerClient from "~/core/lib/supa-client.server";
import type { CohortListItem, CohortMember } from "~/features/cohorts/labels";
import {
  getCohortById,
  listCohortMembers,
  searchStudents,
  type SearchStudentResult,
} from "~/features/cohorts/queries.server";
import {
  listCohortCurricula,
  listCurricula,
  type CohortCurriculumRow,
  type CurriculumListItem,
} from "~/features/curricula/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/admin-cohort-detail";

export const meta: Route.MetaFunction = ({ data: d }) => {
  if (!d || !d.cohort) return [{ title: "반 상세 | Lidam Edu" }];
  return [{ title: `${d.cohort.name} | Lidam Edu` }];
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

  const members = await listCohortMembers(client, params.cohortId);

  // 검색 쿼리 (멤버 추가용).
  const url = new URL(request.url);
  const searchQuery = (url.searchParams.get("add_q") ?? "").trim().slice(0, 100);
  const searchResults: SearchStudentResult[] =
    searchQuery.length >= 2 ? await searchStudents(searchQuery) : [];

  // 적용된 커리큘럼 + 적용 가능한 전체 목록
  const [cohortCurricula, allCurricula] = await Promise.all([
    listCohortCurricula(params.cohortId),
    listCurricula(),
  ]);

  return {
    cohort,
    members,
    searchQuery,
    searchResults,
    role,
    cohortCurricula,
    allCurricula,
  };
}

export default function AdminCohortDetail({
  loaderData,
}: Route.ComponentProps) {
  const { cohort, members, searchQuery, searchResults, cohortCurricula, allCurricula } =
    loaderData;
  const [editing, setEditing] = useState(false);

  return (
    <div className="mx-auto w-full max-w-screen-xl px-5 py-6 md:px-10 md:py-8">
      <Link
        to="/admin/cohorts"
        className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-xs"
      >
        <ArrowLeftIcon className="size-3" /> 반 목록
      </Link>

      <header className="mb-6 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={cohort.isArchived ? "outline" : "default"}>
            {cohort.isArchived ? "아카이브" : "활성"}
          </Badge>
          {cohort.ownerName ? (
            <Badge variant="secondary">담당 {cohort.ownerName}</Badge>
          ) : null}
          <Badge variant="outline" className="ml-auto gap-1">
            <UsersIcon className="size-3" />
            {members.length}명
          </Badge>
        </div>
        <div className="flex items-center justify-between gap-2">
          <h1 className="inline-flex items-center gap-2 text-2xl font-bold tracking-tight">
            <UsersIcon className="text-primary size-6" />
            {cohort.name}
          </h1>
          {!editing ? (
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm">
                <Link to={`/admin/cohorts/${cohort.cohortId}/progress`}>
                  <TrendingUpIcon className="size-3.5" /> 진도
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to={`/admin/cohorts/${cohort.cohortId}/stats`}>
                  <BarChart3Icon className="size-3.5" /> 통계
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to={`/admin/cohorts/${cohort.cohortId}/assignments`}>
                  <BookCheckIcon className="size-3.5" /> 과제
                </Link>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditing(true)}
              >
                <PencilIcon className="size-3.5" /> 반 정보 수정
              </Button>
            </div>
          ) : null}
        </div>
        {cohort.description ? (
          <p className="text-muted-foreground text-sm whitespace-pre-line">
            {cohort.description}
          </p>
        ) : null}
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs tabular-nums">
          <CalendarRangeIcon className="size-3" />
          {cohort.startsOn ?? "—"} ~ {cohort.endsOn ?? "—"}
        </p>
      </header>

      {editing ? (
        <div className="mb-6">
          <CohortEditForm cohort={cohort} onClose={() => setEditing(false)} />
        </div>
      ) : null}

      <div className="mb-6">
        <CurriculumSection
          cohortId={cohort.cohortId}
          applied={cohortCurricula}
          available={allCurricula}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader className="px-4 pb-2">
            <p className="text-sm font-semibold">멤버 ({members.length}명)</p>
          </CardHeader>
          <Separator />
          <CardContent className="p-0">
            {members.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-muted-foreground text-sm">
                  멤버가 없습니다. 우측 검색으로 학생을 추가하세요.
                </p>
              </div>
            ) : (
              <ul className="divide-y">
                {members.map((m) => (
                  <MemberRow
                    key={m.profileId}
                    member={m}
                    cohortId={cohort.cohortId}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="px-4 pb-2">
            <p className="inline-flex items-center gap-1 text-sm font-semibold">
              <PlusIcon className="text-primary size-4" /> 멤버 추가
            </p>
            <p className="text-muted-foreground text-xs">
              이름 또는 이메일로 학생을 검색해 추가하세요.
            </p>
          </CardHeader>
          <CardContent className="space-y-3 px-4 pb-4">
            <form method="get" className="flex gap-1.5">
              <Input
                name="add_q"
                defaultValue={searchQuery}
                placeholder="이름·이메일 (2자 이상)"
                className="h-8 text-xs"
              />
              <Button type="submit" size="sm" className="h-8">
                <SearchIcon className="size-3.5" />
              </Button>
            </form>
            {searchQuery.length > 0 && searchQuery.length < 2 ? (
              <p className="text-muted-foreground text-xs">
                2자 이상 입력하세요.
              </p>
            ) : null}
            {searchQuery.length >= 2 && searchResults.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                일치하는 사용자가 없습니다.
              </p>
            ) : null}
            <ul className="space-y-1.5">
              {searchResults.map((s) => {
                const alreadyMember = members.some(
                  (m) => m.profileId === s.profileId,
                );
                return (
                  <SearchResultRow
                    key={s.profileId}
                    student={s}
                    cohortId={cohort.cohortId}
                    alreadyMember={alreadyMember}
                  />
                );
              })}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const ROLE_BADGE: Record<CohortMember["role"], "default" | "secondary" | "outline"> = {
  student: "outline",
  instructor: "secondary",
  admin: "default",
};

const ROLE_LABEL: Record<CohortMember["role"], string> = {
  student: "수험생",
  instructor: "강사",
  admin: "원장",
};

function MemberRow({
  member,
  cohortId,
}: {
  member: CohortMember;
  cohortId: string;
}) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data &&
      "ok" in fetcher.data &&
      fetcher.data.ok
    ) {
      navigate(location.pathname + location.search, {
        replace: true,
        preventScrollReset: true,
      });
    }
  }, [fetcher.state, fetcher.data, navigate, location.pathname, location.search]);

  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <UserIcon className="text-muted-foreground size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Link
            to={`/admin/students/${member.profileId}`}
            viewTransition
            className="hover:text-primary text-sm font-medium"
          >
            {member.name}
          </Link>
          <Badge variant={ROLE_BADGE[member.role]} className="text-[10px]">
            {ROLE_LABEL[member.role]}
          </Badge>
        </div>
        {member.email ? (
          <p className="text-muted-foreground inline-flex items-center gap-1 text-xs">
            <MailIcon className="size-3" />
            {member.email}
          </p>
        ) : null}
      </div>
      <span className="text-muted-foreground hidden text-xs tabular-nums sm:inline">
        {member.joinedAt.slice(0, 10)}
      </span>
      <fetcher.Form method="post" action="/api/admin/cohort">
        <input type="hidden" name="intent" value="remove_member" />
        <input type="hidden" name="cohortId" value={cohortId} />
        <input type="hidden" name="profileId" value={member.profileId} />
        <Button
          type="submit"
          size="icon"
          variant="ghost"
          aria-label="제거"
          className="size-7 text-rose-600 hover:text-rose-700"
          disabled={fetcher.state !== "idle"}
          onClick={(e) => {
            if (!confirm(`"${member.name}" 을(를) 반에서 제거하시겠습니까?`)) {
              e.preventDefault();
            }
          }}
        >
          <Trash2Icon className="size-3.5" />
        </Button>
      </fetcher.Form>
    </li>
  );
}

function SearchResultRow({
  student,
  cohortId,
  alreadyMember,
}: {
  student: SearchStudentResult;
  cohortId: string;
  alreadyMember: boolean;
}) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data &&
      "ok" in fetcher.data &&
      fetcher.data.ok
    ) {
      navigate(location.pathname + location.search, {
        replace: true,
        preventScrollReset: true,
      });
    }
  }, [fetcher.state, fetcher.data, navigate, location.pathname, location.search]);
  const err =
    fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;

  return (
    <li className="flex items-center gap-2 rounded-md border p-2">
      <UserIcon className="text-muted-foreground size-3.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">
          {student.name || "(이름 없음)"}{" "}
          <span className="text-muted-foreground text-[10px]">
            · {ROLE_LABEL[student.role]}
          </span>
        </p>
        {student.email ? (
          <p className="text-muted-foreground truncate text-[10px]">
            {student.email}
          </p>
        ) : null}
      </div>
      {alreadyMember ? (
        <Badge variant="outline" className="text-[10px]">
          이미 멤버
        </Badge>
      ) : (
        <fetcher.Form method="post" action="/api/admin/cohort">
          <input type="hidden" name="intent" value="add_member" />
          <input type="hidden" name="cohortId" value={cohortId} />
          <input type="hidden" name="profileId" value={student.profileId} />
          <Button
            type="submit"
            size="sm"
            className="h-7"
            disabled={fetcher.state !== "idle"}
          >
            <PlusIcon className="size-3" /> 추가
          </Button>
        </fetcher.Form>
      )}
      {err ? <span className="text-rose-600 text-[10px]">{err}</span> : null}
    </li>
  );
}

function CurriculumSection({
  cohortId,
  applied,
  available,
}: {
  cohortId: string;
  applied: CohortCurriculumRow[];
  available: CurriculumListItem[];
}) {
  const [showApply, setShowApply] = useState(false);
  const appliedIds = new Set(applied.map((a) => a.curriculumId));
  // 미적용 + 발행된 커리큘럼만 후보
  const candidates = available.filter(
    (c) => !appliedIds.has(c.curriculumId) && c.isPublished,
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="inline-flex items-center gap-1.5 text-sm font-semibold">
            <BookCheckIcon className="text-primary size-4" />
            커리큘럼 ({applied.length})
          </p>
          {candidates.length > 0 ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowApply((v) => !v)}
            >
              <PlusIcon className="size-3.5" /> 커리큘럼 적용
            </Button>
          ) : (
            <Button asChild size="sm" variant="ghost">
              <Link to="/admin/curricula">
                관리 <ArrowRightIcon className="size-3" />
              </Link>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2 px-4 pb-4">
        {applied.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            적용된 커리큘럼이 없습니다.
            {candidates.length === 0
              ? " 먼저 /admin/curricula 에서 커리큘럼을 만들고 발행하세요."
              : ""}
          </p>
        ) : (
          <ul className="divide-y">
            {applied.map((a) => (
              <CurriculumAppliedRow key={a.curriculumId} row={a} />
            ))}
          </ul>
        )}
        {showApply ? (
          <CurriculumApplyForm
            cohortId={cohortId}
            candidates={candidates}
            onClose={() => setShowApply(false)}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

function CurriculumAppliedRow({ row }: { row: CohortCurriculumRow }) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data &&
      "ok" in fetcher.data &&
      fetcher.data.ok
    ) {
      navigate(location.pathname + location.search, {
        replace: true,
        preventScrollReset: true,
      });
    }
  }, [fetcher.state, fetcher.data, navigate, location.pathname, location.search]);
  return (
    <li className="flex items-center gap-2 py-2">
      <Link
        to={`/admin/curricula/${row.curriculumId}`}
        viewTransition
        className="hover:text-primary min-w-0 flex-1 truncate text-sm font-medium"
      >
        {row.curriculumName}
      </Link>
      <span className="text-muted-foreground text-xs tabular-nums">
        시작 {row.startDate}
      </span>
      {row.isActive ? (
        <Badge variant="default" className="text-[10px]">
          활성
        </Badge>
      ) : (
        <Badge variant="outline" className="text-[10px]">
          비활성
        </Badge>
      )}
      <fetcher.Form method="post" action="/api/admin/curriculum">
        <input type="hidden" name="intent" value="remove_from_cohort" />
        <input type="hidden" name="cohortId" value={row.cohortId} />
        <input type="hidden" name="curriculumId" value={row.curriculumId} />
        <Button
          type="submit"
          size="icon"
          variant="ghost"
          className="size-6 text-rose-600 hover:text-rose-700"
          onClick={(e) => {
            if (!confirm(`"${row.curriculumName}" 적용을 해제합니까?`)) {
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

function CurriculumApplyForm({
  cohortId,
  candidates,
  onClose,
}: {
  cohortId: string;
  candidates: CurriculumListItem[];
  onClose: () => void;
}) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data &&
      "ok" in fetcher.data &&
      fetcher.data.ok
    ) {
      onClose();
      navigate(location.pathname + location.search, {
        replace: true,
        preventScrollReset: true,
      });
    }
  }, [fetcher.state, fetcher.data, onClose, navigate, location.pathname, location.search]);
  return (
    <fetcher.Form
      method="post"
      action="/api/admin/curriculum"
      className="bg-muted/30 mt-2 space-y-2 rounded-md border p-3"
    >
      <input type="hidden" name="intent" value="apply_to_cohort" />
      <input type="hidden" name="cohortId" value={cohortId} />
      <div className="grid grid-cols-[1fr_140px] gap-2">
        <select
          name="curriculumId"
          required
          className="border-input bg-background h-8 rounded-md border px-2 text-xs"
        >
          {candidates.map((c) => (
            <option key={c.curriculumId} value={c.curriculumId}>
              {c.name} ({c.durationWeeks}주, 항목 {c.itemCount})
            </option>
          ))}
        </select>
        <Input
          name="startDate"
          type="date"
          required
          defaultValue={new Date().toISOString().slice(0, 10)}
          className="h-8 text-xs tabular-nums"
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
          적용
        </Button>
      </div>
    </fetcher.Form>
  );
}

function CohortEditForm({
  cohort,
  onClose,
}: {
  cohort: CohortListItem;
  onClose: () => void;
}) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isSaving = fetcher.state !== "idle";
  const hasError = fetcher.data && "error" in fetcher.data;
  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data &&
      "ok" in fetcher.data &&
      fetcher.data.ok
    ) {
      onClose();
      navigate(location.pathname + location.search, {
        replace: true,
        preventScrollReset: true,
      });
    }
  }, [fetcher.state, fetcher.data, onClose, navigate, location.pathname, location.search]);

  return (
    <fetcher.Form
      method="post"
      action="/api/admin/cohort"
      className="bg-card space-y-3 rounded-md border p-4"
    >
      <input type="hidden" name="intent" value="update" />
      <input type="hidden" name="cohortId" value={cohort.cohortId} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[120px_1fr_120px_1fr]">
        <Field label="이름 *" full>
          <Input
            name="name"
            required
            maxLength={200}
            defaultValue={cohort.name}
            className="h-8 text-xs"
          />
        </Field>
        <Field label="시작일">
          <Input
            name="startsOn"
            type="date"
            defaultValue={cohort.startsOn ?? ""}
            className="h-8 text-xs"
          />
        </Field>
        <Field label="종료일">
          <Input
            name="endsOn"
            type="date"
            defaultValue={cohort.endsOn ?? ""}
            className="h-8 text-xs"
          />
        </Field>
        <Field label="설명" full>
          <textarea
            name="description"
            maxLength={2000}
            defaultValue={cohort.description ?? ""}
            rows={3}
            className="border-input bg-background w-full rounded-md border px-2 py-1 text-xs"
          />
        </Field>
        <Field label="아카이브">
          <label className="border-input flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-xs">
            <input
              type="checkbox"
              name="isArchived"
              value="1"
              defaultChecked={cohort.isArchived}
              className="size-3.5"
            />
            <ArchiveIcon className="size-3" /> 아카이브로 표시
          </label>
        </Field>
      </div>
      {hasError ? (
        <p className="text-rose-600 text-xs">
          {(fetcher.data as { error: string }).error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClose}
          disabled={isSaving}
        >
          <XIcon className="size-3.5" /> 취소
        </Button>
        <Button type="submit" size="sm" disabled={isSaving}>
          <PencilIcon className="size-3.5" /> 저장
        </Button>
      </div>
    </fetcher.Form>
  );
}

function Field({
  label,
  full,
  children,
}: {
  label: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      <Label className="text-muted-foreground text-[11px] sm:self-center">
        {label}
      </Label>
      <div className={full ? "sm:col-span-3" : ""}>{children}</div>
    </>
  );
}
