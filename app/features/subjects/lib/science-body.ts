// 자연과학 문제 bodyMd 파서 — <보기> 블록 분리 + 단일 개행 보존(표 안전).
//
// 배경: 자연과학 기출은 ㄱㄴㄷ "보기" 를 problem_box_items 가 아니라 bodyMd 텍스트
//   (`**<보기>**` 마커 + 단일 \n 으로 구분된 ㄱ./ㄴ./ㄷ. 라인)로 보관한다.
//   MarkdownView(react-markdown, breaks 미적용)는 단일 \n 을 공백으로 합치므로,
//   박스가 없고 ㄱㄴㄷ 가 한 줄로 붙어 나온다. → 뷰어에서 stem 과 보기를 분리 렌더.

// 박스 마커 = 자기 줄에 단독으로 놓인 <보기>(보통 **<보기>**). 발문 속 "…<보기>에서 고른 것은?"
// 같은 문장 내 언급은 (뒤에 개행이 아니라 글자가 오므로) 매칭에서 제외된다.
const BOGI_MARKER = /(?:^|\n)[ \t]*\*{0,2}<\s*보기\s*>\*{0,2}[ \t]*(?=\r?\n|$)/;
const KOR_ENUM = /^[ㄱ-ㅎ]\s*[.)]/;
// GFM 표 구분행(|---|) 감지 — 있으면 행이 단일 \n 으로 구분되므로 개행 변환을 생략(표 파싱 보호).
const TABLE_DELIM = /\|[ :-]*-{2,}[ :-]*\|/;

export interface ParsedScienceBody {
  /** <보기> 이전 발문(표 없으면 단일 개행이 줄바꿈으로 보존됨). */
  stem: string;
  /** ㄱ/ㄴ/ㄷ 보기 항목(마커 포함 원문 라인). 없으면 빈 배열. */
  bogi: string[];
}

// 단일 개행(\n) → 마크다운 하드 브레이크("  \n"). 빈 줄(\n\n 단락)은 보존.
// 표가 포함된 텍스트는 변환하지 않는다(표 행 구분이 깨지므로).
export function preserveSoftBreaks(text: string): string {
  if (TABLE_DELIM.test(text)) return text;
  return text.replace(/([^\n])\n(?!\n)/g, "$1  \n");
}

function splitBogiItems(block: string): string[] {
  const items: string[] = [];
  for (const raw of block.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    // 새 ㄱ/ㄴ/ㄷ 마커면 항목 시작, 아니면 직전 항목에 이어붙임(줄바꿈된 연속 라인 병합).
    if (KOR_ENUM.test(line) || items.length === 0) items.push(line);
    else items[items.length - 1] += " " + line;
  }
  return items;
}

export function parseScienceBody(bodyMd: string): ParsedScienceBody {
  const m = BOGI_MARKER.exec(bodyMd);
  if (!m) return { stem: preserveSoftBreaks(bodyMd.trim()), bogi: [] };
  const stem = bodyMd.slice(0, m.index).trim();
  const after = bodyMd.slice(m.index + m[0].length);
  return { stem: preserveSoftBreaks(stem), bogi: splitBogiItems(after) };
}
