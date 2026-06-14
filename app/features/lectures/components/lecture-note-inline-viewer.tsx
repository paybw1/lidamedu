// 운영자 확인 화면용 인앱 pdfjs 옆패널 뷰어 — 통합본을 1회 로드하고 선택 페이지만 렌더.
// lecture-note-viewer 의 풀뷰어와 달리, 컨테이너 폭에 맞춰 렌더(옆패널 fit)하고 툴바는 최소.
import { ChevronLeftIcon, ChevronRightIcon, Loader2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "~/core/components/ui/button";
import type { LoadedPdf } from "~/features/lectures/lib/pdf-render.client";

export function LectureNoteInlineViewer({
  signedUrl,
  page,
  totalPages,
}: {
  signedUrl: string;
  page: number;
  totalPages: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfRef = useRef<LoadedPdf | null>(null);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState(false);
  const [cur, setCur] = useState(page);
  const [scale, setScale] = useState(1);

  // PDF 1회 로드 (signedUrl 단위).
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setErr(false);
    (async () => {
      try {
        const { loadPdf } = await import(
          "~/features/lectures/lib/pdf-render.client"
        );
        const pdf = await loadPdf(signedUrl);
        if (cancelled) {
          void pdf.destroy();
          return;
        }
        pdfRef.current = pdf;
        // 컨테이너 폭에 맞춰 기본 배율.
        try {
          const w = await pdf.pageWidth(page);
          const avail = (containerRef.current?.clientWidth ?? 420) - 8;
          if (w > 0 && avail > 0)
            setScale(Math.max(0.3, Math.min(2, avail / w)));
        } catch {
          /* 기본 배율 유지 */
        }
        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled) setErr(true);
      }
    })();
    return () => {
      cancelled = true;
      const p = pdfRef.current;
      pdfRef.current = null;
      if (p) void p.destroy();
    };
  }, [signedUrl, page]);

  // 선택 페이지(prop)가 바뀌면 그 페이지로 점프.
  useEffect(() => {
    setCur(page);
  }, [page]);

  // 현재 페이지 렌더.
  useEffect(() => {
    if (!ready) return;
    const pdf = pdfRef.current;
    const canvas = canvasRef.current;
    if (!pdf || !canvas) return;
    let active = true;
    pdf.renderPage(cur, canvas, scale).catch(() => {
      if (active) setErr(true);
    });
    return () => {
      active = false;
    };
  }, [ready, cur, scale]);

  return (
    <div onContextMenu={(e) => e.preventDefault()}>
      <div className="mb-2 flex items-center justify-center gap-1.5">
        <Button
          size="icon"
          variant="outline"
          className="size-7"
          onClick={() => setCur((p) => Math.max(1, p - 1))}
          disabled={cur <= 1 || !ready}
          aria-label="이전 페이지"
        >
          <ChevronLeftIcon className="size-3.5" />
        </Button>
        <span className="text-muted-foreground min-w-20 text-center text-xs tabular-nums">
          p.{cur} / {totalPages}
        </span>
        <Button
          size="icon"
          variant="outline"
          className="size-7"
          onClick={() => setCur((p) => Math.min(totalPages, p + 1))}
          disabled={cur >= totalPages || !ready}
          aria-label="다음 페이지"
        >
          <ChevronRightIcon className="size-3.5" />
        </Button>
      </div>
      <div
        ref={containerRef}
        className="bg-muted/30 relative flex max-h-[70vh] min-h-60 justify-center overflow-auto rounded-md border p-2"
      >
        <canvas
          ref={canvasRef}
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          className={
            "h-auto max-w-full self-start rounded shadow-sm select-none " +
            (ready && !err ? "" : "invisible")
          }
        />
        {!ready && !err ? (
          <div className="text-muted-foreground absolute inset-0 flex items-center justify-center gap-2 text-sm">
            <Loader2Icon className="size-4 animate-spin" /> 불러오는 중…
          </div>
        ) : null}
        {err ? (
          <div className="text-muted-foreground absolute inset-0 flex items-center justify-center px-4 text-center text-sm">
            페이지를 불러오지 못했습니다.
          </div>
        ) : null}
      </div>
    </div>
  );
}
