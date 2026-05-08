// 운영자 — 해설/지문 markdown 에디터.
// textarea + 미리보기 + toolbar(표·이미지·강조) + drag-drop / paste 이미지 업로드.
// 종합 해설(문제 단위) 과 지문/박스 항목(보기 단위) 양쪽에서 공용 사용.
//   - 종합 해설: uncontrolled (defaultValue) + 미리보기 default on.
//   - 지문/해설 셀: controlled (value+onChange) — 부모(ChoiceEditor/BoxItemEditor) 가 상태를
//     보유하므로 외부에서 갱신해야 자동 ref 추출 등 효과가 동작. compact=true 로 사용.

import { BoldIcon, ImageIcon, ItalicIcon, TableIcon } from "lucide-react";
import { useRef, useState } from "react";
import { useFetcher } from "react-router";
import { toast } from "sonner";

import { Textarea } from "~/core/components/ui/textarea";
import { cn } from "~/core/lib/utils";
import { MarkdownView } from "~/features/problems/components/markdown-view";

// 분류 트리/병합 셀이 흔한 변리사 객관식 해설 표 양식 — HTML <table> + colspan/rowspan.
// rehype-raw + allowDangerousHtml(MarkdownView) 로 그대로 렌더링됨.
const TABLE_TEMPLATE = `<table>
<thead>
<tr><th colspan="2">분 류</th><th>내 용</th></tr>
</thead>
<tbody>
<tr>
  <td rowspan="2">대분류</td>
  <td>소분류 A</td>
  <td></td>
</tr>
<tr>
  <td>소분류 B</td>
  <td></td>
</tr>
</tbody>
</table>`;

export function ExplanationEditor({
  name = "explanationMd",
  value,
  onChange,
  defaultValue = "",
  rows = 10,
  placeholder = "문제 단위 종합 해설 — markdown 표·이미지 가능. 이미지는 드래그/붙여넣기/이미지 버튼 사용.",
  compact = false,
  className,
}: {
  name?: string;
  value?: string;
  onChange?: (next: string) => void;
  defaultValue?: string;
  rows?: number;
  placeholder?: string;
  compact?: boolean;
  className?: string;
}) {
  const isControlled = value !== undefined;
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [internal, setInternal] = useState<string>(defaultValue);
  const text = isControlled ? value : internal;
  const setText = (next: string) => {
    if (isControlled) onChange?.(next);
    else setInternal(next);
  };
  // 미리보기 default — compact 모드는 off (공간 절약), 그 외 on.
  const [showPreview, setShowPreview] = useState<boolean>(!compact);
  const [dragOver, setDragOver] = useState<boolean>(false);
  const upload = useFetcher<{ ok?: boolean; url?: string; error?: string }>();
  const isUploading = upload.state !== "idle";

  function insertAtCursor(insert: string) {
    const ta = ref.current;
    if (!ta) {
      setText(text + insert);
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const before = text.slice(0, start);
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

  const btnPad = compact ? "px-1.5 py-0.5" : "px-2 py-1";
  const iconSize = compact ? "size-3" : "size-3.5";
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-1">
        <ToolbarButton title="굵게" pad={btnPad} onClick={() => wrapSelection("**", "**")}>
          <BoldIcon className={iconSize} />
        </ToolbarButton>
        <ToolbarButton title="이탤릭" pad={btnPad} onClick={() => wrapSelection("*", "*")}>
          <ItalicIcon className={iconSize} />
        </ToolbarButton>
        <ToolbarButton title="표 삽입" pad={btnPad} onClick={() => insertAtCursor("\n\n" + TABLE_TEMPLATE + "\n\n")}>
          <TableIcon className={iconSize} /> 표
        </ToolbarButton>
        <label
          className={cn(
            "border-input bg-background hover:bg-accent inline-flex cursor-pointer items-center gap-1 rounded-md border text-[11px]",
            btnPad,
          )}
          title="이미지 업로드 (드래그/붙여넣기 가능)"
        >
          <ImageIcon className={iconSize} />
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
          placeholder={placeholder}
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
  pad,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  pad: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "border-input bg-background hover:bg-accent inline-flex items-center gap-1 rounded-md border text-[11px]",
        pad,
      )}
    >
      {children}
    </button>
  );
}
