// 빈칸 모드 컨텍스트 — ArticleBodyView 가 inline text 를 렌더할 때 이 context 가 있으면
// 텍스트 안에 빈칸 자리 (before+answer+after 매칭) 를 BlankInput 으로 치환한다.
// 본문 형식(관련조문 inline 링크, 소제목, 메타)은 그대로 유지.

import { CheckCircle2Icon } from "lucide-react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { useFetcher } from "react-router";

import { cn } from "~/core/lib/utils";
import type { BlankItem } from "~/features/blanks/queries.server";

import { normalizeAnswer } from "../lib/normalize";

interface ContextValue {
  setId: string;
  blanks: BlankItem[];
  resolveText: (text: string) => ReactNode | null;
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

// text 안에서 blanks 의 정답 위치를 (before+answer+after / before+answer / answer+after / answer 단일등장)
// 우선순위로 탐색해 hit 위치 배열 반환. start 오름차순, 겹침은 caller 가 처리.
export function findBlankHits(
  text: string,
  blanks: BlankItem[],
): BlankHit[] {
  const hits: BlankHit[] = [];
  for (const b of blanks) {
    if (!b.answer) continue;
    const before = (b.beforeContext ?? "").slice(-6);
    const after = (b.afterContext ?? "").slice(0, 6);
    let answerStart = -1;
    let answerEnd = -1;
    if (before.length > 0 || after.length > 0) {
      const fullPattern = before + b.answer + after;
      if (fullPattern.length > b.answer.length) {
        const idxFull = text.indexOf(fullPattern);
        if (idxFull !== -1) {
          answerStart = idxFull + before.length;
          answerEnd = answerStart + b.answer.length;
        }
      }
    }
    if (answerStart === -1 && before.length > 0) {
      const partial = before + b.answer;
      const idxP = text.indexOf(partial);
      if (idxP !== -1) {
        answerStart = idxP + before.length;
        answerEnd = answerStart + b.answer.length;
      }
    }
    if (answerStart === -1 && after.length > 0) {
      const partial = b.answer + after;
      const idxP = text.indexOf(partial);
      if (idxP !== -1) {
        answerStart = idxP;
        answerEnd = answerStart + b.answer.length;
      }
    }
    if (answerStart === -1 && before.length === 0 && after.length === 0) {
      const first = text.indexOf(b.answer);
      if (first !== -1) {
        const second = text.indexOf(b.answer, first + b.answer.length);
        if (second === -1) {
          answerStart = first;
          answerEnd = first + b.answer.length;
        }
      }
    }
    if (answerStart !== -1) {
      hits.push({ blank: b, start: answerStart, end: answerEnd });
    }
  }
  hits.sort((a, b) => a.start - b.start);
  return hits;
}

type BlankState = {
  input: string;
  status: "empty" | "correct" | "wrong" | "revealed";
};

interface ProviderProps {
  setId: string;
  blanks: BlankItem[];
  reveal: boolean;
  children: ReactNode;
}

export function BlanksRenderProvider({
  setId,
  blanks,
  reveal,
  children,
}: ProviderProps) {
  const [states, setStates] = useState<Record<number, BlankState>>(() => {
    const init: Record<number, BlankState> = {};
    for (const b of blanks) init[b.idx] = { input: "", status: "empty" };
    return init;
  });
  const fetcher = useFetcher();

  const updateState = useCallback(
    (idx: number, patch: Partial<BlankState>) => {
      setStates((prev) => ({
        ...prev,
        [idx]: { ...(prev[idx] ?? { input: "", status: "empty" }), ...patch },
      }));
    },
    [],
  );

  const checkAnswer = useCallback(
    (idx: number, input: string) => {
      const blank = blanks.find((b) => b.idx === idx);
      if (!blank?.answer) return;
      const isCorrect =
        normalizeAnswer(input) === normalizeAnswer(blank.answer);
      if (isCorrect) {
        updateState(idx, { input, status: "correct" });
        const fd = new FormData();
        fd.set("setId", setId);
        fd.set("blankIdx", String(idx));
        fd.set("userInput", input);
        fetcher.submit(fd, {
          method: "post",
          action: "/api/blanks/attempt",
        });
      } else {
        updateState(idx, { input, status: input.length > 0 ? "wrong" : "empty" });
      }
    },
    [blanks, fetcher, setId, updateState],
  );

  // text 안에서 매칭 가능한 빈칸들을 찾아 input 으로 치환된 ReactNode 배열 반환.
  // 매칭 가능한 빈칸이 없으면 null (caller 가 plain text 그대로 렌더).
  const resolveText = useCallback(
    (text: string): ReactNode | null => {
      const hits = findBlankHits(text, blanks);
      if (hits.length === 0) return null;

      const out: ReactNode[] = [];
      let cursor = 0;
      let key = 0;
      for (const h of hits) {
        if (h.start < cursor) continue; // overlap
        if (h.start > cursor) {
          out.push(<span key={key++}>{text.slice(cursor, h.start)}</span>);
        }
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
            value={
              showRevealed
                ? h.blank.answer
                : state.input
            }
            status={
              showRevealed ? "revealed" : state.status
            }
            widthCh={widthCh}
            onChange={(v) => checkAnswer(h.blank.idx, v)}
          />,
        );
        cursor = h.end;
      }
      if (cursor < text.length) {
        out.push(<span key={key++}>{text.slice(cursor)}</span>);
      }
      return <>{out}</>;
    },
    [blanks, states, reveal, checkAnswer],
  );

  const value = useMemo<ContextValue>(
    () => ({ setId, blanks, resolveText }),
    [setId, blanks, resolveText],
  );

  return (
    <BlanksRenderContext.Provider value={value}>
      {children}
    </BlanksRenderContext.Provider>
  );
}

function BlankInputInline({
  idx,
  answer,
  value,
  status,
  widthCh,
  onChange,
}: {
  idx: number;
  answer: string;
  value: string;
  status: BlankState["status"];
  widthCh: number;
  onChange: (v: string) => void;
}) {
  const cls = cn(
    "mx-0.5 inline-block rounded border-b-2 px-1 align-baseline focus:outline-none",
    status === "correct" || status === "revealed"
      ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-medium"
      : status === "wrong"
        ? "border-rose-500 bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-300"
        : "border-muted-foreground/40 bg-muted/30 focus:border-primary",
  );
  return (
    <span className="inline-flex items-baseline">
      <input
        type="text"
        className={cls}
        style={{ width: `${widthCh}ch` }}
        value={value}
        disabled={status === "correct" || status === "revealed"}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`빈칸 ${idx}`}
        title={`빈칸 ${idx} (${answer.length}자)`}
      />
      {status === "correct" || status === "revealed" ? (
        <CheckCircle2Icon className="ml-0.5 size-3.5 text-emerald-500" />
      ) : null}
    </span>
  );
}
