// 체계도(디보법).hwpx → systematic-tree JSON.
//
// 입력: source/체계도(디보법).hwpx
// 출력: source/_converted/systematic-tree-design.json
//
// 마커 규약은 patent/trademark 와 동일:
//   "NN <제목>"     → L1
//   "[NN] <제목>"   → L2
//   "• <라벨>(法 …)" → L3
//   "- <라벨>"       → L4

import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";
import AdmZip from "adm-zip";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const HWPX = resolve(ROOT, "source/체계도(디보법).hwpx");
const OUT = resolve(ROOT, "source/_converted/systematic-tree-design.json");
if (!existsSync(HWPX)) {
  console.error(`hwpx 없음: ${HWPX}`);
  process.exit(1);
}
mkdirSync(dirname(OUT), { recursive: true });

const zip = new AdmZip(HWPX);
const sectionXml = zip
  .getEntries()
  .filter((e) => /^Contents\/section\d+\.xml$/.test(e.entryName))
  .sort((a, b) => a.entryName.localeCompare(b.entryName))
  .map((e) => e.getData().toString("utf8"))
  .join("\n");
const $ = cheerio.load(sectionXml, { xmlMode: true });
const lines = [];
$("hp\\:p, p").each((_, el) => {
  let text = "";
  $(el)
    .find("hp\\:t, t")
    .each((__, t) => (text += $(t).text()));
  text = text.replace(/\s+/g, " ").trim();
  if (text) lines.push(text);
});

// 디자인보호법 운영자 큐레이션 — 필요 시 추가. 일단 비움.
const LEAF_MERGE_TO_PARENT = [];
const mergeToParent = (parentLabel, label) =>
  LEAF_MERGE_TO_PARENT.some((e) => e.under === parentLabel && e.label === label);

function splitRef(s) {
  const m = /\((法[^)]*)\)\s*$/.exec(s);
  if (!m) return { label: s.trim(), ref: null };
  return { label: s.slice(0, m.index).trim(), ref: m[1].trim() };
}

const tree = [];
let l1 = null,
  l2 = null,
  l3 = null;

for (const raw of lines) {
  let m;
  if ((m = /^(\d{2})\s+(.+)$/.exec(raw))) {
    l1 = { ord: tree.length + 1, label: `${m[1]} ${m[2].trim()}`, children: [] };
    tree.push(l1);
    l2 = null;
    l3 = null;
  } else if ((m = /^\[(\d{2})\]\s*(.+)$/.exec(raw))) {
    if (!l1) continue;
    l2 = {
      ord: l1.children.length + 1,
      label: `[${m[1]}] ${m[2].trim()}`,
      children: [],
    };
    l1.children.push(l2);
    l3 = null;
  } else if (/^•/.test(raw)) {
    const { label, ref } = splitRef(raw.replace(/^•\s*/, ""));
    const parent = l2 ?? l1;
    if (!parent) continue;
    if (mergeToParent(parent.label, label)) {
      if (ref) parent.ref = ref;
      l3 = null;
      continue;
    }
    l3 = { ord: parent.children.length + 1, label };
    if (ref) l3.ref = ref;
    l3.children = [];
    parent.children.push(l3);
  } else if (/^[-–]/.test(raw)) {
    const { label, ref } = splitRef(raw.replace(/^[-–]\s*/, ""));
    const parent = l3 ?? l2 ?? l1;
    if (!parent) continue;
    const leaf = { ord: parent.children.length + 1, label };
    if (ref) leaf.ref = ref;
    parent.children.push(leaf);
  } else {
    console.warn(`  ? 미분류: ${raw.slice(0, 50)}`);
  }
}

function clean(node) {
  if (node.children && node.children.length === 0) delete node.children;
  else if (node.children) node.children.forEach(clean);
}
tree.forEach(clean);

const out = {
  law_code: "design",
  root_label: "디자인보호법 체계도",
  source: "체계도(디보법).hwpx (리담 디자인보호법)",
  tree,
};
writeFileSync(OUT, JSON.stringify(out, null, 2), "utf8");

const count = (ns) => ns.reduce((a, n) => a + 1 + (n.children ? count(n.children) : 0), 0);
console.log(`✓ ${OUT}`);
console.log(`  대분류 ${tree.length} / 전체 노드 ${count(tree)}`);
console.log("  대분류: " + tree.map((t) => t.label).join(" / "));
