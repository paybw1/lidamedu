// 도해특허법 다이어그램 구간 → 원본 PDF 크롭 이미지.
//
//   node scripts/dohae/crop-diagrams.mjs
//
// 크롭 범위 결정: 다이어그램 블록의 앞/뒤 소제목(h)의 페이지 내 y좌표 사이.
//   - 페이지 선택 = 다이어그램 도형 텍스트가 가장 많이 매칭되는 유닛 구간 페이지
//   - 앞 소제목이 같은 페이지에 없으면 본문 상단, 뒤 소제목이 없으면 하단 여백까지
// 출력: source/_converted/dohae-crops/*.png + dohae-crops.json (매니페스트)
//
// ★재실행하면 반드시 **바뀐 파일을 눈으로 본 뒤** 스토리지에 올린다. 좌표가 휴리스틱이라
//   한 곳을 고치면 다른 곳이 깨진다(2026-08-21 실측: t25 를 고치려다 t68 이 페이지 전체를
//   잡아 앞 절 표 2개가 이미지에 들어갔다). 34장뿐이니 검수가 규칙 개선보다 싸다.
//   현재 미검수 상태로 남은 것: t01-b7 · t17-b5 · t23-b5 · t29-b5 · t44-b7 · t68-b10 ·
//   t79-b12 · r3-2-b1 (repo·스토리지 모두 종전 이미지 유지).

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
  const v = { items, joined, lines: toLines(items) };
  pageItems.set(pageNo, v);
  return v;
}

// ★한 줄을 아이템 하나로 보면 안 된다 — 이 PDF 는 숫자를 다른 글꼴로 찍어 문장을
//   토막낸다("법 제" / "47" / "조 제" / "3" / "항 제" / "4" / "호의 구체적인 예").
//   토막 하나로 소제목을 찾으면 못 찾고, 그러면 크롭이 페이지 위쪽까지 열려 제목이
//   이미지에 들어간다(화면에서 제목이 두 번 보인다 — t25, 2026-08-21 원장 보고).
function toLines(items) {
  const rows = new Map();
  for (const it of items) {
    if (!it.str.trim()) continue;
    const k = Math.round(it.y);
    if (!rows.has(k)) rows.set(k, []);
    rows.get(k).push(it);
  }
  return [...rows.entries()]
    .map(([y, its]) => {
      its.sort((a, b) => a.x - b.x);
      return { y, x: its[0].x, text: ns(its.map((i) => i.str).join("")) };
    })
    .sort((a, b) => b.y - a.y);
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

// 소제목 y좌표 — 좌측 시작(x<220) 줄 중 h.text 의 앞부분과 일치하는 것.
function headingY(lines, text) {
  const target = ns(text);
  let best = null;
  for (const ln of lines) {
    if (ln.text.length < 3 || ln.x > 220) continue;
    // 줄 맨 앞의 번호 배지(Ⅵ 등)를 떼고 **앞부분 일치**로 본다.
    // ★단순 포함(includes)으로 보면 안 된다 — 유닛 제목 "1.2 발명의 분류" 가 소제목
    //   "분 류" 를 포함해서 그쪽이 잡히고, 크롭이 제목 위에서 시작해 제목이 이미지에
    //   들어간다(화면에서 제목이 두 번 보인다).
    // ★뒤쪽 조건(제목이 줄로 시작)은 줄이 충분히 길 때만 — "직접침해" 한 칸이
    //   소제목 "직접침해의 유형별 검토" 의 앞부분이라는 이유로 표 칸에 걸린다.
    const body = ln.text.replace(/^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫ]+/, "");
    const hit =
      body.startsWith(target.slice(0, 12)) ||
      (body.length >= Math.min(target.length, 8) && target.startsWith(body));
    if (hit && (best === null || ln.y > best)) best = ln.y;
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
    const { items, lines } = await itemsOf(page);

    // 앞/뒤 소제목
    let prevH = null, nextH = null;
    for (let k = bi - 1; k >= 0; k--) if (u.blocks[k].type === "h") { prevH = u.blocks[k]; break; }
    for (let k = bi + 1; k < u.blocks.length; k++) if (u.blocks[k].type === "h") { nextH = u.blocks[k]; break; }
    // ★앞 소제목이 없으면(유닛 첫 블록) 유닛 제목 아래에서 끊는다 — 안 그러면 크롭이
    //   본문 맨 위에서 시작해 제목까지 들어간다(참고 3.1).
    const unitTitleLine =
      u.kind === "reference" ? `${u.refNo} ${u.title}` : u.title;
    const yTopHead = prevH
      ? headingY(lines, prevH.text)
      : headingY(lines, unitTitleLine);
    const yBotHead = nextH ? headingY(lines, nextH.text) : null;
    let topY = yTopHead !== null ? yTopHead - 6 : TOP_Y;
    let botY = yBotHead !== null && yBotHead < topY ? yBotHead + 16 : BOT_Y;
    // 다이어그램 바로 뒤가 표면 그 표는 HTML 로 별도 렌더되므로 크롭에서 제외 —
    // 표 첫 행의 y좌표 위에서 끊는다(중복 방지).
    // ★fromShape(도형 프레임 안 표)만 보던 조건이었는데, 일반 표도 같은 문제를 낳는다
    //   — 뒤 소제목까지 크롭하면 그 사이의 표가 이미지에 통째로 들어가 화면에 두 번 보인다
    //   (t08 특허에 관한 절차 일반, 2026-08-21 원장 보고). 아래 시그니처 매칭이
    //   같은 페이지에서 표 첫 행을 못 찾으면 그대로 넘어가므로 조건을 넓혀도 안전하다.
    let dbg = null;
    const nextB = u.blocks[bi + 1];
    if (nextB?.type === "table") {
      // 표의 윗변 = 첫 행이 놓인 줄. 첫 행 칸들이 **같은 y 에 2개 이상** 찍히면 그게 머리행이다.
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
      if (bestY !== null && bestN < Math.min(2, sigs.length)) bestY = null;

      // ★폴백 — 머리행 없이 "라벨 + 긴 본문" 으로 시작하는 표는 첫 행 칸들이 서로 다른 줄에
      //   놓인다(라벨이 세로 가운데 정렬돼 내려앉는다). 그러면 위 규칙이 아무것도 못 찾는다.
      //   이때만 **맨 위 매칭 줄**을 쓰되, 60pt 안쪽에 매칭이 하나 더 있어야 인정한다 —
      //   다이어그램 안에 우연히 같은 문구가 홑줄로 있는 경우를 거르기 위해서다(t25).
      if (bestY === null && groups.size >= 2) {
        const ys = [...groups.keys()].sort((a, b) => b - a);
        for (let k = 0; k < ys.length - 1; k++) {
          if (ys[k] - ys[k + 1] <= 60) { bestY = ys[k]; break; }
        }
      }
      dbg = { sigs: sigs.length, hitRows: groups.size, bestY, bestN };
      if (bestY !== null && bestY + 14 > botY) botY = bestY + 14;
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
      headTopFound: yTopHead !== null, headBotFound: yBotHead !== null, tableCut: dbg,
    });
    console.log(`${key} b${bi} p${page} ${confident ? "ok" : "★확인필요"} (${bestScore}/${probes.length}) ${prevH?.text ?? "(상단)"} → ${nextH?.text ?? "(하단)"}`);
  }
}

writeFileSync(resolve(ROOT, "source/_converted/dohae-crops.json"), JSON.stringify(manifest, null, 1), "utf8");
console.log(`\n크롭 ${manifest.length}건 (확인 필요 ${low}건) → ${OUT_DIR}`);
