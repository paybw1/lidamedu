// 체계도 노드 "트리 표시 순" 정렬 — parent_id + ord 기반 DFS.
//
// path(ltree 문자열) 정렬은 대분류가 10개를 넘으면 깨진다: "b13" < "b2" (문자열 비교).
// 트리 UI(cases-tree/problem-systematic-tree)는 children 을 ord 로 정렬해 그리므로,
// 전체 순번(computeCaseOverallOrder/attachProblemOverallNo)의 노드 랭킹도 같은 순서여야 한다.
export interface SystematicTreeOrderNode {
  nodeId: string;
  parentId: string | null;
  ord: number;
  path: string;
}

export function sortSystematicTreeOrder<T extends SystematicTreeOrderNode>(
  nodes: readonly T[],
): T[] {
  const byParent = new Map<string | null, T[]>();
  const ids = new Set(nodes.map((n) => n.nodeId));
  for (const n of nodes) {
    // 부모가 조회 범위 밖이면 루트 취급 (부분 트리 안전망)
    const key = n.parentId && ids.has(n.parentId) ? n.parentId : null;
    const list = byParent.get(key) ?? [];
    list.push(n);
    byParent.set(key, list);
  }
  const cmp = (a: T, b: T) =>
    a.ord !== b.ord ? a.ord - b.ord : a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
  const out: T[] = [];
  const visit = (parent: string | null) => {
    const children = byParent.get(parent);
    if (!children) return;
    children.sort(cmp);
    for (const c of children) {
      out.push(c);
      visit(c.nodeId);
    }
  };
  visit(null);
  return out;
}
