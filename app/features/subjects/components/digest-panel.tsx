// 조문 탭의 "정리" 화면 — 체계도 대분류별 정리비교표.
//
// 좌패널 목차는 **체계도의 첫 수준**(01 총칙/보칙 · 02 특허요건 …)만 쓴다. 정리비교표는
// 조문 하나가 아니라 장(章) 단위로 묶여 있어, 그 아래 층까지 펼치면 목차가 자료보다
// 잘게 쪼개진다(원장 지시 2026-09-09).
//
// ★자료는 교재 부록 정리비교표를 **글자 HTML** 로 재작화한 것이다(이미지 금지 —
//   나중에 빈칸 학습을 걸어야 하므로 모든 칸이 선택 가능한 글자여야 한다).
// ★쪽마다 전용 CSS 가 따라오는데, 적재 때 선택자를 전부 `.digest-doc` 아래로 접어 두었다
//   (scripts/digest/convert.mjs). 그대로 넣어도 앱 전역 스타일로 새지 않는다.
// ★노출은 RLS 가 정한다 — 현재 staff 전용이라 학생에게는 빈 배열이 내려오고 아래
//   "아직 등록되지 않았습니다" 가 그대로 보인다.
import { FileTextIcon } from "lucide-react";

import { cn } from "~/core/lib/utils";
import type {
  SystematicDigest,
  SystematicNode,
} from "~/features/laws/queries.server";

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

/** 대분류 → 그 단원에 붙은 정리비교표(적재 순서 유지). */
export function digestsByNode(
  digests: SystematicDigest[],
): Record<string, SystematicDigest[]> {
  const map: Record<string, SystematicDigest[]> = {};
  for (const d of digests) (map[d.nodeId] ??= []).push(d);
  return map;
}

export function DigestOutline({
  nodes,
  digestCounts,
  activeNodeId,
  onSelect,
  emptyHint,
}: {
  nodes: SystematicNode[];
  digestCounts: Record<string, number>;
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
        const count = digestCounts[n.nodeId] ?? 0;
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
              {/* 자료가 없는 단원은 눌러 보기 전에 알 수 있어야 한다. */}
              {count > 0 ? (
                <span className="text-muted-foreground text-[11px] font-bold tabular-nums">
                  {count}
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** 한 장 — 교재 쪽 표시 + 재작화 본문. 본문의 카드(.panel)는 자료 쪽이 갖고 있다. */
function DigestSheet({ digest }: { digest: SystematicDigest }) {
  return (
    <section>
      {/* ★React 는 text child 를 이스케이프한다 — `.panel > h2`·content:"" 가 깨진다.
          CSS 는 반드시 dangerouslySetInnerHTML 로 넣는다(SSR 에서 드러나는 함정). */}
      <style dangerouslySetInnerHTML={{ __html: digest.css }} />
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-[13px] font-extrabold">{digest.title}</h3>
        <span className="text-muted-foreground text-[11px] font-semibold">
          교재 정리비교표 {digest.page}쪽
        </span>
      </div>
      {/* ★한 단원에 두 쪽이 붙으면(01 총칙 = 2p+3p) 규칙이 섞인다 — 쪽 클래스로 가른다.
          적재 때 CSS 도 `.digest-doc.dpN` 으로 좁혀 두었다(scripts/digest/convert.mjs). */}
      <div
        className={`digest-doc dp${digest.page}`}
        dangerouslySetInnerHTML={{ __html: digest.bodyHtml }}
      />
    </section>
  );
}

export function DigestContent({
  node,
  digests,
}: {
  node: SystematicNode | null;
  digests: SystematicDigest[];
}) {
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
      {digests.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <p className="text-foreground/80 text-sm font-medium">
            이 단원의 정리비교표가 아직 등록되지 않았습니다.
          </p>
          <p className="text-muted-foreground mt-1.5 text-xs">
            교재 뒤쪽 정리비교표를 단원별로 올리면 여기에 표시됩니다.
          </p>
        </div>
      ) : (
        <div className="space-y-6 px-4 py-4">
          {digests.map((d) => (
            <DigestSheet key={d.digestId} digest={d} />
          ))}
        </div>
      )}
    </div>
  );
}
