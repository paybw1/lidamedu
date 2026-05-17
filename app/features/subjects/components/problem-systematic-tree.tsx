// 문제 탭 좌측 체계도 트리 — 문제 체계별 풀이 진입.
// 체계도 노드만 표시(조문 leaf 없음) — 노드 클릭 → 그 노드의 첫 문제 + ?node= 로
// 체계별 풀이 진입. 부분트리 문제 0건 노드는 숨긴다.
import { ChevronRightIcon, ListChecksIcon } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

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

// 부분트리 문제 0건 노드 제거 (problemCount 는 이미 subtree 합산값).
function prune(
  nodes: TreeNode[],
  stats: Record<string, SystematicNodeProblemStat>,
): TreeNode[] {
  const recur = (xs: TreeNode[]): TreeNode[] => {
    const out: TreeNode[] = [];
    for (const n of xs) {
      const kids = recur(n.children);
      const count = stats[n.nodeId]?.problemCount ?? 0;
      if (count === 0 && kids.length === 0) continue;
      out.push({ ...n, children: kids });
    }
    return out;
  };
  return recur(nodes);
}

export function ProblemSystematicTree({
  nodes,
  nodeStats,
  lawCode,
  emptyHint,
}: {
  nodes: SystematicNode[];
  nodeStats: Record<string, SystematicNodeProblemStat>;
  lawCode: string;
  emptyHint?: string;
}) {
  const tree = prune(buildTree(nodes), nodeStats);
  if (tree.length === 0) {
    return (
      <p className="text-muted-foreground px-2 py-4 text-xs">
        {emptyHint ?? "체계별로 묶인 문제가 아직 없습니다."}
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
          lawCode={lawCode}
        />
      ))}
    </ul>
  );
}

function NodeItem({
  node,
  depth,
  nodeStats,
  lawCode,
}: {
  node: TreeNode;
  depth: number;
  nodeStats: Record<string, SystematicNodeProblemStat>;
  lawCode: string;
}) {
  const [open, setOpen] = useState(depth === 0);
  const hasChildren = node.children.length > 0;
  const stat = nodeStats[node.nodeId];
  const count = stat?.problemCount ?? 0;
  const firstProblemId = stat?.firstProblemId ?? null;

  const rowClass = cn(
    "group flex items-center gap-1 rounded-md py-1.5 pr-2 text-left transition-colors",
    depth === 0
      ? "text-foreground font-bold"
      : depth === 1
        ? "text-foreground/85 font-semibold"
        : "text-foreground/70",
    "hover:bg-accent",
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

  const inner = (
    <>
      {expandToggle}
      <SystematicNumberBadge depth={depth} ord={node.ord} />
      <span className="flex-1 truncate">
        {stripSystematicNumber(node.displayLabel)}
      </span>
      {count > 0 ? (
        <span className="text-muted-foreground inline-flex shrink-0 items-center gap-0.5 text-[10px] tabular-nums">
          <ListChecksIcon className="size-3" />
          {count}
        </span>
      ) : null}
    </>
  );

  return (
    <li>
      {firstProblemId ? (
        <Link
          to={`/subjects/${lawCode}/problems/${firstProblemId}?node=${node.nodeId}`}
          viewTransition
          className={rowClass}
          style={rowStyle}
        >
          {inner}
        </Link>
      ) : (
        <div className={rowClass} style={rowStyle}>
          {inner}
        </div>
      )}
      {hasChildren && open ? (
        <ul className="space-y-0.5">
          {node.children.map((c) => (
            <NodeItem
              key={c.nodeId}
              node={c}
              depth={depth + 1}
              nodeStats={nodeStats}
              lawCode={lawCode}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
