// **진짜 팝업**을 그대로 띄워 빈칸 학습이 듣는지 확인한다.
//
//   npm run build && node scripts/digest/probe-popup-blanks.mjs
//
// ★왜 이것까지 재는가: probe-blanks.mjs 는 클래스를 손으로 붙여 **모양**만 봤다. 정작
//   위험한 곳은 손잡이가 **언제 붙느냐**다 — 팝업(DigestPopup)은 화면에 늘 붙어 있고
//   열릴 때만 속을 그린다(Radix Dialog). 자리를 RefObject 로 받으면 그 순간 다시 부를
//   계기가 없어 **처음 열었을 때 아무 반응이 없다**. 그래서 실제 컴포넌트를 그대로
//   묶어(esbuild) 띄우고, 열기 → 목차 누르기 → 닫았다 다시 열기까지 눌러 본다.
//   이 화면의 사고는 전부 "따로 만든 재현에서는 되는데 진짜 화면에서는 안 되는" 것이었다.
import { readFileSync, readdirSync } from "node:fs";
import { chromium } from "playwright";
import * as esbuild from "esbuild";

import { convert } from "./convert.mjs";

// 빌드 산출물의 이름은 바뀐다 — 찾아 쓴다.
const APP_CSS = "build/client/assets/" +
  (readdirSync("build/client/assets").find((f) => /^root-.*.css$/.test(f)) ??
    (() => { throw new Error("빌드된 CSS 가 없습니다 — npm run build 먼저"); })());

// 실제 화면과 같은 얼개 — 팝업은 늘 붙어 있고 `open` 만 바뀐다(systematic-node-viewer).
const HARNESS = `
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { DigestPopup } from "~/features/subjects/components/digest-popup";

function App() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button id="badge" onClick={() => setOpen(true)}>정리</button>
      <DigestPopup groups={window.__GROUPS__} startIndex={0} open={open} onOpenChange={setOpen} />
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);
`;

const built = await esbuild.build({
  stdin: { contents: HARNESS, resolveDir: process.cwd(), loader: "tsx", sourcefile: "harness.tsx" },
  bundle: true,
  write: false,
  format: "iife",
  jsx: "automatic",
  alias: { "~": `${process.cwd().replace(/\\/g, "/")}/app` },
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
});
const bundle = built.outputFiles[0].text;

/** 두 화면을 넣어 ‹ › 이동까지 눌러 본다. */
const groups = [4, 8].map((page) => {
  const r = convert(readFileSync(`scripts/digest/pages/digest-${page}p.html`, "utf8"), page);
  return {
    key: `p${page}`,
    label: r.title,
    nodeId: `n${page}`,
    digest: {
      digestId: `p${page}`,
      nodeId: `n${page}`,
      outlineLabel: null,
      page,
      scopeKey: r.scopeKey,
      title: r.title,
      bodyHtml: r.bodyHtml,
      css: r.css,
    },
  };
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log(`  ★화면 오류: ${e.message}`));
// ★about:blank 에서는 localStorage 가 막힌다(팝업이 글자 크기를 기억한다) — 진짜
//   주소를 흉내 내 띄운다.
const HTML =
  `<!doctype html><html><head><style>${readFileSync(APP_CSS, "utf8")}</style></head>` +
  `<body><div id="root"></div></body></html>`;
await p.route("**/*", (route) => route.fulfill({ contentType: "text/html", body: HTML }));
await p.goto("http://digest.local/");
await p.evaluate((g) => {
  window.__GROUPS__ = g;
}, groups);
await p.addScriptTag({ content: bundle });

const blanks = () => p.locator(".dg-blank").count();
const headByText = (t) =>
  p.locator(`[data-dg-blank]`).filter({ hasText: t }).first();

let bad = 0;
const say = (ok, msg) => {
  if (!ok) bad += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${msg}`);
};

console.log("\n[처음 열었을 때]");
await p.click("#badge");
await p.waitForSelector("[data-dg-r]");
const toolbar = await p.getByRole("button", { name: "전부 빈칸" }).count();
say(toolbar === 1, `머리에 「전부 빈칸」이 있다 (${toolbar})`);

// 「의의」 = 행 목차 → 그 가로줄 10칸.
await headByText("의의").click();
let n = await blanks();
say(n === 10, `「의의」를 눌렀더니 빈칸 ${n}칸 (기대 10)`);

await headByText("의의").click();
n = await blanks();
say(n === 0, `다시 누르니 도로 보인다 (${n}칸)`);

// 「진보성」 = 열 목차 → 세로줄 10칸.
await p.locator('[data-dg-blank="col"]').filter({ hasText: "진보성" }).first().click();
n = await blanks();
say(n === 10, `「진보성」을 눌렀더니 빈칸 ${n}칸 (기대 10)`);

// 표 이름 = 전체.
await p.locator('[data-dg-blank="all"]').first().click();
n = await blanks();
say(n === 57, `표 이름을 눌렀더니 빈칸 ${n}칸 (기대 57)`);

// 가려진 칸을 누르면 그 칸만 보인다.
await p.locator(".dg-blank").first().click();
n = await blanks();
say(n === 56, `가려진 칸을 누르니 그 칸만 보인다 (${n}칸)`);

console.log("\n[‹ › 로 다른 자료로 갔을 때]");
await p.getByRole("button", { name: "심판제도" }).click();
await p.waitForTimeout(150);
n = await blanks();
say(n === 0, `자료가 바뀌면 처음부터 (${n}칸)`);
await p.getByRole("button", { name: "전부 빈칸" }).click();
n = await blanks();
say(n === 69, `「전부 빈칸」 (${n}칸, 기대 69)`);
await p.getByRole("button", { name: "모두 보기" }).click();
n = await blanks();
say(n === 0, `「모두 보기」 (${n}칸)`);

console.log("\n[닫았다 다시 열었을 때]");
await p.keyboard.press("Escape");
await p.waitForTimeout(200);
await p.click("#badge");
await p.waitForSelector("[data-dg-r]");
await headByText("의의").click();
n = await blanks();
say(n === 10, `다시 열어도 목차가 듣는다 (${n}칸, 기대 10)`);

await browser.close();
console.log(bad === 0 ? "\n어긋난 곳 없음" : `\n★어긋난 곳 ${bad}건`);
process.exit(bad === 0 ? 0 : 1);
