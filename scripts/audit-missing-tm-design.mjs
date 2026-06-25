// 상표/디자인 기출 워크북(리담 상표+디자인 기출문제편 [제3판]) 누락 감사 (read-only).
//
// seed-tm-design-problems.mjs 도 patent 와 동일하게 선지≠5 / correctIndex==null 문제를 skip한다.
// 그 병합본(source/_converted/tm-design-merged.json)을 운영 DB(trademark+design)와 대조해
// DB 에 없는(=skip됐을) 문제를 찾아 보고만 한다(삽입은 별도 단계, allow-list 검증 후).
//
// 사용: node scripts/audit-missing-tm-design.mjs

import { createClient } from "@supabase/supabase-js";
import "dotenv/config";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REF = "mcgdoplovrjgklbxmozi";
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const MERGED = resolve(ROOT, "source/_converted/tm-design-merged.json");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL?.includes(REF)) {
  console.error(`SAFETY: SUPABASE_URL 이 ${REF}(운영) 아님 → 중단`);
  process.exit(1);
}
const supa = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// 박스형 발문은 "질문? | ㄱ. … ㄴ. …" 형태라, DB(깨끗한 질문만 저장)와 맞추려면
// 파이프 앞 "질문 핵심부"만으로 대조해야 오탐(이미 live인데 박스텍스트 때문에 불일치)을 막는다.
const norm = (s) =>
  (s || "").split(/[|｜]/)[0].split("\n")[0].replace(/\s+/g, "").trim();

const { problems } = JSON.parse(readFileSync(MERGED, "utf8"));

const { data: laws } = await supa
  .from("laws")
  .select("law_id, law_code")
  .in("law_code", ["trademark", "design"]);
const codeById = new Map((laws ?? []).map((l) => [l.law_id, l.law_code]));
const ids = [...codeById.keys()];

const { data: dbRows, error } = await supa
  .from("problems")
  .select("law_id, year, body_md")
  .in("law_id", ids)
  .is("deleted_at", null);
if (error) {
  console.error(error);
  process.exit(1);
}

const dbCount = new Map();
for (const r of dbRows) {
  const k = `${codeById.get(r.law_id)}|${r.year}|${norm(r.body_md)}`;
  dbCount.set(k, (dbCount.get(k) || 0) + 1);
}

const missing = [];
for (const p of problems) {
  const k = `${p.lawCode}|${p.year}|${norm(p.stem)}`;
  const c = dbCount.get(k) || 0;
  if (c > 0) dbCount.set(k, c - 1);
  else missing.push(p);
}

// 워크북/DB 요약
const byCode = (arr, code) => arr.filter((p) => p.lawCode === code).length;
console.log(
  `워크북 ${problems.length}(상표 ${byCode(problems, "trademark")}/디자인 ${byCode(problems, "design")}) · DB ${dbRows.length} · 누락 후보 ${missing.length}\n`,
);

for (const p of missing) {
  const cc = p.choices?.length ?? 0;
  const flag = cc !== 5 ? `★선지${cc}` : p.correctIndex == null ? "★정답null" : "5지문+정답";
  console.log(
    `■ ${p.lawCode} ${p.year} #${p.problemNumber} [${flag}] 정답 ${p.correctIndex ?? "-"}`,
  );
  console.log(`   ${(p.stem || "").replace(/\s+/g, " ").slice(0, 88)}`);
}
