// 자연과학 도표 워터마크(한국산업인력공단) 일괄 제거.
//
// 파이프라인: 문제 본문에서 past-exam-figure 이미지 URL 수집 → 원본 백업(tmp/watermark/originals)
// → 밝기 임계 처리(워터마크 회색대 208~223 을 덮는 T=190 이상 → 흰색)
// → AI 비전 검증(원본 vs 처리본 — 워터마크 외 콘텐츠 손실 여부) → 통과분만 같은 경로 업로드.
//
// 사용:
//   node scripts/science/watermark-clean.mjs           # 전량 (다운로드·처리·검증·업로드)
//   LIMIT=5 node scripts/science/watermark-clean.mjs   # 파일럿
//   SKIP_UPLOAD=1 ...                                   # 업로드 없이 dry-run

import Anthropic from "@anthropic-ai/sdk";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

dotenv.config();

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const THRESHOLD = 190;
const CONCURRENCY = 4;
const LIMIT = Number(process.env.LIMIT ?? 0) || Infinity;
const SKIP_UPLOAD = process.env.SKIP_UPLOAD === "1";

const ROOT = "tmp/watermark";
const ORIG_DIR = path.join(ROOT, "originals");
const CLEAN_DIR = path.join(ROOT, "cleaned");
for (const d of [ORIG_DIR, CLEAN_DIR]) mkdirSync(d, { recursive: true });

// ── 1. 대상 수집 — 자연과학 문제 본문의 figure 이미지 URL ──────────────────
const { data: problems, error } = await supa
  .from("problems")
  .select("problem_id, body_md")
  .eq("subject_type", "science")
  .is("deleted_at", null);
if (error) throw error;

const urls = new Set();
for (const p of problems ?? []) {
  for (const m of (p.body_md ?? "").matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
    if (m[1].includes("/problem-images/") && m[1].includes("past-exam-figure/")) {
      urls.add(m[1]);
    }
  }
}
const targets = [...urls].sort().slice(0, LIMIT === Infinity ? undefined : LIMIT);
console.log(`대상 이미지: ${urls.size}장${LIMIT !== Infinity ? ` (파일럿 ${targets.length})` : ""}`);

// storage 경로 추출: .../object/public/problem-images/<storagePath>
function storagePathOf(url) {
  const m = /\/object\/public\/problem-images\/(.+)$/.exec(url);
  return m ? decodeURIComponent(m[1]) : null;
}
// 로컬 파일명 — 경로 구분자를 __ 로.
const localName = (sp) => sp.replaceAll("/", "__");

// ── 2. 처리 함수 ─────────────────────────────────────────────────────────────
async function processImage(buf) {
  const img = await loadImage(buf);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, img.width, img.height);
  const px = data.data;
  let cleared = 0;
  for (let i = 0; i < px.length; i += 4) {
    const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    if (lum >= THRESHOLD && lum < 250) {
      px[i] = px[i + 1] = px[i + 2] = 255;
      cleared++;
    }
  }
  ctx.putImageData(data, 0, 0);
  return { png: await canvas.encode("png"), cleared, total: px.length / 4 };
}

// ── 3. 비전 검증 — 원본 vs 처리본 ───────────────────────────────────────────
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
              { type: "text", text: "첫 번째는 원본 시험 도표(회색 '한국산업인력공단' 워터마크 포함 가능), 두 번째는 워터마크 제거 처리본이다." },
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
      if (text.startsWith("PASS")) return { pass: true };
      return { pass: false, reason: text.slice(0, 200) };
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

// ── 4. 실행 ──────────────────────────────────────────────────────────────────
const results = { uploaded: [], noWatermark: [], failed: [], errors: [] };
let done = 0;

async function handle(url) {
  const sp = storagePathOf(url);
  if (!sp) {
    results.errors.push({ url, error: "storage 경로 파싱 실패" });
    return;
  }
  try {
    // 백업(이미 있으면 재사용 — 재실행 안전).
    const origPath = path.join(ORIG_DIR, localName(sp));
    let origBuf;
    if (existsSync(origPath)) {
      origBuf = readFileSync(origPath);
    } else {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`다운로드 HTTP ${res.status}`);
      origBuf = Buffer.from(await res.arrayBuffer());
      writeFileSync(origPath, origBuf);
    }

    const { png: cleanBuf, cleared, total } = await processImage(origBuf);
    writeFileSync(path.join(CLEAN_DIR, localName(sp)), cleanBuf);

    // 지운 픽셀이 사실상 없으면 워터마크 없는 이미지 — 업로드 생략.
    if (cleared / total < 0.001) {
      results.noWatermark.push(sp);
      return;
    }

    const v = await verify(origBuf, cleanBuf);
    if (!v.pass) {
      results.failed.push({ sp, reason: v.reason });
      return;
    }

    if (!SKIP_UPLOAD) {
      const { error: upErr } = await supa.storage
        .from("problem-images")
        .upload(sp, cleanBuf, { contentType: "image/png", upsert: true });
      if (upErr) throw new Error(`업로드: ${upErr.message}`);
    }
    results.uploaded.push(sp);
  } catch (e) {
    results.errors.push({ url, error: String(e?.message ?? e) });
  } finally {
    done++;
    if (done % 20 === 0) console.log(`…진행 ${done}/${targets.length}`);
  }
}

// 동시성 제한 실행.
const queue = [...targets];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length > 0) {
      const url = queue.shift();
      if (url) await handle(url);
    }
  }),
);

writeFileSync(
  path.join(ROOT, "report.json"),
  JSON.stringify(results, null, 2),
);
console.log("\n══ 결과 ══");
console.log(`교체 업로드${SKIP_UPLOAD ? "(dry-run·미업로드)" : ""}: ${results.uploaded.length}`);
console.log(`워터마크 없음(원본 유지): ${results.noWatermark.length}`);
console.log(`검증 실패(원본 유지): ${results.failed.length}`);
for (const f of results.failed) console.log(`  ✗ ${f.sp} — ${f.reason}`);
console.log(`오류: ${results.errors.length}`);
for (const e of results.errors) console.log(`  ! ${e.url} — ${e.error}`);
console.log(`백업: ${ORIG_DIR} · 보고서: ${path.join(ROOT, "report.json")}`);
