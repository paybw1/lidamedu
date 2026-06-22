// 판례 암기 카드(srs_items, source_type=case) front 의 표준 인용(법원·선고일·번호·사건유형) 누락 정정.
// feat-2-023b 이전 생성된 stale front(citation 없음)를 현재 코드 규칙대로 재계산해 갱신.
// 코드는 정상 — 데이터만 stale(생성 시점 front 고정). source 키 case:{id}#{idx} 로 case 매칭.
//
// 순수 함수는 app/features/cases/labels.ts(buildCitation) · app/features/srs/lib/case-card.ts
// (composeCaseTopic/Front) · card-gen.server.ts(parseSummaryItemsLite) 에서 verbatim 복제(드리프트 주의).
//
// 사용: node scripts/jagwa/fix-case-card-fronts.mjs            (dry-run)
//       node scripts/jagwa/fix-case-card-fronts.mjs --apply    (운영 적용)
import "dotenv/config";

const REF = "mcgdoplovrjgklbxmozi";
const tok = process.env.SUPABASE_ACCESS_TOKEN;
if (!tok) throw new Error("missing SUPABASE_ACCESS_TOKEN");
if (!String(process.env.SUPABASE_URL).includes(REF))
  throw new Error(`SAFETY: SUPABASE_URL !=${REF} → refusing`);
const APPLY = process.argv.includes("--apply");

async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${t}`);
  return JSON.parse(t);
}

// ── 순수 함수 (canonical 소스 verbatim) ──────────────────────────────
const COURT_LABELS = {
  supreme: "대법원",
  patent_court: "특허법원",
  high_court: "고등법원",
  district_court: "지방법원",
};
function buildCitation(opts) {
  const parts = [COURT_LABELS[opts.court] ?? "법원"];
  if (opts.isEnBanc) parts.push("전원합의체");
  const m = (opts.decidedAt ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) parts.push(`${Number(m[1])}. ${Number(m[2])}. ${Number(m[3])}.`, "선고");
  if (opts.caseNumber) parts.push(opts.caseNumber);
  parts.push("판결");
  let s = parts.join(" ");
  if (opts.caseType) s += ` 【${opts.caseType}】`;
  return s.replace(/\s+/g, " ").trim();
}
const stripIssueNumber = (s) => (s ?? "").replace(/^\s*\[\d+\]\s*/, "").trim();
function bareIssueNumber(s) {
  const m = (s ?? "").trim().match(/^\[(\d+)\]$/);
  return m ? Number(m[1]) : null;
}
function composeCaseTopic(itemTitle, caseTitle, idx) {
  const item = stripIssueNumber(itemTitle);
  if (item) return item;
  const n = bareIssueNumber(itemTitle) ?? idx + 1;
  const base = stripIssueNumber(caseTitle) || "쟁점";
  return `${base} (쟁점 ${n})`;
}
const composeCaseFront = (citation, topic) => `${citation}\n${topic}`;
function parseSummaryItemsLite(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const it of raw) {
    if (!it || typeof it !== "object") continue;
    if (typeof it.title === "string" && typeof it.body === "string")
      out.push({ title: it.title, body: it.body });
  }
  return out;
}

// ── 재계산 ───────────────────────────────────────────────────────────
const rows = await sql(`
  select s.item_id, s.source, s.front,
         c.court, c.decided_at, c.case_number, c.case_type, c.is_en_banc,
         c.case_title, c.nickname, c.summary_items
  from srs_items s
  join cases c on c.case_id = s.source_id
  where s.source_type='case' and s.deleted_at is null
  order by s.created_at`);

const updates = [];
let unchanged = 0;
for (const r of rows) {
  const citation = buildCitation({
    court: r.court,
    decidedAt: r.decided_at,
    caseNumber: r.case_number,
    caseType: r.case_type,
    isEnBanc: r.is_en_banc ?? false,
  });
  const titleSrc = r.case_title ?? r.nickname ?? null;
  const items = parseSummaryItemsLite(r.summary_items);
  const hashPart = String(r.source ?? "").split("#")[1] ?? "";
  let topic;
  if (hashPart === "full" || items.length === 0) {
    topic = "판결요지";
  } else {
    const idx = Number(hashPart);
    const it = items[idx];
    topic = composeCaseTopic(it ? it.title : null, titleSrc, Number.isFinite(idx) ? idx : 0);
  }
  const newFront = composeCaseFront(citation, topic);
  if (newFront === r.front) unchanged += 1;
  else updates.push({ item_id: r.item_id, before: r.front, after: newFront });
}

console.log(`판례 카드 ${rows.length}개 · 변경 필요 ${updates.length} · 이미 정상 ${unchanged}`);
for (const u of updates.slice(0, 8)) {
  console.log(`\n  [${u.item_id.slice(0, 8)}]`);
  console.log(`   before: ${JSON.stringify(u.before.slice(0, 70))}`);
  console.log(`   after : ${JSON.stringify(u.after.slice(0, 70))}`);
}
if (updates.length > 8) console.log(`\n  … 외 ${updates.length - 8}건`);

if (!APPLY) {
  console.log(`\n[DRY-RUN] 적용하려면 --apply. (변경 ${updates.length}건)`);
  process.exit(0);
}
if (updates.length === 0) {
  console.log("\n변경할 카드 없음.");
  process.exit(0);
}
const esc = (s) => s.replace(/'/g, "''");
const values = updates.map((u) => `('${u.item_id}'::uuid, '${esc(u.after)}')`).join(",\n");
const res = await sql(`
  update srs_items s set front = v.front
  from (values\n${values}\n  ) as v(item_id, front)
  where s.item_id = v.item_id`);
console.log(`\n[APPLIED] ${updates.length}건 front 갱신 완료.`, JSON.stringify(res));
