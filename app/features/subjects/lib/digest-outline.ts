// 정리비교표를 **목차 순서**로 묶는다 — 팝업의 ‹ › 이동이 이 순서를 따른다.
//
// ★순서 = 독립 항목(어느 단원에도 속하지 않는 자료) 먼저, 그다음 체계도 대분류 ord 순.
//   2p 특허법 체계도가 독립 항목이다(과목 전체 지도라 한 단원의 것이 아니다).
// ★자료가 없는 단원은 건너뛴다 — 눌러도 빈 화면인 자리를 이동 경로에 두지 않는다.
import type {
  SystematicDigest,
  SystematicNode,
} from "~/features/laws/queries.server";

import { stripSystematicNumber } from "../components/systematic-node-label";

export interface DigestGroup {
  key: string;
  label: string;
  /** 이 화면이 속한 대분류 — 배지에서 지금 단원을 찾을 때 쓴다. */
  nodeId: string | null;
  digest: SystematicDigest;
}

export function buildDigestGroups(
  nodes: SystematicNode[],
  digests: SystematicDigest[],
): DigestGroup[] {
  // ★자료 하나가 한 화면이다(원장 지시 2026-09-10) — 심판제도 / 정정청구 제도 /
  //   재심 제도처럼 성격이 다른 자료를 한 화면에 쌓지 않는다.
  const toGroup = (d: SystematicDigest): DigestGroup => ({
    key: d.digestId,
    label: d.outlineLabel ?? d.title,
    nodeId: d.nodeId,
    digest: d,
  });

  const standalone = digests.filter((d) => d.nodeId === null).map(toGroup);

  const byNode = new Map<string, SystematicDigest[]>();
  for (const d of digests) {
    if (!d.nodeId) continue;
    const list = byNode.get(d.nodeId) ?? [];
    list.push(d);
    byNode.set(d.nodeId, list);
  }

  const chapters = nodes
    .filter((n) => !n.parentId && !n.caseOnly && byNode.has(n.nodeId))
    .sort((a, b) => a.ord - b.ord)
    .flatMap((n) => (byNode.get(n.nodeId) ?? []).map(toGroup));

  return [...standalone, ...chapters];
}

/** 지금 보는 단원의 첫 화면이 목차에서 몇 번째인가. 없으면 0(맨 앞). */
export function digestGroupIndex(groups: DigestGroup[], nodeId: string | null) {
  const at = groups.findIndex((g) => g.nodeId === nodeId);
  return at < 0 ? 0 : at;
}
