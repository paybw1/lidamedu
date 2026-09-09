// 조문 탭의 "정리" 화면 — 체계도 대분류별 정리비교표.
//
// 좌패널 목차는 **체계도의 첫 수준**(01 총칙/보칙 · 02 특허요건 …)만 쓴다. 정리비교표는
// 조문 하나가 아니라 장(章) 단위로 묶여 있어, 그 아래 층까지 펼치면 목차가 자료보다
// 잘게 쪼개진다(원장 지시 2026-09-09).
//
// ★자료는 아직 등록 전이다. 지금은 목차와 자리만 있고, 고른 항목을 이름으로 확인할 수
//   있게 해 둔다 — 무엇이 비어 있는지 화면이 스스로 말하게 하는 편이 낫다.
import { FileTextIcon } from "lucide-react";

import { cn } from "~/core/lib/utils";
import type { SystematicNode } from "~/features/laws/queries.server";

import {
  SystematicNumberBadge,
  stripSystematicNumber,
} from "./systematic-node-label";

/** 체계도 첫 수준(대분류)만. 판례 전용 노드는 조문 탭에 등장하지 않으므로 뺀다. */
export function topLevelNodes(nodes: SystematicNode[]): SystematicNode[] {
  return nodes
    .filter((n) => !n.parentId && !n.caseOnly)
    .sort((a, b) => a.ord - b.ord);
}

export function DigestOutline({
  nodes,
  activeNodeId,
  onSelect,
  emptyHint,
}: {
  nodes: SystematicNode[];
  activeNodeId: string | null;
  onSelect: (nodeId: string) => void;
  emptyHint: string;
}) {
  if (nodes.length === 0) {
    return (
      <p className="text-muted-foreground px-2 py-4 text-xs">{emptyHint}</p>
    );
  }
  return (
    <ul className="space-y-0.5 text-sm">
      {nodes.map((n, i) => {
        const active = n.nodeId === activeNodeId;
        return (
          <li key={n.nodeId}>
            <button
              type="button"
              onClick={() => onSelect(n.nodeId)}
              aria-current={active ? "true" : undefined}
              className={cn(
                "group flex w-full items-center gap-1.5 rounded-lg px-2 py-[5px] text-left text-[13px] font-extrabold transition-colors",
                active
                  ? "bg-primary/10 text-link"
                  : "text-foreground hover:bg-primary/[0.06] dark:hover:bg-primary/10",
              )}
            >
              <SystematicNumberBadge depth={0} no={i + 1} />
              <span className="flex-1 truncate">
                {stripSystematicNumber(n.displayLabel)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function DigestContent({ node }: { node: SystematicNode | null }) {
  if (!node) {
    return (
      <div className="border-border bg-card text-muted-foreground rounded-xl border px-5 py-10 text-center text-sm">
        왼쪽 목차에서 정리를 볼 단원을 고르세요.
      </div>
    );
  }
  return (
    <div className="border-border bg-card rounded-xl border">
      <div className="border-border flex items-center gap-2 border-b px-5 py-3">
        <FileTextIcon className="text-muted-foreground size-4 flex-none" />
        <h2 className="text-sm font-semibold">
          {stripSystematicNumber(node.displayLabel)} 정리
        </h2>
      </div>
      <div className="px-5 py-10 text-center">
        <p className="text-foreground/80 text-sm font-medium">
          이 단원의 정리비교표가 아직 등록되지 않았습니다.
        </p>
        <p className="text-muted-foreground mt-1.5 text-xs">
          교재 뒤쪽 정리비교표를 단원별로 올리면 여기에 표시됩니다.
        </p>
      </div>
    </div>
  );
}
