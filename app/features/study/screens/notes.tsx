// 메모 모아보기 — 조문 / 판례 / 객관식 문제 / OX 지문 viewer 에 작성한 메모 전부.
// 검색(snippet/body) + 과목 + 타입 필터. updated_at 최신순.

import {
  ArrowRightIcon,
  PencilLineIcon,
  SearchIcon,
  StickyNoteIcon,
} from "lucide-react";
import { Form, Link, data } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Input } from "~/core/components/ui/input";
import makeServerClient from "~/core/lib/supa-client.server";
import { listAllMemos } from "~/features/annotations/queries.server";
import type { AnnotationTargetType } from "~/features/annotations/labels";
import {
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/notes";

export const meta: Route.MetaFunction = () => [
  { title: "메모 | Lidam Edu" },
];

const TARGET_LABELS: Record<AnnotationTargetType, string> = {
  article: "조문",
  case: "판례",
  problem: "문제",
  problem_choice: "OX 지문",
  problem_box_item: "OX 박스",
};

const TYPE_FILTERS: Array<{ value: AnnotationTargetType | "ox" | ""; label: string }> = [
  { value: "", label: "전체 타입" },
  { value: "article", label: "조문" },
  { value: "case", label: "판례" },
  { value: "problem", label: "객관식 문제" },
  { value: "ox", label: "OX 지문 (지문/박스)" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const subjectParam = url.searchParams.get("subject");
  const subject =
    subjectParam && (LAW_SUBJECT_SLUGS as readonly string[]).includes(subjectParam)
      ? (subjectParam as LawSubjectSlug)
      : null;
  const typeParam = url.searchParams.get("type") ?? "";
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);

  const all = await listAllMemos(client, user.id);
  const qLower = q.toLowerCase();
  const filtered = all.filter((m) => {
    if (subject && m.lawCode !== subject) return false;
    if (typeParam === "article" && m.targetType !== "article") return false;
    if (typeParam === "case" && m.targetType !== "case") return false;
    if (typeParam === "problem" && m.targetType !== "problem") return false;
    if (
      typeParam === "ox" &&
      m.targetType !== "problem_choice" &&
      m.targetType !== "problem_box_item"
    )
      return false;
    if (qLower) {
      const hay = (
        (m.bodyMd ?? "") +
        " " +
        (m.snippet ?? "") +
        " " +
        m.primaryLabel +
        " " +
        (m.bodySnippet ?? "")
      ).toLowerCase();
      if (!hay.includes(qLower)) return false;
    }
    return true;
  });

  const counts: Record<string, number> = {
    total: all.length,
    article: 0,
    case: 0,
    problem: 0,
    ox: 0,
  };
  for (const m of all) {
    if (m.targetType === "article") counts.article += 1;
    else if (m.targetType === "case") counts.case += 1;
    else if (m.targetType === "problem") counts.problem += 1;
    else counts.ox += 1;
  }

  return {
    items: filtered,
    counts,
    filters: {
      subject,
      type: typeParam,
      q,
    },
  };
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}일 전`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}개월 전`;
  return `${Math.floor(mo / 12)}년 전`;
}

export default function Notes({ loaderData }: Route.ComponentProps) {
  const { items, counts, filters } = loaderData;

  return (
    <div className="mx-auto w-full max-w-screen-lg px-5 py-6 md:px-10 md:py-8">
      <header className="mb-6 space-y-2">
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
          <StickyNoteIcon className="size-3.5" /> 학습 보조
        </p>
        <h1 className="text-2xl font-bold tracking-tight">메모</h1>
        <p className="text-muted-foreground text-sm">
          조문 / 판례 / 문제 / OX 지문 viewer 에서 작성한 메모를 한 곳에서 검색·열람하세요. 최근 수정 순.
        </p>
        <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs">
          <span>전체 <span className="text-foreground font-bold">{counts.total}</span></span>
          <span>· 조문 <span className="text-foreground font-bold">{counts.article}</span></span>
          <span>· 판례 <span className="text-foreground font-bold">{counts.case}</span></span>
          <span>· 문제 <span className="text-foreground font-bold">{counts.problem}</span></span>
          <span>· OX <span className="text-foreground font-bold">{counts.ox}</span></span>
        </div>
      </header>

      <Form method="get" className="mb-5 flex flex-wrap items-end gap-2">
        <div className="relative grow basis-60">
          <SearchIcon className="text-muted-foreground absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
          <Input
            type="search"
            name="q"
            defaultValue={filters.q}
            placeholder="메모 / 발췌 텍스트 검색"
            className="h-8 pl-8 text-xs"
          />
        </div>
        <label className="flex flex-col gap-0.5 text-xs">
          <span className="text-muted-foreground tracking-wide">과목</span>
          <select
            name="subject"
            defaultValue={filters.subject ?? ""}
            className="border-input bg-background h-8 rounded-md border px-2 text-xs"
          >
            <option value="">전체</option>
            {LAW_SUBJECT_SLUGS.map((s) => (
              <option key={s} value={s}>
                {LAW_SUBJECTS[s].name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5 text-xs">
          <span className="text-muted-foreground tracking-wide">타입</span>
          <select
            name="type"
            defaultValue={filters.type ?? ""}
            className="border-input bg-background h-8 rounded-md border px-2 text-xs"
          >
            {TYPE_FILTERS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="border-input bg-background hover:bg-accent h-8 rounded-md border px-3 text-xs"
        >
          적용
        </button>
        {filters.subject || filters.type || filters.q ? (
          <Link
            to="/study/notes"
            className="text-muted-foreground hover:text-foreground inline-flex h-8 items-center px-2 text-xs"
          >
            초기화
          </Link>
        ) : null}
      </Form>

      {items.length === 0 ? (
        <div className="bg-muted/40 rounded-md border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-sm">
            {counts.total === 0
              ? "메모가 없습니다. 조문/판례/문제 viewer 우측 패널의 메모 탭에서 작성하세요."
              : "필터에 해당하는 메모가 없습니다."}
          </p>
        </div>
      ) : (
        <div className="space-y-2" data-testid="notes-list">
          {items.map((m) => (
            <Link
              key={m.memoId}
              to={m.href}
              viewTransition
              className="group block"
            >
              <Card className="hover:border-primary transition-colors">
                <CardHeader className="px-4 pb-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="default" className="text-xs">
                      {TARGET_LABELS[m.targetType]}
                    </Badge>
                    {m.lawCode && isLawSubjectSlug(m.lawCode) ? (
                      <Badge variant="secondary" className="text-xs">
                        {LAW_SUBJECTS[m.lawCode].name}
                      </Badge>
                    ) : null}
                    {m.secondaryLabel ? (
                      <Badge variant="outline" className="text-xs">
                        {m.secondaryLabel}
                      </Badge>
                    ) : null}
                    <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                      {formatRelative(m.updatedAt)}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-3">
                  <p className="text-sm font-medium leading-snug">
                    {m.primaryLabel}
                  </p>
                  {m.snippet ? (
                    <p className="text-muted-foreground bg-muted/40 mt-1 rounded px-2 py-1 text-xs">
                      &ldquo;{m.snippet}&rdquo;
                    </p>
                  ) : null}
                  {m.bodySnippet ? (
                    <p className="text-muted-foreground mt-1 text-xs leading-relaxed whitespace-pre-line">
                      {m.bodySnippet}
                    </p>
                  ) : null}
                  <p className="border-foreground/20 text-foreground/90 mt-2 border-l-2 pl-2 text-xs leading-relaxed whitespace-pre-line">
                    <PencilLineIcon className="text-muted-foreground mr-1 inline size-3" />
                    {m.bodyMd}
                  </p>
                  <span className="text-primary mt-2 inline-flex items-center gap-1 text-xs">
                    원문에서 보기 <ArrowRightIcon className="size-3" />
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function isLawSubjectSlug(code: string): code is LawSubjectSlug {
  return (LAW_SUBJECT_SLUGS as readonly string[]).includes(code);
}
