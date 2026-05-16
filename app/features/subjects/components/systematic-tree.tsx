import {
  ChevronRightIcon,
  HeartIcon,
  HighlighterIcon,
  NetworkIcon,
  StickyNoteIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";

import { cn } from "~/core/lib/utils";
import type { ArticleAnnotationCounts } from "~/features/annotations/queries.server";
import type {
  SystematicArticleRef,
  SystematicNode,
} from "~/features/laws/queries.server";
import {
  type NodeProgressByArticle,
  NodeProgressGauge,
  sumNodeProgress,
} from "~/features/subjects/components/node-progress-gauge";
import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";

type ImportanceFilter = 0 | 1 | 2 | 3;
type BookmarkFilter = 0 | 1 | 2 | 3 | 4 | 5;

const IMPORTANCE_LABELS: Record<ImportanceFilter, string> = {
  0: "전체",
  1: "1+",
  2: "2+",
  3: "3",
};

const BOOKMARK_LABELS: Record<BookmarkFilter, string> = {
  0: "전체",
  1: "1+",
  2: "2+",
  3: "3+",
  4: "4+",
  5: "5",
};

interface TreeNode extends SystematicNode {
  children: TreeNode[];
  // 부분트리 article 수 (자기 articles + 모든 후손 articles, 중복 제거)
  subtreeArticleCount: number;
}

function buildTree(nodes: SystematicNode[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];
  for (const n of nodes) {
    map.set(n.nodeId, { ...n, children: [], subtreeArticleCount: 0 });
  }
  for (const n of map.values()) {
    if (n.parentId && map.has(n.parentId)) {
      map.get(n.parentId)!.children.push(n);
    } else {
      roots.push(n);
    }
  }
  const walk = (xs: TreeNode[]) => {
    xs.sort((a, b) => a.ord - b.ord);
    for (const x of xs) walk(x.children);
  };
  walk(roots);

  // subtreeArticleCount 계산 — 부분트리에서 unique articleId 수
  const collect = (n: TreeNode, set: Set<string>): Set<string> => {
    for (const a of n.articles) set.add(a.articleId);
    for (const c of n.children) collect(c, set);
    return set;
  };
  const fillCount = (n: TreeNode) => {
    n.subtreeArticleCount = collect(n, new Set()).size;
    for (const c of n.children) fillCount(c);
  };
  for (const r of roots) fillCount(r);

  return roots;
}

function findActiveAncestors(
  nodes: SystematicNode[],
  activeArticleId: string | undefined,
): Set<string> {
  if (!activeArticleId) return new Set();
  const out = new Set<string>();
  const byId = new Map(nodes.map((n) => [n.nodeId, n] as const));
  for (const n of nodes) {
    if (!n.articles.some((a) => a.articleId === activeArticleId)) continue;
    let cur: SystematicNode | undefined = n;
    while (cur) {
      out.add(cur.nodeId);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
  }
  return out;
}

// 트리에서 leaf article 만 필터하고, articles 와 children 둘 다 비는 노드는 숨긴다.
function filterTree(
  tree: TreeNode[],
  predicate: (a: SystematicArticleRef) => boolean,
): TreeNode[] {
  const recur = (nodes: TreeNode[]): TreeNode[] => {
    const out: TreeNode[] = [];
    for (const n of nodes) {
      const articles = n.articles.filter(predicate);
      const children = recur(n.children);
      if (articles.length === 0 && children.length === 0) continue;
      // subtreeArticleCount 재계산 (필터된 결과 기준)
      const seen = new Set<string>();
      for (const a of articles) seen.add(a.articleId);
      for (const c of children) {
        const collect = (cn: TreeNode, s: Set<string>) => {
          for (const a of cn.articles) s.add(a.articleId);
          for (const cc of cn.children) collect(cc, s);
        };
        collect(c, seen);
      }
      out.push({ ...n, articles, children, subtreeArticleCount: seen.size });
    }
    return out;
  };
  return recur(tree);
}

export function SystematicTree({
  nodes,
  activeArticleId,
  lawCode,
  emptyHint,
  bookmarkLevels,
  annotationCounts,
  progressByArticle,
}: {
  nodes: SystematicNode[];
  activeArticleId?: string;
  lawCode: LawSubjectSlug;
  emptyHint?: string;
  bookmarkLevels?: Record<string, number>;
  annotationCounts?: Record<string, ArticleAnnotationCounts>;
  progressByArticle?: NodeProgressByArticle;
}) {
  const tree = useMemo(() => buildTree(nodes), [nodes]);
  const expandedIds = useMemo(
    () => findActiveAncestors(nodes, activeArticleId),
    [nodes, activeArticleId],
  );
  const [importanceFilter, setImportanceFilter] = useState<ImportanceFilter>(0);
  const [bookmarkFilter, setBookmarkFilter] = useState<BookmarkFilter>(0);
  const showBookmarkFilter = bookmarkLevels !== undefined;

  const visible = useMemo(() => {
    if (importanceFilter === 0 && bookmarkFilter === 0) return tree;
    return filterTree(tree, (a) => {
      if (importanceFilter !== 0 && a.importance < importanceFilter) {
        return false;
      }
      if (bookmarkFilter !== 0) {
        const lvl = bookmarkLevels?.[a.articleId] ?? 0;
        if (lvl < bookmarkFilter) return false;
      }
      return true;
    });
  }, [tree, importanceFilter, bookmarkFilter, bookmarkLevels]);

  const articleCount = useMemo(() => {
    const seen = new Set<string>();
    const walk = (xs: TreeNode[]) => {
      for (const x of xs) {
        for (const a of x.articles) seen.add(a.articleId);
        walk(x.children);
      }
    };
    walk(visible);
    return seen.size;
  }, [visible]);

  const filterActive = importanceFilter !== 0 || bookmarkFilter !== 0;

  if (tree.length === 0) {
    return (
      <p className="text-muted-foreground px-2 py-4 text-xs">
        {emptyHint ?? "테크 트리 데이터가 등록되지 않았습니다."}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="space-y-1.5 px-2">
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-muted-foreground mr-0.5 inline-flex items-center gap-0.5 text-[10px] font-medium tracking-wide uppercase">
            <span className="text-amber-500">★</span>
            중요도
          </span>
          {([0, 1, 2, 3] as ImportanceFilter[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setImportanceFilter(v)}
              aria-pressed={importanceFilter === v}
              className={cn(
                "rounded-md border px-1.5 py-0.5 text-[11px] transition-colors",
                importanceFilter === v
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background hover:bg-accent text-muted-foreground border-input",
              )}
            >
              {IMPORTANCE_LABELS[v]}
            </button>
          ))}
        </div>
        {showBookmarkFilter ? (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-muted-foreground mr-0.5 inline-flex items-center gap-0.5 text-[10px] font-medium tracking-wide uppercase">
              <HeartIcon className="size-3 fill-rose-500 stroke-rose-500" />
              즐겨찾기
            </span>
            {([0, 1, 2, 3, 4, 5] as BookmarkFilter[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setBookmarkFilter(v)}
                aria-pressed={bookmarkFilter === v}
                className={cn(
                  "rounded-md border px-1.5 py-0.5 text-[11px] transition-colors",
                  bookmarkFilter === v
                    ? "border-rose-500 bg-rose-500 text-white"
                    : "bg-background hover:bg-accent text-muted-foreground border-input",
                )}
              >
                {BOOKMARK_LABELS[v]}
              </button>
            ))}
          </div>
        ) : null}
        {filterActive ? (
          <p className="text-muted-foreground text-right text-[11px] tabular-nums">
            {articleCount}조
          </p>
        ) : null}
      </div>
      {visible.length === 0 ? (
        <p className="text-muted-foreground px-2 py-4 text-xs">
          {bookmarkFilter !== 0
            ? `즐겨찾기 ${BOOKMARK_LABELS[bookmarkFilter]} 조문이 없습니다.`
            : `중요도 ${IMPORTANCE_LABELS[importanceFilter]} 조문이 없습니다.`}
        </p>
      ) : (
        <ul className="space-y-0.5 text-sm">
          {visible.map((n) => (
            <SystematicItem
              key={n.nodeId}
              node={n}
              depth={0}
              forceOpen={expandedIds}
              activeArticleId={activeArticleId}
              lawCode={lawCode}
              bookmarkLevels={bookmarkLevels}
              annotationCounts={annotationCounts}
              progressByArticle={progressByArticle}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function SystematicItem({
  node,
  depth,
  forceOpen,
  activeArticleId,
  lawCode,
  bookmarkLevels,
  annotationCounts,
  progressByArticle,
}: {
  node: TreeNode;
  depth: number;
  forceOpen: Set<string>;
  activeArticleId?: string;
  lawCode: LawSubjectSlug;
  bookmarkLevels?: Record<string, number>;
  annotationCounts?: Record<string, ArticleAnnotationCounts>;
  progressByArticle?: NodeProgressByArticle;
}) {
  const initialOpen = forceOpen.has(node.nodeId) || depth === 0;
  const [open, setOpen] = useState(initialOpen);
  const hasChildren = node.children.length > 0;
  const hasArticles = node.articles.length > 0;
  const expandable = hasChildren || hasArticles;

  // 체계도 위계 그라데이션:
  //   depth 0 (01, 02) — 가장 진함.
  //   depth ≥ 1 + 자식 그룹 있음 (예: [01], [02]) — 진하게, depth 별로 살짝 옅어짐.
  //   depth ≥ 1 + 자식 그룹 없음 (예: 목적, 발명, 특허소송, 변리사 보수) — 조문 leaf shelf 라
  //     section 헤더로 보일 필요 없음. 옅게 처리해 article leaf 와 자연스럽게 이어짐.
  const groupClass = (() => {
    if (depth === 0) return "text-foreground font-extrabold";
    if (!hasChildren) return "text-foreground/75 font-medium";
    if (depth === 1) return "text-foreground font-semibold";
    return "text-foreground/85 font-medium";
  })();
  const rowClass = cn(
    "group flex w-full items-center gap-1.5 rounded-lg px-2 py-[5px] text-left text-[13px]",
    groupClass,
    "transition-colors hover:bg-[#2D5BA8]/[0.06] dark:hover:bg-[#3B6FC4]/10",
  );

  const chevron = expandable ? (
    <ChevronRightIcon
      className={cn("size-3 transition-transform", open && "rotate-90")}
    />
  ) : (
    <span className="inline-block size-3" />
  );

  const labelEl = <span className="flex-1 truncate">{node.displayLabel}</span>;
  const countEl =
    node.subtreeArticleCount > 0 ? (
      <span className="text-muted-foreground inline-flex shrink-0 items-center gap-0.5 text-[10px] tabular-nums">
        <NetworkIcon className="size-3" />
        {node.subtreeArticleCount}
      </span>
    ) : null;

  // 노드 subtree articleIds 합산 → 게이지.
  const subtreeArticleIds: string[] = (() => {
    if (!progressByArticle) return [];
    const set = new Set<string>();
    const walk = (n: TreeNode) => {
      for (const a of n.articles) set.add(a.articleId);
      for (const c of n.children) walk(c);
    };
    walk(node);
    return [...set];
  })();
  const totals = progressByArticle
    ? sumNodeProgress(subtreeArticleIds, progressByArticle)
    : null;
  const gaugeEl =
    totals && totals.articleTotal > 0 ? (
      <NodeProgressGauge totals={totals} compact />
    ) : null;

  return (
    <li>
      {expandable ? (
        // 그룹 노드(직접 매핑된 articles 또는 children 가짐) — 라벨 = 그룹 viewer 로 이동, chevron = 펼침 토글 분리.
        <div className={rowClass}>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "접기" : "펼치기"}
            aria-expanded={open}
            className="text-muted-foreground hover:text-foreground inline-flex size-4 shrink-0 items-center justify-center"
          >
            {chevron}
          </button>
          <Link
            to={`/subjects/${lawCode}/systematic/${node.nodeId}`}
            viewTransition
            className="flex min-w-0 flex-1 items-center gap-1.5 hover:underline"
          >
            {labelEl}
            {gaugeEl}
            {countEl}
          </Link>
        </div>
      ) : (
        <div className={rowClass}>
          <span className="inline-block size-4" />
          {labelEl}
          {gaugeEl}
          {countEl}
        </div>
      )}
      {open ? (
        <div className="border-border ml-[15px] space-y-0.5 border-l-[1.5px] pl-0.5">
          {hasArticles ? (
            <ul className="space-y-0.5">
              {node.articles.map((a) => (
                <li key={a.articleId}>
                  <ArticleLeafLink
                    article={a}
                    activeArticleId={activeArticleId}
                    lawCode={lawCode}
                    bookmarkLevel={bookmarkLevels?.[a.articleId] ?? 0}
                    annotation={annotationCounts?.[a.articleId]}
                  />
                </li>
              ))}
            </ul>
          ) : null}
          {hasChildren ? (
            <ul className="space-y-0.5">
              {node.children.map((c) => (
                <SystematicItem
                  key={c.nodeId}
                  node={c}
                  depth={depth + 1}
                  forceOpen={forceOpen}
                  activeArticleId={activeArticleId}
                  lawCode={lawCode}
                  bookmarkLevels={bookmarkLevels}
                  annotationCounts={annotationCounts}
                  progressByArticle={progressByArticle}
                />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function ArticleLeafLink({
  article,
  activeArticleId,
  lawCode,
  bookmarkLevel,
  annotation,
}: {
  article: {
    articleId: string;
    articleNumber: string | null;
    displayLabel: string;
    importance: number;
  };
  activeArticleId?: string;
  lawCode: LawSubjectSlug;
  bookmarkLevel: number;
  annotation: ArticleAnnotationCounts | undefined;
}) {
  const isActive = activeArticleId === article.articleId;
  const importance = Math.max(0, Math.min(3, article.importance));
  const rowClass = cn(
    "flex items-center gap-1.5 rounded-lg px-2 py-[5px] text-left text-[13px] transition-colors",
    isActive
      ? "bg-[#2D5BA8]/10 font-semibold text-[#1E4789] shadow-[inset_2px_0_0_#2D5BA8] dark:bg-[#3B6FC4]/15 dark:text-[#8FB4E3]"
      : "font-normal text-foreground/65 hover:bg-[#2D5BA8]/[0.06] dark:hover:bg-[#3B6FC4]/10",
  );

  const content = (
    <>
      <span className="inline-block size-4 shrink-0" />
      <span
        aria-hidden="true"
        className={cn(
          "size-1 shrink-0 rounded-full",
          isActive ? "bg-[#2D5BA8] dark:bg-[#8FB4E3]" : "bg-foreground/25",
        )}
      />
      <span className="flex-1 truncate">{article.displayLabel}</span>
      <ArticleAnnotationIndicators
        bookmarkLevel={bookmarkLevel}
        annotation={annotation}
      />
      {importance > 0 ? (
        <span
          className="inline-flex shrink-0 items-center text-amber-500"
          aria-label={`중요도 ${importance}`}
          title={`중요도 ${importance}`}
        >
          <span className="text-[11px] leading-none">★</span>
          <span className="ml-0.5 text-[10px] tabular-nums">{importance}</span>
        </span>
      ) : null}
    </>
  );

  if (!article.articleNumber) {
    return <div className={rowClass}>{content}</div>;
  }

  return (
    <Link
      to={`/subjects/${lawCode}/articles/${article.articleNumber}`}
      viewTransition
      className={rowClass}
      aria-current={isActive ? "page" : undefined}
    >
      {content}
    </Link>
  );
}

// 같은 article 이 트리의 여러 위치에 매핑돼도, article_id 단위 데이터가 sync 되어 모든 위치에 동일하게 표시.
function ArticleAnnotationIndicators({
  bookmarkLevel,
  annotation,
}: {
  bookmarkLevel: number;
  annotation: ArticleAnnotationCounts | undefined;
}) {
  const memos = annotation?.memos ?? 0;
  const highlights = annotation?.highlights ?? 0;
  return (
    <>
      {memos > 0 ? (
        <span
          className="inline-flex shrink-0 items-center text-emerald-600 dark:text-emerald-400"
          aria-label={`포스트잇 ${memos}개`}
          title={`포스트잇 ${memos}개`}
        >
          <StickyNoteIcon className="size-3" />
          <span className="ml-0.5 text-[10px] tabular-nums">{memos}</span>
        </span>
      ) : null}
      {highlights > 0 ? (
        <span
          className="inline-flex shrink-0 items-center text-yellow-600 dark:text-yellow-400"
          aria-label={`하이라이트 ${highlights}개`}
          title={`하이라이트 ${highlights}개`}
        >
          <HighlighterIcon className="size-3" />
          <span className="ml-0.5 text-[10px] tabular-nums">{highlights}</span>
        </span>
      ) : null}
      {bookmarkLevel > 0 ? (
        <span
          className="inline-flex shrink-0 items-center text-rose-500"
          aria-label={`즐겨찾기 ${bookmarkLevel}단계`}
          title={`즐겨찾기 ${bookmarkLevel}`}
        >
          <HeartIcon className="size-3 fill-current" />
          <span className="ml-0.5 text-[10px] tabular-nums">
            {bookmarkLevel}
          </span>
        </span>
      ) : null}
    </>
  );
}
