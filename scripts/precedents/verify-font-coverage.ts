// 새 폰트(Noto Serif CJK KR) 가 적재 시도 시 발견된 미커버 글자들을 모두 그릴 수 있는지 검사.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import fontkit from "@pdf-lib/fontkit";

const FONT_PATH = resolve(process.cwd(), "public/fonts/NotoSerifCJKkr-Regular.otf");
const bytes = readFileSync(FONT_PATH);
const font = (fontkit as unknown as {
  create(b: Uint8Array): { hasGlyphForCodePoint(cp: number): boolean };
}).create(bytes);

const TEST = [
  "한자: 韓 國 語 漢 字 鋼 製 梁 材 半 鐵 業 圖 示 纖 維 硬 蛋 白 質 毛 髮 封 入 電 氣 發 光 性 燐 網 體",
  "단위: ㎝ ㎜ ㎟ ㎛ ∼ ℃ ℉",
  "그리스: α β Π",
  "로마: Ⅰ Ⅱ Ⅲ Ⅳ",
  "옛: 昭 査 定 浸 漬 試 製 齒 合 凹 部 基 嵌 揷 杆 保 持 形 成 高 ￣ 點 腐 蝕 平 粗 面 粒 度 再 水 化",
];

const all = TEST.join(" ");
const uniq = [...new Set([...all].filter((ch) => {
  const cp = ch.codePointAt(0);
  if (cp == null || cp <= 0x20 || cp === 0xa0 || cp === 0x3000) return false;
  return true;
}))];

const missing: string[] = [];
for (const ch of uniq) {
  if (!font.hasGlyphForCodePoint(ch.codePointAt(0)!)) missing.push(ch);
}

process.stdout.write(`검사 글자 ${uniq.length}자\n`);
process.stdout.write(`Noto Serif CJK KR 미커버: ${missing.length}자\n`);
if (missing.length > 0) {
  process.stdout.write(`  → ${missing.map((c) => `${c}(U+${c.codePointAt(0)!.toString(16)})`).join(" ")}\n`);
} else {
  process.stdout.write(`  ✓ 모든 검사 글자 커버\n`);
}
