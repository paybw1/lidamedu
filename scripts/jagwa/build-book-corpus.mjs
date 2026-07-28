// 리담 교재(상표 제20판·디자인 제15판) + 심사기준 → 검증용 코퍼스 청크 (feat-2-034).
// 입력: tmp/book-corpus/{trademark,design}-book.json (hwpx-to-text 산출)
//       source/{상표법학습,디자인보호법학습}/*.pdf (심사기준)
// 출력: tmp/book-corpus/{law}-chunks.json — [{id, source, heading, text}]
//
//   node scripts/jagwa/build-book-corpus.mjs

import { readFileSync, writeFileSync } from "node:fs";
import * as mupdf from "mupdf";

const TARGET = 2500; // 청크 목표 크기(자)
const HEADING_RE = /^(제\s*\d+\s*[장절관편]|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+\.\s|§\s*\d+)/;

function chunkLines(lines, source) {
  const chunks = [];
  let heading = "";
  let buf = [];
  let bufLen = 0;
  const flush = () => {
    if (bufLen < 80) {
      buf = [];
      bufLen = 0;
      return;
    }
    chunks.push({
      id: `${source}#${chunks.length}`,
      source,
      heading,
      text: buf.join("\n"),
    });
    buf = [];
    bufLen = 0;
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (HEADING_RE.test(line) && line.length < 60) {
      // 새 대단원 — 현재 버퍼가 이미 충분히 크면 끊는다.
      if (bufLen > TARGET * 0.5) flush();
      heading = line;
    }
    buf.push(line);
    bufLen += line.length + 1;
    if (bufLen >= TARGET) flush();
  }
  flush();
  return chunks;
}

function pdfLines(path) {
  const doc = mupdf.Document.openDocument(readFileSync(path), "application/pdf");
  const lines = [];
  for (let i = 0; i < doc.countPages(); i++) {
    lines.push(...doc.loadPage(i).toStructuredText().asText().split("\n"));
  }
  return lines;
}

const JOBS = [
  {
    law: "trademark",
    book: { path: "tmp/book-corpus/trademark-book.json", label: "리담상표법(제20판)" },
    pdfs: [{ path: "source/상표법학습/상표심사기준 (4).pdf", label: "상표심사기준" }],
  },
  {
    law: "design",
    book: { path: "tmp/book-corpus/design-book.json", label: "리담디자인보호법(제15판)" },
    pdfs: [{ path: "source/디자인보호법학습/디자인 심사기준.pdf", label: "디자인심사기준" }],
  },
];

for (const job of JOBS) {
  const bookJson = JSON.parse(readFileSync(job.book.path, "utf8"));
  const bookLines = bookJson.paragraphs.map((p) => p.text ?? "");
  let chunks = chunkLines(bookLines, job.book.label);
  for (const pdf of job.pdfs) {
    try {
      chunks = chunks.concat(chunkLines(pdfLines(pdf.path), pdf.label));
    } catch (e) {
      console.warn(`  ⚠ ${pdf.path}: ${e.message}`);
    }
  }
  const out = `tmp/book-corpus/${job.law}-chunks.json`;
  writeFileSync(out, JSON.stringify(chunks), "utf8");
  const total = chunks.reduce((s, c) => s + c.text.length, 0);
  console.log(`${job.law}: ${chunks.length} chunks (${(total / 1e6).toFixed(1)}M자) → ${out}`);
}
