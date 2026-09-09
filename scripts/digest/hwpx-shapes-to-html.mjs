// 정리비교표의 도형 쪽(흐름도)을 **다시 그린다** — 이미지가 아니라 글 + 좌표로.
//
//   node scripts/digest/hwpx-shapes-to-html.mjs <파일> [--page 3] [--out tmp/digest]
//
// ★이미지로 넣으면 빈칸 학습이 안 된다(원장 지적 2026-09-09). 빈칸은 글에 앵커를
//   걸어야 하므로 상자 안 글자가 텍스트로 남아 있어야 한다. hwpx 도형에는 좌표(hp:pos)·
//   크기(hp:sz)·글(hp:drawText)이 그대로 들어 있어 다시 그릴 수 있다.
//
// 좌표 단위는 HWPUNIT(1/7200인치). 여기서는 비율만 쓰므로 쪽 폭을 100 으로 정규화한다.
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

import AdmZip from "adm-zip";
import { XMLParser } from "fast-xml-parser";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const outIdx = args.indexOf("--out");
const outDir = outIdx >= 0 ? args[outIdx + 1] : "tmp/digest";
if (!file) {
  console.error("사용: node scripts/digest/hwpx-shapes-to-html.mjs <파일> [--out 폴더]");
  process.exit(1);
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  preserveOrder: true,
});
const zip = new AdmZip(resolve(file));
const sections = zip
  .getEntries()
  .filter((e) => /^Contents\/section\d+\.xml$/.test(e.entryName))
  .sort((a, b) => a.entryName.localeCompare(b.entryName));

const SHAPE_TAGS = new Set([
  "hp:rect",
  "hp:line",
  "hp:connectLine",
  "hp:polygon",
  "hp:ellipse",
  "hp:arc",
  "hp:curve",
]);

// ★좌표는 음수를 부호 없는 32비트로 적어 둔 자리가 있다. 그대로 읽으면 42억 같은
//   값이 나와 쪽 전체가 찌그러진다(3p·11p·13p 가 그랬다). 2^31 을 넘으면 음수로 되돌린다.
const num = (v) => {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return 0;
  return n > 2147483647 ? n - 4294967296 : n;
};

// ★훑기는 전부 스택으로 한다 — 재귀로 하면 스택이 넘친다(section2 1.5MB).
function textOf(node) {
  let out = "";
  const q = [node];
  while (q.length > 0) {
    const n = q.shift();
    if (Array.isArray(n)) {
      q.unshift(...n);
      continue;
    }
    if (!n || typeof n !== "object") continue;
    const push = [];
    for (const [k, v] of Object.entries(n)) {
      if (k === ":@") continue;
      if (k === "hp:t") {
        for (const t of Array.isArray(v) ? v : [v]) out += t?.["#text"] ?? "";
      } else if (k === "hp:lineBreak") out += "\n";
      else push.push(v);
    }
    q.unshift(...push);
  }
  return out.replace(/[ \t]+/g, " ").trim();
}

/**
 * 도형 하나에서 좌표·크기·색·글을 뽑는다.
 * ★쪽에 바로 놓인 도형은 hp:pos/hp:sz(절대 좌표)를 쓰지만, **묶음(container) 안 도형**은
 *   hp:offset/hp:curSz(묶음 안 상대 좌표)를 쓴다. 이걸 안 풀면 크기가 0 으로 나와
 *   그 쪽이 통째로 비어 버린다(실제로 6쪽 중 4쪽이 그랬다).
 */
function shapeOf(tag, body) {
  const s = { tag: tag.replace("hp:", ""), x: 0, y: 0, w: 0, h: 0, text: "" };
  const q = [body];
  while (q.length > 0) {
    const nodes = q.shift();
    if (!Array.isArray(nodes)) continue;
    for (const n of nodes) {
      const at = n[":@"] ?? {};
      for (const [k, v] of Object.entries(n)) {
        if (k === ":@") continue;
        if (k === "hp:pos") {
          s.x = num(at["@horzOffset"]);
          s.y = num(at["@vertOffset"]);
        } else if (k === "hp:sz") {
          s.w = num(at["@width"]);
          s.h = num(at["@height"]);
        } else if (k === "hp:offset") {
          s.ox = num(at["@x"]);
          s.oy = num(at["@y"]);
        } else if (k === "hp:orgSz") {
          s.orgW = num(at["@width"]);
          s.orgH = num(at["@height"]);
        } else if (k === "hp:curSz") {
          s.curW = num(at["@width"]);
          s.curH = num(at["@height"]);
        } else if (k === "hp:lineShape") {
          s.stroke = at["@color"];
          s.head = at["@headStyle"];
          s.tail = at["@tailStyle"];
        } else if (k === "hc:winBrush") {
          s.fill = at["@faceColor"];
          s.fillAlpha = Number(at["@alpha"] ?? 0);
        } else if (k === "hp:drawText") {
          s.text = textOf(v);
        } else if (SHAPE_TAGS.has(k) || k === "hp:container") {
          // ★자식 도형 안으로 내려가지 않는다. 내려가면 자식의 hp:pos/hp:sz 가 이 도형의
          //   값을 덮어써서 묶음 크기가 자식 크기가 되고, 좌표가 쪽 밖으로 튄다
          //   (9p 가 x 438116 까지 나갔던 원인).
        } else if (Array.isArray(v)) {
          q.unshift(v);
        }
      }
    }
  }
  // ★크기는 hp:sz(쪽 위 절대) → hp:curSz → hp:orgSz 순으로 본다. 묶음 안 도형은
  //   curSz 가 0 이고 실제 크기가 orgSz 에만 있는 경우가 흔하다(10p·13p 가 그래서 비었다).
  if (!s.w) s.w = s.curW || s.orgW || 0;
  if (!s.h) s.h = s.curH || s.orgH || 0;
  return s;
}

/**
 * 묶음(container) 한 개 → 그 안 도형들의 절대 좌표 목록.
 * 묶음은 hp:pos/hp:sz 로 쪽 위 자리를 갖고, 자식은 원래 좌표계(orgSz) 안의 offset/curSz 다.
 * 그래서 자식 좌표를 (묶음 크기 / 원래 크기) 만큼 줄여 묶음 위치에 얹는다.
 */
function flattenContainer(body) {
  const box = shapeOf("hp:container", body);
  const out = [];
  const orgW = box.orgW || box.w || 1;
  const orgH = box.orgH || box.h || 1;
  const sx = (box.w || orgW) / orgW;
  const sy = (box.h || orgH) / orgH;
  // 묶음이 쪽 위 자리를 hp:pos 로 갖지 않으면 offset 이 그 자리다.
  const bx = box.x || box.ox || 0;
  const by = box.y || box.oy || 0;

  const stack = [{ arr: body, i: 0 }];
  while (stack.length > 0) {
    const top = stack[stack.length - 1];
    if (top.i >= top.arr.length) {
      stack.pop();
      continue;
    }
    const n = top.arr[top.i++];
    if (!n || typeof n !== "object") continue;
    const kids = [];
    for (const [k, v] of Object.entries(n)) {
      if (k === ":@") continue;
      if (k === "hp:container") {
        // 묶음 안 묶음 — 한 겹 더 풀어 같은 자로 환산한다.
        for (const inner of flattenContainer(Array.isArray(v) ? v : [v])) {
          out.push({
            ...inner,
            x: bx + inner.x * sx,
            y: by + inner.y * sy,
            w: inner.w * sx,
            h: inner.h * sy,
          });
        }
        continue;
      }
      if (SHAPE_TAGS.has(k)) {
        const c = shapeOf(k, Array.isArray(v) ? v : [v]);
        out.push({
          ...c,
          x: bx + (c.ox ?? 0) * sx,
          y: by + (c.oy ?? 0) * sy,
          w: c.w * sx,
          h: c.h * sy,
        });
        continue;
      }
      if (Array.isArray(v)) kids.push(v);
    }
    for (let i = kids.length - 1; i >= 0; i -= 1) stack.push({ arr: kids[i], i: 0 });
  }
  return out;
}

const pages = [];
let page = 1;
const pageOf = (n) => {
  while (pages.length < n) pages.push({ page: pages.length + 1, shapes: [] });
  return pages[n - 1];
};
pageOf(1);

for (const [i, entry] of sections.entries()) {
  if (i > 0) pageOf((page += 1));
  const doc = parser.parse(entry.getData().toString("utf8"));
  // ★재귀로 훑으면 스택이 넘친다(section2 는 1.5MB, preserveOrder 배열이 깊다).
  //   그렇다고 큐에 자식을 몰아 넣으면 형제 순서가 뒤집혀 쪽 나눔 위치가 어긋난다
  //   (처음에 그렇게 짰다가 도형 450개가 전부 마지막 쪽에 몰렸다).
  //   그래서 **배열마다 읽던 자리를 들고 있는** 스택으로 문서 순서를 그대로 지킨다.
  const stack = [{ arr: doc, i: 0 }];
  while (stack.length > 0) {
    const top = stack[stack.length - 1];
    if (top.i >= top.arr.length) {
      stack.pop();
      continue;
    }
    const n = top.arr[top.i++];
    if (!n || typeof n !== "object") continue;
    if (n["hp:p"] && n[":@"]?.["@pageBreak"] === "1") pageOf((page += 1));
    const kids = [];
    for (const [k, v] of Object.entries(n)) {
      if (k === ":@") continue;
      if (k === "hp:container") {
        for (const sh of flattenContainer(Array.isArray(v) ? v : [v])) {
          pageOf(page).shapes.push(sh);
        }
        continue;
      }
      if (SHAPE_TAGS.has(k)) {
        pageOf(page).shapes.push(shapeOf(k, Array.isArray(v) ? v : [v]));
        continue;
      }
      if (Array.isArray(v)) kids.push(v);
    }
    for (let i = kids.length - 1; i >= 0; i -= 1) stack.push({ arr: kids[i], i: 0 });
  }
}

// ── 미리보기 HTML — 상자는 글이 있는 div, 선은 SVG ──────────────────────────
const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function pageHtml(p) {
  const boxes = p.shapes.filter((s) => s.w > 0 && s.h > 0);
  if (boxes.length === 0) return "";
  const maxX = Math.max(...boxes.map((s) => s.x + s.w));
  const maxY = Math.max(...boxes.map((s) => s.y + s.h));
  const pct = (v, total) => ((v / total) * 100).toFixed(3);
  const parts = boxes.map((s) => {
    const style = [
      `left:${pct(s.x, maxX)}%`,
      `top:${pct(s.y, maxY)}%`,
      `width:${pct(s.w, maxX)}%`,
      `height:${pct(s.h, maxY)}%`,
    ];
    const line = s.tag === "line" || s.tag === "connectLine";
    if (line) style.push("border:0", "background:currentColor", "opacity:.35");
    return `<div class="sh ${line ? "ln" : "bx"}" style="${style.join(";")}">${
      s.text ? `<span>${esc(s.text).replace(/\n/g, "<br>")}</span>` : ""
    }</div>`;
  });
  return `<section><h2>${p.page}p <small>도형 ${p.shapes.length}개 · 글 있는 상자 ${
    boxes.filter((b) => b.text).length
  }개</small></h2>
  <div class="canvas" style="aspect-ratio:${maxX}/${maxY}">${parts.join("")}</div></section>`;
}

mkdirSync(outDir, { recursive: true });
const stem = basename(file).replace(/\.[^.]+$/, "");
writeFileSync(
  resolve(outDir, `${stem}.shapes.json`),
  JSON.stringify({ source: file, pages }, null, 2),
  "utf8",
);
const html = `<!doctype html><meta charset="utf-8"><title>정리비교표 도형 재작화 미리보기</title>
<style>
body{font-family:system-ui,"Malgun Gothic",sans-serif;margin:0;padding:24px;background:#f7f5f3;color:#23201e}
h1{font-size:20px;margin:0 0 6px}
p.lede{color:#6f6862;font-size:13px;margin:0 0 20px;max-width:70ch}
h2{font-size:13px;margin:28px 0 8px;padding-top:10px;border-top:2px solid #23201e}
h2 small{font-weight:400;color:#6f6862;margin-left:6px}
.canvas{position:relative;width:100%;background:#fff;border:1px solid #d8d2cc;color:#31538f}
.sh{position:absolute;box-sizing:border-box}
.bx{border:1px solid #31538f;display:flex;align-items:center;justify-content:center;text-align:center;padding:1px 2px;overflow:hidden}
.bx span{font-size:.55vw;line-height:1.15;color:#23201e;word-break:keep-all}
</style>
<h1>정리비교표 — 도형 쪽 재작화 미리보기</h1>
<p class="lede">이미지가 아니라 <b>좌표 + 글</b>로 다시 그렸습니다. 글자는 그대로 텍스트라 나중에 빈칸을 걸 수 있습니다. 선·화살표 모양은 아직 단순 선으로만 표시합니다.</p>
${pages.map(pageHtml).join("\n")}`;
writeFileSync(resolve(outDir, `${stem}.shapes.html`), html, "utf8");

console.log(`\n=== ${file} — 도형 ===`);
for (const p of pages) {
  if (p.shapes.length === 0) continue;
  const withText = p.shapes.filter((s) => s.text).length;
  console.log(
    `${String(p.page).padStart(2)}p  도형 ${String(p.shapes.length).padStart(3)}  글 있는 것 ${String(withText).padStart(3)}`,
  );
}
console.log(`\n결과: ${resolve(outDir, `${stem}.shapes.html`)}`);
