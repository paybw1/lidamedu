// p11-tree.mjs 구조 → 정리비교표 11p 화면.
// 오른쪽 도해는 강의노트 566p 그림을 자리 그대로 옮긴다(note566-diagram.mjs).
import { writeFileSync } from "node:fs";
import { PROC, TITLE, TRANS_SOURCE, TRANS_TITLE } from "./p11-tree.mjs";
import { DIAGRAM_CSS, DIAGRAM_HTML, DIAGRAM_TOKENS } from "./note566-diagram.mjs";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// 끝의 근거 조문만 칩으로 뗀다. `(명문의 규정 없음)` 처럼 조문이 아닌 괄호는 그대로 둔다.
const LAW_RE = /^(.+?)\s*\((法[^)]*|施規[^)]*|제\d+조[^)]*)\)$/;
function line(text) {
  const m = LAW_RE.exec(text);
  if (!m) return '<span class="t">' + esc(text) + "</span>";
  return '<span class="t">' + esc(m[1]) + '</span><span class="law">' + esc(m[2]) + "</span>";
}

const procRows = PROC.map((g) => {
  const items = g.items.map((it) => {
    const subs = it.c
      ? '<ul class="subs">' + it.c.map((c) => "<li>" + line(c) + "</li>").join("") + "</ul>"
      : "";
    return '<li><span class="n">' + esc(it.n) + "</span>" + line(it.t) + subs + "</li>";
  }).join("");
  return "\n            <tr><th>" + esc(g.k) + '</th><td><ol class="items">' + items + "</ol></td></tr>";
}).join("");

const html = `<title>${TITLE} — 정리비교표 재작화</title>

<style>
  :root {
    --card:#fff; --ink:#2e2e2e; --primary:#2d5ba8; --primary-fg:#fff; --muted:#64748b;
    --border:#e5e9ef; --link:#2d5ba8; --tint:rgba(45,91,168,.1);
    --hair:rgba(46,46,46,.06); --rule:rgba(45,91,168,.22); --page:#f6f7f9;
    --hot:#d92b2b;
    ${DIAGRAM_TOKENS.light}
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --card:#333; --ink:#e6e6e6; --primary:#3b6fc4; --primary-fg:#fff; --muted:#b5b5b5;
      --border:rgba(255,255,255,.12); --link:#60a5fa; --tint:rgba(59,111,196,.22);
      --hair:rgba(255,255,255,.07); --rule:rgba(96,165,250,.3); --page:#1e1e1e;
      --hot:#ef6b6b;
      ${DIAGRAM_TOKENS.dark}
    }
  }
  :root[data-theme="dark"] {
    --card:#333;--ink:#e6e6e6;--primary:#3b6fc4;--primary-fg:#fff;--muted:#b5b5b5;
    --border:rgba(255,255,255,.12);--link:#60a5fa;--tint:rgba(59,111,196,.22);
    --hair:rgba(255,255,255,.07);--rule:rgba(96,165,250,.3);--page:#1e1e1e;
    --hot:#ef6b6b;
    ${DIAGRAM_TOKENS.dark}
  }
  :root[data-theme="light"] {
    --card:#fff;--ink:#2e2e2e;--primary:#2d5ba8;--primary-fg:#fff;--muted:#64748b;
    --border:#e5e9ef;--link:#2d5ba8;--tint:rgba(45,91,168,.1);
    --hair:rgba(46,46,46,.06);--rule:rgba(45,91,168,.22);--page:#f6f7f9;
    --hot:#d92b2b;
    ${DIAGRAM_TOKENS.light}
  }

  body {
    margin:0; background:var(--page); color:var(--ink); line-height:1.5;
    font-family: system-ui, -apple-system, "Segoe UI", "Malgun Gothic",
      "Apple SD Gothic Neo", sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width:1180px; margin:0 auto; padding:32px 18px 64px; }

  header { margin-bottom:22px; }
  .eyebrow { margin:0 0 6px; font-size:11px; letter-spacing:.12em; font-weight:700; color:var(--muted); }
  h1 { margin:0 0 8px; font-size:clamp(20px,3vw,27px); letter-spacing:-.02em; }
  .lede { margin:0; color:var(--muted); font-size:14px; max-width:68ch; }
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

  /* ── 국제출원절차 표 ─────────────────────────────── */
  .tablewrap { overflow-x:auto; }
  table { border-collapse:collapse; width:100%; font-size:13px; }
  th, td { text-align:left; padding:10px 14px; border-bottom:1px solid var(--border); vertical-align:top; }
  th { width:150px; min-width:120px; font-weight:700; background:var(--hair); }
  tr:last-child th, tr:last-child td { border-bottom:0; }

  ol.items { margin:0; padding:0; list-style:none; display:flex; flex-direction:column; gap:7px; }
  .n { color:var(--link); font-weight:800; margin-right:5px; font-variant-numeric:tabular-nums; }
  ul.subs {
    margin:4px 0 0; padding:0 0 0 12px; list-style:none;
    border-left:1px solid var(--rule); display:flex; flex-direction:column; gap:3px;
  }
  ul.subs li { position:relative; padding-left:12px; font-size:12.5px;
    color:color-mix(in srgb, var(--ink) 86%, transparent); }
  /* 교재의 ○ 를 그대로 쓴다 — 채운 점으로 바꾸면 층이 하나 사라진 것처럼 보인다. */
  ul.subs li::before {
    content:""; position:absolute; left:0; top:.5em; width:5px; height:5px;
    border-radius:50%; border:1px solid var(--rule);
  }
  .law {
    margin-left:5px; font-size:10.5px; font-weight:700; color:var(--muted);
    background:var(--hair); border-radius:5px; padding:1px 5px;
    white-space:nowrap; font-variant-numeric:tabular-nums;
  }
${DIAGRAM_CSS}
  .foot {
    margin-top:8px; border-left:3px solid var(--primary); background:var(--card);
    border-radius:0 10px 10px 0; padding:13px 16px; font-size:13px; color:var(--muted);
  }
  .foot b { color:var(--ink); }
  .foot + .foot { margin-top:10px; }
</style>

<div class="wrap">
  <header>
    <p class="eyebrow">정리비교표 11p · 재작화</p>
    <h1>${TITLE}</h1>
    <p class="lede">
      교재 11p 는 왼쪽 <b>국제출원절차 표</b>와 오른쪽 <b>${TRANS_TITLE} 도해</b> 두 덩이입니다.
      도해는 <b>${TRANS_SOURCE}</b> 의 그림을 <b>자리·색·꺾임 그대로</b> 옮겼습니다.
      상자는 이미지가 아니라 글자라 어느 낱말에든 빈칸을 걸 수 있습니다.
    </p>
  </header>

  <section class="panel">
    <h2>국제출원절차 · 내용</h2>
    <div class="tablewrap">
      <table>
        <tbody>${procRows}
        </tbody>
      </table>
    </div>
  </section>

  <section class="panel">
    <h2>${TRANS_TITLE}<span class="src">${TRANS_SOURCE}</span></h2>
    ${DIAGRAM_HTML}
  </section>

  <p class="foot">
    <b>왼쪽 표는 도형이 아니라 교재의 표에서 가져왔습니다.</b> 같은 내용이 도형으로도
    그려져 있지만, 도형 쪽에는 <b>보정명령(法 195)</b> 이 빠져 있어 표가 더 완전합니다.
  </p>
  <p class="foot">
    <b>도해는 그림을 옮긴 것입니다.</b> 강의노트 파일에서 상자의 자리·크기와 연결선의
    꺾임을 그대로 읽어 다시 그렸습니다 — 선마다 <b>어느 상자에 붙었는지가 id 로 적혀</b> 있어
    21줄기가 한 줄도 어긋나지 않습니다. 정리비교표 파일만 보고 좌표로 풀었을 때는 세 군데가
    틀렸습니다(제205조③↔제204조④를 ③↔③으로, 제208조↔제204조 누락, <b>1·2</b> 를 호(號) 묶음으로).
  </p>
  <p class="foot">
    <b>제208조에 ②·⑤가 없는 것은 맞습니다.</b> 그 두 항은 2001년에 삭제되어 조문에 ①③④만
    남아 있습니다(조문 원문으로 확인). 제208조①이 <b>"제204조제2항 및 제205조제2항에 따른
    보정은 제외한다"</b> 고 적고 있어, 두 ②가 제208조①로 이어지는 빨간 선도 문언과 맞습니다.
  </p>
</div>
`;

writeFileSync(process.argv[2], html, "utf8");
console.log(`${html.length} bytes`);
