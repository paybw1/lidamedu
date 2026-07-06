// 상표 판례 적재 후속 보정 (1회성)
//   ① 이미지 실패 판례 재처리 — .tmp/손상 JPEG 은 sharp 매직바이트 판별로 재변환, images jsonb 재구성
//   ② 특허와 사건번호가 겹치는 8건 — 기존 row 의 subject_laws 에 "trademark" append
//      (primary 배치는 특허 노드 유지 — 상표 트리에서는 미배치로 노출, 운영자가 /admin/cases 에서 결정)
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import AdmZip from "adm-zip";
import sharp from "sharp";
import bmp from "bmp-js";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const data = JSON.parse(readFileSync(resolve(ROOT, "source/_converted/tm-precedents.json"), "utf8"));
const zip = new AdmZip(resolve(ROOT, "source/상표업로드/판례.hwpx"));
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const binByStem = new Map();
for (const e of zip.getEntries()) {
  const m = /^BinData\/([^.]+)\.(\w+)$/.exec(e.entryName);
  if (m) binByStem.set(m[1].toLowerCase(), { entry: e, ext: m[2].toLowerCase() });
}
async function toWebp(binId) {
  const hit = binByStem.get(binId.toLowerCase());
  if (!hit) return { error: "binData 없음" };
  const buf = hit.entry.getData();
  try {
    let img;
    if (hit.ext === "bmp") {
      const d = bmp.decode(buf);
      const px = d.data;
      for (let i = 0; i < px.length; i += 4) {
        const a = px[i], b = px[i + 1], g = px[i + 2], r = px[i + 3];
        px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
      }
      img = sharp(px, { raw: { width: d.width, height: d.height, channels: 4 } });
    } else if (["wmf", "emf", "ole"].includes(hit.ext)) {
      return { error: `미지원 형식 ${hit.ext}` };
    } else {
      img = sharp(buf, { failOn: "none" });
    }
    const out = await img.webp({ quality: 88 }).toBuffer({ resolveWithObject: true });
    return { buffer: out.data, width: out.info.width, height: out.info.height };
  } catch (e) {
    return { error: e.message };
  }
}

// ① 이미지 실패 판례 재처리
const AFFECTED = ["2023허10910", "2019후11688", "2012후672", "2010후3387", "2010도11053"];
const bookCase = new Map();
for (const t of data.topics) for (const c of t.cases) if (!bookCase.has(c.caseNumber)) bookCase.set(c.caseNumber, c);

for (const num of AFFECTED) {
  const c = bookCase.get(num);
  const { data: row } = await sb
    .from("cases")
    .select("case_id, images")
    .eq("case_number", num)
    .contains("subject_laws", ["trademark"])
    .maybeSingle();
  if (!row || !c) {
    console.log(`skip ${num} (row=${!!row}, book=${!!c})`);
    continue;
  }
  const imagesJson = [];
  let fail = 0;
  for (let i = 0; i < c.images.length; i++) {
    const conv = await toWebp(c.images[i]);
    if (conv.error) {
      fail++;
      console.log(`  ! ${num} ${c.images[i]}: ${conv.error}`);
      continue;
    }
    const storagePath = `${row.case_id}/tm16-${c.images[i]}.webp`;
    const { error: upErr } = await sb.storage
      .from("case-images")
      .upload(storagePath, conv.buffer, { contentType: "image/webp", upsert: true });
    if (upErr) {
      fail++;
      console.log(`  ! ${num} 업로드 ${c.images[i]}: ${upErr.message}`);
      continue;
    }
    const { data: pub } = sb.storage.from("case-images").getPublicUrl(storagePath);
    imagesJson.push({
      id: randomUUID(),
      url: pub.publicUrl,
      storagePath,
      mimeType: "image/webp",
      width: conv.width,
      height: conv.height,
      alt: "",
      position: "summary",
      sortOrder: i,
    });
  }
  const { error } = await sb.from("cases").update({ images: imagesJson }).eq("case_id", row.case_id);
  console.log(`✓ ${num}: 이미지 ${imagesJson.length}건 (실패 ${fail}) ${error ? "UPDATE 실패 " + error.message : ""}`);
}

// ② 특허 중복 사건번호 → subject_laws append
const DUAL = ["2002후567", "2018다221676", "2023다280358", "2018도14446", "2016후2317", "98후300", "2004후387", "2012후2432"];
for (const num of DUAL) {
  const { data: rows } = await sb
    .from("cases")
    .select("case_id, subject_laws")
    .eq("case_number", num)
    .is("deleted_at", null);
  if (!rows?.length) {
    console.log(`? ${num} 기존 row 없음`);
    continue;
  }
  for (const r of rows) {
    if (r.subject_laws?.includes("trademark")) {
      console.log(`= ${num} 이미 trademark 포함`);
      continue;
    }
    const next = [...(r.subject_laws ?? []), "trademark"];
    const { error } = await sb.from("cases").update({ subject_laws: next }).eq("case_id", r.case_id);
    console.log(`✓ ${num}: subject_laws → ${next.join(",")} ${error ? "실패 " + error.message : ""}`);
  }
}
