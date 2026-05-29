// 체계도(상표법).hwpx → systematic-tree JSON (systematic-tree-patent.json 과 동일 nested 포맷).
//
// 입력: source/체계도(상표법).hwpx (zip — adm-zip 으로 직접 읽음)
// 출력: source/_converted/systematic-tree-trademark.json
//
// 단락 텍스트의 리터럴 마커로 4레벨 트리 구성:
//   "NN <제목>"     → L1 분류 (예: 01 총칙/보칙)
//   "[NN] <제목>"   → L2 분류 (예: [01] 총칙 규정)
//   "• <라벨>(法 …)" → L3 리프 (조문 ref)
//   "- <라벨>"       → L4 하위개념 (ref 없음 보통)

import { writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";
import AdmZip from "adm-zip";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const HWPX = resolve(ROOT, "source/체계도(상표법).hwpx");
const OUT = resolve(ROOT, "source/_converted/systematic-tree-trademark.json");
if (!existsSync(HWPX)) {
  console.error(`hwpx 없음: ${HWPX}`);
  process.exit(1);
}

// hwpx(zip) 에서 본문 section XML 들을 모아 읽음 (Contents/section0.xml, section1.xml …)
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

// 운영자 큐레이션 — 이 리프는 별도 노드로 만들지 않고, 그 조문 ref 를 상위 카테고리에 직접 붙인다.
//   { under: 상위(L2 또는 L1) 라벨, label: 리프 라벨 }
const LEAF_MERGE_TO_PARENT = [{ under: "[02] 보칙 규정", label: "보칙" }];
const mergeToParent = (parentLabel, label) =>
  LEAF_MERGE_TO_PARENT.some((e) => e.under === parentLabel && e.label === label);

// "(法 …)" ref 추출 → {label, ref|null}
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
    l2 = { ord: l1.children.length + 1, label: `[${m[1]}] ${m[2].trim()}`, children: [] };
    l1.children.push(l2);
    l3 = null;
  } else if (/^•/.test(raw)) {
    const { label, ref } = splitRef(raw.replace(/^•\s*/, ""));
    const parent = l2 ?? l1;
    if (!parent) continue;
    if (mergeToParent(parent.label, label)) {
      if (ref) parent.ref = ref; // 조문 링크를 상위 카테고리로 끌어올림
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
    // 마커 없는 잡라인 — 무시(로그)
    console.warn(`  ? 미분류: ${raw.slice(0, 50)}`);
  }
}

// 빈 children 배열 정리(리프)
function clean(node) {
  if (node.children && node.children.length === 0) delete node.children;
  else if (node.children) node.children.forEach(clean);
}
tree.forEach(clean);

const out = {
  law_code: "trademark",
  root_label: "상표법 체계도",
  source: "체계도(상표법).hwpx (리담 상표법)",
  tree,
};
writeFileSync(OUT, JSON.stringify(out, null, 2), "utf8");

const count = (ns) => ns.reduce((a, n) => a + 1 + (n.children ? count(n.children) : 0), 0);
console.log(`✓ ${OUT}`);
console.log(`  대분류 ${tree.length} / 전체 노드 ${count(tree)}`);
console.log("  대분류: " + tree.map((t) => t.label).join(" / "));
