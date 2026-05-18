// 문제 탭 좌측 체계도 트리 — 노드 클릭 → ?tab=problems&node= 로 그 노드 subtree 의
// 문제만 보이도록 목록을 in-place 필터(판례 트리와 동일 동작). 러너 진입은
// 문제 탭 배너의 "이 체계 풀기" 버튼이 담당한다.
// 체계도 노드만 표시(조문 leaf 없음). 데이터 유무와 무관하게 조문·판례·문제 탭이
// 같은 목차를 보여야 하므로 문제 0건 노드도 숨기지 않는다.
import { ChevronRightIcon, ListChecksIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";

import { cn } from "~/core/lib/utils";
import type { SystematicNode } from "~/features/laws/queries.server";
import type { SystematicNodeProblemStat } from "~/features/problems/queries.server";

import {
  SystematicNumberBadge,
  stripSystematicNumber,
} from "./systematic-node-label";

interface TreeNode extends SystematicNode {
  children: TreeNode[];
}

function buildTree(nodes: SystematicNode[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  for (const n of nodes) map.set(n.nodeId, { ...n, children: [] });
  const roots: TreeNode[] = [];
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
  return roots;
}

// activeNodeId 의 조상 노드 ID — 활성 노드까지 자동 펼침용.
function ancestorIds(
  nodes: SystematicNode[],
  activeId: string | undefined,
): Set<string> {
  const out = new Set<string>();
  if (!activeId) return out;
  const byId = new Map(nodes.map((n) => [n.nodeId, n] as const));
  let cur = byId.get(activeId);
  while (cur?.parentId) {
    out.add(cur.parentId);
    cur = byId.get(cur.parentId);
  }
  return out;
}

export function ProblemSystematicTree({
  nodes,
  nodeStats,
  activeNodeId,
  emptyHint,
}: {
  nodes: SystematicNode[];
  nodeStats: Record<string, SystematicNodeProblemStat>;
  activeNodeId?: string;
  emptyHint?: string;
}) {
  const [searchParams] = useSearchParams();
  const tree = useMemo(() => buildTree(nodes), [nodes]);
  // 활성 노드 + 그 조상은 펼친 상태로 시작.
  const forceOpen = useMemo(() => {
    const set = ancestorIds(nodes, activeNodeId);
    if (activeNodeId) set.add(activeNodeId);
    return set;
  }, [nodes, activeNodeId]);

  if (tree.length === 0) {
    return (
      <p className="text-muted-foreground px-2 py-4 text-xs">
        {emptyHint ?? "체계도가 아직 등록되지 않았습니다."}
      </p>
    );
  }
  return (
    <ul className="space-y-0.5 text-sm">
      {tree.map((n) => (
        <NodeItem
          key={n.nodeId}
          node={n}
          depth={0}
          nodeStats={nodeStats}
          activeNodeId={activeNodeId}
          forceOpen={forceOpen}
          searchParams={searchParams}
        />
      ))}
    </ul>
  );
}

function NodeItem({
  node,
  depth,
  nodeStats,
  activeNodeId,
  forceOpen,
  searchParams,
}: {
  node: TreeNode;
  depth: number;
  nodeStats: Record<string, SystematicNodeProblemStat>;
  activeNodeId: string | undefined;
  forceOpen: Set<string>;
  searchParams: URLSearchParams;
}) {
  const [open, setOpen] = useState(forceOpen.has(node.nodeId) || depth === 0);
  // forceOpen 이 (활성 노드 변경 등으로) 갱신되면 마운트된 노드도 펼침.
  useEffect(() => {
    if (forceOpen.has(node.nodeId)) setOpen(true);
  }, [forceOpen, node.nodeId]);

  const hasChildren = node.children.length > 0;
  const stat = nodeStats[node.nodeId];
  const count = stat?.problemCount ?? 0;
  const starredCount = stat?.starredCount ?? 0;
  const isActive = node.nodeId === activeNodeId;

  // 노드 클릭 → 같은 페이지에서 ?tab=problems&node= 로 문제 목록 필터.
  // 다른 검색·필터(p_*)는 보존.
  const href = (() => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", "problems");
    next.set("node", node.nodeId);
    return `?${next.toString()}`;
  })();

  const rowClass = cn(
    "group flex items-center gap-1 rounded-md py-1.5 pr-2 text-left transition-colors",
    depth === 0
      ? "text-foreground font-bold"
      : depth === 1
        ? "text-foreground/85 font-semibold"
        : "text-foreground/70",
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
      className="text-muted-foreground hover:text-foreground inline-flex size-5 shrink-0 items-center justify-center"
    >
      <ChevronRightIcon
        className={cn("size-3.5 transition-transform", open && "rotate-90")}
      />
    </button>
  ) : (
    <span className="inline-block size-5 shrink-0" />
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
        <SystematicNumberBadge depth={depth} ord={node.ord} />
        <span className="flex-1 truncate">
          {stripSystematicNumber(node.displayLabel)}
        </span>
        {starredCount > 0 ? (
          <span
            className="inline-flex shrink-0 items-center gap-0.5 text-[10px] tabular-nums text-amber-500"
            title={`별점 문제 ${starredCount}개`}
          >
            <span className="text-[11px] leading-none">★</span>
            {starredCount}
          </span>
        ) : null}
        {count > 0 ? (
          <span className="text-muted-foreground inline-flex shrink-0 items-center gap-0.5 text-[10px] tabular-nums">
            <ListChecksIcon className="size-3" />
            {count}
          </span>
        ) : null}
      </Link>
      {hasChildren && open ? (
        <ul className="space-y-0.5">
          {node.children.map((c) => (
            <NodeItem
              key={c.nodeId}
              node={c}
              depth={depth + 1}
              nodeStats={nodeStats}
              activeNodeId={activeNodeId}
              forceOpen={forceOpen}
              searchParams={searchParams}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
