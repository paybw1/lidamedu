// 허브 가운데 본문 영역 — 트리 필터(중요도/즐겨찾기) 매칭 조문 전문 정독 리스트.
// 좌측 ArticleTree 의 필터가 켜지면 articles-tab 이 기본 콘텐츠 대신 이걸 렌더한다.
// 20개씩 순차 로드("더 보기") — 중요도 1+ 가 100개조를 넘는 법령 대비.
import { BookOpenIcon, ExternalLinkIcon, Loader2Icon, StarIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import { ArticleBodyView } from "~/features/laws/components/article-body";
import { parseArticleBody } from "~/features/laws/lib/article-body";
import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";

interface FilteredItem {
  articleId: string;
  articleNumber: string | null;
  displayLabel: string;
  importance: number;
  bodyJson: unknown;
}

type ApiResponse =
  | { total: number; items: FilteredItem[]; pageSize: number }
  | { error: string };

export function FilteredArticlesReader({
  lawCode,
  importanceMin,
  bookmarkMin,
}: {
  lawCode: LawSubjectSlug;
  importanceMin: number;
  bookmarkMin: number;
}) {
  const fetcher = useFetcher<ApiResponse>();
  const [items, setItems] = useState<FilteredItem[]>([]);
  const [total, setTotal] = useState<number | null>(null);

  const filterKey = `${lawCode}:${importanceMin}:${bookmarkMin}`;

  // 필터 변경 시 초기화 + 첫 페이지 로드.
  useEffect(() => {
    setItems([]);
    setTotal(null);
    fetcher.load(
      `/api/laws/filtered-articles?law=${lawCode}&imp=${importanceMin}&bm=${bookmarkMin}&offset=0`,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  // 응답 누적.
  useEffect(() => {
    const d = fetcher.data;
    if (!d || "error" in d) return;
    setTotal(d.total);
    setItems((prev) => {
      const seen = new Set(prev.map((i) => i.articleId));
      return [...prev, ...d.items.filter((i) => !seen.has(i.articleId))];
    });
  }, [fetcher.data]);

  const loading = fetcher.state !== "idle";
  const hasMore = total !== null && items.length < total;

  const titleMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of items) {
      if (!a.articleNumber) continue;
      const match = a.displayLabel.match(/^제\d+조(?:의\d+)?\s+(.+)$/);
      m.set(a.articleNumber, match ? match[1] : a.displayLabel);
    }
    return m;
  }, [items]);

  const filterLabel = [
    importanceMin > 0 ? `중요도 ${importanceMin}+` : null,
    bookmarkMin > 0 ? `즐겨찾기 ♥${bookmarkMin}+` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-4" data-testid="filtered-articles-reader">
      <div className="bg-muted/40 flex flex-wrap items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm">
        <BookOpenIcon className="text-muted-foreground size-4" />
        <span className="font-semibold">{filterLabel} 조문 정독</span>
        {total !== null ? (
          <span className="text-muted-foreground">
            매칭 {total}개조 · 표시 {items.length}개
          </span>
        ) : null}
      </div>

      {total === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed p-8 text-center text-sm">
          조건에 맞는 조문이 없습니다.
        </p>
      ) : null}

      {items.map((a) => {
        const body = parseArticleBody(a.bodyJson);
        return (
          <article
            key={a.articleId}
            className="border-border bg-card rounded-xl border p-4 shadow-sm"
          >
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-bold">
                {a.displayLabel}
                {a.importance > 0 ? (
                  <span className="text-amber-500" title={`중요도 ${a.importance}`}>
                    {" "}
                    {Array.from({ length: a.importance }, () => "★").join("")}
                  </span>
                ) : null}
              </h3>
              <Button asChild size="sm" variant="ghost" className="h-7 gap-1 text-xs">
                <Link
                  to={`/subjects/${lawCode}/articles/${a.articleNumber ?? ""}`}
                  viewTransition
                  prefetch="intent"
                >
                  <ExternalLinkIcon className="size-3.5" /> 뷰어에서 열기
                </Link>
              </Button>
            </div>
            {body ? (
              <ArticleBodyView
                body={body}
                titleMap={titleMap}
                subtitlesOnly={false}
                lawCode={lawCode}
              />
            ) : (
              <p className="text-muted-foreground text-sm">
                본문을 불러올 수 없습니다.
              </p>
            )}
          </article>
        );
      })}

      {loading ? (
        <div className="text-muted-foreground flex items-center justify-center gap-2 py-6 text-sm">
          <Loader2Icon className="size-4 animate-spin" /> 불러오는 중…
        </div>
      ) : hasMore ? (
        <div className="flex justify-center py-2">
          <Button
            variant="outline"
            onClick={() =>
              fetcher.load(
                `/api/laws/filtered-articles?law=${lawCode}&imp=${importanceMin}&bm=${bookmarkMin}&offset=${items.length}`,
              )
            }
          >
            <StarIcon className="size-4" /> 더 보기 ({items.length}/{total})
          </Button>
        </div>
      ) : null}
    </div>
  );
}
