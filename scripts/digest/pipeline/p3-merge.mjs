// 총칙 그림 합치기 — 강의노트 45p 한 장에 46p 의 **세 갈래만** 오른쪽에 붙인다.
//
//   node scripts/digest/pipeline/p3-merge.mjs   # note-p45-46.json 을 새로 만든다
//
// ★원장 지시(2026-09-10): 두 그림을 하나로. **축(왼쪽 뼈대)은 45p 것을 그대로 두고**,
//   46p 에서는 「기일과 기간」·「특허에 관한 절차 일반」·「절차의 정지」 세 갈래만 가져온다.
//   46p 의 뼈대는 45p 와 같은 줄이라 겹치므로 버린다.
// ★두 장은 상자 번호가 겹친다(30·33·35·37·41·48·60 …) — 46p 쪽에 `b` 를 붙여 갈라 놓지
//   않으면 선이 엉뚱한 상자에 붙는다.
import { readFileSync, writeFileSync } from "node:fs";

const EMU = 914400; // 1인치
const GAP = Math.round(0.45 * EMU); // 45p 오른쪽 끝과 붙일 갈래 사이 간격
const P45 = "scripts/digest/pipeline/note-p45.json";
const P46 = "scripts/digest/pipeline/note-p46.json";
const OUT = "scripts/digest/pipeline/note-p45-46.json";

/** 46p 에서 가져올 갈래(패널) — 그 안에 든 상자는 자동으로 딸려 온다. */
const PANELS = ["225", "226", "227"];

const A = JSON.parse(readFileSync(P45, "utf8"));
const B = JSON.parse(readFileSync(P46, "utf8"));

const box = (s) => ({ x1: s.x, y1: s.y, x2: s.x + s.cx, y2: s.y + s.cy });
const panels = B.shapes.filter((s) => PANELS.includes(s.id));
if (panels.length !== PANELS.length) throw new Error("가져올 갈래를 찾지 못했습니다");

// 갈래 테두리 안에 들어 있으면 그 갈래의 것이다(1000EMU ≈ 0.001인치 여유).
const inPanel = (s) =>
  panels.some((p) => {
    const r = box(p);
    const q = box(s);
    return q.x1 >= r.x1 - 1000 && q.y1 >= r.y1 - 1000 && q.x2 <= r.x2 + 1000 && q.y2 <= r.y2 + 1000;
  });

const keep = B.shapes.filter((s) => PANELS.includes(s.id) || inPanel(s));
const keepIds = new Set(keep.map((s) => s.id));

const maxAx = Math.max(...A.shapes.map((s) => s.x + s.cx));
const minBx = Math.min(...keep.map((s) => s.x));
const dx = maxAx + GAP - minBx;

const rid = (id) => `b${id}`;
const moved = keep.map((s) => ({ ...s, id: rid(s.id), x: s.x + dx }));

// ★한쪽 끝만 도형에 붙은 선도 가져와야 한다 — 꺾쇠에서 「정지 효과」로 가는 화살표가
//   그렇다. 양끝이 다 붙은 선만 챙기면 그 화살표가 사라진다(원장 지적 2026-09-10).
//   붙지 않은 끝은 제 좌표가 곧 진실이므로, 그 좌표가 가져올 갈래 안에 있으면 챙긴다.
const area = panels.reduce(
  (a, p) => ({
    x1: Math.min(a.x1, p.x), y1: Math.min(a.y1, p.y),
    x2: Math.max(a.x2, p.x + p.cx), y2: Math.max(a.y2, p.y + p.cy),
  }),
  { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity },
);
const inArea = (l) =>
  l.x >= area.x1 - 1000 && l.y >= area.y1 - 1000 &&
  l.x + l.cx <= area.x2 + 1000 && l.y + l.cy <= area.y2 + 1000;
const endOk = (id) => (id ? keepIds.has(id) : true);

const movedLinks = B.links
  .filter((l) => endOk(l.from) && endOk(l.to) && (l.from || l.to ? true : inArea(l)))
  .filter((l) => (l.from && l.to) || inArea(l))
  .map((l) => ({
    ...l,
    id: rid(l.id),
    from: l.from ? rid(l.from) : l.from,
    to: l.to ? rid(l.to) : l.to,
    x: l.x + dx,
  }));

// 46p 에만 있던 선 중 한쪽 끝이 버려진 상자에 붙은 것은 함께 버린다(위 filter).
const out = {
  slide: `${A.slide}+${B.slide}`,
  shapes: [...A.shapes, ...moved],
  links: [...A.links, ...movedLinks],
};

writeFileSync(OUT, JSON.stringify(out, null, 1), "utf8");
const w = Math.max(...out.shapes.map((s) => s.x + s.cx)) / EMU;
const h = Math.max(...out.shapes.map((s) => s.y + s.cy)) / EMU;
console.log(
  `합침: 상자 ${A.shapes.length} + ${moved.length} = ${out.shapes.length} · ` +
    `선 ${A.links.length} + ${movedLinks.length} = ${out.links.length} · ` +
    `${w.toFixed(2)}×${h.toFixed(2)}인치 → ${OUT}`,
);
