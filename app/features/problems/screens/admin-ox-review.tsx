// 운영자 정오문제(OX) 검토 — 과목별 OX 후보 지문(choice/box-item) 일괄 검토 및 인라인 수정.
// 학생 노출 조건(active) 외에도 `ineligible`, `untruthed` 항목을 함께 보고 토글 가능.
// P6 REVIEW QUEUE 패턴 — AdminShell + IndexTable + 인라인 필터 + Chip.

import { CheckCircle2Icon, EditIcon } from "lucide-react";
import {
  Form,
  Link,
  data,
  useFetcher,
  useSearchParams,
} from "react-router";

import { Button } from "~/core/components/ui/button";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import {
  AdminSelect,
  Chip,
  FilterGroup,
  IndexTable,
  TD,
  TR,
} from "~/features/admin/components/admin-ui";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  listOxItemsForReview,
  listProblemYears,
  type OxReviewItem,
  type OxReviewStatus,
} from "~/features/problems/queries.server";
import {
  FIRST_EXAM_LAW_SLUGS,
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
  SECOND_EXAM_LAW_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-ox-review";

export const meta: Route.MetaFunction = () => [
  { title: "정오문제 관리 | Lidam Patent Attorney Academy" },
];

const STATUS_OPTIONS: { value: OxReviewStatus; label: string; hint: string }[] = [
  { value: "all", label: "전체", hint: "모든 후보" },
  {
    value: "active",
    label: "노출 중",
    hint: "ox_truth 설정 + 적격 + 조문 매핑됨 (학생 노출 조건)",
  },
  {
    value: "ineligible",
    label: "정오문제 불가",
    hint: "ox_ineligible=true",
  },
  {
    value: "untruthed",
    label: "미설정",
    hint: "ox_truth NULL 또는 조문 미매핑",
  },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const subjectParam = url.searchParams.get("subject") ?? "patent";
  const subject: LawSubjectSlug = LAW_SUBJECT_SLUGS.includes(
    subjectParam as never,
  )
    ? (subjectParam as LawSubjectSlug)
    : "patent";

  const statusParam = url.searchParams.get("status") as OxReviewStatus | null;
  const status: OxReviewStatus =
    statusParam === "active" ||
    statusParam === "ineligible" ||
    statusParam === "untruthed"
      ? statusParam
      : "all";

  const yearParam = url.searchParams.get("year");
  const year = yearParam ? Number(yearParam) : null;

  const [items, years] = await Promise.all([
    listOxItemsForReview(client, subject, {
      status,
      year: Number.isFinite(year) ? year : null,
      limit: 800,
    }),
    listProblemYears(client, subject),
  ]);

  // 카운트 — 상태별 (현재 subject + 연도 필터 기준).
  const counts = await listOxItemsForReview(client, subject, {
    status: "all",
    year: Number.isFinite(year) ? year : null,
    limit: 5000,
  }).then((all) => ({
    all: all.length,
    active: all.filter(
      (it) => !it.oxIneligible && it.oxTruth != null && it.relatedArticleId != null,
    ).length,
    ineligible: all.filter((it) => it.oxIneligible).length,
    untruthed: all.filter(
      (it) => !it.oxIneligible && (it.oxTruth == null || it.relatedArticleId == null),
    ).length,
  }));

  return { subject, status, year: Number.isFinite(year) ? year : null, items, years, counts, role };
}

export default function AdminOxReview({ loaderData }: Route.ComponentProps) {
  const { subject, status, year, items, years, counts, role } = loaderData;
  const [searchParams] = useSearchParams();
  const querySuffix = (next: Record<string, string>) => {
    const sp = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(next)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    return `?${sp.toString()}`;
  };

  return (
    <AdminShell
      cluster="problems"
      role={role}
      width={1280}
      title="정오문제 관리"
      desc={
        <>
          객관식 보기와 박스형 사례 지문 중 정오문제 후보를 한 화면에서 검토합니다.
          학생에게 노출되는 조건은{" "}
          <span className="font-semibold">노출 중</span> —{" "}
          <code className="bg-muted rounded px-1 text-[11px]">
            ox_truth NOT NULL · ox_ineligible=false · related_article 매핑됨
          </code>
        </>
      }
    >
      {/* 필터 바 */}
      <div className="border-border bg-card mb-3 rounded-xl border p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Form method="get" className="flex flex-wrap items-center gap-3">
            <FilterGroup label="과목">
              <AdminSelect name="subject" defaultValue={subject}>
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
            </FilterGroup>
            <FilterGroup label="연도">
              <AdminSelect name="year" defaultValue={year ?? ""}>
                <option value="">전체 연도</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </AdminSelect>
            </FilterGroup>
            <input type="hidden" name="status" value={status} />
            <Button type="submit" size="sm" variant="outline">
              적용
            </Button>
          </Form>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {STATUS_OPTIONS.map((opt) => {
            const isActive = status === opt.value;
            return (
              <Link
                key={opt.value}
                to={querySuffix({ status: opt.value })}
                title={opt.hint}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-[11px] font-semibold transition-colors whitespace-nowrap",
                  isActive
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:bg-muted/60",
                )}
              >
                {opt.label}
                <span className="tabular-nums">{counts[opt.value]}</span>
              </Link>
            );
          })}
          <span className="text-muted-foreground ml-auto text-xs">
            {LAW_SUBJECTS[subject].name} · 결과{" "}
            <span className="text-foreground font-bold tabular-nums">
              {items.length}
            </span>
            건
            {items.length >= 800 ? " (상한 800)" : ""}
          </span>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="border-border bg-card rounded-xl border py-16 text-center shadow-sm">
          <CheckCircle2Icon className="text-muted-foreground mx-auto mb-3 size-8" />
          <p className="text-muted-foreground text-sm">
            조건에 맞는 정오문제 후보가 없습니다.
          </p>
        </div>
      ) : (
        <IndexTable
          minWidth={780}
          headers={[
            { label: "출처/연도", width: "7rem" },
            { label: "유형", width: "6rem" },
            { label: "지문" },
            { label: "조문", width: "11rem" },
            { label: "정답 OX", width: "9rem" },
            { label: "정오문제 불가", width: "7rem" },
            { label: "편집", width: "4rem", align: "center" },
          ]}
        >
          {items.map((it) => (
            <OxReviewRow
              key={`${it.refType}:${it.refId}`}
              item={it}
              subject={subject}
            />
          ))}
        </IndexTable>
      )}
    </AdminShell>
  );
}

/* ── OX 행 — 낙관적 인라인 수정 ──────────────────────────────────────── */

function OxReviewRow({
  item,
  subject,
}: {
  item: OxReviewItem;
  subject: LawSubjectSlug;
}) {
  const fetcher = useFetcher();
  const isSubmitting = fetcher.state !== "idle";

  // 낙관적 표시 — 제출 중인 값이 있으면 먼저 반영.
  const submittedTruth = fetcher.formData?.get("oxTruth");
  const submittedIneligible = fetcher.formData?.get("oxIneligible");
  const truth =
    submittedTruth === undefined
      ? item.oxTruth
      : submittedTruth === ""
        ? null
        : (String(submittedTruth) as "O" | "X");
  const ineligible =
    submittedIneligible === undefined
      ? item.oxIneligible
      : submittedIneligible === "true";

  const submit = (patch: Record<string, string>) => {
    const fd = new FormData();
    fd.set("refType", item.refType);
    fd.set("refId", item.refId);
    for (const [k, v] of Object.entries(patch)) fd.set(k, v);
    fetcher.submit(fd, {
      method: "post",
      action: "/api/problems/ox-review-update",
    });
  };

  const truthBtn = (val: "O" | "X" | "") => {
    const label = val === "" ? "—" : val;
    const isActive = (val === "" && truth === null) || truth === val;
    return (
      <button
        type="button"
        onClick={() => submit({ oxTruth: val })}
        disabled={isSubmitting || ineligible}
        aria-pressed={isActive}
        className={cn(
          "h-7 min-w-[28px] rounded border px-1.5 text-xs font-bold transition-colors disabled:opacity-50",
          isActive
            ? val === "O"
              ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
              : val === "X"
                ? "border-rose-500 bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300"
                : "border-border bg-muted text-muted-foreground"
            : "border-border bg-background hover:bg-muted text-muted-foreground",
        )}
      >
        {label}
      </button>
    );
  };

  const isActiveStatus = !ineligible && truth != null && item.relatedArticleId != null;

  return (
    <TR>
      <TD soft className={cn(ineligible && "opacity-60")}>
        <p className="font-mono text-[13px] font-semibold tabular-nums">
          {item.year ?? "—"}
          {item.problemNumber ? ` · ${item.problemNumber}번` : ""}
        </p>
        <p className="text-muted-foreground text-[10px] uppercase tracking-wide">
          {item.origin}
        </p>
      </TD>
      <TD className={cn(ineligible && "opacity-60")}>
        <div className="flex flex-wrap gap-1">
          <Chip tone="neutral">
            {item.refType === "choice"
              ? "보기"
              : `박스${item.marker ? ` ${item.marker}` : ""}`}
          </Chip>
          {isActiveStatus ? (
            <Chip tone="emerald">노출</Chip>
          ) : null}
        </div>
      </TD>
      <TD className={cn(ineligible && "opacity-60")}>
        <p className="font-serif text-sm leading-snug whitespace-pre-line">
          {item.bodyMd}
        </p>
        {item.refType === "choice" && item.isCorrect != null ? (
          <p className="text-muted-foreground mt-0.5 text-[10px]">
            (원본 객관식: {item.isCorrect ? "정답 보기" : "오답 보기"})
          </p>
        ) : null}
      </TD>
      <TD className={cn(ineligible && "opacity-60")}>
        {item.relatedArticleId && item.relatedArticleNumber ? (
          <Link
            to={`/subjects/${subject}/articles/${item.relatedArticleNumber}`}
            viewTransition
            className="text-primary text-xs hover:underline"
          >
            {item.relatedArticleLabel ?? item.relatedArticleNumber}
          </Link>
        ) : (
          <span className="text-muted-foreground text-xs italic">미매핑</span>
        )}
      </TD>
      <TD>
        <div className="inline-flex items-center gap-1">
          {truthBtn("O")}
          {truthBtn("X")}
          {truthBtn("")}
        </div>
      </TD>
      <TD>
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={ineligible}
            disabled={isSubmitting}
            onChange={(e) =>
              submit({ oxIneligible: e.target.checked ? "true" : "false" })
            }
            className="size-3.5"
          />
          불가 처리
        </label>
      </TD>
      <TD align="center">
        <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs">
          <Link to={`/admin/problems/${item.problemId}`} viewTransition>
            <EditIcon className="size-3" />
          </Link>
        </Button>
      </TD>
    </TR>
  );
}
