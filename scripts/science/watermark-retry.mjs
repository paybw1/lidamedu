// 워터마크 제거 2차 — 1차 검증 실패분을 이미지별 임계 사다리로 재시도.
// 음영 손실형은 높은 임계(좁게), 잔여물형은 낮은 임계(넓게)가 맞을 수 있어
// [210, 205, 220, 175, 165] 순서로 시도, 비전 검증 통과 즉시 업로드.

import Anthropic from "@anthropic-ai/sdk";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

dotenv.config();

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ROOT = "tmp/watermark";
const ORIG_DIR = path.join(ROOT, "originals");
const LADDER = [210, 205, 220, 175, 165];
const localName = (sp) => sp.replaceAll("/", "__");

const report = JSON.parse(readFileSync(path.join(ROOT, "report.json"), "utf8"));
const failed = report.failed.map((f) => f.sp);
console.log(`재시도 대상: ${failed.length}장 · 임계 사다리 ${LADDER.join("→")}`);

async function processAt(buf, threshold) {
  const img = await loadImage(buf);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, img.width, img.height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    if (lum >= threshold && lum < 250) px[i] = px[i + 1] = px[i + 2] = 255;
  }
  ctx.putImageData(data, 0, 0);
  return canvas.encode("png");
}

async function verify(origBuf, cleanBuf) {
  const toBlock = (b) => ({
    type: "image",
    source: { type: "base64", media_type: "image/png", data: b.toString("base64") },
  });
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await anthropic.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "첫 번째는 원본 시험 도표(회색 '한국산업인력공단' 워터마크 포함), 두 번째는 워터마크 제거 처리본이다." },
              toBlock(origBuf),
              toBlock(cleanBuf),
              {
                type: "text",
                text: '처리본을 평가하라. 기준: (1) 워터마크 잔여물이 없거나 크게 줄었는가 (2) 도표의 정보(선·글자·숫자·의미 있는 음영/명암·영역 표시)가 손실되지 않았는가. 장식적 옅은 음영이 옅어진 것은 손실이 아니다. 정확히 한 줄로만 답하라: "PASS" 또는 "FAIL: <손실 내용>"',
              },
            ],
          },
        ],
      });
      const text = res.content.find((c) => c.type === "text")?.text?.trim() ?? "";
      return { pass: text.startsWith("PASS"), reason: text.slice(0, 200) };
    } catch (e) {
      const status = e?.status ?? 0;
      if ((status === 429 || status === 529 || status >= 500) && attempt < 3) {
        await new Promise((r) => setTimeout(r, attempt * 4000));
        continue;
      }
      throw e;
    }
  }
  return { pass: false, reason: "검증 호출 실패" };
}

const fixed = [];
const stillFailed = [];
for (const sp of failed) {
  const origBuf = readFileSync(path.join(ORIG_DIR, localName(sp)));
  let done = false;
  const reasons = [];
  for (const t of LADDER) {
    const cleanBuf = await processAt(origBuf, t);
    const v = await verify(origBuf, cleanBuf);
    if (v.pass) {
      const { error } = await supa.storage
        .from("problem-images")
        .upload(sp, cleanBuf, { contentType: "image/png", upsert: true });
      if (error) throw new Error(`업로드 ${sp}: ${error.message}`);
      fixed.push({ sp, threshold: t });
      console.log(`✓ ${sp} — T=${t}`);
      done = true;
      break;
    }
    reasons.push(`T${t}: ${v.reason}`);
  }
  if (!done) {
    stillFailed.push({ sp, reasons });
    console.log(`✗ ${sp} — 전 임계 실패`);
  }
}

writeFileSync(
  path.join(ROOT, "retry-report.json"),
  JSON.stringify({ fixed, stillFailed }, null, 2),
);
console.log(`\n══ 2차 결과 ══ 교체 ${fixed.length} · 원본 유지 ${stillFailed.length}`);
for (const f of stillFailed) console.log(`  ✗ ${f.sp}`);
