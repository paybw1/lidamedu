// 운영자용 빈칸 렌더 provider — 학생용 BlanksRenderProvider 와 같은 BlanksRenderContext 를 채우지만,
// 빈칸 자리를 input 대신 정적 placeholder span (filled/empty/active) 로 치환한다.
// ArticleBodyView 와 함께 쓰면 좌측 '원본 조문' 과 동일한 본문 포맷을 유지하면서
// 정답이 들어갈 자리를 시각화할 수 있다.

import { type ReactNode, useCallback, useMemo } from "react";

import { cn } from "~/core/lib/utils";
import type { BlankItem } from "~/features/blanks/queries.server";

import { BlanksRenderContext, findBlankHits } from "./blanks-context";

interface AdminProviderProps {
  setId: string;
  blanks: BlankItem[];
  drafts: Record<number, string>;
  activeIdx: number | null;
  onActivate: (idx: number) => void;
  children: ReactNode;
}

export function AdminBlanksRenderProvider({
  setId,
  blanks,
  drafts,
  activeIdx,
  onActivate,
  children,
}: AdminProviderProps) {
  const resolveText = useCallback(
    (text: string): ReactNode | null => {
      const hits = findBlankHits(text, blanks);
      if (hits.length === 0) return null;

      const out: ReactNode[] = [];
      let cursor = 0;
      let key = 0;
      for (const h of hits) {
        if (h.start < cursor) continue;
        if (h.start > cursor) {
          out.push(<span key={key++}>{text.slice(cursor, h.start)}</span>);
        }
        const draft = (drafts[h.blank.idx] ?? "").trim();
        const filled = draft.length > 0;
        const active = activeIdx === h.blank.idx;
        out.push(
          <button
            key={key++}
            type="button"
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
        cursor = h.end;
      }
      if (cursor < text.length) {
        out.push(<span key={key++}>{text.slice(cursor)}</span>);
      }
      return <>{out}</>;
    },
    [blanks, drafts, activeIdx, onActivate],
  );

  const value = useMemo(
    () => ({ setId, blanks, resolveText }),
    [setId, blanks, resolveText],
  );

  return (
    <BlanksRenderContext.Provider value={value}>
      {children}
    </BlanksRenderContext.Provider>
  );
}
