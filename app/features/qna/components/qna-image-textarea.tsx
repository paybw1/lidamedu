// Q&A 본문 입력 공용 — 이미지 붙여넣기(클립보드) + "이미지 첨부" 버튼(파일 선택).
// 업로드(/api/qna/upload-image) 후 커서 위치에 ![](url) 마크다운을 삽입한다.
// 질문(qna-new)·추가 질문·강사 추가 답변 폼에서 재사용.
import { ImageIcon, Loader2Icon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Textarea } from "~/core/components/ui/textarea";

async function uploadQnaImage(file: File): Promise<string | null> {
  const fd = new FormData();
  fd.set("file", file);
  try {
    const res = await fetch("/api/qna/upload-image", { method: "POST", body: fd });
    const j = (await res.json()) as { ok: boolean; url?: string; error?: string };
    if (!j.ok || !j.url) {
      toast.error(j.error ?? "이미지 업로드 실패");
      return null;
    }
    return j.url;
  } catch {
    toast.error("이미지 업로드 실패 — 네트워크를 확인하세요.");
    return null;
  }
}

export function QnaImageTextarea({
  name,
  value,
  onChange,
  placeholder,
  rows = 4,
  maxLength,
  required,
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  required?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const insertImage = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadQnaImage(file);
      if (!url) return;
      const el = ref.current;
      const start = el?.selectionStart ?? value.length;
      const end = el?.selectionEnd ?? start;
      const md = `\n![](${url})\n`;
      onChange(value.slice(0, start) + md + value.slice(end));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <Textarea
        ref={ref}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onPaste={(e) => {
          const items = e.clipboardData?.items;
          if (!items) return;
          for (let i = 0; i < items.length; i++) {
            const it = items[i];
            if (it.kind === "file" && it.type.startsWith("image/")) {
              const file = it.getAsFile();
              if (!file) continue;
              e.preventDefault();
              void insertImage(file);
              return;
            }
          }
        }}
        placeholder={placeholder}
        rows={rows}
        maxLength={maxLength}
        className="text-sm leading-relaxed"
        required={required}
      />
      <div className="mt-1.5 flex items-center gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] disabled:opacity-50"
        >
          {uploading ? (
            <Loader2Icon className="size-3 animate-spin" />
          ) : (
            <ImageIcon className="size-3" />
          )}
          {uploading ? "업로드 중…" : "이미지 첨부"}
        </button>
        <span className="text-muted-foreground/70 text-[10.5px]">
          캡처 붙여넣기(Ctrl+V)도 됩니다 · 5MB 이하
        </span>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void insertImage(file);
          }}
        />
      </div>
    </div>
  );
}
