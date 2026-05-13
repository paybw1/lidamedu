// feat-7-020 — 커리큘럼 목록 + 신규.

import {
  BookCheckIcon,
  CheckCircle2Icon,
  ListChecksIcon,
  PencilIcon,
  PlusIcon,
  UsersIcon,
} from "lucide-react";
import { useState } from "react";
import {
  Form,
  Link,
  data,
  useFetcher,
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
import { getStaffRole } from "~/features/laws/queries.server";
import { listCurricula } from "~/features/curricula/queries.server";
import {
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-curricula";

export const meta: Route.MetaFunction = () => [
  { title: "커리큘럼 관리 | Lidam Edu" },
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
  return { curricula };
}

export default function AdminCurricula({ loaderData }: Route.ComponentProps) {
  const { curricula } = loaderData;
  const [showNew, setShowNew] = useState(false);

  return (
    <div className="mx-auto w-full max-w-screen-xl px-5 py-6 md:px-10 md:py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="inline-flex items-center gap-2 text-2xl font-bold tracking-tight">
            <BookCheckIcon className="text-primary size-6" />
            커리큘럼 관리
          </h1>
          <p className="text-muted-foreground text-sm">
            학습 트랙 템플릿 — cohort 에 적용하면 학생 대시보드에 자동 노출
          </p>
        </div>
        <Button size="sm" onClick={() => setShowNew((v) => !v)}>
          <PlusIcon className="size-3.5" /> 신규 커리큘럼
        </Button>
      </header>

      {showNew ? (
        <div className="mb-6">
          <NewCurriculumForm onClose={() => setShowNew(false)} />
        </div>
      ) : null}

      {curricula.length === 0 ? (
        <div className="bg-muted/40 rounded-md border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-sm">
            아직 커리큘럼이 없습니다. 우측 상단에서 신규 생성하세요.
          </p>
        </div>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <Table className="min-w-[720px]">
              <TableHeader>
                <TableRow>
                  <TableHead>이름</TableHead>
                  <TableHead className="w-24 text-xs">과목</TableHead>
                  <TableHead className="w-16 text-right">주수</TableHead>
                  <TableHead className="w-16 text-right">주차</TableHead>
                  <TableHead className="w-16 text-right">항목</TableHead>
                  <TableHead className="w-20 text-right">적용 반</TableHead>
                  <TableHead className="w-20 text-xs">상태</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {curricula.map((c) => (
                  <TableRow key={c.curriculumId}>
                    <TableCell>
                      <Link
                        to={`/admin/curricula/${c.curriculumId}`}
                        viewTransition
                        className="hover:text-primary text-sm font-medium"
                      >
                        {c.name}
                      </Link>
                      {c.description ? (
                        <p className="text-muted-foreground line-clamp-1 text-xs">
                          {c.description}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-[10px]">
                      {c.subjectLaws.length > 0
                        ? c.subjectLaws
                            .map((s) =>
                              s in LAW_SUBJECTS
                                ? LAW_SUBJECTS[
                                    s as keyof typeof LAW_SUBJECTS
                                  ].shortName
                                : s,
                            )
                            .join("·")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {c.durationWeeks}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {c.weekCount}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {c.itemCount}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        <UsersIcon className="text-muted-foreground size-3" />
                        {c.cohortCount}
                      </span>
                    </TableCell>
                    <TableCell>
                      {c.isPublished ? (
                        <Badge variant="default" className="text-[10px]">
                          <CheckCircle2Icon className="size-3" /> 발행
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">
                          초안
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Link
                        to={`/admin/curricula/${c.curriculumId}`}
                        viewTransition
                        className="text-primary inline-flex items-center text-xs hover:underline"
                      >
                        <PencilIcon className="size-3" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
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
      className="bg-card space-y-3 rounded-md border p-4"
    >
      <input type="hidden" name="intent" value="create" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="이름 *">
          <Input name="name" required maxLength={200} className="h-8 text-xs" />
        </Field>
        <Field label="기간 (주) *">
          <Input
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
          <Field label="설명">
            <textarea
              name="description"
              maxLength={2000}
              rows={2}
              className="border-input bg-background w-full rounded-md border px-2 py-1 text-xs"
            />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Label className="text-muted-foreground text-[11px]">
            과목 (선택 가능, 복수)
          </Label>
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
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClose}
          disabled={isSaving}
        >
          취소
        </Button>
        <Button type="submit" size="sm" disabled={isSaving}>
          <PlusIcon className="size-3.5" /> 생성
        </Button>
      </div>
    </fetcher.Form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="text-muted-foreground text-[11px]">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
