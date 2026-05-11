// 즐겨찾기 모음 — 조문 / 판례 / 객관식 문제 / OX 지문(choice/box) 전부.
// 과목 + 타입 + 최소 별점 필터. 별점/최근수정 순. 클릭 시 원문 viewer 진입.

import {
  ArrowRightIcon,
  BookmarkIcon,
  PlayIcon,
  StarIcon,
  TimerIcon,
} from "lucide-react";
import { Form, Link, data } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { listAllBookmarks } from "~/features/annotations/queries.server";
import type { AnnotationTargetType } from "~/features/annotations/labels";
import {
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/bookmarks";

export const meta: Route.MetaFunction = () => [
  { title: "즐겨찾기 | Lidam Edu" },
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

const STAR_FILTERS: Array<{ value: string; label: string }> = [
  { value: "", label: "별점 1↑" },
  { value: "2", label: "별점 2↑" },
  { value: "3", label: "별점 3↑" },
  { value: "4", label: "별점 4↑" },
  { value: "5", label: "별점 5" },
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
  const minStarParam = url.searchParams.get("star");
  const minStar =
    minStarParam && /^[1-5]$/.test(minStarParam) ? Number(minStarParam) : 1;

  const all = await listAllBookmarks(client, user.id);
  // 클라이언트에서 다시 필터링하지 않고 loader 에서 마무리 — render 빠르게.
  const filtered = all.filter((b) => {
    if (subject && b.lawCode !== subject) return false;
    if (b.starLevel < minStar) return false;
    if (typeParam === "article" && b.targetType !== "article") return false;
    if (typeParam === "case" && b.targetType !== "case") return false;
    if (typeParam === "problem" && b.targetType !== "problem") return false;
    if (
      typeParam === "ox" &&
      b.targetType !== "problem_choice" &&
      b.targetType !== "problem_box_item"
    )
      return false;
    return true;
  });

  // 타입별 개수 (필터 적용 전 — 사용자가 다음 단계 결정에 참고).
  const counts: Record<string, number> = {
    total: all.length,
    article: 0,
    case: 0,
    problem: 0,
    ox: 0,
  };
  for (const b of all) {
    if (b.targetType === "article") counts.article += 1;
    else if (b.targetType === "case") counts.case += 1;
    else if (b.targetType === "problem") counts.problem += 1;
    else counts.ox += 1;
  }

  return {
    items: filtered,
    counts,
    filters: {
      subject,
      type: typeParam,
      minStar,
    },
  };
}

export default function Bookmarks({ loaderData }: Route.ComponentProps) {
  const { items, counts, filters } = loaderData;
  // 객관식 문제 즐겨찾기 묶어 풀기 CTA — 현재 필터 결과 안에 문제가 있을 때.
  const problemCountInView = items.filter((b) => b.targetType === "problem")
    .length;

  return (
    <div className="mx-auto w-full max-w-screen-lg px-5 py-6 md:px-10 md:py-8">
      <header className="mb-6 space-y-2">
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
          <BookmarkIcon className="size-3.5" /> 학습 보조
        </p>
        <h1 className="text-2xl font-bold tracking-tight">즐겨찾기 모음</h1>
        <p className="text-muted-foreground text-sm">
          조문 / 판례 / 문제 / OX 지문 viewer 의 ♡ 별점으로 추가한 항목들을 한 곳에서 다시 학습하세요.
          {" "}별점 높은 순 · 최근 수정 순.
        </p>
        <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs">
          <span>전체 <span className="text-foreground font-bold">{counts.total}</span></span>
          <span>· 조문 <span className="text-foreground font-bold">{counts.article}</span></span>
          <span>· 판례 <span className="text-foreground font-bold">{counts.case}</span></span>
          <span>· 문제 <span className="text-foreground font-bold">{counts.problem}</span></span>
          <span>· OX <span className="text-foreground font-bold">{counts.ox}</span></span>
        </div>
      </header>

      {problemCountInView > 0 ? (
        <Form
          method="post"
          action="/api/study/session-from-bookmarks"
          className="bg-primary/5 border-primary/30 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3"
        >
          <div className="flex items-center gap-2 text-sm">
            <PlayIcon className="text-primary size-4" />
            즐겨찾기 객관식 문제{" "}
            <span className="font-bold">{problemCountInView}</span>건을 한 세션으로 묶어 풀기
          </div>
          {filters.subject ? (
            <input type="hidden" name="subject" value={filters.subject} />
          ) : null}
          {filters.minStar > 1 ? (
            <input
              type="hidden"
              name="minStar"
              value={String(filters.minStar)}
            />
          ) : null}
          <div className="flex gap-2">
            <Button
              type="submit"
              name="mode"
              value="study"
              size="sm"
              variant="outline"
              className="h-8"
              data-testid="bookmark-start-study"
            >
              학습 모드 <ArrowRightIcon className="size-3.5" />
            </Button>
            <Button
              type="submit"
              name="mode"
              value="exam"
              size="sm"
              className="h-8"
              data-testid="bookmark-start-exam"
            >
              <TimerIcon className="size-3.5" /> 시험 모드
            </Button>
          </div>
        </Form>
      ) : null}

      <Form method="get" className="mb-5 flex flex-wrap items-end gap-2">
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
          <span className="text-muted-foreground tracking-wide">별점</span>
          <select
            name="star"
            defaultValue={filters.minStar === 1 ? "" : String(filters.minStar)}
            className="border-input bg-background h-8 rounded-md border px-2 text-xs"
          >
            {STAR_FILTERS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
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
        {filters.subject || filters.type || filters.minStar > 1 ? (
          <Link
            to="/study/bookmarks"
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
              ? "즐겨찾기가 없습니다. 조문/판례/문제 viewer 우측 패널의 ♡ 별점으로 추가하세요."
              : "필터에 해당하는 즐겨찾기가 없습니다."}
          </p>
        </div>
      ) : (
        <div className="space-y-2" data-testid="bookmarks-list">
          {items.map((b) => (
            <Link
              key={`${b.targetType}:${b.targetId}`}
              to={b.href}
              viewTransition
              className="group block"
            >
              <Card className="hover:border-primary transition-colors">
                <CardHeader className="px-4 pb-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="default" className="text-xs">
                      {TARGET_LABELS[b.targetType]}
                    </Badge>
                    {b.lawCode && isLawSubjectSlug(b.lawCode) ? (
                      <Badge variant="secondary" className="text-xs">
                        {LAW_SUBJECTS[b.lawCode].name}
                      </Badge>
                    ) : null}
                    {b.secondaryLabel ? (
                      <Badge variant="outline" className="text-xs">
                        {b.secondaryLabel}
                      </Badge>
                    ) : null}
                    {b.oxTruth ? (
                      <Badge variant="outline" className="text-xs">
                        정답: <span className="ml-0.5 font-bold">{b.oxTruth}</span>
                      </Badge>
                    ) : null}
                    <StarBar level={b.starLevel} />
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-3">
                  <p className="text-sm font-medium leading-snug">
                    {b.primaryLabel}
                  </p>
                  {b.bodySnippet ? (
                    <p className="text-muted-foreground mt-1 text-xs leading-relaxed whitespace-pre-line">
                      {b.bodySnippet}
                    </p>
                  ) : null}
                  {b.notePreview ? (
                    <p className="border-foreground/10 text-foreground/80 mt-2 border-l-2 pl-2 text-xs italic">
                      메모 · {b.notePreview}
                    </p>
                  ) : null}
                  <span className="text-primary mt-2 inline-flex items-center gap-1 text-xs">
                    다시 학습 <ArrowRightIcon className="size-3" />
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

function StarBar({ level }: { level: number }) {
  const stars = Math.max(0, Math.min(5, level));
  return (
    <span
      className="ml-auto inline-flex items-center gap-0.5"
      title={`별점 ${stars}/5`}
      aria-label={`별점 ${stars}/5`}
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <StarIcon
          key={i}
          className={cn(
            "size-3",
            i < stars
              ? "fill-amber-400 text-amber-400"
              : "text-muted-foreground/30",
          )}
        />
      ))}
    </span>
  );
}
