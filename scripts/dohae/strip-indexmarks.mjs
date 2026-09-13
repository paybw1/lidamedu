// 도해 본문에서 **색인 표시 글자**를 걷어낸다.
//
// 배경(2026-09-13 원장 지적): 「단어가 두 번 올라가 있다」.
//   원본 HWPX 의 <hp:ctrl><hp:indexmark><hp:firstKey>…</hp:firstKey> 는 책 뒤
//   찾아보기를 만들기 위한 표시라 지면에 안 찍히는데, 파서가 본문으로 긁었다.
//     「포괄위임포괄위임등록」  ← 색인어 「포괄위임」이 앞에 붙음
//     「…행위규제)노하우」      ← 인접 낱말과 달라 엉뚱한 말이 붙음
//   파서는 고쳤다(hwpx-to-text.mjs · parse-dohae-book.mjs 의 색인 태그 제외).
//   이 스크립트는 **이미 적재된 것**을 고친다.
//
// ★재시드를 쓰지 않는 이유 — 원장이 손댄 편집분이 지워진다(도해 유닛 편집 규칙).
//   그래서 「앞 24자 + 색인어 + 뒤 24자」를 통째로 맞춘 자리만 바꾼다(앵커 치환).
//   앵커가 안 맞으면 건너뛴다. 여러 자리에 맞으면 --ambiguous 없이는 건너뛴다.
//
//   node scripts/dohae/strip-indexmarks.mjs                    # dry-run
//   node scripts/dohae/strip-indexmarks.mjs --show 5           # 전후 전문 대조
//   node scripts/dohae/strip-indexmarks.mjs --apply
//   node scripts/dohae/strip-indexmarks.mjs --revert <백업>

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const HWPX = "source/특허법/도해특허법/[완0227+내지] 도해특허법 (제20판).hwpx";
const BOOK = "dohae_patent_20";
const BACKUP_DIR = "scripts/backups";
const ANCHOR = 24;

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const AMBIG = args.includes("--ambiguous");
const SHOW = args.includes("--show") ? Number(args[args.indexOf("--show") + 1]) : 0;
const REVERT = args.includes("--revert") ? args[args.indexOf("--revert") + 1] : null;

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ── 되돌리기 ───────────────────────────────────────────────────────────
if (REVERT) {
  const bak = JSON.parse(fs.readFileSync(REVERT, "utf8"));
  console.log(`되돌리기 ${bak.length}건 (${REVERT})`);
  if (!APPLY) { console.log("dry-run 입니다. --apply 를 붙이세요."); process.exit(0); }
  let ok = 0;
  for (const b of bak) {
    const { error } = await supa.from("dohae_units")
      .update({ blocks: b.blocks, updated_at: new Date().toISOString() })
      .eq("unit_id", b.unit_id);
    if (error) console.error(`  ★${b.unit_key}: ${error.message}`); else ok += 1;
  }
  console.log(ok === bak.length ? "되돌리기 완료" : `★실패 ${bak.length - ok}건`);
  process.exit(ok === bak.length ? 0 : 1);
}

// ── 원본에서 앵커 뽑기 ─────────────────────────────────────────────────
const xml = execSync(`unzip -p "${HWPX}" "Contents/section*.xml"`, { maxBuffer: 1 << 28 }).toString("utf8");
const unesc = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
// ★앞쪽 <hp:t> 를 **소비하지 않는다**. 색인 표시가 연달아 나오면(한 run 안에 둘)
//   앞엣것이 뒤엣것의 앞 텍스트를 먹어 111개 중 80개밖에 안 잡혔다(2026-09-13).
//   앞쪽은 따로 보고, 매칭은 「색인어 + 뒤 텍스트」가 맡는다.
const RE = /<hp:indexmark>\s*<hp:firstKey>([^<]*)<\/hp:firstKey>[\s\S]*?<\/hp:ctrl>\s*<hp:t(?:\s[^>]*)?\s*(?:\/>|>((?:(?!<\/hp:t>)[\s\S])*)<\/hp:t>)/g;
const PREV_RE = /<hp:t(?:\s[^>]*)?>((?:(?!<\/hp:t>)[\s\S])*)<\/hp:t>\s*$/;
const strip = (s) => unesc(String(s ?? "")).replace(/<[^>]*>/g, "");

const marks = [];
for (const m of xml.matchAll(RE)) {
  const key = unesc(m[1] ?? "");
  if (!key) continue;
  const head = xml.slice(Math.max(0, m.index - 600), m.index).replace(/<hp:ctrl>s*$/, "");
  const pm = PREV_RE.exec(head);
  marks.push({ prev: pm ? strip(pm[1]).slice(-ANCHOR) : "", key, next: strip(m[2]).slice(0, ANCHOR) });
}
// 뒤 노드가 <hp:t> 가 아닌 색인 표시(<hp:lineBreak/>·연속 <hp:ctrl> 등)는 위 RE 가
// 놓친다. 그런 것은 「색인어 + 그 끝 낱말」 규칙(3단)만으로 잡는다.
const ALL_KEYS = /<hp:firstKey>([^<]*)<\/hp:firstKey>/g;
const seen = new Set(marks.map((m) => m.key));
for (const m of xml.matchAll(ALL_KEYS)) {
  const key = unesc(m[1] ?? "");
  if (!key || seen.has(key)) continue;
  seen.add(key);
  marks.push({ prev: "", key, next: "" });
}

const totalMarks = (xml.match(/<hp:indexmark>/g) ?? []).length;
console.log(`원본 색인 표시 ${totalMarks}개 · 앞뒤 앵커를 뽑은 것 ${marks.length}개`);

// ── 저장본에 적용 ──────────────────────────────────────────────────────
const { data: rows, error } = await supa.from("dohae_units")
  .select("unit_id, unit_key, title, pdf_page, blocks").eq("book_code", BOOK).order("pdf_page");
if (error) throw error;

const changed = new Map();   // unit_id → { row, before, after, edits[] }
const skipped = { short: [], absent: [], ambiguous: [] };

// 앵커는 2단. 앞뒤 모두 맞추는 것이 원칙이지만, 앞쪽 <hp:t> 에 <hp:nbSpace/> 같은
// 인라인 태그가 끼면 공백이 어긋나 안 맞는다. 그때는 **뒤쪽만** 맞춘다 —
// 「색인어 + 그 뒤 실제 본문」이라 이미 충분히 특정된다(그 조합은 삽입분에만 있다).
// 3단 — 색인어 바로 뒤에 **그 색인어의 끝 낱말**이 이어지는 꼴.
//   「大判 99후2372」 + 「99후2372 등)」 처럼 판례 색인은 「大判 」이 붙어 있어
//   앞뒤 앵커가 어긋나도 이 꼴로는 확실히 잡힌다. 본문이 사건번호를 이렇게
//   연달아 두 번 쓰는 일은 없으므로 오탐이 아니다.
const lastToken = (k) => {
  const parts = String(k).trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : null;
};

const tiers = (mk) => {
  const t = [
    { needle: mk.prev + mk.key + mk.next, repl: mk.prev + mk.next, how: "앞뒤" },
    { needle: mk.key + mk.next, repl: mk.next, how: "뒤쪽" },
  ];
  const lt = lastToken(mk.key);
  if (lt && lt.length >= 4) t.push({ needle: mk.key + lt, repl: lt, how: "끝낱말" });
  return t;
};

for (const mk of marks) {
  if (mk.next.length < 6 && !lastToken(mk.key)) { skipped.short.push(mk); continue; }
  let needle = null, repl = null, found = [];
  for (const t of tiers(mk)) {
    const nd = JSON.stringify(t.needle).slice(1, -1);
    const f = [];
    for (const r of rows) {
      const cur = changed.get(r.unit_id)?.after ?? JSON.stringify(r.blocks);
      let c = 0, i = -1;
      while ((i = cur.indexOf(nd, i + 1)) >= 0) c += 1;
      if (c) f.push({ r, c });
    }
    if (f.length) {
      needle = nd;
      repl = JSON.stringify(t.repl).slice(1, -1);
      found = f;
      mk.how = t.how;
      break;
    }
  }
  if (!needle) { skipped.absent.push(mk); continue; }
  const total = found.reduce((a, b) => a + b.c, 0);
  if (total > 1 && !AMBIG) { skipped.ambiguous.push({ ...mk, where: found.map((f) => `${f.r.unit_key}×${f.c}`) }); continue; }
  for (const { r } of found) {
    const e = changed.get(r.unit_id) ?? { row: r, before: JSON.stringify(r.blocks), after: JSON.stringify(r.blocks), edits: [] };
    e.after = e.after.split(needle).join(repl);
    e.edits.push(mk);
    changed.set(r.unit_id, e);
  }
}

const list = [...changed.values()];
const editCount = list.reduce((a, e) => a + e.edits.length, 0);
console.log(`\n걷어낼 색인어 ${editCount}개 · 유닛 ${list.length}개`);
console.log(`건너뜀 — 앵커 짧음 ${skipped.short.length} · 저장본에 없음 ${skipped.absent.length} · 여러 자리 ${skipped.ambiguous.length}`);
for (const e of list)
  console.log(`  [${e.row.unit_key} p.${(e.row.pdf_page ?? 0) - 34}] ${e.edits.length}개 · ${JSON.parse(e.before).length}블록 · ${e.before.length} → ${e.after.length}자`);
if (skipped.ambiguous.length) {
  console.log("\n[여러 자리에 맞아 건너뛴 것 — --ambiguous 로 강제 가능]");
  for (const s of skipped.ambiguous) console.log(`  「${s.key}」 ${s.where.join(", ")}`);
}
if (skipped.absent.length) {
  console.log("\n[저장본에 없어 건너뛴 것]");
  for (const s of skipped.absent) console.log(`  「${s.key}」`);
}

for (const e of list.slice(0, SHOW)) {
  console.log(`\n${"=".repeat(78)}\n[${e.row.unit_key}] ${e.row.title}`);
  for (const mk of e.edits) {
    console.log(`${"-".repeat(78)}\n색인어 「${mk.key}」`);
    console.log(`  전: …${mk.prev}【${mk.key}】${mk.next}…`);
    console.log(`  후: …${mk.prev}${mk.next}…`);
  }
}

if (!APPLY) { console.log("\ndry-run 입니다. 반영하려면 --apply 를 붙이세요."); process.exit(0); }

// ── 백업 + 반영 ────────────────────────────────────────────────────────
fs.mkdirSync(BACKUP_DIR, { recursive: true });
const bakPath = path.join(BACKUP_DIR, `20260913_dohae_indexmark_before_${list.length}.json`);
fs.writeFileSync(bakPath, JSON.stringify(list.map((e) => ({ unit_id: e.row.unit_id, unit_key: e.row.unit_key, blocks: JSON.parse(e.before) })), null, 2), "utf8");
console.log(`\n백업 ${list.length}건 → ${bakPath}`);

let ok = 0;
for (const e of list) {
  const { error: err } = await supa.from("dohae_units")
    .update({ blocks: JSON.parse(e.after), updated_at: new Date().toISOString() })
    .eq("unit_id", e.row.unit_id);
  if (err) console.error(`  ★${e.row.unit_key}: ${err.message}`); else ok += 1;
}
console.log(`반영 ${ok}/${list.length}`);
