// 운영자용 빈칸 렌더 provider — 학생용 BlanksRenderProvider 와 같은 BlanksRenderContext 를 채우지만,
// 빈칸 자리를 input 대신 정적 placeholder span (filled/empty/active) 로 치환한다.
// ArticleBodyView 와 함께 쓰면 좌측 '원본 조문' 과 동일한 본문 포맷을 유지하면서
// 정답이 들어갈 자리를 시각화할 수 있다.
//
// 매칭은 body 가 주어지면 article 단위 ordered cursor (block-layout) 사용.
// 동일 정답을 가진 빈칸이 여러 절에 등장하는 케이스도 idx 순으로 자연스럽게 다른 위치에 배치된다.

import { type ReactNode, useCallback, useMemo } from "react";

import { cn } from "~/core/lib/utils";
import type { ArticleBody, Block } from "~/features/laws/lib/article-body";
import type { BlankItem } from "~/features/blanks/queries.server";

import { computeBlockBlankHits } from "../lib/blank-layout";

import {
  BlanksRenderContext,
  type BlankHit,
  type ResolveTextOptions,
  resolveHitsForText,
} from "./blanks-context";

interface AdminProviderProps {
  setId: string;
  blanks: BlankItem[];
  drafts: Record<number, string>;
  activeIdx: number | null;
  onActivate: (idx: number) => void;
  // body 가 있으면 article 단위 cumulative text 위에서 ordered placement.
  // 없으면 legacy per-token matching.
  body?: ArticleBody | null;
  children: ReactNode;
}

export function AdminBlanksRenderProvider({
  setId,
  blanks,
  drafts,
  activeIdx,
  onActivate,
  body,
  children,
}: AdminProviderProps) {
  const blockHits = useMemo<Map<Block, BlankHit[]>>(
    () => (body ? computeBlockBlankHits(body, blanks) : new Map()),
    [body, blanks],
  );

  const resolveText = useCallback(
    (text: string, opts?: ResolveTextOptions): ReactNode | null => {
      const hits = resolveHitsForText(text, blanks, blockHits, opts);
      if (hits.length === 0) return null;

      const baseOffset = opts?.offsetInBlock ?? 0;
      const out: ReactNode[] = [];
      let cursor = 0;
      let key = 0;
      for (const h of hits) {
        const localStart = Math.max(0, h.start);
        const localEnd = Math.min(text.length, h.end);
        if (localStart > cursor) {
          // data-cumoffset 으로 wrap — captureSelection 이 이 fragment 의 base offset + 상대 offset
          // 으로 정확 위치 캡처.
          out.push(
            <span
              key={key++}
              data-cumoffset={baseOffset + cursor}
            >
              {text.slice(cursor, localStart)}
            </span>,
          );
        }
        if (h.start >= 0) {
          const draft = (drafts[h.blank.idx] ?? "").trim();
          const filled = draft.length > 0;
          const active = activeIdx === h.blank.idx;
          out.push(
            <button
              key={key++}
              type="button"
              data-blank-idx={h.blank.idx}
              onClick={() => onActivate(h.blank.idx)}
              title={`빈칸 #${h.blank.idx} (${h.blank.length}자)${
                active ? " — 활성" : " — 클릭하면 활성 빈칸이 됩니다"
              }`}
              className={cn(
                "mx-0.5 inline-block rounded border-b-2 px-1 align-baseline text-[13px] font-medium transition-colors",
                filled
                  ? "border-emerald-500 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/60"
                  : "border-amber-400 bg-amber-50/60 text-amber-800 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-300 dark:hover:bg-amber-950/50",
                active && "ring-primary ring-2 ring-offset-1",
              )}
            >
              {filled ? draft : `[#${h.blank.idx}]`}
            </button>,
          );
        }
        cursor = Math.max(cursor, localEnd);
      }
      if (cursor < text.length) {
        out.push(
          <span
            key={key++}
            data-cumoffset={baseOffset + cursor}
          >
            {text.slice(cursor)}
          </span>,
        );
      }
      return <>{out}</>;
    },
    [blanks, blockHits, drafts, activeIdx, onActivate],
  );

  const value = useMemo(
    () => ({ setId, blanks, blockHits, resolveText }),
    [setId, blanks, blockHits, resolveText],
  );

  return (
    <BlanksRenderContext.Provider value={value}>
      {children}
    </BlanksRenderContext.Provider>
  );
}
