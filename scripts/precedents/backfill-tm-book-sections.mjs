// tm-precedents.json → cases.book_sections 백필 (상표 337건)
//   교재 구조 그대로: 쟁점상표(표+도형 셀) / 사안의 쟁점 / 사실관계 / 전심의 판단 /
//   관련 법리 / 본심의 판단 / 인덱스 / 평석
//   셀 이미지: binId → cases.images 의 storagePath(tm16-{binId}.webp) 매칭 → URL
//
//   node scripts/precedents/backfill-tm-book-sections.mjs           # dry-run(1건 미리보기)
//   node scripts/precedents/backfill-tm-book-sections.mjs --apply
import "dotenv/config";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const data = JSON.parse(readFileSync("source/_converted/tm-precedents.json", "utf8"));

// 최초 수록분 기준 (시드와 동일 정책)
const bookCase = new Map();
for (const t of data.topics) for (const c of t.cases) if (!bookCase.has(c.caseNumber)) bookCase.set(c.caseNumber, c);

const SECTION_DEFS = [
  ["issues", "사안의 쟁점"],
  ["facts", "사실관계"],
  ["lower", "전심의 판단"],
  ["doctrine", "관련 법리"],
  ["holding", "본심의 판단"],
  ["index", "인덱스"],
  ["comment", "평석"],
];

function buildSections(c, imageUrlByBin) {
  const sections = [];
  const cellToBlock = (cell) => ({
    text: cell.text,
    images: (cell.imgs ?? [])
      .map((bin) => imageUrlByBin.get(bin.toLowerCase()))
      .filter(Boolean)
      .map((url) => ({ url, alt: "" })),
  });
  const tablesFor = (key) =>
    c.infoTables
      .filter((t) => t.section === key)
      .map((t) => ({ type: "table", rows: (t.cellRows ?? t.rows.map((r) => r.map((x) => ({ text: x, imgs: [] })))).map((row) => row.map(cellToBlock)) }));

  // 쟁점상표 — 헤더 직후(preamble) 도표
  const infoBlocks = [
    ...tablesFor("preamble"),
    ...(c.sections.preamble ?? []).map((t) => ({ type: "p", text: t })),
  ];
  if (infoBlocks.length) sections.push({ key: "mark", label: "쟁점상표", blocks: infoBlocks });

  for (const [key, label] of SECTION_DEFS) {
    const blocks = [
      ...(c.sections[key] ?? []).map((t) => ({ type: "p", text: t })),
      ...tablesFor(key),
    ];
    if (blocks.length) sections.push({ key, label, blocks });
  }
  return sections;
}

const { data: rows, error } = await sb
  .from("cases")
  .select("case_id, case_number, images")
  .contains("subject_laws", ["trademark"])
  .is("deleted_at", null);
if (error) throw error;

let updated = 0, noBook = 0, failed = 0;
for (const r of rows) {
  const c = bookCase.get(r.case_number);
  if (!c) {
    noBook++;
    console.log("? 교재 미수록:", r.case_number);
    continue;
  }
  // binId → 업로드된 URL
  const imageUrlByBin = new Map();
  for (const img of r.images ?? []) {
    const m = /tm16-([^./]+)\.webp$/.exec(img.storagePath ?? "");
    if (m) imageUrlByBin.set(m[1].toLowerCase(), img.url);
  }
  const sections = buildSections(c, imageUrlByBin);
  if (!APPLY) {
    if (r.case_number === "2017도7236") {
      console.log(JSON.stringify({ kind: "tm-book", sections }, null, 1).slice(0, 2500));
    }
    continue;
  }
  const { error: uErr } = await sb
    .from("cases")
    .update({ book_sections: { kind: "tm-book", sections } })
    .eq("case_id", r.case_id);
  if (uErr) {
    failed++;
    console.log("!", r.case_number, uErr.message);
  } else updated++;
}
console.log(`${APPLY ? "적용" : "dry-run"}: 대상 ${rows.length} / 갱신 ${updated} / 교재외 ${noBook} / 실패 ${failed}`);
