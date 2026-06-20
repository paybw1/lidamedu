// feat-7-020 — 커리큘럼 목록 + 신규.

import {
  BookCheckIcon,
  PlusIcon,
  UsersIcon,
} from "lucide-react";
import { useState } from "react";
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
  Chip,
  Field,
  IndexTable,
  StatusChip,
  TD,
  TR,
} from "~/features/admin/components/admin-ui";
import { listCurricula } from "~/features/curricula/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-curricula";

export const meta: Route.MetaFunction = () => [
  { title: "커리큘럼 관리 | Lidam Patent Attorney Academy" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });
  const curricula = await listCurricula();
  return { curricula, role };
}

export default function AdminCurricula({ loaderData }: Route.ComponentProps) {
  const { curricula, role } = loaderData;
  const [showNew, setShowNew] = useState(false);

  return (
    <AdminShell
      cluster="cohorts"
      role={role}
      title="커리큘럼 관리"
      desc="학습 트랙 템플릿 — cohort에 적용하면 학생 대시보드에 자동 노출"
      headerRight={
        <Button size="sm" onClick={() => setShowNew((v) => !v)}>
          <PlusIcon className="size-3.5" /> 신규 커리큘럼
        </Button>
      }
    >
      {showNew ? (
        <div className="mb-4">
          <NewCurriculumForm onClose={() => setShowNew(false)} />
        </div>
      ) : null}

      {curricula.length === 0 ? (
        <div className="border-border bg-card text-muted-foreground rounded-xl border py-16 text-center shadow-sm">
          <BookCheckIcon className="mx-auto mb-2 size-8 opacity-30" />
          <p className="text-sm font-medium">아직 커리큘럼이 없습니다.</p>
          <p className="mt-1 text-xs">우측 상단에서 신규 생성하세요.</p>
        </div>
      ) : (
        <IndexTable
          minWidth={720}
          headers={[
            { label: "이름" },
            { label: "과목", width: "8rem" },
            { label: "기간(주)", align: "right", width: "5rem" },
            { label: "주차", align: "right", width: "4rem" },
            { label: "항목", align: "right", width: "4rem" },
            { label: "적용 반", align: "right", width: "5rem" },
            { label: "상태", width: "5rem" },
            { label: "", width: "3rem" },
          ]}
          footer={
            <div className="border-border/60 text-muted-foreground border-t px-3 py-2 text-[11px] font-medium tabular-nums">
              총 {curricula.length}건
            </div>
          }
        >
          {curricula.map((c) => (
            <TR key={c.curriculumId}>
              <TD>
                <Link
                  to={`/admin/curricula/${c.curriculumId}`}
                  viewTransition
                  className="hover:text-link text-[13px] font-medium"
                >
                  {c.name}
                </Link>
                {c.description ? (
                  <p className="text-muted-foreground line-clamp-1 text-[11px]">
                    {c.description}
                  </p>
                ) : null}
              </TD>
              <TD soft>
                <span className="text-[11px]">
                  {c.subjectLaws.length > 0
                    ? c.subjectLaws
                        .map((s) =>
                          s in LAW_SUBJECTS
                            ? LAW_SUBJECTS[s as keyof typeof LAW_SUBJECTS].shortName
                            : s,
                        )
                        .join("·")
                    : "—"}
                </span>
              </TD>
              <TD align="right" mono>
                {c.durationWeeks}
              </TD>
              <TD align="right" mono>
                {c.weekCount}
              </TD>
              <TD align="right" mono>
                {c.itemCount}
              </TD>
              <TD align="right" mono soft>
                <span className="inline-flex items-center gap-1">
                  <UsersIcon className="text-muted-foreground size-3" />
                  {c.cohortCount}
                </span>
              </TD>
              <TD>
                <StatusChip
                  status={c.isPublished ? "published" : "draft"}
                  label={c.isPublished ? "발행" : "초안"}
                />
              </TD>
              <TD align="right">
                <Link
                  to={`/admin/curricula/${c.curriculumId}`}
                  viewTransition
                  className="text-link text-xs font-semibold hover:underline"
                >
                  편집
                </Link>
              </TD>
            </TR>
          ))}
        </IndexTable>
      )}
    </AdminShell>
  );
}

function NewCurriculumForm({ onClose }: { onClose: () => void }) {
  const fetcher = useFetcher<{ ok?: true; curriculumId?: string; error?: string }>();
  const navigate = useNavigate();
  const isSaving = fetcher.state !== "idle";
  if (
    fetcher.state === "idle" &&
    fetcher.data &&
    "ok" in fetcher.data &&
    fetcher.data.ok &&
    fetcher.data.curriculumId
  ) {
    navigate(`/admin/curricula/${fetcher.data.curriculumId}`, {
      viewTransition: true,
    });
  }
  const err = fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;
  return (
    <fetcher.Form
      method="post"
      action="/api/admin/curriculum"
      className="bg-card space-y-3 rounded-xl border p-4 shadow-sm"
    >
      <p className="text-xs font-semibold">신규 커리큘럼</p>
      <input type="hidden" name="intent" value="create" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="이름 *" htmlFor="new-name" required>
          <Input
            id="new-name"
            name="name"
            required
            maxLength={200}
            className="h-8 text-xs"
          />
        </Field>
        <Field label="기간 (주) *" htmlFor="new-dur" required>
          <Input
            id="new-dur"
            name="durationWeeks"
            type="number"
            required
            min={1}
            max={52}
            defaultValue={8}
            className="h-8 text-xs tabular-nums"
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="설명" htmlFor="new-desc">
            <textarea
              id="new-desc"
              name="description"
              maxLength={2000}
              rows={2}
              className="border-input bg-background w-full rounded-md border px-2 py-1 text-xs"
            />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Label className="text-muted-foreground text-[11px]">과목 (선택 가능, 복수)</Label>
          <div className="mt-1 flex flex-wrap gap-2">
            {LAW_SUBJECT_SLUGS.map((s) => (
              <label
                key={s}
                className="border-input flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-xs"
              >
                <input type="checkbox" name="subjectLaws" value={s} />
                {LAW_SUBJECTS[s].shortName}
              </label>
            ))}
          </div>
        </div>
      </div>
      {err ? <p className="text-rose-600 text-xs">{err}</p> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={isSaving}>
          취소
        </Button>
        <Button type="submit" size="sm" disabled={isSaving}>
          <PlusIcon className="size-3.5" /> 생성
        </Button>
      </div>
    </fetcher.Form>
  );
}
