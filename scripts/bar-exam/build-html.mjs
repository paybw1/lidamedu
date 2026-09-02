// 기출 자료집 → 웹 페이지(아티팩트용 HTML).
//
// 입력은 build-collection.mjs 가 남긴 JSON 하나뿐이다 — 마크다운과 웹이 서로 다른
// 파싱을 하면 언젠가 어긋나므로, 파싱은 한 곳에서만 한다.
//
// ★외부 리소스를 쓰지 않는다(아티팩트 CSP 가 전부 막는다). 한글 웹폰트는 파일이
//   수 MB 라 data URI 로 심을 것이 못 되므로 **시스템 글꼴 스택**으로 간다.
//
//   node scripts/bar-exam/build-html.mjs <데이터.json> <출력.html>
import fs from "node:fs";
import path from "node:path";

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const [, , dataFile, outFile] = process.argv;
if (!dataFile || !outFile) {
  console.error("사용: node scripts/bar-exam/build-html.mjs <데이터.json> <출력.html>");
  process.exit(1);
}
const { rounds, topics, laws } = JSON.parse(fs.readFileSync(dataFile, "utf8"));
const desc = [...rounds].reverse();

/** 배점을 칩으로 뽑아내고 나머지 문장은 그대로 둔다. */
function askedHtml(line) {
  const num = line.match(/^(\d+\s*\.|\(\d+\)|[가-힣]\.)/);
  const body = num ? line.slice(num[0].length).trim() : line;
  const chips = [...line.matchAll(/\(\s*(\d+)\s*점\s*\)/g)].map((m) => m[1]);
  const text = body.replace(/\(\s*\d+\s*점\s*\)/g, "").replace(/\s{2,}/g, " ").trim();
  return (
    `<li class="ask${num && /^\(|^[가-힣]\./.test(num[0]) ? " sub" : ""}">` +
    (num ? `<span class="n">${esc(num[0].replace(/\s/g, ""))}</span>` : "") +
    `<span class="t">${esc(text)}</span>` +
    chips.map((c) => `<span class="pt">${c}점</span>`).join("") +
    `</li>`
  );
}

const areaClass = (a) => (a === "특허법" ? "pat" : a === "저작권법" ? "cop" : "etc");

// ── 본문 ────────────────────────────────────────────────────────────────
const body = [];

body.push(`<header class="hero">
  <p class="eyebrow">법무부 공개 기출 · 공공누리 제1유형</p>
  <h1>변호사시험 선택과목<br><em>지적재산권법</em> 기출 자료집</h1>
  <p class="lede">제1회(2012)부터 제15회(2026)까지 전 15회차, 사례형 30문. 문제 원문은
  법무부 문제지 그대로이고, 설문이 지목한 조문은 현행 원문을 함께 실었습니다.</p>
  <div class="stats">
    <div><b>15</b><span>회차</span></div>
    <div><b>30</b><span>문</span></div>
    <div><b>${rounds.reduce((a, r) => a + r.qs.reduce((x, q) => x + q.asked.filter((l) => /\(\s*\d+\s*점/.test(l)).length, 0), 0)}</b><span>설문</span></div>
    <div><b>${Object.values(laws).reduce((a, l) => a + Object.keys(l.articles).length, 0)}</b><span>인용 조문</span></div>
  </div>
</header>`);

body.push(`<section class="note" id="about">
  <h2>이 자료집을 읽기 전에</h2>
  <p><b>이 시험에는 공식 해설이 없습니다.</b> 법무부는 사례형의 채점기준표와 모범답안을
  공개하지 않습니다. 그래서 이 자료집은 근거를 댈 수 있는 것만 실었습니다 —
  ① 문제 원문, ② 설문이 스스로 지목한 조문의 현행 원문, ③ 원문에서 센 논점 빈도.</p>
  <p>요건 목록·학설 대립·「판례의 태도」 같은 서술과 사건번호는 <b>넣지 않았습니다.</b>
  근거 없이 그럴듯하게 써 두면 그대로 잘못 외우게 되기 때문입니다.</p>
  <p class="fine">조문은 현행법 기준입니다. 기출이라도 현행법으로 푸는 것이 수험 목적에 맞고,
  출제 당시와 조문이 달라진 경우는 그 자체가 학습 포인트입니다.</p>
</section>`);

// 한눈에 보기
body.push(`<section id="overview"><h2>한눈에 보기</h2>
<p class="sub">전 회차가 <b>제1문 특허법 · 제2문 저작권법</b>, 각 80점 구조입니다.</p>
<div class="scroll"><table class="grid">
<thead><tr><th>회차</th><th>연도</th><th>제1문</th><th>제2문</th><th class="num">설문</th><th>설문이 지목한 조문</th></tr></thead><tbody>`);
for (const r of rounds) {
  const a1 = r.qs.filter((q) => q.main === 1)[0]?.area ?? "—";
  const a2 = r.qs.filter((q) => q.main === 2)[0]?.area ?? "—";
  const nSub = r.qs.reduce((a, q) => a + q.asked.filter((l) => /\(\s*\d+\s*점/.test(l)).length, 0);
  const byLaw = [...new Set(r.cites.map((c) => c.law))].map((law) => {
    const arts = r.cites.filter((c) => c.law === law)
      .map((c) => (/^\d+의\d+$/.test(c.article) ? `제${c.article.replace("의", "조의")}` : `제${c.article}조`));
    return `<span class="cite"><b>${esc(law)}</b> ${esc(arts.join("·"))}</span>`;
  }).join(" ");
  body.push(`<tr><td><a href="#r${r.round}">제${r.round}회</a></td><td>${r.year}</td>
  <td><span class="tag ${areaClass(a1)}">${esc(a1)}</span></td>
  <td><span class="tag ${areaClass(a2)}">${esc(a2)}</span></td>
  <td class="num">${nSub}</td><td>${byLaw || "—"}</td></tr>`);
}
body.push(`</tbody></table></div></section>`);

// 논점 빈도
body.push(`<section id="topics"><h2>출제 논점 빈도</h2>
<p class="sub">문제 원문의 <b>설문</b>에 실제로 등장한 표현을 센 것입니다. 법리를 해설한 것이
아니라 어떤 말이 몇 번 나왔는지의 집계이니, 반복되는 논점을 보는 용도로만 쓰세요.</p>
<ul class="topics">`);
const maxHits = Math.max(...topics.map((t) => t.hits.length));
for (const t of topics) {
  body.push(`<li class="${areaClass(t.law)}">
    <span class="tl"><span class="tag ${areaClass(t.law)}">${esc(t.law)}</span> ${esc(t.name)}</span>
    <span class="bar"><i style="width:${(t.hits.length / maxHits) * 100}%"></i></span>
    <span class="cnt">${t.hits.length}회</span>
    <span class="rounds">${t.hits.map((h) => `<a href="#r${h}">${h}</a>`).join("")}</span>
  </li>`);
}
body.push(`</ul></section>`);

// 회차별
body.push(`<section id="rounds"><h2>회차별 기출</h2>`);
for (const r of desc) {
  body.push(`<article class="round" id="r${r.round}">
    <h3><span class="rn">제${r.round}회</span><span class="ry">${r.year}년 시행</span></h3>`);
  for (const q of r.qs) {
    body.push(`<div class="q ${areaClass(q.area)}">
      <div class="qh"><span class="ql">${esc(q.label)}</span>
        <span class="tag ${areaClass(q.area)}">${esc(q.area)}</span>
        <span class="pts">${q.points}점</span></div>`);
    if (q.facts.length) {
      body.push(`<div class="facts"><h4>사실관계</h4>` +
        q.facts.map((p) => `<p>${esc(p)}</p>`).join("") + `</div>`);
    }
    if (q.asked.length) {
      body.push(`<div class="asked"><h4>설문</h4><ul>` +
        q.asked.map(askedHtml).join("") + `</ul></div>`);
    }
    if (q.cites.length) {
      body.push(`<p class="qcite">설문이 지목한 조문 · ` +
        q.cites.map((c) => {
          const lbl = /^\d+의\d+$/.test(c.article) ? `제${c.article.replace("의", "조의")}` : `제${c.article}조`;
          return `<a href="#a-${esc(c.law)}-${esc(c.article)}">${esc(c.law)} ${esc(lbl)}</a>`;
        }).join(", ") + `</p>`);
    }
    body.push(`</div>`);
  }
  body.push(`</article>`);
}
body.push(`</section>`);

// 부록
body.push(`<section id="appendix"><h2>부록 · 인용 조문 원문</h2>
<p class="sub">설문이 직접 지목한 조문만 실었습니다. 국가법령정보센터 현행 조문 그대로입니다.</p>`);
for (const [law, data] of Object.entries(laws)) {
  const d = String(data.enforcedAt ?? "");
  const ymd = /^\d{8}$/.test(d) ? `${d.slice(0, 4)}. ${d.slice(4, 6)}. ${d.slice(6)}. 시행` : "";
  body.push(`<h3 class="lawh">${esc(law)} <span class="fine">${ymd}</span></h3>`);
  for (const [num, text] of Object.entries(data.articles)) {
    const lbl = /^\d+의\d+$/.test(num) ? `제${num.replace("의", "조의")}` : `제${num}조`;
    const title = text.match(/^제[^(]*\(([^)]+)\)/)?.[1] ?? "";
    body.push(`<details class="art" id="a-${esc(law)}-${esc(num)}">
      <summary><b>${esc(lbl)}</b>${title ? ` <span class="at">${esc(title)}</span>` : ""}</summary>
      <pre>${esc(text)}</pre></details>`);
  }
}
body.push(`</section>`);

body.push(`<footer><p>문제 원문 © 법무부 · 공공누리 제1유형(출처표시). 조문 원문: 국가법령정보센터.</p>
<p class="fine">리담변리사학원 내부 학습자료.</p></footer>`);

// ── 페이지 ──────────────────────────────────────────────────────────────
const toc = desc.map((r) => `<a href="#r${r.round}"><b>제${r.round}회</b><span>${r.year}</span></a>`).join("");

const html = `<title>변호사시험 지적재산권법 기출 자료집 (제1~15회)</title>
<style>
:root{
  --paper:#fcfcfd; --card:#fff; --ink:#171a20; --dim:#5c6373; --line:#e3e5ea;
  --accent:#23406e; --pat:#1d5a55; --cop:#6d3557; --chip:#f1f2f5; --pre:#f7f8fa;
  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI","Malgun Gothic","맑은 고딕",sans-serif;
  --serif:"Noto Serif KR","Nanum Myeongjo",Batang,"바탕",Georgia,serif;
}
@media (prefers-color-scheme:dark){:root{
  --paper:#14161b; --card:#1b1e25; --ink:#e6e8ee; --dim:#9aa2b2; --line:#2b303a;
  --accent:#8fb0e6; --pat:#63b8b0; --cop:#c98cb4; --chip:#242832; --pre:#1f232b;
}}
:root[data-theme="dark"]{
  --paper:#14161b; --card:#1b1e25; --ink:#e6e8ee; --dim:#9aa2b2; --line:#2b303a;
  --accent:#8fb0e6; --pat:#63b8b0; --cop:#c98cb4; --chip:#242832; --pre:#1f232b;
}
:root[data-theme="light"]{
  --paper:#fcfcfd; --card:#fff; --ink:#171a20; --dim:#5c6373; --line:#e3e5ea;
  --accent:#23406e; --pat:#1d5a55; --cop:#6d3557; --chip:#f1f2f5; --pre:#f7f8fa;
}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans);
  font-size:16px;line-height:1.65;-webkit-text-size-adjust:100%}
.wrap{display:grid;grid-template-columns:190px minmax(0,1fr);gap:44px;
  max-width:1180px;margin:0 auto;padding:0 24px 80px}
@media(max-width:900px){.wrap{grid-template-columns:1fr;gap:0}}
nav.toc{position:sticky;top:0;align-self:start;max-height:100vh;overflow:auto;
  padding:28px 0;font-size:13px}
@media(max-width:900px){nav.toc{position:static;max-height:none;
  border-bottom:1px solid var(--line);margin-bottom:8px}
  nav.toc .rl{display:flex;flex-wrap:wrap;gap:6px}}
nav.toc h6{margin:18px 0 8px;font-size:11px;letter-spacing:.09em;text-transform:uppercase;
  color:var(--dim);font-weight:600}
nav.toc a{display:flex;justify-content:space-between;gap:8px;padding:4px 8px;border-radius:6px;
  color:var(--dim);text-decoration:none}
nav.toc a:hover{background:var(--chip);color:var(--ink)}
nav.toc a b{font-weight:600}
nav.toc .jump a{display:block}
main{padding-top:28px;min-width:0}
h1{font-family:var(--serif);font-size:clamp(28px,4.4vw,42px);line-height:1.25;
  margin:.25em 0 .45em;font-weight:700;text-wrap:balance;letter-spacing:-.01em}
h1 em{font-style:normal;color:var(--accent)}
h2{font-family:var(--serif);font-size:24px;margin:56px 0 6px;letter-spacing:-.01em}
h3{font-size:18px;margin:38px 0 10px}
h4{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);
  margin:0 0 8px;font-weight:600}
.eyebrow{font-size:12px;letter-spacing:.09em;color:var(--dim);margin:0;font-weight:600}
.lede{font-size:17px;color:var(--dim);max-width:60ch;margin:0 0 22px}
.sub{color:var(--dim);font-size:14.5px;max-width:66ch;margin:2px 0 16px}
.fine{font-size:13px;color:var(--dim)}
.hero{padding-bottom:8px;border-bottom:1px solid var(--line)}
.stats{display:flex;gap:28px;flex-wrap:wrap;padding:14px 0 22px}
.stats div{display:flex;flex-direction:column}
.stats b{font-size:26px;font-variant-numeric:tabular-nums;line-height:1.1}
.stats span{font-size:12px;color:var(--dim)}
.note{background:var(--card);border:1px solid var(--line);border-left:3px solid var(--accent);
  border-radius:8px;padding:18px 22px;margin:26px 0}
.note h2{margin:0 0 8px;font-size:18px}
.note p{margin:0 0 8px;font-size:14.5px;color:var(--dim);max-width:70ch}
.note p b{color:var(--ink)}
.scroll{overflow-x:auto}
table.grid{border-collapse:collapse;width:100%;font-size:14px;min-width:640px}
table.grid th,table.grid td{border-bottom:1px solid var(--line);padding:9px 10px;text-align:left;
  vertical-align:top}
table.grid th{font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--dim);
  font-weight:600;white-space:nowrap}
table.grid td a{color:var(--accent);font-weight:600;text-decoration:none}
table.grid .num{text-align:right;font-variant-numeric:tabular-nums}
.cite{display:inline-block;margin:1px 6px 1px 0;font-size:12.5px;color:var(--dim)}
.cite b{color:var(--ink);font-weight:600}
.tag{display:inline-block;font-size:11.5px;padding:1px 7px;border-radius:999px;
  border:1px solid currentColor;font-weight:600;white-space:nowrap}
.pat{color:var(--pat)} .cop{color:var(--cop)} .etc{color:var(--dim)}
ul.topics{list-style:none;padding:0;margin:0}
ul.topics li{display:grid;grid-template-columns:minmax(190px,1fr) 90px 42px auto;gap:12px;
  align-items:center;padding:7px 0;border-bottom:1px solid var(--line);font-size:14px}
@media(max-width:700px){ul.topics li{grid-template-columns:1fr auto;gap:6px}
  ul.topics .bar{display:none}}
ul.topics .tl{color:var(--ink)}
.bar{background:var(--chip);height:6px;border-radius:99px;overflow:hidden}
.bar i{display:block;height:100%;background:currentColor;border-radius:99px;opacity:.75}
.cnt{font-variant-numeric:tabular-nums;color:var(--dim);font-size:13px;text-align:right}
.rounds{display:flex;gap:3px;flex-wrap:wrap}
.rounds a{font-size:11.5px;color:var(--dim);text-decoration:none;background:var(--chip);
  border-radius:4px;padding:1px 5px;font-variant-numeric:tabular-nums}
.rounds a:hover{color:var(--ink)}
.round{margin:0 0 10px;padding-top:14px}
.round h3{display:flex;align-items:baseline;gap:10px;position:sticky;top:0;z-index:2;
  background:var(--paper);padding:10px 0 8px;margin:26px 0 0;border-bottom:1px solid var(--line)}
.rn{font-family:var(--serif);font-size:22px;font-weight:700}
.ry{font-size:13px;color:var(--dim)}
.q{background:var(--card);border:1px solid var(--line);border-radius:10px;
  padding:18px 20px;margin:16px 0}
.qh{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-bottom:14px}
.ql{font-weight:700;font-size:15px}
.pts{margin-left:auto;font-size:12.5px;color:var(--dim);font-variant-numeric:tabular-nums}
.facts p{font-family:var(--serif);font-size:16.5px;line-height:1.85;margin:0 0 12px;
  max-width:68ch;text-align:justify;word-break:keep-all}
.asked{margin-top:18px;padding-top:14px;border-top:1px dashed var(--line)}
.asked ul{list-style:none;padding:0;margin:0}
li.ask{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:9px;align-items:baseline;
  padding:7px 0;border-bottom:1px solid var(--line)}
li.ask:last-child{border-bottom:0}
li.ask.sub{padding-left:20px}
li.ask .n{font-weight:700;font-size:13px;color:var(--accent);font-variant-numeric:tabular-nums}
li.ask .t{font-family:var(--serif);font-size:15.5px;line-height:1.8;word-break:keep-all}
li.ask .pt{font-size:11.5px;color:var(--dim);background:var(--chip);border-radius:4px;
  padding:1px 6px;white-space:nowrap;font-variant-numeric:tabular-nums}
.qcite{margin:14px 0 0;font-size:13px;color:var(--dim)}
.qcite a{color:var(--accent);text-decoration:none;border-bottom:1px solid transparent}
.qcite a:hover{border-bottom-color:currentColor}
.lawh{margin-top:34px;font-family:var(--serif)}
details.art{border:1px solid var(--line);border-radius:8px;margin:7px 0;background:var(--card)}
details.art summary{cursor:pointer;padding:9px 14px;font-size:14px;list-style:none}
details.art summary::-webkit-details-marker{display:none}
details.art summary::before{content:"▸";color:var(--dim);margin-right:8px;font-size:11px}
details.art[open] summary::before{content:"▾"}
details.art .at{color:var(--dim);font-size:13px}
details.art pre{margin:0;padding:0 16px 14px 32px;white-space:pre-wrap;word-break:keep-all;
  font-family:var(--serif);font-size:14.5px;line-height:1.8;color:var(--ink);background:var(--pre)}
footer{margin-top:60px;padding-top:20px;border-top:1px solid var(--line);
  font-size:13px;color:var(--dim)}
footer p{margin:0 0 4px}
a:focus-visible,summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
@media print{nav.toc{display:none}.wrap{grid-template-columns:1fr}
  details.art{break-inside:avoid}details.art[open] pre{background:transparent}
  .round h3{position:static}}
</style>
<div class="wrap">
<nav class="toc">
  <h6>목차</h6>
  <div class="jump">
    <a href="#about"><b>읽기 전에</b></a>
    <a href="#overview"><b>한눈에 보기</b></a>
    <a href="#topics"><b>논점 빈도</b></a>
    <a href="#appendix"><b>조문 부록</b></a>
  </div>
  <h6>회차</h6>
  <div class="rl">${toc}</div>
</nav>
<main>
${body.join("\n")}
</main>
</div>`;

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, html, "utf8");
console.log(`웹 자료집: ${outFile} (${(html.length / 1024).toFixed(0)}KB)`);
