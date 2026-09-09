// 목차 칸(th.k)에 무엇이 들어갔는지 훑는다 — 긴 글이 세로로 서면 칸이 길어진다.
//   node scripts/digest/pipeline/table-keycheck.mjs <만든.html>
import { readFileSync } from "node:fs";

const html = readFileSync(process.argv[2], "utf8");
const keys = [...html.matchAll(/<th class="k"([^>]*)>([\s\S]*?)<\/th>/g)].map((m) => ({
  cs: Number(m[1].match(/colspan="(\d+)"/)?.[1] ?? 1),
  lines: m[2].split("<br>").length,
  text: m[2].replace(/<br>/g, "·"),
}));
const long = keys.filter((k) => k.lines >= 6);
console.log(`목차 칸 ${keys.length}개 · 여섯 줄 이상 ${long.length}개`);
for (const k of keys) console.log(`  ${k.cs}칸 ${String(k.lines).padStart(2)}줄  ${k.text}`);
