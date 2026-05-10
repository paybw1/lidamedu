// 운영자 정오문제(OX) 검토 — 과목별 OX 후보 지문(choice/box-item) 일괄 검토 및 인라인 수정.
// 학생 노출 조건(active) 외에도 `ineligible`, `untruthed` 항목을 함께 보고 토글 가능.

import { CheckCircle2Icon, EditIcon, FilterIcon } from "lucide-react";
import {
  Form,
  Link,
  data,
  useFetcher,
  useSearchParams,
} from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
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
import {
  listOxItemsForReview,
  listProblemYears,
  type OxReviewItem,
  type OxReviewStatus,
} from "~/features/problems/queries.server";
import {
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-ox-review";

export const meta: Route.MetaFunction = () => [
  { title: "정오문제 관리 | Lidam Edu" },
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
    label: "OX 불가",
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

  return { subject, status, year: Number.isFinite(year) ? year : null, items, years, counts };
}

export default function AdminOxReview({ loaderData }: Route.ComponentProps) {
  const { subject, status, year, items, years, counts } = loaderData;
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
    <div className="mx-auto w-full max-w-screen-2xl px-5 py-6 md:px-10 md:py-8">
      <header className="mb-6 space-y-2">
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
          <CheckCircle2Icon className="size-3.5" /> 운영자 모드 · 정오문제
        </p>
        <h1 className="text-2xl font-bold tracking-tight">정오문제 관리</h1>
        <p className="text-muted-foreground text-sm">
          객관식 보기와 박스형 사례 지문 중 OX(정오) 후보를 한 화면에서 검토합니다.
          학생에게 노출되는 조건은 <span className="font-semibold">노출 중</span> —
          {" "}
          <code className="rounded bg-muted px-1 text-[11px]">
            ox_truth NOT NULL · ox_ineligible=false · related_article 매핑됨
          </code>
        </p>
      </header>

      <Card className="mb-4">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <FilterIcon className="text-muted-foreground size-4" />
            <Form method="get" className="flex flex-wrap items-center gap-2">
              <select
                name="subject"
                defaultValue={subject}
                className="border-input bg-background h-8 rounded-md border px-2 text-xs"
              >
                {LAW_SUBJECT_SLUGS.map((s) => (
                  <option key={s} value={s}>
                    {LAW_SUBJECTS[s].name}
                  </option>
                ))}
              </select>
              <select
                name="year"
                defaultValue={year ?? ""}
                className="border-input bg-background h-8 rounded-md border px-2 text-xs"
              >
                <option value="">전체 연도</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <input type="hidden" name="status" value={status} />
              <Button type="submit" size="sm" variant="outline" className="h-8">
                적용
              </Button>
            </Form>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1">
            {STATUS_OPTIONS.map((opt) => {
              const active = status === opt.value;
              return (
                <Link
                  key={opt.value}
                  to={querySuffix({ status: opt.value })}
                  className={cn(
                    "rounded-md border px-2 py-1 text-xs transition-colors",
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background hover:bg-accent border-input text-muted-foreground",
                  )}
                  title={opt.hint}
                >
                  {opt.label}
                  <span className="ml-1 tabular-nums">
                    {counts[opt.value]}
                  </span>
                </Link>
              );
            })}
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-xs">
            {LAW_SUBJECTS[subject].name} · 결과{" "}
            <span className="text-foreground font-bold tabular-nums">
              {items.length}
            </span>
            건
            {items.length >= 800 ? " (상한 800)" : ""}
          </p>
        </CardContent>
      </Card>

      {items.length === 0 ? (
        <div className="bg-muted/40 rounded-md border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-sm">조건에 맞는 OX 후보가 없습니다.</p>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[88px]">출처/연도</TableHead>
                  <TableHead className="w-[70px]">유형</TableHead>
                  <TableHead className="min-w-[300px]">지문</TableHead>
                  <TableHead className="w-[160px]">조문</TableHead>
                  <TableHead className="w-[150px]">정답 OX</TableHead>
                  <TableHead className="w-[110px]">OX 불가</TableHead>
                  <TableHead className="w-[80px]">편집</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it) => (
                  <OxReviewRow key={`${it.refType}:${it.refId}`} item={it} subject={subject} />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

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
          "h-7 min-w-[28px] rounded border px-1.5 text-xs transition-colors disabled:opacity-50",
          isActive
            ? val === "O"
              ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
              : val === "X"
                ? "border-rose-500 bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300"
                : "border-input bg-muted text-muted-foreground"
            : "border-input bg-background hover:bg-accent text-muted-foreground",
        )}
      >
        {label}
      </button>
    );
  };

  const isActiveStatus = !ineligible && truth != null && item.relatedArticleId != null;

  return (
    <TableRow className={cn(ineligible && "opacity-60")}>
      <TableCell className="text-xs">
        <div className="font-medium tabular-nums">
          {item.year ?? "—"}
          {item.problemNumber ? ` · ${item.problemNumber}번` : ""}
        </div>
        <div className="text-muted-foreground text-[10px] uppercase tracking-wide">
          {item.origin}
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="secondary" className="text-[10px]">
          {item.refType === "choice" ? "보기" : `박스${item.marker ? ` ${item.marker}` : ""}`}
        </Badge>
        {isActiveStatus ? (
          <Badge
            variant="default"
            className="ml-1 bg-emerald-600 text-[10px] hover:bg-emerald-600"
          >
            노출
          </Badge>
        ) : null}
      </TableCell>
      <TableCell>
        <p className="font-serif text-sm leading-snug whitespace-pre-line">
          {item.bodyMd}
        </p>
        {item.refType === "choice" && item.isCorrect != null ? (
          <p className="text-muted-foreground mt-0.5 text-[10px]">
            (원본 객관식: {item.isCorrect ? "정답 보기" : "오답 보기"})
          </p>
        ) : null}
      </TableCell>
      <TableCell className="text-xs">
        {item.relatedArticleId && item.relatedArticleNumber ? (
          <Link
            to={`/subjects/${subject}/articles/${item.relatedArticleNumber}`}
            viewTransition
            className="text-primary hover:underline"
          >
            {item.relatedArticleLabel ?? item.relatedArticleNumber}
          </Link>
        ) : (
          <span className="text-muted-foreground italic">미매핑</span>
        )}
      </TableCell>
      <TableCell>
        <div className="inline-flex items-center gap-1">
          {truthBtn("O")}
          {truthBtn("X")}
          {truthBtn("")}
        </div>
      </TableCell>
      <TableCell>
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
      </TableCell>
      <TableCell>
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
        >
          <Link to={`/admin/problems/${item.problemId}`} viewTransition>
            <EditIcon className="size-3" />
          </Link>
        </Button>
      </TableCell>
    </TableRow>
  );
}
