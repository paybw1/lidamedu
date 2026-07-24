// 도서 미리보기(look-inside) 페이지 관리 — 편집 페이지에 얹는 독립 위젯.
//   이미지 여러 장 또는 PDF 업로드. PDF 는 브라우저에서 앞 N페이지를 이미지로 변환 후 업로드
//   → 서버(book-preview API)는 이미지만 저장 → 상세 페이지 기존 미리보기 Dialog 로 노출.
import { ImageIcon, Loader2Icon, Trash2Icon, UploadIcon } from "lucide-react";
import { useRef, useState } from "react";
import { useRevalidator } from "react-router";

import { Button } from "~/core/components/ui/button";

const PDF_PAGE_CAP = 100; // PDF 업로드 시 앞에서부터 변환할 페이지 수(목차 다페이지 대비)
const TARGET_W = 1000; // 변환 이미지 가로 픽셀(가독성·용량 균형)
// ★Vercel 서버리스 요청 본문 크기 제한(≈4.5MB) 회피 — 한 요청 본문이 이 바이트 예산을
//   넘지 않도록 이미지를 묶어 나눠 POST 한다(개수 아님·바이트 기준). 서버는 매 요청 count/sort 재계산.
const BYTE_BUDGET = 3_500_000; // 요청당 이미지 합계 상한(멀티파트 오버헤드 여유 포함)
const COUNT_CAP = 8; // 요청당 장수 상한(스토리지 업로드가 한 함수 호출에 몰려 타임아웃 나는 것 방지)

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
      // 본문이 JSON 이 아니면(413 용량초과·플랫폼 오류 등) 상태코드로 원인 안내.
      const reason =
        json?.error ??
        (res.status === 413
          ? "파일이 너무 큽니다. 페이지 수를 줄이거나 다시 시도해 주세요."
          : `요청에 실패했습니다. (HTTP ${res.status})`);
      throw new Error(reason);
    }
    return json;
  };

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    let added = 0;
    try {
      // 1) 업로드할 이미지 목록 구성 — PDF 는 앞 N페이지를 이미지로 변환, 아니면 선택 이미지들.
      let items: Array<{ blob: Blob; name: string }> = [];
      const pdf = Array.from(files).find(
        (f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name),
      );
      if (pdf) {
        setMsg("PDF 페이지를 이미지로 변환하는 중…");
        const blobs = await rasterizePdf(pdf);
        items = blobs.map((b, i) => ({
          blob: b,
          name: `page-${String(i + 1).padStart(3, "0")}.jpg`,
        }));
      } else {
        // 직접 올린 이미지도 원본 그대로 보내면(폰 스캔 수 MB) 요청 크기 초과 → 클라에서 축소.
        setMsg("이미지를 준비하는 중…");
        const imgs = Array.from(files).filter((f) => f.type.startsWith("image/"));
        for (let i = 0; i < imgs.length; i++) {
          const f = imgs[i];
          items.push({ blob: await downscaleImage(f), name: `${i + 1}.jpg` });
        }
      }
      if (items.length === 0) {
        setErr("이미지 또는 PDF 파일을 선택해 주세요.");
        return;
      }

      // 2) 배치 업로드 — 한 요청 본문이 BYTE_BUDGET 를 넘지 않게 묶어 나눠 POST(Vercel 크기 제한 회피).
      let i = 0;
      while (i < items.length) {
        const batch: Array<{ blob: Blob; name: string }> = [];
        let bytes = 0;
        // 최소 1장은 담되(단일 이미지가 예산을 넘어도 개별 전송), 이후 예산·장수 내에서 추가.
        while (
          i < items.length &&
          batch.length < COUNT_CAP &&
          (batch.length === 0 || bytes + items[i].blob.size <= BYTE_BUDGET)
        ) {
          batch.push(items[i]);
          bytes += items[i].blob.size;
          i++;
        }
        setMsg(`업로드 중… (${Math.min(i, items.length)}/${items.length})`);
        const fd = new FormData();
        fd.set("op", "add");
        fd.set("bookId", bookId);
        for (const it of batch) fd.append("images", it.blob, it.name);
        const r = await post(fd);
        added += r.added ?? 0;
      }
      setMsg(`${added}페이지를 추가했습니다.`);
      if (inputRef.current) inputRef.current.value = "";
      revalidator.revalidate();
    } catch (e) {
      // 일부 배치 성공 후 상한 도달·오류 시, 지금까지 추가분을 반영해 보여준다.
      if (added > 0) {
        setMsg(`${added}페이지를 추가했습니다.`);
        revalidator.revalidate();
      }
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
            이미지 여러 장 또는 PDF(앞 {PDF_PAGE_CAP}페이지까지 자동 변환)를 올리면 상세
            페이지에 look-inside 로 노출됩니다. 도서당 최대 100페이지, 대량은 자동으로
            나눠 업로드합니다.
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

// 직접 올린 이미지 1장을 가로 TARGET_W 이하 JPEG 로 축소(원본 수 MB → 수백 KB).
async function downscaleImage(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("이미지를 읽을 수 없습니다."));
      el.src = url;
    });
    const scale = img.naturalWidth > TARGET_W ? TARGET_W / img.naturalWidth : 1;
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.82),
    );
    return blob ?? file;
  } finally {
    URL.revokeObjectURL(url);
  }
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
