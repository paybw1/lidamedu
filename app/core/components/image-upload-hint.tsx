// feat-11-007 #12 — 이미지 업로드 영역 권장 사양 안내(공용). 관리자 업로드 UI 마다
//   권장 크기·비율·형식·최대 용량을 일관 문구로 표시한다. 실제 리사이즈는 하지 않고,
//   표시단에서 object-cover(중앙 크롭)로 깨짐을 막는 것을 전제로 한 안내.
export function ImageUploadHint({
  size,
  ratio,
  formats = "JPG · PNG · WebP",
  maxMb = 5,
  note,
  className,
}: {
  /** 권장 픽셀, 예: "800 × 450px" */
  size: string;
  /** 권장 비율, 예: "16:9" */
  ratio?: string;
  /** 허용 형식 표기 */
  formats?: string;
  /** 최대 용량(MB) */
  maxMb?: number;
  /** 추가 안내(예: "권장과 다른 비율은 가운데 기준으로 잘려 보입니다") */
  note?: string;
  className?: string;
}) {
  return (
    <p
      className={
        "text-muted-foreground mt-1 text-[11px] leading-relaxed" +
        (className ? ` ${className}` : "")
      }
    >
      권장 크기 {size}
      {ratio ? ` · 비율 ${ratio}` : ""} · {formats} · 최대 {maxMb}MB
      {note ? ` · ${note}` : ""}
    </p>
  );
}
