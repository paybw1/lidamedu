// 클라이언트 전용 — PDF 파일을 페이지별 JPEG 로 변환.
// 답안지 슬롯 그리드에서 다페이지 PDF 를 슬롯 N개에 자동 분배할 때 사용.
//
// pdfjs-dist 의 worker 는 Vite ?url import 로 정적 자산화한다.

import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";

if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
}

// 메인 스레드 파싱 — Vite + pdfjs-dist 5.x 의 worker 번들이 환경마다 hang 하는 케이스가
// 있어 안정성 우선. 답안지 분할 워크로드(20페이지 이내)는 메인 스레드로 충분.

export async function getPdfPageCount(file: File): Promise<number> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  return pdf.numPages;
}

// 각 페이지를 JPEG File 로 변환. scale=2 면 1.5x 인쇄용 답안지 기준 ~1500x2100 px.
// onProgress 는 페이지 단위 진척 (cur/total).
export async function splitPdfToJpegs(
  file: File,
  baseName: string,
  scale = 2,
  onProgress?: (cur: number, total: number) => void,
): Promise<File[]> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const out: File[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("canvas 2d context unavailable");
    }
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.9),
    );
    // 메모리 회수 — 큰 PDF 일수록 중요.
    canvas.width = 0;
    canvas.height = 0;
    page.cleanup();
    if (!blob) throw new Error("blob conversion failed");
    const fileName = `${baseName}-page-${String(n).padStart(2, "0")}.jpg`;
    out.push(new File([blob], fileName, { type: "image/jpeg" }));
    onProgress?.(n, pdf.numPages);
  }
  await pdf.cleanup();
  await pdf.destroy();
  return out;
}
