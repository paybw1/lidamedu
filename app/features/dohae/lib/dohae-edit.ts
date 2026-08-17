// 도해 유닛 블록의 **텍스트만** 수정하기 위한 경로 수집·적용 (서버·클라 공용).
//
// ★구조(병합·열 너비·음영·굵게·다이어그램)는 원본 HWPX 에서 온 값이라 건드리지 않는다.
//   그래서 편집은 "블록 JSON 통째 교체"가 아니라 **경로 → 새 텍스트** 로만 받는다.
//   클라이언트가 보낸 구조를 그대로 저장하면 표가 깨질 수 있고, 위조 여지도 생긴다.

import type { DohaeBlock, DohaeCell } from "../labels";

export interface DohaeTextNode {
  /** 적용 경로 — "b3" (문단/제목) · "b5.r0.c1" (표 칸) · "b5.r0.c1.t0.r1.c0" (중첩표) */
  path: string;
  text: string;
  /** 화면에 붙이는 꼬리표 — "소제목" · "본문" · "표 1행 2칸" */
  label: string;
  /** 여러 줄 입력이 필요한가(본문 문단·긴 칸) */
  multiline: boolean;
}

const cellLabel = (r: number, c: number) => `표 ${r + 1}행 ${c + 1}칸`;

function collectCells(
  cells: DohaeCell[][],
  prefix: string,
  out: DohaeTextNode[],
  depth: number,
): void {
  cells.forEach((row, r) =>
    row.forEach((cell, c) => {
      const path = `${prefix}.r${r}.c${c}`;
      out.push({
        path,
        text: cell.text,
        label: depth === 0 ? cellLabel(r, c) : `중첩 ${cellLabel(r, c)}`,
        multiline: cell.text.length > 40 || cell.text.includes("\n"),
      });
      (cell.tables ?? []).forEach((t, ti) =>
        collectCells(t, `${path}.t${ti}`, out, depth + 1),
      );
    }),
  );
}

/** 편집 가능한 텍스트 노드를 화면 순서대로 모은다. */
export function collectTextNodes(blocks: DohaeBlock[]): DohaeTextNode[] {
  const out: DohaeTextNode[] = [];
  blocks.forEach((b, i) => {
    const prefix = `b${i}`;
    if (b.type === "h") {
      out.push({ path: prefix, text: b.text, label: "소제목", multiline: false });
    } else if (b.type === "p") {
      out.push({ path: prefix, text: b.text, label: "본문", multiline: true });
    } else if (b.type === "table") {
      collectCells(b.cells, prefix, out, 0);
    }
    // diagram·image 는 텍스트가 화면에 안 나온다 — 편집 대상 아님.
  });
  return out;
}

/** 경로 하나에 새 텍스트를 적용. 경로가 실제 구조와 안 맞으면 false. */
function applyOne(blocks: DohaeBlock[], path: string, text: string): boolean {
  const seg = path.split(".");
  const bm = /^b(\d+)$/.exec(seg[0] ?? "");
  if (!bm) return false;
  const block = blocks[Number(bm[1])];
  if (!block) return false;

  if (seg.length === 1) {
    if (block.type !== "h" && block.type !== "p") return false;
    block.text = text;
    return true;
  }
  if (block.type !== "table") return false;

  // r/c 쌍을 따라 내려간다. 중간에 t{n} 이 오면 그 칸의 중첩 표로 들어간다.
  let cells: DohaeCell[][] = block.cells;
  let i = 1;
  for (;;) {
    const rm = /^r(\d+)$/.exec(seg[i] ?? "");
    const cm = /^c(\d+)$/.exec(seg[i + 1] ?? "");
    if (!rm || !cm) return false;
    const cell = cells[Number(rm[1])]?.[Number(cm[1])];
    if (!cell) return false;
    i += 2;
    if (i === seg.length) {
      cell.text = text;
      return true;
    }
    const tm = /^t(\d+)$/.exec(seg[i] ?? "");
    if (!tm) return false;
    const nested = cell.tables?.[Number(tm[1])];
    if (!nested) return false;
    cells = nested;
    i += 1;
  }
}

export interface ApplyResult {
  blocks: DohaeBlock[];
  /** 실제로 값이 바뀐 경로들 */
  changed: string[];
  /** 구조와 안 맞아 무시한 경로들 — 있으면 저장하지 않고 알린다. */
  rejected: string[];
}

/**
 * 경로별 새 텍스트를 원본 블록에 적용한다.
 * 원본을 복제해 다루므로 호출부의 blocks 는 그대로 남는다.
 */
export function applyTextEdits(
  blocks: DohaeBlock[],
  edits: Record<string, string>,
): ApplyResult {
  const next = structuredClone(blocks);
  const before = new Map(collectTextNodes(blocks).map((n) => [n.path, n.text]));
  const changed: string[] = [];
  const rejected: string[] = [];
  for (const [path, raw] of Object.entries(edits)) {
    // 줄바꿈은 살리고 줄 끝 공백만 정리 — 표 칸의 의도적 줄나눔을 보존한다.
    const text = raw.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "");
    if (!before.has(path)) {
      rejected.push(path);
      continue;
    }
    if (before.get(path) === text) continue;
    if (applyOne(next, path, text)) changed.push(path);
    else rejected.push(path);
  }
  return { blocks: next, changed, rejected };
}
