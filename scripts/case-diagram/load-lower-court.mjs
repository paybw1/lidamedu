// feat-2-035 — 하급심 판결문 적재(로컬 캐시 → DB).
//
// fetch-lower-court.mjs 가 만든 캐시·리포트를 case_lower_courts 에 옮긴다.
// ★확보분만 넣지 않는다 — 미확보 건도 사유·원심 사건번호와 함께 행을 남겨야
//   운영 화면이 "무엇을 아직 못 구했고, 그때 무슨 번호를 구해와야 하는지"를 보여줄 수 있다.
//
//   node scripts/case-diagram/load-lower-court.mjs              # dry-run
//   node scripts/case-diagram/load-lower-court.mjs --apply
//
// 멱등 — case_id unique upsert. 캐시를 다시 받은 뒤 재실행하면 그대로 갱신된다.
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const APPLY = process.argv.includes("--apply");
const LAW = "patent";
const FROM = "2005-01-01";
const ROOT = path.resolve(process.cwd(), "source", "하급심 판결문");
const CACHE_DIR = path.join(ROOT, ".cache");
const REPORT = path.join(CACHE_DIR, `_report-${LAW}-2005~.json`);

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

function readCache(caseNumber) {
  const p = path.join(CACHE_DIR, `${caseNumber}.json`);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

async function main() {
  if (!fs.existsSync(REPORT)) {
    throw new Error(
      `리포트가 없습니다: ${REPORT}\n먼저 fetch-lower-court.mjs --from 2005 를 실행하세요.`,
    );
  }
  const report = JSON.parse(fs.readFileSync(REPORT, "utf8"));

  const { data: cases, error } = await sb
    .from("cases")
    .select("case_id, case_number, decided_at")
    .is("deleted_at", null)
    .contains("subject_laws", [LAW])
    .gte("decided_at", `${FROM}`)
    .order("decided_at");
  if (error) throw new Error(error.message);
  const idByNumber = new Map(cases.map((c) => [c.case_number, c.case_id]));

  // 리포트 4분류 → status. 확보(자동/자체/수기)는 캐시에서 전문을 읽어 담는다.
  const rows = [];
  const missingCase = [];

  const pushLoaded = (entry) => {
    const caseId = idByNumber.get(entry.case);
    if (!caseId) return missingCase.push(entry.case);
    const cache = readCache(entry.case);
    if (!cache?.text) return missingCase.push(`${entry.case}(캐시 없음)`);
    rows.push({
      case_id: caseId,
      status: "loaded",
      source_kind: cache.sourceKind,
      source_ref: cache.sourceRef ?? null,
      lower_case_number: cache.lowerCaseNumber ?? null,
      lower_court: (cache.sourceRef ?? "").split(" ")[0] || null,
      lower_decided_at: cache.decidedAt ?? null,
      law_serial_id: cache.serial ?? null,
      body_text: cache.text,
      char_count: cache.text.length,
      fetched_at: cache.fetchedAt ?? null,
      deleted_at: null,
    });
  };

  for (const e of report.lowerAuto ?? []) pushLoaded(e);
  for (const e of report.lowerSelf ?? []) pushLoaded(e);
  for (const e of report.lowerManual ?? []) pushLoaded(e);

  const pushMissing = (entry, status) => {
    const caseId = idByNumber.get(entry.case);
    if (!caseId) return missingCase.push(entry.case);
    // "특허법원 2021허4232" → 법원 / 사건번호 분리(구해 올 때 그대로 쓰는 정보).
    const ref = entry.lower ?? null;
    const m = ref ? /^(.*?)\s*(\d{4}[가-힣]{1,3}\d+)$/.exec(ref) : null;
    rows.push({
      case_id: caseId,
      status,
      source_kind: null,
      source_ref: ref,
      lower_case_number: m ? m[2] : null,
      lower_court: m ? m[1].trim() : null,
      lower_decided_at: null,
      law_serial_id: null,
      body_text: "",
      char_count: 0,
      fetched_at: null,
      deleted_at: null,
    });
  };

  for (const e of report.notInApi ?? []) pushMissing(e, "not_in_api");
  for (const e of report.noFacts ?? []) pushMissing(e, "summary_only");
  for (const e of report.noLowerRef ?? []) pushMissing(e, "no_ref");

  const byStatus = rows.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  const chars = rows.reduce((s, r) => s + r.char_count, 0);
  console.log(
    `대상 판례 ${cases.length}건 · 적재 행 ${rows.length}건\n` +
      Object.entries(byStatus)
        .map(([k, v]) => `  ${k}: ${v}`)
        .join("\n") +
      `\n전문 총 ${(chars / 1024 / 1024).toFixed(2)} MB`,
  );
  if (missingCase.length) {
    console.log(`\n[경고] cases 에서 못 찾은 사건번호 ${missingCase.length}건:`);
    console.log("  " + missingCase.slice(0, 20).join(", "));
  }

  if (!APPLY) {
    console.log("\n--apply 를 붙이면 적재합니다.");
    return;
  }

  // 전문이 커서 배치로 나눠 넣는다(요청 페이로드 상한 회피).
  const BATCH = 20;
  let done = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const { error: upErr } = await sb
      .from("case_lower_courts")
      .upsert(slice, { onConflict: "case_id" });
    if (upErr) throw new Error(`${i}~ 배치 실패: ${upErr.message}`);
    done += slice.length;
    console.log(`  ${done}/${rows.length}`);
  }
  console.log(`\n적재 완료 ${done}건.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
