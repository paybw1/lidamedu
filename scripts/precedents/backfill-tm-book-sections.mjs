// tm-precedents.json → cases.book_sections 백필 (상표 337건)
//   교재 구조 그대로: 쟁점상표(표+도형 셀) / 사안의 쟁점 / 사실관계 / 전심의 판단 /
//   관련 법리 / 본심의 판단 / 인덱스 / 평석
//   셀 이미지: binId → cases.images 의 storagePath(tm16-{binId}.webp) 매칭 → URL
//
//   node scripts/precedents/backfill-tm-book-sections.mjs           # dry-run(1건 미리보기)
//   node scripts/precedents/backfill-tm-book-sections.mjs --apply
import "dotenv/config";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import AdmZip from "adm-zip";
import sharp from "sharp";
import bmp from "bmp-js";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const data = JSON.parse(readFileSync("source/_converted/tm-precedents.json", "utf8"));

// ── 이미지 업로드 동기화 — 파서가 새로 발견한 인라인 binId(본문 문장 속 표장)가
//    cases.images 에 없으면 변환·업로드 후 append (seed 는 기존 판례 skip 이라 여기서 보충).
const zip = new AdmZip("source/상표업로드/판례.hwpx");
const binByStem = new Map();
for (const e of zip.getEntries()) {
  const m = /^BinData\/([^.]+)\.(\w+)$/.exec(e.entryName);
  if (m) binByStem.set(m[1].toLowerCase(), { entry: e, ext: m[2].toLowerCase() });
}
async function toWebp(binId) {
  const hit = binByStem.get(binId.toLowerCase());
  if (!hit) return { error: "binData 없음" };
  const buf = hit.entry.getData();
  try {
    let img;
    const magic = buf.slice(0, 3).toString("hex");
    if (magic.startsWith("ffd8")) img = sharp(buf, { failOn: "none" });
    else if (hit.ext === "bmp") {
      const d = bmp.decode(buf);
      const px = d.data;
      let hasAlpha = false;
      for (let i = 0; i < px.length; i += 4) if (px[i] !== 0) { hasAlpha = true; break; }
      for (let i = 0; i < px.length; i += 4) {
        const a = px[i], b = px[i + 1], g = px[i + 2], r = px[i + 3];
        px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = hasAlpha ? a : 255;
      }
      img = sharp(px, { raw: { width: d.width, height: d.height, channels: 4 } });
    } else if (["wmf", "emf", "ole"].includes(hit.ext)) return { error: `미지원 ${hit.ext}` };
    else img = sharp(buf, { failOn: "none" });
    const out = await img.webp({ quality: 88 }).toBuffer({ resolveWithObject: true });
    return { buffer: out.data, width: out.info.width, height: out.info.height };
  } catch (e) {
    return { error: e.message };
  }
}
async function syncMissingImages(row, bookImages) {
  const have = new Set(
    (row.images ?? [])
      .map((i) => /tm16-([^./]+)\.webp$/.exec(i.storagePath ?? "")?.[1]?.toLowerCase())
      .filter(Boolean),
  );
  const missing = bookImages.filter((b) => !have.has(b.toLowerCase()));
  if (!missing.length || !APPLY) return { images: row.images ?? [], added: 0 };
  const next = [...(row.images ?? [])];
  let added = 0;
  for (const bin of missing) {
    const conv = await toWebp(bin);
    if (conv.error) {
      console.log(`  ! ${row.case_number} 인라인 ${bin}: ${conv.error}`);
      continue;
    }
    const storagePath = `${row.case_id}/tm16-${bin}.webp`;
    const { error } = await sb.storage
      .from("case-images")
      .upload(storagePath, conv.buffer, { contentType: "image/webp", upsert: true });
    if (error) {
      console.log(`  ! ${row.case_number} 업로드 ${bin}: ${error.message}`);
      continue;
    }
    const { data: pub } = sb.storage.from("case-images").getPublicUrl(storagePath);
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
    added++;
  }
  if (added > 0) {
    const { error } = await sb.from("cases").update({ images: next }).eq("case_id", row.case_id);
    if (error) console.log(`  ! ${row.case_number} images 갱신: ${error.message}`);
  }
  return { images: next, added };
}

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

// 선두 [N]/(N) 마커 뒤에 공백이 없으면 삽입 — 평석 원문이 "[1]상표법은…" 처럼 붙어 있음.
const normalizePara = (t) => t.replace(/^(\[\d+\]|\(\d+\))(?=\S)/, "$1 ");
// 평석 등 표 셀에서 추출된 텍스트는 여러 문단이 단일 \n 으로 뭉쳐 있음 — 줄 단위로
// 별도 p 블록 분리(문단 간격 확보 + [2][3] 선두 정규화 적용).
// ★인라인 이미지 마커 ⟦IMG:binId⟧ → ![](url) 를 문장 내 그 자리에 유지 — 뷰어(Prose)가
//   텍스트 흐름 안에 작은 인라인 이미지로 렌더. 단독 줄이던 이미지는 단독 문단(블록 렌더).
//   URL 미확보 마커는 제거.
const toParaBlocks = (arr, imageUrlByBin) =>
  (arr ?? [])
    .map((t) =>
      t.replace(/⟦IMG:([^⟧]*)⟧/g, (_, bin) => {
        const url = imageUrlByBin?.get(bin.toLowerCase());
        return url ? `![](${url})` : "";
      }),
    )
    .flatMap((t) => t.split(/\n+/))
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => ({ type: "p", text: normalizePara(t) }));

const REF_LABEL_RE = /^참고(\s*\d+)?$/;

// 문단 블록 속 ⟦TBL⟧ 마커 라인 → 그 위치에 표 블록 삽입 (순서대로 소비, 잔여 표는 끝에).
function spliceTables(paraBlocks, tableBlocks) {
  const queue = [...tableBlocks];
  const out = [];
  for (const b of paraBlocks) {
    if (b.type === "p" && b.text.trim() === "⟦TBL⟧") {
      const t = queue.shift();
      if (t) out.push(t);
      continue;
    }
    out.push(b);
  }
  out.push(...queue);
  return out;
}

function buildSections(c, imageUrlByBin) {
  const sections = [];
  const cellToBlock = (cell) => ({
    // 도표 셀 안의 중첩 표 마커는 렌더 대상 아님 — 제거
    text: (cell.text ?? "").replace(/⟦TBL⟧/g, "").trim(),
    images: (cell.imgs ?? [])
      .map((bin) => imageUrlByBin.get(bin.toLowerCase()))
      .filter(Boolean)
      .map((url) => ({ url, alt: "" })),
  });
  // "참고" 박스(라벨 셀 = 참고/참고 1/참고 2) — 표가 아니라 별도 "참고" 섹션으로 분리.
  const isRefBox = (t) =>
    (t.cellRows ?? []).flat().some((cell) => REF_LABEL_RE.test((cell.text ?? "").trim()));
  const refBoxes = c.infoTables.filter(isRefBox);
  const normalTables = c.infoTables.filter((t) => !isRefBox(t));
  const tablesFor = (key) =>
    normalTables
      .filter((t) => t.section === key)
      .map((t) => ({ type: "table", rows: (t.cellRows ?? t.rows.map((r) => r.map((x) => ({ text: x, imgs: [] })))).map((row) => row.map(cellToBlock)) }));
  // 참고 박스 → 섹션 블록: 라벨 셀 제외, 나머지 셀을 줄 단위 문단으로.
  let refSeq = 0;
  const refSectionsFor = (key) =>
    refBoxes
      .filter((t) => t.section === key)
      .map((t) => {
        refSeq++;
        let label = "참고";
        let title = null;
        const paras = [];
        for (const row of t.cellRows ?? []) {
          const isLabelRow = row.some((cell) => REF_LABEL_RE.test((cell.text ?? "").trim()));
          for (const cell of row) {
            const text = (cell.text ?? "").trim();
            if (!text) continue;
            if (REF_LABEL_RE.test(text)) {
              label = text.replace(/\s+/g, " ");
              continue;
            }
            // 라벨과 같은 행의 나머지 셀 = 박스 소제목 (헤더 우측 표시)
            if (isLabelRow) {
              title = title ? `${title} — ${text.replace(/\s+/g, " ")}` : text.replace(/\s+/g, " ");
              continue;
            }
            for (const line of text.split(/\n+/)) {
              const l = line.trim();
              if (l && l !== "⟦TBL⟧") paras.push({ type: "p", text: normalizePara(l) });
            }
          }
        }
        return {
          key: refSeq > 1 ? `reference-${refSeq}` : "reference",
          label,
          blocks: paras,
          source: null,
          title,
        };
      })
      .filter((s) => s.blocks.length > 0);

  // 쟁점상표 — 헤더 직후(preamble) 도표 (도표 먼저, 마커 잔재 라인 제거)
  const infoBlocks = [
    ...tablesFor("preamble"),
    ...toParaBlocks(c.sections.preamble, imageUrlByBin).filter(
      (b) => !(b.type === "p" && b.text.trim() === "⟦TBL⟧"),
    ),
  ];
  if (infoBlocks.length) sections.push({ key: "mark", label: "쟁점상표", blocks: infoBlocks });
  sections.push(...refSectionsFor("preamble"));

  // ★법원이 대법원이 아닌 판결(특허법원 확정 등)은 [특허법원의 판단]=본심 — 파서가 lower 로
  //   합쳤으므로 holding 이 비어 있으면 lower 를 본심의 판단으로 재배치.
  const secText = { ...c.sections };
  let lowerKeyRelabeled = false;
  if (
    c.court !== "대법원" &&
    (secText.lower ?? []).length > 0 &&
    (secText.holding ?? []).length === 0
  ) {
    secText.holding = secText.lower;
    secText.lower = [];
    lowerKeyRelabeled = true;
  }

  for (const [key, label] of SECTION_DEFS) {
    // 재배치 시 표·참고 박스의 원 섹션(lower)도 holding 을 따라간다.
    const originKey =
      lowerKeyRelabeled && key === "holding"
        ? "lower"
        : lowerKeyRelabeled && key === "lower"
          ? "__none__"
          : key;
    const blocks = spliceTables(
      toParaBlocks(secText[key], imageUrlByBin),
      tablesFor(originKey),
    );
    const refs = refSectionsFor(originKey);
    if (!blocks.length) {
      sections.push(...refs);
      continue;
    }
    const section = { key, label, blocks, source: null };
    // 평석 — 끝의 완전 괄호 인용 문단("(손천우, …, 대법원 판례해설 …, 508-530면 참고)")을
    // 출처로 승격 (섹션 헤더 우측 "출처: …" 표시).
    if (key === "comment") {
      const srcParts = [];
      while (blocks.length > 0) {
        const last = blocks[blocks.length - 1];
        if (last.type !== "p" || !/^\(.+\)$/.test(last.text.trim())) break;
        srcParts.unshift(blocks.pop().text.trim());
      }
      if (srcParts.length) section.source = srcParts.join(" / ");
      if (!blocks.length) {
        sections.push(...refs);
        continue; // 출처만 있고 본문 없으면(이례) 섹션 생략
      }
    }
    sections.push(section, ...refs);
  }
  return sections;
}

const { data: rows, error } = await sb
  .from("cases")
  .select("case_id, case_number, images")
  .contains("subject_laws", ["trademark"])
  .is("deleted_at", null);
if (error) throw error;

let updated = 0, noBook = 0, failed = 0, imgAdded = 0;
for (const r of rows) {
  const c = bookCase.get(r.case_number);
  if (!c) {
    noBook++;
    console.log("? 교재 미수록:", r.case_number);
    continue;
  }
  // 인라인 신규 이미지 업로드 동기화 → binId → URL 맵
  const { images: syncedImages, added } = await syncMissingImages(r, c.images ?? []);
  imgAdded += added;
  const imageUrlByBin = new Map();
  for (const img of syncedImages) {
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
console.log(
  `${APPLY ? "적용" : "dry-run"}: 대상 ${rows.length} / 갱신 ${updated} / 교재외 ${noBook} / 실패 ${failed} / 인라인 이미지 추가 ${imgAdded}`,
);
