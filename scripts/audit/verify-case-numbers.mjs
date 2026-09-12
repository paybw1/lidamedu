// 사건번호 목록만 골라 실재 조회 — audit-case-citations.mjs 의 **부분 실행**용.
//
// 본 도구는 --verify 를 붙이면 미수록 전량(675종)을 조회한다. 표본만 확인하고 싶을 때가
// 있어 목록 입력을 따로 받는다. 조회 함수와 **캐시 파일이 같아** 여기서 확인한 결과는
// 본 도구를 다시 돌릴 때 그대로 재사용된다(중복 조회 없음).
//
//   node scripts/audit/verify-case-numbers.mjs scripts/sql/audit/g4-20.txt
//   node scripts/audit/verify-case-numbers.mjs 2005후3352 2009후3919
//
// 파일 형식: 한 줄에 하나. `#` 로 시작하는 줄은 주석. 탭 뒤 열은 무시한다.
// ★판정은 두 소스(casenote + 국가법령정보센터)를 본다 — 한 소스로 부존재를 단정하지 않는다.
// ★null(조회 실패)은 캐시에 남기지 않는다. 본 도구와 같은 규칙이다.
import fs from "node:fs";
import path from "node:path";

import { verifyCaseNumber } from "../lib/law-precedent-lookup.mjs";

const CACHE_PATH = path.resolve(process.cwd(), "tmp", "law-precedent-cache.json");

const loadCache = () => {
  try {
    return new Map(Object.entries(JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"))));
  } catch {
    return new Map();
  }
};
const saveCache = (c) => {
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(Object.fromEntries(c), null, 0));
};

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("사용: node scripts/audit/verify-case-numbers.mjs <목록파일 | 사건번호…>");
  process.exit(1);
}

const numbers = [];
for (const a of args) {
  if (fs.existsSync(a)) {
    for (const line of fs.readFileSync(a, "utf8").split(/\r?\n/)) {
      const t = line.split("\t")[0].trim();
      if (t && !t.startsWith("#")) numbers.push(t);
    }
  } else {
    numbers.push(a.trim());
  }
}
const uniq = [...new Set(numbers)];
console.log(`조회 대상 ${uniq.length}종\n`);

const cache = loadCache();
let looked = 0;
const verdict = new Map();
for (const n of uniq) {
  if (cache.has(n) && cache.get(n) !== null) {
    verdict.set(n, cache.get(n));
    console.log(`   ${n.padEnd(14)} ${cache.get(n) ? "실재" : "없음"}  (캐시)`);
    continue;
  }
  const live = await verifyCaseNumber(n);
  verdict.set(n, live);
  cache.set(n, live);
  looked += 1;
  console.log(
    `   ${n.padEnd(14)} ${live === true ? "실재" : live === false ? "★없음" : "조회실패"}`,
  );
  if (looked % 10 === 0) saveCache(cache);
}
saveCache(cache);

const real = uniq.filter((n) => verdict.get(n) === true);
const fake = uniq.filter((n) => verdict.get(n) === false);
const failed = uniq.filter((n) => verdict.get(n) == null);
console.log(
  `\n조회 ${looked}종(캐시 ${uniq.length - looked}) · ` +
    `실재 ${real.length} · **실재하지 않음 ${fake.length}** · 조회실패 ${failed.length}`,
);
if (fake.length) console.log(`\n[지어낸 것 의심]\n   ${fake.sort().join("\n   ")}`);
if (failed.length) console.log(`\n[조회 실패 — 사람이 확인]\n   ${failed.sort().join("\n   ")}`);
