// 본문에서 텍스트 선택 시 selection rect 위에 떠오르는 색상 선택 툴바.
// 클릭 시 즉시 저장 (POST /api/annotations/highlight) 후 툴바 닫힘.
//
// feat-8-022: staff(강사/원장) 가 보고 있을 때는 "코멘트" 액션이 추가된다.
//   클릭 시 같은 selection→offset→contentHash 계산을 재사용해, 색 + (선택) 메모를
//   고른 뒤 /api/comments/comment 로 하이라이트형 코멘트를 게시한다 (전체 학생 노출).
//   학생 툴바는 종전대로 개인 하이라이트/메모만 제공한다.
//
// 주의: 색상 버튼 클릭 시 selection 이 사라지지 않도록 onMouseDown + preventDefault 사용.
//   코멘트 composer 는 메모 입력 시 selection 이 collapse 되므로 pending 을 freeze 한다.

import { MessageSquarePlusIcon, NotebookPenIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";

import { cn } from "~/core/lib/utils";

import {
  HIGHLIGHT_COLORS,
  type AnnotationTargetType,
  type HighlightColor,
} from "../labels";
import { captureContainerSelection } from "../lib/highlight-dom";
import { dispatchMemoSnippet } from "../lib/memo-selection-event";

const COLOR_BTN: Record<HighlightColor, string> = {
  yellow: "bg-amber-200 hover:bg-amber-300",
  green: "bg-emerald-200 hover:bg-emerald-300",
  red: "bg-rose-200 hover:bg-rose-300",
  blue: "bg-sky-200 hover:bg-sky-300",
};

const COLOR_TITLE: Record<HighlightColor, string> = {
  yellow: "노랑 하이라이트",
  green: "초록 하이라이트",
  red: "빨강 하이라이트",
  blue: "파랑 하이라이트",
};

// 코멘트 composer 색 swatch — 강사 코멘트 표식(밑줄) 포함 미니 프리뷰.
const CMT_COLOR_TITLE: Record<HighlightColor, string> = {
  yellow: "노랑 코멘트",
  green: "초록 코멘트",
  red: "빨강 코멘트",
  blue: "파랑 코멘트",
};

interface PendingSelection {
  text: string;
  fieldPath: string;
  startOffset: number;
  endOffset: number;
  rect: { top: number; left: number; right: number; bottom: number };
  // 컨테이너에서 읽은 target — multi-article viewer 에서 article 별 저장에 사용
  containerTargetType: string | null;
  containerTargetId: string | null;
  // 본문 위 정확 위치 — selection start 의 가장 가까운 data-block-index + data-cumoffset 에서
  // 계산. 같은 snippet 이 여러 곳에 등장해도 그 자리만 식별 가능하게 하기 위해 메모용으로 캡처.
  blockIndex: number | null;
  cumOffset: number | null;
}

async function digestSha256(text: string): Promise<string> {
  const encoded = new TextEncoder().encode(text);
  const buffer = await crypto.subtle.digest("SHA-256", encoded);
  const bytes = Array.from(new Uint8Array(buffer));
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function captureWithRect(): PendingSelection | null {
  if (typeof window === "undefined") return null;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  if (!sel.toString().trim()) return null;
  const range = sel.getRangeAt(0);
  let node: Node | null = range.startContainer;
  let containerEl: HTMLElement | null = null;
  // 메모용 정확 위치 캡처 — 가장 가까운 data-block-index + data-cumoffset wrapper 찾기.
  let blockIndex: number | null = null;
  let cumOffsetSpan: HTMLElement | null = null;
  while (node) {
    if (node instanceof HTMLElement) {
      if (
        cumOffsetSpan === null &&
        node.dataset.cumoffset !== undefined
      ) {
        cumOffsetSpan = node;
      }
      if (blockIndex === null && node.dataset.blockIndex !== undefined) {
        const v = Number(node.dataset.blockIndex);
        if (Number.isFinite(v)) blockIndex = v;
      }
      if (node.dataset.highlightField) {
        containerEl = node;
        break;
      }
    }
    node = node.parentNode;
  }
  if (!containerEl) return null;
  // cumOffsetSpan 안에서 selection start 까지의 char count 더해 정확 위치 계산.
  let cumOffset: number | null = null;
  if (cumOffsetSpan) {
    const base = Number(cumOffsetSpan.dataset.cumoffset);
    if (Number.isFinite(base)) {
      let offsetInSpan = 0;
      const walker = document.createTreeWalker(
        cumOffsetSpan,
        NodeFilter.SHOW_TEXT,
      );
      let tn = walker.nextNode();
      while (tn) {
        if (tn === range.startContainer) {
          offsetInSpan += range.startOffset;
          cumOffset = base + offsetInSpan;
          break;
        }
        offsetInSpan += tn.nodeValue?.length ?? 0;
        tn = walker.nextNode();
      }
    }
  }
  const info = captureContainerSelection(containerEl);
  if (!info) return null;
  const rect = range.getBoundingClientRect();
  return {
    text: info.text,
    fieldPath: containerEl.dataset.highlightField ?? "document",
    startOffset: info.startOffset,
    endOffset: info.endOffset,
    rect: {
      top: rect.top,
      left: rect.left,
      right: rect.right,
      bottom: rect.bottom,
    },
    containerTargetType: containerEl.dataset.highlightTargetType ?? null,
    containerTargetId: containerEl.dataset.highlightTargetId ?? null,
    blockIndex,
    cumOffset,
  };
}

// rect 의 위쪽 가운데 기준으로 화면 안에 맞춰 toolbar 위치 계산.
function placeToolbar(
  rect: PendingSelection["rect"],
  width: number,
  height: number,
): { top: number; left: number } {
  const left = Math.max(
    8,
    Math.min(
      window.innerWidth - width - 8,
      rect.left + (rect.right - rect.left) / 2 - width / 2,
    ),
  );
  const top =
    rect.top - height - 8 < 8 ? rect.bottom + 8 : rect.top - height - 8;
  return { top, left };
}

export function HighlightToolbar({
  targetType,
  targetId,
  staff = false,
}: {
  // multi-article viewer 에선 prop 미지정 — selection 컨테이너의 dataset 으로 결정.
  targetType?: AnnotationTargetType;
  targetId?: string;
  // staff(강사/원장) 면 "코멘트" 액션 노출 — 하이라이트형 코멘트 게시.
  staff?: boolean;
}) {
  const fetcher = useFetcher();
  const [pending, setPending] = useState<PendingSelection | null>(null);
  // 마지막 비-null pending 보관 — selectionchange 가 click 직전에 null 로 갱신되는 케이스 보호
  const lastPendingRef = useRef<PendingSelection | null>(null);
  // 코멘트 composer 가 열리면 그 시점 selection 을 freeze — 메모 입력 시 selection collapse 보호.
  const [composing, setComposing] = useState<PendingSelection | null>(null);

  useEffect(() => {
    const handler = () => {
      // composer 가 열려 있는 동안엔 selection 변화를 무시 (frozen).
      if (composing) return;
      const info = captureWithRect();
      if (info) {
        setPending(info);
        lastPendingRef.current = info;
      } else {
        setPending(null);
      }
    };
    document.addEventListener("selectionchange", handler);
    return () => document.removeEventListener("selectionchange", handler);
  }, [composing]);

  // 저장 성공 시 toolbar/composer 닫고 selection 해제
  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data &&
      typeof fetcher.data === "object" &&
      "ok" in fetcher.data &&
      fetcher.data.ok
    ) {
      setPending(null);
      setComposing(null);
      lastPendingRef.current = null;
      window.getSelection()?.removeAllRanges();
    }
  }, [fetcher.state, fetcher.data]);

  const handlePickColor = async (color: HighlightColor) => {
    const target = pending ?? lastPendingRef.current;
    if (!target) return;
    // 우선순위: prop > selection container dataset
    const effTargetType = targetType ?? target.containerTargetType;
    const effTargetId = targetId ?? target.containerTargetId;
    if (!effTargetType || !effTargetId) return;
    const contentHash = await digestSha256(target.text);
    const fd = new FormData();
    fd.set("intent", "create");
    fd.set("targetType", effTargetType);
    fd.set("targetId", effTargetId);
    fd.set("fieldPath", target.fieldPath);
    fd.set("startOffset", String(target.startOffset));
    fd.set("endOffset", String(target.endOffset));
    fd.set("contentHash", contentHash);
    fd.set("color", color);
    fd.set("excerpt", target.text);
    fetcher.submit(fd, {
      method: "post",
      action: "/api/annotations/highlight",
    });
  };

  const handleMemo = () => {
    const target = pending ?? lastPendingRef.current;
    if (!target) return;
    const effTargetType = targetType ?? target.containerTargetType;
    const effTargetId = targetId ?? target.containerTargetId;
    if (!effTargetType || !effTargetId) return;
    dispatchMemoSnippet({
      snippet: target.text,
      targetType: effTargetType,
      targetId: effTargetId,
      blockIndex: target.blockIndex,
      cumOffset: target.cumOffset,
    });
    // toolbar 닫고 selection 해제 (메모 입력으로 focus 이동될 것)
    setPending(null);
    lastPendingRef.current = null;
    window.getSelection()?.removeAllRanges();
  };

  // composer 가 열려 있으면 composer 를, 아니면 selection 이 있을 때 색상 툴바를 렌더.
  if (composing) {
    return (
      <CommentComposer
        selection={composing}
        fetcher={fetcher}
        propTargetType={targetType}
        propTargetId={targetId}
        onCancel={() => {
          setComposing(null);
          setPending(null);
          lastPendingRef.current = null;
          window.getSelection()?.removeAllRanges();
        }}
      />
    );
  }

  if (!pending) return null;

  // 화면 위치 계산. staff 면 코멘트 버튼이 추가돼 너비를 늘린다.
  const TOOLBAR_W = staff ? 250 : 208;
  const TOOLBAR_H = 36;
  const { top, left } = placeToolbar(pending.rect, TOOLBAR_W, TOOLBAR_H);
  const submitting = fetcher.state !== "idle";

  return (
    <div
      role="toolbar"
      aria-label="하이라이트 색상 선택"
      data-testid="highlight-toolbar"
      className="bg-popover text-popover-foreground fixed z-50 flex items-center gap-1 rounded-md border p-1 shadow-md"
      style={{ top, left, width: TOOLBAR_W, height: TOOLBAR_H }}
    >
      {HIGHLIGHT_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={COLOR_TITLE[c]}
          title={COLOR_TITLE[c]}
          disabled={submitting}
          // mousedown 으로 처리 — click 전에 selection 손실 방지
          onMouseDown={(e) => {
            e.preventDefault();
            handlePickColor(c);
          }}
          className={cn(
            "size-7 rounded border border-black/10 transition-colors disabled:opacity-50",
            COLOR_BTN[c],
          )}
        />
      ))}
      <span className="bg-border mx-0.5 h-5 w-px" aria-hidden />
      <button
        type="button"
        aria-label="이 단어로 메모 추가"
        title="이 단어로 메모 추가"
        onMouseDown={(e) => {
          e.preventDefault();
          handleMemo();
        }}
        className="hover:bg-accent inline-flex size-7 items-center justify-center rounded text-amber-600 transition-colors dark:text-amber-400"
      >
        <NotebookPenIcon className="size-4" />
      </button>
      {staff ? (
        <button
          type="button"
          aria-label="코멘트로 게시"
          title="선택 구간을 강사 코멘트로 게시 (전체 학생 노출)"
          data-testid="highlight-toolbar-comment"
          onMouseDown={(e) => {
            e.preventDefault();
            // composer 로 전환 — 현재 selection 을 freeze.
            const target = pending ?? lastPendingRef.current;
            if (target) setComposing(target);
          }}
          className="hover:bg-accent inline-flex h-7 items-center gap-1 rounded px-1.5 text-xs font-medium text-primary transition-colors"
        >
          <MessageSquarePlusIcon className="size-4" />
          코멘트
        </button>
      ) : null}
    </div>
  );
}

// ── 하이라이트형 코멘트 composer ──────────────────────────────────────────────
// freeze 된 selection 으로 색 + (선택) 메모를 받아 /api/comments/comment 로 게시.
function CommentComposer({
  selection,
  fetcher,
  propTargetType,
  propTargetId,
  onCancel,
}: {
  selection: PendingSelection;
  fetcher: ReturnType<typeof useFetcher>;
  propTargetType?: AnnotationTargetType;
  propTargetId?: string;
  onCancel: () => void;
}) {
  const [color, setColor] = useState<HighlightColor>("yellow");
  const [memo, setMemo] = useState("");
  const submitting = fetcher.state !== "idle";
  const error =
    fetcher.data &&
    typeof fetcher.data === "object" &&
    "error" in fetcher.data &&
    typeof (fetcher.data as { error?: unknown }).error === "string"
      ? (fetcher.data as { error: string }).error
      : null;

  const effTargetType = propTargetType ?? selection.containerTargetType;
  const effTargetId = propTargetId ?? selection.containerTargetId;

  const handlePost = async () => {
    if (!effTargetType || !effTargetId) return;
    const contentHash = await digestSha256(selection.text);
    const fd = new FormData();
    fd.set("intent", "create");
    fd.set("targetType", effTargetType);
    fd.set("targetId", effTargetId);
    fd.set("fieldPath", selection.fieldPath);
    fd.set("startOffset", String(selection.startOffset));
    fd.set("endOffset", String(selection.endOffset));
    fd.set("contentHash", contentHash);
    fd.set("color", color);
    fd.set("label", selection.text);
    if (memo.trim().length > 0) fd.set("bodyMd", memo.trim());
    fetcher.submit(fd, { method: "post", action: "/api/comments/comment" });
  };

  // 너비가 더 넓은 패널 — selection rect 기준 위치.
  const PANEL_W = 288;
  const PANEL_H = 200;
  const { top, left } = placeToolbar(selection.rect, PANEL_W, PANEL_H);
  const blocked = !effTargetType || !effTargetId;

  return (
    <div
      role="dialog"
      aria-label="하이라이트형 코멘트 작성"
      data-testid="comment-highlight-composer"
      className="bg-popover text-popover-foreground fixed z-50 flex flex-col gap-2 rounded-md border p-3 shadow-lg"
      style={{ top, left, width: PANEL_W }}
    >
      <p className="text-xs font-semibold">코멘트로 게시</p>
      {/* 발췌 미리보기 */}
      <p
        className={cn(
          "max-h-16 overflow-y-auto rounded-sm border px-2 py-1 text-xs leading-relaxed",
          CMT_PREVIEW[color],
        )}
      >
        {selection.text}
      </p>
      {/* 색 선택 */}
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground text-[11px]">색상</span>
        {HIGHLIGHT_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={CMT_COLOR_TITLE[c]}
            aria-pressed={color === c}
            title={CMT_COLOR_TITLE[c]}
            onMouseDown={(e) => {
              e.preventDefault();
              setColor(c);
            }}
            className={cn(
              "size-6 rounded border transition-colors",
              COLOR_BTN[c],
              color === c
                ? "border-foreground ring-2 ring-foreground/30"
                : "border-black/10",
            )}
          />
        ))}
      </div>
      {/* 선택 메모 */}
      <textarea
        name="bodyMd"
        rows={3}
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        placeholder="설명 메모 (선택) — 비워두면 하이라이트만 게시됩니다"
        className="border-input bg-background focus-visible:ring-ring resize-none rounded-md border px-2 py-1.5 text-xs leading-relaxed focus-visible:ring-1 focus-visible:outline-none"
      />
      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
      {blocked ? (
        <p className="text-xs text-rose-600">
          코멘트 대상을 찾을 수 없습니다.
        </p>
      ) : null}
      <div className="flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="hover:bg-accent rounded px-2 py-1 text-xs transition-colors disabled:opacity-50"
        >
          취소
        </button>
        <button
          type="button"
          onClick={handlePost}
          disabled={submitting || blocked}
          data-testid="comment-highlight-post"
          className="bg-primary text-primary-foreground hover:bg-primary/90 rounded px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50"
        >
          {submitting ? "게시 중…" : "게시"}
        </button>
      </div>
    </div>
  );
}

// composer 안 발췌 미리보기 박스 — 코멘트 색 틴트.
const CMT_PREVIEW: Record<HighlightColor, string> = {
  yellow:
    "border-amber-300 bg-amber-100/70 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100",
  green:
    "border-emerald-300 bg-emerald-100/70 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-100",
  red: "border-rose-300 bg-rose-100/70 text-rose-900 dark:bg-rose-900/30 dark:text-rose-100",
  blue: "border-sky-300 bg-sky-100/70 text-sky-900 dark:bg-sky-900/30 dark:text-sky-100",
};
