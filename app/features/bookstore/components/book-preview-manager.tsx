// 도서 미리보기(look-inside) 페이지 관리 — 편집 페이지에 얹는 독립 위젯.
//   이미지 여러 장 또는 PDF 업로드. PDF 는 브라우저에서 앞 N페이지를 이미지로 변환 후 업로드
//   → 서버(book-preview API)는 이미지만 저장 → 상세 페이지 기존 미리보기 Dialog 로 노출.
import { ImageIcon, Loader2Icon, Trash2Icon, UploadIcon } from "lucide-react";
import { useRef, useState } from "react";
import { useRevalidator } from "react-router";

import { Button } from "~/core/components/ui/button";

const PDF_PAGE_CAP = 10; // PDF 업로드 시 앞에서부터 변환할 페이지 수
const TARGET_W = 1000; // 변환 이미지 가로 픽셀(가독성·용량 균형)

export interface PreviewPage {
  previewId: string;
  imageUrl: string;
}

export function BookPreviewManager({
  bookId,
  pages,
}: {
  bookId: string;
  pages: PreviewPage[];
}) {
  const revalidator = useRevalidator();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const post = async (fd: FormData) => {
    const res = await fetch("/api/admin/book-preview", {
      method: "POST",
      body: fd,
    });
    const json = (await res.json().catch(() => null)) as
      | { ok?: boolean; error?: string; added?: number }
      | null;
    if (!res.ok || !json?.ok) {
      throw new Error(json?.error ?? "요청에 실패했습니다.");
    }
    return json;
  };

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.set("op", "add");
      fd.set("bookId", bookId);
      const pdf = Array.from(files).find(
        (f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name),
      );
      if (pdf) {
        setMsg("PDF 페이지를 이미지로 변환하는 중…");
        const blobs = await rasterizePdf(pdf);
        blobs.forEach((b, i) =>
          fd.append("images", b, `page-${String(i + 1).padStart(2, "0")}.jpg`),
        );
      } else {
        for (const f of Array.from(files)) {
          if (f.type.startsWith("image/")) fd.append("images", f);
        }
      }
      if (!fd.has("images")) {
        setErr("이미지 또는 PDF 파일을 선택해 주세요.");
        return;
      }
      setMsg("업로드 중…");
      const r = await post(fd);
      setMsg(`${r.added ?? 0}페이지를 추가했습니다.`);
      if (inputRef.current) inputRef.current.value = "";
      revalidator.revalidate();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "업로드에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (previewId: string) => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.set("op", "delete");
      fd.set("bookId", bookId);
      fd.set("previewId", previewId);
      await post(fd);
      revalidator.revalidate();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "삭제에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-border rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-bold">
            <ImageIcon className="size-4" /> 미리보기 페이지
          </h3>
          <p className="text-muted-foreground mt-0.5 text-[12px]">
            이미지 여러 장 또는 PDF(앞 {PDF_PAGE_CAP}페이지)를 올리면 상세 페이지에
            look-inside 로 노출됩니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,image/*"
            multiple
            className="hidden"
            onChange={(e) => void onFiles(e.target.files)}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <UploadIcon className="size-4" />
            )}
            파일 추가
          </Button>
        </div>
      </div>

      {msg ? <p className="mt-2 text-[12px] text-emerald-600">{msg}</p> : null}
      {err ? <p className="mt-2 text-[12px] text-rose-600">{err}</p> : null}

      {pages.length > 0 ? (
        <ul className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-5">
          {pages.map((p, i) => (
            <li key={p.previewId} className="group relative">
              <img
                src={p.imageUrl}
                alt={`미리보기 ${i + 1}`}
                loading="lazy"
                className="aspect-[3/4] w-full rounded-md border object-cover"
              />
              <span className="bg-background/80 text-muted-foreground absolute left-1 top-1 rounded px-1 text-[10px] tabular-nums">
                {i + 1}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void onDelete(p.previewId)}
                className="bg-background/90 hover:bg-rose-500 hover:text-white absolute right-1 top-1 rounded p-1 opacity-0 shadow transition group-hover:opacity-100"
                aria-label="삭제"
              >
                <Trash2Icon className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground border-border mt-3 rounded-lg border border-dashed py-6 text-center text-[12px]">
          등록된 미리보기 페이지가 없습니다.
        </p>
      )}
    </div>
  );
}

// PDF 앞 N페이지를 JPEG Blob 배열로 변환(클라이언트, pdfjs).
async function rasterizePdf(file: File): Promise<Blob[]> {
  const { loadPdf } = await import("~/features/lectures/lib/pdf-render.client");
  const url = URL.createObjectURL(file);
  try {
    const pdf = await loadPdf(url);
    const n = Math.min(PDF_PAGE_CAP, pdf.numPages);
    const out: Blob[] = [];
    for (let i = 1; i <= n; i++) {
      const naturalW = await pdf.pageWidth(i);
      const scale = naturalW > 0 ? TARGET_W / naturalW : 1;
      const canvas = document.createElement("canvas");
      await pdf.renderPage(i, canvas, scale);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.82),
      );
      if (blob) out.push(blob);
    }
    await pdf.destroy();
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}
