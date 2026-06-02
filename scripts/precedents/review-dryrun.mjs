// dry-run 결과 사람 검수용 표시 — apply 전 사용자 승인 절차.
//
// 각 upgrade 건: [강사 입력] → [API 사건번호] → [cases 사건번호] 3자 + 사건명 + 주문.
// 한자 비율 가장 높은 1건은 전문 길게 (1500자) 노출.
//
// 사용: node scripts/precedents/review-dryrun.mjs

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config();
const SUPA = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const REPORT_PATH = resolve(process.cwd(), "tmp/law-api-import-report.json");
const RAW_DIR = resolve(process.cwd(), "tmp/law-api-raw");
if (!existsSync(REPORT_PATH)) { process.stderr.write("report 없음 — dry-run 먼저 실행\n"); process.exit(1); }
const report = JSON.parse(readFileSync(REPORT_PATH, "utf-8"));

function pickTag(xml, tag) {
  const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(xml);
  if (!m) return null;
  return m[1].replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "").trim();
}

// 한자 (CJK Unified Ideographs) 비율.
function hanjaRatio(s) {
  if (!s) return 0;
  const hanja = (s.match(/[一-鿿]/g) ?? []).length;
  const total = s.replace(/\s/g, "").length;
  return total > 0 ? hanja / total : 0;
}

// 본문에서 "【주    문】" 단락 추출.
function extractJumun(fullText) {
  if (!fullText) return null;
  const m = /【주[\s ]*문】([\s\S]*?)(?:【|$)/.exec(fullText);
  return m ? m[1].trim().slice(0, 400) : null;
}

// 본문 앞쪽 "원고/피고/원심" 식별부 추출.
function extractHeader(fullText) {
  if (!fullText) return null;
  // 첫 주문 직전까지.
  const cut = fullText.indexOf("【주");
  return (cut > 0 ? fullText.slice(0, cut) : fullText.slice(0, 600)).trim();
}

// cases.case_number, case_title 조회.
async function loadCases(items) {
  const ids = items.map((i) => i.caseId);
  const { data } = await SUPA.from("cases").select("case_id, case_number, case_title, subject_laws").in("case_id", ids);
  const map = new Map((data ?? []).map((r) => [r.case_id, r]));
  return map;
}

const upgrades = report.upgrade ?? [];
const newCands = report.newCandidate ?? [];
const failed = report.failed ?? [];

console.log(`\n=== dry-run 사람 검수 — upgrade ${upgrades.length}건 ===\n`);
const casesMap = await loadCases(upgrades);

// 한자 비율 측정.
const withHanja = upgrades.map((u) => ({ ...u, hanjaRatio: hanjaRatio(u.apply?.official_text_md ?? "") }));
const longestHanja = withHanja.reduce((a, b) => (b.hanjaRatio > a.hanjaRatio ? b : a), { hanjaRatio: -1 });

for (const u of upgrades) {
  const svcPath = resolve(RAW_DIR, `${u.serialId}.service.xml`);
  const svcXml = existsSync(svcPath) ? readFileSync(svcPath, "utf-8") : "";
  const apiCaseNumber = pickTag(svcXml, "사건번호");
  const apiCaseTitle = pickTag(svcXml, "사건명");
  const apiCourt = pickTag(svcXml, "법원명");
  const apiDecidedAt = pickTag(svcXml, "선고일자");
  const dbRow = casesMap.get(u.caseId);
  const fullText = u.apply?.official_text_md ?? "";
  const header = extractHeader(fullText);
  const jumun = extractJumun(fullText);
  const ratio = (hanjaRatio(fullText) * 100).toFixed(2);
  const isLongest = u === longestHanja || u.serialId === longestHanja.serialId;

  console.log(`────────────────────────────────────────────────────────────`);
  console.log(`강사 입력:  "${u.input}"`);
  console.log(`            ↓ 정규화`);
  console.log(`정규 토큰:  ${u.inputToken}`);
  console.log(`            ↓ 목록 → ID=${u.serialId} → 본문`);
  console.log(`API 응답:   사건번호=${apiCaseNumber}  사건명="${apiCaseTitle?.slice(0, 60) ?? ""}"  ${apiCourt} ${apiDecidedAt}`);
  console.log(`            ↓ cases 매칭 (case_id=${u.caseId.slice(0, 8)}…)`);
  console.log(`cases DB:   사건번호=${dbRow?.case_number}  case_title="${dbRow?.case_title?.slice(0, 60) ?? ""}"  subject_laws=[${dbRow?.subject_laws?.join(",")}]`);
  console.log(`전문:       ${fullText.length}자, 한자 비율 ${ratio}%${isLongest ? "  ★ 한자 최다 — 아래 길게 표시" : ""}`);
  console.log(``);
  console.log(`  ◆ 본문 헤더(원고·피고·원심):`);
  console.log(`    ${(header ?? "").replace(/\n/g, "\n    ")}`);
  console.log(``);
  console.log(`  ◆ 주문:`);
  console.log(`    ${(jumun ?? "(추출 실패)").replace(/\n/g, "\n    ")}`);
  console.log(``);
}

// 한자 최다 1건 — 전문 길게.
if (longestHanja.hanjaRatio > 0) {
  console.log(`\n=== ★ 한자 비율 최다 — 전문 1,500자 ===\n`);
  console.log(`사건번호: ${longestHanja.inputToken}  /  한자비율 ${(longestHanja.hanjaRatio * 100).toFixed(2)}%\n`);
  const longText = longestHanja.apply?.official_text_md ?? "";
  console.log(longText.slice(0, 1500));
  console.log(`\n  …(전체 ${longText.length}자 중 1,500자 노출)`);
}

if (newCands.length > 0) {
  console.log(`\n=== ⚠ newCandidate (cases 미존재, --insert-new 별도 결정) ===\n`);
  for (const n of newCands) {
    console.log(`  ${n.inputToken}  ${n.meta?.법원명} ${n.meta?.선고일자} "${n.meta?.사건명?.slice(0, 60)}"`);
  }
} else {
  console.log(`\n=== newCandidate: 0건 ===`);
}

if (failed.length > 0) {
  console.log(`\n=== ✗ failed (매칭 실패) ===\n`);
  for (const f of failed) {
    console.log(`  "${f.input}" → ${f.reason}${f.listCount != null ? `  listCount=${f.listCount}` : ""}${f.matchCount ? `  ambiguous=${f.matchCount}` : ""}`);
  }
}

console.log(`\n=== 종합 ===`);
console.log(`  upgrade ${upgrades.length} / newCandidate ${newCands.length} / failed ${failed.length}`);
console.log(`  apply 명령:  node scripts/precedents/import-law-precedents.ts --apply`);
