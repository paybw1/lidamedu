// 기출 본문에서 (법령, 조문번호) 인용을 뽑는다 — 추출·자료집 양쪽이 함께 쓴다.
//
// ★한 곳에서만 판정해야 한다. 예전에 자료집 쪽이 "본문에 '제101조' 라는 글자가 있는가"
//   로 문 단위 인용을 갈랐더니, 같은 회차에서 특허법 제101조와 저작권법 제101조가
//   함께 인용된 13회에서 **특허법 문에 저작권법 조문이, 저작권법 문에 특허법 조문이**
//   붙었다(10회 제30조도 같은 충돌). 조문번호는 법이 다르면 얼마든지 겹친다.
export const LAW_ALIASES = [
  ["부정경쟁방지 및 영업비밀보호에 관한 법률", ["부정경쟁방지 및 영업비밀보호에 관한 법률", "부정경쟁방지법"]],
  ["디자인보호법", ["디자인보호법"]],
  ["실용신안법", ["실용신안법"]],
  ["저작권법", ["저작권법"]],
  ["상표법", ["상표법"]],
  ["특허법", ["특허법"]],
];

/** 조문 표기 — 가지번호는 "제35조의3" 이지 "제35의3조" 가 아니다. */
export const artLabel = (num) => {
  const m = String(num).match(/^(\d+)의(\d+)$/);
  return m ? `제${m[1]}조의${m[2]}` : `제${num}조`;
};

/**
 * 인용 추출. 조문번호만으로는 어느 법인지 알 수 없으므로 **직전에 나온 법령명**에
 * 귀속시킨다("｢저작권법｣ 제28조와 제35조의5를 중심으로" → 둘 다 저작권법).
 * 법령명이 앞에 없으면 버린다 — 단정하지 않는 쪽이 안전하다.
 */
export function citationsOf(text) {
  const lawRe = new RegExp(LAW_ALIASES.flatMap(([, al]) => al).join("|"), "g");
  const marks = [...text.matchAll(lawRe)].map((m) => ({
    at: m.index,
    law: LAW_ALIASES.find(([, al]) => al.includes(m[0]))[0],
  }));
  const out = new Map();
  // ★가지번호(의N)는 붙여 쓴 것만 인정한다. "제5조의 2차적 저작물" 을 "제5조의2" 로
  //   읽던 오탐이 있었다(10회 실제 사례).
  for (const m of text.matchAll(/제\s*(\d+)\s*조(?:의(\d+))?/g)) {
    const prior = marks.filter((x) => x.at < m.index).pop();
    if (!prior) continue;
    const num = m[2] ? `${m[1]}의${m[2]}` : m[1];
    const key = `${prior.law}|${num}`;
    if (!out.has(key)) out.set(key, { law: prior.law, article: num });
  }
  return [...out.values()];
}
