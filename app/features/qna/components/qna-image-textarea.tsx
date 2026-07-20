// Q&A 본문 입력 공용 — 이미지 붙여넣기(클립보드) + "이미지 첨부" 버튼(파일 선택).
// 업로드(/api/qna/upload-image) 후 커서 위치에 이미지를 삽입한다.
// 질문(qna-new)·추가 질문·답변·강사 추가 답변·수정 폼에서 재사용.
//
// 입력란에는 긴 URL 대신 짧은 토큰(![첨부1])만 보이고, 실제 이미지는 입력란 아래
// 썸네일로 즉시 표시된다. 제출 값(부모 value)은 토큰을 원래 마크다운(![](url))으로
// 되돌린 완성본 — 토큰↔URL 대응은 컴포넌트 내부 맵이 들고 있어 데이터는 기존과 동일.
import { ImageIcon, Loader2Icon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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

// 이미지 마크다운(수정 폼 초기값 등 기존 콘텐츠 포함) ↔ 표시 토큰 상호 변환.
const IMG_MD_RE = /!\[([^\]]*)\]\(([^()\s]+)\)/g;
const TOKEN_RE = /!\[첨부(\d+)\]/g;

type AttachmentMap = Map<number, { alt: string; url: string }>;

function collapseImages(md: string, map: AttachmentMap): string {
  return md.replace(IMG_MD_RE, (_m, alt: string, url: string) => {
    let num: number | null = null;
    for (const [n, e] of map) {
      if (e.url === url) {
        num = n;
        break;
      }
    }
    if (num === null) {
      num = map.size === 0 ? 1 : Math.max(...map.keys()) + 1;
      map.set(num, { alt, url });
    }
    return `![첨부${num}]`;
  });
}

function expandTokens(display: string, map: AttachmentMap): string {
  return display.replace(TOKEN_RE, (m, nStr: string) => {
    const e = map.get(Number(nStr));
    return e ? `![${e.alt}](${e.url})` : m;
  });
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
  const mapRef = useRef<AttachmentMap>(new Map());
  const [display, setDisplay] = useState(() =>
    collapseImages(value, mapRef.current),
  );
  // 부모가 값을 외부에서 바꿨을 때(제출 후 초기화 등)만 재동기화 — 내부 편집 에코는 무시.
  const lastExpandedRef = useRef(value);
  useEffect(() => {
    if (value !== lastExpandedRef.current) {
      lastExpandedRef.current = value;
      setDisplay(collapseImages(value, mapRef.current));
    }
  }, [value]);

  const update = (nextDisplay: string) => {
    setDisplay(nextDisplay);
    const expanded = expandTokens(nextDisplay, mapRef.current);
    lastExpandedRef.current = expanded;
    onChange(expanded);
  };

  const insertImage = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadQnaImage(file);
      if (!url) return;
      let num: number | null = null;
      for (const [n, e] of mapRef.current) {
        if (e.url === url) {
          num = n;
          break;
        }
      }
      if (num === null) {
        num = mapRef.current.size === 0 ? 1 : Math.max(...mapRef.current.keys()) + 1;
        mapRef.current.set(num, { alt: "", url });
      }
      const el = ref.current;
      const start = el?.selectionStart ?? display.length;
      const end = el?.selectionEnd ?? start;
      const token = `\n![첨부${num}]\n`;
      update(display.slice(0, start) + token + display.slice(end));
    } finally {
      setUploading(false);
    }
  };

  const removeAttachment = (num: number) => {
    const next = display
      .replaceAll(`![첨부${num}]`, "")
      .replace(/\n{3,}/g, "\n\n");
    mapRef.current.delete(num);
    update(next);
  };

  // 입력란에 현재 남아 있는 토큰만 썸네일로 표시(등장 순).
  const attachments: { num: number; url: string }[] = [];
  for (const m of display.matchAll(TOKEN_RE)) {
    const num = Number(m[1]);
    const e = mapRef.current.get(num);
    if (e && !attachments.some((a) => a.num === num))
      attachments.push({ num, url: e.url });
  }

  return (
    <div>
      {/* 제출 값 = 토큰을 URL 로 복원한 완성 마크다운 (textarea 는 표시 전용이라 name 없음) */}
      <input type="hidden" name={name} value={value} />
      <Textarea
        ref={ref}
        value={display}
        onChange={(e) => update(e.target.value)}
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
      {attachments.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {attachments.map((a) => (
            <div
              key={a.num}
              className="border-border bg-muted/30 relative rounded-lg border p-1"
            >
              <img
                src={a.url}
                alt={`첨부${a.num}`}
                className="h-20 max-w-40 rounded object-contain"
              />
              <span className="text-muted-foreground block px-0.5 pt-0.5 text-center text-[10px]">
                첨부{a.num}
              </span>
              <button
                type="button"
                onClick={() => removeAttachment(a.num)}
                className="bg-foreground/70 text-background hover:bg-foreground absolute -top-1.5 -right-1.5 inline-flex size-4.5 items-center justify-center rounded-full"
                title={`첨부${a.num} 삭제`}
              >
                <XIcon className="size-3" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
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
