// 빈칸 모드 컨텍스트 — ArticleBodyView 가 inline text 를 렌더할 때 이 context 가 있으면
// 텍스트 안에 빈칸 자리 (before+answer+after 매칭) 를 BlankInput 으로 치환한다.
// 본문 형식(관련조문 inline 링크, 소제목, 메타)은 그대로 유지.
//
// 매칭은 두 단계:
//   - body 가 주어지면 article 단위 cumulative text 위에서 ordered cursor 로 hits 를 사전 계산.
//     동일 정답이 여러 절에 등장해도 idx 순서대로 자연스럽게 다른 위치에 배치된다.
//   - body 가 없거나 block 컨텍스트가 없으면 legacy: token text 단위 findBlankHits.

import { CheckCircle2Icon, MicIcon, MicOffIcon } from "lucide-react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { useFetcher } from "react-router";

import { useVoiceRecognition } from "~/core/hooks/use-voice-recognition";
import { cn } from "~/core/lib/utils";
import type { ArticleBody, Block } from "~/features/laws/lib/article-body";
import type { BlankItem } from "~/features/blanks/queries.server";

import { computeBlockBlankHits, walkBlocks } from "../lib/blank-layout";
import { normalizeAnswer } from "../lib/normalize";

export interface ResolveTextOptions {
  // block + offsetInBlock 가 모두 주어지면 사전 계산된 block hits 를 사용.
  // 없으면 legacy per-token matching.
  block?: Block;
  offsetInBlock?: number;
}

interface ContextValue {
  setId: string | null;
  blanks: BlankItem[];
  blockHits: Map<Block, BlankHit[]>;
  resolveText: (text: string, opts?: ResolveTextOptions) => ReactNode | null;
}

export const BlanksRenderContext = createContext<ContextValue | null>(null);

export function useBlanksRender(): ContextValue | null {
  return useContext(BlanksRenderContext);
}

export interface BlankHit {
  blank: BlankItem;
  start: number;
  end: number;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 정규식의 d 플래그 (matchIndices) 로 capture group 의 정확한 위치를 얻어 정답 start/end 를 결정한다.
// answerMinStart 가 주어지면 캡처(=정답) 시작이 그 이상인 첫 매칭만 반환. ordered cursor 처리에서
// before-context 가 cursor 이전으로 확장돼야 하는 케이스 (e.g. "지식재산처장 또는 (심판장)" 의 first
// 지식재산처장 이 이미 다른 빈칸에 의해 채워졌어도 (심판장) 은 그 뒤에서 매칭) 에 사용.
function findCaptureRange(
  text: string,
  pattern: string,
  answerMinStart = 0,
): [number, number] | null {
  let re: RegExp;
  try {
    re = new RegExp(pattern, "dg");
  } catch {
    return null;
  }
  while (true) {
    const m = re.exec(text);
    if (!m) return null;
    const indices = (m as RegExpExecArray & {
      indices?: Array<[number, number] | undefined>;
    }).indices;
    let answerRange: [number, number] | null = null;
    if (indices && indices[1]) {
      answerRange = indices[1];
    } else if (m[1]) {
      const offset = m[0].indexOf(m[1]);
      if (offset !== -1) {
        const start = m.index + offset;
        answerRange = [start, start + m[1].length];
      }
    }
    if (answerRange && answerRange[0] >= answerMinStart) return answerRange;
    // 무한 루프 방지 — 0-length 매칭이나 같은 위치에서 다시 매칭되는 경우 lastIndex 강제 진행.
    if (re.lastIndex <= m.index) re.lastIndex = m.index + 1;
  }
}

// text 안에서 blanks 의 정답 위치를 탐색. 컨텍스트~정답 경계 공백을 허용하고, 동일 정답이 여러 위치에 나타날 때
// 더 긴 접두/접미를 우선 시도해 구체적 매칭을 우선한다.
// 우선순위:
//   1) before+answer+after (접두 12→4 점진 단축)
//   2) before+answer       (접두 12→4)
//   3) answer+after        (접미 12→4)
//   4) 정답이 본문에 단일 등장
//
// answerMinStart 가 주어지면 정답(capture) 시작 위치가 그 이상인 첫 매칭만 채택.
// ordered cursor 처리(blank-layout.computeBlockBlankHits) 에서 사용.
export function findBlankHits(
  text: string,
  blanks: BlankItem[],
  answerMinStart = 0,
): BlankHit[] {
  // blank-layout.ts ANCHOR_LENGTHS 와 정합. 30자 신규 컨텍스트부터 시도하고 12자 이하는 legacy 호환.
  const lengthsToTry = [30, 20, 12, 10, 8, 6, 4];
  const hits: BlankHit[] = [];
  for (const b of blanks) {
    if (!b.answer) continue;
    const beforeFull = b.beforeContext ?? "";
    const afterFull = b.afterContext ?? "";
    const ansEsc = escapeRegex(b.answer);
    let range: [number, number] | null = null;
    // Tier 1: before + \s* + answer + \s* + after  (접두/접미 동시 사용, 길이 점진 단축)
    if (beforeFull.length > 0 && afterFull.length > 0) {
      for (const len of lengthsToTry) {
        const before = beforeFull.slice(-len);
        const after = afterFull.slice(0, len);
        if (!before || !after) continue;
        range = findCaptureRange(
          text,
          escapeRegex(before) + "\\s*(" + ansEsc + ")\\s*" + escapeRegex(after),
          answerMinStart,
        );
        if (range) break;
      }
    }
    // Tier 2: before + \s* + answer
    if (!range && beforeFull.length > 0) {
      for (const len of lengthsToTry) {
        const before = beforeFull.slice(-len);
        if (!before) continue;
        range = findCaptureRange(
          text,
          escapeRegex(before) + "\\s*(" + ansEsc + ")",
          answerMinStart,
        );
        if (range) break;
      }
    }
    // Tier 3: answer + \s* + after
    if (!range && afterFull.length > 0) {
      for (const len of lengthsToTry) {
        const after = afterFull.slice(0, len);
        if (!after) continue;
        range = findCaptureRange(
          text,
          "(" + ansEsc + ")\\s*" + escapeRegex(after),
          answerMinStart,
        );
        if (range) break;
      }
    }
    // Tier 4: 컨텍스트가 비어 있고 토큰 텍스트 전체가 정답과 같을 때만 매칭.
    // (단순 substring 매칭은 다른 토큰의 "명세서 및 도면..." 같은 곳에서 false-positive 를 만들기 때문)
    if (!range && beforeFull.length === 0 && afterFull.length === 0) {
      if (text.trim() === b.answer.trim()) {
        const start = text.indexOf(b.answer, answerMinStart);
        if (start !== -1) range = [start, start + b.answer.length];
      }
    }
    if (range) {
      hits.push({ blank: b, start: range[0], end: range[1] });
    }
  }
  hits.sort((a, b) => a.start - b.start);
  return hits;
}

type BlankState = {
  input: string;
  status: "empty" | "correct" | "wrong" | "revealed";
};

// 주체/시기 빈칸 attempt 저장에 필요한 메타. setId 는 null 이지만 article + 빈칸타입이 있으면
// (article_id, blank_type, block_index, cum_offset) 으로 user_auto_blank_attempts 에 저장.
export interface AutoBlankMeta {
  articleId: string;
  blankType: "subject" | "period";
}

interface ProviderProps {
  // setId 가 있으면 /api/blanks/attempt 로 저장 (내용 빈칸).
  // setId 가 null 이고 autoMeta 가 있으면 /api/blanks/auto-attempt 로 저장 (주체/시기 빈칸).
  // 둘 다 없으면 attempt 저장 안 함 (legacy).
  setId: string | null;
  autoMeta?: AutoBlankMeta;
  blanks: BlankItem[];
  reveal: boolean;
  // body 가 있으면 article 단위 cumulative text 위에서 ordered cursor 로 hits 를 사전 계산.
  // 없으면 legacy per-token matching (token 경계를 넘는 컨텍스트는 매칭 실패).
  body?: ArticleBody | null;
  children: ReactNode;
}

export function BlanksRenderProvider({
  setId,
  autoMeta,
  blanks,
  reveal,
  body,
  children,
}: ProviderProps) {
  const [states, setStates] = useState<Record<number, BlankState>>(() => {
    const init: Record<number, BlankState> = {};
    for (const b of blanks) init[b.idx] = { input: "", status: "empty" };
    return init;
  });
  const fetcher = useFetcher();

  const blockHits = useMemo<Map<Block, BlankHit[]>>(
    () => (body ? computeBlockBlankHits(body, blanks) : new Map()),
    [body, blanks],
  );

  // 자동 next-focus — 정답 맞추면 다음 빈 빈칸 input 으로 포커스 이동.
  // 순서는 RENDER ORDER (walkBlocks pre-order, 같은 block 내 start 순). idx 가 admin 이 비순서로
  // 부여한 경우 (내용 빈칸 모드) 에도 화면 순서대로 진행. body 가 없으면 idx 순 fallback.
  // computeBlockBlankHits 는 idx 순으로 블록에 hit 을 add 하므로 Map 의 insertion order 가 곧
  // walk 순이 아닐 수 있다 (idx 1 이 뒤쪽 블록에 매칭되면 그 블록이 먼저 Map 에 들어감).
  // 따라서 walkBlocks 로 다시 한 번 순회해 hits 를 모은다.
  const renderOrder = useMemo<BlankItem[]>(() => {
    if (!body || blockHits.size === 0) {
      return [...blanks].sort((a, b) => a.idx - b.idx);
    }
    const order: BlankItem[] = [];
    walkBlocks(body, (block) => {
      const hits = blockHits.get(block);
      if (!hits) return;
      for (const h of hits) order.push(h.blank);
    });
    return order;
  }, [body, blockHits, blanks]);

  const inputsRef = useRef<Map<number, HTMLInputElement>>(new Map());
  const registerInput = useCallback(
    (idx: number, el: HTMLInputElement | null) => {
      if (el) inputsRef.current.set(idx, el);
      else inputsRef.current.delete(idx);
    },
    [],
  );

  // 음성 인식 — 한 번에 하나의 input 만 활성화. activeVoiceIdx 가 null 이 아니면 그 input 의
  // 마이크 버튼이 active 상태로 표시된다. final transcript 가 들어오면 그 idx 의 checkAnswer 호출.
  const [activeVoiceIdx, setActiveVoiceIdx] = useState<number | null>(null);
  const checkAnswerRef = useRef<(idx: number, input: string) => void>(
    () => {},
  );
  const voice = useVoiceRecognition({
    lang: "ko-KR",
    onFinal: (text) => {
      const idx = activeVoiceIdx;
      if (idx == null) return;
      // 음성 인식 결과 → 정답 비교 (자동 trim).
      checkAnswerRef.current(idx, text.trim());
    },
  });
  const toggleVoice = useCallback(
    (idx: number) => {
      if (!voice.isSupported) return;
      if (activeVoiceIdx === idx) {
        voice.stop();
        setActiveVoiceIdx(null);
      } else {
        if (voice.listening) voice.stop();
        setActiveVoiceIdx(idx);
        const el = inputsRef.current.get(idx);
        el?.focus();
        voice.start();
      }
    },
    [voice, activeVoiceIdx],
  );
  // focusNextBlank 는 ref 로 보관해 useCallback deps 에 의존하지 않게 한다 — 정답 후
  // /api/blanks/attempt fetcher 응답으로 loader revalidation 이 일어나면 body / blanks /
  // blockHits 이 새 ref 가 되는데, useCallback deps 에 묶여 있으면 effect 의 cleanup 으로
  // pending setTimeout 이 cancel 돼버려 focus 이동이 사라진다. ref 로 해두면 effect deps 에
  // focusNextBlank 가 들어가지 않아 cleanup 이 발생하지 않는다.
  const focusNextBlankRef = useRef<(afterIdx: number) => void>(() => {});
  focusNextBlankRef.current = (afterIdx: number) => {
    const list = renderOrder;
    const tryFocus = (subList: BlankItem[]) => {
      for (const b of subList) {
        if (!b.answer) continue;
        const el = inputsRef.current.get(b.idx);
        if (!el) continue;
        if (el.disabled) continue;
        el.focus();
        try {
          el.select();
        } catch {
          /* noop */
        }
        return true;
      }
      return false;
    };
    const curPos = list.findIndex((b) => b.idx === afterIdx);
    if (curPos === -1) {
      // 현재 빈칸이 render list 에 없으면 (희귀) 처음부터 시도.
      tryFocus(list);
      return;
    }
    // 현재 다음부터 forward → 못 찾으면 wrap (처음~현재 직전).
    if (tryFocus(list.slice(curPos + 1))) return;
    tryFocus(list.slice(0, curPos));
  };

  const updateState = useCallback(
    (idx: number, patch: Partial<BlankState>) => {
      setStates((prev) => ({
        ...prev,
        [idx]: { ...(prev[idx] ?? { input: "", status: "empty" }), ...patch },
      }));
    },
    [],
  );

  // 정답 schedule — checkAnswer 안에서 직접 focus 이동을 schedule. useEffect 로 state 변화를
  // 감시하던 기존 방식은 다음 두 race 에 취약했다:
  //   (1) /api/blanks/attempt fetcher 응답 후 loader revalidate 가 일어나 effect deps 가 바뀌면
  //       cleanup 의 clearTimeout 으로 focus 이동이 cancel 됨.
  //   (2) 한글 IME composing 중에 정답이 commit 되면 composingRef.has(idx) 가 true 인 상태로
  //       useEffect 가 fire 되는데, 그때 input 은 이미 disabled (state commit 후) 라 cur.blur() 가
  //       compositionend 를 못 trigger 하는 경우가 있어 pendingFocusRef 가 stuck.
  //
  // 새 방식: onChange 안에서 (1) state 가 commit 되기 전에 cur.blur() 로 IME 강제 commit + focus 풀기,
  // (2) setTimeout(0) 으로 React commit 후 다음 input focus. cur.blur() 가 호출되는 시점엔 input 이
  // 아직 enabled 라 IME 가 정상 commit 됨.
  const scheduleFocusNext = useCallback((idx: number) => {
    const cur = inputsRef.current.get(idx);
    if (cur) cur.blur();
    setTimeout(() => focusNextBlankRef.current(idx), 0);
  }, []);

  const checkAnswer = useCallback(
    (idx: number, input: string) => {
      const blank = blanks.find((b) => b.idx === idx);
      if (!blank?.answer) return;
      // 입력값이 정답이 아니어도 typed value 는 state 에 반영해 사용자가 결과를 볼 수 있게 한다.
      const isCorrect =
        normalizeAnswer(input) === normalizeAnswer(blank.answer);
      if (isCorrect) {
        updateState(idx, { input, status: "correct" });
        // attempt 저장 — 우선순위: setId(content) > autoMeta(subject/period) > skip
        if (setId) {
          const fd = new FormData();
          fd.set("setId", setId);
          fd.set("blankIdx", String(idx));
          fd.set("userInput", input);
          fetcher.submit(fd, {
            method: "post",
            action: "/api/blanks/attempt",
          });
        } else if (
          autoMeta &&
          typeof blank.blockIndex === "number" &&
          typeof blank.cumOffset === "number"
        ) {
          const fd = new FormData();
          fd.set("articleId", autoMeta.articleId);
          fd.set("blankType", autoMeta.blankType);
          fd.set("blockIndex", String(blank.blockIndex));
          fd.set("cumOffset", String(blank.cumOffset));
          fd.set("answer", blank.answer);
          fd.set("userInput", input);
          fetcher.submit(fd, {
            method: "post",
            action: "/api/blanks/auto-attempt",
          });
        }
        scheduleFocusNext(idx);
      } else {
        updateState(idx, { input, status: input.length > 0 ? "wrong" : "empty" });
      }
    },
    [blanks, fetcher, setId, autoMeta, updateState, scheduleFocusNext],
  );
  // 음성 인식 final → checkAnswer 직접 호출. checkAnswerRef 로 latest function 보관.
  checkAnswerRef.current = checkAnswer;

  // text 안에서 빈칸을 input 으로 치환한 ReactNode 반환. 매칭 없으면 null.
  // block + offsetInBlock 가 주어지면 사전 계산된 block hits 의 부분집합을 사용.
  // 없으면 legacy per-text findBlankHits.
  const resolveText = useCallback(
    (text: string, opts?: ResolveTextOptions): ReactNode | null => {
      const hits = resolveHitsForText(text, blanks, blockHits, opts);
      if (hits.length === 0) return null;

      const out: ReactNode[] = [];
      let cursor = 0;
      let key = 0;
      for (const h of hits) {
        const localStart = Math.max(0, h.start);
        const localEnd = Math.min(text.length, h.end);
        if (localStart > cursor) {
          out.push(<span key={key++}>{text.slice(cursor, localStart)}</span>);
        }
        // hit 의 시작이 이 텍스트 안에 있을 때만 input 렌더 (이전 토큰에서 시작한 hit 은 skip).
        if (h.start >= 0) {
          const state = states[h.blank.idx] ?? {
            input: "",
            status: "empty" as const,
          };
          const widthCh = Math.max(
            5,
            Math.min(40, (h.blank.answer.length || h.blank.length) * 2 + 2),
          );
          const showRevealed = reveal && state.status !== "correct";
          out.push(
            <BlankInputInline
              key={key++}
              idx={h.blank.idx}
              answer={h.blank.answer}
              value={showRevealed ? h.blank.answer : state.input}
              status={showRevealed ? "revealed" : state.status}
              widthCh={widthCh}
              onChange={(v) => checkAnswer(h.blank.idx, v)}
              registerInput={registerInput}
              voiceSupported={voice.isSupported}
              voiceActive={activeVoiceIdx === h.blank.idx}
              onToggleVoice={toggleVoice}
            />,
          );
        }
        cursor = Math.max(cursor, localEnd);
      }
      if (cursor < text.length) {
        out.push(<span key={key++}>{text.slice(cursor)}</span>);
      }
      return <>{out}</>;
    },
    [
      blanks,
      blockHits,
      states,
      reveal,
      checkAnswer,
      registerInput,
      voice.isSupported,
      activeVoiceIdx,
      toggleVoice,
    ],
  );

  const value = useMemo<ContextValue>(
    () => ({ setId, blanks, blockHits, resolveText }),
    [setId, blanks, blockHits, resolveText],
  );

  return (
    <BlanksRenderContext.Provider value={value}>
      {children}
    </BlanksRenderContext.Provider>
  );
}

// hits 를 텍스트 좌표로 변환. block + offsetInBlock 모드에서는 미리 계산된 block hits 를
// [offsetInBlock, offsetInBlock + text.length) 와 겹치는 것만 골라 텍스트-상대 좌표로 평행이동.
// hit 이 텍스트 시작보다 앞에서 시작했을 수 있으므로 start 가 음수가 될 수 있고, 이 경우
// resolveText 는 input 을 렌더하지 않고 cursor 만 진행시킨다.
export function resolveHitsForText(
  text: string,
  blanks: BlankItem[],
  blockHits: Map<Block, BlankHit[]>,
  opts?: ResolveTextOptions,
): BlankHit[] {
  if (opts?.block && opts?.offsetInBlock != null) {
    const blockHitsArr = blockHits.get(opts.block) ?? [];
    const startGlobal = opts.offsetInBlock;
    const endGlobal = startGlobal + text.length;
    return blockHitsArr
      .filter((h) => h.start < endGlobal && h.end > startGlobal)
      .map((h) => ({
        blank: h.blank,
        start: h.start - startGlobal,
        end: h.end - startGlobal,
      }));
  }
  return findBlankHits(text, blanks);
}

function BlankInputInline({
  idx,
  answer,
  value,
  status,
  widthCh,
  onChange,
  registerInput,
  voiceSupported,
  voiceActive,
  onToggleVoice,
}: {
  idx: number;
  answer: string;
  value: string;
  status: BlankState["status"];
  widthCh: number;
  onChange: (v: string) => void;
  registerInput: (idx: number, el: HTMLInputElement | null) => void;
  voiceSupported: boolean;
  voiceActive: boolean;
  onToggleVoice: (idx: number) => void;
}) {
  const cls = cn(
    "mx-0.5 inline-block rounded border-b-2 px-1 align-baseline focus:outline-none",
    status === "correct" || status === "revealed"
      ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-medium"
      : status === "wrong"
        ? "border-rose-500 bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-300"
        : "border-muted-foreground/40 bg-muted/30 focus:border-primary",
  );
  const filled = status === "correct" || status === "revealed";
  return (
    <span className="inline-flex items-baseline">
      <input
        ref={(el) => registerInput(idx, el)}
        type="text"
        className={cls}
        style={{ width: `${widthCh}ch` }}
        value={value}
        disabled={filled}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`빈칸 ${idx}`}
        title={`빈칸 ${idx} (${answer.length}자)`}
      />
      {voiceSupported && !filled ? (
        <button
          type="button"
          onClick={() => onToggleVoice(idx)}
          aria-label={voiceActive ? "음성 인식 중지" : "음성 입력"}
          title={voiceActive ? "음성 인식 중지" : "음성 입력 (ko-KR)"}
          className={cn(
            "ml-0.5 inline-flex size-5 items-center justify-center rounded transition-colors",
            voiceActive
              ? "bg-primary text-primary-foreground animate-pulse"
              : "text-muted-foreground hover:bg-accent",
          )}
        >
          {voiceActive ? (
            <MicIcon className="size-3" />
          ) : (
            <MicOffIcon className="size-3" />
          )}
        </button>
      ) : null}
      {filled ? (
        <CheckCircle2Icon className="ml-0.5 size-3.5 text-emerald-500" />
      ) : null}
    </span>
  );
}
