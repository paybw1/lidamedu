// 빈칸 학습 좌표 검사 — 적재본에 박힌 좌표가 실제 자료와 맞는지 노드에서 확인한다.
//
//   node scripts/digest/check-blanks.mjs          # 전 화면
//   node scripts/digest/check-blanks.mjs --map    # 묶음이 무엇을 다스리는지 펼쳐 본다
//
// ★화면에서 눈으로 확인하지 않는다. 이 화면은 브라우저에서 재는 방식으로 세 번 연속
//   실패했다(2026-09-10) — 좌표는 적재 때 박고, 여기서 검사한다.
// ★표가 아닌 네 화면(체계도·총칙·번역문 제출·국제조약)은 묶음(set)을 쓴다. 자동으로
//   맞는지 판정할 수 없는 **짝짓기**라 `--map` 으로 사람이 한 번 훑어야 한다.
import { readFileSync } from "node:fs";

import { convert } from "./convert.mjs";

/** 화면 = 쪽(+덩이). import-digests.mjs 의 목록과 같은 뜻이다. */
const SCREENS = [
  { page: 2 }, { page: 3 },
  { page: 4 }, { page: 5 }, { page: 6 }, { page: 7 }, { page: 8 },
  { page: 9, part: 0 }, { page: 9, part: 1 },
  { page: 10 },
  { page: 11, part: 0 }, { page: 11, part: 1 },
  { page: 12 }, { page: 13 },
];
const showMap = process.argv.includes("--map");

const attr = (tag, name) => tag.match(new RegExp(`${name}="([^"]*)"`))?.[1];
const num = (tag, name) => {
  const v = attr(tag, name);
  return v === undefined ? undefined : Number(v);
};
const text = (html) =>
  html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

/** 표의 칸 — 좌표가 없는 것까지 전부(빠뜨린 칸을 잡아야 한다). */
function tableCells(html) {
  const out = [];
  const re = /<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/g;
  let m;
  while ((m = re.exec(html))) out.push({ tag: m[1], attrs: m[2], body: m[3] });
  return out;
}

/**
 * 좌표가 박힌 것 — 표·체계도(li/h2/span)·도형(div) 가리지 않는다.
 * ★여는 태그만 찾고 속살은 따로 떠낸다. `<태그>…</태그>` 를 통째로 잡으려 들면
 *   바깥 감싸개(`<div class="digest-page">`)가 첫 `</div>` 까지를 삼켜 그 안의 칸이
 *   통째로 사라진다(2026-09-10 실제로 표가 0칸으로 나왔다).
 */
function stamped(html) {
  const out = [];
  const re = /<(td|th|li|h2|span|div)\b([^>]*?data-dg-[^>]*)>/g;
  let m;
  while ((m = re.exec(html))) {
    const from = m.index + m[0].length;
    const close = html.indexOf(`</${m[1]}>`, from);
    out.push({ tag: m[1], attrs: m[2], body: close < 0 ? "" : html.slice(from, close) });
  }
  return out;
}

let bad = 0;
const fail = (msg) => { bad += 1; console.log(`  ✗ ${msg}`); };

console.log("화면       빈칸가능  목차(가로/세로/전체/묶음)  자리겹침");
for (const s of SCREENS) {
  const key = `${s.page}p${s.part === undefined ? "" : `-${s.part}`}`;
  const html = readFileSync(`scripts/digest/pages/digest-${s.page}p.html`, "utf8");
  const { bodyHtml } = convert(html, s.page, { part: s.part });

  const cells = stamped(bodyHtml).filter((c) => num(c.attrs, "data-dg-r") !== undefined);
  const heads = stamped(bodyHtml).filter((c) => attr(c.attrs, "data-dg-blank"));
  const kinds = { row: 0, col: 0, all: 0, set: 0 };
  for (const h of heads) kinds[attr(h.attrs, "data-dg-blank")] += 1;

  // ① 표: 글자가 있는 내용칸은 **빠짐없이** 좌표를 가져야 하고, 빈 칸은 가지면 안 된다.
  for (const c of tableCells(bodyHtml)) {
    if (c.tag !== "td") continue;
    const has = num(c.attrs, "data-dg-r") !== undefined;
    if (text(c.body) && !has) fail(`${key} 글자가 있는데 좌표가 없다: ${text(c.body).slice(0, 20)}`);
    if (!text(c.body) && has) fail(`${key} 빈 칸에 좌표가 붙었다`);
  }

  // ② 한 자리를 둘이 차지하면 안 된다(표는 격자, 나머지는 붙인 번호).
  const seen = new Map();
  let overlap = 0;
  for (const c of cells) {
    const r = num(c.attrs, "data-dg-r");
    const cc = num(c.attrs, "data-dg-c");
    for (let i = r; i < r + (num(c.attrs, "data-dg-rs") ?? 1); i += 1) {
      for (let j = cc; j < cc + (num(c.attrs, "data-dg-cs") ?? 1); j += 1) {
        const k = `${i}:${j}`;
        if (seen.has(k)) {
          overlap += 1;
          fail(`${key} 자리 겹침 ${k}: ${seen.get(k)} ↔ ${text(c.body).slice(0, 14)}`);
        }
        seen.set(k, text(c.body).slice(0, 14));
      }
    }
  }

  // ③ 목차가 가리키는 자리는 실제로 있어야 하고, 범위는 뒤집히면 안 된다.
  for (const h of heads) {
    const kind = attr(h.attrs, "data-dg-blank");
    if (kind === "all") continue;
    if (kind === "set") {
      const want = (attr(h.attrs, "data-dg-keys") ?? "").split(" ").filter(Boolean);
      if (!want.length) fail(`${key} 묶음이 비어 있다: ${text(h.body).slice(0, 14)}`);
      for (const k of want) {
        if (!seen.has(k)) fail(`${key} 없는 자리를 가리킨다: ${text(h.body).slice(0, 14)} → ${k}`);
      }
      continue;
    }
    const from = num(h.attrs, "data-dg-from");
    const to = num(h.attrs, "data-dg-to");
    if (!(Number.isInteger(from) && Number.isInteger(to) && from <= to)) {
      fail(`${key} 범위가 뒤집혔다: ${text(h.body).slice(0, 12)} ${from}~${to}`);
    }
  }

  console.log(
    `${key.padEnd(10)} ${String(cells.length).padStart(6)}` +
      `        ${String(kinds.row).padStart(3)}/${String(kinds.col).padStart(2)}/${kinds.all}/${String(kinds.set).padStart(2)}` +
      `            ${overlap === 0 ? "없음" : `★${overlap}`}`,
  );

  // 짝짓기 펼쳐 보기 — 자동 판정이 안 되는 곳이라 사람이 훑는다.
  if (showMap && kinds.set > 0) {
    const byKey = new Map(
      cells.map((c) => [`${num(c.attrs, "data-dg-r")}:${num(c.attrs, "data-dg-c")}`, text(c.body)]),
    );
    for (const h of heads) {
      if (attr(h.attrs, "data-dg-blank") !== "set") continue;
      const want = (attr(h.attrs, "data-dg-keys") ?? "").split(" ").filter(Boolean);
      const label = text(h.body).slice(0, 26) || "(제목 없음)";
      console.log(
        `    · ${label.padEnd(28)} → ${want.length}칸: ` +
          want.slice(0, 6).map((k) => (byKey.get(k) ?? "?").slice(0, 16)).join(" / ") +
          (want.length > 6 ? " …" : ""),
      );
    }
  }
}

// ── 4p 알려진 자리로 셈이 맞는지 본다(원장이 예로 든 세 가지).
console.log("\n[4p 특허요건 — 원장이 예로 든 세 경우]");
{
  const { bodyHtml } = convert(readFileSync("scripts/digest/pages/digest-4p.html", "utf8"), 4);
  const all = stamped(bodyHtml);
  const tds = all
    .filter((c) => c.tag === "td" && num(c.attrs, "data-dg-r") !== undefined)
    .map((c) => ({
      r: num(c.attrs, "data-dg-r"), c: num(c.attrs, "data-dg-c"),
      rs: num(c.attrs, "data-dg-rs"), cs: num(c.attrs, "data-dg-cs"),
    }));
  const head = (label) =>
    all.find((c) => attr(c.attrs, "data-dg-blank") && text(c.body).replace(/\s/g, "").startsWith(label));

  const show = (label, kind, want) => {
    const h = head(label);
    if (!h) return fail(`4p 목차칸을 찾지 못했다: ${label}`);
    const got = attr(h.attrs, "data-dg-blank");
    if (got !== kind) return fail(`4p ${label} 은 ${kind} 이어야 하는데 ${got}`);
    const from = num(h.attrs, "data-dg-from");
    const to = num(h.attrs, "data-dg-to");
    const n =
      kind === "all" ? tds.length
        : kind === "row" ? tds.filter((t) => t.r <= to && t.r + t.rs - 1 >= from).length
          : tds.filter((t) => t.c <= to && t.c + t.cs - 1 >= from).length;
    const ok = want === undefined || n === want;
    if (!ok) fail(`4p ${label} 빈칸 수 ${n} ≠ 기대 ${want}`);
    console.log(`  ${ok ? "✓" : "✗"} ${label.padEnd(6)} ${kind.padEnd(4)} → 빈칸 ${n}칸`);
  };
  show("특허요건", "all");
  show("의의", "row", 10);
  show("진보성", "col");
  show("판단", "row");
}

console.log(bad === 0 ? "\n어긋난 곳 없음" : `\n★어긋난 곳 ${bad}건`);
process.exit(bad === 0 ? 0 : 1);
