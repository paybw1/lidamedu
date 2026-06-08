// 화면 콘텐츠를 PDF 로 내려받기 (오프라인 열람용) — 브라우저 전용.
// html2canvas-pro 로 DOM 을 캡처해 jsPDF A4 페이지로 분할한다.
// (Tailwind v4 의 oklch/color-mix 색상은 기존 html2canvas 1.x 가 파싱 못 해
//  PDF 생성이 통째로 실패함 → oklch/lab/color-mix 지원하는 pro 포크 사용.)
// data-pdf-exclude="true" 가 붙은 요소(버튼·탭 등)는 캡처에서 제외.

import html2canvas from "html2canvas-pro";
import { jsPDF } from "jspdf";

export async function downloadElementAsPdf(
  element: HTMLElement,
  filename: string,
): Promise<void> {
  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
    ignoreElements: (el) => el.getAttribute("data-pdf-exclude") === "true",
  });

  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height / canvas.width) * imgWidth;
  const imgData = canvas.toDataURL("image/png");

  // 캡처 이미지가 한 페이지보다 길면 페이지 단위로 잘라 붙인다.
  let heightLeft = imgHeight;
  let position = 0;
  pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;
  while (heightLeft > 0) {
    position -= pageHeight;
    pdf.addPage();
    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  pdf.save(filename);
}
