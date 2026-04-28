import { ChevronRightIcon, FileTextIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";

import { cn } from "~/core/lib/utils";
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

const FILTER_LABELS: Record<ImportanceFilter, string> = {
  0: "전체",
  1: "★ 이상",
  2: "★★ 이상",
  3: "★★★",
};

function filterTreeByImportance(
  tree: TreeNode[],
  threshold: ImportanceFilter,
): TreeNode[] {
  if (threshold === 0) return tree;
  // article 만 필터. chapter 는 자식이 남으면 표시.
  const recur = (nodes: TreeNode[]): TreeNode[] => {
    const out: TreeNode[] = [];
    for (const n of nodes) {
      if (n.level === "article") {
        if (n.importance >= threshold) out.push({ ...n, children: [] });
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
  lawCode,
}: {
  nodes: ArticleNode[];
  emptyHint?: string;
  activeArticleId?: string;
  lawCode: LawSubjectSlug;
}) {
  const tree = useMemo(() => buildTree(nodes), [nodes]);
  const expandedIds = useMemo(
    () => findAncestorIds(nodes, activeArticleId),
    [nodes, activeArticleId],
  );
  const [filter, setFilter] = useState<ImportanceFilter>(0);
  const visible = useMemo(
    () => filterTreeByImportance(tree, filter),
    [tree, filter],
  );

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

  if (tree.length === 0) {
    return (
      <p className="text-muted-foreground px-2 py-4 text-xs">
        {emptyHint ?? "조문이 아직 등록되지 않았습니다."}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1 px-2">
        {([0, 1, 2, 3] as ImportanceFilter[]).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setFilter(v)}
            aria-pressed={filter === v}
            className={cn(
              "rounded-md border px-1.5 py-0.5 text-[11px] transition-colors",
              filter === v
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background hover:bg-accent text-muted-foreground border-input",
            )}
          >
            {FILTER_LABELS[v]}
          </button>
        ))}
        {filter !== 0 ? (
          <span className="text-muted-foreground ml-auto text-[11px]">
            {articleCount}조
          </span>
        ) : null}
      </div>
      {visible.length === 0 ? (
        <p className="text-muted-foreground px-2 py-4 text-xs">
          중요도 {FILTER_LABELS[filter]} 조문이 없습니다.
        </p>
      ) : (
        <ul className="space-y-0.5 text-sm">
          {visible.map((n) => (
            <TreeItem
              key={n.articleId}
              node={n}
              depth={0}
              activeArticleId={activeArticleId}
              forceOpen={expandedIds}
              lawCode={lawCode}
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
  forceOpen,
  lawCode,
}: {
  node: TreeNode;
  depth: number;
  activeArticleId?: string;
  forceOpen: Set<string>;
  lawCode: LawSubjectSlug;
}) {
  const hasChildren = node.children.length > 0;
  const initialOpen = depth < 1 || forceOpen.has(node.articleId);
  const [open, setOpen] = useState(initialOpen);
  const isArticle = node.level === "article";
  const isActive = activeArticleId === node.articleId;

  const labelEl = (
    <span className="flex-1 truncate">{node.displayLabel}</span>
  );
  const starEl = isArticle ? (
    <span className="text-amber-500 text-[11px] tabular-nums shrink-0">
      {"★".repeat(Math.max(0, Math.min(3, node.importance)))}
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
      <ChevronRightIcon
        className={cn("size-3.5 transition-transform", open && "rotate-90")}
      />
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
          {starEl}
        </Link>
      ) : (
        <div className={rowClass} style={rowStyle}>
          {expandToggle}
          {fileEl}
          {labelEl}
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
              forceOpen={forceOpen}
              lawCode={lawCode}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
