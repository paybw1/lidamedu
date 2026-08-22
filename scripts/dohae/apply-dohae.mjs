// 파싱 결과(dohae-patent.json) + 크롭 이미지 → 운영 DB 반영.
//
//   node scripts/dohae/apply-dohae.mjs            # dry-run (바뀐 유닛만 보여준다)
//   node scripts/dohae/apply-dohae.mjs --apply
//
// ★dohae_units 행은 절대 지우지 않는다 — 지우면 dohae_unit_nodes(101) ·
//   dohae_unit_articles(307) · 하이라이트가 cascade 로 함께 날아간다. blocks 만 UPDATE 한다.
// ★새 유닛(참고 8 처럼 뒤늦게 발견된 것)은 INSERT 한다.
// ★비교는 키 순서를 정규화해서 — jsonb 는 키를 재정렬해 저장하므로 그냥 stringify 하면
//   내용이 같아도 전부 "바뀜" 으로 잡힌다(93건 전건 오탐).
import "dotenv/config";
import { readFileSync, readdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const BOOK = "dohae_patent_20";
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const data = JSON.parse(readFileSync("source/_converted/dohae-patent.json", "utf8"));
const manifest = JSON.parse(readFileSync("source/_converted/dohae-crops.json", "utf8"));
const crops = manifest.crops ?? manifest;
const cropByBlock = new Map();
const cropByCell = new Map();
for (const c of crops) {
  if (c.row === undefined) cropByBlock.set(`${c.unit}#${c.blockIndex}`, c);
  else cropByCell.set(`${c.unit}#${c.blockIndex}#${c.row}#${c.col}`, c);
}
const keyOf = (u) =>
  u.kind === "topic" ? `t${String(u.no).padStart(2, "0")}` : `r${u.refNo.replace(".", "-")}`;

const canon = (v) => {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === "object")
    return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])]));
  return v;
};
const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

/** 블록 다이어그램 + 표 안 칸 그림에 storage 경로를 박는다. */
function withImages(u, key) {
  return u.blocks.map((b, bi) => {
    if (b.type === "diagram") {
      const crop = cropByBlock.get(`${key}#${bi}`);
      if (!crop) return { ...b, image: null };
      return { type: "diagram", image: `${BOOK}/${crop.file}`, page: crop.page, texts: b.texts };
    }
    if (b.type !== "table") return b;
    const cells = b.cells.map((row, ri) =>
      row.map((c, ci) => {
        if (!c.diagram) return c;
        const crop = cropByCell.get(`${key}#${bi}#${ri}#${ci}`);
        return { ...c, image: crop ? `${BOOK}/${crop.file}` : null };
      }),
    );
    return { ...b, cells };
  });
}

const { data: rows, error } = await sb
  .from("dohae_units")
  .select("unit_id, unit_key, blocks")
  .eq("book_code", BOOK);
if (error) throw error;
const dbBy = new Map(rows.map((r) => [r.unit_key, r]));

const updates = [];
const inserts = [];
for (const u of data.units) {
  const key = keyOf(u);
  const blocks = withImages(u, key);
  const cur = dbBy.get(key);
  if (!cur) {
    inserts.push({
      book_code: BOOK,
      unit_key: key,
      kind: u.kind,
      title: u.title,
      chapter_no: u.chapter,
      chapter_title: data.chapters.find((c) => c.no === u.chapter)?.title ?? "",
      unit_no: u.kind === "topic" ? u.no : null,
      ref_no: u.kind === "reference" ? u.refNo : null,
      pdf_page: u.pdfPage ?? null,
      blocks,
    });
    continue;
  }
  if (!same(cur.blocks, blocks)) {
    const t0 = (cur.blocks ?? []).map((b) => b.type).join(",");
    const t1 = blocks.map((b) => b.type).join(",");
    updates.push({ unit_id: cur.unit_id, key, blocks, changedShape: t0 !== t1 });
  }
}
console.log(`신규 유닛 ${inserts.length}건: ${inserts.map((i) => `${i.unit_key} ${i.title}`).join(" · ") || "없음"}`);
console.log(`blocks 갱신 대상 ${updates.length}건:`);
for (const u of updates) console.log(`  ${u.key}${u.changedShape ? " (구성 변경)" : ""}`);

const local = readdirSync("source/_converted/dohae-crops").filter((f) => f.endsWith(".png"));
const { data: remote } = await sb.storage.from("dohae").list(BOOK, { limit: 1000 });
const remoteNames = (remote ?? []).map((f) => f.name);
const toDelete = remoteNames.filter((f) => !local.includes(f));
console.log(
  `\n이미지: 로컬 ${local.length} · 원격 ${remoteNames.length} · 삭제 대상 ${toDelete.length} (${toDelete.join(", ") || "없음"})`,
);

if (!APPLY) {
  console.log("\n--apply 를 붙이면 반영합니다.");
  process.exit(0);
}

let up = 0;
for (const f of local) {
  const bytes = readFileSync(`source/_converted/dohae-crops/${f}`);
  const { error: e } = await sb.storage
    .from("dohae")
    .upload(`${BOOK}/${f}`, bytes, { contentType: "image/png", upsert: true });
  if (e) throw new Error(`${f}: ${e.message}`);
  up++;
}
console.log(`이미지 업로드 ${up}건`);
if (toDelete.length) {
  const { error: e } = await sb.storage.from("dohae").remove(toDelete.map((f) => `${BOOK}/${f}`));
  if (e) throw new Error(e.message);
  console.log(`이미지 삭제 ${toDelete.length}건`);
}
if (inserts.length) {
  const { error: e } = await sb.from("dohae_units").insert(inserts);
  if (e) throw new Error(`신규 유닛: ${e.message}`);
  console.log(`신규 유닛 ${inserts.length}건 추가`);
}
for (const u of updates) {
  const { error: e } = await sb.from("dohae_units").update({ blocks: u.blocks }).eq("unit_id", u.unit_id);
  if (e) throw new Error(`${u.key}: ${e.message}`);
}
console.log(`blocks 갱신 ${updates.length}건 완료 (유닛 행은 지우지 않음 — 노드 연결·하이라이트 보존)`);
