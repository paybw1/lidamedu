// 2차 기출 이미지 부착 — HWPX 내장 이미지(BinData)를 storage 업로드 후, parse-essay 가 넣은
//   본문 placeholder [IMG:ref] 를 실제 ![](url) 로 치환하여 body_md 를 재작성(UPDATE).
//   parse-essay-2cha 출력(parsed.json)을 그대로 사용 → 텍스트 동일, 이미지만 URL 치환.
// 사용: node scripts/jagwa/attach-essay-images.mjs --file <hwpx> --parsed <parsed.json> \
//         --subject 상표 --year 2013 --round 50 [--apply]
import "dotenv/config";
import { readFileSync } from "node:fs";
import AdmZip from "adm-zip";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !url.includes("mcgdoplo")) throw new Error(`SAFETY: ${url} not prod`);
const sb = createClient(url, key);

const arg = (k) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const apply = process.argv.includes("--apply");
const hwpxPath = arg("file");
const parsedPath = arg("parsed");
const subjectKo = arg("subject");
const year = Number(arg("year"));
const round = Number(arg("round"));
const SUBJECT_LAW = { 특허: "patent", 상표: "trademark", 민소: "civil-procedure" };
const lawCode = SUBJECT_LAW[subjectKo];
const BUCKET = "problem-images";
const CT = { bmp: "image/bmp", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif" };

// 1) BinData 이미지 업로드 → {ref: url}
const zip = new AdmZip(hwpxPath);
const urlMap = {};
for (const e of zip.getEntries()) {
  const m = /BinData\/(.+)\.(png|jpg|jpeg|gif|bmp)$/i.exec(e.entryName);
  if (!m) continue;
  const [ref, ext] = [m[1], m[2].toLowerCase()];
  const objectName = `essay-figure/${lawCode}/${year}_${round}_${ref}.${ext}`;
  if (apply) {
    const { error } = await sb.storage
      .from(BUCKET)
      .upload(objectName, e.getData(), { contentType: CT[ext] ?? "application/octet-stream", upsert: true });
    if (error) throw error;
  }
  urlMap[ref] = sb.storage.from(BUCKET).getPublicUrl(objectName).data.publicUrl;
}

// 2) parsed.json 의 각 문제 bodyMd 에서 [IMG:ref] → ![](url) 치환, 변경분만 UPDATE
const rows = JSON.parse(readFileSync(parsedPath, "utf8"));
const { data: law } = await sb.from("laws").select("law_id").eq("law_code", lawCode).single();
let updated = 0;
for (let i = 0; i < rows.length; i++) {
  const orig = rows[i].bodyMd;
  const bodyMd = orig.replace(/\[IMG:([^\]]+)\]/g, (mm, ref) =>
    urlMap[ref] ? `![](${urlMap[ref]})` : mm,
  );
  const imgCount = (bodyMd.match(/essay-figure/g) || []).length;
  const leftover = (bodyMd.match(/\[IMG:/g) || []).length;
  if (bodyMd === orig) continue; // 이미지 없는 문제 skip
  const num = i + 1;
  const { data: row } = await sb
    .from("problems")
    .select("problem_id, display_no")
    .eq("law_id", law.law_id)
    .eq("exam_round", "second")
    .eq("year", year)
    .eq("problem_number", num)
    .is("deleted_at", null)
    .maybeSingle();
  console.log(`${subjectKo} ${year} #${num}: 이미지 ${imgCount}장${leftover ? ` ⚠미치환 ${leftover}` : ""} ${row ? "→ P-" + row.display_no : "(문제없음)"}`);
  if (apply && row) {
    const { error } = await sb.from("problems").update({ body_md: bodyMd }).eq("problem_id", row.problem_id);
    if (error) throw error;
    updated++;
  }
}
console.log(`${apply ? "적용" : "dry-run"}: ${updated}문제 업데이트 / 업로드 이미지 ${Object.keys(urlMap).length}장`);
