// 표·그림(도해)을 판끼리 맞춰 보는 규칙. `book-diff.mjs` 는 글을, 여기는 **도해 목록**을 다룬다.
//
// ★번호로 맞추면 안 된다 — 원고에서 캡션 번호는 **자동 번호매김**이라 도해 하나만 끼워 넣어도
//   뒤가 전부 밀린다. 그래서 **제목으로** 맞추고, 번호가 밀린 것은 결과로 따로 적어 준다.
//
// 양쪽에서 캡션을 얻는 자리가 다르다.
//   구판(PDF) — 본문 안에 「【그림 1-1】 지식재산의 보호 체계」로 찍혀 있다(인쇄 쪽수를 같이 얻는다).
//   신판(HWPX) — 본문 캡션에는 번호가 없다(인쇄할 때 붙는다). 대신 **뒷부속의 표·그림 목차**에
//                「【표 1-1】  지식재산법의 목적5」처럼 번호·제목이 온전히 있다.
//                ★꼬리의 숫자는 **원고 쪽수**다. 인쇄 쪽수가 아니므로 순서 확인에만 쓴다.

import { readFileSync } from "node:fs";

import { normalize } from "./book-diff.mjs";

/** 【그림 3-33】 / 【표 6-17-(1)】 — 번호 자리는 숫자·붙임표·괄호까지 받는다. */
const CAPTION = /【\s*(그림|표)\s*([\d\-–()ㆍ.\s]+)】\s*(.*)$/;

const numOf = (raw) => raw.replace(/\s+/g, "").replace(/–/g, "-");

/**
 * 제목을 맞춰 볼 수 있게 다듬는다. 구판 제목에는 인쇄 부산물이 붙어 온다.
 *   ① 각주 번호 — 「…미완성 발명과의 관계63)」, 「심사 실무73)상 진보성 판단절차」(가운데도 낀다)
 *   ② 자동 붙는 일련번호 — 원고는 「중용권의 例」인데 인쇄본은 「중용권의 例 1」·「例 2」
 * ★①은 지우고 ②는 남긴다(뒤에서 접두로 맞춘다) — 지워 버리면 例1·例2 가 한 도해로 뭉친다.
 */
const titleKey = (title) => normalize(title.replace(/\d{1,3}\)/g, ""));

/** 접두로 맞춰도 되는 최소 길이 — 짧은 제목끼리 엉뚱하게 붙는 것을 막는다. */
const PREFIX_MIN = 10;

/** 구판(인쇄본) 본문에 찍힌 캡션 — 인쇄 쪽수를 함께 얻는다. */
export function oldCaptions(pages, maxPage) {
  const out = [];
  for (const pg of pages) {
    if (pg.page >= maxPage) break;
    for (const l of pg.lines) {
      const m = CAPTION.exec(l.text.trim());
      if (!m || !m[3].trim()) continue;
      out.push({ kind: m[1], num: numOf(m[2]), title: m[3].trim(), page: pg.page });
    }
  }
  return out;
}

/**
 * 신판 원고의 뒷부속 표·그림 목차.
 * 꼬리에 붙은 1~4자리 숫자는 원고 쪽수라 떼어 낸다.
 * ★제목이 진짜 숫자로 끝나는 도해는 여기서 잘못 잘린다 — 억지로 막지 않고 「제목 바뀜」으로
 *   드러나게 둔다. 사람이 한 줄 보면 바로 알아본다.
 */
export function newCaptions(items, fromSeq) {
  const out = [];
  for (const it of items) {
    if (it.seq < fromSeq) continue;
    const m = CAPTION.exec(it.text.trim());
    if (!m) continue;
    const rest = m[3].trim();
    const tail = /^(.*?)\s*(\d{1,4})$/.exec(rest);
    const title = (tail ? tail[1] : rest).trim();
    if (!title) continue;
    out.push({ kind: m[1], num: numOf(m[2]), title, manuscriptPage: tail ? Number(tail[2]) : null });
  }
  return out;
}

/**
 * 제목으로 맞춰 본다. 같은 제목이 둘 이상이면(「법정실시권의 요약 정리」×2) 나온 순서대로 짝짓는다.
 *
 * 두 번 훑는다.
 *   1차 — 다듬은 제목이 똑같은 것.
 *   2차 — 남은 것끼리 **한쪽이 다른 쪽의 앞부분**이면 같은 도해로 본다.
 *         ★인쇄본 캡션은 줄바꿈에서 잘려 들어온다(「…乙이 A+B+C+D로 구성된 발명을」에서 끝난다).
 *           접두로 안 맞추면 긴 제목의 표가 전부 "없어짐 + 새로 생김" 두 건으로 부풀어 오른다.
 *
 * @returns {{ pairs, added, removed, renumbered, retitled }}
 *   renumbered = 제목 그대로인데 번호가 밀린 것 — 도해가 끼거나 빠졌다는 **결과**이지 정오표 감이 아니다.
 *   retitled   = 접두로만 맞은 것 — 대개 인쇄 부산물이지만 진짜 제목 변경이 섞일 수 있어 따로 남긴다.
 */
export function diffCaptions(oldCaps, newCaps) {
  const queue = new Map();
  oldCaps.forEach((c) => {
    const k = titleKey(c.title);
    if (!queue.has(k)) queue.set(k, []);
    queue.get(k).push(c);
  });

  const pairs = [];
  const pending = [];
  for (const n of newCaps) {
    const q = queue.get(titleKey(n.title));
    if (q?.length) pairs.push({ old: q.shift(), next: n, exact: true });
    else pending.push(n);
  }

  let leftover = [...queue.values()].flat().sort((a, b) => a.page - b.page);

  // 2차 — 끝에 자동으로 붙는 일련번호만 다른 것. 원고 「중용권의 例」 ×2 ↔ 인쇄본 「例 1」·「例 2」.
  // 나온 순서대로 짝지으므로 1↔첫째, 2↔둘째로 제자리를 찾는다.
  const still = [];
  for (const n of pending) {
    const nk = titleKey(n.title).replace(/\d{1,2}$/, "");
    const i = leftover.findIndex((o) => titleKey(o.title).replace(/\d{1,2}$/, "") === nk && nk.length >= 4);
    if (i >= 0) pairs.push({ old: leftover.splice(i, 1)[0], next: n, exact: false });
    else still.push(n);
  }

  // 3차 — 인쇄본 캡션이 줄바꿈에서 잘려 들어온 것.
  const added = [];
  for (const n of still) {
    const nk = titleKey(n.title);
    const i = leftover.findIndex((o) => {
      const ok = titleKey(o.title);
      const short = Math.min(ok.length, nk.length);
      return short >= PREFIX_MIN && (ok.startsWith(nk) || nk.startsWith(ok));
    });
    if (i >= 0) pairs.push({ old: leftover.splice(i, 1)[0], next: n, exact: false });
    else added.push(n);
  }

  const removed = leftover;
  const renumbered = pairs.filter((p) => p.old.num !== p.next.num || p.old.kind !== p.next.kind);
  const retitled = pairs.filter((p) => !p.exact);
  return { pairs, added, removed, renumbered, retitled };
}

// ─────────────────────────────── 쪽 그림 ───────────────────────────────

/** 렌더 배율 — 도해의 잔글씨가 읽히는 선. */
const RENDER_SCALE = 1.5;

/**
 * 구판 PDF 의 지정한 쪽만 PNG 로 뽑는다.
 * ★신판(HWPX)은 한글 없이는 렌더할 수 없다 — 「나란히」는 **구판 그림 ↔ 신판 글자**다.
 * @returns {{ rendered: Map<number,string>, dropped: number }} 쪽 → 파일 이름
 */
export async function renderPages(pdfPath, pageNumbers, outDir, { root, cap = 100 } = {}) {
  const base = (root ?? process.cwd()).replace(/\\/g, "/");
  const wanted = [...new Set(pageNumbers)].filter((p) => Number.isFinite(p) && p > 0).sort((a, b) => a - b);
  const take = wanted.slice(0, cap);
  const rendered = new Map();
  if (!take.length) return { rendered, dropped: wanted.length };

  const mupdf = await import(`file:///${base}/node_modules/mupdf/dist/mupdf.js`);
  const doc = mupdf.Document.openDocument(readFileSync(pdfPath), "application/pdf");
  const { writeFileSync, mkdirSync, rmSync } = await import("node:fs");
  // ★지난번에 뜬 쪽은 지운다 — 안 지우면 이제 필요 없는 그림이 쌓여 어느 것이 이번 것인지 흐려진다.
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  for (const p of take) {
    const pix = doc
      .loadPage(p - 1) // mupdf 는 0부터 — 이 책은 인쇄 쪽수와 PDF 쪽수가 같다
      .toPixmap(mupdf.Matrix.scale(RENDER_SCALE, RENDER_SCALE), mupdf.ColorSpace.DeviceRGB, false, true);
    const name = `p${String(p).padStart(4, "0")}.png`;
    writeFileSync(`${outDir}/${name}`, pix.asPNG());
    rendered.set(p, name);
  }
  return { rendered, dropped: wanted.length - take.length };
}
