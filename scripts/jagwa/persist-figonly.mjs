// .figonly/{key}_q{NN}.png (그림만 크롭, 비전 자가검증 산출) → 스토리지 업로드 + problems.body_md 재조립.
//   body_md = 발문 텍스트(problem_text_drafts.stem_md) + 그림 이미지(삽입).
// 그림 파일이 없는 문항(에이전트 분리 실패)은 건너뜀 → 현행 재크롭 본문 유지.
// 기본 DRY-RUN. 실제 반영은 `node persist-figonly.mjs --apply`.
// 운영 DB(mcgdoplo) 직접 반영 전 .figonly/_pre-apply-backup.json 에 현행 body 백업.
import { config } from "dotenv";
config({ path: "C:/project/lidamedu/.env" });
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import fs from "node:fs";

const PROD = "mcgdoplovrjgklbxmozi";
const URL = process.env.SUPABASE_URL;
if (!URL || !URL.includes(PROD)) throw new Error(`SAFETY: SUPABASE_URL not prod(${PROD})`);
const sb = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const ROOT = "C:/project/lidamedu";
const APPLY = process.argv.includes("--apply");

const wl = JSON.parse(fs.readFileSync(`${ROOT}/scripts/jagwa/.figonly/_worklist.json`, "utf8"));
const items = wl.items; // {problem_id, year, subject, number, key, nn, recrop, out}
const ids = items.map((i) => i.problem_id);

// stem_md (발문 텍스트) — drafts 권위
const stemById = {};
for (let i = 0; i < ids.length; i += 300) {
  const { data } = await sb
    .from("problem_text_drafts")
    .select("problem_id, stem_md, has_figure")
    .in("problem_id", ids.slice(i, i + 300));
  for (const d of data ?? []) stemById[d.problem_id] = d;
}
// 현행 body 백업용
const curById = {};
for (let i = 0; i < ids.length; i += 300) {
  const { data } = await sb
    .from("problems")
    .select("problem_id, body_md")
    .in("problem_id", ids.slice(i, i + 300));
  for (const p of data ?? []) curById[p.problem_id] = p.body_md;
}

// 발문 문단 사이 그림을 자연스러운 위치(그림을 처음 언급하는 문단 뒤)에 삽입.
function insertFigure(stemMd, figUrl) {
  const img = `![](${figUrl})`;
  const paras = String(stemMd ?? "")
    .split(/\n\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (paras.length <= 1) return `${paras[0] ?? ""}\n\n${img}`.trim();
  const reFig = /그림|가계도|모식도|회로도?|H-?R도|도표|그래프|모형|장치|개략도|사진|지도|단면|구조도|장면/;
  let idx = paras.findIndex((p) => reFig.test(p));
  if (idx < 0) idx = 0;
  return [...paras.slice(0, idx + 1), img, ...paras.slice(idx + 1)].join("\n\n");
}

let applied = 0, skippedMissing = 0, uploadFail = 0, updFail = 0;
const issues = [];
const backup = [];
for (const it of items) {
  const figLocal = `${ROOT}/${it.out}`;
  const tag = `${it.key}_q${it.nn}`;
  if (!fs.existsSync(figLocal)) { skippedMissing++; issues.push(`${tag}: figonly missing (skip→keep recrop)`); continue; }
  const stem = stemById[it.problem_id]?.stem_md;
  if (stem == null) { skippedMissing++; issues.push(`${tag}: no stem_md`); continue; }
  const sp = `past-exam-figure/${it.key}/q${it.nn}.png`;
  let figUrl;
  try {
    const buf = await sharp(figLocal).png().toBuffer();
    if (APPLY) {
      const { error } = await sb.storage.from("problem-images").upload(sp, buf, { contentType: "image/png", upsert: true });
      if (error) throw new Error(error.message);
    }
    figUrl = sb.storage.from("problem-images").getPublicUrl(sp).data.publicUrl;
  } catch (e) { uploadFail++; issues.push(`${tag}: upload ${e.message}`); continue; }
  const body = insertFigure(stem, figUrl);
  backup.push({ problem_id: it.problem_id, body_md: curById[it.problem_id] ?? null });
  if (APPLY) {
    const { error } = await sb.from("problems").update({ body_md: body, updated_at: new Date().toISOString() }).eq("problem_id", it.problem_id);
    if (error) { updFail++; issues.push(`${tag}: update ${error.message}`); continue; }
  }
  applied++;
}
if (APPLY) {
  fs.writeFileSync(`${ROOT}/scripts/jagwa/.figonly/_pre-apply-backup.json`, JSON.stringify(backup, null, 0));
}
console.log(`${APPLY ? "APPLIED" : "DRY-RUN"}: converted=${applied} skippedMissing=${skippedMissing} uploadFail=${uploadFail} updFail=${updFail} / total=${items.length}`);
if (issues.length) console.log("issues:\n" + issues.slice(0, 50).join("\n"));
