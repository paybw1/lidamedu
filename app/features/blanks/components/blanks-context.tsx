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

  // ★마우스 클릭으로 다른 빈칸으로 이동할 때의 IME 잔여 이월 차단.
  //   Enter/Tab 은 doFocusNext 가 "이전 칸 blur → flush" 로 막지만, 네이티브 클릭엔 그 경로가
  //   없어 Windows 한글 IME 조합 버퍼의 마지막 음절이 새로 클릭한 칸으로 이월됐다.
  //   새 칸이 포커스되기 전(mousedown 시점)에 현재 포커스된 '다른' 빈칸을 먼저 blur 해서
  //   버퍼를 그 칸에 확정(flush)·소진시킨다. 그 뒤 네이티브 클릭이 새 칸을 깨끗이 포커스한다.
  const flushBeforePointerFocus = useCallback((targetIdx: number) => {
    if (typeof document === "undefined") return;
    const activeEl = document.activeElement as HTMLElement | null;
    if (!activeEl) return;
    if (activeEl === inputsRef.current.get(targetIdx)) return; // 같은 칸 재클릭 — 무시.
    // 현재 포커스가 '어떤 provider 든' 빈칸 input 이면 flush — data-lidam-blank 전역 식별.
    //   ★같은 provider 만 보던 과거 구현은 장(chapter) 뷰어처럼 여러 조문이 한 화면일 때
    //   제1조→제2조 교차 터치를 못 잡아 IME 마지막 글자가 이월됐다(2026-07-20 신고).
    //   무관한 엘리먼트(검색창 등)는 여전히 건드리지 않는다.
    if (
      activeEl instanceof HTMLInputElement &&
      activeEl.dataset.lidamBlank === "1" &&
      typeof activeEl.blur === "function"
    ) {
      activeEl.blur();
    }
  }, []);

  // 최신 states 를 ref 로 보관 — checkAnswer/doFocusNext 가 deps 없이 현재 상태를 읽는다.
  const statesRef = useRef(states);
  statesRef.current = states;
  // ★한글 IME 조합이 어느 input 에서든 진행 중인지(전역). 조합 중 focus 이동 = 조합 잔여가
  //   다음 칸으로 이월(전국내…)되므로, 이동은 조합 종료 후로 미룬다.
  const anyComposingRef = useRef(false);

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
  // 다음 focus 대상 idx 만 결정 (실제 focus 는 remount 후 effect 에서 수행).
  const findNextBlankIdx = useCallback(
    (afterIdx: number): number | null => {
      const list = renderOrder;
      const tryFind = (subList: BlankItem[]) => {
        for (const b of subList) {
          if (!b.answer) continue;
          if ((states[b.idx]?.status ?? "empty") === "correct") continue;
          return b.idx;
        }
        return null;
      };
      const curPos = list.findIndex((b) => b.idx === afterIdx);
      if (curPos === -1) return tryFind(list);
      return (
        tryFind(list.slice(curPos + 1)) ?? tryFind(list.slice(0, curPos))
      );
    },
    [renderOrder, states],
  );

  const updateState = useCallback(
    (idx: number, patch: Partial<BlankState>) => {
      setStates((prev) => ({
        ...prev,
        [idx]: { ...(prev[idx] ?? { input: "", status: "empty" }), ...patch },
      }));
    },
    [],
  );

  // 정답 후 처리 — 다음 빈칸으로 자동 focus 이동(Tab 없이).
  // 과거엔 한국어 IME 조합 파괴(자모 분리·leak prefill) 때문에 highlight 만 하고 이동은
  // 사용자 Tab/클릭에 맡겼다. 그러나 이 경로는 composing=false(조합 확정) 이후에만 실행되고,
  // 각 input 이 autocomplete off·name 제거·data-*ignore·controlled value 강제로 누수를
  // 구조적으로 막으므로, 조합이 끝난 시점의 다음-빈칸 focus 는 안전하다.
  // provider 는 attempt revalidation 으로 remount 되지 않아(inputsRef 유효) rAF 로 다음
  // 프레임에 focus 하면 된다. highlight(hintNextIdx) 는 focus 실패 시 폴백 안내로 유지.
  const [hintNextIdx, setHintNextIdx] = useState<number | null>(null);
  // 실제 focus 이동 — 대상 칸을 그 컨트롤드 값(보통 빈 문자열)으로 정리해 이월 조합 잔여를
  // 버린 뒤 focus·커서 끝 이동. 조합 중엔 호출하지 않는다(호출부에서 가드).
  //
  // ★IME 조합 버퍼 flush 순서가 핵심 — compositionend(=composingRef false) 이후에도 Windows
  //   한글 IME 는 마지막 음절을 OS 레벨 조합 버퍼에 잠시 남겨두고, 그 상태에서 다른 input 으로
  //   프로그램 포커스가 옮겨가면 잔여가 새 칸으로 이월(leak: "이전 칸 마지막 글자가 따라옴")된다.
  //   사용자가 "새 칸에서 스페이스 1회 치면 안 따라온다"고 보고한 것과 동일한 원리로,
  //   이동 직전 현재(이전) input 을 blur 해 IME 버퍼를 그 칸에 확정(flush)시켜 비운 뒤,
  //   다음 프레임(rAF)에 새 칸으로 focus 한다. 이전 칸은 이미 정답 잠금 상태라 flush 무해.
  const doFocusNext = useCallback((next: number) => {
    const el = inputsRef.current.get(next);
    if (!el || el.disabled) return;
    // 1) 현재 포커스된(이전) input 을 blur → OS IME 조합 버퍼를 그 칸에 flush·소진.
    const activeEl =
      typeof document !== "undefined"
        ? (document.activeElement as HTMLElement | null)
        : null;
    if (activeEl && activeEl !== el && typeof activeEl.blur === "function") {
      activeEl.blur();
    }
    const focusTarget = () => {
      const controlled = statesRef.current[next]?.input ?? "";
      if (el.value !== controlled) {
        try {
          el.value = controlled;
        } catch {
          /* noop */
        }
      }
      el.focus();
      const len = el.value.length;
      try {
        el.setSelectionRange(len, len);
      } catch {
        /* noop */
      }
    };
    // 2) blur 로 flush 된 조합 잔여가 완전히 처리된 뒤(=activeElement 가 잠시 body) 다음
    //    프레임에 새 칸으로 focus. 버퍼가 빈 뒤라 이월 없음. rAF 미지원 시 동기 폴백.
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(focusTarget);
    } else {
      focusTarget();
    }
  }, []);
  // ★정답을 맞혀도 자동으로 다음 칸으로 이동하지 않는다 — 과거 자동이동은 IME 조합
  //   잔여가 다음 칸으로 이월(leak: "이전 빈칸 마지막 글자가 따라옴")되는 근본 원인이었다.
  //   정답 칸은 하이라이트로 다음 빈칸을 안내만 하고, 실제 이동은 사용자가 Enter 를
  //   눌렀을 때(조합이 이미 끝난 뒤라 잔여 이월이 없음) advanceToNext 로 수행한다.
  const updateNextHint = useCallback(
    (idx: number) => {
      setHintNextIdx(findNextBlankIdx(idx));
    },
    [findNextBlankIdx],
  );
  // Enter → 다음 빈칸 이동. 조합 중이면 무시(조합 확정 후에만 이동해야 leak 없음).
  const advanceToNext = useCallback(
    (idx: number) => {
      if (anyComposingRef.current) return;
      // ★현재 칸이 정답일 때만 이동 — 방금 포커스된 빈 칸에서 Enter(한글 IME 확정 Enter 와
      //   이동 Enter 겹침·연타)가 그 빈 칸을 건너뛰어 "다다음" 으로 가버리는 버그 방지.
      //   findNextBlankIdx 는 idx 다음부터 찾으므로, 빈 현재 칸에서 호출하면 현재 칸을 건너뛴다.
      //   힌트 문구("정답을 맞히면 Enter 로 다음 빈칸 이동")대로 정답 확정 후에만 이동한다.
      if (statesRef.current[idx]?.status !== "correct") return;
      const next = findNextBlankIdx(idx);
      if (next != null) doFocusNext(next);
    },
    [findNextBlankIdx, doFocusNext],
  );
  // Tab / Shift+Tab → 인접 빈칸으로 이동(플러시 안전 경로).
  //   ★네이티브 Tab 은 한글 IME 조합 버퍼가 현재 칸에 확정되기 전에 포커스를 옮겨서,
  //     이전 칸 마지막 음절이 다음 칸으로 이월된다("이전등록" 입력 후 Tab → 다음 칸에서
  //     지우면 "록"의 잔여가 "로"로 나타남). doFocusNext 가 이동 직전 현재 input 을
  //     blur(=IME 버퍼를 현재 칸에 flush)한 뒤 rAF 로 새 칸을 focus 하고 대상 값을
  //     controlled(보통 빈 문자열)로 정리하므로 이월이 사라진다 — Enter/자동이동과 동일 경로.
  //   이동했으면 true(→ 호출부에서 preventDefault), 인접 빈칸이 없으면(양 끝) false 로
  //   네이티브 Tab 을 그대로 허용해 포커스가 빈칸 영역 밖으로 나갈 수 있게 한다.
  const focusAdjacentBlank = useCallback(
    (fromIdx: number, dir: 1 | -1): boolean => {
      const list = renderOrder;
      const pos = list.findIndex((b) => b.idx === fromIdx);
      if (pos === -1) return false;
      for (let i = pos + dir; i >= 0 && i < list.length; i += dir) {
        const cand = list[i];
        const el = inputsRef.current.get(cand.idx);
        if (el && !el.disabled) {
          doFocusNext(cand.idx);
          return true;
        }
      }
      return false;
    },
    [renderOrder, doFocusNext],
  );

  // input 조합 상태 변화 통지 — 전역 조합 플래그만 갱신(Enter 이동 가드에 사용).
  const handleComposingChange = useCallback((composing: boolean) => {
    anyComposingRef.current = composing;
  }, []);

  const checkAnswer = useCallback(
    (idx: number, rawInput: string, composing = false) => {
      const blank = blanks.find((b) => b.idx === idx);
      if (!blank?.answer) return;

      // ★이미 맞힌 칸은 잠금 — 직전 칸의 마지막 글자를 확정시킨 경계 키가 (disabled 적용
      //   전 race 로) 정답 칸에 다시 입력돼 상태를 훼손하거나 잔여 글자를 남기는 것을 막는다.
      if (statesRef.current[idx]?.status === "correct") return;

      // ★한글 IME 조합 중에는 어떤 DOM 조작·값 변형도 하지 않는다 — 조합 중
      // el.value 재작성이 조합을 파괴해 "첫 글자가 지워지는" 버그의 원인.
      // 조합 중엔 상태만 반영하고, 최종 판정은 compositionend 의
      // onChange(composing=false) 에서 수행한다.
      if (composing) {
        updateState(idx, {
          input: rawInput,
          status: rawInput.length > 0 ? "wrong" : "empty",
        });
        return;
      }

      // 입력값은 사용자가 친 그대로 사용한다.
      // (과거엔 자동완성/IME 잔여 leak 을 막으려고 여기서 다른 빈칸 정답을 substring
      // 으로 잘라내고, 매칭 실패 시 "마지막 1글자만" 남기는 폴백을 돌렸다. 그러나 이
      // 휴리스틱이 정상 입력까지 훼손해 "친 단어가 사라짐/특정 단어가 입력 안 됨"
      // 버그의 원인이었다. 누수 차단은 input 의 autocomplete=off·name 제거·각종
      // data-*ignore 속성으로 구조적으로 처리하므로 입력값을 사후 변형하지 않는다.)
      const input = rawInput;

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
        updateNextHint(idx);
      } else {
        updateState(idx, { input, status: input.length > 0 ? "wrong" : "empty" });
      }
    },
    [blanks, fetcher, setId, autoMeta, updateState, updateNextHint],
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
          // key++ 로 같은 idx 가 한 텍스트 안에 여러 번 등장하는 희귀 케이스에서도
          // key 충돌 방지.
          out.push(
            <BlankInputInline
              key={`b${h.blank.idx}-${key++}`}
              idx={h.blank.idx}
              answer={h.blank.answer}
              value={showRevealed ? h.blank.answer : state.input}
              status={showRevealed ? "revealed" : state.status}
              widthCh={widthCh}
              hintNext={hintNextIdx === h.blank.idx}
              onChange={(v, composing) => checkAnswer(h.blank.idx, v, composing)}
              onComposingChange={handleComposingChange}
              onEnter={() => advanceToNext(h.blank.idx)}
              onTab={(shift) => focusAdjacentBlank(h.blank.idx, shift ? -1 : 1)}
              onPointerDownFlush={() => flushBeforePointerFocus(h.blank.idx)}
              onFocusInput={() => setHintNextIdx(null)}
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
      handleComposingChange,
      advanceToNext,
      focusAdjacentBlank,
      flushBeforePointerFocus,
      registerInput,
      voice.isSupported,
      activeVoiceIdx,
      toggleVoice,
      hintNextIdx,
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
  hintNext,
  onChange,
  onComposingChange,
  onEnter,
  onTab,
  onPointerDownFlush,
  onFocusInput,
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
  hintNext: boolean;
  onChange: (v: string, composing: boolean) => void;
  onComposingChange: (composing: boolean) => void;
  onEnter: () => void;
  // Tab(shift=false) / Shift+Tab(shift=true) → 인접 빈칸 이동. 이동했으면 true.
  onTab: (shift: boolean) => boolean;
  // 마우스로 이 칸을 클릭(mousedown)해 이동할 때 — 포커스 이동 전에 이전 칸을 flush.
  onPointerDownFlush: () => void;
  onFocusInput: () => void;
  registerInput: (idx: number, el: HTMLInputElement | null) => void;
  voiceSupported: boolean;
  voiceActive: boolean;
  onToggleVoice: (idx: number) => void;
}) {
  // 한글 IME 조합 진행 여부 — 조합 중엔 DOM 값 강제 동기화·판정 변형을 전부
  // 건너뛴다(조합 파괴 = 첫 글자 소실 버그). ref 라 리렌더 없음.
  const composingRef = useRef(false);
  const cls = cn(
    "mx-0.5 inline-block rounded border-b-2 px-1 align-baseline focus:outline-none",
    status === "correct" || status === "revealed"
      ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-medium"
      : status === "wrong"
        ? "border-rose-500 bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-300"
        : hintNext
          ? "border-primary bg-primary/15 ring-2 ring-primary/40 animate-pulse"
          : "border-muted-foreground/40 bg-muted/30 focus:border-primary",
  );
  const filled = status === "correct" || status === "revealed";
  return (
    // span 으로 inline. <form> wrap 은 <p> 안에 nested 불가(HTML 위반)라
    // 브라우저가 form 을 p 밖으로 자동 이동 → context 안 잡힘. autofill 차단은
    // attribute + checkAnswer 의 leak prefix 제거 로직에 의존.
    <span className="inline-flex items-baseline">
      <input
        ref={(el) => {
          registerInput(idx, el);
          // ref callback 은 React mount 직후 동기 호출 — Chrome autofill 보다
          // 먼저. 이 시점에 DOM value 를 controlled value 로 강제 set 해두면
          // autofill 이 적용되기 전에 우리 값이 자리잡음.
          // ★단, 한글 IME 조합 중에는 절대 덮어쓰지 않는다 — 리렌더(예: attempt
          //   revalidation)로 이 콜백이 조합 도중 실행되면 조합이 파괴돼 글자가
          //   지워지거나(첫 글자 소실) 반복 등장한다.
          if (el && !composingRef.current && el.value !== value) {
            try {
              el.value = value;
            } catch {
              /* noop */
            }
          }
        }}
        type="text"
        className={cls}
        style={{ width: `${widthCh}ch` }}
        value={value}
        // 정답 칸은 disabled 로 잠그지 않는다 — Enter 로 다음 칸 이동을 받으려면 focus·keydown
        //   이 살아 있어야 하기 때문. 재입력은 checkAnswer 의 correct 가드가 무시하므로 잠금 유지.
        //   정답 모두 보기(revealed) 만 실제 disabled.
        disabled={status === "revealed"}
        onChange={(e) => onChange(e.target.value, composingRef.current)}
        onKeyDown={(e) => {
          // Enter → 다음 빈칸 이동(조합 중이면 조합 확정만 하고 이동은 상위 가드가 무시).
          if (e.key === "Enter") {
            e.preventDefault();
            if (!composingRef.current) onEnter();
            return;
          }
          // Tab / Shift+Tab → 네이티브 포커스 이동을 가로채 flush-safe 경로로 이동.
          //   ★조합 중 네이티브 Tab 은 IME 버퍼가 현재 칸에 확정되기 전에 포커스를 옮겨
          //     이전 칸 마지막 글자가 다음 칸으로 이월된다. onTab(doFocusNext)이 현재 input 을
          //     먼저 blur(=버퍼 flush)한 뒤 다음 칸으로 focus 하므로 이월이 없다.
          //     인접 빈칸이 없으면(false) 네이티브 Tab 을 그대로 두어 영역 밖으로 나가게 한다.
          if (e.key === "Tab" || e.keyCode === 9) {
            const moved = onTab(e.shiftKey);
            if (moved) e.preventDefault();
          }
        }}
        // 마우스/터치로 이 칸을 누를 때 — 포커스가 옮겨오기 전에 이전(현재 포커스)
        //   빈칸을 blur 해 한글 IME 조합 버퍼를 그 칸에 flush. 이월 차단.
        //   ★onPointerDown 병행: 터치는 mousedown 합성이 늦거나 생략될 수 있어(모바일 신고
        //   재현) 더 이른 pointerdown 시점에 먼저 flush 한다(중복 호출은 무해·멱등).
        onPointerDown={() => onPointerDownFlush()}
        onMouseDown={() => onPointerDownFlush()}
        onFocus={(e) => {
          if (e.currentTarget.value !== value) {
            e.currentTarget.value = value;
          }
          onFocusInput();
        }}
        onCompositionStart={(e) => {
          // 조합 시작 직전 — 아직 삽입 전이라 autofill leak 정리는 안전.
          if (e.currentTarget.value !== value) {
            e.currentTarget.value = value;
          }
          composingRef.current = true;
          onComposingChange(true); // 전역 조합 플래그 ON → 이 사이 focus 이동 금지
        }}
        onCompositionEnd={(e) => {
          composingRef.current = false;
          // 전역 조합 플래그 OFF — 이후 Enter 이동 가드(advanceToNext)가 통과되게 한다.
          onComposingChange(false);
          // 조합 확정값으로 최종 판정(조합 중엔 상태 반영만 했음). 정답이어도 자동이동은
          // 하지 않으므로 조합 잔여가 다음 칸으로 이월되지 않는다.
          onChange(e.currentTarget.value, false);
        }}
        onBeforeInput={(e) => {
          // ★조합 중 강제 동기화 금지 — 리렌더가 한 박자 늦은 시점에 stale 값으로
          // 되돌리면 조합이 파괴돼 첫 글자가 지워진다.
          if (!composingRef.current && e.currentTarget.value !== value) {
            e.currentTarget.value = value;
          }
        }}
        aria-label={`빈칸 ${idx}`}
        title={`빈칸 ${idx} (${answer.length}자)`}
        // 전역 빈칸 식별자 — 다른 조문(provider)의 flush 가 이 input 을 알아보게 한다
        // (장 뷰어처럼 여러 조문이 한 화면일 때 교차 이동 flush 용).
        data-lidam-blank="1"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        data-form-type="other"
        data-lpignore="true"
        data-1p-ignore="true"
        data-bwignore="true"
        // Ginger / Grammarly 등 grammar-check 확장 skip 힌트 (비공식이지만 일부 버전 인식).
        data-gramm="false"
        data-gramm_editor="false"
        data-enable-grammarly="false"
        data-ginger="off"
        // name 자체를 omit — Chrome 의 form-history autofill 은 input 의 name
        // 으로 매칭하는데, name 이 없으면 history 비교 자체가 불가.
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

