// PRODUCTION load: upload crops + insert 40 problems/choices + build science-2010 pack.
// Idempotency: aborts if 2010/47 science past_exam problems already exist.
// Pass --go to actually write; without it, runs a dry plan summary only.
import fs from "node:fs";
import path from "node:path";
import { adminClient } from "./db.mjs";

const GO = process.argv.includes("--go");
const ADMIN = "e20ac99a-bfa6-4862-94dd-23c063189463"; // 임병웅 (current admin)
const BUCKET = "problem-images";
const sb = adminClient();
const plan = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "problems.json"), "utf8"));
const log = (...a) => console.log(...a);

// ---- duplicate guard ----
const { count: dup } = await sb.from("problems").select("problem_id", { count: "exact", head: true })
  .eq("year", 2010).eq("subject_type", "science").eq("exam_round_no", 47).eq("origin", "past_exam");
log(`existing 2010/47 science past_exam: ${dup ?? "?"}`);
if (dup && dup > 0) { log("ABORT: already loaded. Delete first to reload."); process.exit(1); }
if (!GO) { log(`\n[DRY] would: create bucket ${BUCKET}, upload ${plan.problems.length}, insert ${plan.problems.length} problems + choices, build pack.\nRe-run with --go to execute.`); process.exit(0); }

// ---- 1) bucket ----
const { error: bErr } = await sb.storage.createBucket(BUCKET, { public: true });
if (bErr && !/exist/i.test(bErr.message)) throw bErr;
log(`bucket ${BUCKET}: ${bErr ? "already exists" : "created (public)"}`);

// ---- 2) upload crops, collect public URLs ----
const urlByN = {};
for (const p of plan.problems) {
  const buf = fs.readFileSync(path.join("C:/project/lidamedu", p.cropFile));
  const { error } = await sb.storage.from(BUCKET).upload(p.storagePath, buf, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`upload q${p.n}: ${error.message}`);
  urlByN[p.n] = sb.storage.from(BUCKET).getPublicUrl(p.storagePath).data.publicUrl;
}
log(`uploaded ${plan.problems.length} images`);

// ---- 3) insert one problem + its choices ----
async function insertProblem(p) {
  const body_md = p.bodyMd.replace("IMAGE_URL", urlByN[p.n]);
  const { data: ins, error } = await sb.from("problems").insert({
    body_md,
    format: "mc_short",
    origin: "past_exam",
    exam_round: "first",
    exam_round_no: 47,
    year: 2010,
    problem_number: p.problem_number,
    subject_type: "science",
    science_subject: p.science_subject,
    polarity: p.polarity,
    scope: "comprehensive",
    review_status: "approved",
    approved_at: new Date().toISOString(),
    approved_by: ADMIN,
  }).select("problem_id").single();
  if (error) throw new Error(`insert problem q${p.n}: ${error.message}`);
  const choices = p.choices.map((c) => ({
    problem_id: ins.problem_id,
    choice_index: c.choice_index,
    body_md: "", // image-first: the question image shows ①~⑤; button badge shows the number
    is_correct: c.is_correct,
  }));
  const { error: cErr } = await sb.from("problem_choices").insert(choices);
  if (cErr) throw new Error(`insert choices q${p.n}: ${cErr.message}`);
  return ins.problem_id;
}

// ---- 4) smoke test: Q1 first, verify read-back + image reachable ----
const byN = Object.fromEntries(plan.problems.map((p) => [p.n, p]));
const q1id = await insertProblem(byN[1]);
const { data: rb } = await sb.from("problems").select("problem_id, body_md, science_subject, origin, format, review_status").eq("problem_id", q1id).single();
const { data: rbCh } = await sb.from("problem_choices").select("choice_index, is_correct, body_md").eq("problem_id", q1id).order("choice_index");
const imgResp = await fetch(urlByN[1], { method: "GET" });
log("\n=== SMOKE TEST (Q1) ===");
log("problem:", JSON.stringify({ ...rb, body_md: rb.body_md }));
log("choices:", rbCh.map((c) => `${c.choice_index}${c.is_correct ? "*" : ""}`).join(" "));
log(`image GET ${urlByN[1]} -> HTTP ${imgResp.status} ${imgResp.headers.get("content-type")}`);
if (imgResp.status !== 200) throw new Error("image not publicly reachable");
log("smoke OK\n");

// ---- 5) insert remaining 39 ----
let done = 1;
for (const p of plan.problems) {
  if (p.n === 1) continue;
  await insertProblem(p);
  done++;
}
log(`inserted ${done} problems (+ ${done * 5} choices)`);

// ---- 6) build science-2010 pack (replicates regeneratePastExamPacks, science-scoped) ----
const { data: sciProbs, error: spErr } = await sb.from("problems")
  .select("problem_id, problem_number")
  .eq("origin", "past_exam").eq("exam_round", "first").eq("subject_type", "science").eq("year", 2010)
  .is("deleted_at", null).order("problem_number", { ascending: true, nullsFirst: false });
if (spErr) throw spErr;
const title = "2010년 1차 기출";
const { data: existPack } = await sb.from("mcq_packs").select("pack_id")
  .eq("kind", "past_exam").eq("subject_scope", "science").eq("year", 2010).is("deleted_at", null).maybeSingle();
let packId;
if (existPack) {
  packId = existPack.pack_id;
  await sb.from("mcq_packs").update({ title }).eq("pack_id", packId);
} else {
  const { data: np, error: npErr } = await sb.from("mcq_packs")
    .insert({ kind: "past_exam", subject_scope: "science", title, year: 2010, is_published: true, created_by: ADMIN })
    .select("pack_id").single();
  if (npErr) throw npErr;
  packId = np.pack_id;
}
await sb.from("mcq_pack_problems").delete().eq("pack_id", packId);
const mappings = sciProbs.map((p, i) => ({ pack_id: packId, problem_id: p.problem_id, ord: i }));
const { error: mErr } = await sb.from("mcq_pack_problems").insert(mappings);
if (mErr) throw mErr;
log(`pack "${title}" [scope=science year=2010] pack_id=${packId} mappings=${mappings.length}`);

// ---- 7) final verify ----
const { count: finalCount } = await sb.from("problems").select("problem_id", { count: "exact", head: true })
  .eq("year", 2010).eq("subject_type", "science").eq("exam_round_no", 47).eq("origin", "past_exam");
log(`\n=== DONE: ${finalCount} problems in DB, pack has ${mappings.length} questions ===`);
