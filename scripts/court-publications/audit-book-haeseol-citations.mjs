// 상표 교재가 적어 둔 「대법원 판례해설 N호 M면」 인용을 총목록과 대조한다.
//
// 교재 인용은 면수는 정확한데 호수가 밀린 것이 있었다(2018년 이후 4건에서 +2·+4).
// 89건 전부를 (호수, 면수) 로 총목록에 조회해 맞는지 본다.
//
// 판정
//   일치      — 그 호 그 면에 글이 있다
//   호수오기  — 같은 면수의 글이 다른 호에 있다(면수는 맞고 호수만 틀림)
//   면수불명  — 그 호에 그 면이 없다(지식재산권 분야 색인 밖일 수 있음)
//
// 사용: node scripts/court-publications/audit-book-haeseol-citations.mjs
import "dotenv/config";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

import { parseToc } from "./lib-haeseol-toc.mjs";

const OLD = /^대법원\s*판례해설\s*(\d+(?:-\d+)?)\s*호(?:\s*(\d+)\s*면)?\s*$/;
const toc = parseToc();
console.log(`총목록 지식재산권 ${toc.length}건`);
const byVolPage = new Map();
const byPage = new Map();
for (const e of toc) {
  byVolPage.set(`${e.vol}|${e.page}`, e);
  if (!byPage.has(e.page)) byPage.set(e.page, []);
  byPage.get(e.page).push(e);
}

// ── 교재 인용 89건 모으기 ───────────────────────────────────────────────────
// ① 제목·저자를 채워 넣은 57건(백업에 원표기가 남아 있다)
// ② 같은 글이 두 번 실려 지운 12건
// ③ 아직 옛 형식 그대로인 것들
const cites = [];
const readJson = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : []);
for (const x of readJson("tmp/haeseol-enrich-backup.json"))
  cites.push({ from: "보강", caseNo: x.caseNo, cite: x.before.title, now: x.after.source, refId: x.reference_id });
for (const x of readJson("tmp/haeseol-dedup-backup.json"))
  cites.push({ from: "중복정리", caseId: x.case_id, cite: x.title, now: null, refId: x.reference_id });

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const refs = [];
for (let f = 0; ; f += 1000) {
  const { data, error } = await sb.from("case_references")
    .select("reference_id, case_id, title, source").order("reference_id").range(f, f + 999);
  if (error) throw error;
  refs.push(...data);
  if (data.length < 1000) break;
}
for (const r of refs)
  if (OLD.test((r.title ?? "").trim()))
    cites.push({ from: "미보강", caseId: r.case_id, cite: r.title.trim(), now: null, refId: r.reference_id });

// 사건번호 붙이기
const ids = [...new Set(cites.map((c) => c.caseId).filter(Boolean))];
for (let i = 0; i < ids.length; i += 150) {
  const { data } = await sb.from("cases").select("case_id, case_number, subject_laws").in("case_id", ids.slice(i, i + 150));
  for (const c of data)
    for (const x of cites) if (x.caseId === c.case_id) { x.caseNo = c.case_number; x.law = String(c.subject_laws); }
}

console.log(`교재 인용 ${cites.length}건 (보강 ${cites.filter((c) => c.from === "보강").length} · 중복정리 ${cites.filter((c) => c.from === "중복정리").length} · 미보강 ${cites.filter((c) => c.from === "미보강").length})`);

// ── 대조 ────────────────────────────────────────────────────────────────────
const tally = new Map();
const rows = [];
for (const c of cites) {
  const m = OLD.exec(c.cite);
  const vol = m?.[1] ?? null, page = m?.[2] ? Number(m[2]) : null;
  let verdict, note = "";
  if (!vol || !page) { verdict = "면수없음"; }
  else if (byVolPage.has(`${vol}|${page}`)) {
    verdict = "일치";
    note = byVolPage.get(`${vol}|${page}`).title.slice(0, 34);
  } else if (byPage.has(page)) {
    const alt = byPage.get(page);
    verdict = "호수오기";
    note = alt.map((e) => `${e.vol}호 ${e.page}면 (${e.pub}) ${e.title.slice(0, 26)}`).join(" / ");
  } else { verdict = "면수불명"; }
  tally.set(verdict, (tally.get(verdict) ?? 0) + 1);
  rows.push({ ...c, vol, page, verdict, note });
}
console.log("\n판정:", [...tally].map(([k, v]) => `${k} ${v}`).join(" · "));
for (const v of ["호수오기", "면수불명", "면수없음"]) {
  const list = rows.filter((r) => r.verdict === v);
  if (!list.length) continue;
  console.log(`\n── ${v} (${list.length})`);
  for (const r of list) console.log(`  ${r.caseNo ?? "?"} [${r.from}] "${r.cite}"${r.note ? ` → ${r.note}` : ""}${r.now ? ` | 현재 ${r.now}` : ""}`);
}
fs.mkdirSync("tmp", { recursive: true });
fs.writeFileSync("tmp/book-haeseol-citation-audit.json", JSON.stringify(rows, null, 1));
console.log("\n→ tmp/book-haeseol-citation-audit.json");
