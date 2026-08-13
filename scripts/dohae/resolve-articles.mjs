// 도해특허법 유닛의 조문 참조(lawRefs) → 운영 DB articles.article_id 해소.
//
//   node scripts/dohae/resolve-articles.mjs
//
// - 특허법(patent)만 DB 해소. 발진법·실용신안법은 DB 미수록 — external 로 보존.
// - "132의2~132의15" 같은 의N 범위는 같은 본조 내에서 전개.
// - 결과를 dohae-patent.json 에 unit.articleIds 로 병합 저장 + 미해소 리포트.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import "dotenv/config";

const ROOT = resolve(import.meta.dirname, "../..");
const JSON_PATH = resolve(ROOT, "source/_converted/dohae-patent.json");

const REF = "mcgdoplovrjgklbxmozi";
const tok = process.env.SUPABASE_ACCESS_TOKEN;
async function q(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(body));
  return body;
}

const data = JSON.parse(readFileSync(JSON_PATH, "utf8"));

const rows = await q(
  "select a.article_id, a.article_number from articles a join laws l on l.law_id=a.law_id " +
    "where l.law_code='patent' and a.level='article' and a.deleted_at is null",
);
const byNumber = new Map(rows.map((r) => [r.article_number, r.article_id]));
console.log("특허법 조문:", byNumber.size, "개 로드");

// 범위 전개 — DB 조문 목록 기반. "20~24"·"215~224의5"·"106의2~115" 모두
// (본조, 의N) 사전식 구간 [시작, 끝] 안의 실존 조문 번호로 전개된다.
// (본조 범위 안의 "103의2" 같은 곁가지 조문도 포함 — 도해 표기 관례와 일치)
const allNumbers = rows.map((r) => r.article_number);
function parseNum(n) {
  const m = /^(\d+)(?:의(\d+))?$/.exec(n);
  return m ? { b: Number(m[1]), s: m[2] ? Number(m[2]) : 0 } : null;
}
const cmpNum = (a, b) => a.b - b.b || a.s - b.s;
function expandUiRange(token) {
  const m = /^(\d+(?:의\d+)?)~(\d+(?:의\d+)?)$/.exec(token);
  if (!m) return [token];
  const st = parseNum(m[1]);
  const en = parseNum(m[2]);
  if (!st || !en) return [token];
  const hit = allNumbers.filter((n) => {
    const p = parseNum(n);
    return p && cmpNum(p, st) >= 0 && cmpNum(p, en) <= 0;
  });
  // 실존 조문이 하나도 없으면(폐지 구간 등) 시작·끝 토큰으로 미해소 보고되게 둔다.
  return hit.length > 0 ? hit : [m[1], m[2]];
}

const unmatched = new Map(); // token → [unit titles]
let totalTokens = 0;
let resolvedTokens = 0;

for (const u of data.units) {
  const ids = new Set();
  for (const ref of u.lawRefs ?? []) {
    if (ref.law !== "patent") continue; // 발진법·실용신안법 — external 보존
    for (const raw of ref.articles) {
      for (const token of expandUiRange(raw)) {
        totalTokens++;
        const id = byNumber.get(token);
        if (id) {
          ids.add(id);
          resolvedTokens++;
        } else {
          const arr = unmatched.get(token) ?? [];
          arr.push(u.title);
          unmatched.set(token, arr);
        }
      }
    }
  }
  u.articleIds = [...ids];
}

// 커버리지: DB 특허법 조문 중 도해가 참조하는 조문 수
const covered = new Set(data.units.flatMap((u) => u.articleIds));

console.log(`토큰 해소: ${resolvedTokens}/${totalTokens}`);
console.log(`조문 커버리지: 특허법 ${byNumber.size}개 중 ${covered.size}개 참조됨`);
console.log("유닛별: 참조 보유", data.units.filter((u) => u.articleIds.length > 0).length, "/", data.units.length);
if (unmatched.size > 0) {
  console.log("\n⚠ 미해소 토큰:");
  for (const [tk, titles] of unmatched) console.log(`  法 ${tk} ← ${[...new Set(titles)].join(" · ")}`);
} else {
  console.log("미해소 토큰: 0");
}

writeFileSync(JSON_PATH, JSON.stringify(data, null, 1), "utf8");
console.log("저장:", JSON_PATH);
