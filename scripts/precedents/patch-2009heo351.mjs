// 2009허351 단발 패치 (feat-7-005 후속):
//   1) source/_converted/image23.jpg (BMP→JPG 사전 변환) → case-images storage 업로드
//   2) cases.images 에 메타 추가 (position='summary', alt='청구항 1 도면 — 마법천자문')
//   3) summary_items[0].body 의 "청구항 1" 앞 줄바꿈 정렬 — 화면에서 sub-block 분리
//
// 사전 단계 — PowerShell System.Drawing 으로 hwpx BinData/image23.bmp → JPG 변환:
//   (이미 source/_converted/image23.jpg 에 변환돼 있다고 가정)
//
// 사용:
//   node scripts/precedents/patch-2009heo351.mjs            # dry-run
//   node scripts/precedents/patch-2009heo351.mjs --apply    # 실행

import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import sharp from "sharp";

loadEnv();

const APPLY = process.argv.includes("--apply");
const JPG_PATH = resolve("source/_converted/image23.jpg");
const CASE_ID = "c160ffc8-2b68-426d-9fc3-ac4ba3632aba";
const CASE_NUMBER = "2009허351";
const ALT = "[1] 청구항 1 도면 — 만화한자학습교재(마법천자문)";
const STORAGE_BUCKET = "case-images";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 .env 에 필요합니다.");
  process.exit(1);
}
const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  console.log(`mode  : ${APPLY ? "APPLY" : "DRY-RUN"}`);
  console.log(`case  : ${CASE_NUMBER} (${CASE_ID})`);

  // 1) JPG 읽고 메타 추출 (sharp).
  try {
    statSync(JPG_PATH);
  } catch {
    console.error(
      `JPG 파일이 없습니다: ${JPG_PATH}\n` +
        `먼저 PowerShell 로 BMP → JPG 변환을 수행하세요.`,
    );
    process.exit(1);
  }
  const jpgBuf = readFileSync(JPG_PATH);
  const meta = await sharp(jpgBuf).metadata();
  console.log(
    `jpg   : ${jpgBuf.byteLength} bytes (${meta.width}×${meta.height})`,
  );

  // 2) 기존 case 조회
  const { data: kase, error: getErr } = await supabase
    .from("cases")
    .select("images, summary_items")
    .eq("case_id", CASE_ID)
    .maybeSingle();
  if (getErr || !kase) {
    console.error("case 조회 실패:", getErr?.message ?? "not found");
    process.exit(1);
  }
  const existingImages = Array.isArray(kase.images) ? kase.images : [];
  console.log(`existing images: ${existingImages.length}`);

  // 같은 alt 가 이미 등록돼 있으면 skip (재실행 안전).
  let imageStep = "skip";
  if (existingImages.some((i) => i.alt === ALT)) {
    console.log("이미지가 이미 등록되어 있습니다 — skip.");
  } else {
    if (!APPLY) {
      imageStep = "would-apply";
      console.log(`(dry-run) → 이미지 1장 업로드 + cases.images 등록 예정`);
    } else {
      const ts = Date.now();
      const objectPath = `${CASE_ID}/${ts}-claim1.jpg`;
      const { error: upErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(objectPath, jpgBuf, {
          contentType: "image/jpeg",
          upsert: false,
        });
      if (upErr) {
        console.error("storage 업로드 실패:", upErr.message);
        process.exit(1);
      }
      const { data: pub } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(objectPath);
      const newImage = {
        id: crypto.randomUUID(),
        url: pub.publicUrl,
        storagePath: objectPath,
        mimeType: "image/jpeg",
        width: meta.width ?? null,
        height: meta.height ?? null,
        alt: ALT,
        position: "summary",
        sortOrder:
          existingImages
            .filter((i) => i.position === "summary")
            .reduce((m, i) => Math.max(m, i.sortOrder ?? 0), -1) + 1,
      };
      const nextImages = [...existingImages, newImage];
      const { error: updErr } = await supabase
        .from("cases")
        .update({ images: nextImages })
        .eq("case_id", CASE_ID);
      if (updErr) {
        console.error("cases.images update 실패:", updErr.message);
        process.exit(1);
      }
      imageStep = "applied";
      console.log(`✓ image uploaded: ${pub.publicUrl}`);
    }
  }

  // 3) summary_items[0].body 의 "청구항 1" 분리.
  const items = Array.isArray(kase.summary_items) ? kase.summary_items : [];
  let bodyStep = "skip";
  if (items.length === 0 || !items[0].body) {
    console.log("summary_items[0] 없음 — body 패치 skip.");
  } else {
    const body0 = items[0].body;
    if (/\n{2,}\s*청구항\s*1\s*\n/.test(body0)) {
      console.log("body 가 이미 분리된 형식 — skip.");
    } else {
      const re = /\s+청구항\s*1\s+/;
      const m = body0.match(re);
      if (!m) {
        console.log("body 에 '청구항 1' 패턴 없음 — skip.");
      } else {
        const nextBody = body0.replace(re, "\n\n청구항 1\n");
        const next0 = { ...items[0], body: nextBody };
        const nextItems = [next0, ...items.slice(1)];
        const idx = nextBody.indexOf("청구항 1");
        console.log(
          `body 길이: ${body0.length} → ${nextBody.length}`,
        );
        console.log(
          `patched preview: ...${nextBody.slice(
            Math.max(0, idx - 60),
            idx + 120,
          )}...`,
        );
        if (APPLY) {
          const { error: updErr } = await supabase
            .from("cases")
            .update({ summary_items: nextItems })
            .eq("case_id", CASE_ID);
          if (updErr) {
            console.error("summary_items update 실패:", updErr.message);
            process.exit(1);
          }
          bodyStep = "applied";
          console.log(`✓ summary_items[0].body 패치 완료`);
        } else {
          bodyStep = "would-apply";
          console.log(`(dry-run) → summary_items[0].body 패치 예정`);
        }
      }
    }
  }

  console.log(
    `\n=== ${APPLY ? "완료" : "dry-run 종료"} — image:${imageStep} body:${bodyStep} ===`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
