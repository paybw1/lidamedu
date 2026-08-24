// 원심 판결문 평문 정리 — PDF 추출본의 줄바꿈 깨짐을 되돌린다.
//
// 원본은 판결문 PDF 에서 뽑은 텍스트라 **문장 중간에서 줄이 끊긴다**. 사이사이에
// 쪽 번호("- 63 -")와 빈 줄까지 끼어들어, 그대로 그리면 한 문장이 서너 조각으로 보인다.
//   예) "…판단하여 결정하" / "" / "- 63 -" / "" / "여야 하는 것은 아니고, …"
//
// ★빈 줄을 문단 구분으로 쓰면 안 된다 — 위 예처럼 쪽 넘김 때문에 생긴 빈 줄이 대부분이다.

/** 쪽 번호 줄 — "- 63 -" · "63" 처럼 숫자만 있는 줄. */
const PAGE_MARK = /^\s*-?\s*\d{1,4}\s*-?\s*$/;

/** 새 문단을 시작하는 항목 번호. 판결문이 실제로 쓰는 형태만. */
const ITEM_MARK =
  /^\s*(?:[0-9]{1,2}\.|[0-9]{1,2}\)|\([0-9]{1,2}\)|[가-힣]\)|\([가-힣]\)|[①-⑳])\s/;

/**
 * ★문단의 진짜 신호는 **들여쓰기**다. 판결문은 문단 첫 줄만 2~4칸 들여쓰고
 *   이어지는 줄은 0칸에서 시작한다.
 * ★문장부호로 가르면 안 된다 — "…한다." 뒤에 이어지는 **같은 문단의 다음 문장**까지
 *   끊어져 오히려 더 잘게 부서진다(실측).
 */
const INDENTED = /^[ \t]{2,}\S/;

/**
 * 판결문 평문 → 문단 배열.
 * 쪽 번호를 걷어내고, 문장 중간에서 끊긴 줄을 이어 붙인다(한국어라 공백 없이 잇는다).
 */
export function reflowJudgmentText(raw: string): string[] {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => !PAGE_MARK.test(l));

  const paras: string[] = [];
  let buf = "";
  const flush = () => {
    const t = buf.trim();
    if (t) paras.push(t);
    buf = "";
  };

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue; // 빈 줄은 대부분 쪽 넘김 흔적 — 문단 구분으로 쓰지 않는다
    if (ITEM_MARK.test(line) || INDENTED.test(line)) {
      flush();
      buf = t;
      continue;
    }
    if (!buf) {
      buf = t;
      continue;
    }
    // ★한국어는 줄 끝에서 낱말이 잘리므로 공백 없이 잇는다.
    //   다만 ⅰ) 영문·숫자끼리 맞닿거나 ⅱ) 앞 줄이 문장으로 끝났으면 띄운다
    //   (문장이 끝났는데 붙이면 "…한다.또한" 이 된다 — 쪽 넘김으로 갈라진 같은 문단).
    const needsSpace =
      (/[A-Za-z0-9]$/.test(buf) && /^[A-Za-z0-9]/.test(t)) ||
      /[.。?!]$/.test(buf);
    buf += needsSpace ? ` ${t}` : t;
  }
  flush();
  return paras;
}
