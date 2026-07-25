// 조문 뷰어 인라인 빈칸 편집(staff) — admin-blanks-all 의 드래그 캡처를 단일 조문에 경량 이식.
//   본문 드래그 → "새 빈칸"(/api/blanks/admin-add-blank — 내 세트 find-or-create),
//   빈칸 chip 클릭 → "빈칸 제거"(/api/blanks/admin-remove-blank).
//   ★항상 '내(owner)' 세트만 편집 — 타 강사 세트 수정은 기존 fork(내 자료로 복사) 정책 유지.
//   위치 캡처 규칙(blockHint/blockIndex/cumOffset + ±80자 hint)은 admin-blanks-all 과 동일.
import { useCallback, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { PlusCircleIcon, XIcon } from "lucide-react";

import type { ArticleBody } from "~/features/laws/lib/article-body";
import type { BlankItem } from "~/features/blanks/queries.server";
import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";
import { ArticleBodyView } from "~/features/laws/components/article-body";

import { AdminBlanksRenderProvider } from "./admin-blanks-render-provider";

// rangeRoot 안의 모든 text node 를 walk 해 cumulative text + range start/end offset 계산,
// ±contextLen 글자를 hint 로 반환(admin-blanks-all 과 동일 규칙).
function captureRangeContext(
  rangeRoot: Node,
  range: Range,
  contextLen: number,
): { beforeHint: string; afterHint: string } {
  if (typeof document === "undefined") return { beforeHint: "", afterHint: "" };
  const walker = document.createTreeWalker(rangeRoot, NodeFilter.SHOW_TEXT);
  let cumulative = "";
  let startOffset = -1;
  let endOffset = -1;
  let node = walker.nextNode();
  while (node) {
    if (node === range.startContainer) {
      startOffset = cumulative.length + range.startOffset;
    }
    if (node === range.endContainer) {
      endOffset = cumulative.length + range.endOffset;
    }
    cumulative += node.nodeValue ?? "";
    node = walker.nextNode();
  }
  if (startOffset < 0 || endOffset < 0) {
    return { beforeHint: "", afterHint: "" };
  }
  return {
    beforeHint: cumulative.slice(
      Math.max(0, startOffset - contextLen),
      startOffset,
    ),
    afterHint: cumulative.slice(
      endOffset,
      Math.min(cumulative.length, endOffset + contextLen),
    ),
  };
}

interface Selection {
  text: string;
  beforeHint: string;
  afterHint: string;
  blockHint: string | null;
  blockIndex: number | null;
  cumOffset: number | null;
  top: number;
  left: number;
}

interface PendingRemove {
  idx: number;
  answer: string;
  top: number;
  left: number;
}

export function ArticleBlankEditOverlay({
  articleId,
  mySet,
  body,
  titleMap,
  lawCode,
}: {
  articleId: string;
  mySet: { setId: string; blanks: BlankItem[] } | null;
  body: ArticleBody;
  titleMap: Map<string, string>;
  lawCode: LawSubjectSlug;
}) {
  const fetcher = useFetcher<{ ok: boolean; error?: string }>();
  const busy = fetcher.state !== "idle";
  const error = fetcher.data && !fetcher.data.ok ? fetcher.data.error : null;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [pendingRemove, setPendingRemove] = useState<PendingRemove | null>(null);

  const captureSelection = useCallback(() => {
    if (typeof window === "undefined") return;
    const root = containerRef.current;
    const sel = window.getSelection();
    if (!root || !sel || sel.rangeCount === 0) {
      setSelection(null);
      return;
    }
    const text = sel.toString().trim();
    if (!text || text.length > 500) {
      setSelection(null);
      return;
    }
    const range = sel.getRangeAt(0);
    // 이 조문 컨테이너 안에서 시작해야 함 + blockHint/blockIndex/cumOffset 캡처(admin-blanks-all 동일).
    let n: Node | null = range.startContainer;
    let inside = false;
    let blockHint: string | null = null;
    let blockIndex: number | null = null;
    let cumOffsetSpan: HTMLElement | null = null;
    while (n) {
      if (n === root) {
        inside = true;
        break;
      }
      if (n.nodeType === 1) {
        const el = n as HTMLElement;
        if (cumOffsetSpan === null && el.dataset?.cumoffset !== undefined) {
          cumOffsetSpan = el;
        }
        if (blockIndex === null && el.dataset?.blockIndex !== undefined) {
          const v = Number(el.dataset.blockIndex);
          if (Number.isFinite(v)) blockIndex = v;
        }
        const id = el.id;
        if (!blockHint && id && /^(clause|item|sub)-/.test(id)) {
          blockHint = id;
        }
      }
      n = n.parentNode;
    }
    if (!inside) {
      setSelection(null);
      return;
    }
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
    const { beforeHint, afterHint } = captureRangeContext(root, range, 80);
    const rect = range.getBoundingClientRect();
    setPendingRemove(null);
    setSelection({
      text,
      beforeHint,
      afterHint,
      blockHint,
      blockIndex,
      cumOffset,
      top: rect.bottom + 6,
      left: rect.left,
    });
  }, []);

  const addBlank = useCallback(() => {
    if (!selection) return;
    const fd = new FormData();
    // 세트가 이미 있으면 '그 세트'에 직접 추가(편집 대상=풀기 대상 일치). 없으면 articleId 로
    //   자동 생성. 민법 공동 편집은 상위에서 표시 중인 공유 세트를 mySet 으로 넘겨준다.
    if (mySet) fd.set("setId", mySet.setId);
    else fd.set("articleId", articleId);
    fd.set("selectionText", selection.text);
    fd.set("beforeHint", selection.beforeHint);
    fd.set("afterHint", selection.afterHint);
    if (selection.blockHint) fd.set("blockHint", selection.blockHint);
    if (selection.blockIndex !== null)
      fd.set("blockIndex", String(selection.blockIndex));
    if (selection.cumOffset !== null)
      fd.set("cumOffset", String(selection.cumOffset));
    fetcher.submit(fd, { method: "post", action: "/api/blanks/admin-add-blank" });
    if (typeof window !== "undefined") window.getSelection()?.removeAllRanges();
    setSelection(null);
  }, [selection, articleId, mySet, fetcher]);

  // 빈칸 chip 클릭 → 그 위치에 제거 확인 버튼.
  const onChipClick = useCallback(
    (idx: number) => {
      if (!mySet) return;
      const blank = mySet.blanks.find((b) => b.idx === idx);
      if (!blank) return;
      const el =
        typeof document !== "undefined"
          ? containerRef.current?.querySelector(`[data-blank-idx="${idx}"]`)
          : null;
      const rect = el?.getBoundingClientRect();
      setSelection(null);
      setPendingRemove({
        idx,
        answer: blank.answer,
        top: (rect?.bottom ?? 100) + 6,
        left: rect?.left ?? 100,
      });
    },
    [mySet],
  );

  const removeBlank = useCallback(() => {
    if (!mySet || !pendingRemove) return;
    const fd = new FormData();
    fd.set("setId", mySet.setId);
    fd.set("blankIdx", String(pendingRemove.idx));
    fetcher.submit(fd, {
      method: "post",
      action: "/api/blanks/admin-remove-blank",
    });
    setPendingRemove(null);
  }, [mySet, pendingRemove, fetcher]);

  const drafts: Record<number, string> = {};
  for (const b of mySet?.blanks ?? []) drafts[b.idx] = b.answer;

  return (
    <div className="border-primary/40 space-y-3 rounded-xl border-2 border-dashed p-4">
      <div className="bg-primary/5 flex flex-wrap items-center gap-3 rounded-md px-3 py-2 text-xs">
        <span className="text-link font-bold">빈칸 편집 모드</span>
        <span className="text-muted-foreground">
          본문을 드래그해 빈칸 추가 · 빈칸을 클릭해 제거 — 내 자료
          {mySet ? "" : " (첫 빈칸 추가 시 자동 생성)"}를 편집합니다
        </span>
        {busy ? <span className="text-muted-foreground ml-auto">저장 중…</span> : null}
        {error ? (
          <span className="text-destructive ml-auto font-semibold">{error}</span>
        ) : null}
      </div>

      <div
        ref={containerRef}
        onMouseUp={captureSelection}
        data-blank-edit-root=""
      >
        {mySet ? (
          <AdminBlanksRenderProvider
            setId={mySet.setId}
            blanks={mySet.blanks}
            drafts={drafts}
            activeIdx={pendingRemove?.idx ?? null}
            onActivate={onChipClick}
            body={body}
          >
            <ArticleBodyView
              body={body}
              titleMap={titleMap}
              subtitlesOnly={false}
              lawCode={lawCode}
            />
          </AdminBlanksRenderProvider>
        ) : (
          <ArticleBodyView
            body={body}
            titleMap={titleMap}
            subtitlesOnly={false}
            lawCode={lawCode}
          />
        )}
      </div>

      {selection ? (
        <button
          type="button"
          className="fixed z-50 inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-xs font-bold text-white shadow-lg hover:bg-emerald-700 disabled:opacity-50"
          style={{ top: selection.top, left: selection.left }}
          disabled={busy}
          onMouseDown={(e) => {
            e.preventDefault();
            addBlank();
          }}
          title="이 위치에 새 빈칸"
        >
          <PlusCircleIcon className="size-3" />새 빈칸 ({selection.text.length}자)
        </button>
      ) : null}
      {pendingRemove ? (
        <button
          type="button"
          className="bg-destructive fixed z-50 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold text-white shadow-lg hover:opacity-90 disabled:opacity-50"
          style={{ top: pendingRemove.top, left: pendingRemove.left }}
          disabled={busy}
          onMouseDown={(e) => {
            e.preventDefault();
            removeBlank();
          }}
          title="이 빈칸을 내 자료에서 제거"
        >
          <XIcon className="size-3" />
          빈칸 제거 “
          {pendingRemove.answer.length > 10
            ? `${pendingRemove.answer.slice(0, 10)}…`
            : pendingRemove.answer}
          ”
        </button>
      ) : null}
    </div>
  );
}
