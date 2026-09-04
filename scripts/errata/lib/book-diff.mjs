// 책 두 판(인쇄된 PDF ↔ 개정중 HWPX)을 글자 단위로 대조하는 규칙 한 벌.
//
// ★규칙은 여기 한 곳에만 둔다. 재 보는 도구와 뽑아내는 도구가 갈리면 추록이 원고와 어긋난다.
//
// 함정 — 아래는 전부 실제로 밟아 본 것이다.
//   ① HWPX 의 각주(hp:footNote)·표 칸·도형 안 글을 본문에 섞으면 대조가 무너진다. 각주는 본문
//      문장 한가운데에 끼어 들어가 있어서, 섞은 채로 재면 본문 일치율이 84% 로 떨어진다.
//   ② 색인표시(hp:ctrl > hp:indexmark > hp:firstKey)는 **화면에 없는 글**인데 hp:t 밖에 있다.
//      아무 #text 나 주워 담으면 제목이 "지식재산권의 목적지식재산권의 목적" 이 된다 → 글자는 hp:t 안에서만.
//   ③ PDF 는 각주가 본문보다 **앞선 순서로** 나오는 쪽이 있다. 한 흐름으로 이으면 순서가 깨진다
//      → 글자 크기로 본문(≥9.2)과 작은글씨(각주·표)를 갈라 두 흐름으로 본다.
//   ④ 러닝헤더("40 · 제1편 총론")를 지우지 않으면 쪽마다 가짜 차이가 생긴다.
//   ⑤ 앵커를 순서 무시하고 잡으면 한 번 어긋난 뒤로 전부 어긋난다 → LIS 로 **단조 증가하는 앵커만** 인정.
//   ⑥ 색인·참고문헌은 본문이 아니다(쪽 번호가 구판 기준이라 통째로 차이가 된다) → 뒷부속물은 잘라낸다.

import AdmZip from "adm-zip";
import { XMLParser } from "fast-xml-parser";
import { readFileSync } from "node:fs";

/** 본문으로 볼 글자 높이 하한(pt). 이 책은 본문 9.8 / 각주 8.0 / 표 8.5·7.5. */
export const BODY_MIN_HEIGHT = 9.2;
/** 앵커로 쓸 최소 길이 — 이보다 짧은 조각은 앵커 사이 구간에서만 찾는다. */
export const MIN_ANCHOR_LEN = 12;
/** 앵커 탐색에 쓰는 앞부분 길이. 문단이 통째로 같은지는 따로 확인한다. */
export const ANCHOR_KEY_LEN = 48;
/** 이만큼 이어서 안 덮이면 "구판에만 있는 구간"으로 본다. */
export const MIN_GAP_LEN = 40;

const CHAR_MAP = { "ㆍ": "·", "․": ".", "，": ",", "（": "(", "）": ")" };
const QUOTES = /[「」『』“”‘’"']/g;

/** 대조용 정규화 — 공백·따옴표를 지우고 이체자를 모은다(줄바꿈 위치가 판마다 다르다). */
export function normalize(text) {
  return (text || "")
    .replace(/[ㆍ․，（）]/g, (c) => CHAR_MAP[c])
    .replace(QUOTES, "")
    .replace(/\s+/g, "");
}

/** 판면 장식(러닝헤더·쪽번호) 인가. */
export function isRunningHeader(text) {
  const n = normalize(text);
  return /^\d{1,4}·/.test(n) || /·\d{1,4}$/.test(n);
}

// ─────────────────────────────── HWPX ───────────────────────────────

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  preserveOrder: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  textNodeName: "#text",
});

const tagOf = (node) => Object.keys(node).find((k) => k !== ":@" && k !== "#text");

/**
 * HWPX → 버킷별 조각. kind = body | note(각주) | table(표 칸) | shape(도형 안 글).
 * 머리말·꼬리말은 버린다(본문이 아니라 판면 장식).
 */
export function extractHwpx(hwpxPath) {
  const zip = new AdmZip(hwpxPath);
  const items = [];
  let seq = 0;
  const push = (kind, text, extra = {}) => {
    const t = (text || "").replace(/\u0000/g, "").trim();
    if (t) items.push({ seq: seq++, kind, text: t, ...extra });
  };

  function walkPara(paraChildren, kind) {
    let buf = "";
    const flush = () => {
      push(kind, buf);
      buf = "";
    };
    const visit = (nodes) => {
      for (const n of nodes || []) {
        const tag = tagOf(n);
        if (!tag) continue; // ★글자는 hp:t 안에서만 — 색인표시 글이 본문에 섞인다
        const kids = n[tag];
        switch (tag) {
          case "hp:t":
            buf += (kids || []).map((k) => k["#text"] ?? "").join("");
            break;
          case "hp:lineBreak":
            buf += " ";
            break;
          case "hp:footNote":
            flush();
            walkBlocks(kids, "note");
            break;
          case "hp:tbl":
            flush();
            walkTable(n);
            break;
          case "hp:drawText":
            flush();
            walkBlocks(kids, "shape");
            break;
          case "hp:header":
          case "hp:footer":
          case "hp:indexmark":
          case "hp:bookmark":
          case "hp:linesegarray":
          case "hp:ctrlHeader":
            break;
          default:
            visit(kids);
        }
      }
    };
    visit(paraChildren);
    flush();
  }

  function walkTable(tblNode) {
    const cells = [];
    const scan = (nodes) => {
      for (const n of nodes || []) {
        const tag = tagOf(n);
        if (!tag) continue;
        if (tag !== "hp:tc") {
          scan(n[tag]);
          continue;
        }
        const span = (n[tag] || []).find((x) => tagOf(x) === "hp:cellSpan");
        const before = items.length;
        walkBlocks(n[tag], "table");
        const made = items.splice(before);
        seq -= made.length;
        cells.push({
          text: made.map((m) => m.text).join(" "),
          // ★병합 정보를 버리면 표가 밀린 것을 못 본다(hwpx-to-text 가 여기서 셀을 잃었다).
          colSpan: Number(span?.[":@"]?.["@_colSpan"] ?? 1),
          rowSpan: Number(span?.[":@"]?.["@_rowSpan"] ?? 1),
        });
      }
    };
    scan(tblNode["hp:tbl"]);
    for (const c of cells) push("table", c.text, { colSpan: c.colSpan, rowSpan: c.rowSpan });
  }

  function walkBlocks(nodes, kind) {
    for (const n of nodes || []) {
      const tag = tagOf(n);
      if (!tag) continue;
      if (tag === "hp:p") walkPara(n[tag], kind);
      else if (tag === "hp:header" || tag === "hp:footer") continue;
      else walkBlocks(n[tag], kind);
    }
  }

  for (const entry of zip.getEntries()) {
    if (!/^Contents\/section\d+\.xml$/.test(entry.entryName)) continue;
    walkBlocks(parser.parse(entry.getData().toString("utf8")), "body");
  }
  return items;
}

// ─────────────────────────────── PDF ───────────────────────────────

/** PDF → 쪽·줄 단위 글자. 줄마다 글자 높이를 남긴다(본문/각주 가르는 데 쓴다). */
export async function extractPdf(pdfPath, { root, onPage } = {}) {
  const base = (root ?? process.cwd()).replace(/\\/g, "/");
  const { getDocument } = await import(`file:///${base}/node_modules/pdfjs-dist/legacy/build/pdf.mjs`);
  const doc = await getDocument({
    data: new Uint8Array(readFileSync(pdfPath)),
    standardFontDataUrl: `${base}/node_modules/pdfjs-dist/standard_fonts/`,
    useSystemFonts: true,
  }).promise;

  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    const lines = [];
    let cur = null;
    for (const it of content.items) {
      if (!it.str) continue;
      const y = Math.round(it.transform[5]);
      const h = Math.abs(it.transform[3]) || it.height || 0;
      // 같은 줄인가 — y 가 2pt 넘게 튀면 새 줄.
      if (!cur || Math.abs(cur.y - y) > 2) {
        cur = { y, h, text: it.str };
        lines.push(cur);
      } else {
        cur.text += it.str;
        cur.h = Math.max(cur.h, h);
      }
    }
    pages.push({ page: p, lines });
    onPage?.(p, doc.numPages);
  }
  return pages;
}

// ─────────────────────────── 흐름 만들기·정렬 ───────────────────────────

/** 고른 줄들을 이어 붙인 한 흐름. 글자 위치 → 쪽, 그리고 읽을 수 있는 원문 줄을 함께 든다. */
export function buildStream(pages, pick) {
  let text = "";
  const pageAt = [];
  const lines = [];
  for (const pg of pages) {
    for (const l of pg.lines) {
      if (isRunningHeader(l.text) || !pick(l)) continue;
      const n = normalize(l.text);
      if (!n) continue;
      lines.push({ from: text.length, to: text.length + n.length, page: pg.page, raw: l.text });
      for (let i = 0; i < n.length; i++) pageAt.push(pg.page);
      text += n;
    }
  }
  return { text, pageAt, lines };
}

/** 구간에 걸친 원문 줄들 — 정규화된 흐름은 공백이 없어 사람이 못 읽는다. */
export function rawOfRange(stream, from, to) {
  return stream.lines
    .filter((l) => l.to > from && l.from < to)
    .map((l) => l.raw.trim())
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

const occurrences = (hay, needle, cap = 8) => {
  const out = [];
  let i = hay.indexOf(needle);
  while (i >= 0 && out.length < cap) {
    out.push(i);
    i = hay.indexOf(needle, i + 1);
  }
  return out;
};

/** 이어지지 않는 글을 토막 내어 덮을 때 쓰는 토막 길이·탐색 창. */
const PIECE_LEN = 24;
const PIECE_WINDOW = 4000;

/**
 * 앵커에서 시작해 글을 **토막 내어 따라가며** 덮는다.
 *
 * ★쪽을 넘어가는 각주는 PDF 흐름에서 통으로 이어지지 않는다 — 쪽이 바뀌는 자리에 그 쪽의
 *   다른 각주가 끼어들기 때문이다. 앞부분만 덮고 말면 나머지가 통째로 "구판에만 있는 글"이
 *   되어 멀쩡한 각주가 삭제로 잡힌다(미완성발명 각주 p.37~38 실사례).
 */
function coverPiecewise(stream, needle, at, cover) {
  let cursor = at;
  for (let i = 0; i < needle.length; i += PIECE_LEN) {
    const piece = needle.slice(i, i + PIECE_LEN);
    if (piece.length < 6) break; // 꼬리 토막은 아무 데나 걸린다
    const found = stream.text.indexOf(piece, cursor);
    if (found < 0 || found - cursor > PIECE_WINDOW) continue;
    cover.push([found, found + piece.length]);
    cursor = found + piece.length;
  }
}

/** 가장 긴 증가 부분수열 — 순서를 지키는 앵커만 남긴다. */
function longestIncreasing(candidates) {
  const flat = [];
  candidates.forEach((c, ci) => c.positions.forEach((p) => flat.push({ ci, p })));
  flat.sort((a, b) => a.ci - b.ci || a.p - b.p);
  const from = new Array(flat.length).fill(-1);
  const idx = [];
  for (let k = 0; k < flat.length; k++) {
    const p = flat[k].p;
    let lo = 0;
    let hi = idx.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (flat[idx[mid]].p < p) lo = mid + 1;
      else hi = mid;
    }
    from[k] = lo > 0 ? idx[lo - 1] : -1;
    idx[lo] = k;
  }
  const seq = [];
  let k = idx.length ? idx[idx.length - 1] : -1;
  while (k >= 0) {
    seq.push(flat[k]);
    k = from[k];
  }
  return seq.reverse();
}

/**
 * 한 버킷을 구판 흐름에 맞춰 본다.
 * @param cover 덮인 구간을 적는 배열 — **여러 버킷이 한 흐름을 나눠 쓰면 같은 배열을 준다**.
 *   각주와 표 칸은 둘 다 작은글씨라 한 흐름에 산다. 따로 재면 서로를 구멍으로 본다(49% 오탐).
 */
export function alignBucket(items, stream, cover, extraCoverTexts = []) {
  const rows = items.map((it) => ({ it, n: normalize(it.text) })).filter((r) => r.n.length >= 4);
  const longRows = rows.map((r, i) => ({ r, i })).filter((x) => x.r.n.length >= MIN_ANCHOR_LEN);
  const candidates = longRows
    .map(({ r, i }) => ({
      i,
      positions: occurrences(stream.text, r.n.slice(0, Math.min(ANCHOR_KEY_LEN, r.n.length))),
    }))
    .filter((c) => c.positions.length);

  const kept = longestIncreasing(candidates);
  const anchors = kept.map((x) => ({ rowIdx: candidates[x.ci].i, at: x.p }));
  const matched = new Set(anchors.map((a) => a.rowIdx));
  const posOf = new Map(anchors.map((a) => [a.rowIdx, a.at]));
  for (const a of anchors) {
    const n = rows[a.rowIdx].n;
    if (stream.text.startsWith(n, a.at)) cover.push([a.at, a.at + n.length]);
    else coverPiecewise(stream, n, a.at, cover);
  }

  // 짧은 조각(제목·번호매김)은 앵커 사이에서만 찾는다 — 어디서나 찾으면 순서가 무너진다.
  let shortHit = 0;
  const shortMiss = [];
  for (let i = 0; i < rows.length; i++) {
    if (matched.has(i) || rows[i].n.length >= MIN_ANCHOR_LEN) continue;
    let lo = 0;
    let hi = stream.text.length;
    for (let j = i - 1; j >= 0; j--) if (posOf.has(j)) { lo = posOf.get(j); break; }
    for (let j = i + 1; j < rows.length; j++) if (posOf.has(j)) { hi = posOf.get(j); break; }
    const at = stream.text.indexOf(rows[i].n, lo);
    if (at >= 0 && at < hi + 2000) {
      cover.push([at, at + rows[i].n.length]);
      shortHit++;
    } else shortMiss.push(rows[i].it);
  }

  // 도형 안 글은 순서가 판마다 뒤바뀐다 — 앵커로는 못 쓰고, 덮는 데만 쓴다.
  for (const t of extraCoverTexts) {
    const n = normalize(t);
    if (n.length < 4) continue;
    const at = stream.text.indexOf(n);
    if (at >= 0) cover.push([at, at + n.length]);
  }

  const added = longRows
    .filter((x) => !matched.has(x.i))
    .map(({ r, i }) => {
      let page = null;
      for (let j = i - 1; j >= 0; j--) if (posOf.has(j)) { page = stream.pageAt[posOf.get(j)]; break; }
      return { kind: r.it.kind, text: r.it.text, page };
    });

  return { added, anchored: anchors.length, shortHit, shortMiss, total: rows.length };
}

/** 어느 조각도 덮지 못한 구간 = 구판에만 있는 글. */
export function gapsOf(cover, stream, minLen = MIN_GAP_LEN) {
  const sorted = [...cover].sort((a, b) => a[0] - b[0]);
  const raw = [];
  let cursor = 0;
  for (const [a, b] of sorted) {
    if (a > cursor) raw.push([cursor, a]);
    cursor = Math.max(cursor, b);
  }
  if (cursor < stream.text.length) raw.push([cursor, stream.text.length]);
  return raw
    .filter(([a, b]) => b - a >= minLen)
    .map(([a, b]) => ({
      len: b - a,
      page: stream.pageAt[a],
      text: rawOfRange(stream, a, b),
      normText: stream.text.slice(a, b),
    }));
}

/** 두 글의 닮은 정도(0~1) — 글자 두 개씩 겹치는 비율. 추가·삭제를 "수정" 으로 묶는 데 쓴다. */
export function similarity(a, b) {
  const bigrams = (s) => {
    const m = new Map();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return m;
  };
  const na = normalize(a);
  const nb = normalize(b);
  if (na.length < 2 || nb.length < 2) return na === nb ? 1 : 0;
  const ma = bigrams(na);
  const mb = bigrams(nb);
  let shared = 0;
  for (const [g, n] of ma) shared += Math.min(n, mb.get(g) ?? 0);
  return (2 * shared) / (na.length - 1 + nb.length - 1);
}

/** 앞뒤로 같은 부분을 떼어내고 달라진 가운데만 남긴다. */
export function trimCommon(before, after) {
  const max = Math.min(before.length, after.length);
  let head = 0;
  while (head < max && before[head] === after[head]) head++;
  let tail = 0;
  while (tail < max - head && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail++;
  return {
    head: before.slice(0, head),
    beforeMid: before.slice(head, before.length - tail),
    afterMid: after.slice(head, after.length - tail),
    tail: tail ? before.slice(before.length - tail) : "",
  };
}

/** 색인·참고문헌부터는 본문이 아니다 — 쪽 번호가 구판 기준이라 통째로 차이가 된다. */
export function findBackMatter(pages, items) {
  const flat = (pg) => pg.lines.map((l) => l.text).join("").replace(/\s+/g, "");
  const pdfPage = pages.find((pg) => /색인\(INDEX\)/.test(flat(pg)))?.page ?? Infinity;
  const at = items.findIndex((it, i) => i > items.length * 0.8 && /^(색\s*인|찾아보기)$/.test(it.text.trim()));
  return { pdfPage, hwpxSeq: at >= 0 ? items[at].seq : Infinity };
}
