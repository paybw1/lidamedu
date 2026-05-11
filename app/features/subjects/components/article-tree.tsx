import {
  BrainIcon,
  ChevronRightIcon,
  FileTextIcon,
  HeartIcon,
  HighlighterIcon,
  Loader2Icon,
  StickyNoteIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";

import { cn } from "~/core/lib/utils";
import type { ArticleAnnotationCounts } from "~/features/annotations/queries.server";
import { compareArticlesNatural } from "~/features/laws/lib/article-sort";
import type { ArticleNode } from "~/features/laws/queries.server";
import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";

interface TreeNode extends ArticleNode {
  children: TreeNode[];
}

// Lazy-expand 옵션 — 큰 법령(민법 1118조 등)에서 사용.
// `nodes` 가 부분 skeleton 일 때, 사용자가 펼친 미로드 노드의 자식을 on-demand 로 fetch.
// 전체 skeleton 이 미리 로드된 법령(예: 특허법)에서는 prop 만 켜져 있어도 자식이
// 이미 메모리에 있어 fetch 가 발생하지 않는다 (no-op). 따라서 caller 측 가드 없이도 안전.
export interface LazyExpandConfig {
  lawId: string;
}

// 조문 트리에서 숨길 placeholder chapter — 자료상 등록만 되어 있고 실제 조문은 매핑되지 않은
// 외부 참조용 헤딩들. 학생에게 노출 시 클릭해도 빈 chapter-viewer 가 떠 학습에 방해.
const HIDDEN_CHAPTER_LABELS = new Set<string>(["국제조약", "실용신안법"]);

function pruneHidden(nodes: ArticleNode[]): ArticleNode[] {
  const hiddenIds = new Set<string>();
  for (const n of nodes) {
    if (
      n.level !== "article" &&
      HIDDEN_CHAPTER_LABELS.has(n.displayLabel.trim())
    ) {
      hiddenIds.add(n.articleId);
    }
  }
  if (hiddenIds.size === 0) return nodes;
  // 숨긴 노드의 후손까지 재귀로 함께 제거.
  const visible: ArticleNode[] = [];
  const isDescendantOfHidden = (n: ArticleNode): boolean => {
    let cur: ArticleNode | undefined = n;
    while (cur?.parentId) {
      if (hiddenIds.has(cur.parentId)) return true;
      cur = nodes.find((x) => x.articleId === cur!.parentId);
    }
    return false;
  };
  for (const n of nodes) {
    if (hiddenIds.has(n.articleId)) continue;
    if (isDescendantOfHidden(n)) continue;
    visible.push(n);
  }
  return visible;
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
  lazyExpand,
}: {
  nodes: ArticleNode[];
  emptyHint?: string;
  activeArticleId?: string;
  // chapter-viewer 에서 진입했을 때 현재 보고 있는 chapter/section/part 의 id — 트리에서 강조.
  activeChapterId?: string;
  lawCode: LawSubjectSlug;
  bookmarkLevels?: Record<string, number>;
  annotationCounts?: Record<string, ArticleAnnotationCounts>;
  lazyExpand?: LazyExpandConfig;
}) {
  // Lazy 모드용 — 펼침 이벤트로 fetch 한 자식 노드 누적.
  // nodes prop 이 바뀌면(다른 법령으로 이동 등) 리셋.
  const [extraNodes, setExtraNodes] = useState<ArticleNode[]>([]);
  const [loadedParents, setLoadedParents] = useState<Set<string>>(
    () => new Set(),
  );
  const [pendingParents, setPendingParents] = useState<Set<string>>(
    () => new Set(),
  );
  const prevNodesRef = useRef(nodes);
  useEffect(() => {
    if (prevNodesRef.current !== nodes) {
      prevNodesRef.current = nodes;
      setExtraNodes([]);
      setLoadedParents(new Set());
      setPendingParents(new Set());
    }
  }, [nodes]);

  const allNodes = useMemo(() => {
    if (extraNodes.length === 0) return nodes;
    const seen = new Set(nodes.map((n) => n.articleId));
    const merged = nodes.slice();
    for (const e of extraNodes) {
      if (!seen.has(e.articleId)) {
        merged.push(e);
        seen.add(e.articleId);
      }
    }
    return merged;
  }, [nodes, extraNodes]);

  const requestChildren = useCallback(
    async (parentId: string) => {
      if (!lazyExpand) return;
      if (loadedParents.has(parentId)) return;
      if (pendingParents.has(parentId)) return;
      setPendingParents((prev) => {
        const s = new Set(prev);
        s.add(parentId);
        return s;
      });
      try {
        const url = `/api/laws/article-children?lawId=${encodeURIComponent(
          lazyExpand.lawId,
        )}&parentId=${encodeURIComponent(parentId)}`;
        const resp = await fetch(url, { credentials: "same-origin" });
        if (!resp.ok) return;
        const json = (await resp.json()) as { children?: ArticleNode[] };
        const children = json.children ?? [];
        setExtraNodes((prev) => {
          const seen = new Set(prev.map((n) => n.articleId));
          const fresh = children.filter((c) => !seen.has(c.articleId));
          return fresh.length === 0 ? prev : [...prev, ...fresh];
        });
        setLoadedParents((prev) => {
          const s = new Set(prev);
          s.add(parentId);
          return s;
        });
      } finally {
        setPendingParents((prev) => {
          const s = new Set(prev);
          s.delete(parentId);
          return s;
        });
      }
    },
    [lazyExpand, loadedParents, pendingParents],
  );

  const tree = useMemo(() => buildTree(pruneHidden(allNodes)), [allNodes]);
  const expandedIds = useMemo(() => {
    const ids = findAncestorIds(allNodes, activeArticleId);
    // chapter-viewer 진입 시 그 chapter 의 조상도 펼쳐 트리에서 위치 인지 가능.
    if (activeChapterId) {
      for (const id of findAncestorIds(allNodes, activeChapterId)) ids.add(id);
      ids.add(activeChapterId);
    }
    return ids;
  }, [allNodes, activeArticleId, activeChapterId]);
  const [importanceFilter, setImportanceFilter] = useState<ImportanceFilter>(0);
  const [bookmarkFilter, setBookmarkFilter] = useState<BookmarkFilter>(0);
  const [searchQuery, setSearchQuery] = useState("");
  const showBookmarkFilter = bookmarkLevels !== undefined;
  const trimmedQuery = searchQuery.trim().toLowerCase();

  const visible = useMemo(() => {
    if (
      importanceFilter === 0 &&
      bookmarkFilter === 0 &&
      trimmedQuery === ""
    )
      return tree;

    // 검색은 모든 노드(chapter/section/article) 레이블 매칭. 매칭되는 노드와 그
    // 조상은 보이고, 다른 자손은 숨김. 부분 검색은 단순 substring (트리만 N≤수백개).
    const matches = (label: string) =>
      trimmedQuery === "" || label.toLowerCase().includes(trimmedQuery);

    const recur = (nodes: TreeNode[]): TreeNode[] => {
      const out: TreeNode[] = [];
      for (const n of nodes) {
        const articleOk =
          n.level !== "article" ||
          ((importanceFilter === 0 || n.importance >= importanceFilter) &&
            (bookmarkFilter === 0 ||
              (bookmarkLevels?.[n.articleId] ?? 0) >= bookmarkFilter));
        if (!articleOk) continue;

        const selfHit = matches(n.displayLabel);
        const kids = recur(n.children);
        if (selfHit || kids.length > 0) {
          out.push({ ...n, children: kids });
        }
      }
      return out;
    };
    return recur(tree);
  }, [tree, importanceFilter, bookmarkFilter, bookmarkLevels, trimmedQuery]);

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
        <div className="relative">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="조문 검색 — 예: 신규성, 제29조"
            aria-label="조문 트리 내 검색"
            className="border-input bg-background h-7 w-full rounded-md border px-2 pr-7 text-[11px]"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              aria-label="검색 지우기"
              className="text-muted-foreground hover:text-foreground absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px]"
            >
              ✕
            </button>
          ) : null}
        </div>
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
              lazyExpand={lazyExpand}
              loadedParents={loadedParents}
              pendingParents={pendingParents}
              requestChildren={requestChildren}
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
  lazyExpand,
  loadedParents,
  pendingParents,
  requestChildren,
}: {
  node: TreeNode;
  depth: number;
  activeArticleId?: string;
  activeChapterId?: string;
  forceOpen: Set<string>;
  lawCode: LawSubjectSlug;
  bookmarkLevels?: Record<string, number>;
  annotationCounts?: Record<string, ArticleAnnotationCounts>;
  lazyExpand?: LazyExpandConfig;
  loadedParents: Set<string>;
  pendingParents: Set<string>;
  requestChildren: (parentId: string) => void;
}) {
  const isArticleLeaf = node.level === "article";
  // 자식 후보: 이미 메모리에 있는 자식 + lazy 모드에서 미로드 chapter (자식 unknown)
  const knownHasChildren = node.children.length > 0;
  // lazy 모드에서 chapter/section/part 는 자식을 아직 fetch 하지 않았다면 "있을 수 있음" 으로 간주.
  // 한 번 fetch 했으나 0건이면 (loadedParents 에 있고 knownHasChildren===false) chevron 숨김.
  const maybeHasLazyChildren =
    !!lazyExpand &&
    !isArticleLeaf &&
    !knownHasChildren &&
    !loadedParents.has(node.articleId);
  const hasChildren = knownHasChildren || maybeHasLazyChildren;
  const isPending = pendingParents.has(node.articleId);
  // 장(chapter) 은 기본적으로 접혀 있고 클릭해야 펼쳐짐 — 단, 활성 조문/chapter 의 조상 장은 자동 펼침
  const initialOpen = forceOpen.has(node.articleId);
  const [open, setOpen] = useState(initialOpen);
  // navigation 으로 forceOpen set 이 바뀌면 (다른 chapter/article 로 이동) 새 활성 노드의 조상을 자동 펼침.
  // 이미 펼쳐 둔 상태는 강제로 닫지 않는다 — 사용자가 수동으로 펼친 다른 가지는 유지.
  useEffect(() => {
    if (forceOpen.has(node.articleId)) setOpen(true);
  }, [forceOpen, node.articleId]);
  // 강제 펼침으로 open 이 켜졌는데 자식이 아직 메모리에 없는 lazy 노드라면 fetch.
  useEffect(() => {
    if (
      open &&
      lazyExpand &&
      !isArticleLeaf &&
      !knownHasChildren &&
      !loadedParents.has(node.articleId) &&
      !pendingParents.has(node.articleId)
    ) {
      requestChildren(node.articleId);
    }
  }, [
    open,
    lazyExpand,
    isArticleLeaf,
    knownHasChildren,
    loadedParents,
    pendingParents,
    node.articleId,
    requestChildren,
  ]);
  const isArticle = isArticleLeaf;
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

  // 위계별 진하기 그라데이션: 편(가장 진함) → 장 → 절 → 조(가장 옅음).
  // 같은 viewer 안에 동시에 보이는 수준이 다양해도 한눈에 위계가 인지되도록.
  const levelClass = (() => {
    switch (node.level) {
      case "part":
        return "text-foreground font-bold";
      case "chapter":
        return "text-foreground font-semibold";
      case "section":
        return "text-foreground/85 font-medium";
      default:
        return "text-foreground/65"; // article
    }
  })();
  const rowClass = cn(
    "group flex items-center gap-1 rounded-md py-1.5 pr-2 text-left",
    levelClass,
    isActive
      ? "bg-accent text-accent-foreground"
      : "hover:bg-accent",
  );
  const rowStyle = { paddingLeft: `${depth * 12 + 6}px` };

  // chevron — 모든 row 에서 별도 button 으로 토글. button-in-link 도 안전 (preventDefault).
  const chevronIcon = isPending ? (
    <Loader2Icon className="size-3.5 animate-spin" />
  ) : (
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
        // lazy 모드: 미로드 노드는 펼치는 순간 fetch 트리거. useEffect 도 백업으로 동작.
        if (
          lazyExpand &&
          !isArticleLeaf &&
          !knownHasChildren &&
          !loadedParents.has(node.articleId)
        ) {
          requestChildren(node.articleId);
        }
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
      {knownHasChildren && open ? (
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
              lazyExpand={lazyExpand}
              loadedParents={loadedParents}
              pendingParents={pendingParents}
              requestChildren={requestChildren}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
