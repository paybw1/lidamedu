// 운영자 객관식 문제 리뷰 목록 — 출처/유형/극성/연도/scope/조문 필터 + 체계도/조문 순서 정렬.

import { LayersIcon, RefreshCwIcon } from "lucide-react";
import { Form, Link, data, useSearchParams } from "react-router";

import { Button } from "~/core/components/ui/button";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip, IndexTable, TD, TR } from "~/features/admin/components/admin-ui";
import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  FORMAT_LABEL,
  ORIGIN_LABEL,
  POLARITY_LABEL,
  SCOPE_LABEL,
  type ProblemFormat,
  type ProblemOrigin,
  type ProblemPolarity,
  type ProblemScope,
} from "~/features/problems/labels";
import {
  listProblemYears,
  listProblemsBySubject,
  listSystematicTopNodes,
} from "~/features/problems/queries.server";
import {
  FIRST_EXAM_LAW_SLUGS,
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
  SECOND_EXAM_LAW_SLUGS,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-problems-list";

export const meta: Route.MetaFunction = () => [
  { title: "객관식 문제 관리 | 리담변리사학원" },
];

const ORIGINS: ProblemOrigin[] = [
  "past_exam",
  "past_exam_variant",
  "mock",
  "expected",
];
const FORMATS: ProblemFormat[] = ["mc_short", "mc_box", "mc_case"];
const POLARITIES: ProblemPolarity[] = ["positive", "negative"];
const SCOPES: ProblemScope[] = ["unit", "comprehensive"];

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
  const subject = LAW_SUBJECT_SLUGS.includes(subjectParam as never)
    ? (subjectParam as (typeof LAW_SUBJECT_SLUGS)[number])
    : "patent";

  const reviewParam = url.searchParams.get("review");
  const mediaParam = url.searchParams.get("media");
  const filters = {
    origin: (url.searchParams.get("origin") || undefined) as
      | ProblemOrigin
      | undefined,
    format: (url.searchParams.get("format") || undefined) as
      | ProblemFormat
      | undefined,
    polarity: (url.searchParams.get("polarity") || undefined) as
      | ProblemPolarity
      | undefined,
    scope: (url.searchParams.get("scope") || undefined) as
      | ProblemScope
      | undefined,
    year: url.searchParams.get("year")
      ? Number(url.searchParams.get("year"))
      : undefined,
    hasUnclassified: url.searchParams.get("unclassified") === "1",
    reviewStatus:
      reviewParam === "reviewed" ||
      reviewParam === "pending" ||
      reviewParam === "mismatch"
        ? (reviewParam as "reviewed" | "pending" | "mismatch")
        : undefined,
    mediaStatus:
      mediaParam === "table" ||
      mediaParam === "image" ||
      mediaParam === "any" ||
      mediaParam === "none"
        ? (mediaParam as "table" | "image" | "any" | "none")
        : undefined,
  };

  const [problems, years, systematicNodes] = await Promise.all([
    // feat-10-002: 운영자 문제 관리 화면 — 미공개 mock 문제도 표시.
    // 검토 미승인(draft/rejected) 도 운영자에게 노출해야 검토 작업 가능 — 학생
    // 노출 게이트는 별도 경로에서 적용됨.
    listProblemsBySubject(client, subject, filters, {
      includeHiddenMock: true,
      includeUnapproved: true,
    }),
    listProblemYears(client, subject),
    listSystematicTopNodes(client, subject),
  ]);
  return { problems, years, subject, filters, systematicNodes, role };
}

export default function AdminProblemsList({
  loaderData,
}: Route.ComponentProps) {
  const { problems, years, subject, filters, systematicNodes, role } =
    loaderData;
  // 편집 화면 진입 시 현재 필터 쿼리를 그대로 전달 → 편집 화면의 "←" 가 같은 쿼리로 되돌아갈 수 있게.
  const [searchParams] = useSearchParams();
  const filterQs = searchParams.toString();
  const subjectMeta = LAW_SUBJECTS[subject];
  const filterActive =
    !!filters.origin ||
    !!filters.format ||
    !!filters.polarity ||
    !!filters.scope ||
    filters.year != null ||
    !!filters.reviewStatus ||
    !!filters.mediaStatus ||
    filters.hasUnclassified;
  return (
    <AdminShell
      cluster="problems"
      role={role}
      title={`${subjectMeta.name} 객관식 문제`}
      desc="체계도 / 조문 순서로 문제 목록을 조회합니다. 분류되지 않은 지문이 있는 문제는 ? 칩으로 표시됩니다."
      headerRight={
        <Button asChild size="sm">
          <Link to={`/admin/problems/new?subject=${subject}`}>신규 출제</Link>
        </Button>
      }
    >
      {systematicNodes.length > 0 ? (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground mr-1 inline-flex items-center gap-1 text-[11px] font-semibold">
            <LayersIcon className="size-3" /> 편집 그룹
          </span>
          {systematicNodes.map((n) => (
            <Link
              key={n.nodeId}
              to={`/admin/problems/system/${n.nodeId}?subject=${subject}`}
              viewTransition
              className="bg-primary/10 text-link border-primary/30 hover:bg-primary hover:text-primary-foreground hover:border-primary inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition"
              title={`${n.displayLabel} — 한 화면에서 일괄 편집`}
            >
              {n.displayLabel} ({n.problemCount})
            </Link>
          ))}
        </div>
      ) : null}

      <Form
        method="get"
        className="border-border bg-card mb-3 flex flex-wrap items-end gap-2.5 rounded-xl border p-3 shadow-sm"
      >
        <FilterSelect
          name="subject"
          label="과목"
          value={subject}
          options={[]}
          optionGroups={[
            {
              label: "1차 · 객관식",
              options: FIRST_EXAM_LAW_SLUGS.map((s) => ({
                value: s,
                label: LAW_SUBJECTS[s].name,
              })),
            },
            {
              label: "2차 · 주관식",
              options: SECOND_EXAM_LAW_SLUGS.map((s) => ({
                value: s,
                label: LAW_SUBJECTS[s].name,
              })),
            },
          ]}
        />
        <FilterSelect
          name="origin"
          label="출처"
          value={filters.origin ?? ""}
          options={[
            { value: "", label: "전체" },
            ...ORIGINS.map((v) => ({ value: v, label: ORIGIN_LABEL[v] })),
          ]}
        />
        <FilterSelect
          name="format"
          label="유형"
          value={filters.format ?? ""}
          options={[
            { value: "", label: "전체" },
            ...FORMATS.map((v) => ({ value: v, label: FORMAT_LABEL[v] })),
          ]}
        />
        <FilterSelect
          name="polarity"
          label="극성"
          value={filters.polarity ?? ""}
          options={[
            { value: "", label: "전체" },
            ...POLARITIES.map((v) => ({
              value: v,
              label: POLARITY_LABEL[v],
            })),
          ]}
        />
        <FilterSelect
          name="scope"
          label="단원/종합"
          value={filters.scope ?? ""}
          options={[
            { value: "", label: "전체" },
            ...SCOPES.map((v) => ({ value: v, label: SCOPE_LABEL[v] })),
          ]}
        />
        <FilterSelect
          name="year"
          label="연도"
          value={filters.year != null ? String(filters.year) : ""}
          options={[
            { value: "", label: "전체" },
            ...years.map((y) => ({ value: String(y), label: `${y}년` })),
          ]}
        />
        <FilterSelect
          name="review"
          label="검토"
          value={filters.reviewStatus ?? ""}
          options={[
            { value: "", label: "전체" },
            { value: "pending", label: "미검토" },
            { value: "reviewed", label: "검토 완료" },
            { value: "mismatch", label: "재검토 필요" },
          ]}
        />
        <FilterSelect
          name="media"
          label="해설 미디어"
          value={filters.mediaStatus ?? ""}
          options={[
            { value: "", label: "전체" },
            { value: "any", label: "표·이미지 포함" },
            { value: "table", label: "표 포함" },
            { value: "image", label: "이미지 포함" },
            { value: "none", label: "텍스트만" },
          ]}
        />
        <label className="text-muted-foreground inline-flex h-9 items-center gap-1.5 text-[11px] font-medium">
          <input
            type="checkbox"
            name="unclassified"
            value="1"
            defaultChecked={filters.hasUnclassified}
            className="accent-primary"
          />
          미분류 지문 포함
        </label>
        <Button type="submit" size="sm" variant="outline">
          적용
        </Button>
        {filterActive ? (
          <Link
            to={`/admin/problems?subject=${subject}`}
            className="text-link inline-flex items-center gap-1 px-1 text-xs font-semibold"
          >
            <RefreshCwIcon className="size-3" /> 초기화
          </Link>
        ) : null}
      </Form>

      {problems.length === 0 ? (
        <div className="border-border bg-card text-muted-foreground rounded-xl border py-16 text-center text-sm shadow-sm">
          조건에 맞는 문제가 없습니다.
        </div>
      ) : (
        <IndexTable
          minWidth={920}
          headers={[
            { label: "조문", width: "9rem" },
            { label: "출처" },
            { label: "유형" },
            { label: "극성", align: "center" },
            { label: "scope", align: "center" },
            { label: "연도/회차" },
            { label: "본문 (앞부분)" },
            { label: "상태", align: "center" },
            { label: "", align: "right", width: "5rem" },
          ]}
          footer={
            <div className="border-border/60 text-muted-foreground border-t px-3 py-2 text-[11px] font-medium tabular-nums">
              총 {problems.length}건
            </div>
          }
        >
          {problems.map((p) => {
            const editTo = filterQs
              ? `/admin/problems/${p.problemId}?${filterQs}`
              : `/admin/problems/${p.problemId}`;
            return (
              <TR key={p.problemId}>
                <TD mono>
                  {p.primaryArticleNumber ? (
                    <span className="text-link">
                      제{p.primaryArticleNumber}조
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TD>
                <TD soft>{ORIGIN_LABEL[p.origin]}</TD>
                <TD>
                  <Chip tone="neutral">{FORMAT_LABEL[p.format]}</Chip>
                </TD>
                <TD align="center" soft>
                  {p.polarity ? POLARITY_LABEL[p.polarity] : "—"}
                </TD>
                <TD align="center" soft>
                  {p.scope ? SCOPE_LABEL[p.scope] : "—"}
                </TD>
                <TD mono soft>
                  {p.year != null
                    ? `${p.year}${p.examRoundNo != null ? `-${p.examRoundNo}` : ""}`
                    : "—"}
                </TD>
                <TD>
                  <div className="flex items-start gap-1.5">
                    <p className="line-clamp-2 max-w-[28rem] text-[13px] font-normal">
                      {truncate(p.bodyMd, 120)}
                    </p>
                    {p.unclassifiedChoices > 0 ? (
                      <Chip tone="amber" className="shrink-0">
                        ?{p.unclassifiedChoices}
                      </Chip>
                    ) : null}
                    {p.hasTable ? (
                      <Chip tone="blue" className="shrink-0">
                        표
                      </Chip>
                    ) : null}
                    {p.hasImage ? (
                      <Chip tone="violet" className="shrink-0">
                        이미지
                      </Chip>
                    ) : null}
                  </div>
                </TD>
                <TD align="center">
                  {p.mismatchFlaggedAt ? (
                    <Chip tone="amber">재검토</Chip>
                  ) : p.reviewedAt ? (
                    <Chip tone="emerald">검토</Chip>
                  ) : (
                    <Chip tone="neutral">대기</Chip>
                  )}
                </TD>
                <TD align="right">
                  <Link
                    to={editTo}
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

function FilterSelect({
  name,
  label,
  value,
  options,
  optionGroups,
}: {
  name: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  // 제공 시 flat options 뒤에 native <optgroup> 으로 묶어 렌더 (예: 1차/2차 과목).
  optionGroups?: {
    label: string;
    options: { value: string; label: string }[];
  }[];
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-muted-foreground text-[11px] font-semibold">
        {label}
      </span>
      <select
        name={name}
        defaultValue={value}
        className="border-input bg-background focus:border-primary h-9 rounded-md border px-3 text-[13px] outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        {optionGroups?.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}
