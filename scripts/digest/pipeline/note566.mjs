// 강의노트 566p(7. PCT 슬라이드 30) — 도형과 연결선을 id 로 이어 읽는다.
// ★PPTX 연결선(p:cxnSp)은 stCxn/endCxn 에 **붙은 도형의 id** 가 적혀 있다. 좌표로 짐작할
//   필요가 없다. hwtx 쪽은 이 정보가 없어 좌표로 풀었지만, 여기서는 정답이 그대로 있다.
import AdmZip from "adm-zip";
import { XMLParser } from "fast-xml-parser";

const zip = new AdmZip("source/특허법/특허법 강의노트/7. PCT_특허법 강의노트.pptx");
const xml = zip.getEntry("ppt/slides/slide30.xml").getData().toString("utf8");
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", preserveOrder: true });
const doc = parser.parse(xml);

const shapes = new Map(); // id → {name, text, x, y, cx, cy}
const links = [];

const textOf = (node) => {
  let out = [];
  const st = [node];
  while (st.length) {
    const n = st.pop();
    if (Array.isArray(n)) { st.push(...[...n].reverse()); continue; }
    if (!n || typeof n !== "object") continue;
    for (const [k, v] of Object.entries(n)) {
      if (k === ":@" || !v || typeof v !== "object") continue;
      if (k === "a:t") for (const t of Array.isArray(v) ? v : [v]) out.push(t?.["#text"] ?? "");
      else st.push(v);
    }
  }
  return out.join("").replace(/\s+/g, " ").trim();
};

/** 이 노드 바로 아래에서 태그 하나를 찾는다(깊이 무관, 순서 보존). */
function find(node, tag) {
  const st = [node];
  while (st.length) {
    const n = st.shift();
    if (Array.isArray(n)) { st.unshift(...n); continue; }
    if (!n || typeof n !== "object") continue;
    for (const [k, v] of Object.entries(n)) {
      if (k === ":@" || !v || typeof v !== "object") continue;
      if (k === tag) return { body: v, attrs: n[":@"] ?? {} };
      st.push(v);
    }
  }
  return null;
}

// 슬라이드의 도형·연결선을 훑는다.
const stack = [doc];
while (stack.length) {
  const n = stack.pop();
  if (Array.isArray(n)) { stack.push(...n); continue; }
  if (!n || typeof n !== "object") continue;
  for (const [k, v] of Object.entries(n)) {
    if (k === ":@" || !v || typeof v !== "object") continue;
    if (k === "p:sp" || k === "p:cxnSp") {
      const props = find(v, k === "p:sp" ? "p:cNvSpPr" : "p:cNvCxnSpPr");
      const nv = find(v, "p:cNvPr");
      const id = nv?.attrs["@id"];
      const off = find(v, "a:off")?.attrs ?? {};
      const ext = find(v, "a:ext")?.attrs ?? {};
      if (k === "p:sp") {
        shapes.set(id, {
          id, name: nv?.attrs["@name"], text: textOf(v),
          x: Number(off["@x"] ?? 0), y: Number(off["@y"] ?? 0),
          cx: Number(ext["@cx"] ?? 0), cy: Number(ext["@cy"] ?? 0),
        });
      } else {
        const st2 = find(props?.body ?? v, "a:stCxn")?.attrs;
        const en = find(props?.body ?? v, "a:endCxn")?.attrs;
        links.push({ id, from: st2?.["@id"], to: en?.["@id"], name: nv?.attrs["@name"] });
      }
    }
    stack.push(v);
  }
}

const EMU = 914400;
console.log("도형", shapes.size, "연결선", links.length);
console.log("\n=== 도형 ===");
for (const s of [...shapes.values()].sort((a, b) => a.y - b.y || a.x - b.x))
  console.log(
    String(s.id).padStart(4),
    "x", (s.x / EMU).toFixed(2).padStart(6), "y", (s.y / EMU).toFixed(2).padStart(6),
    JSON.stringify(s.text).slice(0, 60));

console.log("\n=== 연결 ===");
const nm = (id) => (shapes.get(id)?.text || `#${id ?? "?"}`).slice(0, 34);
let unresolved = 0;
for (const l of links) {
  if (!l.from && !l.to) { unresolved += 1; continue; }
  console.log(nm(l.from).padEnd(36), "→", nm(l.to).padEnd(36), `(${l.name})`);
}
console.log("붙은 도형이 적혀 있지 않은 선:", unresolved);

const EMU2 = 914400;
const pos = (id) => {
  const s = shapes.get(id);
  return s ? `${(s.x / EMU2).toFixed(2)},${(s.y / EMU2).toFixed(2)}` : "?";
};
console.log("\n=== 연결(id·자리) ===");
for (const l of links)
  console.log(
    String(l.from).padStart(4) + "(" + pos(l.from).padStart(11) + ") " + nm(l.from).slice(0, 26).padEnd(28),
    "→",
    String(l.to).padStart(4) + "(" + pos(l.to).padStart(11) + ") " + nm(l.to).slice(0, 26).padEnd(28),
    l.name,
  );
console.log("\n=== 도형 이름·크기 ===");
for (const s of [...shapes.values()].filter((s) => s.text.length <= 3))
  console.log(String(s.id).padStart(4), JSON.stringify(s.text).padEnd(6),
    "이름", s.name, "크기", (s.cx / EMU2).toFixed(2), (s.cy / EMU2).toFixed(2));
