// 판례 교재 제10판 — **책 뒤 색인**으로 publication_content_map.page_no 를 전수 대조.
//
// ★색인 줄 꼴: 「대법원 1992. 6. 2.자 91마540 결정 【특허권침해금지가처분】58」
//   판결/결정 둘 다 있고, 「선고」가 없는 「…자 …결정」도 있다. 끝의 숫자가 쪽이다.
// ★이 색인이 쪽의 권위다 — publication_content_map 은 여기서 왔고, 어긋나면 적재 오류다.
//
//   node scripts/errata/audit-case-book-pages.mjs [--apply]

import { execSync } from "node:child_process";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const F = "source/특허법/특허법판례/[완0702+내지] 리담특허법 판례 [제10판].hwpx";
const APPLY = process.argv.includes("--apply");

const xml = execSync(`unzip -p "${F}" "Contents/section*.xml"`, { maxBuffer: 1 << 28 }).toString("utf8");
const paras = [];
for (const m of xml.matchAll(/<hp:p\b[\s\S]*?(?=<hp:p\b|$)/g)) {
  const t = (m[0].match(/<hp:t(?:\s[^>]*)?>([\s\S]*?)<\/hp:t>/g) ?? [])
    .map((x) => x.replace(/<[^>]*>/g, "")).join("")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").trim();
  if (t) paras.push(t);
}

const idx = new Map();
for (const t of paras) {
  if (!/】\s*\d{1,4}\s*$/.test(t)) continue;
  const page = Number(t.match(/】\s*(\d{1,4})\s*$/)[1]);
  // 사건번호 = 【 앞의 마지막 「연도+한글+숫자」 토큰
  const head = t.slice(0, t.indexOf("【"));
  const nos = [...head.matchAll(/(\d{2,4}[가-힣]{1,3}\d+)/g)].map((m) => m[1]);
  if (!nos.length) continue;
  idx.set(nos[nos.length - 1], page);
}
console.log(`색인에서 읽은 판례 ${idx.size}건`);

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: pub } = await supa.from("publications").select("publication_id").eq("title", "리담특허법 판례").single();
const { data: eds } = await supa.from("publication_editions").select("edition_id, edition_label").eq("publication_id", pub.publication_id);
const { data: maps } = await supa.from("publication_content_map")
  .select("map_id, content_id, page_no, sort_key").eq("edition_id", eds[0].edition_id).eq("content_type", "precedent");
const ids = maps.map((m) => m.content_id);
const cases = [];
for (let i = 0; i < ids.length; i += 100) {
  const { data } = await supa.from("cases").select("case_id, case_number, nickname").in("case_id", ids.slice(i, i + 100));
  cases.push(...data);
}
const by = new Map(cases.map((c) => [c.case_id, c]));

let ok = 0;
const bad = [], miss = [];
for (const m of maps) {
  const c = by.get(m.content_id);
  const want = c ? idx.get(c.case_number) : undefined;
  if (want == null) { miss.push({ m, c }); continue; }
  if (want === m.page_no) ok += 1;
  else bad.push({ map_id: m.map_id, case_no: c.case_number, db: m.page_no, book: want });
}
console.log(`대조 — 일치 ${ok} · 불일치 ${bad.length} · 색인에 없음 ${miss.length} (매핑 ${maps.length})`);
if (bad.length) {
  console.log("\n[불일치 — 책 색인이 정답]");
  for (const b of bad) console.log(`  ${b.case_no.padEnd(14)} DB p.${String(b.db ?? "-").padStart(4)} → 책 p.${b.book}`);
}
if (miss.length) {
  console.log("\n[색인에 없음 — 손대지 않는다]");
  for (const x of miss) console.log(`  ${String(x.c?.case_number ?? "?").padEnd(14)} DB p.${String(x.m.page_no ?? "-").padStart(4)} ${x.c?.nickname ?? ""}`);
}

if (!APPLY) { console.log("\ndry-run. --apply 를 붙이세요."); } else if (bad.length) {
  fs.mkdirSync("scripts/backups", { recursive: true });
  fs.writeFileSync("scripts/backups/20260913_case_page_no_before.json", JSON.stringify(bad, null, 2), "utf8");
  let done = 0;
  for (const b of bad) {
    const { error } = await supa.from("publication_content_map").update({ page_no: b.book }).eq("map_id", b.map_id);
    if (error) console.error(`  ★${b.case_no}: ${error.message}`); else done += 1;
  }
  console.log(`\n반영 ${done}/${bad.length}`);
}
