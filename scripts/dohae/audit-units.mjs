// 도해특허법 유닛 전수 감사 — **보고만 한다**(쓰기 없음).
//
//   node scripts/dohae/audit-units.mjs            # 요약
//   node scripts/dohae/audit-units.mjs --all      # 목록 전부(길다)
//
// 세 갈래로 본다.
//   A. 구조   — 소제목 번호·그림·조문 박스·조문 링크가 스스로 앞뒤가 맞나 (운영 DB 기준)
//   B. 원본   — 교재 HWPX 의 글이 어느 유닛에도 안 들어간 데가 있나 (유실 탐지)
//   C. 표류   — 운영 DB 와 시드 원본이 어긋난 데 = **재시드하면 사라질 편집분**
//
// ★B 의 기준 측은 파서가 아니라 **독립 추출기**(errata/lib/book-diff.mjs)를 쓴다.
//   파서 자신의 순회를 기준으로 삼으면 파서가 건너뛴 것을 기준도 건너뛰어 자기확인이 된다.
// ★B 의 비교 대상은 DB 가 아니라 **방금 재생성한 시드 원본(JSON)** 이다. DB 에는 운영자
//   편집이 얹혀 있어 HWPX↔DB 로 재면 편집분이 전부 가짜 "유실" 로 뜬다.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import "dotenv/config";

import { buildBlob, extractHwpx, normalize, presenceIn } from "../errata/lib/book-diff.mjs";

const ROOT = resolve(import.meta.dirname, "../..");
const HWPX = resolve(ROOT, "source/특허법/도해특허법/[완0227+내지] 도해특허법 (제20판).hwpx");
const JSON_PATH = resolve(ROOT, "source/_converted/dohae-patent.json");
const SHOW_ALL = process.argv.includes("--all");
const PATENT_LAW = "c19c719c-3631-475c-8353-f5a2b7514714";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!new URL(url).host.includes("mcgdoplo")) throw new Error("ABORT: not prod");
const c = createClient(url, key, { auth: { persistSession: false } });

const ROMAN = ["Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ", "Ⅵ", "Ⅶ", "Ⅷ", "Ⅸ", "Ⅹ", "Ⅺ", "Ⅻ"];
const romanIdx = (n) => (n ? ROMAN.indexOf(n) : -1);
const cut = (s, n = 46) => String(s ?? "").replace(/\s+/g, " ").slice(0, n);
const listOf = (arr, n = 8) =>
  (SHOW_ALL ? arr : arr.slice(0, n)).join(" · ") + (!SHOW_ALL && arr.length > n ? ` … 외 ${arr.length - n}` : "");

/** 블록에 든 모든 글 — 중첩 표·도해 글상자까지 내려간다(빠뜨리면 가짜 유실이 된다). */
function* blockTexts(blocks) {
  for (const b of blocks ?? []) {
    if (b.type === "h" || b.type === "p") yield b.text;
    else if (b.type === "diagram") yield* b.texts ?? [];
    else if (b.type === "table") yield* cellTexts(b.cells);
  }
}
function* cellTexts(cells) {
  for (const row of cells ?? [])
    for (const cell of row ?? []) {
      yield cell.text;
      yield* cell.diagramTexts ?? [];
      for (const nested of cell.tables ?? []) yield* cellTexts(nested);
    }
}

// ── 자료 ──────────────────────────────────────────────────────────────
const { data: units, error: uErr } = await c
  .from("dohae_units")
  .select("unit_id, unit_key, title, blocks")
  .order("unit_key");
if (uErr) throw new Error(uErr.message);
const { data: links } = await c.from("dohae_unit_articles").select("unit_id, article_id");
const { data: arts } = await c
  .from("articles")
  .select("article_id, article_number")
  .eq("law_id", PATENT_LAW)
  .is("deleted_at", null);

const numberOf = new Map((arts ?? []).map((a) => [a.article_id, a.article_number ?? ""]));
const byNumber = new Map((arts ?? []).map((a) => [a.article_number ?? "", a.article_id]));
const linkedOf = new Map();
for (const l of links ?? []) {
  const s = linkedOf.get(l.unit_id) ?? new Set();
  s.add(l.article_id);
  linkedOf.set(l.unit_id, s);
}
const json = JSON.parse(readFileSync(JSON_PATH, "utf8"));
const keyOfJson = (u) =>
  u.kind === "topic" ? `t${String(u.no).padStart(2, "0")}` : `r${(u.refNo ?? "").replace(".", "-")}`;
const jsonByKey = new Map(json.units.map((u) => [keyOfJson(u), u]));

console.log(`도해특허법 제20판 — 유닛 ${units.length} · 조문 링크 ${(links ?? []).length}\n`);

// ── A. 구조 ───────────────────────────────────────────────────────────
const a1 = []; // 소제목 번호가 건너뛴다
const a2 = []; // 소제목 번호가 겹친다
const a3 = []; // Ⅰ 로 시작하지 않는다
const a4 = []; // 그림 파일이 없다
const a5 = []; // 조문 박스가 있는데 연결 조문이 없다
const a6 = []; // 조문 박스가 둘 이상 — 팝업은 첫 박스만 갈아끼운다
const a7 = []; // 제목이 말하는 조문이 연결에 없다

const orderKey = (n) => {
  const m = /^(\d+)(?:의(\d+))?$/.exec(n ?? "");
  return m ? Number(m[1]) * 100 + (m[2] ? Number(m[2]) : 0) : -1;
};
const allNumbers = [...byNumber.keys()].filter((n) => orderKey(n) >= 0).sort((x, y) => orderKey(x) - orderKey(y));
/** 제목의 「法 16, 28-28의5」 표기를 실존 조문 번호로 편다. */
function refsFromTitle(title) {
  const m = /[(（]\s*法\s*([^)）]*)[)）]/.exec(title);
  if (!m) return [];
  const out = [];
  for (const part of m[1].split(",")) {
    const t = part.trim().replace(/[①-⑳]/g, "").replace(/\s+/g, "");
    const range = /^(\d+(?:의\d+)?)[-~–—∼](\d+(?:의\d+)?)$/.exec(t);
    if (range) {
      const [lo, hi] = [orderKey(range[1]), orderKey(range[2])];
      for (const n of allNumbers) if (orderKey(n) >= lo && orderKey(n) <= hi) out.push(n);
      continue;
    }
    const one = /^(\d+(?:의\d+)?)/.exec(t);
    if (one) out.push(one[1]);
  }
  return [...new Set(out)];
}
const isArticleBox = (b) =>
  b.type === "table" && b.cells?.length === 1 && b.cells[0]?.length === 1 && /^제\d+조/.test(b.cells[0][0].text ?? "");

for (const u of units) {
  const blocks = u.blocks ?? [];
  const heads = blocks.filter((b) => b.type === "h" && romanIdx(b.numeral) >= 0);
  if (heads.length >= 2) {
    const seen = new Set();
    for (let k = 0; k < heads.length; k++) {
      const cur = romanIdx(heads[k].numeral);
      if (seen.has(cur)) a2.push(`${u.unit_key}(${heads[k].numeral})`);
      seen.add(cur);
      if (k === 0) {
        if (cur !== 0) a3.push(`${u.unit_key}(${heads[0].numeral}부터)`);
        continue;
      }
      const prev = romanIdx(heads[k - 1].numeral);
      for (let m = prev + 1; m < cur; m++) a1.push(`${u.unit_key}(${ROMAN[m]} 없음)`);
    }
  }
  const noImage = blocks.filter((b) => b.type === "diagram" && !b.image).length;
  if (noImage) a4.push(`${u.unit_key}(${noImage}개)`);

  const boxes = blocks.filter(isArticleBox).length;
  const linked = linkedOf.get(u.unit_id) ?? new Set();
  if (boxes > 0 && linked.size === 0) a5.push(`${u.unit_key} ${cut(u.title, 28)}`);
  if (boxes > 1) a6.push(`${u.unit_key}(${boxes}개)`);

  const want = refsFromTitle(u.title);
  if (want.length) {
    const have = new Set([...linked].map((id) => numberOf.get(id)));
    const missing = want.filter((n) => byNumber.has(n) && !have.has(n));
    if (missing.length) a7.push(`${u.unit_key} 빠짐 ${missing.join(",")}`);
  }
}

console.log("━━ A. 구조");
const rowA = (label, arr) =>
  console.log(`   ${arr.length === 0 ? "✔" : "✗"} ${label.padEnd(34)} ${arr.length}${arr.length ? `  — ${listOf(arr)}` : ""}`);
rowA("소제목 번호가 건너뛴다", a1);
rowA("소제목 번호가 겹친다", a2);
rowA("소제목이 Ⅰ 로 시작하지 않는다", a3);
rowA("그림 파일이 안 붙었다", a4);
rowA("조문 박스가 있는데 연결 조문 없음", a5);
rowA("조문 박스가 둘 이상(팝업은 첫 박스만)", a6);
rowA("제목이 말한 조문이 연결에 없다", a7);

// ── B. 원본 대조 ──────────────────────────────────────────────────────
// 시드 원본에 들어간 글 전부를 한 덩이로. ★조각 사이 칸막이 — 이어 붙이면 없던 토막이 생긴다.
const parsedBlob = buildBlob(
  json.units.flatMap((u) => [...blockTexts(u.blocks)]),
  "",
);

const items = extractHwpx(HWPX);
// 앞부속(표지·머리말·판별 개정 이력·목차)과 뒷부속(저자 소개~판권지)은 본문이 아니다.
// ★본문 시작 신호 = **첫 주제의 제목 도형 바로 뒤에 그 주제 번호 도형**이 오는 자리.
//   제목만 찾으면 세 군데가 걸린다 — 머리말 뒤 목차("01 목적(法 1)2"), 간지 사이드바(장의
//   주제 목록), 그리고 본문. 앞의 둘을 안 자르면 판별 개정 이력과 목차가 전부 유실로 뜬다.
const first = json.units[0];
const firstTitle = normalize(first.title);
const firstNo = String(first.no).padStart(2, "0");
let startAt = items.findIndex(
  (it, i) =>
    it.kind === "shape" &&
    normalize(it.text) === firstTitle &&
    items[i + 1] &&
    items[i + 1].text.trim() === firstNo,
);
if (startAt < 0) startAt = Math.max(0, items.findLastIndex((i) => normalize(i.text).includes(firstTitle)));
const endAt = items.findIndex((i) => i.text.replace(/\s/g, "") === "저자소개");
const body = items.slice(startAt, endAt >= 0 ? endAt : items.length);

const SKIP = [
  /^묶음\s*개체/, /^도해특허법/, /^\d{1,3}$/, /^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫ]$/,
  /^제\d+장$/, /^PART/, /^목\s*차$/, /^차\s*례$/, /^머리말$/, /^발간사$/, /^개정판/, /^초\s*판/,
  /^ISBN/, /^정가/, /^인\s*쇄/, /^발\s*행/, /^저\s*자/, /^펴낸/, /^등록/,
];
// 주제·참고자료 헤더는 파서가 **유닛 제목으로 소비**한다 — 블록에 없는 게 정상이다.
const headerTexts = new Set(
  json.units.flatMap((u) => {
    const t = normalize(u.title);
    const no = u.kind === "topic" ? String(u.no).padStart(2, "0") : (u.refNo ?? "");
    return [t, normalize(`${no}${u.title}`), normalize(`${no} ${u.title}`)];
  }),
);
const isHeader = (text) => {
  const n = normalize(text);
  if (headerTexts.has(n)) return true;
  // 목차·간지에 남은 "01 목적(法 1)2" 같은 꼬리 쪽수까지 붙은 형태.
  if ([...headerTexts].some((h) => h.length >= 6 && n.replace(/\d+$/, "") === h)) return true;
  // ★제목이 두 도형으로 나뉜 것 — 제목줄과 조문줄이 따로 온다
  //   ("국선대리인, 전문심리위원 및 참고인" + "(法 139의2, 154의2, 154의3)").
  return n.length >= 6 && [...headerTexts].some((h) => h.includes(n));
};

const candidates = body.filter(
  (i) => normalize(i.text).length >= 12 && !SKIP.some((re) => re.test(i.text.trim())) && !isHeader(i.text),
);

// 이 조각이 어느 유닛 자리인가 — 원본 흐름에서 바로 앞의 주제 제목 도형.
// ★참고자료 헤더는 도형이 아니라 본문 글로 온다("2.2 분할출원") — 제목만 맞추면 그 구간이
//   앞 주제(t15)로 잘못 귀속돼, 참고자료의 도표가 엉뚱한 유닛의 유실로 보고된다.
const headerAt = [];
for (const [i, it] of body.entries()) {
  const n = normalize(it.text);
  const u = json.units.find(
    (x) =>
      normalize(x.title) === n ||
      (x.kind === "reference" && n === normalize(`${x.refNo}${x.title}`)),
  );
  if (u) headerAt.push({ i, key: keyOfJson(u) });
}
const unitOf = (idx) => {
  let key = "?";
  for (const h of headerAt) {
    if (h.i > idx) break;
    key = h.key;
  }
  return key;
};
// 그림으로 나갔나 — 다이어그램 블록이거나, 표 안에 그림 칸이 있으면 그 자리는 PDF 크롭이다.
const hasCellDiagram = (cells) =>
  (cells ?? []).some((row) =>
    (row ?? []).some((c) => c.diagram || (c.tables ?? []).some((t) => hasCellDiagram(t))),
  );
const hasDiagram = new Map(
  json.units.map((u) => [
    keyOfJson(u),
    (u.blocks ?? []).some((b) => b.type === "diagram" || (b.type === "table" && hasCellDiagram(b.cells))),
  ]),
);

// ★토막(20자)은 **양쪽의 조각 경계가 같을 때만** 맞는다. 원본에서 한 칸에 뭉쳐 있던 도형
//   글이 파싱 쪽에서 여러 조각으로 나뉘면(도해 시간축 도표가 그렇다) 토막이 경계를 넘지
//   못해 멀쩡히 들어간 글도 "없음" 으로 나온다(r2-2 실사례 8건 전량 오탐).
//   그래서 유실 후보는 **낱말 단위로 한 번 더** 확인한다.
// ★낱말은 **한글이 든 것만** 센다. 도표는 칸이 「A」「B」처럼 한 글자라, 원본에서 칸이
//   붙으면 「A, B A」 → 「BA」 같은 허깨비 낱말이 생겨 멀쩡한 도표가 유실로 찍힌다.
// ★낱말은 **원문(공백 있는 글)** 에서 뽑는다. 정규화한 글은 공백이 없어 조각 하나가
//   통짜 낱말 하나가 되고, 그러면 일치율이 늘 0 에 가깝다.
// ★한글이 든 낱말만 센다 — 도표 칸은 「A」「B」처럼 한 글자라, 원본에서 칸이 붙으면
//   「A, B A」 → 「BA」 같은 허깨비 낱말이 생겨 멀쩡한 도표가 유실로 찍힌다.
const WORD = /[가-힣][가-힣A-Za-z0-9]*/g;
const parsedWords = new Set(
  json.units.flatMap((u) => [...blockTexts(u.blocks)]).flatMap((t) => String(t).match(WORD) ?? []),
);
const wordCoverage = (text) => {
  const ws = String(text).match(WORD) ?? [];
  if (ws.length < 3) return 0; // 한글 낱말이 거의 없으면 이 검사로는 판단하지 않는다
  return ws.filter((w) => parsedWords.has(w)).length / ws.length;
};

const lost = [];
const rechunked = [];
const partial = [];
for (const [idx, it] of body.entries()) {
  if (!candidates.includes(it)) continue;
  const ratio = presenceIn(it.text, parsedBlob);
  if (ratio >= 0.8) continue;
  const key = unitOf(idx);
  const row = { ...it, ratio, key, viaImage: hasDiagram.get(key) ?? false };
  if (ratio >= 0.3) partial.push(row);
  else {
    row.words = wordCoverage(it.text);
    (row.words >= 0.9 ? rechunked : lost).push(row);
  }
}
const chars = (arr) => arr.reduce((n, x) => n + normalize(x.text).length, 0);
console.log("\n━━ B. 원본 대조 — 교재 HWPX 글이 유닛에 들어갔나");
console.log(`   검사한 조각 ${candidates.length} (12자 이상 본문)`);
console.log(`   ${lost.length === 0 ? "✔" : "✗"} 유닛 어디에도 없다        ${lost.length}건 ${chars(lost).toLocaleString()}자`);
console.log(`   ${partial.length === 0 ? "✔" : "△"} 일부만 들어갔다          ${partial.length}건 ${chars(partial).toLocaleString()}자`);
console.log(`   ✔ 조각 경계만 다르다(내용은 있다) ${rechunked.length}건 — 낱말은 다 들어가 있다`);
// 표 안에 그림이 있으면 파서가 표째 PDF 크롭으로 내보낸다 — 글자는 이미지 안에만 남는다.
const viaImage = lost.filter((x) => x.viaImage).length;
console.log(`      그중 그림이 있는 유닛 ${viaImage}건 — 표째 그림으로 나갔을 가능성(글자는 이미지 안)`);
for (const x of SHOW_ALL ? lost : lost.slice(0, 15))
  console.log(`      ${x.key.padEnd(6)} ${x.viaImage ? "그림有" : "     "} 낱말${Math.round((x.words ?? 0) * 100)}% [${x.kind}] ${cut(x.text, 56)}`);
if (!SHOW_ALL && lost.length > 12) console.log(`      … 외 ${lost.length - 12}건 (--all)`);

// ── C. 표류 ───────────────────────────────────────────────────────────
const drift = [];
for (const u of units) {
  const j = jsonByKey.get(u.unit_key);
  if (!j) {
    drift.push({ key: u.unit_key, why: "시드 원본에 없는 유닛" });
    continue;
  }
  const a = [...blockTexts(j.blocks)].map(normalize).join("");
  const b = [...blockTexts(u.blocks)].map(normalize).join("");
  if (a === b) continue;
  const kinds = (bl) => (bl ?? []).map((x) => x.type).join(",");
  drift.push({
    key: u.unit_key,
    why:
      kinds(j.blocks) !== kinds(u.blocks)
        ? `블록 구성이 다름(원본 ${j.blocks.length} / 운영 ${u.blocks.length})`
        : `글이 다름(${Math.abs(a.length - b.length)}자 차)`,
  });
}
console.log("\n━━ C. 표류 — 운영 DB 와 시드 원본의 차이 = 재시드하면 사라질 편집분");
console.log(`   ${drift.length === 0 ? "✔" : "△"} 어긋난 유닛 ${drift.length} / ${units.length}`);
for (const d of SHOW_ALL ? drift : drift.slice(0, 12)) console.log(`      ${d.key.padEnd(6)} ${d.why}`);
if (!SHOW_ALL && drift.length > 12) console.log(`      … 외 ${drift.length - 12}개 (--all)`);

const bad = a1.length + a2.length + a3.length + a4.length + a5.length + a7.length + lost.length;
console.log(`\n요약 — 손볼 것 ${bad}건 · 표류 ${drift.length}유닛`);
