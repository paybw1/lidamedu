// 판례 본문 넘버링 자동 정렬 — 판결문 계층 마커("1." > "가." > "1)" > "가)" > "(1)" > "(가)")
// 앞에서 시각적 줄바꿈/들여쓰기를 하기 위한 분할기. feat: 판례 가독성(넘버링 자동 정렬).
//
// ★불변 규칙: 세그먼트들을 이어붙이면 원문과 문자 단위로 동일해야 한다.
//   하이라이트(HighlightOverlay)가 DOM 누적 text-node offset 기반이라, 문자를 넣거나
//   빼면 기존 하이라이트가 전부 어긋난다. 줄바꿈은 렌더 요소(block span)로만 표현한다.
//
// 오인 방지 가드:
//   · 날짜 사슬 — "2011. 9. 8. 선고" 의 "9." "8." 은 직전 토큰이 "숫자." 이면 마커 아님
//   · 마커 뒤 공백 다음이 숫자면 마커 아님("9. 8" 의 "9.")
//   · <u>…</u> 밑줄 마커 내부에서는 분할하지 않음(렌더 시 태그 짝 붕괴 방지)
//   · "(가)목" 처럼 뒤에 공백이 없으면 마커 아님(호·목 지칭 보존)

export interface NumberingSegment {
  /** 원문 부분 문자열 — 전체 이어붙이면 원문과 동일. */
  text: string;
  /** 이 세그먼트가 시작하는 마커의 계층 깊이(0~5). 마커로 시작하지 않으면 null. */
  depth: number | null;
}

const KOREAN_ORDER = "가나다라마바사아자차카타파하";

// 마커 후보 — 직전이 문단 시작 또는 공백, 직후가 공백일 때만.
// group 인덱스로 깊이 판정: 2=N. 3=가. 4=N) 5=가) 6=(N) 7=(가)
const MARKER_RE = new RegExp(
  String.raw`(^|\s)(?:(\d{1,2})\.|([${KOREAN_ORDER}])\.|(\d{1,2})\)|([${KOREAN_ORDER}])\)|\((\d{1,2})\)|\(([${KOREAN_ORDER}])\))(?=\s)`,
  "g",
);

// <u>…</u> 구간 수집 — 이 안의 마커 후보는 무시.
function underlineRanges(text: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const re = /<u>[\s\S]*?<\/u>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.push([m.index, m.index + m[0].length]);
  return out;
}

/**
 * 본문 텍스트를 넘버링 마커 경계로 분할한다.
 * 반환 세그먼트의 text 를 전부 이어붙이면 입력과 동일(문자 보존).
 */
export function splitCaseNumbering(text: string): NumberingSegment[] {
  if (!text) return [{ text, depth: null }];
  const uRanges = underlineRanges(text);
  const inUnderline = (i: number) =>
    uRanges.some(([s, e]) => i >= s && i < e);

  const boundaries: Array<{ index: number; depth: number }> = [];
  MARKER_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MARKER_RE.exec(text)) !== null) {
    const markerStart = m.index + m[1].length;
    if (inUnderline(markerStart)) continue;

    let depth: number;
    if (m[2] !== undefined) depth = 0; // N.
    else if (m[3] !== undefined) depth = 1; // 가.
    else if (m[4] !== undefined) depth = 2; // N)
    else if (m[5] !== undefined) depth = 3; // 가)
    else if (m[6] !== undefined) depth = 4; // (N)
    else depth = 5; // (가)

    // 숫자형 마커("N." / "N)") — 날짜·수치 나열 오인 가드.
    if (depth === 0 || depth === 2) {
      // 직전 토큰이 "숫자." 로 끝나면 날짜 사슬("2011. 9. 8.")의 일부.
      const before = text.slice(0, markerStart).replace(/\s+$/, "");
      if (/\d\.$/.test(before)) continue;
      // 마커 뒤 공백 다음 첫 글자가 숫자면 나열("9. 8")의 일부.
      const afterMarker = markerStart + m[0].length - m[1].length;
      const next = text.slice(afterMarker).match(/^\s*(.)/);
      if (next && /\d/.test(next[1])) continue;
    }

    boundaries.push({ index: markerStart, depth });
  }

  if (boundaries.length === 0) return [{ text, depth: null }];

  // 경계 인덱스 기준 슬라이스 — 문자 보존.
  const out: NumberingSegment[] = [];
  if (boundaries[0].index > 0) {
    out.push({ text: text.slice(0, boundaries[0].index), depth: null });
  }
  for (let i = 0; i < boundaries.length; i++) {
    const start = boundaries[i].index;
    const end = i + 1 < boundaries.length ? boundaries[i + 1].index : text.length;
    out.push({ text: text.slice(start, end), depth: boundaries[i].depth });
  }
  return out;
}

/**
 * 문단 내 상대 들여쓰기(px) — 마커의 절대 계층(depth) 대신, 그 문단에 실제 등장한
 * 층위들의 순위(rank)로 들여쓴다. "(1)(2)(3)" 처럼 절대 계층상 깊은 마커(depth 4)만
 * 있는 문단이 4단(56px)씩 밀리는 문제 방지 — 한 글자(14px) 단위로 층위만 구분.
 * 최상위(N.) 마커로 시작하는 문단은 기존과 동일(rank0 = 0px, 특허 판례 표시 불변).
 */
export function relativeIndentByDepth(
  segments: NumberingSegment[],
): Map<number, number> {
  const depths = [
    ...new Set(
      segments.map((s) => s.depth).filter((d): d is number => d !== null),
    ),
  ].sort((a, b) => a - b);
  // 문단이 하위 층위부터 시작하면(N. 없이 (1) 등) 첫 층위도 한 글자 들여쓴다.
  const base = depths.length > 0 && depths[0] > 0 ? 1 : 0;
  const map = new Map<number, number>();
  depths.forEach((d, rank) => map.set(d, (rank + base) * 14));
  return map;
}
