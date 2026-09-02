// 변호사시험 지적재산권법(특허법) 기출문제와 해설 — 교재 형태 PDF 생성.
//
//   앞부속(표지·일러두기·목차)과 본문을 따로 렌더한 뒤 합친다. 목차의 쪽번호는
//   본문 PDF 를 mupdf 로 훑어 장(章) 표지에 심어 둔 마커를 찾아 채운다(2-pass).
//
//   node scripts/bar-exam/build-book.mjs
import fs from "node:fs";
import path from "node:path";
import { toHtml, toInlineHtml } from "./md.mjs";
import { chromium } from "playwright";
import * as mupdf from "mupdf";
import { PDFDocument } from "pdf-lib";

const ROOT = process.cwd();
const COLLECTION = path.join(ROOT, "docs/bar-exam/변호사시험-지적재산권법-기출자료집.json");
const HAESEOL_DIR = path.join(ROOT, "docs/bar-exam/해설");
const OUT_PDF = path.join(ROOT, "docs/bar-exam/변호사시험-지적재산권법-특허법-기출해설.pdf");
const TMP = path.join(ROOT, "docs/bar-exam/.book-tmp");

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ── 해설 마크다운 정규화 ──────────────────────────────────────────────────
// 파일마다 설문 제목의 heading 레벨이 다르다(# 과 ## 혼용). 가장 얕은 레벨을 h2 로
// 맞추어 책 전체의 위계를 통일한다. 머리말의 「이 해설의 작성 방법」 문단은 장 끝의
// 작은 글씨로 옮긴다.
function normalizeHaeseol(md) {
  let t = md.replace(/^#\s.*\n/, ""); // 장 제목은 책이 따로 단다

  let method = "";
  t = t.replace(/^##\s*이 해설의 작성 방법\s*\n+([\s\S]*?)(?=\n\s*\n)/m, (_, body) => {
    method = body.trim();
    return "";
  });

  const levels = [...t.matchAll(/^(#{1,6})\s/gm)].map((m) => m[1].length);
  if (levels.length) {
    const shift = 2 - Math.min(...levels);
    if (shift !== 0) {
      t = t.replace(/^(#{1,6})(\s)/gm, (_, h, sp) => "#".repeat(Math.max(1, h.length + shift)) + sp);
    }
  }
  return { body: t.replace(/^\s*-{3,}\s*$/gm, "").trim(), method };
}

// 차례에 실을 논점 — 「설문 N — 제목 (NN점)」 꼴 제목에서 제목만 뽑는다.
// 회차마다 설문 제목이 h2 이기도 h3 이기도 해서 둘 다 훑는다.
function topicsOf(body) {
  const all = [...body.matchAll(/^#{2,3}\s+(.+?)\s*$/gm)]
    .map((m) => m[1])
    .filter((s) => s.includes("—"))
    .map((s) =>
      s
        .replace(/^[^—]*—\s*/, "")
        .replace(/\s*\(\d+\s*점\)\s*$/, "")
        .trim(),
    )
    .filter(Boolean);
  return all.length > 4 ? all.slice(0, 4).concat("…") : all;
}

// ── 문제 원문 ─────────────────────────────────────────────────────────────
function renderQuestion(qs) {
  return qs
    .map((q) => {
      const head =
        qs.length > 1
          ? `<h3 class="qsub">${esc(q.label)} <span class="pt">${q.points}점</span></h3>`
          : "";
      const facts = (q.facts || []).map((f) => `<p>${esc(f)}</p>`).join("\n");
      const asks = (q.asked || [])
        .map((a) => {
          const head = /^\s*\d+(-\d+)?\s*\./.test(a);
          return `<p class="${head ? "ask ask-h" : "ask"}">${esc(a)}</p>`;
        })
        .join("\n");
      return `${head}${facts ? `<div class="facts">${facts}</div>` : ""}<div class="asks">${asks}</div>`;
    })
    .join("\n");
}

// ── 데이터 수집 ───────────────────────────────────────────────────────────
const data = JSON.parse(fs.readFileSync(COLLECTION, "utf8"));
const chapters = data.rounds
  .slice()
  .sort((a, b) => a.round - b.round)
  .map((r) => {
    const patent = r.qs.filter((q) => q.area === "특허법");
    const f = path.join(HAESEOL_DIR, `제${String(r.round).padStart(2, "0")}회-제1문-특허법.md`);
    if (!fs.existsSync(f)) return null;
    const { body, method } = normalizeHaeseol(fs.readFileSync(f, "utf8"));
    return {
      round: r.round,
      year: r.year,
      points: patent.reduce((s, q) => s + (q.points || 0), 0),
      // 배점이 붙은 항목 수 = 실제 채점 단위인 설문의 수.
      count: patent.reduce((s, q) => s + (q.asked || []).filter((a) => /\(\d+\s*점\)/.test(a)).length, 0),
      label: patent.map((q) => q.label).join(" · "),
      topics: topicsOf(body),
      qHtml: renderQuestion(patent),
      aHtml: toHtml(body),
      method,
    };
  })
  .filter(Boolean);

// ── 공통 스타일 ───────────────────────────────────────────────────────────
const CSS = `
@page { size: A4; }
*{ box-sizing:border-box }
html,body{ margin:0; padding:0 }
body{
  font-family:"Batang","Nanum Myeongjo","AppleMyungjo",serif;
  font-size:10.4pt; line-height:1.78; color:#111;
  -webkit-print-color-adjust:exact; print-color-adjust:exact;
}
/* ★인쇄 본문은 양끝맞춤이므로 음절 단위 줄바꿈(한국어 조판의 기본)을 허용한다.
   keep-all 을 걸면 어절이 통째로 넘어가 낱말 사이가 벌어진다. 제목·표처럼 짧은
   덩어리에만 keep-all 을 준다. */
h1,h2,h3,h4,h5,.md th,.md td,.band,.ch-meta,.qsub{ word-break:keep-all }
strong,b{ font-family:"Malgun Gothic","Apple SD Gothic Neo",sans-serif; font-weight:700 }
h1,h2,h3,h4,h5{
  font-family:"Malgun Gothic","Apple SD Gothic Neo",sans-serif;
  break-after:avoid; page-break-after:avoid; letter-spacing:-.01em;
}

/* ── 장 표지 ── */
.chapter{ break-before:page; page-break-before:always }
.chapter:first-child{ break-before:auto; page-break-before:auto }
.ch-head{ border-bottom:2.2pt solid #1b3350; padding-bottom:3mm; margin-bottom:6mm }
.ch-no{ font-family:"Malgun Gothic",sans-serif; font-size:8.6pt; letter-spacing:.22em; color:#8a6a2c }
.ch-title{ margin:1mm 0 0; font-size:19pt; font-weight:700; color:#1b3350 }
.ch-meta{ margin:1.5mm 0 0; font-family:"Malgun Gothic",sans-serif; font-size:8.8pt; color:#666 }
.mark{ font-size:1px; color:#fff }

/* ── 문제 ── */
.band{
  font-family:"Malgun Gothic",sans-serif; font-size:9.6pt; font-weight:700; letter-spacing:.16em;
  color:#fff; background:#1b3350; padding:1.2mm 3mm; display:inline-block; margin:0 0 3.5mm;
}
.qsub{ font-size:11pt; margin:5mm 0 2mm }
.qsub .pt{ font-family:"Batang",serif; font-weight:400; color:#666; font-size:9.4pt }
.facts{ background:#f4f5f3; border-left:2.6pt solid #8a6a2c; padding:3mm 4mm; margin:0 0 4mm }
.facts p{ margin:0 0 2mm } .facts p:last-child{ margin:0 }
.asks{ margin:0 0 2mm }
.ask{ margin:0 0 2mm; padding-left:5mm; text-indent:-5mm }
.ask-h{ margin-top:3.5mm }

/* ── 해설 ── */
.answer{ margin-top:7mm }
.md h2{
  font-size:13pt; margin:8mm 0 3mm; padding:1.6mm 0 1.6mm 3mm;
  border-left:3.4pt solid #1b3350; background:#eef1f5; color:#12253a;
}
.md h3{ font-size:11.2pt; margin:6mm 0 2mm; color:#1b3350 }
.md h4{ font-size:10.4pt; margin:4.5mm 0 1.5mm; color:#333 }
.md h5{ font-size:10.2pt; margin:4mm 0 1.5mm; color:#444 }
.md > *:first-child{ margin-top:0 }
.md p{ margin:0 0 2.6mm; text-align:justify }
.md ul,.md ol{ margin:0 0 3mm; padding-left:6.5mm }
.md li{ margin-bottom:1.2mm }
.md blockquote{
  margin:3.5mm 0; padding:2.6mm 3.5mm; background:#faf7f0; border-left:2.6pt solid #8a6a2c;
  font-size:9.7pt; break-inside:avoid; page-break-inside:avoid;
}
.md blockquote p{ margin:0 0 1.8mm } .md blockquote p:last-child{ margin:0 }
.md hr{ border:0; border-top:.5pt solid #ccc; margin:6mm 0 }
.md table{
  width:100%; border-collapse:collapse; margin:0 0 3.5mm; font-size:9.3pt;
  font-family:"Malgun Gothic",sans-serif; break-inside:avoid; page-break-inside:avoid;
}
.md th,.md td{ border:.6pt solid #b9c0c8; padding:1.5mm 2mm; vertical-align:top }
.md thead th{ background:#eef1f5; color:#12253a; text-align:left }
.md code{ font-family:Consolas,monospace; font-size:9pt; background:#f2f2f2; padding:0 .8mm }

/* ── 장 끝 각주 ── */
.method{
  margin-top:7mm; padding:3mm 4mm; background:#f7f7f5; border:.6pt solid #ddd;
  font-family:"Malgun Gothic",sans-serif; font-size:8.6pt; line-height:1.7; color:#555;
  break-inside:avoid; page-break-inside:avoid;
}
.method b{ color:#333 }
`;

// ── 본문 HTML ─────────────────────────────────────────────────────────────
const bodyHtml = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>본문</title><style>${CSS}</style></head><body>
${chapters
  .map(
    (c) => `<section class="chapter">
  <header class="ch-head">
    <div class="ch-no">CHAPTER ${String(c.round).padStart(2, "0")}<span class="mark">CHAPTERMARK${c.round}END</span></div>
    <h1 class="ch-title">제${c.round}회 변호사시험 · 특허법</h1>
    <p class="ch-meta">${c.year}년 시행 · ${esc(c.label)} · 배점 ${c.points}점 · 설문 ${c.count}개</p>
  </header>
  <div class="question"><div class="band">문 제</div>${c.qHtml}</div>
  <div class="answer"><div class="band">해 설</div><div class="md">${c.aHtml}</div></div>
  ${c.method ? `<div class="method"><b>집필 근거</b> — ${toInlineHtml(c.method.replace(/\n/g, " "))}</div>` : ""}
</section>`,
  )
  .join("\n")}
</body></html>`;

fs.mkdirSync(TMP, { recursive: true });
fs.writeFileSync(path.join(TMP, "body.html"), bodyHtml, "utf8");

const MARGIN = { top: "20mm", bottom: "18mm", left: "20mm", right: "20mm" };
const HEADER = `<div style="width:100%;font-family:'Malgun Gothic',sans-serif;font-size:7.5pt;color:#999;padding:0 20mm;">
  <div style="border-bottom:.5px solid #ddd;padding-bottom:1.5mm;">변호사시험 지적재산권법 · 특허법 기출해설</div></div>`;
const FOOTER = `<div style="width:100%;font-family:'Malgun Gothic',sans-serif;font-size:9pt;color:#555;text-align:center;">
  <span class="pageNumber"></span></div>`;
const BLANK = `<div></div>`;

const browser = await chromium.launch();
const page = await browser.newPage();

async function render(file, opts) {
  await page.goto("file:///" + path.join(TMP, file).replace(/\\/g, "/"));
  await page.emulateMedia({ media: "print" });
  return page.pdf({ format: "A4", printBackground: true, margin: MARGIN, ...opts });
}

// ① 본문 렌더 → 장별 시작 쪽 추출
const bodyPdf = await render("body.html", {
  displayHeaderFooter: true,
  headerTemplate: HEADER,
  footerTemplate: FOOTER,
});

const doc = mupdf.Document.openDocument(bodyPdf, "application/pdf");
const startPage = new Map();
for (let i = 0; i < doc.countPages(); i++) {
  // ★1px 글자는 글리프마다 줄이 나뉘어 추출되므로 공백을 지우고 찾는다.
  const txt = doc.loadPage(i).toStructuredText().asText().replace(/\s+/g, "");
  for (const m of txt.matchAll(/CHAPTERMARK(\d+)END/g)) {
    if (!startPage.has(+m[1])) startPage.set(+m[1], i + 1);
  }
}
console.log(`본문 ${doc.countPages()}쪽 · 장 시작쪽 ${startPage.size}건 확인`);

// ② 앞부속(표지·일러두기·목차)
const toc = chapters
  .map(
    (c) => `<li>
      <div class="t-row">
        <span class="t-no">제${c.round}회</span>
        <span class="t-yr">${c.year}</span>
        <span class="t-dot"></span>
        <span class="t-pg">${startPage.get(c.round) ?? "-"}</span>
      </div>
      <div class="t-tp">${esc(c.topics.join(" · "))}</div>
    </li>`,
  )
  .join("\n");

const today = fs.statSync(COLLECTION).mtime;
const stamp = `${today.getFullYear()}. ${today.getMonth() + 1}.`;

const frontHtml = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>앞부속</title><style>${CSS}
/* 위 여백을 조금 더 크게 잡아 시각적 중심이 기하학적 중심보다 살짝 위에 오게 한다. */
.cover{ height:257mm; display:grid; grid-template-rows:1fr auto 1.25fr; text-align:center }
.cover .main{ grid-row:2 }
.cover .foot{ grid-row:3; align-self:end }
.cover .org{ font-family:"Malgun Gothic",sans-serif; font-size:9.5pt; letter-spacing:.35em; color:#8a6a2c }
.cover h1{ font-size:31pt; margin:9mm 0 0; color:#1b3350; letter-spacing:-.02em; line-height:1.3 }
.cover .sub{ font-size:14pt; margin:5mm 0 0; color:#33465c; font-family:"Batang",serif }
.cover .rule{ width:34mm; height:2.4pt; background:#8a6a2c; margin:11mm auto }
.cover .rng{ font-family:"Malgun Gothic",sans-serif; font-size:10.5pt; color:#555; line-height:2 }
.cover .foot{ font-family:"Malgun Gothic",sans-serif; font-size:8.5pt; color:#999 }
.fm{ break-before:page; page-break-before:always }
.fm h1{ font-size:16pt; color:#1b3350; margin:0 0 6mm; padding-bottom:2.5mm; border-bottom:1.6pt solid #1b3350 }
.fm h2{ font-size:11.4pt; margin:6mm 0 2mm; color:#1b3350; font-family:"Malgun Gothic",sans-serif }
.fm p,.fm li{ font-size:10.2pt }
.fm ul{ padding-left:6mm }
.toc{ list-style:none; margin:0; padding:0 }
.toc li{ padding:2.4mm 0; border-bottom:.4pt dotted #ccc; font-family:"Malgun Gothic",sans-serif }
.t-row{ display:flex; align-items:baseline; gap:2mm; font-size:10pt }
.t-no{ font-weight:700; color:#1b3350; min-width:17mm }
.t-yr{ color:#999; font-size:8.8pt; min-width:12mm }
.t-dot{ flex:1; border-bottom:.4pt dotted #ccc; transform:translateY(-1mm) }
.t-pg{ font-variant-numeric:tabular-nums; color:#333 }
.t-tp{ margin:.6mm 0 0 19mm; font-size:8.7pt; color:#777; line-height:1.55; word-break:keep-all }
</style></head><body>

<section class="cover">
  <div class="main">
    <div class="org">리담변리사학원</div>
    <h1>변호사시험<br>지적재산권법</h1>
    <p class="sub">기출문제와 해설 · 특허법</p>
    <div class="rule"></div>
    <div class="rng">제1회 ~ 제15회<br>2012 ~ 2026</div>
  </div>
  <div class="foot">${stamp} · 내부 학습자료</div>
</section>

<section class="fm">
  <h1>일러두기</h1>

  <h2>1. 이 책의 구성</h2>
  <p>제1회부터 제15회까지의 변호사시험 지적재산권법 <b>제1문(특허법)</b>을 회차별로 한 장(章)씩
  수록하였다. 각 장은 <b>문제 원문</b>과 <b>해설</b>로 이루어지며, 해설은 설문 순서를 따른다.
  제2문(저작권법)은 수록하지 않았다.</p>

  <h2>2. 적용 법령</h2>
  <p>기출문제라도 <b>출제 당시의 법이 아니라 현행법을 적용</b>하여 풀이하였다. 수험생이 대비하는
  시험이 현행법으로 출제되기 때문이다. 따라서 <b>부칙(시행일·적용례·경과조치)은 다루지
  않는다.</b> 발문이 구법 조문이나 용어를 인용하는 경우에만 현행 조문과의 대응관계를 밝혔다.
  조문은 <b>2025. 11. 11. 시행 특허법</b>을 기준으로 하였다.</p>

  <h2>3. 표기 규칙</h2>
  <ul>
    <li><b>法 29①Ⅰ</b> = 특허법 제29조 제1항 제1호. 다른 법률은 <b>民訴法·發振法</b>과 같이
        법률명을 앞에 붙인다.</li>
    <li>조문 가지번호는 <b>제99조의2</b>와 같이 적는다.</li>
    <li>정의는 「 」 안에 넣고, 요건은 ⅰ)·ⅱ)로, 판단 항목은 Ⅰ.·Ⅱ.로 구분한다.</li>
    <li>판례는 <b>대법원 2012. 1. 19. 선고 2010다95390 전원합의체</b>와 같이 선고일과
        사건번호를 함께 적는다.</li>
  </ul>

  <h2>4. 인용의 원칙</h2>
  <p>본문에 적은 <b>사건번호는 실재가 확인된 것만</b> 인용하였다. 확인 경로는 학원 판례
  데이터베이스(<code>cases</code>·<code>case_lower_courts</code>), 리담특허법 교재,
  국가법령정보센터 네 곳이며, 어느 곳에서도 확인되지 않은 번호는 적지 않고 사건번호 없이
  법리만 서술하였다. 법리 서술은 교재의 해당 절을 통독하고 그 체계와 항목 구분을 따랐다.</p>

  <h2>5. 편집상의 표시</h2>
  <ul>
    <li><b>★</b> 는 그 설문의 배점이 갈리는 핵심 논점을 가리킨다.</li>
    <li>회색 상자는 <b>사실관계</b>, 밑줄 친 인용 상자는 <b>답안 작성상의 유의점</b>이다.</li>
    <li>각 장 끝의 <b>집필 근거</b>는 그 해설이 어느 교재 절과 조문에 기대고 있는지를 밝힌
        것이다.</li>
  </ul>
</section>

<section class="fm">
  <h1>차례</h1>
  <ul class="toc">${toc}</ul>
</section>
</body></html>`;

fs.writeFileSync(path.join(TMP, "front.html"), frontHtml, "utf8");
const frontPdf = await render("front.html", {
  displayHeaderFooter: true,
  headerTemplate: BLANK,
  footerTemplate: BLANK,
});
await browser.close();

// ③ 합본
const out = await PDFDocument.create();
for (const buf of [frontPdf, bodyPdf]) {
  const src = await PDFDocument.load(buf);
  const pages = await out.copyPages(src, src.getPageIndices());
  pages.forEach((p) => out.addPage(p));
}
out.setTitle("변호사시험 지적재산권법 · 특허법 기출해설");
out.setSubject("제1회~제15회 제1문(특허법) 기출문제와 해설");
out.setCreator("리담변리사학원");
fs.writeFileSync(OUT_PDF, await out.save());

fs.rmSync(TMP, { recursive: true, force: true });
console.log(
  `생성: ${path.relative(ROOT, OUT_PDF)} — ${(fs.statSync(OUT_PDF).size / 1024 / 1024).toFixed(1)}MB · ` +
    `${(await PDFDocument.load(fs.readFileSync(OUT_PDF))).getPageCount()}쪽`,
);
