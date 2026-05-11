// 하이라이트 모아보기 — 조문 / 판례 / 객관식 문제 / OX 지문 viewer 에서 색칠한 본문 발췌 전부.
// 검색(excerpt) + 과목 + 타입 + 색상 필터. created_at 최신순.

import {
  ArrowRightIcon,
  HighlighterIcon,
  SearchIcon,
} from "lucide-react";
import { Form, Link, data } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Input } from "~/core/components/ui/input";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { listAllHighlights } from "~/features/annotations/queries.server";
import type {
  AnnotationTargetType,
  HighlightColor,
} from "~/features/annotations/labels";
import { HIGHLIGHT_COLORS } from "~/features/annotations/labels";
import {
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/highlights";

export const meta: Route.MetaFunction = () => [
  { title: "내 하이라이트 | Lidam Edu" },
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

const COLOR_LABELS: Record<HighlightColor, string> = {
  green: "초록",
  yellow: "노랑",
  red: "빨강",
  blue: "파랑",
};

// 본문의 하이라이트 컬러 클래스 — 라이트 모드 부드러운 배경, 다크 모드는 채도 낮춤.
const COLOR_TONE: Record<HighlightColor, string> = {
  green: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100",
  yellow: "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100",
  red: "bg-rose-100 text-rose-900 dark:bg-rose-950/40 dark:text-rose-100",
  blue: "bg-sky-100 text-sky-900 dark:bg-sky-950/40 dark:text-sky-100",
};

const COLOR_DOT: Record<HighlightColor, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-rose-500",
  blue: "bg-sky-500",
};

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
  const colorParam = url.searchParams.get("color") ?? "";
  const color =
    colorParam && (HIGHLIGHT_COLORS as readonly string[]).includes(colorParam)
      ? (colorParam as HighlightColor)
      : null;
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);

  const all = await listAllHighlights(client, user.id);
  const qLower = q.toLowerCase();
  const filtered = all.filter((h) => {
    if (subject && h.lawCode !== subject) return false;
    if (typeParam === "article" && h.targetType !== "article") return false;
    if (typeParam === "case" && h.targetType !== "case") return false;
    if (typeParam === "problem" && h.targetType !== "problem") return false;
    if (
      typeParam === "ox" &&
      h.targetType !== "problem_choice" &&
      h.targetType !== "problem_box_item"
    )
      return false;
    if (color && h.color !== color) return false;
    if (qLower) {
      const hay = (h.excerpt + " " + h.primaryLabel + " " + (h.bodySnippet ?? "")).toLowerCase();
      if (!hay.includes(qLower)) return false;
    }
    return true;
  });

  const counts: Record<string, number> = {
    total: all.length,
    green: 0,
    yellow: 0,
    red: 0,
    blue: 0,
  };
  for (const h of all) counts[h.color] = (counts[h.color] ?? 0) + 1;

  return {
    items: filtered,
    counts,
    filters: { subject, type: typeParam, color, q },
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

export default function Highlights({ loaderData }: Route.ComponentProps) {
  const { items, counts, filters } = loaderData;

  return (
    <div className="mx-auto w-full max-w-screen-lg px-5 py-6 md:px-10 md:py-8">
      <header className="mb-6 space-y-2">
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
          <HighlighterIcon className="size-3.5" /> 학습 보조
        </p>
        <h1 className="text-2xl font-bold tracking-tight">내 하이라이트</h1>
        <p className="text-muted-foreground text-sm">
          조문 / 판례 / 문제 / OX 지문 본문에 색칠한 발췌를 한 곳에서 검색·열람하세요. 최근 작성 순.
        </p>
        <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs">
          <span>전체 <span className="text-foreground font-bold">{counts.total}</span></span>
          {HIGHLIGHT_COLORS.map((c) => (
            <span key={c} className="inline-flex items-center gap-1">
              <span
                className={cn(
                  "inline-block size-2 rounded-full",
                  COLOR_DOT[c],
                )}
              />
              {COLOR_LABELS[c]}{" "}
              <span className="text-foreground font-bold">{counts[c] ?? 0}</span>
            </span>
          ))}
        </div>
      </header>

      <Form method="get" className="mb-5 flex flex-wrap items-end gap-2">
        <div className="relative grow basis-60">
          <SearchIcon className="text-muted-foreground absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
          <Input
            type="search"
            name="q"
            defaultValue={filters.q}
            placeholder="발췌 텍스트 검색"
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
        <label className="flex flex-col gap-0.5 text-xs">
          <span className="text-muted-foreground tracking-wide">색상</span>
          <select
            name="color"
            defaultValue={filters.color ?? ""}
            className="border-input bg-background h-8 rounded-md border px-2 text-xs"
          >
            <option value="">전체</option>
            {HIGHLIGHT_COLORS.map((c) => (
              <option key={c} value={c}>
                {COLOR_LABELS[c]}
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
        {filters.subject || filters.type || filters.color || filters.q ? (
          <Link
            to="/study/highlights"
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
              ? "하이라이트가 없습니다. 조문/판례/문제 viewer 본문에서 텍스트를 선택해 색칠하세요."
              : "필터에 해당하는 하이라이트가 없습니다."}
          </p>
        </div>
      ) : (
        <div className="space-y-2" data-testid="highlights-list">
          {items.map((h) => (
            <Link
              key={h.highlightId}
              to={h.href}
              viewTransition
              className="group block"
            >
              <Card className="hover:border-primary transition-colors">
                <CardHeader className="px-4 pb-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="default" className="text-xs">
                      {TARGET_LABELS[h.targetType]}
                    </Badge>
                    {h.lawCode && isLawSubjectSlug(h.lawCode) ? (
                      <Badge variant="secondary" className="text-xs">
                        {LAW_SUBJECTS[h.lawCode].name}
                      </Badge>
                    ) : null}
                    {h.secondaryLabel ? (
                      <Badge variant="outline" className="text-xs">
                        {h.secondaryLabel}
                      </Badge>
                    ) : null}
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]",
                      )}
                      title={`색상: ${COLOR_LABELS[h.color]}`}
                    >
                      <span
                        className={cn(
                          "inline-block size-2 rounded-full",
                          COLOR_DOT[h.color],
                        )}
                      />
                      {COLOR_LABELS[h.color]}
                    </span>
                    <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                      {formatRelative(h.createdAt)}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-3">
                  <p className="text-sm font-medium leading-snug">
                    {h.primaryLabel}
                  </p>
                  {h.bodySnippet ? (
                    <p className="text-muted-foreground mt-1 text-xs leading-relaxed whitespace-pre-line">
                      {h.bodySnippet}
                    </p>
                  ) : null}
                  {h.excerpt ? (
                    <p
                      className={cn(
                        "mt-2 rounded px-2 py-1 text-xs leading-relaxed",
                        COLOR_TONE[h.color],
                      )}
                    >
                      {h.excerpt}
                    </p>
                  ) : (
                    <p className="text-muted-foreground mt-2 text-xs italic">
                      (발췌 텍스트 없음)
                    </p>
                  )}
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
