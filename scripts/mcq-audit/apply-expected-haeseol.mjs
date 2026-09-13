// 예상문제 해설편 적재 — parse-expected-haeseol.mjs 가 만든 계획을 problems 에 반영.
//
// 배경(2026-09-12): 문제편 592문항만 적재되고 **해설편은 0건**이었다. 그래서 DB 의
// 예상문제 해설은 목차 조각·정답 지시문이었다(P-7497 = 「발명2」 3자).
// 해설편 원본에는 29.8만 자의 실제 해설이 있고, (단원, 문항번호)로 99.7% 매칭된다.
//
//   node scripts/mcq-audit/parse-expected-haeseol.mjs --json tmp/haeseol-plan.json
//   node scripts/mcq-audit/apply-expected-haeseol.mjs tmp/haeseol-plan.json           # dry-run
//   node scripts/mcq-audit/apply-expected-haeseol.mjs tmp/haeseol-plan.json --apply
//
// ★기존보다 **짧아지는 건은 건너뛴다**(원장 지시). 사람이 보강해 둔 해설을 덮지 않기 위해서다.
// ★적용 전 현재 explanation_md 를 전량 백업한다. 되돌리려면 --revert <백업파일>.

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import "dotenv/config";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const revertIdx = args.indexOf("--revert");
const REVERT = revertIdx >= 0 ? args[revertIdx + 1] : null;
// ★--only <ids.json> : 전량 적재 전에 **되돌리기가 되는지** 소수로 확인하기 위한 것.
//   백업 파일이 있다는 것과 복구가 된다는 것은 다르다(원장 지시 2026-09-12).
const onlyIdx = args.indexOf("--only");
const ONLY = onlyIdx >= 0 ? args[onlyIdx + 1] : null;
const onlySet = ONLY ? new Set(JSON.parse(fs.readFileSync(ONLY, "utf8"))) : null;
const planPath = args.find((a) => !a.startsWith("--") && a !== REVERT && a !== ONLY);

const BACKUP_DIR = "scripts/backups";
const CHUNK = 20;

const supa = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

/**
 * 책 레이아웃 → 마크다운.
 * ★첫 줄의 「해설」은 본문이 아니라 판면 라벨이다("해설① 헌법은…" → "① 헌법은…").
 *   문단 구분은 추출본이 이미 빈 줄로 갖고 있으므로 건드리지 않는다.
 */
const toMarkdown = (body) =>
  String(body ?? "")
    .replace(/^해설\s*/, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

async function runUpdates(rows, field) {
  let done = 0;
  const failed = [];
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    await Promise.all(
      slice.map(async (r) => {
        const { error } = await supa
          .from("problems")
          .update({ [field]: r.value, updated_at: new Date().toISOString() })
          .eq("problem_id", r.problemId);
        if (error) failed.push({ problemId: r.problemId, msg: error.message });
      }),
    );
    done += slice.length;
    process.stdout.write(`\r  반영 ${done}/${rows.length}`);
  }
  console.log("");
  return failed;
}

// ── 되돌리기 ───────────────────────────────────────────────────────────
if (REVERT) {
  const bak = JSON.parse(fs.readFileSync(REVERT, "utf8"));
  console.log(`되돌리기 ${bak.length}건 (${REVERT})`);
  if (!APPLY) {
    console.log("dry-run 입니다. --apply 를 붙이세요.");
    process.exit(0);
  }
  const failed = await runUpdates(
    bak.map((b) => ({ problemId: b.problem_id, value: b.explanation_md })),
    "explanation_md",
  );
  console.log(failed.length ? `실패 ${failed.length}건` : "되돌리기 완료");
  process.exit(failed.length ? 1 : 0);
}

if (!planPath || !fs.existsSync(planPath)) {
  console.error("사용: node scripts/mcq-audit/apply-expected-haeseol.mjs <plan.json> [--apply]");
  process.exit(1);
}

// ── 계획 읽기 + 거르기 ─────────────────────────────────────────────────
const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
const targets = [];
const skipped = { shorter: [], empty: [], same: [] };

for (const p of plan) {
  const md = toMarkdown(p.body);
  if (!md) {
    skipped.empty.push(p);
    continue;
  }
  if (md.length < p.curLen) {
    skipped.shorter.push({ ...p, mdLen: md.length });
    continue;
  }
  if (md.length === p.curLen) {
    skipped.same.push(p);
    continue;
  }
  targets.push({ problemId: p.problemId, displayNo: p.displayNo, value: md, curLen: p.curLen, newLen: md.length });
}

if (onlySet) {
  const before = targets.length;
  for (let i = targets.length - 1; i >= 0; i -= 1)
    if (!onlySet.has(targets[i].problemId)) targets.splice(i, 1);
  console.log(`--only ${ONLY} → ${before}건 중 ${targets.length}건만 반영`);
  if (targets.length !== onlySet.size) {
    console.error("★--only 목록과 대상 수가 다릅니다 — 중단");
    process.exit(1);
  }
}

const lens = targets.map((t) => t.newLen).sort((a, b) => a - b);
console.log(`계획 ${plan.length}건`);
console.log(`  반영 대상 ${targets.length}`);
console.log(`  건너뜀 — 짧아짐 ${skipped.shorter.length} · 동일 ${skipped.same.length} · 빈 본문 ${skipped.empty.length}`);
if (lens.length)
  console.log(
    `  새 해설 길이 min ${lens[0]} · p50 ${lens[Math.floor(lens.length / 2)]} · max ${lens.at(-1)}`,
  );
console.log(`  빈 칸 채움 ${targets.filter((t) => t.curLen === 0).length}건`);

if (skipped.shorter.length) {
  console.log("\n[건너뛴 것 — 기존이 더 김]");
  for (const s of skipped.shorter)
    console.log(`  P-${s.displayNo} ${s.curLen}자 (책 ${s.mdLen}자)`);
}

if (!APPLY) {
  console.log("\ndry-run 입니다. 반영하려면 --apply 를 붙이세요.");
  process.exit(0);
}

// ── 백업 ───────────────────────────────────────────────────────────────
fs.mkdirSync(BACKUP_DIR, { recursive: true });
const ids = targets.map((t) => t.problemId);
const backup = [];
for (let i = 0; i < ids.length; i += 100) {
  const { data, error } = await supa
    .from("problems")
    .select("problem_id, display_no, explanation_md")
    .in("problem_id", ids.slice(i, i + 100));
  if (error) throw error;
  backup.push(...(data ?? []));
}
const stamp = planPath.replace(/[^\w]/g, "_").slice(-24);
const bakPath = path.join(BACKUP_DIR, `expected_haeseol_before_${backup.length}_${stamp}.json`);
fs.writeFileSync(bakPath, JSON.stringify(backup, null, 2), "utf8");
console.log(`\n백업 ${backup.length}건 → ${bakPath}`);
if (backup.length !== targets.length) {
  console.error("★백업 건수가 대상과 다릅니다 — 중단");
  process.exit(1);
}

// ── 반영 ───────────────────────────────────────────────────────────────
const failed = await runUpdates(targets, "explanation_md");
if (failed.length) {
  console.error(`실패 ${failed.length}건`);
  for (const f of failed.slice(0, 5)) console.error(`  ${f.problemId} ${f.msg}`);
}

// ── 검증 ───────────────────────────────────────────────────────────────
let checked = 0;
let mismatch = 0;
for (let i = 0; i < ids.length; i += 100) {
  const { data } = await supa
    .from("problems")
    .select("problem_id, explanation_md")
    .in("problem_id", ids.slice(i, i + 100));
  for (const row of data ?? []) {
    const want = targets.find((t) => t.problemId === row.problem_id);
    checked += 1;
    if ((row.explanation_md ?? "").length !== want.newLen) mismatch += 1;
  }
}
console.log(`검증 ${checked}건 · 길이 불일치 ${mismatch}건`);
console.log(mismatch ? "★불일치 있음 — 확인 필요" : "반영 완료");
