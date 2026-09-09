// 화면에 들어갈 본문이 (1) 검토용 기록을 물고 오지 않았는지 (2) 태그가 짝이 맞는지.
//   node scripts/digest/check-body.mjs
//
// ★꼬리를 마지막 `</section>` 에서 자르면 2p·10p 는 감싸개를 닫는 `</div>` 까지
//   날아가 짝이 어긋난다. 그래서 짝 검사를 같이 한다.
import { readFileSync } from "node:fs";

import { convert } from "./convert.mjs";

const PAGES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
const VOID = new Set(["br", "col", "img", "input", "hr", "path", "circle", "line", "polyline", "polygon", "rect", "use"]);
const 기록 = /class="(?:foot|changes|diffs)"|교재와 다른 점|고친 곳|다른 곳|정리비교표 재작화/;

let bad = 0;
for (const p of PAGES) {
  const { bodyHtml } = convert(
    readFileSync(`scripts/digest/pages/digest-${p}p.html`, "utf8"),
    p,
  );

  // 짝 검사 — 여는 태그를 쌓고 닫는 태그로 뺀다.
  const stack = [];
  let broken = "";
  for (const m of bodyHtml.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)[^>]*?(\/?)>/g)) {
    const [, close, name, self] = m;
    const tag = name.toLowerCase();
    if (VOID.has(tag) || self) continue;
    if (!close) stack.push(tag);
    else if (stack.at(-1) === tag) stack.pop();
    else if (!broken) broken = `</${tag}> 자리에 ${stack.at(-1) ?? "없음"}`;
  }
  const leftover = stack.length ? `안 닫힘 ${stack.join(",")}` : "";
  const hasLog = 기록.test(bodyHtml);
  if (broken || leftover || hasLog) bad += 1;
  console.log(
    `${String(p).padStart(2)}p ${bodyHtml.length}자 · ${hasLog ? "★검토 기록 남음" : "기록 없음"}` +
      `${broken ? ` · ★${broken}` : ""}${leftover ? ` · ★${leftover}` : ""}`,
  );
}
console.log(bad ? `\n★문제 ${bad}쪽` : "\n전 쪽 정상.");
process.exit(bad ? 1 : 0);
