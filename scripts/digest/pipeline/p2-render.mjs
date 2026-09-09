// p2-tree.mjs 구조 → 정리비교표 2p 화면. 구조가 바뀌면 다시 돌린다.
import { writeFileSync } from "node:fs";
import { BRANCHES, DROPPED, TITLE, allTexts } from "./p2-tree.mjs";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// 상자 글 끝의 `(法 …)`·`(발진법 …)` 은 근거 조문이다. 칩으로 떼어 세로로 훑기 쉽게.
const LAW_RE = /^(.+?)\s*\((法\s*[^)]*|발진법[^)]*)\)$/;

function line(text) {
  const m = LAW_RE.exec(text);
  if (!m) return `<span class="t">${esc(text)}</span>`;
  return `<span class="t">${esc(m[1])}</span><span class="law">${esc(m[2].replace(/\s+/g, " "))}</span>`;
}

function render(node, depth) {
  if (typeof node === "string") return `<li class="leaf">${line(node)}</li>`;
  if (!node.c)
    return `<li class="leaf${node.add ? " add" : ""}">${line(node.t)}${
      node.add ? '<span class="badge">보충</span>' : ""
    }</li>`;
  const kids = (node.c ?? []).map((k) => render(k, depth + 1)).join("");
  return `<li class="grp d${depth}"><span class="cap">${line(node.t)}</span><ul class="lv">${kids}</ul></li>`;
}

const KIND_CLASS = { 보충: "add", 수정: "edit", 삭제: "drop" };
const changes = [];
(function collect(items) {
  for (const it of items) {
    if (typeof it === "string") continue;
    if (it.add) changes.push({ kind: "보충", now: it.t });
    else if (it.was) changes.push({ kind: "수정", was: it.was, now: it.t });
    collect(it.c ?? []);
  }
})(BRANCHES.flatMap((b) => b.items));
for (const d of DROPPED) changes.push({ kind: "삭제", was: d });

const changeHtml = changes
  .map((c) => `<li><span class="kind k${KIND_CLASS[c.kind]}">${c.kind}</span>${
    c.was ? `<span class="was">${esc(c.was)}</span>` : ""
  }${c.was && c.now ? '<span class="to">→</span>' : ""}${
    c.now ? `<span class="now">${esc(c.now)}</span>` : ""
  }</li>`)
  .join("");

const total = allTexts().length - 1 - BRANCHES.length * 2; // 제목·번호·갈래이름 제외 (DROPPED 는 남아 있어 교재 수 그대로)
const cards = BRANCHES.map((b) => `
      <section class="card">
        <h2><span class="num">${b.no}</span><span class="bn">${esc(b.name)}</span></h2>
        <ul class="lv root">${b.items.map((i) => render(i, 0)).join("")}</ul>
      </section>`).join("");

const html = `<title>${TITLE} — 정리비교표 재작화</title>

<style>
  :root {
    --card: #ffffff; --ink: #2e2e2e; --primary: #2d5ba8; --primary-fg: #ffffff;
    --muted: #64748b; --border: #e5e9ef; --link: #2d5ba8;
    --tint: rgba(45, 91, 168, .1); --hair: rgba(46, 46, 46, .06);
    --rule: rgba(45, 91, 168, .22); --page: #f6f7f9;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --card:#333333; --ink:#e6e6e6; --primary:#3b6fc4; --primary-fg:#ffffff;
      --muted:#b5b5b5; --border:rgba(255,255,255,.12); --link:#60a5fa;
      --tint:rgba(59,111,196,.22); --hair:rgba(255,255,255,.07);
      --rule:rgba(96,165,250,.3); --page:#1e1e1e;
    }
  }
  :root[data-theme="dark"] {
    --card:#333;--ink:#e6e6e6;--primary:#3b6fc4;--primary-fg:#fff;--muted:#b5b5b5;
    --border:rgba(255,255,255,.12);--link:#60a5fa;--tint:rgba(59,111,196,.22);
    --hair:rgba(255,255,255,.07);--rule:rgba(96,165,250,.3);--page:#1e1e1e;
  }
  :root[data-theme="light"] {
    --card:#fff;--ink:#2e2e2e;--primary:#2d5ba8;--primary-fg:#fff;--muted:#64748b;
    --border:#e5e9ef;--link:#2d5ba8;--tint:rgba(45,91,168,.1);
    --hair:rgba(46,46,46,.06);--rule:rgba(45,91,168,.22);--page:#f6f7f9;
  }

  body {
    margin: 0; background: var(--page); color: var(--ink);
    font-family: system-ui, -apple-system, "Segoe UI", "Malgun Gothic",
      "Apple SD Gothic Neo", sans-serif;
    line-height: 1.5; -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 1240px; margin: 0 auto; padding: 32px 18px 64px; }

  header { margin-bottom: 22px; }
  .eyebrow {
    margin: 0 0 6px; font-size: 11px; letter-spacing: .12em; font-weight: 700; color: var(--muted);
  }
  h1 { margin: 0 0 8px; font-size: clamp(20px, 3vw, 27px); letter-spacing: -.02em; }
  .lede { margin: 0; color: var(--muted); font-size: 14px; max-width: 68ch; }
  .lede b { color: var(--ink); }

  /* 갈래 8개를 흐르게 놓는다 — 특허권·심판이 길어 단 높이를 맞출 수 없다. */
  /* ★단 수를 못박지 않고 **한 단의 폭**을 정한다 — 자리가 넓으면 단이 늘어 세로가
     짧아지고, 좁으면 단이 줄어든다. 못박으면 좁은 데서는 넘치고 넓은 데서는
     한없이 아래로 내려간다(원장 지적: "밑으로 너무 길어"). 한 단 = 360px. */
  .grid { columns: 360px; column-gap: 16px; }

  .card {
    break-inside: avoid; margin: 0 0 16px; background: var(--card);
    border: 1px solid var(--border); border-radius: 14px; padding: 14px 16px 16px;
  }
  .card h2 {
    margin: 0 0 10px; display: flex; align-items: center; gap: 8px;
    font-size: 15px; letter-spacing: -.01em;
  }
  .num {
    flex: none; width: 21px; height: 21px; border-radius: 50%;
    background: var(--primary); color: var(--primary-fg);
    font-size: 11px; font-weight: 800; display: grid; place-items: center;
    font-variant-numeric: tabular-nums;
  }

  ul.lv { margin: 0; padding: 0; list-style: none; }
  ul.root > li + li { margin-top: 6px; }
  /* 층이 내려갈수록 왼쪽 선으로 묶어 준다 — 들여쓰기만으로는 다섯 층이 안 읽힌다. */
  .grp > ul.lv {
    margin: 4px 0 0 0; padding-left: 10px; border-left: 1px solid var(--rule);
  }
  .grp > ul.lv > li + li { margin-top: 3px; }

  .cap {
    display: inline-block; font-size: 12px; font-weight: 800; color: var(--link);
    background: var(--tint); border-radius: 6px; padding: 2px 7px;
  }
  /* 둘째 층부터는 칩을 벗고 글자만 — 칩이 겹치면 화면이 얼룩진다. */
  .grp.d1 > .cap, .grp.d2 > .cap, .grp.d3 > .cap {
    background: transparent; padding: 2px 0; font-size: 12px; color: var(--ink);
  }
  .leaf { font-size: 12.5px; color: color-mix(in srgb, var(--ink) 86%, transparent); }
  .law {
    margin-left: 5px; font-size: 10.5px; font-weight: 700; color: var(--muted);
    background: var(--hair); border-radius: 5px; padding: 1px 5px;
    white-space: nowrap; font-variant-numeric: tabular-nums;
  }
  .cap .law { background: transparent; padding: 1px 0; }
  /* 교재 2p 상자에 없던 줄 — 원본과 섞이지 않게 점선으로 구분한다. */
  .leaf.add { border-left: 2px dotted var(--rule); padding-left: 6px; margin-left: -8px; }
  .badge {
    margin-left: 5px; font-size: 9.5px; font-weight: 800; letter-spacing: .04em;
    color: var(--link); border: 1px dashed var(--rule); border-radius: 5px; padding: 0 4px;
  }

  /* 교재와 달라진 곳 — 무엇을 고쳤는지 화면이 스스로 말하게 둔다. */
  .changes { margin: 8px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 5px; }
  .changes li { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 12px; }
  .kind {
    flex: none; font-size: 9.5px; font-weight: 800; letter-spacing: .04em;
    border-radius: 5px; padding: 1px 5px; border: 1px solid var(--rule); color: var(--link);
  }
  .kdrop { color: var(--muted); border-color: var(--border); }
  .was { color: var(--muted); text-decoration: line-through; text-decoration-thickness: 1px; }
  .to { color: var(--muted); }
  .now { color: var(--ink); font-weight: 600; }

  .foot {
    margin-top: 8px; border-left: 3px solid var(--primary); background: var(--card);
    border-radius: 0 10px 10px 0; padding: 13px 16px; font-size: 13px; color: var(--muted);
  }
  .foot b { color: var(--ink); }
</style>

<div class="wrap">
  <header>
    <p class="eyebrow">정리비교표 2p · 재작화</p>
    <h1>${TITLE}</h1>
    <p class="lede">
      교재 한 장에 그려진 갈래 <b>8개 · 교재 항목 ${total}개</b>를 이미지가 아니라 글과 구조로
      다시 짰습니다. 원본 138개 상자와 <b>하나도 빠짐없이 대조</b>했고, 교재에서 고친 곳은
      맨 아래에 따로 적어 뒀습니다. 전부 텍스트라 어느 낱말에든 빈칸을 걸 수 있습니다.
    </p>
  </header>

  <div class="grid">${cards}
  </div>

  <p class="foot">
    <b>교재와 다른 점</b> — 교재는 가운데 제목을 두고 갈래가 사방으로 뻗는 마인드맵이지만,
    화면에서는 그 배치를 그대로 두면 좁은 폭에서 읽을 수 없어 갈래마다 한 장으로 세웠습니다.
    상자 끝의 <b>(法 …)</b> 는 괄호를 벗기고 오른쪽 칩으로 옮겨 조문 번호가 세로로 맞게 했습니다.
    나머지 글자는 교재 그대로입니다.
  </p>

  <p class="foot">
    <b>교재에서 고친 곳</b> — 아래 ${changes.length}건뿐이고, 그 밖의 ${total}개 항목은
    교재 상자 글 그대로입니다.
  </p>
  <ul class="changes">${changeHtml}</ul>
</div>
`;

writeFileSync(process.argv[2], html, "utf8");
console.log(`항목 ${total}개, ${html.length} bytes`);
