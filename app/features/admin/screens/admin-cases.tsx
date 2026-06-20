// 운영자 case ↔ article 매핑 도구.
// 리스킨: AdminShell(cluster=cases, P2), FilterBar + Form, IndexTable 대신 카드 목록 유지(매핑 인터랙션 필요).

import {
  CheckCircle2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  GavelIcon,
  PencilIcon,
  PlusIcon,
  ScaleIcon,
  SearchIcon,
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
import makeServerClient from "~/core/lib/supa-client.server";
import { COURT_LABELS, type CaseCourt } from "~/features/cases/labels";
import {
  listCasesForMapper,
  type CaseMapperRow,
  type CaseMapperSort,
} from "~/features/admin/queries/case-mapper.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { AdminSelect, Chip } from "~/features/admin/components/admin-ui";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  FIRST_EXAM_LAW_SLUGS,
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
  SECOND_EXAM_LAW_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-cases";

export const meta: Route.MetaFunction = () => [
  { title: "판례 매핑 관리 | Lidam Patent Attorney Academy" },
];

const MIN_YEAR = 1900;
const MAX_YEAR = 2200;

function parseYearParam(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < MIN_YEAR || n > MAX_YEAR) return null;
  return n;
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const lawCodeRaw = url.searchParams.get("law") ?? "patent";
  const lawCode = (LAW_SUBJECT_SLUGS as readonly string[]).includes(lawCodeRaw)
    ? (lawCodeRaw as LawSubjectSlug)
    : "patent";
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const onlyUnmapped = url.searchParams.get("only_unmapped") === "1";
  const courtRaw = url.searchParams.get("court") ?? "";
  const court: CaseCourt | null = (
    ["supreme", "patent_court", "high_court", "district_court"] as const
  ).includes(courtRaw as CaseCourt)
    ? (courtRaw as CaseCourt)
    : null;
  const yearFrom = parseYearParam(url.searchParams.get("year_from"));
  const yearTo = parseYearParam(url.searchParams.get("year_to"));
  const sortRaw = url.searchParams.get("sort") ?? "unmapped_first";
  const sort: CaseMapperSort = (
    ["unmapped_first", "many_first", "decided_desc", "case_no"] as const
  ).includes(sortRaw as CaseMapperSort)
    ? (sortRaw as CaseMapperSort)
    : "unmapped_first";
  const pageRaw = Number(url.searchParams.get("page") ?? "1");
  const page =
    Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;

  const result = await listCasesForMapper(client, {
    lawCode,
    query: q || undefined,
    court: court ?? undefined,
    yearFrom: yearFrom ?? undefined,
    yearTo: yearTo ?? undefined,
    onlyUnmapped,
    sort,
    page,
    pageSize: 30,
  });
  return {
    ...result,
    lawCode,
    q,
    court,
    yearFrom,
    yearTo,
    onlyUnmapped,
    sort,
    role,
  };
}

/* ── 페이지 ──────────────────────────────────────────────────────────── */

export default function AdminCases({ loaderData }: Route.ComponentProps) {
  const {
    items,
    total,
    unmappedTotal,
    page,
    pageSize,
    lawCode,
    q,
    court,
    yearFrom,
    yearTo,
    onlyUnmapped,
    sort,
    role,
  } = loaderData;
  const subjectName = LAW_SUBJECTS[lawCode].name;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const baseSp = new URLSearchParams();
  baseSp.set("law", lawCode);
  if (q) baseSp.set("q", q);
  if (court) baseSp.set("court", court);
  if (yearFrom != null) baseSp.set("year_from", String(yearFrom));
  if (yearTo != null) baseSp.set("year_to", String(yearTo));
  if (onlyUnmapped) baseSp.set("only_unmapped", "1");
  if (sort !== "unmapped_first") baseSp.set("sort", sort);
  const makePage = (n: number) => {
    const sp = new URLSearchParams(baseSp);
    if (n !== 1) sp.set("page", String(n));
    return `?${sp.toString()}`;
  };

  const filterActive = !!(
    q ||
    court ||
    yearFrom != null ||
    yearTo != null ||
    onlyUnmapped ||
    sort !== "unmapped_first"
  );

  return (
    <AdminShell
      cluster="cases"
      role={role}
      title={`${subjectName} 판례 매핑`}
      desc="판례↔조문 매핑을 한 화면에서 관리합니다. 초록 chip = 수동, 파랑 chip = 자동 추출."
      headerRight={
        <Button asChild size="sm">
          <Link to="/admin/cases/edit">
            <PlusIcon className="size-3.5" /> 판례 신규 등록
          </Link>
        </Button>
      }
    >
      {/* KPI */}
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <KpiCard label="현재 결과" value={String(total)} />
        <KpiCard
          label="미매핑"
          value={String(unmappedTotal)}
          warn={unmappedTotal > 0}
        />
        <KpiCard label="페이지" value={`${page} / ${totalPages}`} />
        <KpiCard label="정렬" value={SORT_LABEL[sort]} />
      </div>

      {/* 필터 */}
      <Form
        method="get"
        className="border-border bg-card mb-4 flex flex-wrap items-end gap-2.5 rounded-xl border p-3 shadow-sm"
      >
        <div className="relative min-w-[200px] flex-1 basis-[240px] sm:max-w-[280px]">
          <SearchIcon className="text-muted-foreground absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="사건번호·사건명·요지 검색"
            aria-label="판례 검색"
            className="bg-muted/60 focus:bg-background focus:border-primary h-9 w-full rounded-full border border-transparent pr-3 pl-9 text-[13px] outline-none"
          />
        </div>

        <FilterLabel label="과목">
          <AdminSelect
            name="law"
            defaultValue={lawCode}
            title="과목"
          >
            <optgroup label="1차 · 객관식">
              {FIRST_EXAM_LAW_SLUGS.map((s) => (
                <option key={s} value={s}>
                  {LAW_SUBJECTS[s].name}
                </option>
              ))}
            </optgroup>
            <optgroup label="2차 · 주관식">
              {SECOND_EXAM_LAW_SLUGS.map((s) => (
                <option key={s} value={s}>
                  {LAW_SUBJECTS[s].name}
                </option>
              ))}
            </optgroup>
          </AdminSelect>
        </FilterLabel>

        <FilterLabel label="법원">
          <AdminSelect name="court" defaultValue={court ?? ""}>
            <option value="">전체 법원</option>
            {Object.entries(COURT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </AdminSelect>
        </FilterLabel>

        <FilterLabel label="선고연도">
          <div className="border-input bg-background flex h-9 items-center gap-1 rounded-md border px-2.5 text-[13px]">
            <input
              type="number"
              name="year_from"
              defaultValue={yearFrom ?? ""}
              placeholder="시작"
              min={MIN_YEAR}
              max={MAX_YEAR}
              aria-label="선고 시작연도"
              className="w-16 bg-transparent text-center text-[13px] tabular-nums outline-none"
            />
            <span className="text-muted-foreground">~</span>
            <input
              type="number"
              name="year_to"
              defaultValue={yearTo ?? ""}
              placeholder="종료"
              min={MIN_YEAR}
              max={MAX_YEAR}
              aria-label="선고 종료연도"
              className="w-16 bg-transparent text-center text-[13px] tabular-nums outline-none"
            />
          </div>
        </FilterLabel>

        <FilterLabel label="정렬">
          <AdminSelect name="sort" defaultValue={sort}>
            <option value="unmapped_first">미매핑 우선</option>
            <option value="many_first">매핑 많은 순</option>
            <option value="decided_desc">선고일 ↓</option>
            <option value="case_no">사건번호</option>
          </AdminSelect>
        </FilterLabel>

        <label className="text-muted-foreground inline-flex h-9 items-center gap-1.5 text-[13px]">
          <input
            type="checkbox"
            name="only_unmapped"
            value="1"
            defaultChecked={onlyUnmapped}
            className="accent-primary size-3.5"
          />
          미매핑만
        </label>

        <Button type="submit" size="sm" variant="outline">
          적용
        </Button>
        {filterActive ? (
          <Link
            to={`/admin/cases?law=${lawCode}`}
            className="text-link inline-flex items-center gap-1 px-1 text-xs font-semibold"
          >
            초기화
          </Link>
        ) : null}
      </Form>

      {/* 목록 */}
      {items.length === 0 ? (
        <div className="border-border bg-card text-muted-foreground rounded-xl border py-16 text-center text-sm shadow-sm">
          <ScaleIcon className="text-muted-foreground/40 mx-auto mb-2 size-8" />
          조건에 해당하는 판례가 없습니다.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((c) => (
            <CaseMapperCard key={c.caseId} item={c} lawCode={lawCode} />
          ))}
        </div>
      )}

      {/* 페이지네이션 */}
      {totalPages > 1 ? (
        <div className="mt-6 flex items-center justify-center gap-2 text-xs">
          <Button
            asChild={page > 1}
            variant="outline"
            size="sm"
            disabled={page <= 1}
            className="h-7"
          >
            {page > 1 ? (
              <Link to={makePage(page - 1)}>
                <ChevronLeftIcon className="size-3" /> 이전
              </Link>
            ) : (
              <span>
                <ChevronLeftIcon className="size-3" /> 이전
              </span>
            )}
          </Button>
          <span className="text-muted-foreground tabular-nums">
            {page} / {totalPages}
          </span>
          <Button
            asChild={page < totalPages}
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            className="h-7"
          >
            {page < totalPages ? (
              <Link to={makePage(page + 1)}>
                다음 <ChevronRightIcon className="size-3" />
              </Link>
            ) : (
              <span>
                다음 <ChevronRightIcon className="size-3" />
              </span>
            )}
          </Button>
        </div>
      ) : null}
    </AdminShell>
  );
}

/* ── 로컬 상수 ──────────────────────────────────────────────────────── */

const SORT_LABEL: Record<CaseMapperSort, string> = {
  unmapped_first: "미매핑 우선",
  many_first: "매핑 많은 순",
  decided_desc: "선고일 ↓",
  case_no: "사건번호",
};

/* ── KpiCard ────────────────────────────────────────────────────────── */

function KpiCard({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className="border-border bg-card rounded-xl border p-4 shadow-sm">
      <p className="text-muted-foreground font-mono text-[11px] font-semibold tracking-[0.08em] uppercase">
        {label}
      </p>
      <p
        className={[
          "mt-2 text-2xl font-extrabold tracking-tight tabular-nums",
          warn
            ? "text-amber-700 dark:text-amber-400"
            : "text-foreground",
        ].join(" ")}
      >
        {value}
      </p>
    </div>
  );
}

/* ── FilterLabel ────────────────────────────────────────────────────── */

function FilterLabel({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-muted-foreground text-[11px] font-semibold">
        {label}
      </span>
      {children}
    </label>
  );
}

/* ── helper ─────────────────────────────────────────────────────────── */

function normalizeArticleNumber(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^제\s*/, "");
  s = s.replace(/\s*조$/, "");
  s = s.replace(/\s+/g, "");
  return s;
}

/* ── CaseMapperCard ─────────────────────────────────────────────────── */

function CaseMapperCard({
  item,
  lawCode,
}: {
  item: CaseMapperRow;
  lawCode: LawSubjectSlug;
}) {
  const addFetcher = useFetcher<{ ok?: true; error?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [draft, setDraft] = useState("");
  const normalized = normalizeArticleNumber(draft);
  const alreadyMapped =
    normalized.length > 0 && item.articleNumbers.includes(normalized);
  const isSaving = addFetcher.state !== "idle";
  const hasError = addFetcher.data && "error" in addFetcher.data;

  useEffect(() => {
    if (
      addFetcher.state === "idle" &&
      addFetcher.data &&
      "ok" in addFetcher.data &&
      addFetcher.data.ok
    ) {
      setDraft("");
      navigate(location.pathname + location.search, {
        replace: true,
        preventScrollReset: true,
      });
    }
  }, [
    addFetcher.state,
    addFetcher.data,
    navigate,
    location.pathname,
    location.search,
  ]);

  return (
    <div className="border-border bg-card overflow-hidden rounded-xl border shadow-sm">
      {/* 헤더 */}
      <div className="border-border/60 flex flex-wrap items-center gap-1.5 border-b px-4 py-3">
        <Chip tone="neutral">
          {COURT_LABELS[item.court as CaseCourt] ?? item.court}
        </Chip>
        <Chip tone="neutral" className="font-mono">
          {item.caseNumber}
        </Chip>
        {item.caseType ? (
          <Chip tone="neutral">{item.caseType}</Chip>
        ) : null}
        {item.importance >= 3 ? (
          <Chip tone="amber">★{item.importance}</Chip>
        ) : null}
        {item.linkCount === 0 ? (
          <Chip tone="coral">
            <GavelIcon className="size-3" /> 미매핑
          </Chip>
        ) : (
          <Chip tone="emerald">
            <CheckCircle2Icon className="size-3" /> {item.linkCount}건
          </Chip>
        )}
        <Link
          to={`/admin/cases/edit/${item.caseId}?returnTo=${encodeURIComponent(
            location.pathname + location.search,
          )}`}
          className="text-link hover:text-link/80 ml-auto inline-flex items-center gap-1 text-xs font-semibold"
        >
          <PencilIcon className="size-3" /> 수정
        </Link>
        <span className="text-muted-foreground text-xs tabular-nums">
          {item.decidedAt}
        </span>
      </div>

      {/* 본문 */}
      <div className="space-y-3 px-4 py-3">
        <Link
          to={`/subjects/${lawCode}/cases/${item.caseId}`}
          viewTransition
          className="hover:text-link block text-sm font-medium"
        >
          {item.summaryFirstTitle ?? item.summaryTitle ?? item.caseTitle}
        </Link>

        {item.links.length > 0 ? (
          <div className="space-y-1">
            <p className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
              현재 매핑 ({item.linkCount}건) — 클릭 시 조문 viewer / × 삭제
            </p>
            <div className="flex flex-wrap gap-1.5">
              {item.links.map((l) => (
                <ArticleChip
                  key={l.articleNumber}
                  articleNumber={l.articleNumber}
                  note={l.note}
                  caseId={item.caseId}
                  lawCode={lawCode}
                />
              ))}
            </div>
          </div>
        ) : null}

        <addFetcher.Form
          method="post"
          action="/api/admin/case-link"
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            if (!normalized || alreadyMapped) {
              e.preventDefault();
            }
          }}
        >
          <input type="hidden" name="intent" value="add" />
          <input type="hidden" name="caseId" value={item.caseId} />
          <input type="hidden" name="lawCode" value={lawCode} />
          <Input
            name="articleNumber"
            placeholder="조문 번호 — 예: 29 / 29의2 / 제29조"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className={
              "h-8 w-48 text-xs " +
              (alreadyMapped
                ? "border-amber-400 focus-visible:ring-amber-400"
                : "")
            }
            disabled={isSaving}
          />
          <Button
            type="submit"
            size="sm"
            className="h-8"
            disabled={isSaving || !normalized || alreadyMapped}
          >
            <PlusIcon className="size-3.5" /> 매핑 추가
          </Button>
          {alreadyMapped ? (
            <span className="text-xs text-amber-700 dark:text-amber-300">
              제{normalized}조는 이미 매핑되어 있습니다 (위 chip)
            </span>
          ) : hasError ? (
            <span className="text-xs text-rose-600">
              {(addFetcher.data as { error: string }).error}
            </span>
          ) : addFetcher.data && "ok" in addFetcher.data ? (
            <span className="text-xs text-emerald-600">저장됨</span>
          ) : null}
        </addFetcher.Form>
      </div>
    </div>
  );
}

/* ── ArticleChip ────────────────────────────────────────────────────── */

function ArticleChip({
  articleNumber,
  note,
  caseId,
  lawCode,
}: {
  articleNumber: string;
  note: string | null;
  caseId: string;
  lawCode: LawSubjectSlug;
}) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const removed = fetcher.data && "ok" in fetcher.data && fetcher.data.ok;

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
  }, [
    fetcher.state,
    fetcher.data,
    navigate,
    location.pathname,
    location.search,
  ]);

  const isManual = !note || note.includes("수동");
  const isAuto = !!note && !isManual;

  return (
    <span
      title={note ?? "수동 매핑"}
      className={[
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs",
        removed ? "opacity-50 line-through" : "",
        isAuto
          ? "border-sky-300 bg-sky-50/50 dark:border-sky-700 dark:bg-sky-950/20"
          : "border-emerald-300 bg-emerald-50/50 dark:border-emerald-700 dark:bg-emerald-950/20",
      ].join(" ")}
    >
      <Link
        to={`/subjects/${lawCode}/articles/${articleNumber}`}
        viewTransition
        className="hover:text-link"
      >
        제{articleNumber}조
      </Link>
      <fetcher.Form method="post" action="/api/admin/case-link">
        <input type="hidden" name="intent" value="remove" />
        <input type="hidden" name="caseId" value={caseId} />
        <input type="hidden" name="lawCode" value={lawCode} />
        <input type="hidden" name="articleNumber" value={articleNumber} />
        <button
          type="submit"
          aria-label="매핑 삭제"
          className="text-muted-foreground hover:text-rose-600"
          disabled={fetcher.state !== "idle"}
        >
          <XIcon className="size-3" />
        </button>
      </fetcher.Form>
    </span>
  );
}
