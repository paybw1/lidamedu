import {
  BrainIcon,
  ChevronRightIcon,
  FileTextIcon,
  HeartIcon,
  HighlighterIcon,
  StickyNoteIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";

import { cn } from "~/core/lib/utils";
import type { ArticleAnnotationCounts } from "~/features/annotations/queries.server";
import { compareArticlesNatural } from "~/features/laws/lib/article-sort";
import type { ArticleNode } from "~/features/laws/queries.server";
import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";

interface TreeNode extends ArticleNode {
  children: TreeNode[];
}

function buildTree(nodes: ArticleNode[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];
  for (const n of nodes) map.set(n.articleId, { ...n, children: [] });
  for (const n of map.values()) {
    if (n.parentId && map.has(n.parentId)) {
      map.get(n.parentId)!.children.push(n);
    } else {
      roots.push(n);
    }
  }
  const walk = (xs: TreeNode[]) => {
    xs.sort(compareArticlesNatural);
    for (const x of xs) walk(x.children);
  };
  walk(roots);
  return roots;
}

function findAncestorIds(
  nodes: ArticleNode[],
  activeId: string | undefined,
): Set<string> {
  if (!activeId) return new Set();
  const byId = new Map(nodes.map((n) => [n.articleId, n] as const));
  const out = new Set<string>();
  let cur = byId.get(activeId);
  while (cur?.parentId) {
    out.add(cur.parentId);
    cur = byId.get(cur.parentId);
  }
  return out;
}

type ImportanceFilter = 0 | 1 | 2 | 3; // 0=전체, 1=★+, 2=★★+, 3=★★★
type BookmarkFilter = 0 | 1 | 2 | 3 | 4 | 5; // 0=전체, N=N개 이상

const FILTER_LABELS: Record<ImportanceFilter, string> = {
  0: "전체",
  1: "1+",
  2: "2+",
  3: "3",
};

const BOOKMARK_FILTER_LABELS: Record<BookmarkFilter, string> = {
  0: "전체",
  1: "1+",
  2: "2+",
  3: "3+",
  4: "4+",
  5: "5",
};

// 트리에서 article 노드만 조건으로 필터. 장(chapter) 등 상위 노드는 자식이 남으면 유지.
function filterArticleTree(
  tree: TreeNode[],
  predicate: (article: TreeNode) => boolean,
): TreeNode[] {
  const recur = (nodes: TreeNode[]): TreeNode[] => {
    const out: TreeNode[] = [];
    for (const n of nodes) {
      if (n.level === "article") {
        if (predicate(n)) out.push({ ...n, children: [] });
      } else {
        const kids = recur(n.children);
        if (kids.length > 0) out.push({ ...n, children: kids });
      }
    }
    return out;
  };
  return recur(tree);
}

export function ArticleTree({
  nodes,
  emptyHint,
  activeArticleId,
  activeChapterId,
  lawCode,
  bookmarkLevels,
  annotationCounts,
}: {
  nodes: ArticleNode[];
  emptyHint?: string;
  activeArticleId?: string;
  // chapter-viewer 에서 진입했을 때 현재 보고 있는 chapter/section/part 의 id — 트리에서 강조.
  activeChapterId?: string;
  lawCode: LawSubjectSlug;
  bookmarkLevels?: Record<string, number>;
  annotationCounts?: Record<string, ArticleAnnotationCounts>;
}) {
  const tree = useMemo(() => buildTree(nodes), [nodes]);
  const expandedIds = useMemo(() => {
    const ids = findAncestorIds(nodes, activeArticleId);
    // chapter-viewer 진입 시 그 chapter 의 조상도 펼쳐 트리에서 위치 인지 가능.
    if (activeChapterId) {
      for (const id of findAncestorIds(nodes, activeChapterId)) ids.add(id);
      ids.add(activeChapterId);
    }
    return ids;
  }, [nodes, activeArticleId, activeChapterId]);
  const [importanceFilter, setImportanceFilter] = useState<ImportanceFilter>(0);
  const [bookmarkFilter, setBookmarkFilter] = useState<BookmarkFilter>(0);
  const showBookmarkFilter = bookmarkLevels !== undefined;

  const visible = useMemo(() => {
    if (importanceFilter === 0 && bookmarkFilter === 0) return tree;
    return filterArticleTree(tree, (article) => {
      if (importanceFilter !== 0 && article.importance < importanceFilter) {
        return false;
      }
      if (bookmarkFilter !== 0) {
        const lvl = bookmarkLevels?.[article.articleId] ?? 0;
        if (lvl < bookmarkFilter) return false;
      }
      return true;
    });
  }, [tree, importanceFilter, bookmarkFilter, bookmarkLevels]);

  const articleCount = useMemo(() => {
    let n = 0;
    const walk = (xs: TreeNode[]) => {
      for (const x of xs) {
        if (x.level === "article") n++;
        walk(x.children);
      }
    };
    walk(visible);
    return n;
  }, [visible]);

  const filterActive = importanceFilter !== 0 || bookmarkFilter !== 0;

  if (tree.length === 0) {
    return (
      <p className="text-muted-foreground px-2 py-4 text-xs">
        {emptyHint ?? "조문이 아직 등록되지 않았습니다."}
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
              {FILTER_LABELS[v]}
            </button>
          ))}
        </div>
        {showBookmarkFilter ? (
          <div className="flex flex-nowrap items-center gap-0.5">
            <span className="text-muted-foreground mr-0.5 inline-flex shrink-0 items-center gap-0.5 text-[10px] font-medium tracking-wide uppercase">
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
                  "rounded-md border px-1 py-0.5 text-[11px] tabular-nums transition-colors",
                  bookmarkFilter === v
                    ? "bg-rose-500 text-white border-rose-500"
                    : "bg-background hover:bg-accent text-muted-foreground border-input",
                )}
              >
                {BOOKMARK_FILTER_LABELS[v]}
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
            ? `즐겨찾기 ${BOOKMARK_FILTER_LABELS[bookmarkFilter]} 조문이 없습니다.`
            : `중요도 ${FILTER_LABELS[importanceFilter]} 조문이 없습니다.`}
        </p>
      ) : (
        <ul className="space-y-0.5 text-sm">
          {visible.map((n) => (
            <TreeItem
              key={n.articleId}
              node={n}
              depth={0}
              activeArticleId={activeArticleId}
              activeChapterId={activeChapterId}
              forceOpen={expandedIds}
              lawCode={lawCode}
              bookmarkLevels={bookmarkLevels}
              annotationCounts={annotationCounts}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function TreeItem({
  node,
  depth,
  activeArticleId,
  activeChapterId,
  forceOpen,
  lawCode,
  bookmarkLevels,
  annotationCounts,
}: {
  node: TreeNode;
  depth: number;
  activeArticleId?: string;
  activeChapterId?: string;
  forceOpen: Set<string>;
  lawCode: LawSubjectSlug;
  bookmarkLevels?: Record<string, number>;
  annotationCounts?: Record<string, ArticleAnnotationCounts>;
}) {
  const hasChildren = node.children.length > 0;
  // 장(chapter) 은 기본적으로 접혀 있고 클릭해야 펼쳐짐 — 단, 활성 조문/chapter 의 조상 장은 자동 펼침
  const initialOpen = forceOpen.has(node.articleId);
  const [open, setOpen] = useState(initialOpen);
  // navigation 으로 forceOpen set 이 바뀌면 (다른 chapter/article 로 이동) 새 활성 노드의 조상을 자동 펼침.
  // 이미 펼쳐 둔 상태는 강제로 닫지 않는다 — 사용자가 수동으로 펼친 다른 가지는 유지.
  useEffect(() => {
    if (forceOpen.has(node.articleId)) setOpen(true);
  }, [forceOpen, node.articleId]);
  const isArticle = node.level === "article";
  const isActive =
    activeArticleId === node.articleId ||
    activeChapterId === node.articleId;
  const bookmarkLevel = isArticle
    ? (bookmarkLevels?.[node.articleId] ?? 0)
    : 0;
  const annotation = isArticle ? annotationCounts?.[node.articleId] : undefined;
  const memos = annotation?.memos ?? 0;
  const highlights = annotation?.highlights ?? 0;

  const labelEl = (
    <span className="flex-1 truncate">{node.displayLabel}</span>
  );
  const importance = Math.max(0, Math.min(3, node.importance));
  const starEl =
    isArticle && importance > 0 ? (
      <span
        className="inline-flex shrink-0 items-center text-amber-500"
        aria-label={`중요도 ${importance}`}
        title={`중요도 ${importance}`}
      >
        <span className="text-[11px] leading-none">★</span>
        <span className="ml-0.5 text-[10px] tabular-nums">{importance}</span>
      </span>
    ) : null;
  // 별 2개 이상 → 암기 추천. 학생에게 시각적으로 알림 (BrainIcon).
  const recitationHintEl =
    isArticle && importance >= 2 ? (
      <span
        className="inline-flex shrink-0 items-center text-violet-600 dark:text-violet-400"
        aria-label="암기 추천"
        title="중요 조문 — 암기 모드를 권장합니다"
      >
        <BrainIcon className="size-3" />
      </span>
    ) : null;
  const memoEl =
    isArticle && memos > 0 ? (
      <span
        className="inline-flex shrink-0 items-center text-emerald-600 dark:text-emerald-400"
        aria-label={`메모 ${memos}개`}
        title={`메모 ${memos}개`}
      >
        <StickyNoteIcon className="size-3" />
        <span className="ml-0.5 text-[10px] tabular-nums">{memos}</span>
      </span>
    ) : null;
  const highlightEl =
    isArticle && highlights > 0 ? (
      <span
        className="inline-flex shrink-0 items-center text-yellow-600 dark:text-yellow-400"
        aria-label={`하이라이트 ${highlights}개`}
        title={`하이라이트 ${highlights}개`}
      >
        <HighlighterIcon className="size-3" />
        <span className="ml-0.5 text-[10px] tabular-nums">{highlights}</span>
      </span>
    ) : null;
  const heartEl =
    isArticle && bookmarkLevel > 0 ? (
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
    ) : null;
  const fileEl = isArticle ? (
    <FileTextIcon className="text-muted-foreground size-3.5 shrink-0" />
  ) : null;

  const rowClass = cn(
    "group flex items-center gap-1 rounded-md py-1.5 pr-2 text-left",
    isArticle ? "" : "font-medium",
    isActive
      ? "bg-accent text-accent-foreground"
      : "hover:bg-accent",
  );
  const rowStyle = { paddingLeft: `${depth * 12 + 6}px` };

  // chevron — 모든 row 에서 별도 button 으로 토글. button-in-link 도 안전 (preventDefault).
  const chevronIcon = (
    <ChevronRightIcon
      className={cn("size-3.5 transition-transform", open && "rotate-90")}
    />
  );
  const expandToggle = hasChildren ? (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOpen((o) => !o);
      }}
      aria-label={open ? "접기" : "펼치기"}
      className="text-muted-foreground hover:text-foreground inline-flex size-5 items-center justify-center"
    >
      {chevronIcon}
    </button>
  ) : (
    <span className="inline-block size-5" />
  );

  return (
    <li>
      {isArticle && node.articleNumber ? (
        <Link
          to={`/subjects/${lawCode}/articles/${node.articleNumber}`}
          viewTransition
          className={rowClass}
          style={rowStyle}
          aria-current={isActive ? "page" : undefined}
        >
          {expandToggle}
          {fileEl}
          {labelEl}
          {memoEl}
          {highlightEl}
          {heartEl}
          {starEl}
          {recitationHintEl}
        </Link>
      ) : !isArticle ? (
        // 장/절/편 — 클릭하면 그 안의 모든 조문 모아보기. chevron 으로 별도 토글.
        <Link
          to={`/subjects/${lawCode}/chapters/${node.articleId}`}
          viewTransition
          className={rowClass}
          style={rowStyle}
          aria-current={isActive ? "page" : undefined}
        >
          {expandToggle}
          {fileEl}
          {labelEl}
          {memoEl}
          {highlightEl}
          {heartEl}
          {starEl}
          {recitationHintEl}
        </Link>
      ) : (
        <div className={rowClass} style={rowStyle}>
          {expandToggle}
          {fileEl}
          {labelEl}
          {memoEl}
          {highlightEl}
          {heartEl}
          {starEl}
        </div>
      )}
      {hasChildren && open ? (
        <ul className="space-y-0.5">
          {node.children.map((c) => (
            <TreeItem
              key={c.articleId}
              node={c}
              depth={depth + 1}
              activeArticleId={activeArticleId}
              activeChapterId={activeChapterId}
              forceOpen={forceOpen}
              lawCode={lawCode}
              bookmarkLevels={bookmarkLevels}
              annotationCounts={annotationCounts}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
