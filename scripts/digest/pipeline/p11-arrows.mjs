// 11p 오른쪽 도해(국내단계의 번역문 제출)의 화살표 복원.
//
// ★문서 전체를 파싱하면 느리고 스택이 넘친다 — 제목을 품은 묶음만 XML 에서 잘라 쓴다.
// ★연결선 = hp:offset(자리) + hp:orgSz(테두리) + startPt/endPt(테두리 안 상대점) + hp:flip.
// ★음수 좌표가 부호 없는 32비트로 저장돼 있다(4294519422 = -447874).
import AdmZip from "adm-zip";
import { XMLParser } from "fast-xml-parser";

const xml = new AdmZip("source/특허법/정리비교표.hwtx")
  .getEntry("Contents/section2.xml").getData().toString("utf8");

const at = xml.indexOf("국내단계의 번역문 제출");
if (at < 0) throw new Error("제목 못 찾음");

/** 그 자리를 품은 hp:container 들, 안쪽부터. */
function enclosingContainers(pos) {
  const found = [];
  const open = /<hp:container\b[^>]*>/g;
  let m;
  while ((m = open.exec(xml))) {
    if (m.index > pos) break;
    let depth = 0, end = -1;
    const scan = /<(\/?)hp:container\b[^>]*?(\/?)>/g;
    scan.lastIndex = m.index;
    let s2;
    while ((s2 = scan.exec(xml))) {
      if (s2[2] === "/") continue;
      depth += s2[1] === "/" ? -1 : 1;
      if (depth === 0) { end = s2.index + s2[0].length; break; }
    }
    if (end > pos) found.push({ start: m.index, end });
  }
  return found.reverse();
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", preserveOrder: true });
const num = (v) => {
  if (v == null) return null;
  const n = Number(v);
  return n > 2 ** 31 ? n - 2 ** 32 : n;
};
const SHAPE = new Set(["hp:rect", "hp:connectLine", "hp:line", "hp:polygon", "hp:container", "hp:ellipse"]);

function propsOf(body) {
  const p = {};
  for (const n of Array.isArray(body) ? body : []) {
    if (!n || typeof n !== "object") continue;
    for (const [k, v] of Object.entries(n)) {
      if (k === ":@" || SHAPE.has(k)) continue;
      const a = n[":@"] ?? {};
      if (k === "hp:offset") { p.ox = num(a["@x"]); p.oy = num(a["@y"]); }
      else if (k === "hp:orgSz") { p.w = num(a["@width"]); p.h = num(a["@height"]); }
      else if (k === "hp:flip") { p.fx = a["@horizontal"] === "1"; p.fy = a["@vertical"] === "1"; }
      else if (k === "hp:startPt") { p.sx = num(a["@x"]); p.sy = num(a["@y"]); }
      else if (k === "hp:endPt") { p.ex = num(a["@x"]); p.ey = num(a["@y"]); }
      else if (k === "hp:lineShape") { p.head = a["@headStyle"]; p.tail = a["@tailStyle"]; }
      else if (k === "hp:subList" || k === "hp:drawText") p.sub = v; // 글은 drawText 안에 있다
    }
  }
  return p;
}
function textOf(sub) {
  let out = "";
  const st = [sub];
  while (st.length) {
    const n = st.pop();
    if (Array.isArray(n)) { st.push(...n); continue; }
    if (!n || typeof n !== "object") continue;
    for (const [k, v] of Object.entries(n)) {
      if (k === ":@" || !v || typeof v !== "object") continue;
      if (k === "hp:t") for (const t of Array.isArray(v) ? v : [v]) out += t?.["#text"] ?? "";
      else if (!SHAPE.has(k)) st.push(v);
    }
  }
  return out.trim();
}
function collect(doc) {
  const shapes = [];
  const stack = [{ nodes: doc, base: { x: 0, y: 0 } }];
  while (stack.length) {
    const { nodes, base } = stack.pop();
    if (!Array.isArray(nodes)) continue;
    for (const n of nodes) {
      if (!n || typeof n !== "object") continue;
      for (const [k, v] of Object.entries(n)) {
        if (k === ":@" || !v || typeof v !== "object") continue;
        if (SHAPE.has(k)) {
          const p = propsOf(v);
          const abs = { x: base.x + (p.ox ?? 0), y: base.y + (p.oy ?? 0) };
          if (k !== "hp:container")
            shapes.push({ tag: k, ...p, ax: abs.x, ay: abs.y, text: p.sub ? textOf(p.sub) : "" });
          stack.push({ nodes: v, base: abs });
        } else stack.push({ nodes: Array.isArray(v) ? v : [v], base });
      }
    }
  }
  return shapes;
}

let shapes = [];
for (const c of enclosingContainers(at)) {
  const got = collect(parser.parse(xml.slice(c.start, c.end)));
  if (got.filter((g) => g.text).length >= 10) {
    shapes = got;
    console.log("쓴 묶음", c.end - c.start, "bytes / 도형", got.length);
    break;
  }
}
if (shapes.length === 0) throw new Error("글상자가 있는 묶음을 못 찾음");

const boxes = shapes.filter((s) => s.text);
const lines = shapes.filter((s) => !s.text && s.sx != null && s.ex != null);
console.log("글상자", boxes.length, "선", lines.length);

function nearest(x, y) {
  let best = null, bd = Infinity;
  for (const b of boxes) {
    const dx = Math.max(b.ax - x, 0, x - (b.ax + b.w));
    const dy = Math.max(b.ay - y, 0, y - (b.ay + b.h));
    const d = Math.hypot(dx, dy);
    if (d < bd) { bd = d; best = b; }
  }
  return { box: best, dist: bd };
}

console.log("\n=== 화살표 ===");
for (const l of lines) {
  const x1 = l.ax + (l.fx ? l.w - l.sx : l.sx), y1 = l.ay + (l.fy ? l.h - l.sy : l.sy);
  const x2 = l.ax + (l.fx ? l.w - l.ex : l.ex), y2 = l.ay + (l.fy ? l.h - l.ey : l.ey);
  const a = nearest(x1, y1), b = nearest(x2, y2);
  if (a.box === b.box) continue;
  const arrow = l.tail === "ARROW" ? "→" : l.head === "ARROW" ? "←" : "—";
  console.log(
    (a.box?.text ?? "?").slice(0, 30).padEnd(32), arrow,
    (b.box?.text ?? "?").slice(0, 30).padEnd(32),
    "거리", String(Math.round(a.dist)).padStart(5), String(Math.round(b.dist)).padStart(5),
  );
}

// ── 상자 자리와 선 자리 대조 ────────────────────────────────────────────
// hp:line 은 orgSz 가 100×100 뿐이고 실제 길이는 렌더링 행렬에 있다. 하지만 **자리**는
// 늘 출발 상자의 오른쪽(또는 아래) 모서리라, 자리만으로 어느 상자에서 어느 상자로
// 가는지 정해진다.
console.log("\n=== 상자 자리 ===");
for (const b of boxes.slice().sort((a, c) => a.ax - c.ax || a.ay - c.ay))
  console.log("x", String(b.ax).padStart(6), "~", String(b.ax + b.w).padStart(6),
    "y", String(b.ay).padStart(6), "~", String(b.ay + b.h).padStart(6), b.text);
console.log("\n=== 선 자리(길이 없는 것 포함) ===");
for (const l of shapes.filter((s) => !s.text && s.tag !== "hp:rect"))
  console.log(l.tag.replace("hp:", "").padEnd(12), "at", String(l.ax).padStart(6),
    String(l.ay).padStart(6), "sz", String(l.w).padStart(5), String(l.h).padStart(5),
    "head", String(l.head).padEnd(6), "tail", l.tail);

console.log("\n=== 아래쪽 표시 구역(항·호) ===");
for (const s of shapes
  .filter((s) => s.ay > 10000 && s.ax > 30000)
  .sort((a, b) => a.ay - b.ay || a.ax - b.ax))
  console.log(
    s.tag.replace("hp:", "").padEnd(12),
    "x", String(s.ax).padStart(6), "~", String(s.ax + (s.w ?? 0)).padStart(6),
    "y", String(s.ay).padStart(6), "~", String(s.ay + (s.h ?? 0)).padStart(6),
    "head", String(s.head ?? "-").padEnd(6), "tail", String(s.tail ?? "-").padEnd(6),
    JSON.stringify(s.text));
