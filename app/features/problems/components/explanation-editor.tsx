// 운영자 — 해설 markdown 에디터.
// textarea + 미리보기 + toolbar(표·이미지·강조) + drag-drop / paste 이미지 업로드.

import { BoldIcon, ImageIcon, ItalicIcon, TableIcon } from "lucide-react";
import { useRef, useState } from "react";
import { useFetcher } from "react-router";
import { toast } from "sonner";

import { Textarea } from "~/core/components/ui/textarea";
import { cn } from "~/core/lib/utils";
import { MarkdownView } from "~/features/problems/components/markdown-view";

const TABLE_TEMPLATE = "| 구분 | 내용 |\n| --- | --- |\n| 행1 |  |\n| 행2 |  |";

export function ExplanationEditor({
  name = "explanationMd",
  defaultValue = "",
  rows = 10,
}: {
  name?: string;
  defaultValue?: string;
  rows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [text, setText] = useState<string>(defaultValue);
  const [showPreview, setShowPreview] = useState<boolean>(true);
  const [dragOver, setDragOver] = useState<boolean>(false);
  const upload = useFetcher<{ ok?: boolean; url?: string; error?: string }>();
  const isUploading = upload.state !== "idle";

  function insertAtCursor(insert: string) {
    const ta = ref.current;
    if (!ta) {
      setText((t) => t + insert);
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const before = text.slice(0, start);
    const sel = text.slice(start, end);
    const after = text.slice(end);
    const next = before + insert + after;
    setText(next);
    requestAnimationFrame(() => {
      if (ref.current) {
        ref.current.focus();
        const pos = before.length + insert.length;
        ref.current.setSelectionRange(pos, pos);
      }
    });
    return sel;
  }

  function wrapSelection(left: string, right: string) {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const before = text.slice(0, start);
    const sel = text.slice(start, end) || "텍스트";
    const after = text.slice(end);
    const next = before + left + sel + right + after;
    setText(next);
    requestAnimationFrame(() => {
      if (ref.current) {
        ref.current.focus();
        ref.current.setSelectionRange(before.length + left.length, before.length + left.length + sel.length);
      }
    });
  }

  async function uploadFiles(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/problems/upload-explanation-image", { method: "POST", body: fd });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string };
      if (json.ok && json.url) {
        insertAtCursor(`\n\n![](${json.url})\n\n`);
        toast.success("이미지 업로드됨");
      } else {
        toast.error(json.error ?? "업로드 실패");
      }
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1">
        <ToolbarButton title="굵게" onClick={() => wrapSelection("**", "**")}>
          <BoldIcon className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton title="이탤릭" onClick={() => wrapSelection("*", "*")}>
          <ItalicIcon className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton title="표 삽입" onClick={() => insertAtCursor("\n\n" + TABLE_TEMPLATE + "\n\n")}>
          <TableIcon className="size-3.5" /> 표
        </ToolbarButton>
        <label
          className="border-input bg-background hover:bg-accent inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-[11px]"
          title="이미지 업로드 (드래그/붙여넣기 가능)"
        >
          <ImageIcon className="size-3.5" />
          이미지
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) uploadFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        <span className="text-muted-foreground ml-auto text-[10px]">{text.length}자</span>
        <label className="text-muted-foreground inline-flex items-center gap-1 text-[11px]">
          <input
            type="checkbox"
            checked={showPreview}
            onChange={(e) => setShowPreview(e.target.checked)}
          />
          미리보기
        </label>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length > 0) uploadFiles(e.dataTransfer.files);
        }}
        onPaste={(e) => {
          const items = Array.from(e.clipboardData.items).filter((it) =>
            it.type.startsWith("image/"),
          );
          if (items.length > 0) {
            e.preventDefault();
            const files = items.map((it) => it.getAsFile()).filter(Boolean) as File[];
            uploadFiles(files);
          }
        }}
        className={cn(
          "rounded-md border-2 border-dashed transition-colors",
          dragOver ? "border-primary bg-primary/5" : "border-transparent",
        )}
      >
        <Textarea
          ref={ref}
          name={name}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={rows}
          placeholder="문제 단위 종합 해설 — markdown 표·이미지 가능. 이미지는 드래그/붙여넣기/이미지 버튼 사용."
          className="font-mono text-xs"
        />
      </div>

      {showPreview && text.trim() ? (
        <div className="border-input rounded-md border bg-muted/20 p-3">
          <MarkdownView text={text} />
        </div>
      ) : null}
      {isUploading ? (
        <p className="text-muted-foreground text-[11px]">이미지 업로드 중…</p>
      ) : null}
    </div>
  );
}

function ToolbarButton({
  children,
  title,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="border-input bg-background hover:bg-accent inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px]"
    >
      {children}
    </button>
  );
}
