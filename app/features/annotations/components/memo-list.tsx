// 포스트잇 — 노란 종이 메모 스타일 카드. 본문에서 단어/구문을 선택하면 그 단어에 대한
// 포스트잇으로 저장된다 (snippet 컬럼). snippet 이 없으면 일반 포스트잇.
// feat-8-023: 강사 작성 포스트잇은 모든 수험생에게 노출(읽기 전용), 본인 것은 삭제 가능.
import type { AnnotationTargetType, MemoRecord } from "../labels";

import { CheckIcon, PencilIcon, QuoteIcon, Trash2Icon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Textarea } from "~/core/components/ui/textarea";
import { cn } from "~/core/lib/utils";

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

// 포스트잇 placeholder 명사 — 대상 종류별 ("이 {명사}에 대한 포스트잇").
const TARGET_NOUN: Record<AnnotationTargetType, string> = {
  article: "조문",
  case: "판례",
  problem: "문제",
  problem_choice: "문제",
  problem_box_item: "문제",
  dohae_unit: "도해",
};

export function MemoList({
  targetType,
  targetId,
  initial,
  viewerIsStaff = false,
}: {
  targetType: AnnotationTargetType;
  targetId: string;
  initial: MemoRecord[];
  /** 보는 사람이 강사·원장인지 — 본인 포스트잇도 강사 표식으로 표시. */
  viewerIsStaff?: boolean;
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

  // 본문 selection → "포스트잇" 버튼 클릭 시 snippet + position 자동 fill + textarea focus.
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

  // 낙관적 업데이트 — 새로 만든 포스트잇은 본인 것.
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
          isMine: true,
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
              className="border-input w-full rounded-md border bg-amber-50/40 px-3 py-1.5 text-xs italic placeholder:not-italic focus:ring-2 focus:ring-amber-400/40 focus:outline-none dark:bg-amber-950/20"
            />
            {snippet ? (
              <button
                type="button"
                onClick={() => {
                  setSnippet("");
                  setPosition(null);
                }}
                aria-label="paste 한 단어 비우기"
                className="text-muted-foreground hover:text-foreground absolute top-1/2 right-1.5 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded"
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
                ? `「${truncate(snippet, 30)}」에 대한 포스트잇`
                : `이 ${TARGET_NOUN[targetType]}에 대한 포스트잇`
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
            포스트잇 추가
          </Button>
        </div>
      </createFetcher.Form>

      {memos.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          아직 포스트잇이 없습니다.
        </p>
      ) : (
        <ul className="space-y-3 pt-1">
          {memos.map((m, i) => (
            <PostItMemo
              key={m.memoId}
              memo={m}
              rotateDeg={postItRotation(i)}
              viewerIsStaff={viewerIsStaff}
              deleteFetcher={deleteFetcher}
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
  viewerIsStaff,
  deleteFetcher,
}: {
  memo: MemoRecord;
  rotateDeg: number;
  viewerIsStaff: boolean;
  deleteFetcher: ReturnType<typeof useFetcher>;
}) {
  const pending = memo.memoId === "pending";
  // 강사 작성 포스트잇 = 내 것이 아니거나(전체 공개), 내가 강사.
  const isStaffNote = !memo.isMine || viewerIsStaff;
  const canEdit = memo.isMine && !pending;
  const canDelete = memo.isMine && !pending;

  const editFetcher = useFetcher<{ ok?: boolean }>();
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(memo.bodyMd);
  const isSaving = editFetcher.state !== "idle";

  // 저장 성공 시 편집 모드 종료(revalidation 으로 본문 갱신).
  useEffect(() => {
    if (editFetcher.state === "idle" && editFetcher.data?.ok) {
      setEditing(false);
    }
  }, [editFetcher.state, editFetcher.data]);

  const startEdit = () => {
    setEditDraft(memo.bodyMd);
    setEditing(true);
  };

  return (
    <li
      className={cn(
        "group relative rounded-sm border border-amber-300/70 bg-amber-100 px-3 py-2.5 text-amber-950 shadow-md",
        "dark:border-amber-700/50 dark:bg-amber-200/85 dark:text-amber-950",
        "transition-transform hover:-translate-y-0.5 hover:rotate-0",
      )}
      style={{
        transform: `rotate(${editing ? 0 : rotateDeg}deg)`,
        boxShadow:
          "0 1px 1px rgba(0,0,0,0.12), 0 6px 14px -4px rgba(120,90,0,0.18)",
      }}
    >
      {isStaffNote ? (
        <div className="mb-1.5 inline-flex items-center rounded-sm bg-amber-800/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
          강사
        </div>
      ) : null}
      {memo.snippet ? (
        <div className="mb-1.5 flex items-start gap-1 border-b border-amber-300/60 pb-1.5">
          <QuoteIcon className="mt-0.5 size-3 shrink-0 text-amber-700/70" />
          <span className="text-xs leading-snug font-medium italic">
            {memo.snippet}
          </span>
        </div>
      ) : null}

      {editing ? (
        <editFetcher.Form
          method="post"
          action="/api/annotations/memo"
          onSubmit={(e) => {
            if (!editDraft.trim()) e.preventDefault();
          }}
        >
          <input type="hidden" name="intent" value="update" />
          <input type="hidden" name="memoId" value={memo.memoId} />
          <textarea
            name="bodyMd"
            value={editDraft}
            onChange={(e) => setEditDraft(e.target.value)}
            rows={3}
            autoFocus
            className="w-full resize-none rounded-sm border border-amber-300 bg-amber-50/70 px-2 py-1.5 text-sm leading-snug text-amber-950 focus:ring-2 focus:ring-amber-400/50 focus:outline-none"
          />
          <div className="mt-1.5 flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={isSaving}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold text-amber-900/70 hover:text-amber-900"
            >
              <XIcon className="size-3" /> 취소
            </button>
            <button
              type="submit"
              disabled={isSaving || !editDraft.trim()}
              className="inline-flex items-center gap-1 rounded bg-amber-700 px-2 py-1 text-[11px] font-semibold text-amber-50 hover:bg-amber-800 disabled:opacity-50"
            >
              <CheckIcon className="size-3" /> 저장
            </button>
          </div>
        </editFetcher.Form>
      ) : (
        <p className="text-sm leading-snug whitespace-pre-line">{memo.bodyMd}</p>
      )}

      {editing ? null : (
        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-[11px] text-amber-900/60 tabular-nums dark:text-amber-900/70">
            {formatDate(memo.createdAt)}
          </span>
          {pending ? (
            <span className="text-[11px] text-amber-900/60">저장 중…</span>
          ) : canEdit || canDelete ? (
            <div className="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
              {canEdit ? (
                <button
                  type="button"
                  onClick={startEdit}
                  aria-label="포스트잇 수정"
                  className="text-amber-900/60 hover:text-amber-900"
                >
                  <PencilIcon className="size-3.5" />
                </button>
              ) : null}
              {canDelete ? (
                <deleteFetcher.Form method="post" action="/api/annotations/memo">
                  <input type="hidden" name="intent" value="delete" />
                  <input type="hidden" name="memoId" value={memo.memoId} />
                  <button
                    type="submit"
                    aria-label="포스트잇 삭제"
                    className="text-amber-900/60 hover:text-rose-600"
                    onClick={(e) => {
                      if (!confirm("이 포스트잇을 삭제하시겠습니까?")) e.preventDefault();
                    }}
                  >
                    <Trash2Icon className="size-3.5" />
                  </button>
                </deleteFetcher.Form>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
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
