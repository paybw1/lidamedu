// 강사 해설 PDF → 텍스트 추출 (pdfjs-dist, 검수 보조용 · 읽기 전용).
// pdftoppm/poppler 부재 환경 대비. 페이지별 텍스트를 줄바꿈으로 잇는다.
// 사용: node scripts/jagwa/pdf-text.mjs "<pdf 경로>" [시작페이지] [끝페이지]
import fs from "node:fs";
// 레거시 ESM 빌드 = node 친화(워커 없이 fake worker 폴백). pdfjs-dist 5.x.
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

const path = process.argv[2];
if (!path) throw new Error('usage: pdf-text.mjs "<pdf>" [from] [to]');
const from = process.argv[3] ? parseInt(process.argv[3], 10) : 1;
const toArg = process.argv[4] ? parseInt(process.argv[4], 10) : null;

const data = new Uint8Array(fs.readFileSync(path));
const doc = await pdfjs.getDocument({
  data,
  useSystemFonts: true,
  isEvalSupported: false,
}).promise;

const to = toArg ? Math.min(toArg, doc.numPages) : doc.numPages;
console.log(`[pages ${from}..${to} / total ${doc.numPages}]`);
for (let i = from; i <= to; i++) {
  const page = await doc.getPage(i);
  const tc = await page.getTextContent();
  let last = null;
  let line = "";
  const parts = [];
  for (const it of tc.items) {
    const y = it.transform[5];
    if (last !== null && Math.abs(y - last) > 3) {
      parts.push(line);
      line = "";
    }
    line += it.str;
    last = y;
  }
  if (line) parts.push(line);
  console.log(`\n===== p${i} =====`);
  console.log(parts.join("\n"));
}
