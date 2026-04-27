export async function generatePOAClient({
  elementId,
  filename,
}: {
  elementId: string;
  filename: string;
}): Promise<File | null> {
  const { jsPDF } = await import("jspdf");
  const html2canvas = (await import("html2canvas")).default;

  const element = document.getElementById(elementId);
  if (!element) {
    console.error("[PDF] 요소를 찾을 수 없습니다:", elementId);
    return null;
  }

  // ✅ 1. hidden 클래스 제거 (강제로 렌더링되도록)
  const originalClass = element.className;
  element.classList.remove("hidden");

  // ✅ 2. 캔버스 생성
  const canvas = await html2canvas(element);
  const imgData = canvas.toDataURL("image/jpeg");

  // ✅ 3. 다시 hidden 처리
  element.className = originalClass;

  if (!imgData || imgData === "data:,") {
    return null;
  }

  const pdf = new jsPDF("p", "mm", "a4");
  const width = pdf.internal.pageSize.getWidth();
  const height = (canvas.height * width) / canvas.width;

  pdf.addImage(imgData, "JPEG", 0, 0, width, height);

  // ✅ File 객체로 반환
  const blob = pdf.output("blob");
  const file = new File([blob], filename, { type: "application/pdf" });

  // ✅ 미리보기
  const blobUrl = URL.createObjectURL(file);
  window.open(blobUrl, "_blank");

  return file;
}
