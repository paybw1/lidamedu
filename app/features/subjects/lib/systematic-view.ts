// 체계도 한 벌 → 화면별 목차.
//
// 노드는 한 벌뿐이고 화면마다 다르게 거른다. 화면별로 다른 점은 두 가지다.
//   조문·객관식 — case_only 를 숨긴다. 이름은 언제나 display_label.
//   판례        — article_only 를 숨긴다. 이름은 case_display_label ?? display_label.
//   주관식      — 판례와 같게 보되, 판례 배치 층(`주제N …`)은 뺀다. 문항이 붙지 않는
//                 층이라 목차만 길어진다(원장 지시 2026-09-07).
//
// ★숨긴 노드의 자식은 **바로 위 보이는 조상**에 붙인다. 그냥 두면 부모를 잃은 자식이
//   최상위(장)로 튀어나가, 한쪽 화면에서만 묶음 층 하나를 걷어내는 것이 불가능해진다.
//   예) 09 장의 「마드리드의정서에 따른 국제출원」 묶음은 판례에만 두고, 조문에서는
//       그 아래 항목들이 장 바로 밑으로 올라오게 한다.

/** 판례집 주제 노드 — `주제3 서비스에 대한 상표의 사용` 꼴. 체계도 번호와 다른 축이다. */
export const TOPIC_LABEL_RE = /^주제\s*(\d+)\s*(.*)$/;

export function isTopicNode(label: string): boolean {
  return TOPIC_LABEL_RE.test(label.trim());
}

export type SystematicView = "article" | "case" | "subjective";

interface ViewableNode {
  nodeId: string;
  parentId: string | null;
  displayLabel: string;
  caseDisplayLabel: string | null;
  caseOnly: boolean;
  articleOnly: boolean;
}

function isVisible(n: ViewableNode, view: SystematicView): boolean {
  if (view === "article") return !n.caseOnly;
  if (n.articleOnly) return false;
  if (view === "subjective") return !isTopicNode(n.displayLabel);
  return true;
}

/**
 * 화면에 보일 노드만 남기고, 숨긴 노드의 자식은 바로 위 보이는 조상에 붙인다.
 * 판례·주관식 화면에서는 displayLabel 자리에 판례 전용 이름을 넣어 돌려준다 —
 * 아래쪽(검색·렌더)이 이름을 한 곳에서만 보게 하려는 것.
 */
export function nodesForView<T extends ViewableNode>(
  nodes: T[],
  view: SystematicView,
): T[] {
  const byId = new Map(nodes.map((n) => [n.nodeId, n] as const));
  const visible = new Set<string>();
  for (const n of nodes) if (isVisible(n, view)) visible.add(n.nodeId);

  const parentOf = (n: T): string | null => {
    let cur = n.parentId;
    // 보이는 조상을 만날 때까지 올라간다. 없으면 최상위.
    while (cur && !visible.has(cur)) cur = byId.get(cur)?.parentId ?? null;
    return cur;
  };

  const out: T[] = [];
  for (const n of nodes) {
    if (!visible.has(n.nodeId)) continue;
    const parentId = parentOf(n);
    const displayLabel =
      view === "article"
        ? n.displayLabel
        : (n.caseDisplayLabel ?? n.displayLabel);
    out.push(
      parentId === n.parentId && displayLabel === n.displayLabel
        ? n
        : { ...n, parentId, displayLabel },
    );
  }
  return out;
}
