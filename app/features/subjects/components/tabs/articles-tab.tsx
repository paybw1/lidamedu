import { BookOpenIcon, ClockIcon, StarIcon } from "lucide-react";
import { Link } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import type { ArticleAnnotationCounts } from "~/features/annotations/queries.server";
import type {
  ArticleNode,
  SystematicNode,
} from "~/features/laws/queries.server";
import type { SubjectProgress } from "~/features/study/queries.server";

import { ArticleTree } from "../article-tree";
import { SystematicTree } from "../systematic-tree";
import { SortAxisToggle, useSortAxis } from "../sort-axis";
import type { LawSubjectMeta } from "../../lib/subjects";

export function ArticlesTab({
  subject,
  articles,
  systematicNodes,
  progress,
  bookmarkLevels,
  annotationCounts,
}: {
  subject: LawSubjectMeta;
  articles: ArticleNode[];
  systematicNodes: SystematicNode[];
  progress: SubjectProgress | null;
  bookmarkLevels?: Record<string, number>;
  annotationCounts?: Record<string, ArticleAnnotationCounts>;
}) {
  const { axis } = useSortAxis();
  const articleCount = articles.filter((a) => a.level === "article").length;
  const systematicEmpty = systematicNodes.length === 0;
  const renderSystematic = axis === "systematic" && !systematicEmpty;

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <aside className="space-y-3">
        <Card className="py-4">
          <CardHeader className="px-4 pb-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                {renderSystematic ? "테크 트리" : "조문 트리"}
              </p>
              <SortAxisToggle
                size="sm"
                disabledAxes={systematicEmpty ? ["systematic"] : undefined}
              />
            </div>
          </CardHeader>
          <CardContent className="px-2 pb-2">
            {renderSystematic ? (
              <SystematicTree
                nodes={systematicNodes}
                lawCode={subject.slug}
                emptyHint={`${subject.name} 테크 트리가 아직 등록되지 않았습니다.`}
                bookmarkLevels={bookmarkLevels}
                annotationCounts={annotationCounts}
              />
            ) : (
              <ArticleTree
                nodes={articles}
                emptyHint={`${subject.name} 조문 시드가 아직 없습니다.`}
                lawCode={subject.slug}
                bookmarkLevels={bookmarkLevels}
                annotationCounts={annotationCounts}
              />
            )}
            {axis === "systematic" && systematicEmpty ? (
              <p className="text-muted-foreground mt-2 px-2 text-xs">
                * {subject.name} 테크 트리 데이터 미입력 — 조문 트리로 표시
              </p>
            ) : null}
          </CardContent>
        </Card>
      </aside>

      <section className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Card className="py-4">
            <CardHeader className="px-4 pb-1">
              <div className="flex items-center gap-2">
                <ClockIcon className="text-primary size-4" />
                <p className="text-sm font-semibold">최근 학습</p>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-1">
              {progress?.lastVisited ? (
                <Link
                  to={`/subjects/${subject.slug}/articles/${progress.lastVisited.articleNumber ?? ""}`}
                  viewTransition
                  className="hover:text-primary block text-sm font-medium"
                >
                  {progress.lastVisited.displayLabel}
                </Link>
              ) : (
                <p className="text-muted-foreground text-sm">
                  아직 학습 기록이 없습니다.
                </p>
              )}
              <p className="text-muted-foreground mt-1 text-xs">
                {progress
                  ? `${progress.visitedArticleIds.size} / ${progress.totalArticleCount} 열람`
                  : "feat-4-A-104"}
              </p>
            </CardContent>
          </Card>
          <Card className="py-4">
            <CardHeader className="px-4 pb-1">
              <div className="flex items-center gap-2">
                <StarIcon className="text-primary size-4" />
                <p className="text-sm font-semibold">미열람 권장</p>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-1">
              <p className="text-muted-foreground text-sm">
                중요도 ★ 높은 미열람 조문이 우선 노출됩니다.
              </p>
              <p className="text-muted-foreground mt-1 text-xs">feat-4-A-104</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpenIcon className="text-primary size-5" />
                <h3 className="text-base font-semibold">조문 본문</h3>
              </div>
              <Badge variant="outline">
                {articleCount > 0 ? `조문 ${articleCount}개` : "미입력"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm leading-relaxed">
              좌측 트리에서 조문을 선택하면 본문·하이라이트·메모·정오문제·관련자료·코멘트·Q&amp;A 패널이 함께 열립니다.
            </p>
            <div className="bg-muted/40 mt-4 rounded-md border border-dashed p-6">
              <p className="text-muted-foreground text-center text-sm">
                3분할 뷰어 (트리 / 본문 / 우측 패널) — feat-4-A-105
              </p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled>
                하이라이트·메모·즐겨찾기
              </Button>
              <Button variant="outline" size="sm" disabled>
                정오문제 위젯
              </Button>
              <Button variant="outline" size="sm" disabled>
                관련자료 / 코멘트 / Q&amp;A
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
