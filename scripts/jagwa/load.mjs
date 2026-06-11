// PRODUCTION load for the active tag: upload crops + insert problems/choices + pack.
// Idempotency: aborts if that year's science past_exam problems already exist.
// JAGWA_TAG=<tag> node load.mjs --go     (without --go = dry plan)
import fs from "node:fs";
import path from "node:path";
import { adminClient } from "./db.mjs";
import { EXAM, CROP_DIR, TAG } from "./data.mjs";

const GO = process.argv.includes("--go");
const ADMIN = "e20ac99a-bfa6-4862-94dd-23c063189463"; // 임병웅
const BUCKET = "problem-images";
const sb = adminClient();
const plan = JSON.parse(fs.readFileSync(path.join(CROP_DIR, "problems.json"), "utf8"));
const log = (...a) => console.log(...a);

const { count: dup } = await sb.from("problems").select("problem_id", { count: "exact", head: true })
  .eq("year", EXAM.year).eq("subject_type", "science").eq("exam_round_no", EXAM.examRoundNo).eq("origin", "past_exam");
log(`[${TAG}] existing ${EXAM.year}/${EXAM.examRoundNo} science past_exam: ${dup ?? "?"}`);
if (dup && dup > 0) { log("ABORT: already loaded."); process.exit(1); }
if (!GO) { log(`[DRY] would upload+insert ${plan.problems.length} and build pack "${EXAM.year}년 1차 기출". Re-run with --go.`); process.exit(0); }

const { error: bErr } = await sb.storage.createBucket(BUCKET, { public: true });
if (bErr && !/exist/i.test(bErr.message)) throw bErr;

const urlByN = {};
for (const p of plan.problems) {
  const buf = fs.readFileSync(path.join("C:/project/lidamedu", p.cropFile));
  const { error } = await sb.storage.from(BUCKET).upload(p.storagePath, buf, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`upload q${p.n}: ${error.message}`);
  urlByN[p.n] = sb.storage.from(BUCKET).getPublicUrl(p.storagePath).data.publicUrl;
}
log(`uploaded ${plan.problems.length} images`);

async function insertProblem(p) {
  const body_md = p.bodyMd.replace("IMAGE_URL", urlByN[p.n]);
  const { data: ins, error } = await sb.from("problems").insert({
    body_md, format: "mc_short", origin: "past_exam", exam_round: "first",
    exam_round_no: EXAM.examRoundNo, year: EXAM.year, problem_number: p.problem_number,
    subject_type: "science", science_subject: p.science_subject, polarity: p.polarity,
    scope: "comprehensive", review_status: "approved",
    approved_at: new Date().toISOString(), approved_by: ADMIN,
  }).select("problem_id").single();
  if (error) throw new Error(`insert q${p.n}: ${error.message}`);
  const choices = p.choices.map((c) => ({ problem_id: ins.problem_id, choice_index: c.choice_index, body_md: "", is_correct: c.is_correct }));
  const { error: cErr } = await sb.from("problem_choices").insert(choices);
  if (cErr) throw new Error(`choices q${p.n}: ${cErr.message}`);
  return ins.problem_id;
}

const byN = Object.fromEntries(plan.problems.map((p) => [p.n, p]));
const q1id = await insertProblem(byN[plan.problems[0].n]);
const imgResp = await fetch(urlByN[plan.problems[0].n]);
log(`smoke: q${plan.problems[0].n} inserted, image HTTP ${imgResp.status}`);
if (imgResp.status !== 200) throw new Error("image not reachable");
let done = 1;
for (const p of plan.problems) { if (p.n === plan.problems[0].n) continue; await insertProblem(p); done++; }
log(`inserted ${done} problems + ${done * 5} choices`);

// pack (science-scoped, same logic as regeneratePastExamPacks)
const { data: sciProbs } = await sb.from("problems").select("problem_id, problem_number")
  .eq("origin", "past_exam").eq("exam_round", "first").eq("subject_type", "science").eq("year", EXAM.year)
  .eq("exam_round_no", EXAM.examRoundNo).is("deleted_at", null).order("problem_number", { ascending: true, nullsFirst: false });
const title = `${EXAM.year}년 1차 기출`;
const { data: existPack } = await sb.from("mcq_packs").select("pack_id")
  .eq("kind", "past_exam").eq("subject_scope", "science").eq("year", EXAM.year).is("deleted_at", null).maybeSingle();
let packId;
if (existPack) { packId = existPack.pack_id; await sb.from("mcq_packs").update({ title }).eq("pack_id", packId); }
else {
  const { data: np, error } = await sb.from("mcq_packs")
    .insert({ kind: "past_exam", subject_scope: "science", title, year: EXAM.year, is_published: true, created_by: ADMIN })
    .select("pack_id").single();
  if (error) throw error; packId = np.pack_id;
}
await sb.from("mcq_pack_problems").delete().eq("pack_id", packId);
await sb.from("mcq_pack_problems").insert(sciProbs.map((p, i) => ({ pack_id: packId, problem_id: p.problem_id, ord: i })));
log(`pack "${title}" [science ${EXAM.year}] = ${sciProbs.length} questions`);

const { count: finalCount } = await sb.from("problems").select("problem_id", { count: "exact", head: true })
  .eq("year", EXAM.year).eq("subject_type", "science").eq("exam_round_no", EXAM.examRoundNo).eq("origin", "past_exam");
log(`DONE [${TAG}]: ${finalCount} problems, pack ${sciProbs.length} questions`);
