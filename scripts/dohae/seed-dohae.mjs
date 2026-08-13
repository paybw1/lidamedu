// 도해특허법 시드 — dohae_units + dohae_unit_articles + Storage 크롭 업로드.
// 멱등: 같은 book_code 를 전량 삭제 후 재삽입(편집 UI 없음 — 정정=재시드 정책).
//
//   node scripts/dohae/seed-dohae.mjs [--dry]

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const ROOT = resolve(import.meta.dirname, "../..");
const BOOK = "dohae_patent_20";
const DRY = process.argv.includes("--dry");

const data = JSON.parse(readFileSync(resolve(ROOT, "source/_converted/dohae-patent.json"), "utf8"));
const crops = JSON.parse(readFileSync(resolve(ROOT, "source/_converted/dohae-crops.json"), "utf8"));

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const chapterTitle = new Map(data.chapters.map((c) => [c.no, c.title]));
const cropByKey = new Map(crops.map((c) => [`${c.unit}#${c.blockIndex}`, c]));

// 유닛 → row 변환. diagram 블록에 크롭 이미지 경로 부여.
const rows = [];
const linkRows = [];
let diagramsLinked = 0;
for (const u of data.units) {
  const key = u.kind === "topic" ? `t${String(u.no).padStart(2, "0")}` : `r${u.refNo.replace(".", "-")}`;
  const blocks = u.blocks.map((b, bi) => {
    if (b.type !== "diagram") return b;
    const crop = cropByKey.get(`${key}#${bi}`);
    if (!crop) return { ...b, image: null };
    diagramsLinked++;
    return { type: "diagram", image: `${BOOK}/${crop.file}`, page: crop.page, texts: b.texts };
  });
  rows.push({
    book_code: BOOK,
    unit_key: key,
    kind: u.kind,
    chapter_no: u.chapter,
    chapter_title: chapterTitle.get(u.chapter) ?? "",
    unit_no: u.kind === "topic" ? u.no : null,
    ref_no: u.kind === "reference" ? u.refNo : null,
    title: u.title,
    law_refs: u.lawRefs ?? [],
    pdf_page: u.pdfPage ?? null,
    blocks,
  });
  for (const articleId of u.articleIds ?? []) {
    linkRows.push({ unit_key: key, article_id: articleId });
  }
}
console.log(`유닛 ${rows.length} · 조문 링크 ${linkRows.length} · 다이어그램 이미지 연결 ${diagramsLinked}/${crops.length}`);
if (diagramsLinked !== crops.length) throw new Error("크롭 매니페스트 ↔ 블록 매칭 불일치");
if (DRY) {
  console.log("[dry] 업로드·삽입 생략");
  process.exit(0);
}

// 1) Storage 업로드 (upsert)
for (const c of crops) {
  const buf = readFileSync(resolve(ROOT, "source/_converted/dohae-crops", c.file));
  const { error } = await supa.storage.from("dohae").upload(`${BOOK}/${c.file}`, buf, {
    contentType: "image/png",
    upsert: true,
  });
  if (error) throw new Error(`storage ${c.file}: ${error.message}`);
}
console.log(`storage 업로드 ${crops.length}건 완료`);

// 2) 기존 book_code 삭제(재시드) → 삽입
{
  const { error } = await supa.from("dohae_units").delete().eq("book_code", BOOK);
  if (error) throw new Error(`delete: ${error.message}`);
}
const inserted = new Map(); // unit_key → unit_id
for (let i = 0; i < rows.length; i += 20) {
  const chunk = rows.slice(i, i + 20);
  const { data: ins, error } = await supa
    .from("dohae_units")
    .insert(chunk)
    .select("unit_id, unit_key");
  if (error) throw new Error(`insert units: ${error.message}`);
  for (const r of ins) inserted.set(r.unit_key, r.unit_id);
}
console.log(`dohae_units ${inserted.size}건 삽입`);

const links = linkRows.map((l) => ({ unit_id: inserted.get(l.unit_key), article_id: l.article_id }));
for (let i = 0; i < links.length; i += 200) {
  const { error } = await supa.from("dohae_unit_articles").insert(links.slice(i, i + 200));
  if (error) throw new Error(`insert links: ${error.message}`);
}
console.log(`dohae_unit_articles ${links.length}건 삽입`);

// 3) 검증 — 건수·표 블록 수·이미지 존재
const { count: unitCount } = await supa
  .from("dohae_units")
  .select("unit_id", { count: "exact", head: true })
  .eq("book_code", BOOK);
const { count: linkCount } = await supa
  .from("dohae_unit_articles")
  .select("unit_id", { count: "exact", head: true });
console.log(`검증: units=${unitCount} links=${linkCount}`);
const { data: sample } = await supa
  .from("dohae_units")
  .select("unit_key, title, blocks")
  .eq("book_code", BOOK)
  .eq("unit_key", "t01")
  .single();
console.log(
  "t01 블록:",
  sample.blocks.map((b) => b.type + (b.type === "diagram" ? `(${b.image})` : "")).join(" → "),
);
