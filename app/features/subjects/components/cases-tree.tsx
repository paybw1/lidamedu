// 판례 트리 진입 (feat-4-A-210) — cases 탭 좌측 사이드바.
// 조문 트리(statutory) / 체계도(systematic) 두 모드를 한 컴포넌트에서 분기.
// 각 노드 옆에 leaf 카운트(판례 수) chip 표시.
// 조문 트리는 판례 0건 노드를 trim한다. 체계도(systematic)는 데이터 유무와
// 무관하게 조문·판례·문제 탭이 같은 목차를 보여야 하므로 trim하지 않는다.
// 노드 클릭 → 현재 URL search 에 case_article / case_chapter / case_node 셋업 → 셔플.

import { ChevronRightIcon, GavelIcon, SearchIcon, XIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";

import { Button } from "~/core/components/ui/button";
import { cn } from "~/core/lib/utils";
import { compareArticlesNatural } from "~/features/laws/lib/article-sort";
import type {
  ArticleNode,
  SystematicNode,
} from "~/features/laws/queries.server";

import type { CaseTreeFilter } from "../lib/loader.server";
import type { SortAxis } from "./sort-axis";
import {
  stripSystematicNumber,
  SystematicNumberBadge,
} from "./systematic-node-label";

interface ArticleTreeNode extends ArticleNode {
  children: ArticleTreeNode[];
}

// 조문 트리에서 placeholder chapter (외부 참조용 헤딩) 숨김 — article-tree 와 동일 규칙.
const HIDDEN_CHAPTER_LABELS = new Set<string>(["국제조약", "실용신안법"]);

function buildArticleTree(nodes: ArticleNode[]): ArticleTreeNode[] {
  const map = new Map<string, ArticleTreeNode>();
  for (const n of nodes) map.set(n.articleId, { ...n, children: [] });
  const roots: ArticleTreeNode[] = [];
  for (const n of map.values()) {
    if (n.parentId && map.has(n.parentId)) {
      map.get(n.parentId)!.children.push(n);
    } else {
      roots.push(n);
    }
  }
  const walk = (xs: ArticleTreeNode[]) => {
    xs.sort(compareArticlesNatural);
    for (const x of xs) walk(x.children);
  };
  walk(roots);
  return roots;
}

// 카운트 0 이면 자손 카운트 합도 0 — 그 부분트리는 통째 hide.
function pruneArticleTree(
  nodes: ArticleTreeNode[],
  byArticleId: Record<string, number>,
  byChapterId: Record<string, number>,
): ArticleTreeNode[] {
  const recur = (xs: ArticleTreeNode[]): ArticleTreeNode[] => {
    const out: ArticleTreeNode[] = [];
    for (const n of xs) {
      if (HIDDEN_CHAPTER_LABELS.has(n.displayLabel.trim())) continue;
      if (n.level === "article") {
        if ((byArticleId[n.articleId] ?? 0) > 0) {
          out.push({ ...n, children: [] });
        }
        continue;
      }
      const kids = recur(n.children);
      const selfCount = byChapterId[n.articleId] ?? 0;
      if (kids.length === 0 && selfCount === 0) continue;
      out.push({ ...n, children: kids });
    }
    return out;
  };
  return recur(nodes);
}

interface SystematicTreeNode extends SystematicNode {
  children: SystematicTreeNode[];
}

function buildSystematicTree(nodes: SystematicNode[]): SystematicTreeNode[] {
  const map = new Map<string, SystematicTreeNode>();
  for (const n of nodes) map.set(n.nodeId, { ...n, children: [] });
  const roots: SystematicTreeNode[] = [];
  for (const n of map.values()) {
    if (n.parentId && map.has(n.parentId)) {
      map.get(n.parentId)!.children.push(n);
    } else {
      roots.push(n);
    }
  }
  const walk = (xs: SystematicTreeNode[]) => {
    xs.sort((a, b) => a.ord - b.ord);
    for (const x of xs) walk(x.children);
  };
  walk(roots);
  return roots;
}

// 검색 — 노드 라벨 substring 매칭. 매칭 노드 자신 + 조상 라인 유지.
function searchArticleTree(
  tree: ArticleTreeNode[],
  query: string,
): ArticleTreeNode[] {
  const q = query.trim().toLowerCase();
  if (q === "") return tree;
  const recur = (xs: ArticleTreeNode[]): ArticleTreeNode[] => {
    const out: ArticleTreeNode[] = [];
    for (const n of xs) {
      const self = n.displayLabel.toLowerCase().includes(q);
      const kids = recur(n.children);
      if (self || kids.length > 0) {
        out.push({ ...n, children: kids });
      }
    }
    return out;
  };
  return recur(tree);
}

function searchSystematicTree(
  tree: SystematicTreeNode[],
  query: string,
): SystematicTreeNode[] {
  const q = query.trim().toLowerCase();
  if (q === "") return tree;
  const recur = (xs: SystematicTreeNode[]): SystematicTreeNode[] => {
    const out: SystematicTreeNode[] = [];
    for (const n of xs) {
      const self = n.displayLabel.toLowerCase().includes(q);
      const kids = recur(n.children);
      if (self || kids.length > 0) {
        out.push({ ...n, children: kids });
      }
    }
    return out;
  };
  return recur(tree);
}

// 검색 매칭 시 모든 조상 자동 펼침을 위해, 결과 트리의 모든 비-leaf 노드 ID 수집.
function collectAllAncestorIds(
  tree: ArticleTreeNode[] | SystematicTreeNode[],
  idOf: (n: ArticleTreeNode | SystematicTreeNode) => string,
): Set<string> {
  const out = new Set<string>();
  const walk = (xs: (ArticleTreeNode | SystematicTreeNode)[]) => {
    for (const x of xs) {
      if (x.children.length > 0) {
        out.add(idOf(x));
        walk(x.children);
      }
    }
  };
  walk(tree);
  return out;
}

function activeArticleAncestors(
  articles: ArticleNode[],
  activeId: string | undefined,
): Set<string> {
  if (!activeId) return new Set();
  const byId = new Map(articles.map((a) => [a.articleId, a] as const));
  const out = new Set<string>();
  let cur = byId.get(activeId);
  while (cur?.parentId) {
    out.add(cur.parentId);
    cur = byId.get(cur.parentId);
  }
  return out;
}

function activeSystematicAncestors(
  nodes: SystematicNode[],
  activeId: string | undefined,
): Set<string> {
  if (!activeId) return new Set();
  const byId = new Map(nodes.map((n) => [n.nodeId, n] as const));
  const out = new Set<string>();
  let cur = byId.get(activeId);
  while (cur?.parentId) {
    out.add(cur.parentId);
    cur = byId.get(cur.parentId);
  }
  return out;
}

// 활성 필터 → URL searchParams 빌더.
// 다른 case_* 트리 키는 제거하고 tab=cases 만 유지. 검색어 q 도 자동 해제 —
// 트리 클릭은 "이 조문의 판례를 본다" 강한 의도라 기존 검색어와의 교집합이
// 사용자가 기대하는 동작이 아니다(트리 카운트와 실제 결과 건수 불일치 혼란).
// case_court / case_exam / case_sort 같은 비-검색 필터는 그대로 보존.
function buildTreeHref(
  linkBase: string,
  current: URLSearchParams,
  target: CaseTreeFilter | null,
): string {
  const next = new URLSearchParams(current);
  next.set("tab", "cases");
  next.delete("case_article");
  next.delete("case_chapter");
  next.delete("case_node");
  next.delete("q");
  // back= 도 제거 — 트리 노드 클릭은 "새로 목록을 탐색" 의도. 기존 case-viewer 의
  // ?back= 를 그대로 carry 하면 list 페이지에서 case 클릭 시 detail href 의 back
  // 값에 또 wrap 되어 URL 이 지수적으로 누적 (각 단계마다 인코딩 한 겹씩 추가).
  next.delete("back");
  if (target) {
    if (target.kind === "article") next.set("case_article", target.articleId);
    else if (target.kind === "chapter")
      next.set("case_chapter", target.chapterId);
    else next.set("case_node", target.nodeId);
  }
  return `${linkBase}?${next.toString()}`;
}

export function CasesTree({
  axis,
  articles,
  systematicNodes,
  caseTreeCounts,
  active,
  emptyHint,
  linkBase = "",
}: {
  axis: SortAxis;
  articles: ArticleNode[];
  systematicNodes: SystematicNode[];
  caseTreeCounts: {
    byArticleId: Record<string, number>;
    byChapterId: Record<string, number>;
    byNodeId: Record<string, number>;
  };
  active: CaseTreeFilter | null;
  emptyHint?: string;
  // 트리 링크 경로 prefix. "" = 현재 페이지 상대(?query) — cases 탭 기본.
  // case-viewer 등 다른 라우트에서는 "/subjects/{slug}" 절대 경로를 넘긴다.
  linkBase?: string;
}) {
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");
  const systematicEmpty = systematicNodes.length === 0;
  const renderSystematic = axis === "systematic" && !systematicEmpty;

  const articleTreeBase = useMemo(
    () =>
      pruneArticleTree(
        buildArticleTree(articles),
        caseTreeCounts.byArticleId,
        caseTreeCounts.byChapterId,
      ),
    [articles, caseTreeCounts.byArticleId, caseTreeCounts.byChapterId],
  );
  // 판례 트리는 caseOnly 노드를 포함하고 caseDisplayLabel 이 있으면 그것을
  // displayLabel 자리에 노출 (조문/문제 트리와 분리된 판례 전용 라벨 오버라이드).
  // 한 번에 매핑해 두면 검색·렌더 모두 같은 라벨로 동작.
  const caseViewNodes = useMemo(
    () =>
      systematicNodes.map((n) =>
        n.caseDisplayLabel
          ? { ...n, displayLabel: n.caseDisplayLabel }
          : n,
      ),
    [systematicNodes],
  );
  // 체계도는 trim 없이 전체 노드 표시 — 조문 탭 체계도와 목차 일치 (단, 판례 전용
  // 노드는 추가 노출).
  const systematicTreeBase = useMemo(
    () => buildSystematicTree(caseViewNodes),
    [caseViewNodes],
  );

  const articleTree = useMemo(
    () => searchArticleTree(articleTreeBase, searchQuery),
    [articleTreeBase, searchQuery],
  );
  const systematicTree = useMemo(
    () => searchSystematicTree(systematicTreeBase, searchQuery),
    [systematicTreeBase, searchQuery],
  );

  const activeArticleId =
    active?.kind === "article" ? active.articleId : undefined;
  const activeChapterId =
    active?.kind === "chapter" ? active.chapterId : undefined;
  const activeNodeId = active?.kind === "node" ? active.nodeId : undefined;

  const trimmedQuery = searchQuery.trim();

  const articleForceOpen = useMemo(() => {
    // 검색 중에는 결과 트리의 모든 조상을 자동 펼침 (매칭 노드까지 한 번에 보이도록).
    if (trimmedQuery !== "") {
      return collectAllAncestorIds(articleTree, (n) =>
        (n as ArticleTreeNode).articleId,
      );
    }
    const set = activeArticleAncestors(articles, activeArticleId);
    if (activeChapterId) {
      for (const id of activeArticleAncestors(articles, activeChapterId))
        set.add(id);
      set.add(activeChapterId);
    }
    return set;
  }, [articles, activeArticleId, activeChapterId, trimmedQuery, articleTree]);

  const systematicForceOpen = useMemo(() => {
    if (trimmedQuery !== "") {
      return collectAllAncestorIds(systematicTree, (n) =>
        (n as SystematicTreeNode).nodeId,
      );
    }
    const set = activeSystematicAncestors(caseViewNodes, activeNodeId);
    if (activeNodeId) set.add(activeNodeId);
    return set;
  }, [caseViewNodes, activeNodeId, trimmedQuery, systematicTree]);

  const tree = renderSystematic ? systematicTree : articleTree;
  const isEmpty = tree.length === 0;

  return (
    <div className="space-y-2">
      <div className="px-2">
        <div className="relative">
          <SearchIcon className="text-muted-foreground absolute top-1/2 left-2 size-3 -translate-y-1/2" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              renderSystematic
                ? "체계도 검색 — 예: 진보성, 신규성"
                : "조문 검색 — 예: 신규성, 제29조"
            }
            aria-label="판례 트리 내 검색"
            className="border-input bg-background h-7 w-full rounded-md border pl-7 pr-7 text-[11px]"
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
      </div>

      {active ? (
        <div className="bg-accent/40 mx-2 flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px]">
          <GavelIcon className="text-primary size-3.5" />
          <span className="text-muted-foreground flex-1 truncate">
            트리 필터 활성
          </span>
          <Button asChild variant="ghost" size="sm" className="h-6 px-1.5">
            <Link
              to={buildTreeHref(linkBase, searchParams, null)}
              preventScrollReset
            >
              <XIcon className="size-3" /> 해제
            </Link>
          </Button>
        </div>
      ) : null}

      {isEmpty ? (
        <p className="text-muted-foreground px-2 py-4 text-xs">
          {trimmedQuery !== ""
            ? `"${trimmedQuery}" 와 일치하는 항목이 없습니다.`
            : emptyHint ??
              (renderSystematic
                ? "체계도 노드에 매핑된 판례가 없습니다."
                : "조문에 매핑된 판례가 없습니다.")}
        </p>
      ) : renderSystematic ? (
        <ul className="space-y-0.5 text-sm">
          {systematicTree.map((n) => (
            <SystematicItem
              key={n.nodeId}
              node={n}
              depth={0}
              forceOpen={systematicForceOpen}
              activeNodeId={activeNodeId}
              byNodeId={caseTreeCounts.byNodeId}
              searchParams={searchParams}
              linkBase={linkBase}
            />
          ))}
        </ul>
      ) : (
        <ul className="space-y-0.5 text-sm">
          {articleTree.map((n) => (
            <ArticleItem
              key={n.articleId}
              node={n}
              depth={0}
              forceOpen={articleForceOpen}
              activeArticleId={activeArticleId}
              activeChapterId={activeChapterId}
              byArticleId={caseTreeCounts.byArticleId}
              byChapterId={caseTreeCounts.byChapterId}
              searchParams={searchParams}
              linkBase={linkBase}
            />
          ))}
        </ul>
      )}

      {axis === "systematic" && systematicEmpty ? (
        <p className="text-muted-foreground mt-2 px-2 text-xs">
          * 체계도 데이터 미입력 — 조문 트리로 표시
        </p>
      ) : null}
    </div>
  );
}

// 노드 우측 판례 개수 chip. row 상태에 따라 가시성 차등:
//   • 기본: muted (조용)
//   • group-hover: text-current (accent-foreground 로 대비 ↑, hover 시 잘 보임)
//   • isActive: 역상 솔리드 pill (bg-primary + 흰 글씨) — 선택된 노드 한눈에
function CountChip({ value, isActive }: { value: number; isActive?: boolean }) {
  if (value <= 0) return null;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 text-[10px] tabular-nums transition-colors",
        isActive
          ? "bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 font-bold"
          : "text-muted-foreground group-hover:text-current group-hover:font-semibold",
      )}
    >
      <GavelIcon className="size-3" />
      {value}
    </span>
  );
}

function ArticleItem({
  node,
  depth,
  forceOpen,
  activeArticleId,
  activeChapterId,
  byArticleId,
  byChapterId,
  searchParams,
  linkBase,
}: {
  node: ArticleTreeNode;
  depth: number;
  forceOpen: Set<string>;
  activeArticleId: string | undefined;
  activeChapterId: string | undefined;
  byArticleId: Record<string, number>;
  byChapterId: Record<string, number>;
  searchParams: URLSearchParams;
  linkBase: string;
}) {
  const isArticle = node.level === "article";
  const initialOpen = forceOpen.has(node.articleId) || depth === 0;
  const [open, setOpen] = useState(initialOpen);
  // forceOpen 이 검색 등으로 갱신되면 기존 마운트된 노드도 자동 펼침.
  useEffect(() => {
    if (forceOpen.has(node.articleId)) setOpen(true);
  }, [forceOpen, node.articleId]);
  const hasChildren = node.children.length > 0;
  const isActive =
    activeArticleId === node.articleId || activeChapterId === node.articleId;

  const count = isArticle
    ? byArticleId[node.articleId] ?? 0
    : byChapterId[node.articleId] ?? 0;

  const levelClass = (() => {
    switch (node.level) {
      case "part":
        return "text-foreground font-bold";
      case "chapter":
        return "text-foreground font-semibold";
      case "section":
        return "text-foreground/85 font-medium";
      default:
        return "text-foreground/70";
    }
  })();

  const rowClass = cn(
    "group flex items-center gap-1 rounded-md py-1.5 pr-2 text-left",
    levelClass,
    isActive ? "bg-accent text-accent-foreground" : "hover:bg-accent",
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

  const href = buildTreeHref(
    linkBase,
    searchParams,
    isArticle
      ? { kind: "article", articleId: node.articleId }
      : { kind: "chapter", chapterId: node.articleId },
  );

  return (
    <li>
      <Link
        to={href}
        preventScrollReset
        className={rowClass}
        style={rowStyle}
        aria-current={isActive ? "page" : undefined}
      >
        {expandToggle}
        <span className="flex-1 truncate">{node.displayLabel}</span>
        <CountChip value={count} isActive={isActive} />
      </Link>
      {hasChildren && open ? (
        <ul className="space-y-0.5">
          {node.children.map((c) => (
            <ArticleItem
              key={c.articleId}
              node={c}
              depth={depth + 1}
              forceOpen={forceOpen}
              activeArticleId={activeArticleId}
              activeChapterId={activeChapterId}
              byArticleId={byArticleId}
              byChapterId={byChapterId}
              searchParams={searchParams}
              linkBase={linkBase}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function SystematicItem({
  node,
  depth,
  forceOpen,
  activeNodeId,
  byNodeId,
  searchParams,
  linkBase,
}: {
  node: SystematicTreeNode;
  depth: number;
  forceOpen: Set<string>;
  activeNodeId: string | undefined;
  byNodeId: Record<string, number>;
  searchParams: URLSearchParams;
  linkBase: string;
}) {
  const initialOpen = forceOpen.has(node.nodeId) || depth === 0;
  const [open, setOpen] = useState(initialOpen);
  useEffect(() => {
    if (forceOpen.has(node.nodeId)) setOpen(true);
  }, [forceOpen, node.nodeId]);
  const hasChildren = node.children.length > 0;
  const isActive = activeNodeId === node.nodeId;
  const count = byNodeId[node.nodeId] ?? 0;

  const groupClass = (() => {
    if (depth === 0) return "text-foreground font-bold";
    if (!hasChildren) return "text-foreground/70";
    if (depth === 1) return "text-foreground font-semibold";
    if (depth === 2) return "text-foreground/85 font-medium";
    return "text-foreground/70";
  })();

  const rowClass = cn(
    "group flex items-center gap-1 rounded-md py-1.5 pr-2 text-left",
    groupClass,
    isActive ? "bg-accent text-accent-foreground" : "hover:bg-accent",
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

  const href = buildTreeHref(linkBase, searchParams, {
    kind: "node",
    nodeId: node.nodeId,
  });

  return (
    <li>
      <Link
        to={href}
        preventScrollReset
        className={rowClass}
        style={rowStyle}
        aria-current={isActive ? "page" : undefined}
      >
        {expandToggle}
        <SystematicNumberBadge depth={depth} ord={node.ord} />
        <span className="flex-1 truncate">
          {stripSystematicNumber(node.displayLabel)}
        </span>
        <CountChip value={count} isActive={isActive} />
      </Link>
      {hasChildren && open ? (
        <ul className="space-y-0.5">
          {node.children.map((c) => (
            <SystematicItem
              key={c.nodeId}
              node={c}
              depth={depth + 1}
              forceOpen={forceOpen}
              activeNodeId={activeNodeId}
              byNodeId={byNodeId}
              searchParams={searchParams}
              linkBase={linkBase}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
