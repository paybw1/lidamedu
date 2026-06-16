// 워크플로 검수 결과 처리 — ok=true 통과분 승인(content_md→explanation_md), ok=false/미판정 플래그 보고.
// 안전: 배치파일의 키 vs 초안 헤더('정답 X') 일치하는 ok 건만 승인. 정답키·본문 무변경.
//   node scripts/jagwa/process-review-results.mjs <output.json>            (dry-run)
//   node scripts/jagwa/process-review-results.mjs <output.json> --apply
import "dotenv/config";
import fs from "node:fs";
const REF = "mcgdoplovrjgklbxmozi";
const tok = process.env.SUPABASE_ACCESS_TOKEN;
if (!tok) throw new Error("missing SUPABASE_ACCESS_TOKEN");
const APPLY = process.argv.includes("--apply");
const OUT = process.argv.find((a, i) => i >= 2 && !a.startsWith("--"));
if (!OUT) throw new Error("usage: process-review-results.mjs <output.json> [--apply]");
async function dbQuery(q) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: q }),
  });
  const t = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${t}`);
  return JSON.parse(t);
}
const CIRCLE = { "①": 1, "②": 2, "③": 3, "④": 4, "⑤": 5 };

// 1) 워크플로 결과 파싱
const raw = fs.readFileSync(OUT, "utf8");
const parsed = JSON.parse(raw);
const data = Array.isArray(parsed) ? parsed : (parsed.result || []);

// 2) 배치파일 로드 → (subject|year|qno) → {problemId, keySym, contentMd}
const DIR = "tmp/jagwa/review-batches";
const manifest = JSON.parse(fs.readFileSync(`${DIR}/_manifest.json`, "utf8"));
const idMap = {};
const allKeys = new Set();
for (const m of manifest) {
  const arr = JSON.parse(fs.readFileSync(m.file, "utf8"));
  for (const x of arr) {
    const k = `${m.subject}|${m.year}|${x.qno}`;
    idMap[k] = { problemId: x.problemId, keySym: x.key, contentMd: x.contentMd };
    allKeys.add(k);
  }
}

// 3) 판정 집계
const seen = new Set();
const okGate = []; // 승인대상(헤더=키)
const headerSkip = []; // ok지만 헤더≠키 → 스킵
const flagged = []; // ok=false
for (const b of data) {
  for (const v of b.verdicts || []) {
    const mk = `${b.subject}|${b.year}|${v.qno}`;
    seen.add(mk);
    const info = idMap[mk];
    if (!info) continue;
    if (v.ok) {
      const hm = info.contentMd.match(/\*\*정답\s*([①②③④⑤])/);
      const hdr = hm ? hm[1] : null;
      if (hdr === info.keySym) okGate.push({ mk, problemId: info.problemId });
      else headerSkip.push({ mk, hdr, key: info.keySym });
    } else {
      flagged.push({ mk, issue: v.issue });
    }
  }
}
const missing = [...allKeys].filter((k) => !seen.has(k)); // 에이전트 미판정

console.log(`판정 ${seen.size}/${allKeys.size} · 통과·승인대상 ${okGate.length} · 헤더≠키 스킵 ${headerSkip.length} · 플래그(ok=false) ${flagged.length} · 미판정 ${missing.length}`);
console.log(`\n===== 플래그 ${flagged.length}건 (승인 제외, 검수 필요) =====`);
for (const f of flagged) console.log(`${f.mk.replace(/\|/g, " ")}: ${f.issue}`);
if (headerSkip.length) {
  console.log(`\n===== 헤더≠키 스킵 ${headerSkip.length}건 =====`);
  for (const h of headerSkip) console.log(`${h.mk.replace(/\|/g, " ")}: 헤더${h.hdr} 키${h.key}`);
}
if (missing.length) {
  console.log(`\n===== 미판정 ${missing.length}건 (에이전트 누락, 승인 제외) =====`);
  for (const m of missing) console.log(m.replace(/\|/g, " "));
}

if (!APPLY) { console.log("\n[dry-run] DB 무변경. 승인하려면 --apply"); }
else if (okGate.length === 0) { console.log("승인대상 0."); }
else {
  const ids = okGate.map((o) => `'${o.problemId}'`).join(",");
  const bk = await dbQuery(`select problem_id, explanation_md from problems where problem_id in (${ids});`);
  fs.mkdirSync("tmp/jagwa/approve-backups", { recursive: true });
  fs.writeFileSync(`tmp/jagwa/approve-backups/backup-workflow-batch-20260616.json`, JSON.stringify(bk, null, 2), "utf8");
  console.log(`\n백업: tmp/jagwa/approve-backups/backup-workflow-batch-20260616.json (${bk.length}행)`);
  await dbQuery(`begin;
    update public.problems p set explanation_md = d.content_md, updated_at = now()
      from public.problem_explanation_drafts d
      where d.problem_id = p.problem_id and p.problem_id in (${ids}) and d.status='pending';
    update public.problem_explanation_drafts d set status='approved', reviewed_at=now()
      where d.problem_id in (${ids}) and d.status='pending';
    commit;`);
  console.log(`✅ 승인 완료: ${okGate.length}건 (explanation_md ← content_md, status=approved). 정답키·본문 무변경.`);
}
