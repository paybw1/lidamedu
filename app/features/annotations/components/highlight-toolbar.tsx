// 본문에서 텍스트 선택 시 selection rect 위에 떠오르는 색상 선택 툴바.
// 클릭 시 즉시 저장 (POST /api/annotations/highlight) 후 툴바 닫힘.
//
// 주의: 색상 버튼 클릭 시 selection 이 사라지지 않도록 onMouseDown + preventDefault 사용.

import { NotebookPenIcon } from "lucide-react";
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

export function HighlightToolbar({
  targetType,
  targetId,
}: {
  // multi-article viewer 에선 prop 미지정 — selection 컨테이너의 dataset 으로 결정.
  targetType?: AnnotationTargetType;
  targetId?: string;
}) {
  const fetcher = useFetcher();
  const [pending, setPending] = useState<PendingSelection | null>(null);
  // 마지막 비-null pending 보관 — selectionchange 가 click 직전에 null 로 갱신되는 케이스 보호
  const lastPendingRef = useRef<PendingSelection | null>(null);

  useEffect(() => {
    const handler = () => {
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
  }, []);

  // 저장 성공 시 toolbar 닫고 selection 해제
  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data &&
      typeof fetcher.data === "object" &&
      "ok" in fetcher.data &&
      fetcher.data.ok
    ) {
      setPending(null);
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

  if (!pending) return null;

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

  // 화면 위치 계산 (selection rect 의 위쪽 가운데). 메모 버튼 추가로 너비 늘림.
  const TOOLBAR_W = 208;
  const TOOLBAR_H = 36;
  const left = Math.max(
    8,
    Math.min(
      window.innerWidth - TOOLBAR_W - 8,
      pending.rect.left + (pending.rect.right - pending.rect.left) / 2 -
        TOOLBAR_W / 2,
    ),
  );
  const top =
    pending.rect.top - TOOLBAR_H - 8 < 8
      ? pending.rect.bottom + 8
      : pending.rect.top - TOOLBAR_H - 8;

  const submitting = fetcher.state !== "idle";

  return (
    <div
      role="toolbar"
      aria-label="하이라이트 색상 선택"
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
    </div>
  );
}
