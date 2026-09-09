// 강의노트 566p(7. PCT 슬라이드 30) → 도형·연결선 데이터(JSON).
//
// ★도형은 자리(a:off)·크기(a:ext)·채움색·문단별 글, 연결선은 자리·크기·꺾임 모양
//   (prstGeom prst + 조정값)·좌우상하 뒤집기·화살촉을 그대로 뽑는다. 이걸로 그림을
//   원본 배치대로 다시 그린다.
// ★연결선은 stCxn/endCxn 에 붙은 도형 id 가 적혀 있어 어디에서 어디로인지도 함께 남긴다.
import { writeFileSync } from "node:fs";
import AdmZip from "adm-zip";
import { XMLParser } from "fast-xml-parser";

const zip = new AdmZip("source/특허법/특허법 강의노트/7. PCT_특허법 강의노트.pptx");
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", preserveOrder: true });

const pres = parser.parse(zip.getEntry("ppt/presentation.xml").getData().toString("utf8"));
function findAll(root, tag) {
  const out = [];
  const st = [root];
  while (st.length) {
    const n = st.shift();
    if (Array.isArray(n)) { st.unshift(...n); continue; }
    if (!n || typeof n !== "object") continue;
    for (const [k, v] of Object.entries(n)) {
      if (k === ":@" || !v || typeof v !== "object") continue;
      if (k === tag) out.push({ body: v, attrs: n[":@"] ?? {} });
      else st.push(v);
    }
  }
  return out;
}
const first = (root, tag) => findAll(root, tag)[0] ?? null;

const sz = first(pres, "p:sldSz").attrs;
const SLIDE = { w: Number(sz["@cx"]), h: Number(sz["@cy"]) };

const doc = parser.parse(zip.getEntry("ppt/slides/slide30.xml").getData().toString("utf8"));

/** 문단별 글. 상자 안 줄바꿈을 살린다. */
function paras(node) {
  return findAll(node, "a:p").map((p) =>
    findAll(p.body, "a:t").map((t) => {
      const v = t.body;
      return (Array.isArray(v) ? v : [v]).map((x) => x?.["#text"] ?? "").join("");
    }).join("").replace(/\s+/g, " ").trim(),
  ).filter(Boolean);
}
/** 채움색 — 단색만. 없으면 null(투명·상속). */
function fillOf(node) {
  const f = first(node, "a:solidFill");
  if (!f) return null;
  const s = first(f.body, "a:srgbClr");
  return s ? "#" + s.attrs["@val"] : null;
}
function lineOf(node) {
  const ln = first(node, "a:ln");
  if (!ln) return {};
  const s = first(ln.body, "a:srgbClr");
  return {
    color: s ? "#" + s.attrs["@val"] : null,
    head: first(ln.body, "a:headEnd")?.attrs["@type"] ?? "none",
    tail: first(ln.body, "a:tailEnd")?.attrs["@type"] ?? "none",
    w: Number(ln.attrs["@w"] ?? 0),
  };
}

const shapes = [];
const links = [];
const walk = [doc];
while (walk.length) {
  const n = walk.pop();
  if (Array.isArray(n)) { walk.push(...n); continue; }
  if (!n || typeof n !== "object") continue;
  for (const [k, v] of Object.entries(n)) {
    if (k === ":@" || !v || typeof v !== "object") continue;
    if (k === "p:sp" || k === "p:cxnSp") {
      const nv = first(v, "p:cNvPr").attrs;
      const xfrm = first(v, "a:xfrm");
      const off = first(v, "a:off")?.attrs ?? {};
      const ext = first(v, "a:ext")?.attrs ?? {};
      const geom = first(v, "a:prstGeom")?.attrs["@prst"] ?? null;
      const adj = findAll(v, "a:gd").map((g) => ({
        name: g.attrs["@name"], fmla: g.attrs["@fmla"],
      }));
      const common = {
        id: nv["@id"], name: nv["@name"],
        x: Number(off["@x"] ?? 0), y: Number(off["@y"] ?? 0),
        cx: Number(ext["@cx"] ?? 0), cy: Number(ext["@cy"] ?? 0),
        flipH: xfrm?.attrs["@flipH"] === "1", flipV: xfrm?.attrs["@flipV"] === "1",
        geom, adj,
      };
      if (k === "p:sp") {
        shapes.push({ ...common, text: paras(v), fill: fillOf(v), line: lineOf(v) });
      } else {
        const pr = first(v, "p:cNvCxnSpPr");
        links.push({
          ...common,
          from: first(pr.body, "a:stCxn")?.attrs["@id"] ?? null,
          fromIdx: first(pr.body, "a:stCxn")?.attrs["@idx"] ?? null,
          to: first(pr.body, "a:endCxn")?.attrs["@id"] ?? null,
          toIdx: first(pr.body, "a:endCxn")?.attrs["@idx"] ?? null,
          line: lineOf(v),
        });
      }
    }
    walk.push(v);
  }
}

// 슬라이드 머리(제목·쪽번호)는 그림이 아니다 — 자리가 0 인 개체 틀은 뺀다.
const diagram = shapes.filter((s) => s.cx > 0 && s.cy > 0);
const out = { slide: SLIDE, shapes: diagram, links };
writeFileSync("scripts/digest/pipeline/note566.json", JSON.stringify(out, null, 1), "utf8");
console.log("도형", diagram.length, "(제외", shapes.length - diagram.length, ") 연결선", links.length);
for (const s of diagram.slice().sort((a, b) => a.y - b.y || a.x - b.x))
  console.log(String(s.id).padStart(4), (s.fill ?? "-").padEnd(8), s.geom, "|", s.text.join(" / "));
console.log("\n연결선 모양:", [...new Set(links.map((l) => l.geom))].join(", "));
