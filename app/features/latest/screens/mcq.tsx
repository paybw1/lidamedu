// 최신 객관식 문제 색인 (feat-3-301) — PPT 운영계획 반영.
// 컬럼: No · 과목 · 구분(기출/모의) · 명칭 · 출제일.
// 기출 클릭 → pack 상세 (문제 목록 + 동영상 + 결과자료 + 학습 시작).
// 모의 클릭 → pack 상세 (모의고사 시작 버튼).

import {
  BookOpenCheckIcon,
  ChevronRightIcon,
  FilterXIcon,
  ListChecksIcon,
  NewspaperIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  Trash2Icon,
  XIcon,
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
import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  MCQ_PACK_KIND_LABELS,
  MCQ_PACK_KIND_SHORT,
  MCQ_PACK_SUBJECT_LABELS,
  type McqPackItem,
  type McqPackKind,
  type McqPackSubjectScope,
} from "~/features/mcq-packs/labels";
import { listPacks } from "~/features/mcq-packs/queries.server";

import type { Route } from "./+types/mcq";

export const meta: Route.MetaFunction = () => [
  { title: "객관식 문제 색인 | Lidam Edu" },
];

const KINDS: Array<{ value: McqPackKind | "all"; label: string }> = [
  { value: "all", label: "전체" },
  { value: "past_exam", label: "기출" },
  { value: "mock_full", label: "전체 모의" },
  { value: "mock_progressive", label: "진도별 모의" },
  { value: "other", label: "기타" },
];

const SCOPES: Array<{ value: McqPackSubjectScope | "all"; label: string }> = [
  { value: "all", label: "전체 과목" },
  { value: "industrial", label: MCQ_PACK_SUBJECT_LABELS.industrial },
  { value: "civil", label: MCQ_PACK_SUBJECT_LABELS.civil },
  { value: "civil_procedure", label: MCQ_PACK_SUBJECT_LABELS.civil_procedure },
  { value: "science", label: MCQ_PACK_SUBJECT_LABELS.science },
];

interface Filters {
  q: string;
  subjectScope?: McqPackSubjectScope;
  kind?: McqPackKind;
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);

  const url = new URL(request.url);
  const subjectScopeRaw = url.searchParams.get("subject");
  const subjectScope: McqPackSubjectScope | undefined =
    subjectScopeRaw === "industrial" ||
    subjectScopeRaw === "civil" ||
    subjectScopeRaw === "civil_procedure" ||
    subjectScopeRaw === "science"
      ? subjectScopeRaw
      : undefined;
  const kindRaw = url.searchParams.get("kind");
  const kind: McqPackKind | undefined =
    kindRaw === "past_exam" ||
    kindRaw === "mock_full" ||
    kindRaw === "mock_progressive" ||
    kindRaw === "other"
      ? kindRaw
      : undefined;
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const filters: Filters = { q, subjectScope, kind };

  const packs = await listPacks(client, {
    query: filters.q || undefined,
    subjectScope: filters.subjectScope,
    kind: filters.kind,
  });

  return { packs, filters, canEdit: role !== null };
}

export default function LatestMcq({ loaderData }: Route.ComponentProps) {
  const { packs, filters, canEdit } = loaderData;
  const [showAdd, setShowAdd] = useState(false);
  const filterActive = !!filters.subjectScope || !!filters.kind || filters.q !== "";

  return (
    <div className="mx-auto w-full max-w-screen-xl px-5 py-6 md:px-10 md:py-8">
      <header className="mb-6 space-y-2">
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
          <NewspaperIcon className="size-3.5" /> 최신 정보
        </p>
        <div className="flex items-center justify-between gap-2">
          <h1 className="inline-flex items-center gap-2 text-2xl font-bold tracking-tight">
            <ListChecksIcon className="text-primary size-6" />
            1차 객관식 문제 색인
          </h1>
          {canEdit && !showAdd ? (
            <div className="flex gap-2">
              <RegenPastExamButton />
              <Button size="sm" onClick={() => setShowAdd(true)}>
                <PlusIcon className="size-3.5" /> 문제집 추가
              </Button>
            </div>
          ) : null}
        </div>
        <p className="text-muted-foreground text-sm">
          기출문제와 모의고사문제의 목록입니다. 클릭하면 문제·정답·해설·동영상 풀이가 열리고,
          모의고사는 정해진 시간 안에 풀이 후 결과 통계를 확인할 수 있습니다.
        </p>
      </header>

      {canEdit && showAdd ? (
        <div className="mb-4">
          <PackForm mode="create" onClose={() => setShowAdd(false)} />
        </div>
      ) : null}

      <Form
        method="get"
        className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]"
      >
        <div className="relative">
          <SearchIcon className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            type="search"
            name="q"
            defaultValue={filters.q}
            placeholder="명칭 / 설명 검색"
            className="pl-9"
          />
        </div>
        <select
          name="subject"
          defaultValue={filters.subjectScope ?? "all"}
          className="border-input bg-background h-9 rounded-md border px-2 text-xs"
        >
          {SCOPES.map((o) => (
            <option key={o.value} value={o.value === "all" ? "" : o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          name="kind"
          defaultValue={filters.kind ?? "all"}
          className="border-input bg-background h-9 rounded-md border px-2 text-xs"
        >
          {KINDS.map((o) => (
            <option key={o.value} value={o.value === "all" ? "" : o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" className="h-9">
          적용
        </Button>
      </Form>
      {filterActive ? (
        <div className="mb-4">
          <Button asChild type="button" size="sm" variant="ghost" className="h-7">
            <Link to="/latest/mcq">
              <FilterXIcon className="size-3.5" /> 초기화
            </Link>
          </Button>
        </div>
      ) : null}

      {packs.length === 0 ? (
        <div className="bg-muted/40 rounded-md border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-sm">
            {canEdit
              ? "등록된 문제집이 없습니다. 상단 '문제집 추가' 버튼으로 시작하세요."
              : "등록된 문제집이 없습니다."}
          </p>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-center">No</TableHead>
                  <TableHead className="w-32">과목</TableHead>
                  <TableHead className="w-24">구분</TableHead>
                  <TableHead>명칭</TableHead>
                  <TableHead className="w-28">출제일</TableHead>
                  <TableHead className="w-20 text-center">문항</TableHead>
                  {canEdit ? <TableHead className="w-20"></TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {packs.map((p, i) => (
                  <PackRow
                    key={p.packId}
                    pack={p}
                    index={i + 1}
                    canEdit={canEdit}
                  />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// 기존 problems(origin=past_exam, exam_round=first)을 (subject_scope, year)별로 묶어
// past_exam 팩을 자동 생성/갱신. 기존 팩이 있으면 문제 목록 교체.
function RegenPastExamButton() {
  const fetcher = useFetcher<
    | { ok: true; packsUpserted: number; problemsTotal: number }
    | { error: string }
  >();
  const navigate = useNavigate();
  const location = useLocation();
  const isLoading = fetcher.state !== "idle";
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
  const result =
    fetcher.data && "ok" in fetcher.data && fetcher.data.ok
      ? fetcher.data
      : null;
  const err =
    fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;
  return (
    <div className="flex items-center gap-2">
      <fetcher.Form
        method="post"
        action="/api/admin/mcq-pack"
        onSubmit={(e) => {
          if (
            !confirm(
              "기존 객관식 기출 문제를 (과목, 년도) 별로 자동 묶어 'YYYY년 1차 기출' 팩을 생성/갱신합니다.\n수동으로 추가한 문제는 사라질 수 있습니다.\n진행할까요?",
            )
          ) {
            e.preventDefault();
          }
        }}
      >
        <input type="hidden" name="intent" value="regen_past_exam" />
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={isLoading}
        >
          <RefreshCwIcon
            className={"size-3.5 " + (isLoading ? "animate-spin" : "")}
          />
          기출 자동 재생성
        </Button>
      </fetcher.Form>
      {result ? (
        <span className="text-emerald-600 text-xs tabular-nums">
          {result.packsUpserted}개 팩 · {result.problemsTotal}문항
        </span>
      ) : null}
      {err ? <span className="text-rose-600 text-xs">{err}</span> : null}
    </div>
  );
}

const KIND_BADGE_VARIANT: Record<
  McqPackKind,
  "default" | "secondary" | "outline"
> = {
  past_exam: "default",
  mock_full: "secondary",
  mock_progressive: "secondary",
  other: "outline",
};

function PackRow({
  pack,
  index,
  canEdit,
}: {
  pack: McqPackItem;
  index: number;
  canEdit: boolean;
}) {
  const detailHref = `/latest/mcq/${pack.packId}`;
  return (
    <TableRow>
      <TableCell className="text-muted-foreground text-center text-xs tabular-nums">
        {index}
      </TableCell>
      <TableCell className="text-xs">
        {MCQ_PACK_SUBJECT_LABELS[pack.subjectScope]}
      </TableCell>
      <TableCell>
        <Badge
          variant={KIND_BADGE_VARIANT[pack.kind]}
          className="text-xs"
        >
          {MCQ_PACK_KIND_SHORT[pack.kind]}
          {!pack.isPublished ? " · 비공개" : ""}
        </Badge>
      </TableCell>
      <TableCell>
        <Link
          to={detailHref}
          viewTransition
          className="hover:text-primary inline-flex items-center gap-1 text-sm font-medium"
        >
          {pack.title}
          <ChevronRightIcon className="text-muted-foreground size-3" />
        </Link>
        {pack.description ? (
          <p className="text-muted-foreground mt-0.5 line-clamp-1 text-xs">
            {pack.description}
          </p>
        ) : null}
      </TableCell>
      <TableCell className="text-muted-foreground text-xs tabular-nums">
        {pack.publishedAt
          ? pack.publishedAt.slice(0, 7).replace("-", "/")
          : "—"}
      </TableCell>
      <TableCell className="text-center text-xs tabular-nums">
        {pack.problemCount}
      </TableCell>
      {canEdit ? (
        <TableCell className="text-right">
          <PackRowActions pack={pack} />
        </TableCell>
      ) : null}
    </TableRow>
  );
}

function PackRowActions({ pack }: { pack: McqPackItem }) {
  const [editing, setEditing] = useState(false);
  const delFetcher = useFetcher<{ ok?: true; error?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (
      delFetcher.state === "idle" &&
      delFetcher.data &&
      "ok" in delFetcher.data &&
      delFetcher.data.ok
    ) {
      navigate(location.pathname + location.search, {
        replace: true,
        preventScrollReset: true,
      });
    }
  }, [delFetcher.state, delFetcher.data, navigate, location.pathname, location.search]);

  if (editing) {
    return (
      <PackForm mode="update" pack={pack} onClose={() => setEditing(false)} />
    );
  }
  return (
    <div className="inline-flex gap-1">
      <Button
        size="icon"
        variant="ghost"
        onClick={() => setEditing(true)}
        aria-label="수정"
        className="size-7"
      >
        <PencilIcon className="size-3.5" />
      </Button>
      <delFetcher.Form method="post" action="/api/admin/mcq-pack">
        <input type="hidden" name="intent" value="delete" />
        <input type="hidden" name="packId" value={pack.packId} />
        <Button
          type="submit"
          size="icon"
          variant="ghost"
          aria-label="삭제"
          className="size-7 text-rose-600 hover:text-rose-700"
          disabled={delFetcher.state !== "idle"}
          onClick={(e) => {
            if (!confirm(`"${pack.title}" 문제집을 삭제하시겠습니까?`)) {
              e.preventDefault();
            }
          }}
        >
          <Trash2Icon className="size-3.5" />
        </Button>
      </delFetcher.Form>
    </div>
  );
}

// 폼은 row 위에 카드 형태로 펼침 — 좁은 행 inline 보다 가독성 우선.
function PackForm({
  mode,
  pack,
  onClose,
}: {
  mode: "create" | "update";
  pack?: McqPackItem;
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
      action="/api/admin/mcq-pack"
      className="bg-card space-y-3 rounded-md border p-4"
    >
      <input type="hidden" name="intent" value={mode} />
      {mode === "update" ? (
        <input type="hidden" name="packId" value={pack!.packId} />
      ) : null}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[120px_1fr_120px_1fr]">
        <Field label="구분 *">
          <select
            name="kind"
            defaultValue={pack?.kind ?? "past_exam"}
            className="border-input bg-background h-8 w-full rounded-md border px-2 text-xs"
          >
            {KINDS.filter((k) => k.value !== "all").map((k) => (
              <option key={k.value} value={k.value}>
                {MCQ_PACK_KIND_LABELS[k.value as McqPackKind]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="과목 *">
          <select
            name="subjectScope"
            defaultValue={pack?.subjectScope ?? "industrial"}
            className="border-input bg-background h-8 w-full rounded-md border px-2 text-xs"
          >
            {SCOPES.filter((s) => s.value !== "all").map((s) => (
              <option key={s.value} value={s.value}>
                {MCQ_PACK_SUBJECT_LABELS[s.value as McqPackSubjectScope]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="명칭 *" full>
          <Input
            name="title"
            required
            maxLength={500}
            defaultValue={pack?.title ?? ""}
            className="h-8 text-xs"
            placeholder="예: 2026년 63회 1차 기출 / 2026년 1월 전체 모의"
          />
        </Field>
        <Field label="년도">
          <Input
            name="year"
            type="number"
            min={2000}
            max={2099}
            defaultValue={pack?.year ?? ""}
            className="h-8 text-xs"
            placeholder="2026"
          />
        </Field>
        <Field label="회차">
          <Input
            name="examRoundNo"
            type="number"
            min={1}
            max={999}
            defaultValue={pack?.examRoundNo ?? ""}
            className="h-8 text-xs"
            placeholder="63"
          />
        </Field>
        <Field label="제한 (분)">
          <Input
            name="durationMin"
            type="number"
            min={1}
            max={600}
            defaultValue={pack?.durationMin ?? ""}
            className="h-8 text-xs"
            placeholder="모의고사: 120"
          />
        </Field>
        <Field label="출제일">
          <Input
            name="publishedAt"
            type="date"
            defaultValue={pack?.publishedAt ?? ""}
            className="h-8 text-xs"
          />
        </Field>
        <Field label="동영상 URL" full>
          <Input
            name="videoUrl"
            type="url"
            maxLength={2000}
            defaultValue={pack?.videoUrl ?? ""}
            className="h-8 text-xs"
            placeholder="https://www.youtube.com/watch?v=..."
          />
        </Field>
        <Field label="결과 자료 URL" full>
          <Input
            name="resultDocUrl"
            type="url"
            maxLength={2000}
            defaultValue={pack?.resultDocUrl ?? ""}
            className="h-8 text-xs"
            placeholder="기출년도 시험 결과 자료 (PDF/외부)"
          />
        </Field>
        <Field label="설명" full>
          <textarea
            name="description"
            maxLength={5000}
            defaultValue={pack?.description ?? ""}
            rows={3}
            className="border-input bg-background w-full rounded-md border px-2 py-1 text-xs"
          />
        </Field>
        <Field label="공개 여부">
          <label className="border-input flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-xs">
            <input
              type="checkbox"
              name="isPublished"
              defaultChecked={pack?.isPublished ?? true}
              value="1"
              className="size-3.5"
            />
            학생에게 공개
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
          {mode === "create" ? (
            <>
              <PlusIcon className="size-3.5" /> 추가
            </>
          ) : (
            <>
              <BookOpenCheckIcon className="size-3.5" /> 저장
            </>
          )}
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
