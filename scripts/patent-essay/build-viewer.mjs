// 특허법 2차 기출 주관식 뷰어 — 문제 / 모범답안 / 채점기준을 나란히 본다.
// 출력: docs/patent-essay/뷰어-특허법-주관식.html (아티팩트로 게시)
//
//   node scripts/patent-essay/export.mjs && node scripts/patent-essay/build-viewer.mjs
import fs from "node:fs";
import path from "node:path";

import { esc, issuesFromRubric, mdToHtml, normalizeAnswerHeadings } from "./render.mjs";

const DATA = "tmp/patent-essay/data.json";
const OUT = "docs/patent-essay/뷰어-특허법-주관식.html";

const items = JSON.parse(fs.readFileSync(DATA, "utf8"));
const years = [...new Set(items.map((i) => i.year))].sort((a, b) => b - a); // 최신 연도 먼저

const KIND_LABEL = { case_based: "사례형", theory: "약술형" };

const firstNoOfLatest = Math.min(...items.filter((i) => i.year === years[0]).map((i) => i.no));
const panes = items
  .map((it) => {
    const issues = issuesFromRubric(it.rubric, 5);
    const chips = issues
      .map((s) => `<li>${esc(s)}</li>`)
      .join("");
    const first = it.year === years[0] && it.no === firstNoOfLatest;
    return `<section class="item" data-year="${it.year}" data-no="${it.no}"${first ? "" : " hidden"}>
  <div class="cols">
    <article class="pane q">
      <div class="pane-head"><h2>문제</h2><span class="pts">${it.points}점</span></div>
      <div class="md serif">${mdToHtml(it.body)}</div>
      ${issues.length ? `<div class="issues"><h3>채점 쟁점</h3><ol>${chips}</ol></div>` : ""}
    </article>
    <article class="pane a">
      <div class="pane-head">
        <div class="seg answer-seg" role="tablist">
          <button type="button" class="on" data-tab="answer">모범답안</button>
          <button type="button" data-tab="rubric">채점기준</button>
        </div>
      </div>
      <div class="md serif tab" data-tab="answer">${mdToHtml(normalizeAnswerHeadings(it.answer))}</div>
      <div class="md tab" data-tab="rubric" hidden>${mdToHtml(it.rubric)}</div>
    </article>
  </div>
</section>`;
  })
  .join("\n");

const yearTabs = years
  .map((y, i) => `<button type="button" data-year="${y}"${i === 0 ? ' class="on"' : ""}>${y}</button>`)
  .join("");

const noTabsByYear = years
  .map((y) => {
    const ys = items.filter((i) => i.year === y).sort((a, b) => a.no - b.no);
    const btns = ys
      .map(
        (it, i) =>
          `<button type="button" data-no="${it.no}"${i === 0 ? ' class="on"' : ""}>제${it.no}문<em>${it.points}점 · ${KIND_LABEL[it.kind] ?? ""}</em></button>`,
      )
      .join("");
    return `<div class="nos" data-year="${y}"${y === years[0] ? "" : " hidden"}>${btns}</div>`;
  })
  .join("");

const html = `<title>특허법 2차 기출 주관식 — 문제·모범답안·채점기준</title>
<style>
  :root{
    --sans:"Pretendard","Apple SD Gothic Neo",-apple-system,"Segoe UI","맑은 고딕","Malgun Gothic",sans-serif;
    --serif:"Noto Serif KR","바탕","Batang","Apple SD Gothic Neo",serif;
    --paper:#faf9f6; --card:#fffefb; --ink:#1c1b17; --ink-2:#4c4a43; --ink-3:#84817a;
    --line:#e2ded4; --line-2:#efece4;
    --accent:#24466e; --accent-soft:#e8eef6; --accent-ink:#1a3554;
    --pts:#8c3a2b; --pts-soft:#f7ece9;
  }
  @media (prefers-color-scheme:dark){
    :root{
      --paper:#14150f; --card:#1b1c16; --ink:#e9e7de; --ink-2:#b0ada2; --ink-3:#7f7c73;
      --line:#33342b; --line-2:#26271f;
      --accent:#8fb3dd; --accent-soft:#1e2733; --accent-ink:#b7cfec;
      --pts:#dd9a8a; --pts-soft:#2c211d;
    }
  }
  :root[data-theme="dark"]{
    --paper:#14150f; --card:#1b1c16; --ink:#e9e7de; --ink-2:#b0ada2; --ink-3:#7f7c73;
    --line:#33342b; --line-2:#26271f;
    --accent:#8fb3dd; --accent-soft:#1e2733; --accent-ink:#b7cfec;
    --pts:#dd9a8a; --pts-soft:#2c211d;
  }
  :root[data-theme="light"]{
    --paper:#faf9f6; --card:#fffefb; --ink:#1c1b17; --ink-2:#4c4a43; --ink-3:#84817a;
    --line:#e2ded4; --line-2:#efece4;
    --accent:#24466e; --accent-soft:#e8eef6; --accent-ink:#1a3554;
    --pts:#8c3a2b; --pts-soft:#f7ece9;
  }

  *{box-sizing:border-box}
  /* ★hidden 속성은 브라우저 기본 스타일(display:none)로 동작한다. 작성자 규칙에
     display 를 주면 그쪽이 이겨서 숨김이 풀린다 — .nos 가 display:flex 라 연도 줄이
     17개 전부 펼쳐졌고, 그 아래로 본문이 화면 밖으로 밀려났다. */
  [hidden]{display:none !important}
  body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans);
       font-size:15px;line-height:1.7;-webkit-font-smoothing:antialiased}

  header.top{position:sticky;top:0;z-index:20;background:var(--paper);
             border-bottom:1px solid var(--line);padding:12px 20px 0}
  .brand{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:10px}
  .brand h1{margin:0;font-size:17px;font-weight:800;letter-spacing:-.02em}
  .brand .sub{font-size:12px;color:var(--ink-3)}
  .years{display:flex;gap:2px;overflow-x:auto;padding-bottom:2px;scrollbar-width:thin}
  .years button{flex:0 0 auto;border:0;background:transparent;color:var(--ink-3);
    font:600 13px/1 var(--sans);padding:8px 11px;border-radius:7px 7px 0 0;cursor:pointer;
    border-bottom:2px solid transparent}
  .years button:hover{color:var(--ink-2)}
  .years button.on{color:var(--accent-ink);border-bottom-color:var(--accent);background:var(--accent-soft)}
  .nos{display:flex;gap:6px;flex-wrap:wrap;padding:10px 0}
  .nos button{border:1px solid var(--line);background:var(--card);color:var(--ink-2);
    border-radius:9px;padding:6px 12px;cursor:pointer;font:650 13px/1.35 var(--sans);
    display:flex;flex-direction:column;gap:2px;align-items:flex-start}
  .nos button em{font-style:normal;font-size:10.5px;font-weight:500;color:var(--ink-3);letter-spacing:.01em}
  .nos button.on{border-color:var(--accent);background:var(--accent-soft);color:var(--accent-ink)}
  .nos button.on em{color:var(--accent-ink);opacity:.75}

  main{padding:18px 20px 64px}
  .cols{display:grid;gap:16px;grid-template-columns:1fr;align-items:start}
  @media (min-width:860px){ .cols{grid-template-columns:41fr 59fr} }
  .pane{background:var(--card);border:1px solid var(--line);border-radius:14px;
        padding:20px 22px;min-width:0}
  @media (min-width:860px){ .pane{position:sticky;top:118px;max-height:calc(100vh - 140px);overflow-y:auto} }
  .pane-head{display:flex;align-items:center;justify-content:space-between;gap:12px;
             margin:-4px 0 12px;padding-bottom:10px;border-bottom:1px solid var(--line-2)}
  .pane-head h2{margin:0;font-size:12px;font-weight:800;letter-spacing:.1em;color:var(--ink-3)}
  .pts{font:700 12px/1 var(--sans);color:var(--pts);background:var(--pts-soft);
       padding:5px 9px;border-radius:20px}
  .seg{display:flex;gap:2px;background:var(--line-2);padding:3px;border-radius:9px}
  .seg button{border:0;background:transparent;color:var(--ink-3);cursor:pointer;
    font:650 12.5px/1 var(--sans);padding:7px 14px;border-radius:7px}
  .seg button.on{background:var(--card);color:var(--ink);box-shadow:0 1px 2px rgba(0,0,0,.1)}

  .md{font-size:14.5px;line-height:1.95;color:var(--ink)}
  .md.serif{font-family:var(--serif);font-size:15.5px;line-height:2.0}
  .md>*:first-child{margin-top:0}
  .md p{margin:0 0 .95em}
  .md h2{font-family:var(--sans);font-size:15px;font-weight:800;margin:1.9em 0 .6em;
         color:var(--accent-ink);padding-bottom:.3em;border-bottom:1px solid var(--line)}
  .md h3{font-family:var(--sans);font-size:14px;font-weight:750;margin:1.5em 0 .45em}
  .md h4{font-family:var(--sans);font-size:13.2px;font-weight:700;margin:1.2em 0 .35em;color:var(--ink-2)}
  .md h5,.md h6{font-family:var(--sans);font-size:12.6px;font-weight:700;margin:1em 0 .3em;color:var(--ink-2)}
  .md strong{font-family:var(--sans);font-weight:700}
  .md ul,.md ol{margin:0 0 .95em;padding-left:1.4em}
  .md li{margin:.2em 0}
  .md blockquote{margin:1em 0;padding:.5em 0 .5em 1em;border-left:3px solid var(--line);color:var(--ink-2)}
  .md img{max-width:100%;height:auto;border:1px solid var(--line);border-radius:6px;margin:.6em 0;background:#fff}
  .md table{border-collapse:collapse;width:100%;font-family:var(--sans);font-size:12.8px;line-height:1.6}
  .md thead th{background:var(--line-2);font-weight:750;text-align:left}
  .md th,.md td{border:1px solid var(--line);padding:7px 9px;vertical-align:top}
  .md td:nth-child(2){white-space:nowrap}
  .md .tablewrap,.md div{max-width:100%}
  .md table{display:block;overflow-x:auto}
  @media (min-width:700px){ .md table{display:table} }

  .issues{margin-top:22px;padding-top:16px;border-top:1px dashed var(--line)}
  .issues h3{margin:0 0 8px;font-size:11px;font-weight:800;letter-spacing:.1em;color:var(--ink-3)}
  .issues ol{margin:0;padding-left:1.3em;font-size:13px;line-height:1.65;color:var(--ink-2)}
  .issues li{margin:.35em 0}

  footer{padding:0 20px 40px;color:var(--ink-3);font-size:11.5px}
</style>

<header class="top">
  <div class="brand">
    <h1>특허법 2차 기출 주관식</h1>
    <span class="sub">${items.length}문항 · ${years[years.length - 1]}~${years[0]} · 문제 · 모범답안 · 채점기준</span>
  </div>
  <div class="years">${yearTabs}</div>
  ${noTabsByYear}
</header>

<main>${panes}</main>

<footer>리담변리사학원 · 학습 플랫폼 데이터에서 생성 · 모범답안과 채점기준은 학원 편집물입니다.</footer>

<script>
(function(){
  var years = document.querySelector('.years');
  var noRows = Array.prototype.slice.call(document.querySelectorAll('.nos'));
  var items = Array.prototype.slice.call(document.querySelectorAll('.item'));
  var cur = { year: ${years[0]}, no: 1 };

  function show(){
    items.forEach(function(el){
      el.hidden = !(Number(el.dataset.year) === cur.year && Number(el.dataset.no) === cur.no);
    });
    // 문항을 바꾸면 위에서부터 읽는다.
    document.querySelectorAll('.pane').forEach(function(p){ p.scrollTop = 0; });
  }
  function setYear(y){
    cur.year = y;
    Array.prototype.forEach.call(years.children, function(b){
      b.classList.toggle('on', Number(b.dataset.year) === y);
    });
    noRows.forEach(function(r){ r.hidden = Number(r.dataset.year) !== y; });
    var row = noRows.filter(function(r){ return Number(r.dataset.year) === y; })[0];
    var first = row ? row.querySelector('button') : null;
    cur.no = first ? Number(first.dataset.no) : 1;
    if (row) Array.prototype.forEach.call(row.children, function(b, i){ b.classList.toggle('on', i === 0); });
    show();
  }
  years.addEventListener('click', function(e){
    var b = e.target.closest('button'); if (!b) return;
    setYear(Number(b.dataset.year));
  });
  noRows.forEach(function(row){
    row.addEventListener('click', function(e){
      var b = e.target.closest('button'); if (!b) return;
      cur.no = Number(b.dataset.no);
      Array.prototype.forEach.call(row.children, function(x){ x.classList.toggle('on', x === b); });
      show();
    });
  });
  // 모범답안 ↔ 채점기준
  document.addEventListener('click', function(e){
    var b = e.target.closest('.answer-seg button'); if (!b) return;
    var pane = b.closest('.pane');
    Array.prototype.forEach.call(b.parentNode.children, function(x){ x.classList.toggle('on', x === b); });
    pane.querySelectorAll('.tab').forEach(function(t){ t.hidden = t.dataset.tab !== b.dataset.tab; });
    pane.scrollTop = 0;
  });
  show();
})();
</script>`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html, "utf8");
console.log(`${OUT} — ${items.length}문항 · ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)}MB`);
