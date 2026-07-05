// 민법 정오문제 조문 매칭 — 검증 통과(verified) 제안 일괄 승인.
// 사용자(원장) 지시에 따른 일괄 반영(2026-07-05). 가드:
//   · verified=true AND status='pending' AND suggested_article_number NOT NULL 만
//   · 대상 지문의 related_article_id 가 여전히 NULL 인 행만 UPDATE(.is null)
//   · 사전 백업 JSON + 사후 재집계
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const APPLY = process.argv.includes("--apply");
const c = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const ADMIN_ID = "e20ac99a-bfa6-4862-94dd-23c063189463"; // 임병웅 admin — 일괄 승인 지시자

const { data: law } = await c.from("laws").select("law_id").eq("law_code", "civil").single();
const artMap = new Map();
for (let from = 0; ; from += 1000) {
  const { data } = await c
    .from("articles")
    .select("article_id, article_number")
    .eq("law_id", law.law_id)
    .eq("level", "article")
    .range(from, from + 999);
  for (const a of data) artMap.set(a.article_number, a.article_id);
  if (data.length < 1000) break;
}

// 대상 제안 로드 (페이지네이션)
const suggestions = [];
for (let from = 0; ; from += 1000) {
  const { data } = await c
    .from("ox_article_suggestions")
    .select("suggestion_id, ref_type, ref_id, suggested_article_number")
    .eq("law_code", "civil")
    .eq("verified", true)
    .eq("status", "pending")
    .not("suggested_article_number", "is", null)
    .order("suggestion_id")
    .range(from, from + 999);
  suggestions.push(...(data ?? []));
  if ((data ?? []).length < 1000) break;
}
console.log("일괄 승인 대상(검증 통과·pending):", suggestions.length);

const missingArt = suggestions.filter((s) => !artMap.has(s.suggested_article_number));
if (missingArt.length) {
  console.log("★DB에 없는 조문 제안(스킵):", missingArt.length);
}
const applicable = suggestions.filter((s) => artMap.has(s.suggested_article_number));

writeFileSync(
  "tmp/jagwa/civil-ox-bulk-approve-backup.json",
  JSON.stringify(applicable, null, 1),
);
console.log("백업 저장: tmp/jagwa/civil-ox-bulk-approve-backup.json");

if (!APPLY) {
  console.log("(dry-run — --apply 로 반영)");
  process.exit(0);
}

let linked = 0, alreadySet = 0, err = 0;
for (const s of applicable) {
  const table = s.ref_type === "choice" ? "problem_choices" : "problem_box_items";
  const idCol = s.ref_type === "choice" ? "choice_id" : "box_item_id";
  const { data: updated, error } = await c
    .from(table)
    .update({
      related_article_id: artMap.get(s.suggested_article_number),
      related_article_number: s.suggested_article_number,
    })
    .eq(idCol, s.ref_id)
    .is("related_article_id", null)
    .select(idCol);
  if (error) {
    console.log("ERR", s.ref_id, error.message);
    err++;
    continue;
  }
  if ((updated ?? []).length === 0) {
    alreadySet++; // 이미 다른 경로로 연결됨 — 제안만 승인 표시 없이 스킵
    continue;
  }
  const { error: e2 } = await c
    .from("ox_article_suggestions")
    .update({ status: "approved", decided_by: ADMIN_ID, decided_at: new Date().toISOString() })
    .eq("suggestion_id", s.suggestion_id);
  if (e2) { console.log("ERR(제안 상태)", s.suggestion_id, e2.message); err++; }
  else linked++;
  if (linked % 200 === 0) console.log("진행", linked, "/", applicable.length);
}
console.log(`완료 — 연결 ${linked} · 기연결 스킵 ${alreadySet} · 오류 ${err}`);

// 사후 재집계 — 민법 적격 지문 조문 연결 현황
const { data: probs } = await c.from("problems").select("problem_id").eq("law_id", law.law_id).is("deleted_at", null).limit(2000);
const pids = probs.map((p) => p.problem_id);
let eligible = 0, withArtCnt = 0;
for (const table of ["problem_choices", "problem_box_items"]) {
  for (let i = 0; i < pids.length; i += 150) {
    const { data: rows } = await c
      .from(table)
      .select("ox_truth, ox_ineligible, related_article_id")
      .in("problem_id", pids.slice(i, i + 150))
      .limit(10000);
    for (const r of rows ?? []) {
      if (r.ox_ineligible || !r.ox_truth) continue;
      eligible++;
      if (r.related_article_id) withArtCnt++;
    }
  }
}
console.log(`재집계 — 적격 ${eligible} 중 조문 연결 ${withArtCnt} (${Math.round((withArtCnt / eligible) * 100)}%)`);
