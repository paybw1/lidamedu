// feat-2-037 — 도해 빈칸 모드의 화면 조각(입력 칸 · 글자 렌더 · 머리 띠).
//
// ★입력은 **비제어(uncontrolled)** 다. value 를 state 로 되쓰면 키 입력마다 표 전체가
//   다시 그려지고, iPad 한글 입력에서 조합 중인 글자가 밀린다(모범답안 연습·암기 탭에서
//   이미 겪었다). 값은 ref 로 모아 「맞춰보기」에서 한 번에 읽는다.
// ★빈칸 모드에서는 하이라이트·포스트잇 오버레이를 **그리지 않는다**(호출부에서 판단).
//   저장된 오프셋은 컨테이너 전체 글자 기준이라, 입력 칸이 글 흐름에 들어가면 어긋난
//   자리에 그어진다. 저장값은 건드리지 않으므로 읽기로 돌아가면 그대로다.

import { CheckIcon, EraserIcon, RotateCcwIcon, XIcon } from "lucide-react";
import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { cn } from "~/core/lib/utils";

import type { DohaeBlock } from "../labels";
import {
  DOHAE_BLANK_TYPES,
  DOHAE_BLANK_TYPE_LABEL,
  type DohaeBlankHit,
  type DohaeBlankScore,
  type DohaeBlankStatus,
  type DohaeBlankType,
  type DohaeTerm,
  blankableNodes,
  buildBlanks,
  hitsOfPath,
  judgeBlank,
  scoreBlanks,
} from "../lib/dohae-blanks";
import type { DohaeBlankTermRow } from "../queries.server";

import { BoldSpans, shiftRanges } from "./dohae-text";

interface BlankCtxValue {
  hitsByPath: Map<string, DohaeBlankHit[]>;
  /** 「맞춰보기」 전에는 비어 있다. */
  status: Record<number, DohaeBlankStatus>;
  register: (idx: number, el: HTMLInputElement | null) => void;
  onBlur: () => void;
  /** Enter 로 다음 칸. */
  focusNext: (idx: number) => void;
}

const BlankCtx = createContext<BlankCtxValue | null>(null);

export function DohaeBlankProvider({
  value,
  children,
}: {
  value: BlankCtxValue;
  children: ReactNode;
}) {
  return <BlankCtx.Provider value={value}>{children}</BlankCtx.Provider>;
}

/** 빈칸 모드가 아니면 null — 읽기 화면은 이 파일을 몰라도 된다. */
export function useDohaeBlanks(): BlankCtxValue | null {
  return useContext(BlankCtx);
}

// ── 연습 상태 ──────────────────────────────────────────────────────────────

const DRAFT_PREFIX = "dohaeBlank";

export interface DohaeBlankPractice extends BlankCtxValue {
  /** 지금 화면에 뚫린 말들 — 운영자 「말 관리」가 이것만 보여 준다. */
  usedTermIds: Set<string>;
  blankCount: number;
  score: DohaeBlankScore | null;
  check: () => void;
  reset: () => void;
}

/**
 * 한 유닛·한 유형의 연습 상태.
 * ★값은 state 가 아니라 ref 에 있다(비제어 입력). 「맞춰보기」에서 한 번에 읽는다.
 * ★유닛이나 유형이 바뀌면 **빈칸 번호의 뜻이 달라진다** — 채점 결과와 입력 칸 등록을
 *   모두 비우지 않으면 앞 화면의 정오 색이 엉뚱한 칸에 남는다.
 */
export function useDohaeBlankPractice(
  unitId: string | null,
  blocks: DohaeBlock[],
  terms: DohaeBlankTermRow[],
  type: DohaeBlankType,
): DohaeBlankPractice {
  const refs = useRef<Record<number, HTMLInputElement | null>>({});
  const [status, setStatus] = useState<Record<number, DohaeBlankStatus>>({});
  const [score, setScore] = useState<DohaeBlankScore | null>(null);

  const plan = useMemo(() => {
    const live: DohaeTerm[] = terms
      .filter((t) => !t.excludedAt)
      .map((t) => ({
        termId: t.termId,
        term: t.term,
        fromExam: t.fromExam,
        fromOx: t.fromOx,
        examCount: t.examCount,
        oxCount: t.oxCount,
        score: t.score,
      }));
    return buildBlanks(blankableNodes(blocks), live, type);
  }, [blocks, terms, type]);

  const hitsByPath = useMemo(() => {
    const m = new Map<string, DohaeBlankHit[]>();
    for (const path of new Set(plan.hits.map((h) => h.path)))
      m.set(path, hitsOfPath(plan.hits, path));
    return m;
  }, [plan]);

  const key = unitId ? `${DRAFT_PREFIX}.${type}.${unitId}` : null;

  // 유닛·유형이 바뀌면 앞 화면의 흔적을 지우고 저장해 둔 초안을 넣는다.
  // ★렌더 결과에 넣지 않고 mount 뒤 ref 로 채운다 — 비제어 입력의 규칙.
  useEffect(() => {
    setStatus({});
    setScore(null);
    if (!key) return;
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return;
      const saved: unknown = JSON.parse(raw);
      if (!saved || typeof saved !== "object") return;
      for (const [k, v] of Object.entries(saved as Record<string, unknown>)) {
        const el = refs.current[Number(k)];
        if (el && typeof v === "string" && !el.value) el.value = v;
      }
    } catch {
      // 저장값이 깨졌거나 저장소를 못 쓰는 환경 — 연습을 막을 이유가 없다.
    }
  }, [key, plan]);

  // ★지금 배치에 있는 칸만 읽는다. 유형을 바꾸면 빈칸 번호의 뜻이 달라지므로, ref 맵에
  //   남아 있는 앞 배치의 번호를 그대로 읽으면 엉뚱한 값이 초안·채점에 섞인다.
  const collect = (): Record<number, string> => {
    const out: Record<number, string> = {};
    for (const h of plan.hits) {
      const el = refs.current[h.idx];
      if (el) out[h.idx] = el.value;
    }
    return out;
  };

  const saveDraft = () => {
    if (!key) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(collect()));
    } catch {
      // 초안 보존은 곁다리다 — 실패해도 연습을 막지 않는다.
    }
  };

  return {
    hitsByPath,
    status,
    register: (idx, el) => {
      refs.current[idx] = el;
    },
    onBlur: saveDraft,
    // ★blur 를 먼저 하고 다음 프레임에 focus — 한글 IME 는 확정한 마지막 음절을 조합
    //   버퍼에 잠시 남겼다가 프로그램 포커스 이동 때 새 칸으로 흘린다. 이전 칸에서
    //   확정·소진시킨 뒤 옮긴다(조문·판례 빈칸이 같은 순서를 쓴다).
    focusNext: (idx) => {
      const order = plan.hits.map((h) => h.idx);
      const next = order[order.indexOf(idx) + 1];
      const el = next === undefined ? null : refs.current[next];
      if (!el) return;
      (document.activeElement as HTMLElement | null)?.blur?.();
      requestAnimationFrame(() => el.focus());
    },
    usedTermIds: new Set(plan.terms.map((t) => t.termId)),
    blankCount: plan.hits.length,
    score,
    check: () => {
      saveDraft();
      const answers = collect();
      const next: Record<number, DohaeBlankStatus> = {};
      for (const h of plan.hits) next[h.idx] = judgeBlank(answers[h.idx] ?? "", h.answer);
      setStatus(next);
      setScore(scoreBlanks(plan.hits, answers));
    },
    reset: () => {
      for (const el of Object.values(refs.current)) if (el) el.value = "";
      setStatus({});
      setScore(null);
      if (!key) return;
      try {
        window.localStorage.removeItem(key);
      } catch {
        /* 위와 같다 */
      }
    },
  };
}

// ── 글자 + 빈칸 ────────────────────────────────────────────────────────────

/**
 * 본문 한 조각을 그린다 — 빈칸이 걸려 있으면 그 자리에 입력 칸을, 아니면 글자를.
 * @param offset 이 조각이 원래 글에서 시작하는 위치(칸 안 그림·속표로 잘린 조각 때문에 필요)
 * @param boldRanges 이미 이 조각 좌표로 옮겨진 굵게 구간
 */
export function DohaeText({
  path,
  text,
  offset = 0,
  boldRanges,
}: {
  path: string;
  text: string;
  offset?: number;
  boldRanges?: [number, number][];
}) {
  const ctx = useDohaeBlanks();
  const hits = (ctx?.hitsByPath.get(path) ?? []).filter(
    (h) => h.start >= offset && h.end <= offset + text.length,
  );
  if (!ctx || hits.length === 0) return <BoldSpans text={text} ranges={boldRanges} />;

  const out: ReactNode[] = [];
  let at = 0;
  for (const h of hits) {
    const s = h.start - offset;
    const e = h.end - offset;
    if (s > at)
      out.push(
        <BoldSpans
          key={`t${at}`}
          text={text.slice(at, s)}
          ranges={shiftRanges(boldRanges, at, s)}
        />,
      );
    {
      // ★키는 번호가 아니라 **무엇이 어디에** 있는지로 준다. 번호로 주면 유형을 바꿔
      //   말이 달라져도 React 가 같은 자리의 입력 칸을 재사용해, 앞 유형에서 친 답이
      //   다른 말의 칸에 남는다(비제어라 DOM 값이 그대로 산다).
      out.push(<DohaeBlankInput key={`${h.termId}:${h.start}`} hit={h} ctx={ctx} />);
    }
    at = e;
  }
  if (at < text.length)
    out.push(
      <BoldSpans
        key="tail"
        text={text.slice(at)}
        ranges={shiftRanges(boldRanges, at, text.length)}
      />,
    );
  return <>{out}</>;
}

const TONE: Record<DohaeBlankStatus, string> = {
  empty: "border-muted-foreground/40 bg-muted/30 focus:border-primary",
  correct:
    "border-emerald-500 bg-emerald-50 font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  wrong: "border-rose-500 bg-rose-50 text-rose-800 dark:bg-rose-950/30 dark:text-rose-300",
};

const BLANK_ATTR = "lidamBlank";

function DohaeBlankInput({ hit, ctx }: { hit: DohaeBlankHit; ctx: BlankCtxValue }) {
  const status = ctx.status[hit.idx] ?? "empty";
  const composing = useRef(false);
  return (
    <span className="inline-flex items-baseline gap-1">
      <input
        ref={(el) => ctx.register(hit.idx, el)}
        type="text"
        data-lidam-blank="1"
        onBlur={ctx.onBlur}
        // ★터치로 다른 칸을 바로 찍으면 iOS 가 조합 중인 글자를 그 칸으로 옮긴다.
        //   먼저 이전 칸을 blur 해 조합을 거기서 끝낸다(조문·판례 빈칸과 같은 방어).
        //   터치는 mousedown 합성이 늦거나 생략될 수 있어 pointerdown 에서 한다.
        onPointerDown={(e) => {
          const active = document.activeElement as HTMLElement | null;
          if (active && active !== e.currentTarget && active.dataset?.[BLANK_ATTR] === "1")
            active.blur();
        }}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={() => {
          composing.current = false;
        }}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault(); // 팝업 안이라 기본 동작(폼 제출·닫힘)을 막는다.
          if (!composing.current) ctx.focusNext(hit.idx);
        }}
        // 글자 수만큼 폭 — 조문·판례 빈칸과 같은 규칙(몇 글자인지는 단서로 준다).
        style={{ width: `${Math.max(hit.answer.length, 2) + 1}ch` }}
        className={cn(
          "mx-0.5 inline-block rounded border-b-2 px-1 align-baseline focus:outline-none",
          TONE[status],
        )}
        aria-label={`빈칸 ${hit.idx + 1}`}
        title={`빈칸 (${hit.answer.length}자)`}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        data-1p-ignore="true"
        data-lpignore="true"
        data-form-type="other"
      />
      {/* 틀린 칸은 답을 바로 보여 준다 — 맞춰보고 답을 못 보면 고칠 데가 없다. */}
      {status === "wrong" ? (
        <span className="text-[0.85em] font-medium text-rose-600 dark:text-rose-400">
          {hit.answer}
        </span>
      ) : null}
    </span>
  );
}

// ── 머리 띠 ────────────────────────────────────────────────────────────────

export function DohaeBlankBar({
  type,
  onType,
  score,
  onCheck,
  onReset,
  terms,
  usedTermIds,
  viewerIsStaff,
  onToggleTerm,
}: {
  type: DohaeBlankType;
  onType: (t: DohaeBlankType) => void;
  /** 「맞춰보기」 전에는 null. */
  score: DohaeBlankScore | null;
  onCheck: () => void;
  onReset: () => void;
  terms: DohaeBlankTermRow[];
  /** 지금 화면에 뚫린 말들. */
  usedTermIds: Set<string>;
  viewerIsStaff: boolean;
  onToggleTerm: (termId: string, excluded: boolean) => void;
}) {
  const used = terms.filter((t) => usedTermIds.has(t.termId));
  const excluded = terms.filter((t) => t.excludedAt);

  return (
    <div className="border-border bg-muted/30 mb-3 rounded-lg border px-3 py-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {DOHAE_BLANK_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onType(t)}
            aria-pressed={type === t}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
              type === t
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            유형 {t}
            <span className="ml-1 font-normal opacity-80">
              {DOHAE_BLANK_TYPE_LABEL[t]}
            </span>
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1.5">
          {score ? (
            <span
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                score.written === 0
                  ? "border-border text-muted-foreground"
                  : score.correct === score.written
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
              )}
            >
              {score.correct}/{score.written} 정답
              {score.written < score.total
                ? ` (안 쓴 칸 ${score.total - score.written})`
                : ""}
            </span>
          ) : null}
          <Button type="button" size="sm" className="h-7" onClick={onCheck}>
            <CheckIcon className="size-3.5" /> 맞춰보기
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7"
            onClick={onReset}
          >
            <EraserIcon className="size-3.5" /> 지우기
          </Button>
        </div>
      </div>

      <p className="text-muted-foreground mt-1.5 text-[11px]">
        그 단원의 기출·정오문제에서 논의된 말만 빈칸이 됩니다. 비워 둔 칸은 채점에서 뺍니다.
      </p>

      {viewerIsStaff ? (
        <details className="mt-2">
          <summary className="text-muted-foreground cursor-pointer text-[11px]">
            말 관리 — 지금 뚫린 말 {used.length}개
            {excluded.length ? ` · 뺀 말 ${excluded.length}개` : ""}
          </summary>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {used.map((t) => (
              <button
                key={t.termId}
                type="button"
                onClick={() => onToggleTerm(t.termId, true)}
                title={`기출 ${t.examCount} · 정오 ${t.oxCount} — 빈칸에서 빼기`}
                className="border-border hover:bg-muted inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]"
              >
                {t.term}
                <XIcon className="text-muted-foreground size-3" />
              </button>
            ))}
            {excluded.map((t) => (
              <button
                key={t.termId}
                type="button"
                onClick={() => onToggleTerm(t.termId, false)}
                title="되돌리기"
                className="border-border/60 text-muted-foreground hover:bg-muted inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-[11px] line-through"
              >
                {t.term}
                <RotateCcwIcon className="size-3 no-underline" />
              </button>
            ))}
          </div>
          <p className="text-muted-foreground mt-1 text-[10px]">
            뺀 말은 지워지지 않습니다 — 추출을 다시 돌려도 이 판단은 그대로 남습니다.
          </p>
        </details>
      ) : null}
    </div>
  );
}

/** 빈칸을 만들 수 없는 유닛(본문이 전부 도해이거나 연결 문제가 없다). */
export function DohaeBlankEmpty() {
  return (
    <div className="border-border text-muted-foreground mb-3 rounded-lg border border-dashed px-3 py-4 text-center text-xs">
      이 항목은 연결된 기출·정오문제가 없어 빈칸을 만들 수 없습니다.
      <Badge variant="outline" className="ml-2">
        읽기로 보세요
      </Badge>
    </div>
  );
}
