// note566.json → 강의노트 566p 그림을 그대로 옮긴 HTML+SVG.
//
// ★상자는 HTML 글자로 둔다 — 이미지로 만들면 빈칸 학습을 못 한다.
// ★연결선은 PPTX 에 저장된 좌표를 쓰지 않는다. 21줄기 중 5줄기가 낡아 있다(상자를 옮긴 뒤
//   파워포인트가 그릴 때 다시 잇기 때문). 대신 **붙은 지점**(stCxn/endCxn 의 도형 id 와 면
//   번호)으로 직접 잇는다 — 이건 21줄기 모두 정확하다. 검증: note566-verify.mjs
// ★면 번호는 네모 기준 0=위 1=왼 2=아래 3=오른.
import { readFileSync } from "node:fs";

const D = JSON.parse(readFileSync(new URL("./note566.json", import.meta.url), "utf8"));
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// ★글이 없는 네모는 꺾쇠용 투명 틀이다. 그리면 빈 회색 상자가 되어 남의 상자와
//   겹쳐 보인다(46p 에서 3곳). 자리 계산에서도 빼야 그림이 밀리지 않는다.
D.shapes = D.shapes.filter((s) => s.text.join("").trim());
const byId = new Map(D.shapes.map((s) => [s.id, s]));

// ── 갈래별 색. 원본(주황·연주황·연노랑·연파랑·흰색)을 토큰으로 옮긴 것. ────
const KEY = "6";                                          // 제201조
const ALSO = "86";                                        // 제42조의3
const ITEMS = ["7", "8", "9", "10", "11", "12"];          // 제201조가 묶는 여섯
const REFS = ["69", "68", "73", "72", "70", "71"];        // 관련 조문
const kindOf = (id) =>
  id === KEY ? "key" : id === ALSO ? "also"
    : ITEMS.includes(id) ? "item" : REFS.includes(id) ? "ref" : "mark";

// ── 그림이 차지하는 자리 ──────────────────────────────────────────────────
const PAD = 300000; // EMU. 화살촉과 바깥으로 도는 선이 잘리지 않게.
const xs = D.shapes.flatMap((s) => [s.x, s.x + s.cx]);
const ys = D.shapes.flatMap((s) => [s.y, s.y + s.cy]);
const BOX = {
  x: Math.min(...xs) - PAD, y: Math.min(...ys) - PAD,
  w: Math.max(...xs) - Math.min(...xs) + PAD * 2,
  h: Math.max(...ys) - Math.min(...ys) + PAD * 2,
};
const pct = (v, total) => ((v / total) * 100).toFixed(3);

// ── 붙은 지점 ─────────────────────────────────────────────────────────────
const site = (id, idx) => {
  const s = byId.get(id);
  const mx = s.x + s.cx / 2, my = s.y + s.cy / 2;
  return [[mx, s.y], [s.x, my], [mx, s.y + s.cy], [s.x + s.cx, my]][Number(idx)];
};
const HORZ = (idx) => idx === "1" || idx === "3";
const OUT = 150000; // 같은 쪽 면끼리 이을 때 밖으로 빼는 길이

// 바깥으로 크게 도는 두 줄기 — 원본이 도해를 가로지르지 않으려고 아래·오른쪽으로
// 돌린 길이다. 이것만 길을 적어 둔다(자동으로 이으면 가운데를 가로질러 버린다).
const BUS_X = Math.max(...xs) + 170000;   // 오른쪽 세로 줄기
const BUS_Y = Math.max(...ys) + 120000;   // 아래 가로 줄기
const LEFT_X = 4380000;                   // 제204조 항 왼쪽으로 빠지는 자리
const LANE_X = 4500000;                   // 노란 상자와 1·2 사이의 빈 통로
const LANE_X2 = 5400000;                  // 1·2 와 제208조 사이의 빈 통로
const LANE_Y = 2700000;                   // 번역문 교체 아래·부제출 효과 위의 빈 통로
const LANE_Y2 = 2570000;                  // 제209조 아래·제208조 위의 빈 통로
const DETOUR = {
  // 바깥으로 크게 도는 두 줄기 — 원본이 도해를 가로지르지 않으려고 아래·오른쪽으로 돌린 길.
  "99>106": (p0, p1) => [p0, [LEFT_X, p0[1]], [LEFT_X, BUS_Y], [BUS_X, BUS_Y], [BUS_X, p1[1]], p1],
  "103>106": (p0, p1) => [p0, [BUS_X, p0[1]], [BUS_X, p1[1]], p1],
  // 곧장 이으면 남의 상자를 뚫는 두 줄기 — 빈 통로로 돌린다.
  "95>8": (p0, p1) => [p0, [LANE_X, p0[1]], [LANE_X, LANE_Y], [p1[0], LANE_Y], p1],
  "73>94": (p0, p1) => [p0, [p0[0], LANE_Y2], [LANE_X2, LANE_Y2], [LANE_X2, p1[1]], p1],
};

function routeOf(l) {
  const p0 = site(l.from, l.fromIdx), p1 = site(l.to, l.toIdx);
  const custom = DETOUR[`${l.from}>${l.to}`];
  if (custom) return custom(p0, p1);
  if (l.geom === "straightConnector1" || l.geom === "line") return [p0, p1];

  const h0 = HORZ(l.fromIdx), h1 = HORZ(l.toIdx);
  if (h0 && h1) {
    // 서로 마주 보면 가운데에서 꺾고, 같은 쪽을 보면 바깥으로 빼서 돈다.
    const facing = (l.fromIdx === "3" && p1[0] > p0[0]) || (l.fromIdx === "1" && p1[0] < p0[0]);
    const x = facing
      ? (p0[0] + p1[0]) / 2
      : (l.fromIdx === "3" ? Math.max(p0[0], p1[0]) + OUT : Math.min(p0[0], p1[0]) - OUT);
    return [p0, [x, p0[1]], [x, p1[1]], p1];
  }
  if (!h0 && !h1) {
    const facing = (l.fromIdx === "2" && p1[1] > p0[1]) || (l.fromIdx === "0" && p1[1] < p0[1]);
    const y = facing
      ? (p0[1] + p1[1]) / 2
      : (l.fromIdx === "2" ? Math.max(p0[1], p1[1]) + OUT : Math.min(p0[1], p1[1]) - OUT);
    return [p0, [p0[0], y], [p1[0], y], p1];
  }
  // 한쪽만 가로 — 한 번만 꺾는다.
  return h0 ? [p0, [p1[0], p0[1]], p1] : [p0, [p0[0], p1[1]], p1];
}

const RED = "#FF0000";
const paths = D.links.map((l) => {
  const pts = routeOf(l).map(([x, y]) => [x - BOX.x, y - BOX.y]);
  const d = pts.map(([x, y], k) => (k === 0 ? "M" : "L") + Math.round(x) + " " + Math.round(y)).join(" ");
  const red = l.line.color === RED;
  const mk = (side, at) => (l.line[side] === "triangle" ? ` marker-${at}="url(#${red ? "ah" : "ag"})"` : "");
  return `<path class="ln${red ? " hot" : ""}" d="${d}"${mk("head", "start")}${mk("tail", "end")}/>`;
}).join("\n            ");

const boxes = D.shapes.map((s) => {
  const lines = s.text.map((t) => `<span>${esc(t)}</span>`).join("");
  return `<div class="bx ${kindOf(s.id)}" style="left:${pct(s.x - BOX.x, BOX.w)}%;top:${
    pct(s.y - BOX.y, BOX.h)}%;width:${pct(s.cx, BOX.w)}%;height:${pct(s.cy, BOX.h)}%">${lines}</div>`;
}).join("\n        ");

export const DIAGRAM_HTML = `<div class="dgwrap">
      <div class="dg">
        <svg class="dgsvg" viewBox="0 0 ${BOX.w} ${BOX.h}" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <marker id="ag" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5"
                    orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" class="mg"/></marker>
            <marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5"
                    orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" class="mh"/></marker>
          </defs>
            ${paths}
        </svg>
        ${boxes}
      </div>
    </div>`;

export const DIAGRAM_CSS = `
  /* ── 강의노트 566p 그림 ─────────────────────────────
     상자는 HTML 글자, 연결선은 SVG. 좁아지면 옆으로 밀어 본다 — 줄여 버리면
     한 눈에 보라고 만든 그림이 못 읽게 된다. */
  .dgwrap { overflow-x:auto; padding:14px 16px 16px; }
  .dg {
    position:relative; width:100%; min-width:940px;
    aspect-ratio:${BOX.w} / ${BOX.h}; container-type:inline-size;
  }
  .dgsvg { position:absolute; inset:0; width:100%; height:100%; }
  .ln { fill:none; stroke:var(--dgline); stroke-width:${Math.round(BOX.w / 1100)}; }
  .ln.hot { stroke:var(--hot); }
  .mg { fill:var(--dgline); }
  .mh { fill:var(--hot); }

  /* ★글자는 상자 종류를 가리지 않고 한 벌로 — 크기·굵기를 달리하면 같은 층인데도
     어떤 상자가 더 중요해 보인다. 갈래는 채움색이 말한다. */
  .bx {
    position:absolute; display:flex; flex-direction:column; justify-content:center;
    align-items:center; text-align:center; border:1px solid var(--dgline);
    border-radius:2px; font-size:1cqw; line-height:1.3; font-weight:700;
    letter-spacing:-.01em; padding:0 .3cqw; overflow:hidden;
  }
  .bx span { display:block; white-space:nowrap; }
  .bx.key  { background:var(--amber); color:var(--amber-ink); }
  .bx.also { background:var(--peach); color:var(--amber-ink); }
  .bx.item { background:var(--amber-bg); color:var(--ink); }
  .bx.ref  { background:var(--blue-bg); color:var(--ink); }
  .bx.mark { background:var(--card); color:var(--ink); }
`;

export const DIAGRAM_TOKENS = {
  light: `--dgline:#8a8a8a; --amber:#ffc000; --amber-ink:#3a2c00; --peach:#f4b183;
    --amber-bg:#fff2cc; --blue-bg:#dae3f3;`,
  dark: `--dgline:rgba(255,255,255,.42); --amber:#d09b1c; --amber-ink:#1c1500; --peach:#c9855a;
    --amber-bg:rgba(255,194,0,.18); --blue-bg:rgba(120,160,220,.22);`,
};
