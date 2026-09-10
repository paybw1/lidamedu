// 배포된 **진짜 CSS·진짜 클래스**로 정리비교표 팝업을 재현해 잰다.
//
//   node scripts/digest/probe-real-popup.mjs [쪽번호] [배율]
//
// 앞선 검사기(probe-popup.mjs)는 팝업 구조를 손으로 흉내 냈다 — 그래서 "여기선 되는데
// 화면에선 안 되는" 차이를 못 잡았다. 여기서는 운영 사이트의 CSS 를 그대로 받아 쓰고,
// DialogContent 의 클래스 문자열도 실제 것을 쓴다.
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";

import { convert } from "./convert.mjs";

const SITE = "https://www.lidamipedu.com";
const page = Number(process.argv[2] ?? 4);
const zoom = Number(process.argv[3] ?? 1);
const part = process.argv[4] === undefined ? undefined : Number(process.argv[4]);

// dialog.tsx 의 기본 클래스 + 팝업이 덧붙이는 클래스(digest-popup.tsx 와 같아야 한다).
const DIALOG_BASE =
  "bg-background fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg";
const DIALOG_MINE =
  "flex h-[94vh] w-[98vw] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none";
const BODY_CLS =
  "min-h-0 flex-1 touch-pan-x touch-pan-y overflow-x-auto overflow-y-auto overscroll-contain px-4 py-3";

const root = await fetch(SITE).then((r) => r.text());
const cssUrls = [...new Set([...root.matchAll(/"(\/assets\/[^"]+\.css)"/g)].map((m) => m[1]))];
if (!cssUrls.length) throw new Error("배포 CSS 를 찾지 못했습니다");
let siteCss = "";
for (const u of cssUrls) siteCss += await fetch(SITE + u).then((r) => r.text());
console.log(`운영 CSS ${cssUrls.length}개 · ${siteCss.length}자`);

const { bodyHtml, css, scopeKey } = convert(
  readFileSync(`scripts/digest/pages/digest-${page}p.html`, "utf8"),
  page,
  { part },
);

// cn(=twMerge) 을 그대로 돌려 실제로 남는 클래스를 얻는다.
const { twMerge } = await import("tailwind-merge");
const dialogCls = twMerge(DIALOG_BASE, DIALOG_MINE);
console.log("DialogContent 클래스:", dialogCls);

const html = `<!doctype html><meta charset="utf-8">
<style>${siteCss}</style>
<style>${css}</style>
<body>
<div id="dlg" class="${dialogCls}">
  <div class="border-border flex flex-none items-center gap-2 border-b px-4 py-2.5 pr-12">
    <h2 class="text-sm font-bold">특허요건 정리비교표</h2>
  </div>
  <div id="body" class="${BODY_CLS}" style="--digest-zoom:${zoom}">
    <div class="space-y-6"><section>
      <div class="digest-doc dp${scopeKey}">${bodyHtml}</div>
    </section></div>
  </div>
</div>
</body>`;

const file = "scripts/digest/.probe-real.html";
writeFileSync(file, html, "utf8");

const browser = await chromium.launch();
for (const vp of [
  { width: 1920, height: 1080 },
  { width: 1536, height: 864 },
  { width: 1280, height: 800 },
]) {
  const ctx = await browser.newContext({ viewport: vp });
  const p = await ctx.newPage();
  await p.goto(`file:///${process.cwd().replace(/\\/g, "/")}/${file}`);
  await p.waitForTimeout(300);
  const r = await p.evaluate(() => {
    const dlg = document.getElementById("dlg");
    const body = document.getElementById("body");
    const table = document.querySelector("table");
    const doc = document.querySelector(".digest-doc");
    const cs = getComputedStyle(dlg);
    return {
      팝업: { display: cs.display, w: dlg.clientWidth, h: dlg.clientHeight, overflow: cs.overflow },
      본문: {
        보임: `${body.clientWidth}×${body.clientHeight}`,
        내용: `${body.scrollWidth}×${body.scrollHeight}`,
        세로스크롤: body.scrollHeight > body.clientHeight,
        가로스크롤: body.scrollWidth > body.clientWidth,
      },
      자료폭: doc?.getBoundingClientRect().width,
      도형크기: [...document.querySelectorAll(".dg-dg")].map((e) => Math.round(e.getBoundingClientRect().width) + "×" + Math.round(e.getBoundingClientRect().height)),
      표: table
        ? { w: Math.round(table.getBoundingClientRect().width), 글자: getComputedStyle(table).fontSize }
        : null,
      표속: (() => {
        const t = document.querySelector("table");
        if (!t) return null;
        const w = document.querySelector(".dg-tablewrap");
        if (!w) return null;
        const cs = getComputedStyle(t);
        const cols = [...document.querySelectorAll("colgroup col")].map((c) => getComputedStyle(c).width);
        const row0 = [...t.querySelectorAll("thead tr:first-child > *")].map((c) => Math.round(c.getBoundingClientRect().width));
        return { 계산폭: cs.width, layout: cs.tableLayout, minW: cs.minWidth,
          wrap: w.clientWidth + "/" + w.scrollWidth,
          col: cols.join(","), 첫줄: row0.join("+") + "=" + row0.reduce((a,b)=>a+b,0) };
      })(),
      사슬: [".digest-doc", ".digest-page", ".dg-panel", ".dg-tablewrap", "table"].map((sel) => {
        const el = document.querySelector(sel);
        if (!el) return sel + " 없음";
        const cs = getComputedStyle(el);
        return sel + " w=" + Math.round(el.getBoundingClientRect().width) +
          " pad=" + cs.paddingLeft + "/" + cs.paddingRight +
          " box=" + cs.boxSizing + " minw=" + cs.minWidth;
      }),
      // 표 오른쪽 끝이 팝업 안에 있는가
      표오른쪽: table
        ? Math.round(table.getBoundingClientRect().right - dlg.getBoundingClientRect().right)
        : null,
    };
  });
  // 처방 시험 — 표가 상자를 넘는 것을 무엇으로 막을 수 있는지 그 자리에서 재 본다.
  const rx = await p.evaluate(() => {
    const t = document.querySelector("table");
    const w = document.querySelector(".dg-tablewrap");
    if (!t || !w) return null;
    const wide = () => Math.round(t.getBoundingClientRect().width);
    const before = wide();
    const s1 = document.createElement("style");
    document.head.append(s1);
    s1.textContent = ".digest-doc table{max-width:100% !important}";
    const withMax = wide();
    s1.textContent = ".digest-doc table{width:auto !important;max-width:100% !important}";
    const withAuto = wide();
    s1.textContent = ".digest-doc .dg-tablewrap{display:block;width:100%}.digest-doc table{width:100% !important;max-width:100% !important}";
    const withBoth = wide();
    s1.remove();
    const cs = getComputedStyle(t);
    const chain = [];
    for (let el = t.parentElement; el && chain.length < 6; el = el.parentElement) {
      const c = getComputedStyle(el);
      chain.push(
        `${el.tagName}.${(el.className || "").toString().split(" ")[0]} pos=${c.position} disp=${c.display} w=${Math.round(el.getBoundingClientRect().width)}`,
      );
    }
    return {
      상자: w.clientWidth,
      그대로: before,
      maxW: withMax,
      auto: withAuto,
      둘다: withBoth,
      표: `pos=${cs.position} disp=${cs.display} w=${cs.width}`,
      offsetParent: t.offsetParent?.className?.toString().slice(0, 40) ?? null,
      조상: chain,
    };
  });
  console.log(`\n=== ${vp.width}×${vp.height} (배율 ${zoom})`);
  console.log("  처방 시험:", rx);
  console.dir(r, { depth: 4 });
  await ctx.close();
}
await browser.close();
