// 최신 객관식 문제 색인 (feat-3-301) — 관보식 색인표.
// 컬럼: No · 과목 · 구분(기출/모의) · 명칭 · 출제일 · 문항.
// 명칭 클릭 → 응시 즉시 시작 (기출=학습, 모의=시험). 상세 링크 → pack 상세.
// 키트 lidam-latest/McqIndexScreen 디자인.

import {
  BookOpenCheckIcon,
  ClockIcon,
  InfoIcon,
  ListChecksIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchXIcon,
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

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import { cn } from "~/core/lib/utils";
import {
  FilterSelect,
  IndexCard,
  LatestEmpty,
  LatestFilterForm,
  Pill,
} from "~/features/latest/components/latest-list";
import { LatestShell } from "~/features/latest/components/latest-shell";
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
  { title: "객관식 문제 | Lidam Patent Attorney Academy" },
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
  { value: "patent", label: MCQ_PACK_SUBJECT_LABELS.patent },
  { value: "trademark", label: MCQ_PACK_SUBJECT_LABELS.trademark },
  { value: "design", label: MCQ_PACK_SUBJECT_LABELS.design },
  { value: "industrial", label: MCQ_PACK_SUBJECT_LABELS.industrial },
  { value: "civil", label: MCQ_PACK_SUBJECT_LABELS.civil },
  { value: "civil_procedure", label: MCQ_PACK_SUBJECT_LABELS.civil_procedure },
  { value: "science", label: MCQ_PACK_SUBJECT_LABELS.science },
];

interface Filters {
  q: string;
  subjectScope?: McqPackSubjectScope;
  kind?: McqPackKind;
  year?: number;
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
    subjectScopeRaw === "patent" ||
    subjectScopeRaw === "trademark" ||
    subjectScopeRaw === "design" ||
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
  const yearRaw = url.searchParams.get("year");
  const year = yearRaw && /^\d{4}$/.test(yearRaw) ? Number(yearRaw) : undefined;
  const filters: Filters = { q, subjectScope, kind, year };

  const packs = await listPacks(client, {
    query: filters.q || undefined,
    subjectScope: filters.subjectScope,
    kind: filters.kind,
    year: filters.year,
  });

  return { packs, filters, canEdit: role !== null };
}

const COLUMNS = ["No", "과목", "구분", "명칭", "출제일", "문항"];

export default function LatestMcq({ loaderData }: Route.ComponentProps) {
  const { packs, filters, canEdit } = loaderData;
  const [showAdd, setShowAdd] = useState(false);
  const filterActive =
    !!filters.subjectScope ||
    !!filters.kind ||
    !!filters.year ||
    filters.q !== "";
  // 빠른 year 옵션 — 최근 12년.
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 13 }, (_, i) => currentYear - i);

  const descParts = [`${packs.length.toLocaleString("ko-KR")}건`];
  if (filters.subjectScope)
    descParts.push(MCQ_PACK_SUBJECT_LABELS[filters.subjectScope]);
  if (filters.kind)
    descParts.push(filters.kind === "past_exam" ? "기출" : "모의");
  if (filters.year) descParts.push(`${filters.year}년`);
  if (filters.q) descParts.push(`"${filters.q}" 검색`);

  return (
    <LatestShell
      category="mcq"
      width="index"
      title="객관식 문제"
      desc={`${descParts.join(" · ")} — 기출/모의 클릭 시 문제·해설·동영상·결과 통계로 진입합니다.`}
      headerRight={
        canEdit && !showAdd ? (
          <div className="flex gap-2">
            <RegenPastExamButton />
            <Button
              size="sm"
              className="h-9 rounded-full"
              onClick={() => setShowAdd(true)}
            >
              <PlusIcon className="size-3.5" /> 문제집 추가
            </Button>
          </div>
        ) : undefined
      }
    >
      {canEdit && showAdd ? (
        <div className="mb-3.5">
          <PackForm mode="create" onClose={() => setShowAdd(false)} />
        </div>
      ) : null}

      <LatestFilterForm
        search={{
          name: "q",
          placeholder: "명칭 / 설명 검색",
          defaultValue: filters.q,
        }}
        hasActive={filterActive}
        resetTo="/latest/mcq"
      >
        <FilterSelect
          name="subject"
          ariaLabel="과목"
          defaultValue={filters.subjectScope ?? ""}
          options={SCOPES.map((o) => ({
            value: o.value === "all" ? "" : o.value,
            label: o.label,
          }))}
        />
        <FilterSelect
          name="kind"
          ariaLabel="구분"
          defaultValue={filters.kind ?? ""}
          options={KINDS.map((o) => ({
            value: o.value === "all" ? "" : o.value,
            label: o.label,
          }))}
        />
        <FilterSelect
          name="year"
          ariaLabel="년도"
          defaultValue={filters.year ? String(filters.year) : ""}
          options={[
            { value: "", label: "전체 년도" },
            ...yearOptions.map((y) => ({
              value: String(y),
              label: `${y}년`,
            })),
          ]}
        />
      </LatestFilterForm>

      {packs.length === 0 ? (
        <LatestEmpty
          icon={filterActive ? SearchXIcon : ListChecksIcon}
          tone={filterActive ? "subdued" : "neutral"}
          title={
            filterActive
              ? "조건에 맞는 문제집이 없습니다"
              : "아직 등록된 문제집이 없습니다"
          }
          body={
            filterActive
              ? "검색어나 필터를 바꿔 다시 찾아보세요."
              : canEdit
                ? "상단 '문제집 추가' 버튼으로 첫 문제집을 등록하세요."
                : "기출·모의 문제집이 등록되면 이곳에 모입니다."
          }
        />
      ) : (
        <IndexCard>
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr className="border-border bg-muted/60 border-b">
                {COLUMNS.map((label, i) => (
                  <th
                    key={label}
                    className={cn(
                      "text-muted-foreground px-3 py-3 font-mono text-[11px] font-semibold tracking-[0.04em] whitespace-nowrap uppercase",
                      i === 0 || i === 5 ? "text-center" : "text-left",
                    )}
                  >
                    {label}
                  </th>
                ))}
                {canEdit ? <th className="w-20" /> : null}
              </tr>
            </thead>
            <tbody>
              {packs.map((p, i) => (
                <PackRow
                  key={p.packId}
                  pack={p}
                  index={i + 1}
                  canEdit={canEdit}
                />
              ))}
            </tbody>
          </table>
        </IndexCard>
      )}
    </LatestShell>
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
          className="h-9 rounded-full"
          disabled={isLoading}
        >
          <RefreshCwIcon
            className={cn("size-3.5", isLoading && "animate-spin")}
          />
          기출 자동 재생성
        </Button>
      </fetcher.Form>
      {result ? (
        <span className="text-xs text-emerald-600 tabular-nums">
          {result.packsUpserted}개 팩 · {result.problemsTotal}문항
        </span>
      ) : null}
      {err ? <span className="text-xs text-rose-600">{err}</span> : null}
    </div>
  );
}

const KIND_TONE: Record<
  McqPackKind,
  "primary" | "amber" | "outline"
> = {
  past_exam: "primary",
  mock_full: "amber",
  mock_progressive: "amber",
  other: "outline",
};

// 팩 종류별 기본 응시 모드 — 기출/기타는 학습 모드(즉시 해설), 모의는 시험 모드(타이머).
function defaultStartMode(kind: McqPackKind): "study" | "exam" {
  return kind === "mock_full" || kind === "mock_progressive" ? "exam" : "study";
}

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
  const mode = defaultStartMode(pack.kind);
  const isMock = mode === "exam";
  return (
    <tr className="border-border/60 hover:bg-muted/40 border-b transition-colors">
      <td className="text-muted-foreground px-3 py-3 text-center text-[13px] tabular-nums">
        {index}
      </td>
      <td className="px-3 py-3 text-[13px]">
        {MCQ_PACK_SUBJECT_LABELS[pack.subjectScope]}
      </td>
      <td className="px-3 py-3">
        <Pill tone={KIND_TONE[pack.kind]}>
          {MCQ_PACK_KIND_SHORT[pack.kind]}
          {!pack.isPublished ? " · 비공개" : ""}
        </Pill>
      </td>
      <td className="px-3 py-3">
        {/* 팩 제목 = 응시 즉시 시작 폼 버튼. mode 는 팩 종류에 따라 자동 선택. */}
        <Form
          method="post"
          action="/api/mcq-pack/start"
          className="inline-flex items-center gap-1.5"
        >
          <input type="hidden" name="packId" value={pack.packId} />
          <input type="hidden" name="mode" value={mode} />
          <button
            type="submit"
            disabled={pack.problemCount === 0}
            className="hover:text-primary inline-flex items-center gap-1 text-left text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            title={
              isMock
                ? "모의고사 응시 — 타이머 기반"
                : "응시 시작 — 즉시 해설 모드"
            }
          >
            {isMock ? (
              <ClockIcon className="text-primary size-3.5 shrink-0" />
            ) : (
              <PlayIcon className="text-primary size-3.5 shrink-0" />
            )}
            {pack.title}
          </button>
        </Form>
        <Link
          to={detailHref}
          viewTransition
          className="text-muted-foreground hover:text-foreground ml-2 inline-flex items-center gap-0.5 text-[11px]"
          title="문제 목록·동영상·결과자료 보기"
        >
          <InfoIcon className="size-2.5" /> 상세
        </Link>
        {pack.description ? (
          <p className="text-muted-foreground mt-0.5 line-clamp-1 text-xs">
            {pack.description}
          </p>
        ) : null}
      </td>
      <td className="text-muted-foreground px-3 py-3 text-[13px] tabular-nums">
        {pack.publishedAt
          ? pack.publishedAt.slice(0, 7).replace("-", "/")
          : "—"}
      </td>
      <td className="px-3 py-3 text-center text-[13px] tabular-nums">
        {pack.problemCount}
      </td>
      {canEdit ? (
        <td className="px-3 py-3 text-right">
          <PackRowActions pack={pack} />
        </td>
      ) : null}
    </tr>
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
        className="size-8 rounded-full"
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
          className="size-8 rounded-full text-rose-600 hover:text-rose-700"
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

// 폼은 row 위에 카드 형태로 펼침 — 좁은 행 inline 보다 가독성 우선 (brief §5.8).
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
      className="border-border bg-card space-y-3 rounded-2xl border p-4 shadow-sm"
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
              className="accent-primary size-3.5"
            />
            학생에게 공개
          </label>
        </Field>
      </div>
      {hasError ? (
        <p className="text-xs text-rose-600">
          {(fetcher.data as { error: string }).error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="rounded-full"
          onClick={onClose}
          disabled={isSaving}
        >
          <XIcon className="size-3.5" /> 취소
        </Button>
        <Button
          type="submit"
          size="sm"
          className="rounded-full"
          disabled={isSaving}
        >
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
