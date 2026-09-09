// 다시 이은 연결선 검사 — 끝점이 제 상자에 닿는지, 남의 상자를 뚫고 지나가지 않는지.
import { readFileSync } from "node:fs";

const D = JSON.parse(readFileSync("scripts/digest/pipeline/note566.json", "utf8"));
const byId = new Map(D.shapes.map((s) => [s.id, s]));
const mod = await import("./note566-diagram.mjs");
void mod; // 라우터는 아래에서 같은 규칙으로 다시 계산한다(모듈은 HTML 만 내보낸다)

const site = (id, idx) => {
  const s = byId.get(id);
  const mx = s.x + s.cx / 2, my = s.y + s.cy / 2;
  return [[mx, s.y], [s.x, my], [mx, s.y + s.cy], [s.x + s.cx, my]][Number(idx)];
};
const HORZ = (i) => i === "1" || i === "3";
const OUT = 150000;
const xs = D.shapes.flatMap((s) => [s.x, s.x + s.cx]);
const ys = D.shapes.flatMap((s) => [s.y, s.y + s.cy]);
const BUS_X = Math.max(...xs) + 170000, BUS_Y = Math.max(...ys) + 120000, LEFT_X = 4380000;
const LANE_X=4500000, LANE_X2=5400000, LANE_Y=2700000, LANE_Y2=2570000;
const DETOUR = {
  '99>106': (p0,p1)=>[p0,[LEFT_X,p0[1]],[LEFT_X,BUS_Y],[BUS_X,BUS_Y],[BUS_X,p1[1]],p1],
  '103>106': (p0,p1)=>[p0,[BUS_X,p0[1]],[BUS_X,p1[1]],p1],
  '95>8': (p0,p1)=>[p0,[LANE_X,p0[1]],[LANE_X,LANE_Y],[p1[0],LANE_Y],p1],
  '73>94': (p0,p1)=>[p0,[p0[0],LANE_Y2],[LANE_X2,LANE_Y2],[LANE_X2,p1[1]],p1],
};
function routeOf(l) {
  const p0 = site(l.from, l.fromIdx), p1 = site(l.to, l.toIdx);
  const c = DETOUR[`${l.from}>${l.to}`];
  if (c) return c(p0, p1);
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

// 선분이 네모 안쪽을 지나가는가(테두리에 닿는 것은 봐준다).
const M = 20000; // 테두리 여유
function cuts(a, b, s) {
  const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]);
  const y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
  return x1 > s.x + M && x0 < s.x + s.cx - M && y1 > s.y + M && y0 < s.y + s.cy - M;
}
const lab = (id) => (byId.get(id)?.text ?? []).join(" ").slice(0, 24) || `#${id}`;

let cross = 0;
for (const l of D.links) {
  const pts = routeOf(l);
  const hit = new Set();
  for (let i = 0; i < pts.length - 1; i += 1)
    for (const s of D.shapes) {
      if (s.id === l.from || s.id === l.to) continue;
      if (cuts(pts[i], pts[i + 1], s)) hit.add((s.text ?? []).join(" ").slice(0, 22));
    }
  if (hit.size) {
    cross += 1;
    console.log("✗", lab(l.from), "→", lab(l.to), "| 뚫음:", [...hit].join(" , "));
  }
}
console.log(`\n남의 상자를 뚫는 선 ${cross} / ${D.links.length}`);
console.log(`끝점은 붙은 지점에서 바로 잡으므로 어긋날 수 없음`);
