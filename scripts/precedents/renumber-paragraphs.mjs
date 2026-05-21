// 판례 비고(comment_body_md) / 판시이유(reasoning_md) 의 paragraph numbering 정책 통일.
//
// 정책 (사용자 결정):
//   - paragraphs.length === 1 → prefix 없음 (hwpx 원본 ▪ 1개 케이스).
//     · 직전 add-comment-numbering 작업이 "1. " 을 강제 부여한 단일 paragraph 비고는 제거.
//     · 판시이유 단일 paragraph 가 본문 자연스레 "1. ..." 으로 시작하는 경우는 손대지 않는다.
//   - paragraphs.length >= 2 → "1. " / "2. " / "3. " ... 부여 (hwpx 원본 ▪ 다수).
//     · 이미 "N. " 으로 시작하는 paragraph 는 skip (중복 부여 방지).
//
// 본문 변경 시 case.comment / case.reasoning staff highlight 의 offset 도 재계산
// (Prose 의 textContent flow — paragraphs.join("") 기준).
//
// 사용:
//   node scripts/precedents/renumber-paragraphs.mjs --field comment              # dry-run
//   node scripts/precedents/renumber-paragraphs.mjs --field comment --apply
//   node scripts/precedents/renumber-paragraphs.mjs --field reasoning --apply
//   node scripts/precedents/renumber-paragraphs.mjs --field reasoning --case 2017후523

import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv();

const APPLY = process.argv.includes("--apply");
const fieldIdx = process.argv.indexOf("--field");
const FIELD = fieldIdx >= 0 ? process.argv[fieldIdx + 1] : null;
const caseIdx = process.argv.indexOf("--case");
const ONLY_CASE = caseIdx >= 0 ? process.argv[caseIdx + 1] : null;
const STAFF_USER_ID = "8dbc9c0e-a32d-456e-bf53-bf89160669e0";

if (FIELD !== "comment" && FIELD !== "reasoning") {
  console.error("--field comment | reasoning 필요");
  process.exit(1);
}

const COL = FIELD === "comment" ? "comment_body_md" : "reasoning_md";
const FIELD_PATH = FIELD === "comment" ? "case.comment" : "case.reasoning";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요");
  process.exit(1);
}
const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function sha256Hex(s) {
  return createHash("sha256").update(s, "utf-8").digest("hex");
}

function splitParas(md) {
  return (md ?? "").split(/\n{2,}/);
}

// paragraph 가 "N. " 또는 "N. \t" 형태로 시작 — 이미 numbering 부여됨.
function alreadyNumbered(p) {
  return /^\s*\d+\.\s/.test(p);
}

// 정책 적용 — paragraphs 가 1개면 numbering 제거(비고만), 2+ 이면 부여.
// 반환: 새 본문 (변경 없으면 입력 그대로).
function applyPolicy(body) {
  const paras = splitParas(body);
  const nonEmptyCount = paras.filter((p) => p.trim() !== "").length;

  if (nonEmptyCount === 1) {
    if (FIELD !== "comment") return body; // 판시이유 single 은 손대지 않음
    // 비고 single: "1. " (또는 "1.\t") 강제 부여 흔적이면 제거.
    return paras
      .map((p) => {
        if (p.trim() === "") return p;
        // 첫 비-공백 토큰이 "1." 인 경우 — 본문 시작이 "1. xxx"
        return p.replace(/^(\s*)1\.\s+/, "$1");
      })
      .join("\n\n");
  }

  // nonEmptyCount >= 2 — numbering 부여.
  let n = 0;
  return paras
    .map((p) => {
      if (p.trim() === "") return p;
      n += 1;
      if (alreadyNumbered(p.trimStart())) return p;
      return `${n}. ${p}`;
    })
    .join("\n\n");
}

// Prose textContent flow — paragraphs.join("") (split 후 빈 paragraph 제거).
function textContent(md) {
  return splitParas(md ?? "")
    .filter((s) => s.trim() !== "")
    .join("");
}

async function main() {
  console.log(`mode  : ${APPLY ? "APPLY" : "DRY-RUN"}`);
  console.log(`field : ${FIELD} (column=${COL}, fieldPath=${FIELD_PATH})`);

  // 1) 대상 case 조회 (patent 우선 — 다른 과목 추가 import 시 동일 정책 적용)
  let q = supabase
    .from("cases")
    .select(`case_id, case_number, ${COL}`)
    .contains("subject_laws", ["patent"])
    .not(COL, "is", null)
    .is("deleted_at", null);
  if (ONLY_CASE) q = q.eq("case_number", ONLY_CASE);
  const { data: cases, error } = await q;
  if (error) {
    console.error("cases 조회 실패:", error.message);
    process.exit(1);
  }
  console.log(`cases (with ${FIELD}): ${cases.length}`);

  // 2) 정책 적용 + 변경 후보 정리.
  const updates = [];
  let skipNoChange = 0;
  let policyApplied = { strip: 0, number: 0 };
  for (const c of cases) {
    const before = c[COL] ?? "";
    const after = applyPolicy(before);
    if (after === before) {
      skipNoChange += 1;
      continue;
    }
    const paraCount = splitParas(before).filter((p) => p.trim() !== "").length;
    if (paraCount === 1) policyApplied.strip += 1;
    else policyApplied.number += 1;
    updates.push({
      case_id: c.case_id,
      case_number: c.case_number,
      before,
      after,
    });
  }
  console.log(
    `updates: ${updates.length} (single→strip ${policyApplied.strip} / multi→number ${policyApplied.number}), skip-no-change: ${skipNoChange}`,
  );

  // 3) 영향받는 case 의 staff highlight 가져오기 (이 field_path 한정).
  const targetIds = updates.map((u) => u.case_id);
  const hlByCase = new Map();
  for (let i = 0; i < targetIds.length; i += 500) {
    const slice = targetIds.slice(i, i + 500);
    if (slice.length === 0) continue;
    const { data: hls } = await supabase
      .from("user_highlights")
      .select("highlight_id, target_id, start_offset, end_offset, label, color")
      .eq("user_id", STAFF_USER_ID)
      .eq("target_type", "case")
      .eq("field_path", FIELD_PATH)
      .is("deleted_at", null)
      .in("target_id", slice);
    for (const h of hls ?? []) {
      const arr = hlByCase.get(h.target_id) ?? [];
      arr.push(h);
      hlByCase.set(h.target_id, arr);
    }
  }
  const totalHls = [...hlByCase.values()].reduce((a, arr) => a + arr.length, 0);
  console.log(
    `staff highlights (field_path=${FIELD_PATH}) to recompute: ${totalHls} in ${hlByCase.size} cases`,
  );

  // 4) hl offset 재계산 — 새 textContent 에서 label 순차 매칭.
  const hlUpdates = [];
  let hlMatched = 0;
  let hlUnmatched = 0;
  for (const u of updates) {
    const hls = (hlByCase.get(u.case_id) ?? [])
      .slice()
      .sort((a, b) => a.start_offset - b.start_offset);
    if (hls.length === 0) continue;
    const newText = textContent(u.after);
    let cursor = 0;
    for (const h of hls) {
      const label = h.label ?? "";
      if (!label) {
        hlUnmatched += 1;
        continue;
      }
      const idx = newText.indexOf(label, cursor);
      if (idx < 0) {
        hlUnmatched += 1;
        continue;
      }
      hlMatched += 1;
      hlUpdates.push({
        highlight_id: h.highlight_id,
        start_offset: idx,
        end_offset: idx + label.length,
        content_hash: sha256Hex(label),
      });
      cursor = idx + label.length;
    }
  }
  console.log(
    `highlight offset recompute: matched=${hlMatched}, unmatched=${hlUnmatched}`,
  );

  // dry-run 미리보기.
  if (!APPLY) {
    if (updates[0]) {
      const u = updates[0];
      console.log(`\n--- sample (${u.case_number}) ---`);
      console.log(`BEFORE: ${u.before.slice(0, 200)}...`);
      console.log(`AFTER : ${u.after.slice(0, 200)}...`);
    }
    console.log(`\n(dry-run — 실제 변경 안 함. --apply 로 실행)`);
    return;
  }

  // 5) cases.{COL} update.
  console.log(`\ncases ${COL} update ...`);
  let okC = 0;
  let failC = 0;
  for (const u of updates) {
    const { error: e } = await supabase
      .from("cases")
      .update({ [COL]: u.after })
      .eq("case_id", u.case_id);
    if (e) {
      console.error(`  ${u.case_number} 실패: ${e.message}`);
      failC += 1;
    } else okC += 1;
  }
  console.log(`  ok=${okC}, fail=${failC}`);

  // 6) staff highlight offset update.
  console.log(`\nstaff highlight offset update ...`);
  let okH = 0;
  let failH = 0;
  for (const h of hlUpdates) {
    const { highlight_id, ...patch } = h;
    const { error: e } = await supabase
      .from("user_highlights")
      .update(patch)
      .eq("highlight_id", highlight_id);
    if (e) {
      console.error(`  ${highlight_id} 실패: ${e.message}`);
      failH += 1;
    } else okH += 1;
  }
  console.log(`  ok=${okH}, fail=${failH}`);

  console.log(`\n=== 완료 ===`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
