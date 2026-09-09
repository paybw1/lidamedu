// 정리비교표 3p 총칙 → 화면.
//
// ★3p 는 강의노트 **45p + 46p** 두 장을 한 쪽에 합쳐 놓은 것이다. 그림은 강의노트에서
//   가져온다(연결선이 id 로 적혀 있어 정확하다). 대조: 3p 상자 81개 ↔ 두 장 78종.
import { readFileSync, writeFileSync } from "node:fs";
import { DIAGRAM_CSS, DIAGRAM_TOKENS, buildDiagram } from "./note-diagram.mjs";
import { DETOURS } from "./note-detours.mjs";

// ★원장 결정 2026-09-09
//  · `대리인의 선임/개임(法10)` → `교체` — 제10조 현행 표제가 「대리인의 선임 또는 교체
//    명령 등」 이다(운영 DB 조문 확인). 강의노트 쪽이 옛 표기.
//  · 뼈대의 `기일과 기간(法14,15)` 과 `추후보완(法17,67의3)` 을 **한 줄로 합친다**
//    (정리비교표 3p 표기). 76 을 빼고 74 를 고쳐 쓰며, 아래 두 줄을 한 칸씩 끌어올린다.
//  · 나머지 세 곳(발명의 / 서류의 / 法 82)은 강의노트 표기를 그대로 둔다.
const MERGED = "기일, 기간 및 추후보완(法 14,15,16,67의3)";
const rowsUp = (file) => {
  const S = JSON.parse(readFileSync(file, "utf8")).shapes;
  const y = (id) => S.find((s) => s.id === id).y;
  return { 31: [0, y("76") - y("31")], 32: [0, y("31") - y("32")] };
};
const common = (file, key) => ({
  key, detours: DETOURS[key === "a" ? "note-p45" : "note-p46"],
  renames: { 74: [MERGED], 69: ["대리인의 선임/교체(法10)"] },
  drop: ["76"], shift: rowsUp(file),
});
const A = buildDiagram("scripts/digest/pipeline/note-p45.json", common("scripts/digest/pipeline/note-p45.json", "a"));
const B = buildDiagram("scripts/digest/pipeline/note-p46.json", common("scripts/digest/pipeline/note-p46.json", "b"));

// 교재(정리비교표 3p)와 강의노트의 글이 다른 곳. 손대지 않고 적어만 둔다.
const DIFFS = [
  ['대리인의 선임/개임(法 10)', '대리인의 선임/교체(法 10)', '교체로 그렸습니다 — 제10조 현행 표제가 「대리인의 선임 또는 교체 명령 등」'],
  ['기일과 기간(法 14, 15) + 추후보완(法 17, 67의3) 두 줄', '기일, 기간 및 추후보완(法 14,15,16,67의3) 한 줄', '한 줄로 합쳤습니다 — 뼈대가 열한 줄에서 열 줄이 됩니다'],
  ['원칙: 발명의 정의 규정 만족', '원칙: 발명 정의 규정 만족', '강의노트대로 두었습니다'],
  ['특허에 관한 서류의 제출', '특허에 관한 서류 제출', '강의노트대로 두었습니다'],
  ['수수료의 납부(法 82)', '수수료의 납부', '강의노트대로 두었습니다 — 法 82 를 살립니다'],
];
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const diffRows = DIFFS.map(([note, book, why]) =>
  `<li><span class="side">강의노트</span><span class="v">${esc(note)}</span>` +
  `<span class="side">정리비교표</span><span class="v">${esc(book)}</span>` +
  `<span class="why">${esc(why)}</span></li>`).join("");

const html = `<title>총칙 — 정리비교표 재작화</title>

<style>
  :root {
    --card:#fff; --ink:#2e2e2e; --primary:#2d5ba8; --primary-fg:#fff; --muted:#64748b;
    --border:#e5e9ef; --link:#2d5ba8; --hair:rgba(46,46,46,.06); --page:#f6f7f9;
    --hot:#d92b2b;
    ${DIAGRAM_TOKENS.light}
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --card:#333; --ink:#e6e6e6; --primary:#3b6fc4; --primary-fg:#fff; --muted:#b5b5b5;
      --border:rgba(255,255,255,.12); --link:#60a5fa; --hair:rgba(255,255,255,.07);
      --page:#1e1e1e; --hot:#ef6b6b;
      ${DIAGRAM_TOKENS.dark}
    }
  }
  :root[data-theme="dark"] {
    --card:#333;--ink:#e6e6e6;--primary:#3b6fc4;--primary-fg:#fff;--muted:#b5b5b5;
    --border:rgba(255,255,255,.12);--link:#60a5fa;--hair:rgba(255,255,255,.07);
    --page:#1e1e1e;--hot:#ef6b6b;
    ${DIAGRAM_TOKENS.dark}
  }
  :root[data-theme="light"] {
    --card:#fff;--ink:#2e2e2e;--primary:#2d5ba8;--primary-fg:#fff;--muted:#64748b;
    --border:#e5e9ef;--link:#2d5ba8;--hair:rgba(46,46,46,.06);--page:#f6f7f9;--hot:#d92b2b;
    ${DIAGRAM_TOKENS.light}
  }

  body {
    margin:0; background:var(--page); color:var(--ink); line-height:1.5;
    font-family: system-ui, -apple-system, "Segoe UI", "Malgun Gothic",
      "Apple SD Gothic Neo", sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width:1240px; margin:0 auto; padding:32px 18px 64px; }

  header { margin-bottom:22px; }
  .eyebrow { margin:0 0 6px; font-size:11px; letter-spacing:.12em; font-weight:700; color:var(--muted); }
  h1 { margin:0 0 8px; font-size:clamp(20px,3vw,27px); letter-spacing:-.02em; }
  .lede { margin:0; color:var(--muted); font-size:14px; max-width:70ch; }
  .lede b { color:var(--ink); }

  .panel {
    background:var(--card); border:1px solid var(--border); border-radius:14px;
    overflow:hidden; margin-bottom:18px;
  }
  .panel > h2 {
    margin:0; padding:10px 16px; border-bottom:1px solid var(--border);
    font-size:12px; font-weight:700; letter-spacing:.04em; color:var(--muted);
    display:flex; flex-wrap:wrap; gap:8px; align-items:baseline;
  }
  .panel > h2 .src { font-weight:600; letter-spacing:0; opacity:.8; }
${DIAGRAM_CSS}
  .foot {
    margin-top:8px; border-left:3px solid var(--primary); background:var(--card);
    border-radius:0 10px 10px 0; padding:13px 16px; font-size:13px; color:var(--muted);
  }
  .foot b { color:var(--ink); }
  .foot + .foot { margin-top:10px; }

  /* 교재와 강의노트의 글이 다른 곳 */
  ul.diffs { margin:10px 0 0; padding:0; list-style:none; display:flex; flex-direction:column; gap:8px; }
  ul.diffs li {
    display:grid; grid-template-columns:auto 1fr auto 1fr; gap:4px 8px; align-items:baseline;
    font-size:12.5px; padding-bottom:8px; border-bottom:1px dashed var(--border);
  }
  ul.diffs li:last-child { border-bottom:0; padding-bottom:0; }
  .side {
    font-size:10px; font-weight:800; letter-spacing:.04em; color:var(--link);
    background:var(--hair); border-radius:5px; padding:1px 5px; white-space:nowrap;
  }
  .v { color:var(--ink); }
  .why { grid-column:1 / -1; color:var(--muted); font-size:12px; }
  @media (max-width:640px) {
    ul.diffs li { grid-template-columns:auto 1fr; }
  }
</style>

<div class="wrap">
  <header>
    <p class="eyebrow">정리비교표 3p · 재작화</p>
    <h1>총칙</h1>
    <p class="lede">
      정리비교표 3p 는 강의노트 <b>45p · 46p 두 장을 한 쪽에 합친</b> 것입니다. 그림은
      강의노트에서 가져왔습니다 — 연결선마다 어느 상자에 붙었는지가 적혀 있어 정확합니다.
      상자는 이미지가 아니라 글자라 어느 낱말에든 빈칸을 걸 수 있습니다.
    </p>
  </header>

  <section class="panel">
    <h2>총칙 체계 · 제1장 (1)<span class="src">강의노트 45p — 발명의 성립성 · 행위능력 · 대리인 · 복수당사자 대표</span></h2>
    ${A.html}
  </section>

  <section class="panel">
    <h2>총칙 체계 · 제1장 (2)<span class="src">강의노트 46p — 기일과 기간 · 특허에 관한 절차 일반 · 절차의 정지</span></h2>
    ${B.html}
  </section>

  <p class="foot">
    <b>연결선은 강의노트에서 가져왔습니다.</b> 파일에 선마다 <b>붙은 상자의 id 와 면</b>이
    적혀 있어 추측이 필요 없습니다. 이은 뒤에 <b>남의 상자를 뚫고 지나가는 선이 없는지</b>
    검사했습니다 — 45p 0/32, 46p 0/43(가름틀 안 0.16인치짜리 장식선 하나는 상자 뒤에 가립니다).
  </p>
  <p class="foot">
    <b>교재(정리비교표 3p)와 강의노트의 글이 다른 곳</b> — 아래 다섯이고, <b>원장님 결정대로 반영했습니다</b>.
  </p>
  <ul class="diffs">${diffRows}</ul>
</div>
`;

writeFileSync(process.argv[2], html, "utf8");
console.log(`${html.length} bytes`);
