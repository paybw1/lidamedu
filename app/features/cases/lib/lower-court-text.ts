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

/**
 * 좌표 복원 전 추출기가 만든 **"조각난 텍스트"** 정도(0~1).
 *
 * 예전 추출기는 판결문 PDF 의 텍스트 런을 순서대로 이어 붙여, 문장이 조각나고 숫자가
 * 줄 끝으로 밀렸다("갑 제호증 5(9)"). 사실관계는 날짜·번호가 그대로 남아야 하는 자료라
 * 이런 텍스트를 AI 입력으로 쓰면 사실을 잘못 옮긴다 — 소스에서 뺀다.
 *
 * 실측 분포가 뚜렷한 이봉형이라(정상 0.00~0.05 / 조각 0.20~0.39) 그 사이를 자른다.
 * ★배치 생성기(draft-diagrams)와 재추출 스크립트가 **같은 판정**을 써야 한다 —
 *   따로 두면 한쪽이 뺀 것을 다른 쪽이 통과시킨다.
 */
export const SCRAMBLE_MAX = 0.15;

export function scrambleRatio(text: string): number {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 20) return 0;
  const junk = lines.filter(
    (l) => l.length <= 3 && /^[\s.,'"“”‘’()[\]0-9-]+$/.test(l),
  ).length;
  return junk / lines.length;
}

/**
 * 판결서 인터넷열람 사이트가 **쪽마다 찍는 안내 문구**. 본문이 아니다.
 *
 * ★스캔 PDF(본문이 이미지)를 추출하면 이 안내문만 텍스트로 남는다 — 95쪽짜리
 *   판결문(서울고등법원 2015라20296)이 7,622자를 내놓지만 실질은 0자다.
 *   그대로 AI 에 넣으면 "판결문 본문이 제공되지 않아…" 같은 **사과문**이
 *   사실관계 칸에 들어앉아, 정리된 것처럼 보이면서 내용이 없다(원장 지적 2026-08-27).
 */
const NOTICE_LINES: readonly RegExp[] = [
  /판결서\s*인터넷\s*열람/,
  /영리목적으로\s*이용하거나\s*무단\s*배포를\s*금합니다/,
  /게시일자\s*[:：]/,
  /^\[.*\.pdf\]$/i,
];

/** 안내문·파일명 머리글을 걷어낸 **실질 본문 글자 수**. */
export function substantiveLength(text: string): number {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !NOTICE_LINES.some((re) => re.test(l)))
    .join("").length;
}

/**
 * 사실관계 소스로 쓸 수 있는 최소 실질 글자 수.
 *
 * 실측(하급심 261건, 2026-08-27): 껍데기 6건은 실질 **0자**, 그다음으로 짧은 실물
 * 판결문이 **550자**(2012나2197)다. 사이가 통째로 비어 있어 300 으로 자른다 —
 * 실물을 잘못 걸러낼 여지가 없고, 껍데기는 전부 잡힌다.
 * ★scrambleRatio 와 같은 이유로 여기 한 곳에만 둔다 — 생성기와 재추출기가 서로
 *   다른 판정을 쓰면 한쪽이 뺀 것을 다른 쪽이 통과시킨다.
 */
export const SUBSTANTIVE_MIN = 300;

/** 안내문만 있고 판결 내용이 없는 껍데기인가. */
export function isBoilerplateOnly(text: string): boolean {
  return substantiveLength(text) < SUBSTANTIVE_MIN;
}
