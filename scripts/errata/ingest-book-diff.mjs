// feat-3-604 S3 — 판 대조 결과(changes.json)를 검수함(book_diff_candidates)에 올린다.
//
//   node scripts/errata/ingest-book-diff.mjs                 # 예행 (기본)
//   node scripts/errata/ingest-book-diff.mjs --commit        # 반영
//   node scripts/errata/ingest-book-diff.mjs --in tmp/book-diff/<책>  --commit
//   node scripts/errata/ingest-book-diff.mjs --with-moved --commit    # "자리만 옮긴 것"까지
//
// ★적재는 이 스크립트(service_role)만 한다 — 검수함에 INSERT 정책을 두지 않았다.
// ★원고는 움직이는 표적이라 몇 번이고 다시 돌린다. 그래서
//   ① (edition_id, fingerprint) 로 멱등 upsert 하고
//   ② 이번에 안 나온 옛 후보는 **지우지 않고** status='superseded' 로 내리며
//   ③ 원장이 찍어 둔 판정(decision)과 발행 기록은 절대 덮지 않는다.
//   지우면 원고 한 번 고칠 때마다 판정이 증발한다(feat-2-037 excluded_at 과 같은 이유).

import "dotenv/config";

import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";

/** 2027년 1차 시험일 — 시트의 「시험 적용」 판정에 쓴다(판본을 새로 만들 때만). */
const TARGET_EXAM_DATE = "2027-02-27";

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const commit = flag("commit");
const withMoved = flag("with-moved");

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("[중단] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정 (.env)");
  process.exit(1);
}
if (!new URL(url).host.includes("mcgdoplo")) throw new Error("ABORT: not prod");
const supa = createClient(url, key, { auth: { persistSession: false } });

// ── 대조 결과 읽기 ────────────────────────────────────────────────────
const inDir = resolve(opt("in", "tmp/book-diff/리담특허법[제25판]"));
const jsonPath = `${inDir}/changes.json`;
if (!existsSync(jsonPath)) {
  console.error(`[중단] ${jsonPath} 가 없다 — compare-book-editions.mjs 를 먼저 돌릴 것`);
  process.exit(1);
}
const report = JSON.parse(readFileSync(jsonPath, "utf8"));
// 언제 뽑힌 후보인지 — 파일 시각으로 한 번의 대조를 이름 짓는다(스크립트는 시계를 만들지 않는다).
const runId = statSync(jsonPath).mtime.toISOString().slice(0, 19).replace("T", " ");

const bookName = report.book ?? basename(inDir);
const m = /^(.+?)\s*\[(.+?)\]\s*$/.exec(bookName);
const pubTitle = opt("publication", m ? m[1].trim() : bookName);
const editionLabel = opt("edition", m ? m[2].trim() : "초판");
console.log(`대조 결과 ${report.changes.length}건 · 「${pubTitle}」 ${editionLabel} · run ${runId}`);

// ── 판본 확인·등록 ────────────────────────────────────────────────────
// 리담특허법 본서는 판본 대장에 없다(등록된 것은 조문정리·판례·객관식Ⅰ/Ⅱ·도해뿐).
// 쪽 번호가 어느 인쇄본 기준인지 못 박으려면 판본 행이 있어야 한다.
async function ensureEdition() {
  const { data: pubs, error: e1 } = await supa
    .from("publications")
    .select("publication_id, title")
    .eq("title", pubTitle)
    .is("deleted_at", null);
  if (e1) throw new Error(e1.message);
  let publicationId = pubs?.[0]?.publication_id ?? null;

  if (!publicationId) {
    console.log(`  판본 대장에 「${pubTitle}」 없음 → 새로 등록${commit ? "" : " (예행)"}`);
    if (!commit) return null;
    const { data, error } = await supa
      .from("publications")
      .insert({ title: pubTitle, subject_code: "patent", track: "공통" })
      .select("publication_id")
      .single();
    if (error) throw new Error(error.message);
    publicationId = data.publication_id;
  }

  const { data: eds, error: e2 } = await supa
    .from("publication_editions")
    .select("edition_id, edition_label, status")
    .eq("publication_id", publicationId)
    .eq("edition_label", editionLabel);
  if (e2) throw new Error(e2.message);
  if (eds?.length) {
    console.log(`  판본 ${editionLabel} (${eds[0].status}) — 그대로 쓴다`);
    return eds[0].edition_id;
  }
  console.log(`  판본 ${editionLabel} 없음 → 새로 등록${commit ? "" : " (예행)"}`);
  if (!commit) return null;
  const { data, error } = await supa
    .from("publication_editions")
    .insert({
      publication_id: publicationId,
      edition_label: editionLabel,
      // 판 순서 — 「제25판」의 숫자를 그대로 쓴다(대장이 NOT NULL 을 건다).
      edition_seq: Number(/\d+/.exec(editionLabel)?.[0] ?? 1),
      status: "frozen", // 이미 인쇄되어 나간 판이다
      target_exam_date: TARGET_EXAM_DATE,
    })
    .select("edition_id")
    .single();
  if (error) throw new Error(error.message);
  return data.edition_id;
}

// ── 후보 만들기 ───────────────────────────────────────────────────────
const norm = (s) => (s || "").replace(/\s+/g, "");
/** 같은 후보를 몇 번을 다시 뽑아도 같은 이름으로 알아보게 하는 지문. */
const fingerprintOf = (c) =>
  createHash("sha1")
    .update([c.page ?? 0, c.bucket, c.type, norm(c.before), norm(c.after)].join("|"))
    .digest("hex")
    .slice(0, 20);

const source = report.changes.filter((c) => withMoved || c.confidence !== "이동");
const rows = source.map((c) => ({
  fingerprint: fingerprintOf(c),
  run_id: runId,
  page_no: c.page || null,
  bucket: c.bucket,
  change_type: c.type,
  confidence: c.confidence,
  before_text: c.before ?? "",
  after_text: c.after ?? "",
  similarity: c.similarity || null,
  status: "current",
}));
const byFp = new Map(rows.map((r) => [r.fingerprint, r]));
console.log(
  `올릴 후보 ${byFp.size}건 (자리만 옮긴 것 ${report.changes.length - source.length}건은 ${withMoved ? "포함" : "제외 — --with-moved 로 포함"})`,
);

const editionId = await ensureEdition();
if (!editionId) {
  console.log("\n예행이라 판본이 아직 없다 — 후보 대조는 --commit 후에 볼 수 있다.");
} else {
  await sync(editionId);
}

// ── 이미 있는 것과 견주기 ─────────────────────────────────────────────
async function sync(editionId) {
const { data: existing, error: e3 } = await supa
  .from("book_diff_candidates")
  .select("candidate_id, fingerprint, status, decision, published_revision_id")
  .eq("edition_id", editionId);
if (e3) throw new Error(e3.message);

const known = new Map((existing ?? []).map((r) => [r.fingerprint, r]));
const toInsert = [...byFp.values()].filter((r) => !known.has(r.fingerprint));
const toRevive = [...byFp.values()].filter((r) => known.get(r.fingerprint)?.status === "superseded");
const gone = (existing ?? []).filter((r) => !byFp.has(r.fingerprint) && r.status === "current");
const decidedGone = gone.filter((r) => r.decision !== "pending");

console.log(
  `\n새로 올릴 것 ${toInsert.length} · 이미 있는 것 ${byFp.size - toInsert.length}` +
    ` · 되살릴 것 ${toRevive.length} · 이번에 안 나와 내릴 것 ${gone.length}` +
    (decidedGone.length ? ` (그중 판정된 것 ${decidedGone.length} — 판정은 보존된다)` : ""),
);

if (!commit) {
  console.log("\n예행이다. 반영하려면 --commit");
  for (const r of toInsert.slice(0, 5))
    console.log(`  + p.${r.page_no ?? "-"} [${r.bucket}/${r.change_type}] ${(r.after || r.before).slice(0, 70)}`);
  return;
}

// ── 반영 ──────────────────────────────────────────────────────────────
// ★upsert 에 decision·decided_* 를 싣지 않는다 — 실으면 원장 판정이 매 적재마다 pending 으로 돌아간다.
const payload = [...byFp.values()].map((r) => ({ ...r, edition_id: editionId }));
for (let i = 0; i < payload.length; i += 200) {
  const { error } = await supa
    .from("book_diff_candidates")
    .upsert(payload.slice(i, i + 200), { onConflict: "edition_id,fingerprint" });
  if (error) throw new Error(error.message);
}
if (gone.length) {
  const { error } = await supa
    .from("book_diff_candidates")
    .update({ status: "superseded" })
    .in("candidate_id", gone.map((r) => r.candidate_id));
  if (error) throw new Error(error.message);
}

const { count } = await supa
  .from("book_diff_candidates")
  .select("candidate_id", { count: "exact", head: true })
  .eq("edition_id", editionId)
  .eq("status", "current");
console.log(`\n반영 완료 — 지금 볼 후보 ${count}건. /admin/book-diff 에서 판정할 것.`);
}
