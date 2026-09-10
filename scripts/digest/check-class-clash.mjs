// 정리비교표가 쓰는 클래스 이름이 **앱의 Tailwind 유틸리티와 겹치는지** 검사한다.
//
//   node scripts/digest/check-class-clash.mjs
//
// ★2026-09-10 실사례: 표에 붙인 `class="fixed"`(뜻: table-layout:fixed)가 Tailwind 의
//   `.fixed`(position:fixed)와 겹쳐, 표가 흐름에서 빠져 팝업에 붙었다. 오른쪽이 잘리고
//   스크롤도 듣지 않았다. 2p 의 `.grid` 도 `display:grid` 를 먹었다.
//   자료 CSS 를 `.digest-doc` 아래로 접어도 **앱의 전역 유틸리티는 그대로 맞는다**.
import { readFileSync } from "node:fs";

import { convert } from "./convert.mjs";

const SITE = "https://www.lidamipedu.com";
const PAGES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

const root = await fetch(SITE).then((r) => r.text());
const cssUrls = [...new Set([...root.matchAll(/"(\/assets\/[^"]+\.css)"/g)].map((m) => m[1]))];
let siteCss = "";
for (const u of cssUrls) siteCss += await fetch(SITE + u).then((r) => r.text());

// 앱 CSS 에서 **한 클래스만으로 쓰이는** 선택자를 모은다(전역 유틸리티).
const util = new Set();
for (const m of siteCss.matchAll(/(?:^|[,{}])\s*\.([A-Za-z][\w-]*)\s*(?=[,{])/g)) {
  util.add(m[1]);
}
console.log(`앱 유틸리티 클래스 ${util.size}개 수집`);

const clash = new Map();
for (const page of PAGES) {
  const { bodyHtml } = convert(
    readFileSync(`scripts/digest/pages/digest-${page}p.html`, "utf8"),
    page,
  );
  for (const m of bodyHtml.matchAll(/class="([^"]+)"/g)) {
    for (const c of m[1].split(/\s+/)) {
      if (!c || c.startsWith("digest-")) continue;
      if (util.has(c)) {
        const at = clash.get(c) ?? new Set();
        at.add(page);
        clash.set(c, at);
      }
    }
  }
}

if (!clash.size) {
  console.log("겹치는 이름 없음.");
  process.exit(0);
}
console.log(`★겹치는 이름 ${clash.size}개:`);
for (const [c, pages] of [...clash].sort()) {
  console.log(`   .${c}  ← ${[...pages].map((p) => `${p}p`).join(" ")}`);
}
process.exit(1);
