// 개정판 재백필로 지워지는 **수기 보정**을 되살린다(멱등).
//
// ★교재에서 파생되지 않는 손질이라 백필이 매번 지운다. 규칙만 여기 등재해 두고
//   재적재 뒤 한 번 돌린다. 원본은 tmp/tm16-rev-backup.json(0단계 백업).
//
// 규칙:
//   ① 2012후2951 — 표장10 그리드 묶음 이미지를 잘라 만든 표(BinData 에 없는 파생본).
//   ② 2005후1905 — 인덱스 종합표를 본문이 아니라 "참고" 섹션으로.
//   ③ 2015후2006 — 원고의 실제 광고이미지 참고 섹션(교재 밖 보충).
//   ④ 2015후2174 — 실사용상표 셀 이미지 확대 표기 ![lg].
//
//   node scripts/precedents/reapply-tm-manual-patches.mjs            # dry-run
//   node scripts/precedents/reapply-tm-manual-patches.mjs --apply
import "dotenv/config";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { openBook, storagePathFor, IMAGE_BUCKET } from "./lib-tm-images.mjs";

const APPLY = process.argv.includes("--apply");
const argOf = (n, d) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : d;
};
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const backup = JSON.parse(readFileSync(argOf("--backup", "tmp/tm16-rev-backup.json"), "utf8"));
const oldByNo = new Map(backup.cases.map((r) => [r.case_number, r]));

// 구판 binId → 그림 해시. 백업 속 URL(tm16-{binId}.webp)을 신판 URL 로 바꾸는 데 쓴다.
const oldBook = openBook(argOf("--old-hwpx", "source/상표법/판례.hwpx"));

const log = [];
async function patch(caseNumber, fn) {
  const { data, error } = await sb
    .from("cases")
    .select("case_id, case_number, images, book_sections")
    .eq("case_number", caseNumber)
    .contains("subject_laws", ["trademark"])
    .is("deleted_at", null)
    .limit(1);
  if (error) throw error;
  const row = data?.[0];
  if (!row) return log.push(`!! ${caseNumber}: 행 없음`);
  const old = oldByNo.get(caseNumber);
  const sections = JSON.parse(JSON.stringify(row.book_sections?.sections ?? []));
  const images = JSON.parse(JSON.stringify(row.images ?? []));

  // 백업 URL → 현재 URL. 같은 그림이면 해시로 찾고, 없으면 옛 파일을 그대로 쓴다
  // (스토리지 파일은 지우지 않으므로 살아 있다) — 대신 images 목록에 다시 등록한다.
  const urlByHash = new Map();
  for (const im of images) {
    const h = /tmc-([0-9a-f]{12})\.webp$/.exec(im.storagePath ?? "")?.[1];
    if (h) urlByHash.set(h, im.url);
  }
  const remap = (text) =>
    String(text ?? "").replace(/https?:\/\/[^\s)]*?\/tm16-([^./]+)\.webp/g, (whole, bin) => {
      const h = oldBook.hashOf(bin);
      const hit = h ? urlByHash.get(h) : null;
      if (hit) return hit;
      if (!images.some((im) => im.url === whole)) {
        images.push({
          id: randomUUID(),
          url: whole,
          storagePath: `${row.case_id}/tm16-${bin}.webp`,
          mimeType: "image/webp",
          width: null,
          height: null,
          alt: "",
          position: "summary",
          sortOrder: images.length,
        });
      }
      return whole;
    });
  const remapDeep = (v) => {
    if (typeof v === "string") return remap(v);
    if (Array.isArray(v)) return v.map(remapDeep);
    if (v && typeof v === "object") {
      const o = {};
      for (const [k, val] of Object.entries(v)) o[k] = remapDeep(val);
      return o;
    }
    return v;
  };

  const changed = fn({ row, old, sections, images, remap, remapDeep });
  if (!changed) return log.push(`= ${caseNumber}: 이미 반영됨`);
  if (!APPLY) return log.push(`~ ${caseNumber}: ${changed} (dry-run)`);
  const { error: uErr } = await sb
    .from("cases")
    .update({ book_sections: { ...(row.book_sections ?? { kind: "tm-book" }), sections }, images })
    .eq("case_id", row.case_id);
  log.push(uErr ? `! ${caseNumber}: ${uErr.message}` : `OK ${caseNumber}: ${changed}`);
}

const blocksOf = (secs, key) => secs.find((s) => s.key === key)?.blocks ?? [];
const isSplitTable = (b) =>
  b.type === "table" && JSON.stringify(b.rows ?? "").includes("-p0");

// ① 2012후2951 — 그리드 분할 표 복원. 신판은 묶음 그림 한 장으로 되돌아간다.
await patch("2012후2951", ({ old, sections, remapDeep }) => {
  const facts = sections.find((s) => s.key === "facts");
  if (!facts) return null;
  if (facts.blocks.some(isSplitTable)) return null;
  const oldFacts = blocksOf(old?.book_sections?.sections ?? [], "facts");
  const splitTable = oldFacts.find(isSplitTable);
  if (!splitTable) return null;
  // 묶음 그림 한 장만 있는 문단을 찾아 그 자리에 분할 표를 넣는다.
  const at = facts.blocks.findIndex(
    (b) => b.type === "p" && /^!\[[^\]]*\]\([^)]*\)/.test(b.text ?? ""),
  );
  const table = remapDeep(splitTable);
  if (at >= 0) {
    // 문단 선두의 묶음 이미지 마크다운만 떼고 표를 앞에 끼운다.
    facts.blocks[at] = {
      ...facts.blocks[at],
      text: String(facts.blocks[at].text).replace(/^!\[[^\]]*\]\([^)]*\)\s*/, ""),
    };
    facts.blocks.splice(at, 0, table);
  } else facts.blocks.push(table);
  return "그리드 분할 표 복원";
});

// ② 2005후1905 — 본심 말미의 종합표(제목 문단 + 표)를 "참고" 섹션으로.
await patch("2005후1905", ({ sections }) => {
  const TITLE = "기타 제119조 제1항 제3호에 있어 등록상표와 동일한 상표인지 여부에 대한 판단(종합)";
  if (sections.some((s) => s.title === TITLE)) return null;
  const holding = sections.find((s) => s.key === "holding");
  if (!holding) return null;
  const at = holding.blocks.findIndex((b) => b.type === "p" && (b.text ?? "").trim() === TITLE);
  if (at < 0) return null;
  const moved = holding.blocks.splice(at);
  const usedKeys = new Set(sections.map((s) => s.key));
  let key = "reference";
  for (let n = 2; usedKeys.has(key); n++) key = `reference-${n}`;
  sections.push({
    key,
    label: "참고",
    blocks: moved.filter((b) => b.type !== "p" || (b.text ?? "").trim() !== TITLE),
    source: null,
    title: TITLE,
  });
  return "종합표 → 참고 섹션";
});

// ③ 2015후2006 — 교재 밖 보충(원고의 실제 광고이미지).
await patch("2015후2006", ({ old, sections, remapDeep }) => {
  const TITLE = "원고의 실제 광고이미지";
  if (sections.some((s) => s.title === TITLE)) return null;
  const oldSec = (old?.book_sections?.sections ?? []).find((s) => s.title === TITLE);
  if (!oldSec) return null;
  const usedKeys = new Set(sections.map((s) => s.key));
  let key = "reference";
  for (let n = 2; usedKeys.has(key); n++) key = `reference-${n}`;
  sections.push({ ...remapDeep(oldSec), key });
  return "참고 섹션(광고이미지) 복원";
});

// ④ 2015후2174 — 실사용상표 셀 그림 확대 표기.
await patch("2015후2174", ({ sections }) => {
  const mark = sections.find((s) => s.key === "mark");
  if (!mark) return null;
  let hit = 0;
  for (const b of mark.blocks) {
    if (b.type !== "table") continue;
    for (const row of b.rows ?? []) {
      for (let i = 0; i < row.length; i++) {
        // 실사용상표 = 표의 두 번째 열 그림
        if (i !== 1) continue;
        const t = row[i].text ?? "";
        if (/^!\[\]\(/.test(t)) {
          row[i].text = t.replace(/^!\[\]\(/, "![lg](");
          hit++;
        }
      }
    }
  }
  return hit ? `실사용상표 셀 ![lg] ${hit}곳` : null;
});

for (const l of log) console.log(l);
