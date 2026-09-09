// 다시 이은 연결선 검사 — 남의 상자를 뚫고 지나가지 않는지.
// 끝점은 붙은 지점에서 바로 잡으므로 어긋날 수 없다.
//   node scripts/digest/pipeline/note-verify.mjs <json…>
import { buildDiagram } from "./note-diagram.mjs";
import { DETOURS } from "./note-detours.mjs";

const M = 20000; // 테두리 여유
for (const file of process.argv.slice(2)) {
  const key = file.replace(/.*[\\/]|\.json$/g, "");
  const { shapes, links, routeOf, kindOf } = buildDiagram(file, { detours: DETOURS[key] ?? {} });
  const byId = new Map(shapes.map((s) => [s.id, s]));
  const lab = (id) => (byId.get(id)?.text ?? []).join(" ").slice(0, 24) || `#${id}`;
  // 가름틀은 안이 비어 있으니 뚫어도 된다.
  const solid = shapes.filter((s) => kindOf(s) !== "panel");
  let bad = 0, skipped = 0;
  for (const l of links) {
    const pts = routeOf(l);
    if (!pts) { skipped += 1; continue; }
    const hit = new Set();
    for (let i = 0; i < pts.length - 1; i += 1)
      for (const s of solid) {
        if (s.id === l.from || s.id === l.to) continue;
        const x0 = Math.min(pts[i][0], pts[i + 1][0]), x1 = Math.max(pts[i][0], pts[i + 1][0]);
        const y0 = Math.min(pts[i][1], pts[i + 1][1]), y1 = Math.max(pts[i][1], pts[i + 1][1]);
        if (x1 > s.x + M && x0 < s.x + s.cx - M && y1 > s.y + M && y0 < s.y + s.cy - M)
          hit.add(s.text.join(" ").slice(0, 22));
      }
    if (hit.size) {
      bad += 1;
      console.log(`✗ [${key}] ${lab(l.from)} → ${lab(l.to)} | 뚫음: ${[...hit].join(" , ")}`);
    }
  }
  console.log(`${key}: 뚫는 선 ${bad} / ${links.length}` + (skipped ? ` (붙은 데 없어 건너뜀 ${skipped})` : ""));
}
