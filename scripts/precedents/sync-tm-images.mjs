// 상표 판례 이미지 동기화 — 교재(hwpx)의 그림을 **내용 해시 이름**으로 올리고
// cases.images 를 교재 순서대로 다시 만든다.
//
// ★왜: 판본이 바뀌면 binId 가 통째로 밀린다(제16판 0825 는 702개 중 503개가
//   "같은 binId, 다른 그림"). 구 규약 tm16-{binId}.webp 를 그대로 재사용하면
//   표장 그림 대부분이 엉뚱한 판례에 붙는다. 해시로 지으면 판본과 무관하다.
//
// ★교재에서 나오지 않는 파생 이미지(그리드 묶음 분할본 …-pNN.webp)는 보존한다 —
//   BinData 에 없어 다시 만들 수 없고, 본문이 그 URL 을 가리키고 있다.
//
//   node scripts/precedents/sync-tm-images.mjs           # dry-run
//   node scripts/precedents/sync-tm-images.mjs --apply
import "dotenv/config";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { IMAGE_BUCKET, binIdsOf, hashFromPath, openBook, storagePathFor } from "./lib-tm-images.mjs";

const APPLY = process.argv.includes("--apply");
const argOf = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : dflt;
};
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const data = JSON.parse(readFileSync(argOf("--json", "source/_converted/tm-precedents.json"), "utf8"));
const { hashOf, toWebp } = openBook(
  argOf("--hwpx", "source/상표법/상표법 판례(제16판)/[완0825+내지] 리담상표법 판례 (제16판).hwpx"),
);

const bookCase = new Map();
for (const t of data.topics) for (const c of t.cases) if (!bookCase.has(c.caseNumber)) bookCase.set(c.caseNumber, c);

const { data: rows, error } = await sb
  .from("cases")
  .select("case_id, case_number, images")
  .contains("subject_laws", ["trademark"])
  .is("deleted_at", null);
if (error) throw error;

const DERIVED = /-p\d+\.webp$/; // 그리드 분할 등 교재에 없는 파생본

let uploaded = 0, reused = 0, kept = 0, failed = 0, changedRows = 0, noBook = 0;
const failures = [];
for (const r of rows) {
  const c = bookCase.get(r.case_number);
  if (!c) { noBook++; continue; }
  const bins = binIdsOf(c);
  const have = new Map();
  for (const img of r.images ?? []) {
    const h = hashFromPath(img.storagePath);
    if (h) have.set(h, img);
  }
  const next = [];
  for (const bin of bins) {
    const h = hashOf(bin);
    if (!h) {
      failures.push(`${r.case_number} ${bin}: binData 없음`);
      failed++;
      continue;
    }
    const existing = have.get(h);
    if (existing) {
      reused++;
      next.push({ ...existing, sortOrder: next.length, position: existing.position ?? "summary" });
      continue;
    }
    const conv = await toWebp(bin);
    if (conv.error) {
      failures.push(`${r.case_number} ${bin}: ${conv.error}`);
      failed++;
      continue;
    }
    const storagePath = storagePathFor(r.case_id, h);
    if (APPLY) {
      const { error: upErr } = await sb.storage
        .from(IMAGE_BUCKET)
        .upload(storagePath, conv.buffer, { contentType: "image/webp", upsert: true });
      if (upErr) {
        failures.push(`${r.case_number} ${bin} 업로드: ${upErr.message}`);
        failed++;
        continue;
      }
    }
    const { data: pub } = sb.storage.from(IMAGE_BUCKET).getPublicUrl(storagePath);
    next.push({
      id: randomUUID(),
      url: pub.publicUrl,
      storagePath,
      mimeType: "image/webp",
      width: conv.width,
      height: conv.height,
      alt: "",
      position: "summary",
      sortOrder: next.length,
    });
    uploaded++;
  }
  // 교재에서 못 만드는 파생본은 뒤에 그대로 둔다.
  for (const img of r.images ?? []) {
    if (!DERIVED.test(img.storagePath ?? "")) continue;
    kept++;
    next.push({ ...img, sortOrder: next.length });
  }
  const before = JSON.stringify((r.images ?? []).map((i) => i.storagePath));
  const after = JSON.stringify(next.map((i) => i.storagePath));
  if (before === after) continue;
  changedRows++;
  if (!APPLY) continue;
  const { error: uErr } = await sb.from("cases").update({ images: next }).eq("case_id", r.case_id);
  if (uErr) { failures.push(`${r.case_number} images: ${uErr.message}`); failed++; }
}
console.log(
  `${APPLY ? "적용" : "dry-run"}: 판례 ${rows.length} / images 재구성 ${changedRows} / 신규 업로드 ${uploaded} / 기존 재사용 ${reused} / 파생본 보존 ${kept} / 교재외 ${noBook} / 실패 ${failed}`,
);
for (const f of failures.slice(0, 25)) console.log("  !", f);
if (failures.length > 25) console.log(`  … 외 ${failures.length - 25}건`);
