// 특허법 2차 기출 주관식 문제집(PDF) — 문제 · 모범답안 · 채점기준.
// 본문과 앞부속(표지·일러두기·차례)을 따로 렌더해 합친다. 차례 쪽번호는 본문에 심은
// 보이지 않는 표식을 다시 읽어 채운다(2-pass) — 렌더 전에는 쪽수를 알 수 없기 때문이다.
//
//   node scripts/patent-essay/export.mjs
//   node scripts/patent-essay/bmp-to-png.mjs
//   node scripts/patent-essay/build-book.mjs
import fs from "node:fs";
import path from "node:path";

import * as mupdf from "mupdf";
import { PDFDocument } from "pdf-lib";
import { chromium } from "playwright";

import {
  esc,
  issuesFromRubric,
  mdToHtml,
  normalizeAnswerHeadings,
  trimIssueLabel,
} from "./render.mjs";

const ROOT = process.cwd();
const DATA = path.join(ROOT, "tmp/patent-essay/data.json");
const OUT_PDF = path.join(ROOT, "docs/patent-essay/특허법-2차-기출-주관식-문제집.pdf");
const TMP = path.join(ROOT, "tmp/patent-essay/.book");

const items = JSON.parse(fs.readFileSync(DATA, "utf8"));
const years = [...new Set(items.map((i) => i.year))].sort((a, b) => a - b);
const KIND_LABEL = { case_based: "사례형", theory: "약술형" };

/* ── 조판 ────────────────────────────────────────────────────────────────────
   본문 명조 + 강조·제목 고딕. 한국어 교재의 관례이고, 바탕체의 굵게는 합성이라
   인쇄하면 뭉개진다. 양끝맞춤을 쓰므로 산문은 음절 단위 줄바꿈을 허용하고(keep-all
   을 걸면 어절이 통째로 넘어가 낱말 사이가 벌어진다), 제목·표 칸에만 keep-all 을 준다. */
const CSS = `
  @page { size: A4; }
  :root{
    --ink:#1a1a17; --ink-2:#4a4841; --ink-3:#84817a;
    --line:#d8d4ca; --line-2:#ece8de;
    --accent:#1f3a5f; --accent-soft:#eef2f7;
    --pts:#8c3a2b; --pts-soft:#f8efec;
    --serif:"Noto Serif KR","바탕","Batang",serif;
    --sans:"맑은 고딕","Malgun Gothic","Pretendard",sans-serif;
  }
  *{box-sizing:border-box}
  body{margin:0;color:var(--ink);font-family:var(--serif);
       font-size:10.4pt;line-height:1.88;text-align:justify;
       -webkit-print-color-adjust:exact;print-color-adjust:exact}
  h1,h2,h3,h4,h5,h6,.band,.ch-meta,.q-label,th,td,.toc,.issue-list{word-break:keep-all}
  strong{font-family:var(--sans);font-weight:700}

  /* 파트 개장 — 연도 */
  .part{break-before:page;padding-top:52mm}
  .part .yr{font-family:var(--sans);font-size:44pt;font-weight:800;letter-spacing:-.03em;
            color:var(--accent);line-height:1}
  .part .yr small{display:block;font-size:11pt;font-weight:700;letter-spacing:.18em;
                  color:var(--ink-3);margin-bottom:6mm}
  .part .rule{height:2px;background:var(--accent);width:34mm;margin:8mm 0 7mm}
  .part ul{list-style:none;margin:0;padding:0;font-family:var(--sans)}
  .part li{padding:3.4mm 0;border-bottom:1px solid var(--line-2);display:flex;gap:5mm;
           align-items:baseline;font-size:10pt}
  .part li b{font-weight:750;min-width:16mm}
  .part li span{color:var(--ink-2);flex:1}
  .part li em{font-style:normal;color:var(--pts);font-family:var(--sans);
              font-weight:700;font-size:9pt;white-space:nowrap}

  /* 문항 */
  .item{break-before:page}
  .item-head{border-bottom:2.4px solid var(--accent);padding-bottom:3.5mm;margin-bottom:7mm}
  .item-head .ch-meta{font-family:var(--sans);font-size:8.6pt;font-weight:700;
                      letter-spacing:.05em;color:var(--ink-3);margin-bottom:2.2mm}
  .item-head h1{font-family:var(--sans);margin:0;font-size:19pt;font-weight:800;
                letter-spacing:-.02em;display:flex;align-items:baseline;gap:4mm}
  .item-head h1 .tag{font-size:8.8pt;font-weight:700;color:var(--pts);
                     background:var(--pts-soft);padding:1.4mm 2.6mm;border-radius:20px;
                     letter-spacing:0}
  .item-head h1 .tag.kind{color:var(--accent);background:var(--accent-soft)}

  .q-label{font-family:var(--sans);font-size:8.8pt;font-weight:800;letter-spacing:.04em;
           color:var(--accent);margin:0 0 3mm}
  .qbox{background:#f9f8f4;border:1px solid var(--line);border-left:3px solid var(--accent);
        border-radius:2px;padding:6mm 7mm;margin-bottom:9mm}
  .qbox p{margin:0 0 .8em} .qbox>*:last-child{margin-bottom:0}

  /* 모범답안 */
  .answer h2{font-family:var(--sans);font-size:12.4pt;font-weight:800;color:var(--accent);
             margin:7mm 0 3mm;padding-bottom:1.6mm;border-bottom:1px solid var(--line);
             break-after:avoid}
  .answer h3{font-family:var(--sans);font-size:11pt;font-weight:750;margin:5mm 0 2mm;break-after:avoid}
  .answer h4{font-family:var(--sans);font-size:10.2pt;font-weight:700;color:var(--ink-2);
             margin:4mm 0 1.6mm;break-after:avoid}
  .answer h5,.answer h6{font-family:var(--sans);font-size:9.8pt;font-weight:700;
                        color:var(--ink-2);margin:3mm 0 1.4mm;break-after:avoid}
  .answer p{margin:0 0 .8em}
  .answer ul,.answer ol{margin:0 0 .9em;padding-left:1.5em}
  .answer li{margin:.15em 0}
  .answer blockquote{margin:3mm 0;padding:2mm 0 2mm 5mm;border-left:2px solid var(--line);
                     color:var(--ink-2);font-size:9.8pt}

  /* 채점기준 */
  .rubric{break-before:page}
  .rubric h2{font-family:var(--sans);font-size:11pt;font-weight:800;color:var(--ink-2);
             margin:5mm 0 2.5mm;break-after:avoid}
  table{border-collapse:collapse;width:100%;font-family:var(--sans);font-size:8.9pt;
        line-height:1.62;margin:0 0 5mm}
  thead th{background:var(--accent-soft);color:var(--accent);font-weight:750;
           text-align:left;font-size:8.4pt;letter-spacing:.04em}
  /* ★표 칸은 왼끝맞춤이다. 본문의 양끝맞춤이 그대로 상속되면 좁은 칸에서 낱말 사이가
     벌어져 읽기 어려워진다(쟁점 열이 특히 좁다). */
  th,td{border:1px solid var(--line);padding:2.2mm 2.6mm;vertical-align:top;text-align:left}
  tbody tr{break-inside:avoid}
  /* 배점 열 — 숫자 자리를 맞추고 가운데로. */
  td:nth-child(2),th:nth-child(2){font-variant-numeric:tabular-nums;text-align:center;
                                  white-space:nowrap}

  img{max-width:100%;height:auto;display:block;margin:3mm auto;
      border:1px solid var(--line)}

  .mark{font-size:1px;color:#fff;line-height:1}
`;

/* ── 본문 ─────────────────────────────────────────────────────────────────── */
const chapters = [];
const bodySections = years
  .map((y) => {
    const ys = items.filter((i) => i.year === y).sort((a, b) => a.no - b.no);
    const partList = ys
      .map((it) => {
        const iss = issuesFromRubric(it.rubric, 2).map(trimIssueLabel);
        const summary = iss.length ? iss.join(" · ") : (KIND_LABEL[it.kind] ?? "");
        return `<li><b>제${it.no}문</b><span>${esc(summary)}</span><em>${it.points}점</em></li>`;
      })
      .join("");

    const part = `<section class="part">
  <div class="yr"><small>PART ${years.indexOf(y) + 1}</small>${y}</div>
  <div class="rule"></div>
  <ul>${partList}</ul>
</section>`;

    const arts = ys
      .map((it) => {
        const key = `${it.year}_${it.no}`;
        chapters.push({ key, year: it.year, no: it.no, points: it.points, kind: it.kind });
        const kindTag = KIND_LABEL[it.kind]
          ? `<span class="tag kind">${KIND_LABEL[it.kind]}</span>`
          : "";
        return `<section class="item">
  <div class="item-head">
    <div class="ch-meta">특허법 · 제2차시험 기출<span class="mark">ITEMMARK${key}END</span></div>
    <h1>${it.year}년 제${it.no}문 ${kindTag}<span class="tag">${it.points}점</span></h1>
  </div>
  <p class="q-label">문제</p>
  <div class="qbox">${mdToHtml(it.body)}</div>
  <p class="q-label">모범답안</p>
  <div class="answer">${mdToHtml(normalizeAnswerHeadings(it.answer))}</div>
  <div class="rubric"><p class="q-label">채점기준</p>${mdToHtml(it.rubric)}</div>
</section>`;
      })
      .join("\n");

    return part + "\n" + arts;
  })
  .join("\n");

fs.mkdirSync(TMP, { recursive: true });
fs.writeFileSync(
  path.join(TMP, "body.html"),
  `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>${CSS}</style></head><body>${bodySections}</body></html>`,
  "utf8",
);

/* ── 렌더 ─────────────────────────────────────────────────────────────────── */
const MARGIN = { top: "20mm", bottom: "18mm", left: "24mm", right: "24mm" };
const HEADER = `<div style="width:100%;font-family:'Malgun Gothic',sans-serif;font-size:7.5pt;color:#9a968c;padding:0 24mm;">
  <span style="float:right">특허법 2차 기출 주관식 문제집</span></div>`;
const FOOTER = `<div style="width:100%;font-family:'Malgun Gothic',sans-serif;font-size:9pt;color:#55534c;text-align:center;">
  <span class="pageNumber"></span></div>`;
const BLANK = `<div></div>`;

const browser = await chromium.launch();
const page = await browser.newPage();
async function render(file, opts) {
  await page.goto("file://" + path.join(TMP, file).replace(/\\/g, "/"), {
    waitUntil: "networkidle",
  });
  return page.pdf({ format: "A4", printBackground: true, margin: MARGIN, ...opts });
}

console.log("본문 렌더…");
const bodyPdf = await render("body.html", {
  displayHeaderFooter: true,
  headerTemplate: HEADER,
  footerTemplate: FOOTER,
});

// 표식을 되읽어 문항별 시작 쪽을 찾는다.
// ★1px 글자는 mupdf 가 글리프마다 줄을 나눠 내놓는다 — 공백을 지운 뒤에 맞춰야 한다.
const doc = mupdf.Document.openDocument(bodyPdf, "application/pdf");
const startPage = new Map();
for (let i = 0; i < doc.countPages(); i++) {
  const txt = doc.loadPage(i).toStructuredText().asText().replace(/\s+/g, "");
  for (const m of txt.matchAll(/ITEMMARK(\d{4}_\d)END/g)) {
    if (!startPage.has(m[1])) startPage.set(m[1], i + 1);
  }
}
const bodyPageCount = doc.countPages();
const missing = chapters.filter((c) => !startPage.has(c.key));
if (missing.length) console.log(`  ★쪽번호를 못 찾은 문항 ${missing.length}건`);

/* ── 앞부속 ───────────────────────────────────────────────────────────────── */
// ★차례의 쪽번호는 **책에 인쇄된 쪽번호**와 같아야 한다. 본문 folio 는 1부터 찍히므로
//   앞부속 쪽수를 더하면 안 된다 — 더하면 차례엔 306, 그 쪽엔 300 이 찍혀 못 찾는다.
//   앞부속(표지·일러두기·차례)에 쪽번호를 매기지 않는 것은 단행본의 관례이기도 하다.
function buildFront() {
const tocRows = years
  .map((y) => {
    const ys = chapters.filter((c) => c.year === y);
    const rows = ys
      .map((c) => {
        const p = startPage.get(c.key);
        return `<tr><td class="no">제${c.no}문</td><td class="tt">${
          esc(
            trimIssueLabel(
              issuesFromRubric(items.find((i) => i.year === c.year && i.no === c.no).rubric, 1)[0] ?? "",
            ),
          )
        }</td><td class="pt">${c.points}점</td><td class="pg">${p ?? "—"}</td></tr>`;
      })
      .join("");
    return `<tbody class="yr-group"><tr class="yr"><td colspan="4">${y}년</td></tr>${rows}</tbody>`;
  })
  .join("");

const frontHtml = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>${CSS}
  /* 제목을 위에서 1/3 지점에 두고 아래를 비운다 — 가운데를 텅 비우면 무너져 보인다. */
  .cover{height:257mm;display:flex;flex-direction:column;padding:26mm 0 6mm}
  .cover .fill{flex:1}
  /* ★한글은 자간을 넓히면 낱자가 흩어진다. 로마자 기준 letter-spacing 을 그대로 쓰지 않는다. */
  .cover .kicker{font-family:var(--sans);font-size:9.5pt;font-weight:700;letter-spacing:.08em;
                 color:var(--accent)}
  .cover h1{font-family:var(--sans);font-size:40pt;font-weight:800;line-height:1.18;
            letter-spacing:-.035em;margin:0}
  .cover h1 em{font-style:normal;display:block;font-size:19pt;font-weight:700;
               color:var(--ink-3);letter-spacing:-.01em;margin-top:5mm}
  .cover .bar{height:3px;background:var(--accent);width:52mm;margin:9mm 0}
  .cover .meta{font-family:var(--sans);font-size:9.5pt;color:var(--ink-2);line-height:2}
  .cover .brand{font-family:var(--sans);font-size:12pt;font-weight:800;color:var(--accent)}
  .note{break-before:page}
  .note h2{font-family:var(--sans);font-size:15pt;font-weight:800;margin:0 0 6mm;color:var(--accent)}
  .note h3{font-family:var(--sans);font-size:10.6pt;font-weight:750;margin:6mm 0 1.6mm}
  .note p,.note li{font-size:10pt;line-height:1.9}
  .note ul{padding-left:1.4em;margin:0 0 3mm}
  .toc{break-before:page}
  .toc h2{font-family:var(--sans);font-size:15pt;font-weight:800;margin:0 0 6mm;color:var(--accent)}
  .toc table{font-family:var(--sans);font-size:9.4pt;border-collapse:collapse;width:100%}
  .toc td{border:0;border-bottom:1px solid var(--line-2);padding:2.1mm 1mm;vertical-align:baseline}
  .toc tr.yr td{font-size:11pt;font-weight:800;color:var(--accent);border-bottom:1.6px solid var(--accent);
                padding-top:6mm;letter-spacing:-.01em}
  .toc td.no{width:15mm;font-weight:700;color:var(--ink-2)}
  .toc td.tt{color:var(--ink-2)}
  .toc td.pt{width:13mm;text-align:right;color:var(--pts);font-weight:700;font-size:8.6pt}
  .toc td.pg{width:13mm;text-align:right;font-variant-numeric:tabular-nums;font-weight:700}
</style></head><body>
<section class="cover">
  <div>
    <div class="kicker">리담변리사학원</div>
    <div class="bar"></div>
    <h1>특허법<br>2차 기출 주관식<em>문제 · 모범답안 · 채점기준</em></h1>
  </div>
  <div class="fill"></div>
  <div>
    <div class="meta">
      ${years[0]}년 ~ ${years[years.length - 1]}년 · 전 ${items.length}문항<br>
      변리사 제2차시험 특허법
    </div>
    <div class="bar" style="width:24mm;margin:6mm 0 4mm"></div>
    <div class="brand">리담변리사학원</div>
  </div>
</section>

<section class="note">
  <h2>일러두기</h2>
  <h3>1. 무엇을 담았는가</h3>
  <p>변리사 제2차시험 특허법 기출문제 ${items.length}문항(${years[0]}~${years[years.length - 1]})을
  <strong>문제 · 모범답안 · 채점기준</strong> 세 벌로 실었다. 학습 플랫폼에 수록된 것과 같은 내용이며,
  종이로 통독할 수 있도록 다시 짠 것이다.</p>

  <h3>2. 현행법으로 푼다</h3>
  <p>기출이라도 <strong>출제 당시의 법이 아니라 현행법을 적용</strong>해 풀이했다. 수험생이 대비하는
  시험은 현행법으로 출제되기 때문이다. 따라서 부칙(시행일·적용례·경과조치)은 다루지 않으며,
  발문이 구법 조문을 인용한 경우에만 현행 조문과의 대응관계를 밝혔다.</p>

  <h3>3. 채점기준을 함께 읽는다</h3>
  <p>각 문항의 채점기준은 배점이 어디에 붙는지를 쟁점 단위로 밝힌 표다. 답안을 먼저 써 본 뒤
  채점기준으로 자기 답안을 대조하면, 모범답안을 눈으로 좇는 것보다 빠르게 배점 감각이 붙는다.
  분량은 <strong>배점 1점당 200자</strong>를 상한으로 삼았다.</p>

  <h3>4. 인용에 관하여</h3>
  <p>판례 사건번호는 학원 데이터베이스와 교재에서 확인된 것만 실었다. 확인되지 않은 번호는
  적지 않고 법리만 서술했다.</p>

  <h3>5. 표기</h3>
  <ul>
    <li>조문은 「특허법」을 기준으로 하며 다른 법률은 법명을 함께 적었다.</li>
    <li>문항 머리의 <strong>사례형 · 약술형</strong>은 출제 형식, 오른쪽 숫자는 배점이다.</li>
  </ul>
</section>

<section class="toc">
  <h2>차례</h2>
  <table>${tocRows}</table>
</section>
</body></html>`;
  return frontHtml;
}

fs.writeFileSync(path.join(TMP, "front.html"), buildFront(), "utf8");
console.log("앞부속 렌더…");
const frontPdf = await render("front.html", {
  displayHeaderFooter: true,
  headerTemplate: BLANK,
  footerTemplate: BLANK,
});
const frontCount = (await PDFDocument.load(frontPdf)).getPageCount();
await browser.close();

/* ── 병합 ─────────────────────────────────────────────────────────────────── */
const out = await PDFDocument.create();
for (const buf of [frontPdf, bodyPdf]) {
  const src = await PDFDocument.load(buf);
  const pages = await out.copyPages(src, src.getPageIndices());
  for (const p of pages) out.addPage(p);
}
out.setTitle("특허법 2차 기출 주관식 문제집");
out.setAuthor("리담변리사학원");
fs.mkdirSync(path.dirname(OUT_PDF), { recursive: true });
fs.writeFileSync(OUT_PDF, await out.save());

console.log(
  `\n${OUT_PDF}\n  ${frontCount + bodyPageCount}쪽 (앞부속 ${frontCount} + 본문 ${bodyPageCount}) · ` +
    `${(fs.statSync(OUT_PDF).size / 1024 / 1024).toFixed(2)}MB`,
);
