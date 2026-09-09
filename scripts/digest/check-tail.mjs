// 산출물 꼬리(검토용 「고친 곳」 기록)가 마지막 `</section>` 뒤에만 있는지 확인한다.
// 자료 본문이 거기 섞여 있으면 잘라 낼 때 함께 날아간다.
//   node scripts/digest/check-tail.mjs
import { readFileSync } from "node:fs";

const PAGES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
const ALLOWED = /^(?:<p class="foot">|<\/p>|<ul class="(?:changes|diffs)">|<\/ul>|<\/div>|<li|<span|<b>|<\/b>|<br>)/;

for (const p of PAGES) {
  const html = readFileSync(`scripts/digest/pages/digest-${p}p.html`, "utf8");
  const at = html.lastIndexOf("</section>");
  const tail = html.slice(at + "</section>".length);
  // 태그를 벗겨 남는 글이 있으면 그건 꼬리 설명글이다(정상). 태그 종류만 본다.
  const tags = [...tail.matchAll(/<(\/?[a-z]+)[^>]*>/g)].map((m) => m[1]);
  const kinds = [...new Set(tags)].join(" ");
  const bodyish = tags.filter((t) => /^(section|table|svg)$/.test(t));
  console.log(
    `${String(p).padStart(2)}p 꼬리 ${tail.trim().length}자 · 태그[${kinds}]${bodyish.length ? " ★본문 태그 섞임" : ""}`,
  );
}
console.log(`\n★ALLOWED 는 참고용 — 판정은 "본문 태그(section/table/svg) 섞임" 여부다. ${ALLOWED.source.slice(0, 0)}`);
