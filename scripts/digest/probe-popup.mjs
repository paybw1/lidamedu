// 정리비교표 팝업에서 자료가 한 화면에 들어오는지 **브라우저로 직접 잰다**.
//
//   node scripts/digest/probe-popup.mjs [쪽번호…]
//
// 팝업 구조(DialogContent = 94vh 세로 flex / 머리줄 고정 / 본문 overflow:auto)를 그대로
// 흉내 낸 화면에 적재본을 넣고 잰다. ★자바스크립트로 맞추는 코드는 없다 — 크기는 전부
// 적재본 CSS(vh·max·clamp)가 정한다. 여기서 넘치면 실제 화면에서도 넘친다.
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";

import { convert } from "./convert.mjs";

const pages = process.argv.slice(2).map(Number);
const 대상 = pages.length ? pages : [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
];

const browser = await chromium.launch();
for (const page of 대상) {
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
  .dlg { position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
         display:flex; flex-direction:column; height:94vh; width:98vw;
         overflow:hidden; background:#fff; border:1px solid var(--border); }
  .dlg-head { flex:none; border-bottom:1px solid var(--border); padding:10px 16px; font-weight:700; }
  .dlg-body { min-height:0; flex:1 1 0%; overflow:auto; padding:12px 16px; }
${css}
</style>
<div class="dlg">
  <div class="dlg-head">정리비교표</div>
  <div class="dlg-body" id="body"><div class="digest-doc dp${page}">${bodyHtml}</div></div>
</div>
`;
  const file = "scripts/digest/.probe-popup.html";
  writeFileSync(file, html, "utf8");

  const line = [];
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: vp });
    const p = await ctx.newPage();
    await p.goto(`file:///${process.cwd().replace(/\\/g, "/")}/${file}`);
    await p.waitForTimeout(250);
    const r = await p.evaluate(() => {
      const body = document.getElementById("body");
      const table = document.querySelector("table");
      return {
        내용: body.scrollHeight,
        보임: body.clientHeight,
        글자: table ? getComputedStyle(table).fontSize : "-",
        가로넘침: body.scrollWidth > body.clientWidth + 1,
      };
    });
    line.push(
      `${vp.width}: ${r.내용}/${r.보임}${r.내용 <= r.보임 + 1 ? "✔" : "★넘침"} ${r.글자}${r.가로넘침 ? " 가로넘침" : ""}`,
    );
    await ctx.close();
  }
  console.log(`${String(page).padStart(2)}p  ${line.join("   |   ")}`);
}
await browser.close();
