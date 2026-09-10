// 빈칸이 **정말 가려지는지** 방금 빌드한 진짜 CSS 로 재 본다.
//
//   npm run build && node scripts/digest/probe-blanks.mjs [쪽번호] [덩이]
//
// ★왜 재는가: 이 화면에서 났던 사고는 전부 **남의 규칙이 우리 마크업에 얹히는 것**이었다
//   (표의 class="fixed" ↔ Tailwind .fixed). 가림 스타일도 자료 CSS 와 세기 싸움을 한다 —
//   자료 CSS 는 `<style>` 로 나중에 실리므로 app.css 가 질 수 있다. 눈이 아니라 계산된
//   값으로 확인한다.
// ★재는 것: ① 글자가 정말 투명한가(칸 안의 `.dg-law` 같은 자기 색까지) ② 칸 크기가
//   그대로인가(가렸다고 판이 흔들리면 학습이 안 된다) ③ 목차칸은 그대로 보이는가.
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

import { convert } from "./convert.mjs";

const page = Number(process.argv[2] ?? 4);
const part = process.argv[3] === undefined ? undefined : Number(process.argv[3]);

const appCss = readFileSync("build/client/assets/root-BF5vJ89M.css", "utf8");
const { bodyHtml, css, scopeKey } = convert(
  readFileSync(`scripts/digest/pages/digest-${page}p.html`, "utf8"),
  page,
  { part },
);

const doc = `<!doctype html><html><head><style>${appCss}</style></head>
<body><div class="digest-body" style="padding:12px">
<style>${css}</style>
<div class="digest-doc dp${scopeKey}">${bodyHtml}</div>
</div></body></html>`;

const browser = await chromium.launch();
for (const theme of ["light", "dark"]) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const p = await ctx.newPage();
  await p.setContent(doc);
  if (theme === "dark") await p.evaluate(() => document.documentElement.classList.add("dark"));

  const out = await p.evaluate(() => {
    const cells = [...document.querySelectorAll("[data-dg-r]")];
    const heads = [...document.querySelectorAll("[data-dg-blank]")];
    const before = cells.map((el) => {
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    });

    // 전부 가려 본다.
    for (const el of cells) el.classList.add("dg-blank");

    const opaque = [];
    let moved = 0;
    cells.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      if (Math.round(r.width) !== before[i].w || Math.round(r.height) !== before[i].h) moved += 1;
      // 칸 자신과 그 안의 모든 글자 조각이 투명해야 한다.
      for (const node of [el, ...el.querySelectorAll("*")]) {
        const c = getComputedStyle(node).color;
        if (!/rgba\(0, 0, 0, 0\)|transparent/.test(c)) {
          opaque.push(`${node.tagName}.${node.className} = ${c}`);
        }
      }
    });

    // 목차칸은 그대로 읽혀야 한다.
    const headFaded = heads.filter((el) => {
      const c = getComputedStyle(el).color;
      return /rgba\(0, 0, 0, 0\)|transparent/.test(c);
    }).length;

    const sample = cells[0] ? getComputedStyle(cells[0]) : null;
    // 표의 칸 선이 바탕과 구분되는가(다크에서 안 보인다는 지적).
    const anyCell = document.querySelector("td, th");
    const line = anyCell ? getComputedStyle(anyCell).borderTopColor : "";
    const bg = getComputedStyle(document.querySelector(".dg-panel, .dg-card, body")).backgroundColor;

    return {
      칸: cells.length,
      목차칸: heads.length,
      "글자가 남은 곳": opaque.slice(0, 5),
      "크기가 바뀐 칸": moved,
      "흐려진 목차칸": headFaded,
      가림배경: sample?.backgroundColor ?? "",
      칸선: line,
      바탕: bg,
    };
  });
  console.log(`\n[${theme}] ${page}p${part === undefined ? "" : `-${part}`}`);
  for (const [k, v] of Object.entries(out)) console.log(`  ${k}: ${Array.isArray(v) ? (v.length ? v.join(" / ") : "없음") : v}`);
  await ctx.close();
}
await browser.close();
