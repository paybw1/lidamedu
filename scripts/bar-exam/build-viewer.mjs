// 변호사시험 지적재산권법 — 문제·해설 뷰어(자체완결 HTML) 생성.
//
// 좌: 문제 원문(자료집 JSON), 우: 해설(docs/bar-exam/해설/*.md).
// 아티팩트 CSP 상 외부 리소스를 못 쓰므로 CSS·JS·데이터를 전부 인라인한다.
//
//   node scripts/bar-exam/build-viewer.mjs
import fs from "node:fs";
import path from "node:path";
import { marked } from "marked";

const ROOT = process.cwd();
const COLLECTION = path.join(ROOT, "docs/bar-exam/변호사시험-지적재산권법-기출자료집.json");
const HAESEOL_DIR = path.join(ROOT, "docs/bar-exam/해설");
const OUT = path.join(ROOT, "docs/bar-exam/뷰어-문제와해설.html");

marked.setOptions({ gfm: true, breaks: false, mangle: false, headerIds: false });

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ── 데이터 ────────────────────────────────────────────────────────────────
const data = JSON.parse(fs.readFileSync(COLLECTION, "utf8"));

/** 회차별 해설 마크다운 — 파일명 「제NN회-제1문-특허법.md」 */
function haeseolOf(round) {
  const f = path.join(HAESEOL_DIR, `제${String(round).padStart(2, "0")}회-제1문-특허법.md`);
  if (!fs.existsSync(f)) return null;
  // 첫 H1 은 패널 머리말과 겹치므로 제거한다.
  return fs.readFileSync(f, "utf8").replace(/^#\s.*\n/, "");
}

/** 설문 문단 렌더 — 「1.」「(1)」로 시작하면 설문, 아니면 이어지는 서술로 본다. */
function renderAsked(list) {
  return list
    .map((t) => {
      const isHead = /^\s*\d+(-\d+)?\s*\./.test(t);
      return `<p class="${isHead ? "ask ask-head" : "ask"}">${esc(t)}</p>`;
    })
    .join("\n");
}

function renderQuestionGroup(qs) {
  const total = qs.reduce((s, q) => s + (q.points || 0), 0);
  const parts = qs
    .map((q) => {
      const facts = (q.facts || []).map((f) => `<p class="fact">${esc(f)}</p>`).join("\n");
      const label =
        qs.length > 1 ? `<h4 class="sub">${esc(q.label)} <span class="pt">${q.points}점</span></h4>` : "";
      return `${label}
${facts ? `<div class="facts"><span class="tag">사실관계</span>${facts}</div>` : ""}
<div class="asks">${renderAsked(q.asked || [])}</div>`;
    })
    .join("\n");
  return { total, html: parts };
}

const rounds = data.rounds
  .slice()
  .sort((a, b) => a.round - b.round)
  .map((r) => {
    const patent = r.qs.filter((q) => q.area === "특허법");
    const copyright = r.qs.filter((q) => q.area !== "특허법");
    return { r, patent, copyright, md: haeseolOf(r.round) };
  });

const withHaeseol = rounds.filter((x) => x.md).length;

// ── 마크업 ────────────────────────────────────────────────────────────────
const tabs = rounds
  .map(
    ({ r, md }) =>
      `<button class="tab${md ? "" : " tab-bare"}" data-round="${r.round}" type="button">` +
      `<b>제${r.round}회</b><i>${r.year}</i></button>`,
  )
  .join("");

const panels = rounds
  .map(({ r, patent, copyright, md }) => {
    const P = renderQuestionGroup(patent);
    const C = renderQuestionGroup(copyright);
    const answer = md
      ? `<div class="md">${marked.parse(md)}</div>`
      : `<div class="empty"><h3>해설 미작성</h3><p>제${r.round}회 특허법 해설은 아직 작성되지 않았습니다.</p></div>`;
    return `<div class="round" data-round="${r.round}">
  <section class="pane pane-q" aria-label="문제 원문">
    <div class="pane-in">
      <div class="pane-head">
        <h2>제${r.round}회 <span class="yr">${r.year}년 시행</span></h2>
        <div class="seg" role="tablist">
          <button class="seg-b is-on" data-main="1" type="button">제1문 · 특허법</button>
          <button class="seg-b" data-main="2" type="button">제2문 · 저작권법</button>
        </div>
      </div>
      <div class="qbody" data-main="1"><p class="meta">배점 ${P.total}점</p>${P.html}</div>
      <div class="qbody" data-main="2" hidden><p class="meta">배점 ${C.total}점</p>${C.html}</div>
    </div>
  </section>
  <section class="pane pane-a" aria-label="해설">
    <div class="pane-in">
      <div class="abody" data-main="1">${answer}</div>
      <div class="abody" data-main="2" hidden>
        <div class="empty">
          <h3>저작권법 해설 없음</h3>
          <p>해설은 <b>특허법 제1문</b>만 작성되어 있습니다. 저작권법 제2문은 학원에 기본서가
             없어 「교재 절 단위 통독 후 작성」 절차를 적용할 수 없어 보류한 상태입니다.</p>
        </div>
      </div>
    </div>
  </section>
</div>`;
  })
  .join("\n");

const html = `<title>변호사시험 지적재산권법 · 문제와 해설</title>
<style>
:root{
  --bg:#f4f6f7; --surface:#fff; --surface-2:#fafbfc;
  --ink:#151a21; --ink-2:#4a5560; --ink-3:#7b8691;
  --line:#dde2e7; --line-2:#eaeef1;
  --navy:#1f3a5f; --navy-soft:#e8eef6; --brass:#87682d;
}
@media (prefers-color-scheme:dark){
  :root{
    --bg:#0e1116; --surface:#151a20; --surface-2:#1a2027;
    --ink:#e3e8ed; --ink-2:#a6b1bd; --ink-3:#77828e;
    --line:#252c35; --line-2:#1e242b;
    --navy:#8fb3dd; --navy-soft:#1a2634; --brass:#c8a765;
  }
}
:root[data-theme="dark"]{
  --bg:#0e1116; --surface:#151a20; --surface-2:#1a2027;
  --ink:#e3e8ed; --ink-2:#a6b1bd; --ink-3:#77828e;
  --line:#252c35; --line-2:#1e242b;
  --navy:#8fb3dd; --navy-soft:#1a2634; --brass:#c8a765;
}
:root[data-theme="light"]{
  --bg:#f4f6f7; --surface:#fff; --surface-2:#fafbfc;
  --ink:#151a21; --ink-2:#4a5560; --ink-3:#7b8691;
  --line:#dde2e7; --line-2:#eaeef1;
  --navy:#1f3a5f; --navy-soft:#e8eef6; --brass:#87682d;
}
*{box-sizing:border-box}
body{
  margin:0; background:var(--bg); color:var(--ink);
  font-family:system-ui,-apple-system,"Segoe UI","Malgun Gothic","Apple SD Gothic Neo",sans-serif;
  font-size:15px; line-height:1.7; -webkit-text-size-adjust:100%;
}
.topbar{
  position:sticky; top:0; z-index:20; background:var(--surface);
  border-bottom:1px solid var(--line);
}
.brand{
  display:flex; align-items:baseline; gap:.6rem; flex-wrap:wrap;
  padding:.85rem 1.1rem .45rem;
}
.brand h1{
  margin:0; font-size:1.02rem; font-weight:650; letter-spacing:-.01em;
}
.brand .sub{ color:var(--ink-3); font-size:.79rem; }
.brand .sub b{ color:var(--brass); font-weight:600 }
.rounds{
  display:flex; gap:.3rem; overflow-x:auto; padding:0 1.1rem .7rem;
  scrollbar-width:thin;
}
.tab{
  flex:0 0 auto; display:flex; flex-direction:column; align-items:center;
  gap:.05rem; padding:.34rem .62rem; border:1px solid var(--line);
  border-radius:7px; background:var(--surface-2); color:var(--ink-2);
  font:inherit; cursor:pointer; line-height:1.25;
}
.tab b{ font-size:.83rem; font-weight:620 }
.tab i{ font-style:normal; font-size:.66rem; color:var(--ink-3); font-variant-numeric:tabular-nums }
.tab:hover{ border-color:var(--navy); color:var(--ink) }
.tab.is-on{ background:var(--navy); border-color:var(--navy); color:#fff }
/* 다크에서 --navy 는 밝은 청색이므로 글자를 어둡게 뒤집는다. */
.tab.is-on b,.tab.is-on i{ color:currentColor }
@media (prefers-color-scheme:dark){ .tab.is-on{ color:#0e1116 } }
:root[data-theme="dark"] .tab.is-on{ color:#0e1116 }
:root[data-theme="light"] .tab.is-on{ color:#fff }
.tab-bare b::after{ content:"·"; color:var(--brass); margin-left:.2em }
.tab:focus-visible,.seg-b:focus-visible{ outline:2px solid var(--brass); outline-offset:2px }

.round{ display:none }
.round.is-on{ display:grid; grid-template-columns:minmax(0,41fr) minmax(0,59fr); gap:1px; background:var(--line) }
.pane{ background:var(--bg); min-width:0; height:calc(100vh - var(--top,104px)); overflow-y:auto }
.pane-in{ padding:1.3rem 1.5rem 4rem; max-width:74ch }
.pane-q{ background:var(--surface-2) }

.pane-head{ margin-bottom:1.1rem }
.pane-head h2{ margin:0 0 .55rem; font-size:1.22rem; font-weight:650; letter-spacing:-.015em }
.pane-head .yr{ color:var(--ink-3); font-size:.8rem; font-weight:450 }
.seg{ display:inline-flex; border:1px solid var(--line); border-radius:7px; overflow:hidden }
.seg-b{
  border:0; background:transparent; color:var(--ink-2); font:inherit; font-size:.79rem;
  padding:.3rem .7rem; cursor:pointer;
}
.seg-b + .seg-b{ border-left:1px solid var(--line) }
.seg-b.is-on{ background:var(--navy-soft); color:var(--navy); font-weight:600 }

.meta{
  margin:0 0 1rem; font-size:.74rem; letter-spacing:.06em; text-transform:uppercase;
  color:var(--brass); font-weight:600;
}
.sub{ margin:1.6rem 0 .6rem; font-size:.95rem; font-weight:650 }
.sub .pt{ color:var(--ink-3); font-weight:450; font-size:.8rem }
.facts{
  background:var(--surface); border:1px solid var(--line); border-radius:9px;
  padding:.9rem 1rem; margin:0 0 1.1rem;
}
.tag{
  display:inline-block; font-size:.68rem; letter-spacing:.08em; color:var(--ink-3);
  border:1px solid var(--line); border-radius:4px; padding:.05rem .38rem; margin-bottom:.5rem;
}
.fact,.ask{
  font-family:"Nanum Myeongjo","Batang","AppleMyungjo",Georgia,serif;
  margin:0 0 .7rem; line-height:1.85; word-break:keep-all;
}
.fact:last-child,.ask:last-child{ margin-bottom:0 }
.ask{ padding-left:.9rem; border-left:2px solid transparent }
.ask-head{ margin-top:1.1rem; border-left-color:var(--navy) }

.empty{
  border:1px dashed var(--line); border-radius:10px; padding:1.5rem;
  color:var(--ink-2); background:var(--surface);
}
.empty h3{ margin:0 0 .4rem; font-size:.95rem; color:var(--ink) }
.empty p{ margin:0; font-size:.87rem }

.md h1,.md h2,.md h3,.md h4{ letter-spacing:-.015em; text-wrap:balance }
.md h1{
  margin:2.4rem 0 .9rem; font-size:1.16rem; font-weight:680; color:var(--navy);
  padding-bottom:.4rem; border-bottom:2px solid var(--navy);
}
.md h2{ margin:1.9rem 0 .7rem; font-size:1.02rem; font-weight:660 }
.md h3{ margin:1.4rem 0 .5rem; font-size:.94rem; font-weight:640; color:var(--ink-2) }
.md h4{ margin:1.2rem 0 .4rem; font-size:.89rem; font-weight:620; color:var(--ink-2) }
.md > *:first-child{ margin-top:0 }
.md p{ margin:0 0 .85rem; word-break:keep-all }
.md strong{ font-weight:660 }
.md ul,.md ol{ margin:0 0 .9rem; padding-left:1.35rem }
.md li{ margin-bottom:.35rem; word-break:keep-all }
.md li::marker{ color:var(--ink-3) }
.md hr{ border:0; border-top:1px solid var(--line); margin:2rem 0 }
.md blockquote{
  margin:1rem 0; padding:.8rem 1rem; border-left:3px solid var(--brass);
  background:var(--surface); border-radius:0 8px 8px 0; color:var(--ink-2); font-size:.92rem;
}
.md blockquote p:last-child{ margin-bottom:0 }
.md table{
  width:100%; border-collapse:collapse; margin:0 0 1rem; font-size:.86rem;
  background:var(--surface); font-variant-numeric:tabular-nums;
}
.md thead th{
  background:var(--navy-soft); color:var(--navy); font-weight:640; text-align:left;
}
.md th,.md td{ border:1px solid var(--line); padding:.42rem .6rem; vertical-align:top; word-break:keep-all }
.md .tw{ overflow-x:auto }
.md code{
  background:var(--surface); border:1px solid var(--line); border-radius:4px;
  padding:.05em .35em; font-size:.88em;
}

@media (max-width:940px){
  .round.is-on{ display:block; background:var(--bg) }
  .pane{ height:auto; overflow:visible }
  .pane-q{ border-bottom:1px solid var(--line) }
  .pane-in{ padding:1.1rem 1.05rem 2rem; max-width:none }
}
</style>

<header class="topbar">
  <div class="brand">
    <h1>변호사시험 지적재산권법 · 문제와 해설</h1>
    <span class="sub">제1~15회 · 문제 30문 · 특허법 제1문 해설 <b>${withHaeseol}회차</b></span>
  </div>
  <nav class="rounds" aria-label="회차 선택">${tabs}</nav>
</header>

<main>${panels}</main>

<script>
(function () {
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.tab'));
  var rounds = Array.prototype.slice.call(document.querySelectorAll('.round'));
  var current = 1;

  function show(n) {
    current = n;
    tabs.forEach(function (t) { t.classList.toggle('is-on', +t.dataset.round === n); });
    rounds.forEach(function (r) { r.classList.toggle('is-on', +r.dataset.round === n); });
    var t = tabs.filter(function (x) { return +x.dataset.round === n; })[0];
    if (t) t.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    document.querySelectorAll('.round.is-on .pane').forEach(function (p) { p.scrollTop = 0; });
  }

  tabs.forEach(function (t) {
    t.addEventListener('click', function () { show(+t.dataset.round); });
  });

  // 제1문 / 제2문 전환 — 두 패널이 함께 움직인다.
  document.querySelectorAll('.round').forEach(function (round) {
    round.querySelectorAll('.seg-b').forEach(function (b) {
      b.addEventListener('click', function () {
        var main = b.dataset.main;
        round.querySelectorAll('.seg-b').forEach(function (x) {
          x.classList.toggle('is-on', x.dataset.main === main);
        });
        round.querySelectorAll('.qbody, .abody').forEach(function (x) {
          x.hidden = x.dataset.main !== main;
        });
        round.querySelectorAll('.pane').forEach(function (p) { p.scrollTop = 0; });
      });
    });
  });

  document.addEventListener('keydown', function (e) {
    if (e.target.closest('input, textarea')) return;
    if (e.key === 'ArrowLeft' && current > 1) show(current - 1);
    if (e.key === 'ArrowRight' && current < ${rounds.length}) show(current + 1);
  });

  // 넓은 표는 가로로만 스크롤되게 감싼다 — 본문이 옆으로 밀리지 않도록.
  document.querySelectorAll('.md table').forEach(function (tb) {
    var w = document.createElement('div');
    w.className = 'tw';
    tb.parentNode.insertBefore(w, tb);
    w.appendChild(tb);
  });

  // 헤더 높이는 회차 탭 줄바꿈에 따라 달라지므로 실측해서 패널 높이에 반영한다.
  var top = document.querySelector('.topbar');
  function syncTop() {
    document.documentElement.style.setProperty('--top', top.offsetHeight + 'px');
  }
  window.addEventListener('resize', syncTop);
  syncTop();

  show(1);
})();
</script>`;

fs.writeFileSync(OUT, html, "utf8");
console.log(
  `생성: ${path.relative(ROOT, OUT)} — ${(Buffer.byteLength(html) / 1024).toFixed(0)}KB · ` +
    `회차 ${rounds.length} · 해설 ${withHaeseol}건`,
);
