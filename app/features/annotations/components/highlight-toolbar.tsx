// 본문에서 텍스트 선택 시 selection rect 위에 떠오르는 색상 선택 툴바.
// 클릭 시 즉시 저장 (POST /api/annotations/highlight) 후 툴바 닫힘.
// 강사·수험생 동일 — 강사가 만든 하이라이트/포스트잇은 RLS 가 전체 공개로 처리한다.
//
// feat-3-207 — 5번째 옵션 "밑줄"(underline) 추가. 배경 없이 텍스트 데코레이션만.
// staff RLS 는 기존 색상들과 동일 — staff 가 그으면 모든 학생에게 노출.
//
// 주의: 색상 버튼 클릭 시 selection 이 사라지지 않도록 onMouseDown + preventDefault 사용.
import { NotebookPenIcon, UnderlineIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";

import { cn } from "~/core/lib/utils";

import {
  type AnnotationTargetType,
  HIGHLIGHT_COLORS,
  HIGHLIGHT_COLOR_DEFAULT_LABEL,
  highlightColorLabel,
  isUnderlineColor,
  type HighlightColor,
} from "../labels";
import {
  captureContainerSelection,
  containerText,
} from "../lib/highlight-dom";
import { dispatchMemoSnippet } from "../lib/memo-selection-event";
import { useHighlightAliases } from "../lib/use-highlight-aliases";

const COLOR_BTN: Partial<Record<HighlightColor, string>> = {
  yellow: "bg-amber-200 hover:bg-amber-300",
  green: "bg-emerald-200 hover:bg-emerald-300",
  red: "bg-rose-200 hover:bg-rose-300",
  blue: "bg-sky-200 hover:bg-sky-300",
};

// 밑줄 변형 버튼 — "가" 글자에 해당 색·굵기의 밑줄 데코 미리보기.
const UNDERLINE_BTN: Partial<Record<HighlightColor, string>> = {
  underline: "underline decoration-current decoration-[1.5px] underline-offset-2",
  underline_thick: "underline decoration-current decoration-[3px] underline-offset-2",
  underline_orange:
    "underline decoration-amber-600 decoration-[1.5px] underline-offset-2",
  underline_orange_thick:
    "underline decoration-amber-600 decoration-[3px] underline-offset-2",
  underline_blue:
    "underline decoration-sky-500 decoration-[1.5px] underline-offset-2",
  underline_blue_thick:
    "underline decoration-sky-500 decoration-[3px] underline-offset-2",
};
const UNDERLINE_VARIANTS = Object.keys(UNDERLINE_BTN) as HighlightColor[];

// 기본 색 이름 기반 swatch title — alias 가 있으면 그 위에 prepend.
function swatchTitle(color: HighlightColor, alias: string | undefined): string {
  const base = isUnderlineColor(color)
    ? HIGHLIGHT_COLOR_DEFAULT_LABEL[color]
    : `${HIGHLIGHT_COLOR_DEFAULT_LABEL[color]} 하이라이트`;
  const aliasTrim = alias?.trim();
  return aliasTrim ? `${aliasTrim} · ${base}` : base;
}

// 배경 색상 버튼 list — 밑줄 계열은 서브메뉴에서 별도 렌더.
const SWATCH_COLORS = HIGHLIGHT_COLORS.filter((c) => !isUnderlineColor(c));

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
  // 자동 재앵커링용 컨텍스트(Phase 2) — 본문 수정 시 단일 매치 탐색에 사용.
  // 선택 시점의 컨테이너 textContent 에서 직접 추출(30자).
  beforeCtx: string;
  afterCtx: string;
}

const REANCHOR_CTX_CHARS = 30;

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
      if (cumOffsetSpan === null && node.dataset.cumoffset !== undefined) {
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
  // 자동 재앵커링용 컨텍스트 — 선택 시점에 30자씩 추출. 본문 수정 후 새 위치를
  // before+snippet+after 단일 매치로 찾는다.
  const full = containerText(containerEl);
  const beforeCtx = full.slice(
    Math.max(0, info.startOffset - REANCHOR_CTX_CHARS),
    info.startOffset,
  );
  const afterCtx = full.slice(
    info.endOffset,
    info.endOffset + REANCHOR_CTX_CHARS,
  );
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
    beforeCtx,
    afterCtx,
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
}: {
  // multi-article viewer 에선 prop 미지정 — selection 컨테이너의 dataset 으로 결정.
  targetType?: AnnotationTargetType;
  targetId?: string;
}) {
  const fetcher = useFetcher();
  const aliases = useHighlightAliases();
  const [pending, setPending] = useState<PendingSelection | null>(null);
  // 밑줄 변형(색·굵기) 서브메뉴 — 밑줄 아이콘 클릭 시 두 번째 줄로 펼침.
  const [ulOpen, setUlOpen] = useState(false);
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
        setUlOpen(false);
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
      setUlOpen(false);
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
    fd.set("snippet", target.text);
    fd.set("beforeCtx", target.beforeCtx);
    fd.set("afterCtx", target.afterCtx);
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
    // toolbar 닫고 selection 해제 (포스트잇 입력으로 focus 이동될 것)
    setPending(null);
    lastPendingRef.current = null;
    window.getSelection()?.removeAllRanges();
  };

  if (!pending) return null;

  // 4색 + 밑줄 1 + divider + 포스트잇 1 = 색 7개 너비. 색 4 × 28 + (밑줄·메모) 2 × 28 + divider 1 + padding ≈ 240.
  const TOOLBAR_W = 240;
  const TOOLBAR_H = ulOpen ? 72 : 36; // 밑줄 서브메뉴 열리면 두 줄.
  const { top, left } = placeToolbar(pending.rect, TOOLBAR_W, TOOLBAR_H);
  const submitting = fetcher.state !== "idle";

  return (
    <div
      role="toolbar"
      aria-label="하이라이트 색상 선택"
      data-testid="highlight-toolbar"
      className="bg-popover text-popover-foreground fixed z-50 flex flex-col gap-1 rounded-md border p-1 shadow-md"
      style={{ top, left, width: TOOLBAR_W, height: TOOLBAR_H }}
    >
      <div className="flex items-center gap-1">
        {SWATCH_COLORS.map((c) => {
          const t = swatchTitle(c, aliases[c]);
          return (
            <button
              key={c}
              type="button"
              aria-label={t}
              title={t}
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
          );
        })}
        <button
          key="underline"
          type="button"
          aria-label="밑줄 종류 선택"
          title="밑줄 — 색·굵기 선택"
          aria-expanded={ulOpen}
          disabled={submitting}
          onMouseDown={(e) => {
            e.preventDefault();
            setUlOpen((v) => !v);
          }}
          className={cn(
            "hover:bg-accent text-foreground inline-flex size-7 items-center justify-center rounded border border-black/10 transition-colors disabled:opacity-50",
            ulOpen && "bg-accent",
          )}
        >
          <UnderlineIcon className="size-4" />
        </button>
        <span className="bg-border mx-0.5 h-5 w-px" aria-hidden />
        <button
          type="button"
          aria-label="이 단어로 포스트잇 추가"
          title="이 단어로 포스트잇 추가"
          onMouseDown={(e) => {
            e.preventDefault();
            handleMemo();
          }}
          className="hover:bg-accent inline-flex size-7 items-center justify-center rounded text-amber-600 transition-colors dark:text-amber-400"
        >
          <NotebookPenIcon className="size-4" />
        </button>
      </div>
      {ulOpen ? (
        <div className="flex items-center gap-1" data-testid="underline-variants">
          {UNDERLINE_VARIANTS.map((c) => {
            const t = swatchTitle(c, aliases[c]);
            return (
              <button
                key={c}
                type="button"
                aria-label={t}
                title={t}
                disabled={submitting}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handlePickColor(c);
                }}
                className="hover:bg-accent text-foreground inline-flex h-7 w-8 items-center justify-center rounded border border-black/10 text-[14px] leading-none transition-colors disabled:opacity-50"
              >
                <span className={UNDERLINE_BTN[c]}>가</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
