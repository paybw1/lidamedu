// 정리비교표의 **표** 쪽 → 화면. 도형이 없는 쪽(4~9p·12p)은 표가 그대로 들어 있다.
//
//   node scripts/digest/pipeline/table-render.mjs <쪽번호> <out.html>
//
// ★칸은 추출된 HTML 을 그대로 다시 쓴다 — colspan/rowspan 을 손대지 않는다.
//   병합 셀을 잃으면 표가 한 줄씩 밀린다(메모: hwpx-table-merge-cells).
// ★머리줄 수(head)는 쪽마다 다르다. 실제로 세어 보고 적을 것 —
//   5·6·8p 는 머리줄이 **한 줄**이고 둘째 줄부터 요건(본문)이다.
import { readFileSync, writeFileSync } from "node:fs";

// parts: 한 쪽에 표가 여럿이면 표마다 적는다(9p = 정정청구 + 재심).
const PAGES = {
  4: { title: "특허요건", min: 1180, parts: [{ index: 0, head: 2 }] },
  5: { title: "이익제도", min: 1280, parts: [{ index: 0, head: 1 }] },
  6: { title: "심사제도", min: 1280, parts: [{ index: 0, head: 1 }] },
  7: { title: "권리", min: 1100, parts: [{ index: 0, head: 2 }] },
  8: { title: "심판제도", min: 1280, parts: [{ index: 0, head: 1 }] },
  9: {
    title: "정정청구 제도 · 재심 제도",
    min: 980,
    parts: [
      { index: 0, head: 1, caption: "정정청구 제도" },
      { index: 1, head: 1, caption: "재심 제도", min: 700 },
    ],
  },
  12: { title: "특허법 · 실용신안법", min: 900, parts: [{ index: 0, head: 1 }] },
};

// ★원장 지시로 교재와 **다르게** 고친 칸(2p 체계도의 EDIT 와 같은 뜻). 화면에는 now 를 그리고
//   교재 원문 was 는 `data-was` 로 칸에 남겨 대조(table-verify)가 계속 통과하게 한다. 꼬리의
//   「고친 곳」에도 적는다(검토용 기록 — convert 가 걷어내 학생 화면에는 안 나간다).
//   was 는 <br>·공백을 뺀 글자로 찾는다. 못 찾으면 여기서 멈춘다 — 조용히 빠지면 못 알아챈다.
const EDITS = {
  8: [
    {
      was: "권리 대 권리 간의 권리범위확인심판의 경우 적극적의 이용관계 확인과 소극적 인정",
      now: "권리 대 권리 간의 권리범위확인심판의 경우 동종이면 적극적의 이용관계 확인과 소극적 인정, 이종이면 모두 인정",
      by: "원장 지시 2026-09-11",
    },
  ],
};
const flatText = (html) => html.replace(/<br>/g, "").replace(/\s+/g, "");
const escAttr = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const [pageArg, out] = process.argv.slice(2);
const page = Number(pageArg);
const cfg = PAGES[page];
const edits = (EDITS[page] ?? []).map((e) => ({ ...e, hit: false }));
if (!cfg || !out) {
  console.log("사용: node scripts/digest/pipeline/table-render.mjs <쪽번호> <out.html>");
  process.exit(1);
}

const doc = JSON.parse(readFileSync("scripts/digest/pipeline/정리비교표.json", "utf8"));

const spanOf = (attrs, name) => Number(attrs.match(new RegExp(`${name}="(\\d+)"`))?.[1] ?? 1);

// ★목차 칸은 교재가 좁은 칸에 맞추려고 `객<br>체<br>적<br>기준` 처럼 글자마다 끊어
//   놓았다. 두 칸 이상 걸친 이름은 한 글자짜리 토막을 도로 붙여 낱말 단위로만 끊는다.
const wordWrap = (html) => {
  const parts = html.split("<br>").map((p) => p.trim()).filter(Boolean);
  const acc = [];
  for (const p of parts) {
    if (p.length === 1 && acc.length && acc.at(-1).single) acc.at(-1).t += p;
    else acc.push({ t: p, single: p.length === 1 });
  }
  return acc.map((o) => o.t).join("<br>");
};

// ★한 칸짜리 목차 열은 **한 줄에 한 글자**로 세운다(원장 지시) — 교재가 그렇게 짜여
//   있고, 그래야 목차 열을 글자 하나 너비로 줄여 내용 열을 넓게 쓸 수 있다.
//   단 **내용 열이 몇 개 없는 쪽에는 걸지 않는다**: 9·12p 처럼 내용이 두세 열뿐이면
//   목차를 줄여 봐야 넓어질 데가 없고, `우선심사사유의 상이` 가 아홉 줄로 서서
//   줄 높이만 커진다. 빽빽한 쪽(내용 열 5개 이상)에만 세운다.
const DENSE_FROM = 5;
const vertical = (html) =>
  html.replace(/<br>/g, "").replace(/\s+/g, "").split("").join("<br>");
// 교재가 좁은 칸에 맞추려고 낱말 **중간**에서 끊어 놓은 목차 이름. 가로로 두는 쪽에서는
// 제자리로 붙인다(글자는 그대로 — 띄어쓰기와 줄바꿈 자리만 바로잡는다).
const KEYFIX = {
  출원및심사: "출원 및 심사",
  우선심사사유의상이: "우선심사사유의 상이",
  특허공보게재: "특허공보 게재",
  // 8p 심판제도 두 칸짜리 목차 — 원장 지시(2026-09-11): 낱말 단위로 두 줄, 「비 고」는 붙여서.
  심판비용: "심판<br>비용",
  참가여부: "참가<br>여부",
  비고: "비고",
  // 9p 정정청구 제도 목차 — 원장 지시(2026-09-11): 교재의 「효 과」「적 법」「불 복」을 붙여서.
  효과: "효과",
  적법: "적법",
  불복: "불복",
};
const keyText = (html, cs, dense) => {
  if (dense && cs === 1) return vertical(html);
  const flat = html.replace(/<br>/g, "").replace(/\s+/g, "");
  return KEYFIX[flat] ?? wordWrap(html);
};

// ★원문자(①②③…)로 나열한 곳은 줄을 바꾼다 — 한 줄에 이어 붙으면 항목이 안 보인다.
//   단 **괄호 안은 건드리지 않는다**: `(法 42③Ⅰ,④)`·`(法 29①본문)` 은 조문 표기라
//   끊으면 안 된다. 그래서 괄호 깊이를 세면서 바깥에 있는 것만 끊는다.
const CIRCLED = /[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮]/;
function breakCircled(html) {
  return html.split("<br>").map((seg) => {
    let acc = "";
    let depth = 0;
    for (let i = 0; i < seg.length; i += 1) {
      const c = seg[i];
      if (c === "(" || c === "（") depth += 1;
      else if (c === ")" || c === "）") depth = Math.max(0, depth - 1);
      const prev = acc.replace(/<br>$/, "").slice(-1);
      if (depth === 0 && CIRCLED.test(c) && prev && /[\s,]/.test(prev)) {
        acc = acc.replace(/[\s,]+$/, (m) => (m.includes(",") ? "," : "")) + "<br>";
      }
      acc += c;
    }
    return acc;
  }).join("<br>");
}

function renderTable(src, part) {
  const rows = src.split("<tr>").slice(1).map((r) => r.replace(/<\/tr>[\s\S]*/, ""));

  // ★목차 칸(의의·내용·판단…)이 내용 칸과 같은 너비를 먹으면 표가 목차에 눌린다.
  //   맨 윗줄 첫 칸의 colspan 이 곧 목차 열 수다(4p 는 `특허요건` colspan=3).
  const row0 = [...rows[0].matchAll(/<td([^>]*)>/g)].map((m) => m[1]);
  const total = row0.reduce((n, a) => n + spanOf(a, "colspan"), 0);
  const keycols = spanOf(row0[0] ?? "", "colspan");
  const dense = total - keycols >= DENSE_FROM;
  const keyw = cfg.keyw ?? new Array(keycols).fill(22);
  // 빽빽한 쪽만 열 너비를 못박는다. 여유 있는 쪽은 브라우저가 목차 글자 길이에
  // 맞춰 잡도록 두는 편이 낫다(고정폭 + keep-all 이면 긴 이름이 칸을 넘친다).
  const colgroup = dense
    ? `<colgroup>${
      Array.from({ length: keycols }, (_, i) => `<col style="width:${keyw[i] ?? 22}px">`).join("")
    }${"<col>".repeat(total - keycols)}</colgroup>`
    : "";

  // ★목차 칸인지는 **몇째 열에서 시작하는가**로 정한다. 글자 길이로 재면
  //   `심사관, 심판관, 법관` 같은 짧은 내용 칸까지 목차 색을 먹는다(원장 지적).
  //   병합 때문에 열 번호는 그냥 셀 수 없다 — 위에서 내려오는 rowspan 을 세어 둔다.
  let cells = 0;
  const held = new Array(total).fill(0); // 열마다 남은 rowspan
  const trs = rows.map((r, ri) => {
    const found = [...r.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g)];
    cells += found.length;
    let col = 0;
    const tds = found.map(([, attrs, html]) => {
      while (col < total && held[col] > 0) col += 1;
      const cs = spanOf(attrs, "colspan");
      const rs = spanOf(attrs, "rowspan");
      // ★이번 줄까지 포함해 잡아 둔다(rs). 줄 끝에서 한 번 빼므로 rs-1 로 두면
      //   rowspan=2 짜리가 다음 줄을 못 막아 열이 한 칸씩 왼쪽으로 밀린다.
      for (let i = col; i < col + cs && i < total; i += 1) held[i] = rs;
      const at = col;
      col += cs;
      // ★목차는 **목차 열 안에서 끝나는** 칸만이다. 시작 열만 보면 표 전체를
      //   가로지르는 각주 줄(5p 의 `* ⅰ) 특허거절결정에서…`)까지 목차가 된다.
      const cls = ri < part.head ? "h" : at + cs <= keycols ? "k" : "";
      const tag = cls ? "th" : "td";
      let inner = cls === "k" ? keyText(html, cs, dense) : breakCircled(html);
      let extra = "";
      if (!cls) {
        // 고친 칸 — 내용 칸(td)만. 같은 글이 두 칸이면 앞의 것부터 하나씩 짝짓는다.
        const e = edits.find((x) => !x.hit && flatText(x.was) === flatText(html));
        if (e) {
          e.hit = true;
          inner = breakCircled(e.now);
          extra = ` data-was="${escAttr(e.was)}"`;
        }
      }
      return `<${tag}${cls ? ` class="${cls}"` : ""}${attrs}${extra}>${inner}</${tag}>`;
    }).join("");
    for (let i = 0; i < total; i += 1) if (held[i] > 0) held[i] -= 1;
    return `<tr>${tds}</tr>`;
  });

  const head = trs.slice(0, part.head).join("\n            ");
  const body = trs.slice(part.head).join("\n            ");
  const caption = part.caption
    ? `<p class="cap">${part.caption}</p>`
    : "";
  return {
    rows: rows.length,
    cells,
    html: `<section class="panel">
    ${caption}
    <div class="tablewrap">
      <table class="${dense ? "fixed" : "auto"}" style="min-width:${part.min ?? cfg.min}px">
        ${colgroup}
        <thead>
            ${head}
        </thead>
        <tbody>
            ${body}
        </tbody>
      </table>
    </div>
  </section>`,
  };
}

const parts = cfg.parts.map((p) => {
  const src = doc.pages[page - 1].tables[p.index];
  if (!src) throw new Error(`${page}p 에 ${p.index}번 표가 없습니다`);
  return { ...renderTable(src, p), part: p };
});

for (const e of edits) {
  if (!e.hit) throw new Error(`${page}p 에서 고칠 칸을 찾지 못했습니다: ${e.was}`);
}

const rowSum = parts.reduce((n, p) => n + p.rows, 0);
const cellSum = parts.reduce((n, p) => n + p.cells, 0);
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const 셈 = ["", "한", "두", "세", "네"];
const 장 = `표 ${셈[parts.length] ?? parts.length} 장`;

const html = `<title>${cfg.title} — 정리비교표 재작화</title>

<style>
  :root {
    --card:#fff; --ink:#2e2e2e; --primary:#2d5ba8; --primary-fg:#fff; --muted:#64748b;
    --border:#dfe4ec; --link:#2d5ba8; --hair:rgba(46,46,46,.05); --page:#f6f7f9;
    --headbg:#eef2f8; --keybg:#f5f7fa;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --card:#333; --ink:#e6e6e6; --primary:#3b6fc4; --primary-fg:#fff; --muted:#b5b5b5;
      --border:rgba(255,255,255,.14); --link:#60a5fa; --hair:rgba(255,255,255,.05);
      --page:#1e1e1e; --headbg:rgba(120,160,220,.16); --keybg:rgba(255,255,255,.05);
    }
  }
  :root[data-theme="dark"] {
    --card:#333;--ink:#e6e6e6;--primary:#3b6fc4;--primary-fg:#fff;--muted:#b5b5b5;
    --border:rgba(255,255,255,.14);--link:#60a5fa;--hair:rgba(255,255,255,.05);
    --page:#1e1e1e;--headbg:rgba(120,160,220,.16);--keybg:rgba(255,255,255,.05);
  }
  :root[data-theme="light"] {
    --card:#fff;--ink:#2e2e2e;--primary:#2d5ba8;--primary-fg:#fff;--muted:#64748b;
    --border:#dfe4ec;--link:#2d5ba8;--hair:rgba(46,46,46,.05);--page:#f6f7f9;
    --headbg:#eef2f8;--keybg:#f5f7fa;
  }

  body {
    margin:0; background:var(--page); color:var(--ink); line-height:1.5;
    font-family: system-ui, -apple-system, "Segoe UI", "Malgun Gothic",
      "Apple SD Gothic Neo", sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width:1400px; margin:0 auto; padding:32px 18px 64px; }

  header { margin-bottom:20px; }
  .eyebrow { margin:0 0 6px; font-size:11px; letter-spacing:.12em; font-weight:700; color:var(--muted); }
  h1 { margin:0 0 8px; font-size:clamp(20px,3vw,27px); letter-spacing:-.02em; }
  .lede { margin:0; color:var(--muted); font-size:14px; max-width:70ch; }
  .lede b { color:var(--ink); }

  .panel {
    background:var(--card); border:1px solid var(--border); border-radius:14px;
    overflow:hidden; margin-bottom:16px;
  }
  .cap {
    margin:0; padding:11px 14px 10px; font-size:13px; font-weight:800;
    border-bottom:1px solid var(--border);
  }
  /* 표가 넓다 — 줄여 버리면 못 읽으므로 옆으로 밀어 본다. */
  .tablewrap { overflow-x:auto; }
  table { border-collapse:collapse; width:100%; font-size:12.5px; }
  /* 열이 많은 쪽은 너비를 못박아야 목차가 좁아진다. 내용이 두세 열뿐인 쪽은
     브라우저가 재도록 둔다 — 목차 이름이 길어 못박으면 칸을 넘친다. */
  table.fixed { table-layout:fixed; }
  table.auto { table-layout:auto; }
  table.auto th.k { white-space:nowrap; }
  th, td {
    border:1px solid var(--border); padding:6px 7px; vertical-align:top;
    /* ★keep-all 은 한글 어절을 통째로 넘겨 줄 끝이 크게 비고 한 줄에 들어가는 글자가
       확 줄어든다. 한글은 글자 단위로 끊어야 칸을 꽉 채운다.
       ★양쪽 맞춤은 쓰지 않는다 — 한자·괄호 사이를 벌려 성기게 보인다(원장 지적). */
    text-align:left; word-break:normal; overflow-wrap:anywhere;
  }
  th.h, th.k { text-align:center; }
  /* 머리줄 — 가로로 훑을 때 기준이 되므로 위에 붙여 둔다.
     ★머리줄이 두 줄인 쪽은 둘째 줄을 첫 줄 높이만큼 내려야 겹치지 않는다. */
  thead tr:first-child th { height:30px; }
  thead tr:first-child th.h { position:sticky; top:0; z-index:3; }
  thead tr:nth-child(2) th.h { position:sticky; top:30px; z-index:2; }
  th.h { background:var(--headbg); color:var(--ink); font-weight:800; }
  /* 줄머리 이름 칸 — 너비는 colgroup 이 정한다. 좌우 여백을 줄여 한 글자 폭에 맞춘다. */
  th.k {
    background:var(--keybg); font-weight:700; color:var(--ink);
    word-break:keep-all; padding:6px 3px;
  }
  /* 내용 칸은 바탕색 없이 — 색은 목차와 머리줄만 갖는다(원장 지시). */
  td { color:color-mix(in srgb, var(--ink) 88%, transparent); background:transparent; }

  .foot {
    margin-top:8px; border-left:3px solid var(--primary); background:var(--card);
    border-radius:0 10px 10px 0; padding:13px 16px; font-size:13px; color:var(--muted);
  }
  .foot b { color:var(--ink); }
  /* 꼬리 「고친 곳」 — 검토용. convert 가 걷어내 학생 화면에는 안 나간다. */
  .changes { margin:8px 0 0; padding-left:18px; font-size:12px; color:var(--muted); }
  .changes .kind { font-weight:700; color:var(--link); margin-right:6px; }
  .changes .was { text-decoration:line-through; }
  .changes .to { margin:0 6px; }
  .changes .now { color:var(--ink); }
</style>

<div class="wrap">
  <header>
    <p class="eyebrow">정리비교표 ${page}p · 재작화</p>
    <h1>${esc(cfg.title)}</h1>
    <p class="lede">
      교재 ${page}쪽은 도형 없이 <b>${장}</b>입니다. 병합된 칸까지 그대로 옮겼고
      (${rowSum}줄 · ${cellSum}칸), 글은 손대지 않았습니다. 전부 텍스트라
      어느 낱말에든 빈칸을 걸 수 있습니다.
    </p>
  </header>

  ${parts.map((p) => p.html).join("\n\n  ")}

  <p class="foot">
    <b>칸은 교재 표를 그대로 옮겼습니다.</b> 가로로 합친 칸(colspan)과 세로로 합친
    칸(rowspan)을 손대지 않았습니다 — 병합을 잃으면 표가 한 줄씩 밀립니다.
    목차 칸은 한 줄에 한 글자로 세워 폭을 줄였고, 그만큼 내용 칸이 넓어집니다.
    넓어서 좁은 화면에서는 옆으로 밀어 보셔야 합니다.
  </p>${edits.length ? `

  <p class="foot">
    <b>교재에서 고친 곳</b> — 아래 ${edits.length}건. 교재 원문은 그 칸의 <b>data-was</b> 에 남겨
    대조(table-verify)에 씁니다. 그 밖의 칸은 교재 그대로입니다.
  </p>
  <ul class="changes">${edits.map((e) => `
    <li><span class="kind">수정</span><span class="was">${esc(e.was)}</span><span class="to">→</span><span class="now">${esc(e.now)}</span> <span class="by">(${esc(e.by)})</span></li>`).join("")}
  </ul>` : ""}
</div>
`;

writeFileSync(out, html, "utf8");
console.log(
  `${page}p ${cfg.title}: ${parts.map((p) => `${p.rows}줄 ${p.cells}칸`).join(" + ")} · ${html.length} bytes`,
);
