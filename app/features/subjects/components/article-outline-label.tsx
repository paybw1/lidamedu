// 조문 목차의 편·장·절·관·조 표기.
//
// 민법 목차는 `제1편 총칙 > 제1장 통칙 > 제1절 능력` 처럼 층이 모두 "제N…" 이라
// 숫자만 떼어 놓으면 어느 층인지 알 수 없다. 그래서 배지에 **숫자와 단위 글자를 함께**
// 담고, 단위별로 무게를 달리한다(편=진하게, 장=옅게, 절=테두리만, 관·조=가장 옅게).
// 제목에서는 접두사를 떼어 이름만 남긴다 — 층은 배지가 말한다.
//
// 조(條)도 배지로 만든다(원장 결정 2026-09-09, 검토안 B). 번호 칸이 세로로 맞아
// "제34조가 어디 있더라" 하고 번호로 훑기 쉬워진다. 대신 층 구분이 약해지므로
// 조 배지는 가장 옅게 둔다.
// ★조문 라벨은 운영 데이터 2,499건 전부 `제N조[의N] 제목` 꼴이다. 제목이 없으면
//   배지만 남아 빈 줄이 되므로 splitOutlineLabel 이 null 을 돌려 라벨 그대로 쓴다.
import { cn } from "~/core/lib/utils";

// ★가지 번호는 `제6장의2`·`제14조의2` 처럼 **단위 글자 뒤에** 의N 이 붙는다. 이걸 빼면
//   번호가 "6" 으로 잘리고 "의2" 가 제목 앞에 남는다(특허법 실사례).
const OUTLINE_RE = /^제\s*(\d+)\s*(편|장|절|관|조)(의\s*\d+)?\s+(.*)$/;

export interface ArticleOutlineParts {
  no: string;
  unit: "편" | "장" | "절" | "관" | "조";
  /** 가지 표시. `제6장의2` 의 "의2" — ★단위 글자 **뒤**에 온다. 없으면 빈 문자열. */
  branch: string;
  title: string;
}

/**
 * "제1편 총칙" → { no: "1", unit: "편", branch: "", title: "총칙" }.
 * "제6장의2 특허취소신청" → { no: "6", unit: "장", branch: "의2", … }.
 * 목차 표기가 아니면 null.
 */
export function splitOutlineLabel(label: string): ArticleOutlineParts | null {
  const m = OUTLINE_RE.exec(label.trim());
  if (!m) return null;
  const title = m[4].trim();
  if (!title) return null;
  return {
    no: m[1],
    unit: m[2] as ArticleOutlineParts["unit"],
    branch: m[3] ? m[3].replace(/\s+/g, "") : "",
    title,
  };
}

// 단위별 무게 — 위로 갈수록 진하다. 색은 토큰으로만(다크 모드 대응).
const UNIT_CLASS: Record<ArticleOutlineParts["unit"], string> = {
  편: "bg-primary text-primary-foreground border-transparent",
  장: "bg-primary/10 text-link border-transparent",
  절: "text-muted-foreground border-border",
  관: "text-muted-foreground/80 border-transparent bg-foreground/[0.06]",
  // 조는 줄 수가 압도적으로 많다(한 절에 열댓 줄). 가장 옅게 두어 목차 층을 덮지 않게.
  조: "text-muted-foreground border-transparent bg-foreground/[0.06]",
};

export function ArticleOutlineBadge({
  no,
  unit,
  branch = "",
}: {
  no: string;
  unit: ArticleOutlineParts["unit"];
  branch?: string;
}) {
  return (
    <span
      className={cn(
        // min-w — 한 자리(제1편)와 두 자리(제11장)가 섞여도 제목 시작선이 맞게.
        "inline-flex h-[18px] min-w-[38px] flex-none items-center justify-center rounded-md border px-1 text-[10px] leading-none font-bold",
        UNIT_CLASS[unit],
      )}
    >
      {/* 원문 표기 그대로 "제1편" — '제' 를 빼면 목차를 읽던 감각과 어긋난다(원장 지적). */}
      {/* ★차례는 제 → 번호 → 단위 → 가지다. `제6장의2` 를 `제6의2장` 으로 쓰면 안 된다. */}
      <span className="font-medium opacity-70">제</span>
      <span className="tabular-nums">{no}</span>
      <span className="font-medium opacity-70">{unit}</span>
      {branch ? <span className="tabular-nums">{branch}</span> : null}
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
      <ArticleOutlineBadge
        no={parts.no}
        unit={parts.unit}
        branch={parts.branch}
      />
      <span className={cn("flex-1 truncate", className)}>{parts.title}</span>
    </>
  );
}

// ── 목차를 처음에 펼칠지 ─────────────────────────────────────────────────────
// 편(編)은 기본으로 펼친다 — 민법처럼 편이 있는 법은 편만 다섯 줄 보이면 목차 구실을
// 못 한다. 다만 아래 두 편은 접어 둔다: 변리사 시험 범위 밖이라 늘 펼쳐 두면
// 목차만 길어진다(원장 지시 2026-09-09).
// ★법을 가리지 않고 **편 이름**으로 판단한다 — 이 두 이름은 민법에만 있고,
//   그래서 조문·객관식·주관식·판례 네 트리가 lawCode 를 몰라도 같은 결정을 한다.
const COLLAPSED_PART_TITLES = new Set(["친족", "상속"]);

/** 최상위 목차 줄을 처음부터 펼칠 것인가. */
export function opensByDefault(label: string): boolean {
  const parts = splitOutlineLabel(label);
  if (!parts || parts.unit !== "편") return true;
  return !COLLAPSED_PART_TITLES.has(parts.title);
}
