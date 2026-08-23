// 공지용 안내 이미지 렌더러 — HTML 카드 → PNG(2x).
//   node scripts/render-notice-image.mjs <카드.html> <출력.png>
// 원본 카드는 docs/assets/announcements/*.source.html 에 함께 둔다(문구 수정 후 재렌더용).
import { chromium } from "playwright";
import { pathToFileURL } from "node:url";

const [, , src, out] = process.argv;
if (!src || !out) {
  console.error("usage: node scripts/render-notice-image.mjs <card.html> <out.png>");
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1200, height: 675 },
  deviceScaleFactor: 2,
});
await page.goto(pathToFileURL(src).href);
await page.waitForTimeout(300);
await page.screenshot({ path: out });
await browser.close();
console.log("rendered:", out);
