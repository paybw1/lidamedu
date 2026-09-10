// 정리비교표 **빈칸 학습** — 목차를 누르면 그 줄·그 칸이 빈칸이 된다.
//
// 원장 지시(2026-09-10):
//   「특허요건」(모서리) → 내용 전체 · 「의의」(행 목차) → 그 가로줄 · 「진보성」(열 목차) → 그 세로줄
//
// ★자리(행·열·걸침)는 **적재 때 이미 박혀 있다**(scripts/digest/blank-stamp.mjs).
//   여기서 재지 않는다 — 이 화면은 브라우저에서 재는 방식으로 세 번 연속 실패했다.
//   여기가 하는 일은 박힌 좌표를 읽어 **어느 칸을 가릴지 고르는 것**뿐이다.
// ★본문은 dangerouslySetInnerHTML 로 들어온 붙박이 HTML 이라 React 가 다시 그리지
//   않는다. 그래서 상태(가릴 칸 목록)는 React 가 갖고, 화면 반영만 클래스로 한다.
import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

/** 가려진 칸에 붙는 클래스 — 모양은 app.css 가 갖는다. */
const BLANK_CLASS = "dg-blank";

interface Cell {
  el: HTMLElement;
  key: string;
  r: number;
  c: number;
  rs: number;
  cs: number;
}

export interface DigestBlanks {
  /** 지금 가려 둔 칸 수. */
  count: number;
  /** 가릴 수 있는 칸 수(글자가 있는 내용칸). 0 이면 빈칸을 붙일 수 없는 자료다. */
  total: number;
  blankAll: () => void;
  revealAll: () => void;
}

function readCells(root: HTMLElement): Cell[] {
  return [...root.querySelectorAll<HTMLElement>("[data-dg-r]")].map((el) => {
    const r = Number(el.dataset.dgR);
    const c = Number(el.dataset.dgC);
    return {
      el,
      key: `${r}:${c}`,
      r,
      c,
      rs: Number(el.dataset.dgRs) || 1,
      cs: Number(el.dataset.dgCs) || 1,
    };
  });
}

/** 목차칸이 다스리는 칸들 — 걸친 칸(colspan/rowspan)은 겹치기만 하면 든다. */
function targetsOf(head: HTMLElement, cells: Cell[]): Cell[] {
  const kind = head.dataset.dgBlank;
  if (kind === "all") return cells;
  const from = Number(head.dataset.dgFrom);
  const to = Number(head.dataset.dgTo);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return [];
  if (kind === "row") return cells.filter((x) => x.r <= to && x.r + x.rs - 1 >= from);
  if (kind === "col") return cells.filter((x) => x.c <= to && x.c + x.cs - 1 >= from);
  return [];
}

export function useDigestBlanks(
  rootRef: RefObject<HTMLElement | null>,
  /** 자료가 바뀌면 처음부터 — 팝업의 ‹ › 이동에 쓰인다. */
  groupKey: string,
): DigestBlanks {
  const cellsRef = useRef<Cell[]>([]);
  const [keys, setKeys] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [ready, setReady] = useState(0);

  // 자료가 바뀌면 칸을 다시 읽고 가린 것을 모두 푼다.
  useEffect(() => {
    cellsRef.current = rootRef.current ? readCells(rootRef.current) : [];
    setKeys(new Set<string>());
    setReady((v) => v + 1);
  }, [groupKey, rootRef]);

  // 상태 → 화면. 붙박이 HTML 이라 클래스만 갈아 끼운다.
  useEffect(() => {
    for (const cell of cellsRef.current) {
      cell.el.classList.toggle(BLANK_CLASS, keys.has(cell.key));
    }
  }, [keys, ready]);

  const toggleMany = useCallback((hit: Cell[]) => {
    if (!hit.length) return;
    setKeys((prev) => {
      const next = new Set(prev);
      // 이미 다 가려져 있으면 누르는 건 「도로 보기」다.
      const allHidden = hit.every((x) => prev.has(x.key));
      for (const x of hit) {
        if (allHidden) next.delete(x.key);
        else next.add(x.key);
      }
      return next;
    });
  }, []);

  // 누르기 — 붙박이 HTML 에는 손잡이를 달 수 없으니 위임해서 받는다.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const act = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return false;
      const head = target.closest<HTMLElement>("[data-dg-blank]");
      if (head) {
        toggleMany(targetsOf(head, cellsRef.current));
        return true;
      }
      const cell = target.closest<HTMLElement>("[data-dg-r]");
      if (!cell) return false;
      const found = cellsRef.current.find((x) => x.el === cell);
      if (found) toggleMany([found]);
      return true;
    };

    const onClick = (ev: MouseEvent) => {
      // 글자를 끌어 고르는 중이면 건드리지 않는다 — 복사하려다 가려지면 곤란하다.
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return;
      act(ev.target);
    };
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      if (act(ev.target)) ev.preventDefault();
    };

    root.addEventListener("click", onClick);
    root.addEventListener("keydown", onKeyDown);
    return () => {
      root.removeEventListener("click", onClick);
      root.removeEventListener("keydown", onKeyDown);
    };
  }, [rootRef, ready, toggleMany]);

  const blankAll = useCallback(() => {
    setKeys(new Set(cellsRef.current.map((x) => x.key)));
  }, []);
  const revealAll = useCallback(() => {
    setKeys(new Set<string>());
  }, []);

  return { count: keys.size, total: cellsRef.current.length, blankAll, revealAll };
}
