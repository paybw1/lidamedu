import { Trash2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import { cn } from "~/core/lib/utils";

import {
  HIGHLIGHT_COLORS,
  type AnnotationTargetType,
  type HighlightColor,
  type HighlightRecord,
} from "../labels";

const COLOR_CLASS: Record<HighlightColor, string> = {
  green: "bg-emerald-200 text-emerald-900 border-emerald-300",
  yellow: "bg-amber-200 text-amber-900 border-amber-300",
  red: "bg-rose-200 text-rose-900 border-rose-300",
  blue: "bg-sky-200 text-sky-900 border-sky-300",
};

const COLOR_LABEL: Record<HighlightColor, string> = {
  green: "초록",
  yellow: "노랑",
  red: "빨강",
  blue: "파랑",
};

async function digestSha256(text: string): Promise<string> {
  const encoded = new TextEncoder().encode(text);
  const buffer = await crypto.subtle.digest("SHA-256", encoded);
  const bytes = Array.from(new Uint8Array(buffer));
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface SelectionInfo {
  text: string;
  fieldPath: string;
  startOffset: number;
  endOffset: number;
}

function captureSelection(): SelectionInfo | null {
  if (typeof window === "undefined") return null;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const text = selection.toString().trim();
  if (!text) return null;
  const range = selection.getRangeAt(0);
  // field_path: 가장 가까운 [data-highlight-field] 값. 없으면 'document'
  let node: Node | null = range.startContainer;
  let fieldPath = "document";
  while (node && node.nodeType !== Node.ELEMENT_NODE) node = node.parentNode;
  while (node) {
    if (node instanceof HTMLElement && node.dataset.highlightField) {
      fieldPath = node.dataset.highlightField;
      break;
    }
    node = node.parentNode;
  }
  return {
    text,
    fieldPath,
    startOffset: range.startOffset,
    endOffset: range.startOffset + text.length,
  };
}

export function HighlightList({
  targetType,
  targetId,
  initial,
}: {
  targetType: AnnotationTargetType;
  targetId: string;
  initial: HighlightRecord[];
}) {
  const createFetcher = useFetcher();
  const deleteFetcher = useFetcher();
  const [pending, setPending] = useState<SelectionInfo | null>(null);

  // 본문에서 텍스트 선택 시 pending 갱신
  useEffect(() => {
    const handler = () => {
      const info = captureSelection();
      setPending(info);
    };
    document.addEventListener("selectionchange", handler);
    return () => document.removeEventListener("selectionchange", handler);
  }, []);

  // 저장 성공 시 pending 비우기
  useEffect(() => {
    if (createFetcher.state === "idle" && createFetcher.data?.ok) {
      setPending(null);
      window.getSelection()?.removeAllRanges();
    }
  }, [createFetcher.state, createFetcher.data]);

  const submit = async (color: HighlightColor) => {
    if (!pending) return;
    const contentHash = await digestSha256(pending.text);
    const fd = new FormData();
    fd.set("intent", "create");
    fd.set("targetType", targetType);
    fd.set("targetId", targetId);
    fd.set("fieldPath", pending.fieldPath);
    fd.set("startOffset", String(pending.startOffset));
    fd.set("endOffset", String(pending.endOffset));
    fd.set("contentHash", contentHash);
    fd.set("color", color);
    fd.set("excerpt", pending.text);
    createFetcher.submit(fd, {
      method: "post",
      action: "/api/annotations/highlight",
    });
  };

  const isSubmitting = createFetcher.state !== "idle";
  const deletingId =
    deleteFetcher.formData?.get("intent") === "delete"
      ? String(deleteFetcher.formData.get("highlightId"))
      : null;
  const visible = initial.filter((h) => h.highlightId !== deletingId);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <p className="text-xs font-medium">새 하이라이트</p>
        {pending ? (
          <div className="space-y-2 rounded-md border p-2">
            <p className="text-sm leading-relaxed">
              <span className="bg-muted/60 rounded px-1 py-0.5">
                {pending.text}
              </span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {HIGHLIGHT_COLORS.map((c) => (
                <Button
                  key={c}
                  size="sm"
                  variant="outline"
                  disabled={isSubmitting}
                  onClick={() => submit(c)}
                  className={cn("h-7 px-2 text-xs", COLOR_CLASS[c])}
                >
                  {COLOR_LABEL[c]}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground text-xs leading-relaxed">
            본문에서 저장할 텍스트를 드래그하면 색상 버튼이 활성화됩니다.
            (인라인 오버레이 렌더링은 추후 작업)
          </p>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium">
          저장된 하이라이트
          {visible.length > 0 ? (
            <span className="text-muted-foreground ml-1 tabular-nums">
              {visible.length}
            </span>
          ) : null}
        </p>
        {visible.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            아직 저장된 하이라이트가 없습니다.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {visible.map((h) => (
              <li
                key={h.highlightId}
                className={cn(
                  "group flex items-start gap-2 rounded-md border p-2 text-xs leading-relaxed",
                  COLOR_CLASS[h.color],
                )}
              >
                <span className="flex-1">{h.excerpt || "(발췌 없음)"}</span>
                <deleteFetcher.Form
                  method="post"
                  action="/api/annotations/highlight"
                >
                  <input type="hidden" name="intent" value="delete" />
                  <input type="hidden" name="highlightId" value={h.highlightId} />
                  <button
                    type="submit"
                    aria-label="하이라이트 삭제"
                    className="hover:text-foreground opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <Trash2Icon className="size-3.5" />
                  </button>
                </deleteFetcher.Form>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
