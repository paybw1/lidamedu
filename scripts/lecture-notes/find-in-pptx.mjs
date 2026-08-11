// 강의노트 PPTX 슬라이드 텍스트 검색 — 배포 PDF 는 이미지라 텍스트가 없으므로 원본 PPTX 를 본다.
//   node scripts/lecture-notes/find-in-pptx.mjs "source/특허법/특허법 강의노트" 실시료 반환
// (키워드를 모두 포함하는 슬라이드만 출력)
import { readdirSync } from "node:fs";
import AdmZip from "adm-zip";

const [dir, ...kw] = process.argv.slice(2);
if (!dir || !kw.length) {
  console.log('사용법: node scripts/lecture-notes/find-in-pptx.mjs "<디렉토리>" <키워드…>');
  process.exit(0);
}
for (const f of readdirSync(dir).filter((x) => x.endsWith(".pptx"))) {
  const zip = new AdmZip(`${dir}/${f}`);
  const slides = zip.getEntries().filter((e) => /ppt\/slides\/slide\d+\.xml$/.test(e.entryName));
  slides.sort((a, b) => Number(a.entryName.match(/slide(\d+)/)[1]) - Number(b.entryName.match(/slide(\d+)/)[1]));
  for (const e of slides) {
    const text = [...e.getData().toString("utf8").matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]).join(" ");
    if (kw.every((k) => text.includes(k))) {
      console.log(`\n### ${f} :: ${e.entryName.match(/slide\d+/)[0]}\n${text}`);
    }
  }
}
