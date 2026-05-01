// 메모 — 포스트잇(노란 종이 메모) 스타일 카드. 학생이 본문에서 단어/구문을 복사·paste 하면
// 그 단어에 대한 메모로 저장된다 (snippet 컬럼). snippet 이 없으면 일반 article 메모.

import { QuoteIcon, Trash2Icon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Textarea } from "~/core/components/ui/textarea";
import { cn } from "~/core/lib/utils";

import type { AnnotationTargetType, MemoRecord } from "../labels";
import {
  MEMO_SNIPPET_EVENT,
  type MemoSnippetEventDetail,
} from "../lib/memo-selection-event";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MemoList({
  targetType,
  targetId,
  initial,
}: {
  targetType: AnnotationTargetType;
  targetId: string;
  initial: MemoRecord[];
}) {
  const createFetcher = useFetcher();
  const deleteFetcher = useFetcher();
  const [draft, setDraft] = useState("");
  const [snippet, setSnippet] = useState("");
  // selection 으로 캡처한 정확 위치 — 같은 단어가 여러 곳에 등장해도 그 자리만 마크하기 위함.
  // 사용자가 직접 paste 한 경우엔 null (legacy fallback 동작).
  const [position, setPosition] = useState<{
    blockIndex: number;
    cumOffset: number;
  } | null>(null);
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const snippetRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (createFetcher.state === "idle" && createFetcher.data?.ok) {
      setDraft("");
      setSnippet("");
      setPosition(null);
      draftRef.current?.blur();
    }
  }, [createFetcher.state, createFetcher.data]);

  // 본문 selection → "메모" 버튼 클릭 시 snippet + position 자동 fill + textarea focus.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<MemoSnippetEventDetail>).detail;
      if (!detail) return;
      if (detail.targetType !== targetType || detail.targetId !== targetId)
        return;
      setSnippet(detail.snippet);
      if (
        typeof detail.blockIndex === "number" &&
        typeof detail.cumOffset === "number"
      ) {
        setPosition({
          blockIndex: detail.blockIndex,
          cumOffset: detail.cumOffset,
        });
      } else {
        setPosition(null);
      }
      // 다음 paint 후 textarea 로 focus 이동 — tab 전환과 layout commit 후 안전.
      requestAnimationFrame(() => {
        draftRef.current?.focus();
      });
    };
    document.addEventListener(MEMO_SNIPPET_EVENT, handler);
    return () => document.removeEventListener(MEMO_SNIPPET_EVENT, handler);
  }, [targetType, targetId]);

  const isCreating = createFetcher.state !== "idle";

  // 낙관적 업데이트.
  const optimisticNew: MemoRecord | null =
    createFetcher.formData && createFetcher.formData.get("intent") === "create"
      ? {
          memoId: "pending",
          bodyMd: String(createFetcher.formData.get("bodyMd") ?? ""),
          snippet: (() => {
            const s = createFetcher.formData.get("snippet");
            const t = typeof s === "string" ? s.trim() : "";
            return t ? t : null;
          })(),
          blockIndex: (() => {
            const v = createFetcher.formData.get("blockIndex");
            const n = typeof v === "string" ? Number(v) : NaN;
            return Number.isFinite(n) ? n : null;
          })(),
          cumOffset: (() => {
            const v = createFetcher.formData.get("cumOffset");
            const n = typeof v === "string" ? Number(v) : NaN;
            return Number.isFinite(n) ? n : null;
          })(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      : null;

  const deletingId =
    deleteFetcher.formData && deleteFetcher.formData.get("intent") === "delete"
      ? String(deleteFetcher.formData.get("memoId"))
      : null;

  const memos: MemoRecord[] = [
    ...(optimisticNew ? [optimisticNew] : []),
    ...initial.filter((m) => m.memoId !== deletingId),
  ];

  // 사용자가 본문에서 paste 하면 snippet 입력에 자동 focus 되도록 hint.
  // (실제 paste 동작은 사용자가 input 을 클릭한 후 수행)

  return (
    <div className="space-y-3">
      <createFetcher.Form
        method="post"
        action="/api/annotations/memo"
        onSubmit={(e) => {
          if (!draft.trim()) {
            e.preventDefault();
          }
        }}
      >
        <input type="hidden" name="intent" value="create" />
        <input type="hidden" name="targetType" value={targetType} />
        <input type="hidden" name="targetId" value={targetId} />
        {position ? (
          <>
            <input
              type="hidden"
              name="blockIndex"
              value={position.blockIndex}
            />
            <input type="hidden" name="cumOffset" value={position.cumOffset} />
          </>
        ) : null}

        <div className="space-y-2">
          <div className="relative">
            <input
              ref={snippetRef}
              type="text"
              name="snippet"
              value={snippet}
              onChange={(e) => {
                setSnippet(e.target.value);
                // 사용자가 직접 수정하면 selection 으로 캡처한 위치 무효화.
                setPosition(null);
              }}
              placeholder="본문에서 복사한 단어/구문을 paste (선택)"
              maxLength={500}
              className="border-input bg-amber-50/40 dark:bg-amber-950/20 w-full rounded-md border px-3 py-1.5 text-xs italic placeholder:not-italic focus:outline-none focus:ring-2 focus:ring-amber-400/40"
            />
            {snippet ? (
              <button
                type="button"
                onClick={() => {
                  setSnippet("");
                  setPosition(null);
                }}
                aria-label="paste 한 단어 비우기"
                className="text-muted-foreground hover:text-foreground absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex size-5 items-center justify-center rounded"
              >
                <XIcon className="size-3.5" />
              </button>
            ) : null}
          </div>
          <Textarea
            ref={draftRef}
            name="bodyMd"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              snippet
                ? `「${truncate(snippet, 30)}」에 대한 메모`
                : "이 조문에 대한 메모"
            }
            rows={3}
            className="text-sm"
          />
        </div>
        <div className="mt-2 flex justify-end">
          <Button
            type="submit"
            size="sm"
            disabled={isCreating || !draft.trim()}
          >
            메모 추가
          </Button>
        </div>
      </createFetcher.Form>

      {memos.length === 0 ? (
        <p className="text-muted-foreground text-xs">아직 메모가 없습니다.</p>
      ) : (
        <ul className="space-y-3 pt-1">
          {memos.map((m, i) => (
            <PostItMemo
              key={m.memoId}
              memo={m}
              rotateDeg={postItRotation(i)}
              onDelete={
                m.memoId === "pending" ? null : deleteFetcher
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function PostItMemo({
  memo,
  rotateDeg,
  onDelete,
}: {
  memo: MemoRecord;
  rotateDeg: number;
  onDelete: ReturnType<typeof useFetcher> | null;
}) {
  return (
    <li
      className={cn(
        "group relative rounded-sm border border-amber-300/70 bg-amber-100 px-3 py-2.5 text-amber-950 shadow-md",
        "dark:border-amber-700/50 dark:bg-amber-200/85 dark:text-amber-950",
        "transition-transform hover:-translate-y-0.5 hover:rotate-0",
      )}
      style={{
        transform: `rotate(${rotateDeg}deg)`,
        boxShadow:
          "0 1px 1px rgba(0,0,0,0.12), 0 6px 14px -4px rgba(120,90,0,0.18)",
      }}
    >
      {memo.snippet ? (
        <div className="mb-1.5 flex items-start gap-1 border-b border-amber-300/60 pb-1.5">
          <QuoteIcon className="mt-0.5 size-3 shrink-0 text-amber-700/70" />
          <span className="text-xs font-medium italic leading-snug">
            {memo.snippet}
          </span>
        </div>
      ) : null}
      <p className="text-sm whitespace-pre-line leading-snug">{memo.bodyMd}</p>
      <div className="mt-1.5 flex items-center justify-between">
        <span className="text-amber-900/60 text-[11px] tabular-nums dark:text-amber-900/70">
          {formatDate(memo.createdAt)}
        </span>
        {onDelete === null ? (
          <span className="text-amber-900/60 text-[11px]">저장 중…</span>
        ) : (
          <onDelete.Form method="post" action="/api/annotations/memo">
            <input type="hidden" name="intent" value="delete" />
            <input type="hidden" name="memoId" value={memo.memoId} />
            <button
              type="submit"
              aria-label="메모 삭제"
              className="text-amber-900/60 hover:text-rose-600 opacity-0 transition-opacity group-hover:opacity-100"
            >
              <Trash2Icon className="size-3.5" />
            </button>
          </onDelete.Form>
        )}
      </div>
    </li>
  );
}

// 포스트잇 느낌 — 카드마다 살짝 다른 회전. -1.2 / 0.8 / -0.6 / 1.4 cycle.
function postItRotation(idx: number): number {
  const offsets = [-1.2, 0.8, -0.6, 1.4, -1.0];
  return offsets[idx % offsets.length];
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}
