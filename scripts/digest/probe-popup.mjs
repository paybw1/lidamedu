// 정리비교표 팝업에서 아래가 잘리는지 **브라우저로 직접 잰다**.
//
//   node scripts/digest/probe-popup.mjs [쪽번호]
//
// 팝업 구조(DialogContent = 94vh 세로 flex / 머리줄 고정 / 본문 overflow:auto)를
// 그대로 흉내 낸 화면에 적재본을 넣고, 표 끝이 스크롤로 닿는지 확인한다.
// 추측 대신 재려고 만든 것 — 잘림은 세 번 다 다른 곳이었다.
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";

import { convert } from "./convert.mjs";

const page = Number(process.argv[2] ?? 4);
const { bodyHtml, css } = convert(
  readFileSync(`scripts/digest/pages/digest-${page}p.html`, "utf8"),
  page,
);

const html = `<!doctype html><meta charset="utf-8">
<style>
  :root { --card:#fff; --background:#fff; --foreground:#2e2e2e; --border:#e5e9ef;
    --muted-foreground:#64748b; --primary:#2d5ba8; --primary-foreground:#fff; --link:#2d5ba8; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: system-ui, sans-serif; }
  /* DialogContent 흉내 */
  .dlg { position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
         display:flex; flex-direction:column; height:94vh; width:98vw;
         overflow:hidden; background:#fff; border:1px solid var(--border); }
  .dlg-head { flex:none; border-bottom:1px solid var(--border); padding:10px 16px; font-weight:700; }
  .dlg-body { min-height:0; flex:1 1 0%; overflow:auto; padding:12px 16px; }
${css}
</style>
<div class="dlg">
  <div class="dlg-head">특허요건 정리비교표</div>
  <div class="dlg-body" id="body">
    <div id="box"><div class="digest-doc dp${page}">${bodyHtml}</div></div>
  </div>
</div>
`;

const file = "scripts/digest/.probe-popup.html";
writeFileSync(file, html, "utf8");

const browser = await chromium.launch();
for (const vp of [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
]) {
  const ctx = await browser.newContext({ viewport: vp });
  const p = await ctx.newPage();
  await p.goto(`file:///${process.cwd().replace(/\\/g, "/")}/${file}`);
  // FitPage 와 **같은 계산**을 돌린다 — ①폭 늘리기 ②안 들어가면 글자 줄이기.
  const chosen = await p.evaluate(() => {
    const box = document.getElementById("box");
    const node = box.firstElementChild;
    const paper = box.querySelector(".digest-page");
    const pageW = parseInt(paper.style.width, 10);
    paper.style.width = `${Math.max(pageW, box.clientWidth)}px`;

    const tune = document.createElement("style");
    document.head.append(tune);
    const body = document.getElementById("body");
    const availH =
      body.clientHeight -
      (box.getBoundingClientRect().top - body.getBoundingClientRect().top) -
      16;
    const sel = ".digest-doc." + [...node.classList].find((c) => c.startsWith("dp"));
    for (const fs of [12.5, 11.5, 10.5, 9.5]) {
      const pad = fs >= 11 ? "6px 7px" : fs >= 10 ? "5px 5px" : "4px 4px";
      tune.textContent = `${sel} table{font-size:${fs}px}${sel} th,${sel} td{padding:${pad}}`;
      if (node.scrollHeight <= availH) return { fs, h: node.scrollHeight, availH };
    }
    return { fs: 9.5, h: node.scrollHeight, availH, 넘침: true };
  });
  await p.waitForTimeout(300);

  const r = await p.evaluate(() => {
    const body = document.getElementById("body");
    const paper = document.querySelector(".digest-page");
    const rows = [...document.querySelectorAll("tbody tr")];
    const last = rows.at(-1);
    const panel = document.querySelector(".panel");
    const wrap = document.querySelector(".tablewrap");
    const table = document.querySelector("table");
    const box = (el) => (el ? { h: el.scrollHeight, ch: el.clientHeight, off: el.offsetHeight } : null);
    return {
      바깥: { scroll: body.scrollHeight, client: body.clientHeight },
      종이폭: paper.getBoundingClientRect().width,
      panel: box(panel),
      tablewrap: box(wrap),
      table: box(table),
      줄수: rows.length,
      마지막줄바닥: last ? Math.round(last.getBoundingClientRect().bottom) : null,
      본문바닥: Math.round(body.getBoundingClientRect().bottom),
    };
  });
  // 끝까지 스크롤한 뒤 마지막 줄이 보이는지
  await p.evaluate(() => {
    const b = document.getElementById("body");
    b.scrollTop = b.scrollHeight;
  });
  await p.waitForTimeout(200);
  const after = await p.evaluate(() => {
    const rows = [...document.querySelectorAll("tbody tr")];
    const last = rows.at(-1);
    const body = document.getElementById("body");
    const lr = last.getBoundingClientRect();
    const br = body.getBoundingClientRect();
    return {
      마지막줄: { top: Math.round(lr.top), bottom: Math.round(lr.bottom) },
      본문: { top: Math.round(br.top), bottom: Math.round(br.bottom) },
      보이나: lr.bottom <= br.bottom + 1 && lr.top >= br.top - 1,
    };
  });
  await p.screenshot({ path: `scripts/digest/.probe-${page}p-${vp.width}.png`, fullPage: false });
  console.log(`\n=== ${vp.width}×${vp.height}`);
  console.log("고른 글자 크기:", chosen);
  console.log(r);
  console.log("끝까지 스크롤 후:", after);
  await ctx.close();
}
await browser.close();
