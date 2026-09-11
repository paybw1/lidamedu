// feat-2-037 S7 — 도해 표 **칸 가리기**(정리비교표식)의 순수 로직.
//
//   목차칸(교재가 회색 음영을 깐 라벨 칸)을 누르면 그 목차가 다스리는 내용칸이 가려진다.
//   내용칸은 하나씩 눌러 가릴 수도 있다. 낱말 빈칸(유형 1·2·3)과는 다른 축이다 —
//   저쪽은 글 속에 입력 칸을 끼워 타이핑·채점하고, 이쪽은 칸을 통째로 가렸다 펴 본다.
//
// ★자리는 저장하지 않는다. 표의 `shade`·colSpan·rowSpan 에서 렌더 때마다 다시 센다
//   (정리비교표는 주입 HTML 이라 적재 때 좌표를 박아야 했지만, 도해 표는 React 가
//   블록 JSON 에서 직접 그리므로 화면 상태만으로 된다).
// ★칸의 키는 `dohae-edit.ts`·`dohae-blanks.ts` 와 **같은 경로 규칙** —
//   "b5.r0.c1" · 속표는 "b5.r0.c1.t0.r1.c0".
//
// 목차칸이 다스리는 범위(2026-09-11 전 유닛 실측으로 정한 규칙):
//   · **머리띠**(그 줄을 지나는 칸이 전부 음영인 줄) 안의 음영 칸 → 아래쪽, 같은 세로줄
//   · 그 밖의 음영 칸 → 오른쪽, 같은 가로줄. 첫 열 라벨이면 그 줄 전체, 둘째 열의
//     작은 라벨(「주체적」·「대상」…)이면 그 오른쪽만 — ★이런 중간 라벨이 1,170칸·128표다.
//     정리비교표 규칙(첫 줄·첫 열만)을 그대로 옮기면 전부 죽은 칸이 된다.
//   · **맨 윗줄** 머리띠의 첫 열 칸(모서리) + 내용 줄마다 첫 열 라벨이 있으면 → 표 전체.
//     ★중간의 전폭 절 머리는 모서리가 아니다 — 자기 아래만 다스린다(검토 지적 2026-09-11).
//   · 다스리는 칸이 하나도 없으면 목차로 치지 않는다(손잡이 없음).
//   · **전폭 각주 줄**(표 너비를 혼자 차지하는 음영 없는 한 칸 — 「* 단, …」)은 행 목차
//     판정에서 빼고 세로줄 목차의 대상에서도 뺀다(어느 열에도 속하지 않는다). 표 전체와
//     직접 클릭에는 든다. ★실데이터 9표에서 이 줄 하나가 모서리를 각주 한 칸짜리로 만들었다.
// 가릴 수 있는 칸 = 음영 아님 · 그림 아님 · 글이 있음. **원래 빈 칸은 가리지 않는다.**
// 조문 원문 박스는 블록에서 직접 빼야 한다(`isArticleBox` — 렌더의 갈아끼우기는 첫 박스뿐).
import type { DohaeBlock, DohaeCell } from "../labels";

import { isArticleBox } from "./dohae-blanks";

/**
 * 각 셀이 실제로 놓이는 격자 열 번호. rowspan 이 걸린 앞 행의 칸이 자리를 차지하므로
 * 배열 인덱스(ci)와 열 번호가 어긋난다 — 라벨 판정·열 너비는 반드시 이 값으로 한다.
 */
export function gridStartCols(cells: DohaeCell[][]): number[][] {
  const pending: number[] = [];
  const out = cells.map((row) => {
    let cur = 0;
    const starts = row.map((c) => {
      while ((pending[cur] ?? 0) > 0) cur++;
      const start = cur;
      for (let k = start; k < start + c.colSpan; k++) pending[k] = c.rowSpan;
      cur = start + c.colSpan;
      return start;
    });
    for (let k = 0; k < pending.length; k++) if (pending[k] > 0) pending[k]--;
    return starts;
  });
  return out;
}

export interface DohaeCellBlankModel {
  /** 가릴 수 있는 칸(글이 있는 내용칸)의 키 — 화면 순서. 속표 칸 포함. */
  content: string[];
  /** `content` 를 빨리 찾기 위한 집합 — 낡은 키(편집으로 글이 비워진 칸)를 세지 않는 데 쓴다. */
  contentSet: ReadonlySet<string>;
  /** 목차칸 키 → 그 목차가 다스리는 내용칸 키들(속표 칸까지). 비어 있는 목차는 넣지 않는다. */
  groups: Map<string, string[]>;
}

interface Pos {
  key: string;
  cell: DohaeCell;
  r0: number;
  r1: number;
  c0: number;
  c1: number;
  /** 이 칸을 가리면 함께 가려지는 키 — 자기 자신(가릴 수 있으면) + 속표의 내용칸. */
  keys: string[];
}

function coverable(cell: DohaeCell): boolean {
  return !cell.shade && !cell.diagram && cell.text.trim().length > 0;
}

/** 표 하나를 걷고, 이 표(속표 포함)의 내용칸 키를 돌려준다. */
function walkTable(
  cells: DohaeCell[][],
  prefix: string,
  content: string[],
  groups: Map<string, string[]>,
): string[] {
  const starts = gridStartCols(cells);
  const pos: Pos[] = [];
  const all: string[] = [];
  cells.forEach((row, ri) =>
    row.forEach((cell, ci) => {
      const key = `${prefix}.r${ri}.c${ci}`;
      const own = coverable(cell) ? [key] : [];
      // ★속표는 바깥 칸의 자식으로 먼저 걷는다 — 바깥 목차가 속표 칸까지 다스려야
      //   바깥 칸이 가려질 때(CSS 가 자손 글자를 다 감춘다) 개수와 그림이 맞는다.
      const nested = (cell.tables ?? []).flatMap((t, ti) =>
        walkTable(t, `${key}.t${ti}`, content, groups),
      );
      if (own.length) content.push(key);
      const keys = [...own, ...nested];
      all.push(...keys);
      const c0 = starts[ri][ci];
      pos.push({
        key,
        cell,
        r0: ri,
        r1: ri + Math.max(1, cell.rowSpan) - 1,
        c0,
        c1: c0 + Math.max(1, cell.colSpan) - 1,
        keys,
      });
    }),
  );

  // 머리띠 — 그 줄을 지나는 칸(rowspan 으로 내려온 칸 포함)이 전부 음영인 줄.
  const rowCount = cells.length;
  const band = new Set<number>();
  for (let r = 0; r < rowCount; r++) {
    const through = pos.filter((p) => p.r0 <= r && r <= p.r1);
    if (through.length > 0 && through.every((p) => p.cell.shade)) band.add(r);
  }
  // 전폭 각주 줄 — 두 열 이상인 표에서만 본다(한 열짜리 표는 모든 칸이 전폭이다).
  const colCount = pos.reduce((m, p) => Math.max(m, p.c1 + 1), 0);
  const footnote = new Set<string>();
  if (colCount >= 2)
    for (let r = 0; r < rowCount; r++) {
      const through = pos.filter((p) => p.r0 <= r && r <= p.r1);
      const only = through.length === 1 ? through[0] : null;
      if (only && !only.cell.shade && only.c0 === 0 && only.c1 === colCount - 1)
        footnote.add(only.key);
    }
  const isFootnoteRow = (r: number) =>
    pos.some((p) => footnote.has(p.key) && p.r0 <= r && r <= p.r1);
  // 내용 줄마다 첫 열에 라벨이 있는가 — 있으면 맨 위 모서리 칸이 표 전체를 다스린다.
  const bodyRows = [...Array(rowCount).keys()].filter(
    (r) => !band.has(r) && !isFootnoteRow(r),
  );
  const rowHead =
    bodyRows.length > 0 &&
    bodyRows.every((r) =>
      pos.some((p) => p.cell.shade && p.c0 === 0 && p.r0 <= r && r <= p.r1),
    );

  for (const p of pos) {
    if (!p.cell.shade) continue;
    let inBand = true;
    for (let r = p.r0; r <= p.r1; r++) if (!band.has(r)) inBand = false;
    let targets: string[];
    if (inBand && p.r0 === 0 && p.c0 === 0 && rowHead) {
      // 맨 윗줄의 모서리만 표 전체 — 중간 절 머리는 아래 가지로 간다.
      targets = all;
    } else if (inBand) {
      // 아래쪽, 같은 세로줄 — 걸친 칸은 겹치기만 하면 든다.
      targets = pos
        .filter(
          (q) =>
            q.r0 > p.r1 && q.c0 <= p.c1 && q.c1 >= p.c0 && !footnote.has(q.key),
        )
        .flatMap((q) => q.keys);
    } else {
      // 오른쪽, 같은 가로줄.
      targets = pos
        .filter((q) => q.c0 > p.c1 && q.r0 <= p.r1 && q.r1 >= p.r0)
        .flatMap((q) => q.keys);
    }
    if (targets.length > 0) groups.set(p.key, [...new Set(targets)]);
  }
  return all;
}

/** 유닛 블록 전체의 가리기 모델. 조문 원문 박스·문단·소제목·도해 이미지는 대상이 아니다. */
export function buildCellBlankModel(blocks: DohaeBlock[]): DohaeCellBlankModel {
  const content: string[] = [];
  const groups = new Map<string, string[]>();
  blocks.forEach((b, i) => {
    if (b.type === "table" && !isArticleBox(b))
      walkTable(b.cells, `b${i}`, content, groups);
  });
  return { content, contentSet: new Set(content), groups };
}

/**
 * 한 칸과 그 속표의 내용칸 — 바깥 칸을 가리면 CSS 가 자손 글자를 다 감추므로,
 * 상태도 같이 움직여야 「가린 칸 n」 과 그림이 어긋나지 않는다.
 */
export function familyOf(model: DohaeCellBlankModel, key: string): string[] {
  const under = `${key}.t`;
  return model.content.filter((k) => k === key || k.startsWith(under));
}
