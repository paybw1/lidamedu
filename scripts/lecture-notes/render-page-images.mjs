// 강의노트 유출방지 ①: 원본 PDF → 페이지별 WebP 사전 렌더 + 공용 워터마크 굽기.
// 원본 PDF 를 클라이언트에 전달하지 않기 위한 서빙용 이미지 생성.
//
//   node scripts/lecture-notes/render-page-images.mjs            # 전체(멱등 — 기존 페이지 skip)
//   node scripts/lecture-notes/render-page-images.mjs --force    # 재렌더(워터마크 변경 등)
//   node scripts/lecture-notes/render-page-images.mjs --only-src # 통합본만
//   node scripts/lecture-notes/render-page-images.mjs --only-res # 미매핑 조각만
//
// 산출: private 버킷 lecture-note-pages
//   통합본: src/<source_pdf_id>/<page>.webp
//   조각(통합본 미매핑): res/<resource_id>/<page>.webp + lecture_resources.page_count
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas, DOMMatrix, Path2D, ImageData } from "@napi-rs/canvas";
import sharp from "sharp";

if (!globalThis.DOMMatrix) globalThis.DOMMatrix = DOMMatrix;
if (!globalThis.Path2D) globalThis.Path2D = Path2D;
if (!globalThis.ImageData) globalThis.ImageData = ImageData;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("env 미설정");
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const SRC_BUCKET = "lecture-notes";
const PAGES_BUCKET = "lecture-note-pages";
const TARGET_WIDTH = 1600; // 표시 해상도 — 확대 감안 1600px
const WEBP_QUALITY = 80;
const WATERMARK_TEXT = "리담변리사학원";

const FORCE = process.argv.includes("--force");
const ONLY_SRC = process.argv.includes("--only-src");
const ONLY_RES = process.argv.includes("--only-res");

// ── 버킷 보장 (private) ──
{
  const { data: buckets } = await sb.storage.listBuckets();
  if (!buckets?.some((b) => b.name === PAGES_BUCKET)) {
    const { error } = await sb.storage.createBucket(PAGES_BUCKET, { public: false });
    if (error) { console.error(`버킷 생성 실패: ${error.message}`); process.exit(1); }
    console.log(`버킷 생성: ${PAGES_BUCKET} (private)`);
  }
}

async function listExisting(prefix) {
  const names = new Set();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb.storage.from(PAGES_BUCKET).list(prefix, { limit: 1000, offset });
    if (error) throw error;
    for (const f of data ?? []) names.add(f.name);
    if ((data ?? []).length < 1000) break;
  }
  return names;
}

function drawWatermark(ctx, w, h) {
  // 연한 대각선 반복 — 이미지에 굽는 공용 워터마크(개인 식별은 뷰어 오버레이).
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = "#334155";
  ctx.font = `600 ${Math.round(w / 22)}px "Malgun Gothic", sans-serif`;
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-Math.PI / 7);
  ctx.textAlign = "center";
  const stepY = Math.round(h / 3.2);
  const stepX = Math.round(w / 1.6);
  for (let row = -2; row <= 2; row++) {
    for (let col = -1; col <= 1; col++) {
      ctx.fillText(WATERMARK_TEXT, col * stepX + (row % 2 ? stepX / 2 : 0), row * stepY);
    }
  }
  ctx.restore();
}

async function renderPdfToPages(pdfBytes, prefix, label) {
  const existing = FORCE ? new Set() : await listExisting(prefix);
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(pdfBytes),
    useSystemFonts: true,
    isEvalSupported: false,
  }).promise;
  let uploaded = 0, skipped = 0;
  for (let i = 1; i <= doc.numPages; i++) {
    const key = `${i}.webp`;
    if (existing.has(key)) { skipped++; continue; }
    const page = await doc.getPage(i);
    const vp1 = page.getViewport({ scale: 1 });
    const scale = TARGET_WIDTH / vp1.width;
    const vp = page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
    drawWatermark(ctx, canvas.width, canvas.height);
    const webp = await sharp(canvas.toBuffer("image/png")).webp({ quality: WEBP_QUALITY }).toBuffer();
    const { error } = await sb.storage
      .from(PAGES_BUCKET)
      .upload(`${prefix}/${key}`, webp, { contentType: "image/webp", upsert: true });
    if (error) throw new Error(`upload ${prefix}/${key}: ${error.message}`);
    uploaded++;
    if (uploaded % 50 === 0) console.log(`  ${label}: ${uploaded} 업로드…`);
  }
  const total = doc.numPages;
  await doc.destroy();
  console.log(`${label}: 총 ${total}p · 업로드 ${uploaded} · skip ${skipped}`);
  return total;
}

async function downloadPdf(path) {
  const { data, error } = await sb.storage.from(SRC_BUCKET).download(path);
  if (error) throw new Error(`download ${path}: ${error.message}`);
  return Buffer.from(await data.arrayBuffer());
}

// ── 1) 통합본 ──
if (!ONLY_RES) {
  const { data: srcs, error } = await sb
    .from("lecture_source_pdfs")
    .select("source_pdf_id, title, storage_path, total_pages");
  if (error) throw error;
  for (const s of srcs ?? []) {
    console.log(`통합본: ${s.title} (${s.total_pages}p)`);
    const pdf = await downloadPdf(s.storage_path);
    const rendered = await renderPdfToPages(pdf, `src/${s.source_pdf_id}`, s.title);
    if (rendered !== s.total_pages) {
      console.warn(`⚠ total_pages(${s.total_pages}) ≠ 렌더(${rendered}) — 확인 필요`);
    }
  }
}

// ── 2) 통합본 미매핑 조각 ──
if (!ONLY_SRC) {
  const all = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from("lecture_resources")
      .select("resource_id, title, pdf_url, source_pdf_id, source_page_start, page_count")
      .is("deleted_at", null)
      .not("pdf_url", "is", null)
      .order("resource_id")
      .range(from, from + 999);
    if (error) throw error;
    all.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  const unmapped = all.filter((r) => !(r.source_pdf_id && r.source_page_start));
  console.log(`미매핑 조각: ${unmapped.length}건`);
  let done = 0;
  for (const r of unmapped) {
    if (!FORCE && r.page_count) { done++; continue; } // 이미 렌더됨
    const pdf = await downloadPdf(r.pdf_url);
    const pages = await renderPdfToPages(pdf, `res/${r.resource_id}`, r.title);
    const { error } = await sb
      .from("lecture_resources")
      .update({ page_count: pages })
      .eq("resource_id", r.resource_id);
    if (error) throw error;
    done++;
    if (done % 10 === 0) console.log(`조각 진행: ${done}/${unmapped.length}`);
  }
  console.log(`조각 완료: ${done}/${unmapped.length}`);
}

console.log("렌더 배치 완료");
