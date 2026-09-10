// 강의노트 「참고노트 … 체계」 슬라이드 → 그림 그대로의 HTML+SVG.
//
// ★상자는 HTML 글자로 둔다 — 이미지로 만들면 빈칸 학습을 못 한다.
// ★연결선은 PPTX 에 저장된 좌표를 쓰지 않는다. 도형을 옮기면 파워포인트가 그릴 때 다시
//   잇기 때문에 저장된 좌표가 낡아 있다(566p 는 21줄기 중 5줄기가 엉뚱한 자리였다).
//   대신 `a:stCxn`/`a:endCxn` 의 **붙은 도형 id 와 면 번호**로 직접 잇는다.
//   면 번호: 0=위 1=왼 2=아래 3=오른.
import { readFileSync } from "node:fs";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const IN = 914400;

/**
 * @param file  note-extract.mjs 가 만든 JSON 경로
 * @param opts  { pad, detours, anchorText, minWidth }
 *   detours: { "<fromId>><toId>": (p0, p1, ctx) => 점 목록 } — 곧장 이으면 남의 상자를
 *   뚫거나, 원본이 일부러 크게 돌린 줄기만 길을 적는다.
 */
export function buildDiagram(file, opts = {}) {
  const D = JSON.parse(readFileSync(file, "utf8"));

  // 상자를 빼거나 옮긴다(원장 지시로 두 줄을 한 줄로 합칠 때 등). 뺀 상자에 붙어 있던
  // 선도 함께 뺀다 — 남겨 두면 없는 곳을 가리킨다.
  const drop = new Set(opts.drop ?? []);
  if (drop.size) {
    D.shapes = D.shapes.filter((s) => !drop.has(s.id));
    D.links = D.links.filter((l) => !drop.has(l.from) && !drop.has(l.to));
  }
  for (const [id, [dx, dy]] of Object.entries(opts.shift ?? {})) {
    const s = D.shapes.find((v) => v.id === id);
    if (s) { s.x += dx; s.y += dy; }
  }

  // 이 슬라이드에는 없고 다른 자료(정리비교표 등)에만 있는 상자. 자리를 인치로 준다.
  for (const e of opts.extra ?? [])
    D.shapes.push({ id: e.id, text: e.text, cx: e.w * 914400, cy: e.h * 914400,
      x: e.x * 914400, y: e.y * 914400 });

  // ★글이 없는 도형은 **꺾쇠**다(정지 효과 앞의 ] 모양 등). 네모로 그리면 빈 회색
  //   상자가 되어 남의 상자와 겹쳐 보이고, 아예 지우면 꺾쇠가 사라진다 — 선으로 그린다.
  const brackets = D.shapes.filter((s) => !s.text.join("").trim());
  D.shapes = D.shapes.filter((s) => s.text.join("").trim());
  const byId = new Map(D.shapes.map((s) => [s.id, s]));
  const PAD = opts.pad ?? 300000; // ≈0.33인치 — 그림이 카드 테두리에 닿지 않게

  const xs = D.shapes.flatMap((s) => [s.x, s.x + s.cx]);
  const ys = D.shapes.flatMap((s) => [s.y, s.y + s.cy]);
  const BOX = {
    x: Math.min(...xs) - PAD, y: Math.min(...ys) - PAD,
    w: Math.max(...xs) - Math.min(...xs) + PAD * 2,
    h: Math.max(...ys) - Math.min(...ys) + PAD * 2,
  };
  const pct = (v, t) => ((v / t) * 100).toFixed(3);

  // ── 상자 갈래 ───────────────────────────────────────────────────────────
  // 가름틀은 **다른 상자를 두 개 이상 품고 있는** 큰 네모다. 크기만 보면 긴 설명
  // 상자까지 가름틀로 잡힌다(552p 의 WTO/TRIPs 설명이 그랬다).
  const anchorText = opts.anchorText ?? "총칙";
  const inside = (a, b) => b.x >= a.x && b.y >= a.y && b.x + b.cx <= a.x + a.cx && b.y + b.cy <= a.y + a.cy;
  const isPanel = (s) =>
    s.cy > IN * 1.1 && s.cx > IN * 2.5 &&
    D.shapes.filter((t) => t !== s && inside(s, t)).length >= 2;
  const panels = D.shapes.filter(isPanel);
  const panelLeft = panels.length ? Math.min(...panels.map((p) => p.x)) : Infinity;
  const forced = opts.kinds ?? {};
  const kindOf = (s) => {
    if (forced[s.id]) return forced[s.id];
    if (s.text.join("") === anchorText) return "anchor";
    if (isPanel(s)) return "panel";
    return s.x + s.cx <= panelLeft ? "spine" : "leaf";
  };

  // ── 붙은 지점 ───────────────────────────────────────────────────────────
  const site = (id, idx) => {
    const s = byId.get(id);
    const mx = s.x + s.cx / 2, my = s.y + s.cy / 2;
    return [[mx, s.y], [s.x, my], [mx, s.y + s.cy], [s.x + s.cx, my]][Number(idx)];
  };
  const HORZ = (i) => i === "1" || i === "3";
  const OUT = 140000;
  const detours = opts.detours ?? {};

  // 저장된 꺾임 그대로 — 한쪽이 어느 도형에도 안 붙은 선에만 쓴다. 그런 선은 자기
  // 좌표가 곧 진실이라 낡을 일이 없다(붙은 도형이 움직이면서 어긋나는 게 아니므로).
  const adjOf = (l, name) => {
    const g = l.adj.find((a) => a.name === name);
    return g ? Number(g.fmla.replace("val ", "")) / 100000 : 0.5;
  };
  function storedPoints(l) {
    const w = l.cx, h = l.cy;
    let pts;
    switch (l.geom) {
      case "bentConnector2": pts = [[0, 0], [w, 0], [w, h]]; break;
      case "bentConnector3": {
        const x1 = w * adjOf(l, "adj1");
        pts = [[0, 0], [x1, 0], [x1, h], [w, h]]; break;
      }
      case "bentConnector4": {
        const x1 = w * adjOf(l, "adj1"), y1 = h * adjOf(l, "adj2");
        pts = [[0, 0], [x1, 0], [x1, y1], [w, y1], [w, h]]; break;
      }
      case "bentConnector5": {
        const x1 = w * adjOf(l, "adj1"), y1 = h * adjOf(l, "adj2"), x2 = w * adjOf(l, "adj3");
        pts = [[0, 0], [x1, 0], [x1, y1], [x2, y1], [x2, h], [w, h]]; break;
      }
      default: pts = [[0, 0], [w, h]];
    }
    return pts.map(([px, py]) => [
      l.x + (l.flipH ? w - px : px), l.y + (l.flipV ? h - py : py),
    ]);
  }

  function routeOf(l) {
    if (!l.from && !l.to) return storedPoints(l); // 양쪽 다 안 붙은 짧은 장식선
    if (!l.from || !l.to) {
      // ★한쪽만 붙은 선은 저장 좌표가 낡았을 수도, 멀쩡할 수도 있다. **붙은 쪽 끝이
      //   제 접점에 정확히 놓여 있으면** 그 선은 안 옮겨진 것이니 저장분을 그대로 쓴다
      //   (정지 효과 앞 화살표는 어긋남 0 — 꺾쇠와 딱 붙어야 한다). 어긋나 있으면
      //   낡은 것이므로 붙은 쪽에서 짧게만 뺀다(46p 의 가름틀 꺾쇠 셋이 그랬다).
      const atEnd = !l.from;
      const [id, idx] = atEnd ? [l.to, l.toIdx] : [l.from, l.fromIdx];
      const p = site(id, idx);
      const pts = storedPoints(l);
      const tip = atEnd ? pts[pts.length - 1] : pts[0];
      if (Math.hypot(tip[0] - p[0], tip[1] - p[1]) < 73000) { // 0.08인치
        if (atEnd) pts[pts.length - 1] = p; else pts[0] = p;
        return pts;
      }
      const dir = [[0, -1], [-1, 0], [0, 1], [1, 0]][Number(idx)];
      const q = [p[0] + dir[0] * 200000, p[1] + dir[1] * 200000];
      return atEnd ? [q, p] : [p, q];
    }
    const p0 = site(l.from, l.fromIdx), p1 = site(l.to, l.toIdx);
    const c = detours[`${l.from}>${l.to}`];
    if (c) return c(p0, p1, { BOX, byId });
    if (l.geom === "straightConnector1" || l.geom === "line") return [p0, p1];
    const h0 = HORZ(l.fromIdx), h1 = HORZ(l.toIdx);
    if (h0 && h1) {
      const facing = (l.fromIdx === "3" && p1[0] > p0[0]) || (l.fromIdx === "1" && p1[0] < p0[0]);
      const x = facing ? (p0[0] + p1[0]) / 2
        : (l.fromIdx === "3" ? Math.max(p0[0], p1[0]) + OUT : Math.min(p0[0], p1[0]) - OUT);
      return [p0, [x, p0[1]], [x, p1[1]], p1];
    }
    if (!h0 && !h1) {
      const facing = (l.fromIdx === "2" && p1[1] > p0[1]) || (l.fromIdx === "0" && p1[1] < p0[1]);
      const y = facing ? (p0[1] + p1[1]) / 2
        : (l.fromIdx === "2" ? Math.max(p0[1], p1[1]) + OUT : Math.min(p0[1], p1[1]) - OUT);
      return [p0, [p0[0], y], [p1[0], y], p1];
    }
    return h0 ? [p0, [p1[0], p0[1]], p1] : [p0, [p0[0], p1[1]], p1];
  }

  // 커스텀 도형(a:custGeom)의 점은 a:gd 에 X, Y 가 번갈아 들어 있다.
  //   "*/ A w C" → A * 가로 / C
  const gdVal = (fmla, w, h) => {
    const m = /^\*\/\s+(-?\d+)\s+([wh])\s+(-?\d+)$/.exec(fmla);
    if (!m) return 0;
    return (Number(m[1]) * (m[2] === "w" ? w : h)) / Number(m[3]);
  };
  const bracketPaths = brackets.map((b) => {
    const pts = [];
    for (let i = 0; i + 1 < b.adj.length; i += 2) {
      const px = gdVal(b.adj[i].fmla, b.cx, b.cy);
      const py = gdVal(b.adj[i + 1].fmla, b.cx, b.cy);
      pts.push([
        b.x + (b.flipH ? b.cx - px : px) - BOX.x,
        b.y + (b.flipV ? b.cy - py : py) - BOX.y,
      ]);
    }
    if (pts.length < 2) return "";
    const d = pts.map(([x, y], k) => (k === 0 ? "M" : "L") + Math.round(x) + " " + Math.round(y)).join(" ");
    return `<path class="ln" d="${d}"/>`;
  }).filter(Boolean).join("\n            ");

  const RED = "#FF0000";
  const paths = D.links.map((l) => {
    const r = routeOf(l);
    if (!r) return "";
    const d = r.map(([x, y], k) =>
      (k === 0 ? "M" : "L") + Math.round(x - BOX.x) + " " + Math.round(y - BOX.y)).join(" ");
    const red = l.line.color === RED;
    const mk = (side, at) =>
      (l.line[side] === "triangle" ? ` marker-${at}="url(#${red ? "ah" : "ag"})"` : "");
    return `<path class="ln${red ? " hot" : ""}" d="${d}"${mk("head", "start")}${mk("tail", "end")}/>`;
  }).filter(Boolean).join("\n            ");

  // 글을 갈아 끼우는 자리. 강의노트가 옛 표기를 쓰고 있을 때만 쓴다(근거를 함께 적을 것).
  const renames = opts.renames ?? {};
  // ★가름틀끼리 0.05인치밖에 안 떨어져 있어 위아래 테두리가 맞닿아 보인다. 틀만 조금
  //   안으로 줄여 사이를 벌리되, **안의 상자와도 여유를 남긴다** — 네 변을 따로 계산해
  //   상자에 바짝 붙는 쪽은 덜 줄인다(대리인 틀은 아래쪽 여유가 0.08인치뿐이다).
  //   설명 상자(note)도 같이 줄인다 — 위아래 상자와 0.06인치밖에 안 떨어져 테두리가
  //   맞닿아 보인다는 지적(국제조약: 파리조약 설명↔스트라스부르그, PCT 설명↔SPLT).
  const WANT = 55000;   // 줄이고 싶은 만큼 ≈ 0.06인치
  const KEEP = 55000;   // 안의 상자와 남길 최소 틈
  const insetOf = (p) => {
    const kids = D.shapes.filter((t) => t !== p && inside(p, t));
    if (kids.length === 0) return [WANT, WANT, WANT, WANT];
    const room = [
      Math.min(...kids.map((k) => k.y - p.y)),                       // 위
      Math.min(...kids.map((k) => p.x + p.cx - (k.x + k.cx))),       // 오른
      Math.min(...kids.map((k) => p.y + p.cy - (k.y + k.cy))),       // 아래
      Math.min(...kids.map((k) => k.x - p.x)),                       // 왼
    ];
    return room.map((r) => Math.max(0, Math.min(WANT, r - KEEP)));
  };
  const div = (s) => {
    const k = kindOf(s);
    // ★설명 상자는 **아래만** 줄인다. 위까지 줄이면 짝인 이름 상자와 윗변이 어긋난다
    //   (원장 지적 2026-09-09) — 두 상자는 같은 줄에서 시작해야 한다.
    const [it, ir, ib, il] =
      k === "panel" ? insetOf(s) : k === "note" ? [0, 0, WANT, 0] : [0, 0, 0, 0];
    // 줄머리 표시는 **번호도 붙임표도 없는 줄**에만 단다 — 원본이 그렇다.
    const lines = (renames[s.id] ?? s.text).map((t) => {
      const c = /^\d+\.\s/.test(t) ? " num" : /^[-–]\s/.test(t) ? " sub" : "";
      return `<span class="l${c}">${esc(t)}</span>`;
    }).join("");
    return `<div class="bx ${k}" style="left:${pct(s.x + il - BOX.x, BOX.w)}%;top:${
      pct(s.y + it - BOX.y, BOX.h)}%;width:${pct(s.cx - il - ir, BOX.w)}%;height:${
      pct(s.cy - it - ib, BOX.h)}%">${lines}</div>`;
  };
  // ★패널(가름틀)을 먼저 깔고 그 위에 선, 그 위에 나머지 상자. 순서를 바꾸면 틀이
  //   선과 글자를 덮는다.
  const back = D.shapes.filter((s) => kindOf(s) === "panel").map(div).join("\n        ");
  const front = D.shapes.filter((s) => kindOf(s) !== "panel").map(div).join("\n        ");

  const html = `<div class="dgwrap">
      <div class="dg" style="aspect-ratio:${BOX.w} / ${BOX.h};min-width:${opts.minWidth ?? 940}px${opts.fontScale ? `;--dgfs:${opts.fontScale}` : ""}">
        ${back}
        <svg class="dgsvg" viewBox="0 0 ${BOX.w} ${BOX.h}" preserveAspectRatio="none" aria-hidden="true"
             style="--sw:${Math.round(BOX.w / 1100)}">
          <defs>
            <marker id="ag${opts.key ?? ""}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5"
                    orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" class="mg"/></marker>
            <marker id="ah${opts.key ?? ""}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5"
                    orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" class="mh"/></marker>
          </defs>
            ${bracketPaths}
            ${paths.replace(/url\(#(ag|ah)\)/g, (m, g) => `url(#${g}${opts.key ?? ""})`)}
        </svg>
        ${front}
      </div>
    </div>`;

  return { html, box: BOX, shapes: D.shapes, links: D.links, routeOf, kindOf };
}

// 그림 공통 스타일. 글자는 상자 갈래를 가리지 않고 한 벌로 — 갈래는 채움색이 말한다.
export const DIAGRAM_CSS = `
  .dgwrap { overflow-x:auto; padding:14px 16px 16px; }
  .dg { position:relative; width:100%; container-type:inline-size; }
  .dgsvg { position:absolute; inset:0; width:100%; height:100%; }
  .ln { fill:none; stroke:var(--dgline); stroke-width:var(--sw); }
  .ln.hot { stroke:var(--hot); }
  .mg { fill:var(--dgline); }
  .mh { fill:var(--hot); }

  .bx {
    position:absolute; display:flex; flex-direction:column; justify-content:center;
    align-items:center; text-align:center; border:1px solid var(--dgline);
    border-radius:2px; font-size:calc(1cqw * var(--dgfs, 1)); line-height:1.3; font-weight:700;
    letter-spacing:-.01em; padding:0 calc(.3cqw * var(--dgfs, 1)); overflow:hidden;
  }
  .bx span { display:block; white-space:nowrap; }
  .bx.anchor { background:var(--anchor); color:var(--anchor-fg); border-color:transparent; }
  .bx.spine  { background:var(--blue-bg); color:var(--ink); border-color:var(--blue-line); }
  .bx.leaf   { background:var(--gray-bg); color:var(--ink); }
  /* 테두리 없는 이름표 — 묶음 이름처럼 상자가 필요 없는 글자. */
  /* 선 위에 얹는 이름표 — 테두리는 없지만 바탕은 깔아 선을 가린다. */
  .bx.label  { background:var(--card); border-color:transparent; color:var(--ink); }
  /* 설명 상자 — 점선 테두리, 왼쪽 맞춤, 줄머리 네모. 원본 그대로다. */
  .bx.note {
    background:transparent; border-style:dashed; border-color:var(--note-line);
    justify-content:flex-start; align-items:stretch; text-align:left;
    /* 틀을 조금 줄였으니 글자도 살짝 줄여 넘치지 않게 한다. */
    font-weight:600; font-size:calc(.92cqw * var(--dgfs, 1)); line-height:1.45; padding:calc(.25cqw * var(--dgfs, 1)) calc(.55cqw * var(--dgfs, 1));
  }
  .bx.note span { position:relative; padding-left:calc(1cqw * var(--dgfs, 1)); white-space:normal; }
  .bx.note span.l:not(.num):not(.sub)::before {
    content:""; position:absolute; left:calc(.15cqw * var(--dgfs, 1)); top:.5em;
    width:calc(.32cqw * var(--dgfs, 1)); height:calc(.32cqw * var(--dgfs, 1)); background:var(--note-mark);
  }
  /* 번호 줄·붙임표 줄은 그 자체가 구분자라 표시를 달지 않는다(원장 지시). */
  .bx.note span.num { padding-left:calc(.55cqw * var(--dgfs, 1)); }
  .bx.note span.sub { padding-left:calc(1.5cqw * var(--dgfs, 1)); }
  /* 가름틀 — 제목이 왼쪽 위에 붙는다. 안쪽은 비워 두고 상자들이 그 위에 얹힌다.
     ★글자 크기는 다른 상자와 같게 둔다(원장 지시 2026-09-09) — 갈래는 색과 자리가 말한다. */
  .bx.panel {
    justify-content:flex-start; align-items:flex-start; text-align:left;
    background:transparent; border-color:var(--panel-line); color:var(--panel-ink);
    padding:calc(.7cqw * var(--dgfs, 1)) calc(.8cqw * var(--dgfs, 1)) calc(.5cqw * var(--dgfs, 1));
  }
`;

export const DIAGRAM_TOKENS = {
  light: `--dgline:#8a8a8a; --anchor:#2f5597; --anchor-fg:#fff; --blue-bg:#dae3f3;
    --blue-line:#8faadc; --gray-bg:#e7e6e6; --panel-line:#bfbfbf; --panel-ink:#943634;
    --note-line:#b9b9b9; --note-mark:#5b6b8c;`,
  dark: `--dgline:rgba(255,255,255,.42); --anchor:#4a72b8; --anchor-fg:#fff;
    --blue-bg:rgba(120,160,220,.24); --blue-line:rgba(143,170,220,.5);
    --gray-bg:rgba(255,255,255,.1); --panel-line:rgba(255,255,255,.24); --panel-ink:#e0857f;
    --note-line:rgba(255,255,255,.3); --note-mark:#8fa6cc;`,
};
