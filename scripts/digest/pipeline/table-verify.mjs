// 만들어 낸 표가 교재 표와 같은지 대조한다 — 칸 수·병합·글자.
//
//   node scripts/digest/pipeline/table-verify.mjs <쪽번호> <만든.html>
//
// ★글자는 <br> 과 공백을 없앤 뒤 비교한다. 줄바꿈 자리는 우리가 바꾸지만
//   글자 자체가 바뀌면 안 된다.
import { readFileSync } from "node:fs";

const [pageArg, file] = process.argv.slice(2);
const page = Number(pageArg);
const doc = JSON.parse(readFileSync("scripts/digest/pipeline/정리비교표.json", "utf8"));
const srcTables = doc.pages[page - 1].tables ?? [];
const outHtml = readFileSync(file, "utf8");

const cellsOf = (html) =>
  // ★`<thead>` 가 `<th` + `ead` 로 걸린다 — 속성은 공백으로 시작해야 한다.
  [...html.matchAll(/<(td|th)((?:\s[^>]*)?)>([\s\S]*?)<\/\1>/g)].map((m) => ({
    attrs: m[2],
    text: m[3].replace(/<br>/g, "").replace(/\s+/g, ""),
    cs: Number(m[2].match(/colspan="(\d+)"/)?.[1] ?? 1),
    rs: Number(m[2].match(/rowspan="(\d+)"/)?.[1] ?? 1),
  }));

const src = srcTables.flatMap((t) => cellsOf(t));
const got = cellsOf(outHtml.slice(outHtml.indexOf("<div class=\"wrap\">")));

let bad = 0;
const n = Math.max(src.length, got.length);
for (let i = 0; i < n; i += 1) {
  const a = src[i];
  const b = got[i];
  if (!a || !b) {
    console.log(`  ${i}: ${a ? "빠짐" : "남음"} — ${(a ?? b).text.slice(0, 30)}`);
    bad += 1;
    continue;
  }
  if (a.text !== b.text || a.cs !== b.cs || a.rs !== b.rs) {
    bad += 1;
    console.log(`  ${i}: 다름`);
    console.log(`      교재 ${a.cs}x${a.rs} ${a.text.slice(0, 40)}`);
    console.log(`      화면 ${b.cs}x${b.rs} ${b.text.slice(0, 40)}`);
  }
}
console.log(`${page}p 대조: 교재 ${src.length}칸 / 화면 ${got.length}칸 · 다른 칸 ${bad}`);
process.exit(bad ? 1 : 0);
