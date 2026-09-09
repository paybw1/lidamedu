// 한 단원에 여러 쪽이 붙으면 두 쪽의 CSS 가 같은 `.digest-doc` 아래에서 섞인다.
// 같은 선택자를 서로 다른 내용으로 정의하고 있으면 화면이 엉킨다 — 그것만 찾는다.
//
//   node scripts/digest/check-css-collision.mjs
import { readFileSync } from "node:fs";

import { convert } from "./convert.mjs";

// import-digests.mjs 의 PAGES 와 같은 묶음 — 한 단원에 둘 이상 붙는 것만.
const GROUPS = [
  { node: "01 총칙/보칙", pages: [2, 3] },
  { node: "06 심판", pages: [8, 9] },
];

/** 선택자 → 규칙 본문. 같은 선택자가 여러 번이면 이어 붙인다. */
function rulesOf(page) {
  const { css } = convert(
    readFileSync(`scripts/digest/pages/digest-${page}p.html`, "utf8"),
    page,
  );
  const map = new Map();
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const sel = m[1].replace(/\s+/g, " ").trim();
    if (!sel || sel.startsWith("@")) continue;
    const body = m[2].replace(/\s+/g, " ").trim();
    map.set(sel, (map.get(sel) ?? "") + body);
  }
  return map;
}

let bad = 0;
for (const g of GROUPS) {
  const [a, b] = g.pages.map(rulesOf);
  const shared = [...a.keys()].filter((s) => b.has(s));
  const clash = shared.filter((s) => a.get(s) !== b.get(s));
  console.log(
    `${g.node} (${g.pages.join("p + ")}p) — 겹치는 선택자 ${shared.length}개 · 내용이 다른 것 ${clash.length}개`,
  );
  for (const s of clash) {
    bad += 1;
    console.log(`  ★ ${s}`);
    console.log(`     ${g.pages[0]}p: ${a.get(s).slice(0, 110)}`);
    console.log(`     ${g.pages[1]}p: ${b.get(s).slice(0, 110)}`);
  }
}
console.log(bad ? `\n★충돌 ${bad}건 — 쪽마다 스코프를 나눠야 합니다.` : "\n충돌 없음.");
process.exit(bad ? 1 : 0);
