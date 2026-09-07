// 조문 목차의 편·장·절·관 표기.
//
// 민법 목차는 `제1편 총칙 > 제1장 통칙 > 제1절 능력` 처럼 세 층이 모두 "제N…" 이라
// 숫자만 떼어 놓으면 어느 층인지 알 수 없다. 그래서 배지에 **숫자와 단위 글자를 함께**
// 담고, 단위별로 무게를 달리한다(편=진하게, 장=옅게, 절·관=테두리만).
// 제목에서는 접두사를 떼어 이름만 남긴다 — 층은 배지가 말한다.
//
// ★조(條)는 배지로 만들지 않는다. `제5조 신의성실` 은 목차가 아니라 본문 항목이라
//   번호가 곧 이름의 일부다. 정규식에 '조' 를 넣지 않은 이유.
import { cn } from "~/core/lib/utils";

// ★가지 장은 `제6장의2 특허취소신청` 처럼 **단위 글자 뒤에** 의N 이 붙는다. 이걸 빼면
//   번호가 "6" 으로 잘리고 "의2" 가 제목 앞에 남는다(특허법 실사례).
const OUTLINE_RE = /^제\s*(\d+)\s*(편|장|절|관)(의\s*\d+)?\s+(.*)$/;

export interface ArticleOutlineParts {
  no: string;
  unit: "편" | "장" | "절" | "관";
  title: string;
}

/** "제1편 총칙" → { no: "1", unit: "편", title: "총칙" }. 목차 표기가 아니면 null. */
export function splitOutlineLabel(label: string): ArticleOutlineParts | null {
  const m = OUTLINE_RE.exec(label.trim());
  if (!m) return null;
  const title = m[4].trim();
  if (!title) return null;
  const branch = m[3] ? m[3].replace(/\s+/g, "") : "";
  return {
    no: `${m[1]}${branch}`,
    unit: m[2] as ArticleOutlineParts["unit"],
    title,
  };
}

// 단위별 무게 — 위로 갈수록 진하다. 색은 토큰으로만(다크 모드 대응).
const UNIT_CLASS: Record<ArticleOutlineParts["unit"], string> = {
  편: "bg-primary text-primary-foreground border-transparent",
  장: "bg-primary/10 text-link border-transparent",
  절: "text-muted-foreground border-border",
  관: "text-muted-foreground/80 border-transparent bg-foreground/[0.06]",
};

export function ArticleOutlineBadge({
  no,
  unit,
}: {
  no: string;
  unit: ArticleOutlineParts["unit"];
}) {
  return (
    <span
      className={cn(
        // min-w — 한 자리(제1편)와 두 자리(제11장)가 섞여도 제목 시작선이 맞게.
        "inline-flex h-[18px] min-w-[30px] flex-none items-center justify-center gap-px rounded-md border px-1 text-[10px] leading-none font-bold",
        UNIT_CLASS[unit],
      )}
      // 배지가 "1편" 으로 보이므로 읽어 주는 값은 원래 표기로.
      aria-label={`제${no}${unit}`}
    >
      <span className="tabular-nums">{no}</span>
      <span className="font-medium opacity-70">{unit}</span>
    </span>
  );
}

/**
 * 목차 한 줄의 이름 부분. 편·장·절·관이면 배지 + 제목, 아니면 라벨 그대로.
 * 조문 트리(article-tree)와 판례 탭의 조문 축(cases-tree)이 함께 쓴다.
 */
export function ArticleOutlineLabel({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  const parts = splitOutlineLabel(label);
  if (!parts)
    return <span className={cn("flex-1 truncate", className)}>{label}</span>;
  return (
    <>
      <ArticleOutlineBadge no={parts.no} unit={parts.unit} />
      <span className={cn("flex-1 truncate", className)}>{parts.title}</span>
    </>
  );
}
