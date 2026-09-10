// 총칙 그림에서 **축(spine) 항목이 어느 갈래(panel)에 붙는가** 를 원본 연결선으로 찾는다.
//
//   node scripts/digest/pipeline/p3-spine-map.mjs
//
// ★좌표(줄 맞추기)로 풀면 안 된다 — 이 그림은 나무처럼 퍼져서 축의 줄과 잎의 줄이
//   맞지 않는다. 연결선이 정답이다(메모: lecture-note-connector-source).
import { readFileSync } from "node:fs";

const IN = 914400;
const D = JSON.parse(readFileSync("scripts/digest/pipeline/note-p45-46.json", "utf8"));

const shapes = D.shapes.filter((s) => s.text.join("").trim());
const byId = new Map(shapes.map((s) => [s.id, s]));
const inside = (a, b) =>
  b.x >= a.x && b.y >= a.y && b.x + b.cx <= a.x + a.cx && b.y + b.cy <= a.y + a.cy;
const isPanel = (s) =>
  s.cy > IN * 1.1 && s.cx > IN * 2.5 && shapes.filter((t) => t !== s && inside(s, t)).length >= 2;
const panels = shapes.filter(isPanel);
const panelLeft = Math.min(...panels.map((p) => p.x));
const kindOf = (s) =>
  s.text.join("") === "총칙" ? "anchor" : isPanel(s) ? "panel" : s.x + s.cx <= panelLeft ? "spine" : "leaf";

const t = (s) => s.text.join(" ").replace(/\s+/g, " ").trim();
const spines = shapes.filter((s) => kindOf(s) === "spine");

console.log(`축 ${spines.length} · 갈래 ${panels.length} · 선 ${D.links.length}\n`);

for (const sp of spines) {
  // 이 축에서 뻗어 나가는 선의 반대쪽 끝.
  const outs = D.links
    .filter((l) => l.from === sp.id || l.to === sp.id)
    .map((l) => (l.from === sp.id ? l.to : l.from))
    .filter(Boolean)
    .map((id) => byId.get(id))
    .filter(Boolean);
  // 반대쪽 끝이 든 갈래(끝이 잎이면 그 잎을 품은 갈래).
  const reached = new Set();
  for (const o of outs) {
    if (kindOf(o) === "panel") reached.add(t(o));
    else {
      const p = panels.find((x) => inside(x, o));
      if (p) reached.add(t(p));
    }
  }
  console.log(
    `${t(sp).padEnd(34)} → 선 ${String(outs.length).padStart(2)}개 · 갈래 [${[...reached].join(" | ") || "없음"}]`,
  );
}
