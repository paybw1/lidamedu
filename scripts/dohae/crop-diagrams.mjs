// 도해특허법 다이어그램 구간 → 원본 PDF 크롭 이미지.
//
//   node scripts/dohae/crop-diagrams.mjs
//
// 크롭 범위 결정: 다이어그램 블록의 앞/뒤 소제목(h)의 페이지 내 y좌표 사이.
//   - 페이지 선택 = 다이어그램 도형 텍스트가 가장 많이 매칭되는 유닛 구간 페이지
//   - 앞 소제목이 같은 페이지에 없으면 본문 상단, 뒤 소제목이 없으면 하단 여백까지
// 출력: source/_converted/dohae-crops/*.png + dohae-crops.json (매니페스트)

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas, DOMMatrix, Path2D, ImageData } from "@napi-rs/canvas";

if (!globalThis.DOMMatrix) globalThis.DOMMatrix = DOMMatrix;
if (!globalThis.Path2D) globalThis.Path2D = Path2D;
if (!globalThis.ImageData) globalThis.ImageData = ImageData;

const ROOT = resolve(import.meta.dirname, "../..");
const PDF = resolve(ROOT, "source/특허법/도해특허법/[완0227+내지] 도해특허법 (제20판).pdf");
const JSON_PATH = resolve(ROOT, "source/_converted/dohae-patent.json");
const OUT_DIR = resolve(ROOT, "source/_converted/dohae-crops");
mkdirSync(OUT_DIR, { recursive: true });

const data = JSON.parse(readFileSync(JSON_PATH, "utf8"));
const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(PDF)), useSystemFonts: true }).promise;

const PAGE_W = 612, PAGE_H = 859;
const SCALE = 1500 / PAGE_W;
// 본문 컨텐츠 박스(실측) — 좌우 여백 제외, 상단은 러닝헤더 아래·하단은 쪽번호 위.
const X0 = 52, X1 = 560, TOP_Y = 792, BOT_Y = 76; // BOT_Y: 러닝푸터(쪽번호 · 圖解 특허법) 위
const ns = (s) => s.replace(/\s+/g, "");

// 페이지 텍스트(좌표 포함) 캐시
const pageItems = new Map();
async function itemsOf(pageNo) {
  if (pageItems.has(pageNo)) return pageItems.get(pageNo);
  const page = await doc.getPage(pageNo);
  const tc = await page.getTextContent();
  const items = tc.items.map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5] }));
  const joined = ns(items.map((i) => i.str).join(""));
  const v = { items, joined };
  pageItems.set(pageNo, v);
  return v;
}

// 페이지 렌더 캐시 (PNG buffer)
const pagePng = new Map();
async function renderPage(pageNo) {
  if (pagePng.has(pageNo)) return pagePng.get(pageNo);
  const page = await doc.getPage(pageNo);
  const v = page.getViewport({ scale: SCALE });
  const canvas = createCanvas(Math.ceil(v.width), Math.ceil(v.height));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: v }).promise;
  const buf = canvas.toBuffer("image/png");
  pagePng.set(pageNo, buf);
  return buf;
}

// 소제목 y좌표 — 좌측 시작(x<220) 아이템 중 h.text 의 앞부분과 일치하는 것.
function headingY(items, text) {
  const target = ns(text);
  let best = null;
  for (const it of items) {
    const s = ns(it.str);
    if (s.length < 3 || it.x > 220) continue;
    if (target.startsWith(s) || s.startsWith(target.slice(0, 8))) {
      if (best === null || it.y > best) best = it.y; // 같은 글이 여럿이면 위쪽(큰 y)
    }
  }
  return best;
}

const manifest = [];
let low = 0;

for (let ui = 0; ui < data.units.length; ui++) {
  const u = data.units[ui];
  const key = u.kind === "topic" ? `t${String(u.no).padStart(2, "0")}` : `r${u.refNo.replace(".", "-")}`;
  const nextPage = data.units[ui + 1]?.pdfPage ?? Math.min(doc.numPages, (u.pdfPage ?? 1) + 8);
  const pages = [];
  for (let p = u.pdfPage; p <= nextPage && p <= doc.numPages; p++) pages.push(p);

  for (let bi = 0; bi < u.blocks.length; bi++) {
    const b = u.blocks[bi];
    if (b.type !== "diagram") continue;
    // 도형 텍스트 매칭 점수로 페이지 선택
    const probes = [...new Set(b.texts.filter((t) => t.length >= 3))].slice(0, 10).map(ns);
    let bestPage = null, bestScore = -1;
    for (const p of pages) {
      const { joined } = await itemsOf(p);
      const score = probes.filter((t) => joined.includes(t)).length;
      if (score > bestScore) { bestScore = score; bestPage = p; }
    }
    const confident = probes.length > 0 && bestScore >= Math.min(2, probes.length);
    if (!confident) low++;
    const page = bestPage ?? u.pdfPage;
    const { items } = await itemsOf(page);

    // 앞/뒤 소제목
    let prevH = null, nextH = null;
    for (let k = bi - 1; k >= 0; k--) if (u.blocks[k].type === "h") { prevH = u.blocks[k]; break; }
    for (let k = bi + 1; k < u.blocks.length; k++) if (u.blocks[k].type === "h") { nextH = u.blocks[k]; break; }
    const yTopHead = prevH ? headingY(items, prevH.text) : null;
    const yBotHead = nextH ? headingY(items, nextH.text) : null;
    let topY = yTopHead !== null ? yTopHead - 6 : TOP_Y;
    let botY = yBotHead !== null && yBotHead < topY ? yBotHead + 16 : BOT_Y;
    // 다이어그램 바로 뒤가 도형 프레임 안 표(fromShape)면 그 표는 HTML 로 별도
    // 렌더되므로 크롭에서 제외 — 표 첫 행의 y좌표 위에서 끊는다(중복 방지).
    const nextB = u.blocks[bi + 1];
    if (nextB?.type === "table" && nextB.fromShape) {
      const sigs = (nextB.cells[0] ?? [])
        .map((c) => ns((c.text ?? "").split("\n")[0]))
        .filter((s) => s.length >= 2);
      const groups = new Map();
      for (const it of items) {
        if (it.y >= topY - 10) continue;
        const s = ns(it.str);
        if (!s) continue;
        if (sigs.some((sig) => sig.includes(s) || s.includes(sig))) {
          const k = Math.round(it.y);
          groups.set(k, (groups.get(k) ?? 0) + 1);
        }
      }
      let bestY = null, bestN = 0;
      for (const [y, n] of groups)
        if (n > bestN || (n === bestN && (bestY === null || y > bestY))) { bestY = y; bestN = n; }
      if (bestY !== null && bestN >= Math.min(2, sigs.length) && bestY + 14 > botY) {
        botY = bestY + 14;
      }
    }
    // 좌표 오탐 가드 — 구간이 너무 얇으면(40pt 미만) 페이지 본문 전체로 폴백.
    if (topY - botY < 40) { topY = TOP_Y; botY = BOT_Y; }

    const left = Math.round(X0 * SCALE);
    const width = Math.round((X1 - X0) * SCALE);
    const top = Math.round((PAGE_H - topY) * SCALE);
    const height = Math.round((topY - botY) * SCALE);
    const file = `${key}-b${bi}.png`;
    const png = await renderPage(page);
    // trim: 하단 소제목 부재 시 남는 큰 흰 여백 제거 → 소폭 패딩 복원.
    // (sharp 는 한 파이프라인에서 trim 을 extract 보다 먼저 적용 → 2단계 분리 필수)
    const cropped = await sharp(png).extract({ left, top, width, height }).png().toBuffer();
    await sharp(cropped)
      .trim({ threshold: 12 })
      .extend({ top: 14, bottom: 14, left: 14, right: 14, background: "#fff" })
      .toFile(resolve(OUT_DIR, file));
    manifest.push({
      unit: key, unitTitle: u.title, blockIndex: bi, page,
      rectPt: { x0: X0, x1: X1, topY: Math.round(topY), botY: Math.round(botY) },
      file, confident, score: `${bestScore}/${probes.length}`,
      prevHeading: prevH?.text ?? null, nextHeading: nextH?.text ?? null,
      headTopFound: yTopHead !== null, headBotFound: yBotHead !== null,
    });
    console.log(`${key} b${bi} p${page} ${confident ? "ok" : "★확인필요"} (${bestScore}/${probes.length}) ${prevH?.text ?? "(상단)"} → ${nextH?.text ?? "(하단)"}`);
  }
}

writeFileSync(resolve(ROOT, "source/_converted/dohae-crops.json"), JSON.stringify(manifest, null, 1), "utf8");
console.log(`\n크롭 ${manifest.length}건 (확인 필요 ${low}건) → ${OUT_DIR}`);
