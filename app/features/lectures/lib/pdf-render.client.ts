// 클라이언트 전용 — 통합본 강의노트 PDF 를 페이지 단위로 lazy 렌더.
// 인앱 뷰어(lecture-note-viewer)가 사용한다. signed URL(Range 206)로 getDocument 하면
// pdfjs 가 페이지 단위로만 fetch 하므로 603p 전체를 한 번에 받지 않는다.
// worker 는 Vite ?url import 로 정적 자산화 (pdf-split.client.ts 와 동일 패턴).
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";

if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
}

// 컴포넌트에 pdfjs 타입을 노출하지 않기 위한 얇은 래퍼.
export interface LoadedPdf {
  numPages: number;
  // 페이지(1-base)의 배율 1 기준 CSS 폭 — 컨테이너 fit 배율 계산용.
  pageWidth(pageNum: number): Promise<number>;
  // pageNum 을 canvas 에 렌더(고해상도 dpr 보정). 직전 렌더가 진행 중이면 취소 후 새로 그린다.
  renderPage(
    pageNum: number,
    canvas: HTMLCanvasElement,
    scale: number,
  ): Promise<void>;
  destroy(): Promise<void>;
}

// 연속 페이지 이동/줌 시 pdfjs 가 던지는 정상 취소 예외 판별.
function isRenderingCancelled(e: unknown): boolean {
  return e instanceof Error && e.name === "RenderingCancelledException";
}

export async function loadPdf(url: string): Promise<LoadedPdf> {
  const pdf = await pdfjsLib.getDocument({ url }).promise;
  // 진행 중 렌더 — cancel() 만 필요하므로 구조적 타입으로 보관(pdfjs 타입 import 회피).
  let current: { cancel: () => void } | null = null;

  return {
    numPages: pdf.numPages,

    async pageWidth(pageNum) {
      const page = await pdf.getPage(pageNum);
      const w = page.getViewport({ scale: 1 }).width;
      page.cleanup();
      return w;
    },

    async renderPage(pageNum, canvas, scale) {
      if (current) {
        current.cancel();
        current = null;
      }
      const dpr =
        typeof window !== "undefined" && window.devicePixelRatio
          ? window.devicePixelRatio
          : 1;
      const page = await pdf.getPage(pageNum);
      // 백킹 스토어는 dpr 배율로, 화면 표시는 scale 배율로 — 고해상도 선명 렌더.
      const viewport = page.getViewport({ scale: scale * dpr });
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas 2d context unavailable");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      canvas.style.width = `${Math.round(viewport.width / dpr)}px`;
      canvas.style.height = `${Math.round(viewport.height / dpr)}px`;
      const task = page.render({ canvas, canvasContext: ctx, viewport });
      current = task;
      try {
        await task.promise;
      } catch (e) {
        if (isRenderingCancelled(e)) return; // 페이지 이동/줌 중 정상 취소 — 무시
        throw e;
      } finally {
        if (current === task) current = null;
        page.cleanup();
      }
    },

    async destroy() {
      if (current) {
        current.cancel();
        current = null;
      }
      await pdf.cleanup();
      await pdf.destroy();
    },
  };
}
