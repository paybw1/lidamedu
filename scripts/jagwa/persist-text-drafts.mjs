// .text/*.json (전사 결과) → problem_text_drafts staging upsert.
// 도표 문제(has_figure)는 원본 크롭을 choice_top_frac 위로 재크롭 → problem-images/past-exam-recrop 업로드 → recrop_path(public URL).
// problem_id 는 파일의 값이 아니라 (year, n)→DB 역참조를 권위로 쓴다(해설 파이프라인과 동일).
import { adminClient } from "./db.mjs";
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const sb = adminClient();
const ROOT = "C:/project/lidamedu";
const RECROP = `${ROOT}/scripts/jagwa/.recrop`;
const DIR = `${ROOT}/scripts/jagwa/.text`;
const MODEL = "claude-opus-4-8";

// (year, problem_number) -> problem_id
const { data: probs } = await sb.from("problems")
  .select("problem_id, year, problem_number")
  .eq("subject_type", "science").eq("origin", "past_exam").eq("exam_round", "first");
const byYN = new Map((probs ?? []).map((p) => [`${p.year}_${p.problem_number}`, p.problem_id]));

// 에이전트가 자가검증으로 만든 재크롭 파일(.recrop/{key}_q{NN}.png) 을 스토리지로 업로드.
async function uploadRecrop(key, year, n) {
  const local = `${RECROP}/${key}_q${String(n).padStart(2, "0")}.png`;
  if (!fs.existsSync(local)) throw new Error(`recrop file missing: ${local}`);
  const buf = await sharp(local).png().toBuffer();
  const sp = `past-exam-recrop/${key}/q${String(n).padStart(2, "0")}.png`;
  const { error } = await sb.storage.from("problem-images").upload(sp, buf, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`upload ${sp}: ${error.message}`);
  return sb.storage.from("problem-images").getPublicUrl(sp).data.publicUrl;
}

const files = fs.readdirSync(DIR).filter((f) => /\.json$/.test(f) && !f.startsWith("_"));
let ok = 0, fail = 0, figs = 0;
const bad = [];
for (const f of files) {
  let doc;
  try { doc = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")); }
  catch (e) { bad.push(`${f}: parse ${e.message}`); fail++; continue; }
  const key = f.replace(/\.json$/, "");
  const year = Number(key.split("_")[0]);
  for (const it of doc.items ?? []) {
    const pid = byYN.get(`${year}_${it.n}`);
    if (!pid) { bad.push(`${f} #${it.n}: no DB problem`); fail++; continue; }
    if (!Array.isArray(it.choices) || it.choices.length !== 5) { bad.push(`${f} #${it.n}: choices!=5`); fail++; continue; }
    let recrop = null;
    if (it.has_figure) {
      try { recrop = await uploadRecrop(key, year, it.n); figs++; }
      catch (e) { bad.push(`${f} #${it.n}: recrop ${e.message}`); fail++; continue; }
    }
    const { error } = await sb.from("problem_text_drafts").upsert({
      problem_id: pid,
      stem_md: it.stem_md ?? "",
      choices: it.choices,
      has_figure: !!it.has_figure,
      choice_top_frac: it.has_figure ? (it.choice_top_frac ?? null) : null,
      recrop_path: recrop,
      model: MODEL,
      status: "pending",
    }, { onConflict: "problem_id" });
    if (error) { bad.push(`${f} #${it.n}: ${error.message}`); fail++; continue; }
    ok++;
  }
}

console.log(`files=${files.length} persisted=${ok} figures(recropped)=${figs} failed=${fail}`);
if (bad.length) console.log("ISSUES:\n" + bad.slice(0, 30).join("\n"));
const { count } = await sb.from("problem_text_drafts").select("draft_id", { count: "exact", head: true });
console.log(`total drafts: ${count}`);
