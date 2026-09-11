// feat-2-037 S7 — 도해 표 **칸 가리기**의 화면 조각(상태 · 손잡이 · 머리 단추).
//
//   정리비교표(use-digest-blanks.ts)와 같은 쓰임 — 목차칸을 누르면 그 줄·그 칸이 가려진다.
//   다만 저쪽은 주입 HTML 이라 좌표를 적재 때 박고 addEventListener 로 위임했지만,
//   여기는 React 가 표를 그리므로 **모델은 블록에서 렌더 때 세고, 클릭은 JSX 손잡이**로
//   받는다(붙는 시점 문제가 없다). 규칙은 lib/dohae-cell-blanks.ts.
//
// ★「칸 가리기」는 **모드(토글)** 다 — 정리비교표처럼 늘 켜 두면 읽기 동작과 부딪힌다
//   (내용칸 더블클릭 낱말 선택은 첫 클릭이 칸을 가려 user-select:none 이 걸리고, 선택을
//   풀려는 클릭이 칸을 가린다 — 검토 지적 2026-09-11). 호출부가 모드가 켜진 읽기 화면에서만
//   Provider 를 감싸고, 낱말 빈칸 모드(유형 1·2·3)와는 서로 배타다. Provider 가 없으면
//   표는 손잡이도 속성도 달지 않는다.
// ★칸은 클래스만 바꾼다. 글자·태그를 건드리면 하이라이트 오프셋이 어긋난다.
import type { DohaeBlock } from "../labels";

import { EyeIcon, SquareDashedIcon } from "lucide-react";
import {
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { cn } from "~/core/lib/utils";

import {
  type DohaeCellBlankModel,
  buildCellBlankModel,
  familyOf,
} from "../lib/dohae-cell-blanks";

/** 가려진 칸에 붙는 클래스 — 모양은 app.css(`.dohae-doc .dg-blank`)가 갖는다. */
const CELL_BLANK_CLASS = "dg-blank";
/** 칸 키를 싣는 data 속성(`data-dh-cell`). */
const CELL_ATTR = "data-dh-cell";
/** 끌기로 보는 최소 이동(px) — 이보다 움직였으면 글자를 고르는 중이라 칸을 건드리지 않는다. */
const DRAG_PX = 6;
const INTERACTIVE = "a,button,input,textarea,select,summary";

export interface DohaeCellBlanks {
  model: DohaeCellBlankModel;
  hidden: ReadonlySet<string>;
  /** 지금 가려 둔 칸 수 — 모델에 없는 낡은 키(편집으로 글이 비워진 칸)는 세지 않는다. */
  count: number;
  /** 가릴 수 있는 칸 수. 0 이면 이 유닛에는 붙일 표가 없다. */
  total: number;
  toggleMany: (keys: string[]) => void;
  reveal: (keys: string[]) => void;
  blankAll: () => void;
  revealAll: () => void;
  /** 「전부 가리기」를 누른 횟수 — 접힌 절을 펴는 계기(가려진 칸이 안 보이면 뜻이 없다). */
  openTick: number;
}

const Ctx = createContext<DohaeCellBlanks | null>(null);

export function DohaeCellBlankProvider({
  value,
  children,
}: {
  /** null 이면 꺼진 것 — 모드가 꺼져 있거나, 학생(staff 선출시). */
  value: DohaeCellBlanks | null;
  children: ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** 칸 가리기가 켜져 있지 않으면 null — 표는 이 파일을 몰라도 그려진다. */
export function useDohaeCellBlankCtx(): DohaeCellBlanks | null {
  return useContext(Ctx);
}

/**
 * 한 유닛의 가리기 상태. 유닛을 옮기면 비운다.
 * ★blocks 가 바뀌어도 비우지 않는다 — 하이라이트를 하나 저장해도 유닛을 다시 받아
 *   blocks 객체가 새로 온다. 그때마다 비우면 밑줄 한 번에 가린 칸이 다 풀린다.
 */
export function useDohaeCellBlanks(
  unitId: string | null,
  blocks: DohaeBlock[],
): DohaeCellBlanks {
  const model = useMemo(() => buildCellBlankModel(blocks), [blocks]);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const [openTick, setOpenTick] = useState(0);
  useEffect(() => {
    setHidden(new Set<string>());
  }, [unitId]);

  const toggleMany = useCallback((keys: string[]) => {
    if (keys.length === 0) return;
    setHidden((prev) => {
      const next = new Set(prev);
      // 이미 다 가려져 있으면 누르는 건 「도로 보기」다.
      const allHidden = keys.every((k) => prev.has(k));
      for (const k of keys) {
        if (allHidden) next.delete(k);
        else next.add(k);
      }
      return next;
    });
  }, []);
  const reveal = useCallback((keys: string[]) => {
    setHidden((prev) => {
      const next = new Set(prev);
      for (const k of keys) next.delete(k);
      return next;
    });
  }, []);
  const blankAll = useCallback(() => {
    setHidden(new Set(model.content));
    setOpenTick((t) => t + 1);
  }, [model]);
  const revealAll = useCallback(() => {
    setHidden(new Set<string>());
  }, []);

  const count = useMemo(() => {
    let n = 0;
    for (const k of hidden) if (model.contentSet.has(k)) n += 1;
    return n;
  }, [hidden, model]);

  // 값을 한 객체로 묶어 두어야 표·손잡이가 필요할 때만 다시 그려진다.
  return useMemo(
    () => ({
      model,
      hidden,
      count,
      total: model.content.length,
      toggleMany,
      reveal,
      blankAll,
      revealAll,
      openTick,
    }),
    [model, hidden, count, toggleMany, reveal, blankAll, revealAll, openTick],
  );
}

/** 표 칸(th/td)에 다는 속성 — Provider 가 없으면 아무것도 달지 않는다. */
export function cellBlankProps(
  ctx: DohaeCellBlanks | null,
  key: string,
): {
  attrs: Record<string, string | number | undefined>;
  className: string | false;
} {
  if (!ctx) return { attrs: {}, className: false };
  const head = ctx.model.groups.has(key);
  return {
    attrs: {
      [CELL_ATTR]: key,
      // 정리비교표와 같은 손잡이 표시(app.css `[data-dg-blank]` — 손 모양·테두리).
      "data-dg-blank": head ? "head" : undefined,
      // 가릴 수 있는 내용칸 — 손 모양만(테두리는 목차칸에만).
      "data-dh-blankable": ctx.model.contentSet.has(key) ? "" : undefined,
      tabIndex: head ? 0 : undefined,
    },
    className: ctx.hidden.has(key) && CELL_BLANK_CLASS,
  };
}

/** 누른 자리의 칸(가장 안쪽). 링크·단추·접기 머리 위면 null. */
function cellOf(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  if (target.closest(INTERACTIVE)) return null;
  return target.closest<HTMLElement>(`[${CELL_ATTR}]`);
}

/**
 * 칸을 눌렀을 때의 상태 변화. 처리했으면 true.
 *  · 목차칸 → 다스리는 칸들 토글
 *  · 내용칸 → 그 칸(과 속표 칸) 토글
 *  · 이미 가려진 바깥 칸 **안**을 눌렀으면 → 가장 바깥의 가려진 칸을 편다
 *    (CSS 가 자손을 다 감추고 있어 안쪽 칸을 따로 토글해 봐야 그림이 안 바뀐다)
 */
function actOn(ctx: DohaeCellBlanks, el: HTMLElement): boolean {
  let outerHidden: HTMLElement | null = null;
  for (
    let e: HTMLElement | null = el;
    e;
    e = e.parentElement?.closest<HTMLElement>(`[${CELL_ATTR}]`) ?? null
  ) {
    if (e.classList.contains(CELL_BLANK_CLASS)) outerHidden = e;
  }
  if (outerHidden && outerHidden !== el) {
    ctx.reveal(familyOf(ctx.model, outerHidden.dataset.dhCell ?? ""));
    return true;
  }
  const key = el.dataset.dhCell ?? "";
  const group = ctx.model.groups.get(key);
  if (group) {
    ctx.toggleMany(group);
    return true;
  }
  const family = familyOf(ctx.model, key);
  if (family.length === 0) return false;
  ctx.toggleMany(family);
  return true;
}

/** 본문 뿌리에 거는 손잡이 — 위임으로 받는다(칸마다 달면 속표에서 두 번 잡힌다). */
export function useCellBlankHandlers(ctx: DohaeCellBlanks | null): {
  onPointerDown?: (ev: PointerEvent<HTMLElement>) => void;
  onClick?: (ev: MouseEvent<HTMLElement>) => void;
  onKeyDown?: (ev: KeyboardEvent<HTMLElement>) => void;
} {
  const down = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = useCallback((ev: PointerEvent<HTMLElement>) => {
    down.current = { x: ev.clientX, y: ev.clientY };
  }, []);
  const onClick = useCallback(
    (ev: MouseEvent<HTMLElement>) => {
      if (!ctx) return;
      const el = cellOf(ev.target);
      if (!el) return;
      // 끌어서 고르는 중(하이라이트)이면 건드리지 않는다 — **이동 거리**로 본다.
      // ★선택 유무로 보면 안 된다: 가려진 칸은 user-select:none 이라 눌러도 앞서 남은
      //   선택이 안 풀려, 그 칸을 영영 못 편다(검토 지적). 선택이 이 칸에 걸쳐 있을 때만 양보.
      const d = down.current;
      down.current = null;
      if (d && Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > DRAG_PX) return;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.containsNode(el, true)) return;
      actOn(ctx, el);
    },
    [ctx],
  );
  const onKeyDown = useCallback(
    (ev: KeyboardEvent<HTMLElement>) => {
      if (!ctx) return;
      if (ev.key !== "Enter" && ev.key !== " ") return;
      const el = cellOf(ev.target);
      if (el && actOn(ctx, el)) ev.preventDefault();
    },
    [ctx],
  );
  if (!ctx) return {};
  return { onPointerDown, onClick, onKeyDown };
}

/** 머리 띠의 단추 — 「전부 가리기 / 모두 보기 / 가린 칸 n / N」. 붙일 표가 없으면 안 그린다. */
export function DohaeCellBlankBar({ ctx }: { ctx: DohaeCellBlanks }) {
  if (ctx.total === 0) return null;
  const btn =
    "border-border text-muted-foreground hover:bg-muted inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] disabled:opacity-40";
  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={ctx.blankAll}
        disabled={ctx.count === ctx.total}
        title="표의 내용칸을 전부 가립니다"
        className={btn}
      >
        <SquareDashedIcon className="size-3" /> 전부 가리기
      </button>
      <button
        type="button"
        onClick={ctx.revealAll}
        disabled={ctx.count === 0}
        title="가린 칸을 모두 폅니다"
        className={btn}
      >
        <EyeIcon className="size-3" /> 모두 보기
      </button>
      <span
        className={cn(
          "text-muted-foreground hidden text-[11px] tabular-nums sm:inline",
          ctx.count > 0 && "text-foreground font-medium",
        )}
      >
        {ctx.count > 0
          ? `가린 칸 ${ctx.count} / ${ctx.total}`
          : "목차칸을 누르면 그 줄·칸을 가립니다"}
      </span>
    </span>
  );
}
