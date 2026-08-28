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
// --compare : DB 의 현재 book_sections 와 교재에서 새로 만든 것을 글자로 대조만 한다.
//   개정판 반영 전에 "지금 DB 가 교재 파싱본에서 얼마나 벗어나 있나"(수기 보정분)를 재는 용도.
const COMPARE = process.argv.includes("--compare");
const argOf = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : dflt;
};
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const data = JSON.parse(
  readFileSync(argOf("--json", "source/_converted/tm-precedents.json"), "utf8"),
);

// ── 이미지 업로드 동기화 — 파서가 새로 발견한 인라인 binId(본문 문장 속 표장)가
//    cases.images 에 없으면 변환·업로드 후 append (seed 는 기존 판례 skip 이라 여기서 보충).
// 이미지 원본 hwpx — 판본이 바뀌면 경로도 바뀐다(파서와 같은 파일을 봐야 binId 가 맞는다).
const zip = new AdmZip(
  argOf(
    "--hwpx",
    "source/상표법/상표법 판례(제16판)/[완0825+내지] 리담상표법 판례 (제16판).hwpx",
  ),
);
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

// 케이스 경계 수동 보정(원장 지시) — 앞 판례 인덱스 말미에 붙은 법리 블록을 다음 판례의 참고로.
const CROSS_MOVES = [
  { from: "2015후1348", heading: "요부관찰 기본법리", to: "2017후2208" },
  { from: "2023도352", heading: "분리관찰 기본법리", to: "2006후4086" },
];

// 최초 수록분 기준 (시드와 동일 정책)
const bookCase = new Map();
for (const t of data.topics) for (const c of t.cases) if (!bookCase.has(c.caseNumber)) bookCase.set(c.caseNumber, c);

// CROSS_MOVES 적용 — from 판례 인덱스에서 heading 부터 끝까지 잘라 to 판례의 참고로.
for (const mv of CROSS_MOVES) {
  const src = bookCase.get(mv.from);
  const dst = bookCase.get(mv.to);
  if (!src || !dst) continue;
  const idx = src.sections.index ?? [];
  const at = idx.findIndex((p) => p.replace(/⟦[^⟧]*⟧/g, "").trim() === mv.heading);
  if (at < 0) continue;
  const moved = idx.splice(at);
  (dst.sections.__refExtra ??= []).push({ title: mv.heading, paras: moved.slice(1) });
  console.log(`경계 보정: ${mv.from} 인덱스 "${mv.heading}"(${moved.length - 1}문단) → ${mv.to} 참고`);
}

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
  const cellToBlock = (cell) => {
    // 셀 텍스트 속 이미지 마커 → ![](url) 인라인 유지 (글자 사이 배치 보존).
    // 마커로 커버된 이미지는 images 배열에서 제외(중복 방지) — 마커 없는 잔여분만 배열로.
    const inlined = new Set();
    const text = (cell.text ?? "")
      .replace(/⟦TBL⟧/g, "")
      .replace(/⟦IMG:([^⟧]*)⟧/g, (_, bin) => {
        const url = imageUrlByBin.get(bin.toLowerCase());
        if (!url) return "";
        inlined.add(bin.toLowerCase());
        return `![](${url})`;
      })
      .trim();
    return {
      text,
      images: (cell.imgs ?? [])
        .filter((bin) => !inlined.has(bin.toLowerCase()))
        .map((bin) => imageUrlByBin.get(bin.toLowerCase()))
        .filter(Boolean)
        .map((url) => ({ url, alt: "" })),
      ...(Number(cell.colSpan ?? 1) > 1 ? { colSpan: Number(cell.colSpan) } : {}),
      ...(Number(cell.rowSpan ?? 1) > 1 ? { rowSpan: Number(cell.rowSpan) } : {}),
    };
  };
  // "참고" 박스(라벨 셀 = 참고/참고 1/참고 2) — 표가 아니라 별도 "참고" 섹션으로 분리.
  const cleanText = (s) => (s ?? "").replace(/⟦IMG:[^⟧]*⟧/g, "").replace(/⟦TBL⟧/g, "").trim();
  const isRefBox = (t) =>
    (t.cellRows ?? []).flat().some((cell) => REF_LABEL_RE.test(cleanText(cell.text)));
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
          const isLabelRow = row.some((cell) => REF_LABEL_RE.test(cleanText(cell.text)));
          for (const cell of row) {
            const text = (cell.text ?? "").trim();
            const clean = cleanText(text);
            if (!clean) continue;
            if (REF_LABEL_RE.test(clean)) {
              label = clean.replace(/\s+/g, " ");
              continue;
            }
            // 라벨과 같은 행의 나머지 셀 = 박스 소제목 (헤더 우측 표시)
            if (isLabelRow) {
              title = title ? `${title} — ${clean.replace(/\s+/g, " ")}` : clean.replace(/\s+/g, " ");
              continue;
            }
            const converted = text.replace(/⟦IMG:([^⟧]*)⟧/g, (_, bin) => {
              const url = imageUrlByBin?.get(bin.toLowerCase());
              return url ? `![](${url})` : "";
            });
            for (const line of converted.split(/\n+/)) {
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
    // 인덱스 섹션의 표(관련판례 비교표 등)는 본문이 아니라 "참고" 섹션으로 분리.
    const secTables = tablesFor(originKey);
    const isIndex = key === "index";
    const blocks = spliceTables(
      toParaBlocks(secText[key], imageUrlByBin),
      isIndex ? [] : secTables,
    );
    const refs = refSectionsFor(originKey);
    if (isIndex && secTables.length > 0) {
      refs.unshift({ key: "reference-idx", label: "참고", blocks: secTables, source: null, title: null });
    }
    // 인덱스 말미의 "[관련판례 N] …" 블록들 → 별도 "관련판례" 섹션으로 분리.
    if (isIndex) {
      const at = blocks.findIndex((b) => b.type === "p" && /^\[관련\s*판례/.test(b.text.trim()));
      if (at >= 0) {
        const moved = blocks.splice(at);
        refs.unshift({ key: "related-cases", label: "관련판례", blocks: moved, source: null, title: null });
      }
    }
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
  // 경계 보정으로 넘어온 참고 블록 (CROSS_MOVES)
  let extraSeq = 0;
  for (const ex of c.sections.__refExtra ?? []) {
    extraSeq++;
    const blocks = toParaBlocks(ex.paras, imageUrlByBin);
    if (blocks.length === 0) continue;
    sections.push({
      key: extraSeq > 1 ? `reference-x${extraSeq}` : "reference-x",
      label: "참고",
      blocks,
      source: null,
      title: ex.title,
    });
  }
  // 참고 섹션은 항상 문서 끝(평석 뒤)에 — 원 섹션 인접 배치에서 전역 재배치(원장 지시 2026-07-07).
  const isRef = (s) => s.key === "reference" || s.key.startsWith("reference-");
  return [...sections.filter((s) => !isRef(s)), ...sections.filter(isRef)];
}

const { data: rows, error } = await sb
  .from("cases")
  .select(`case_id, case_number, images${COMPARE ? ", book_sections" : ""}`)
  .contains("subject_laws", ["trademark"])
  .is("deleted_at", null);
if (error) throw error;

// 대조용 정규화 — 이미지 URL·공백·밑줄 마커를 걷어내고 "글자"만 남긴다.
// URL 은 case_id 를 품고 있어 그대로 비교하면 전건이 달라 보인다.
const textOfSections = (secs) =>
  (secs ?? [])
    .map((s) => {
      const blocks = (s.blocks ?? [])
        .map((b) =>
          b.type === "table"
            ? (b.rows ?? []).flat().map((c) => c.text ?? "").join(" ")
            : (b.text ?? ""),
        )
        .join("\n");
      return `[${s.key}]${s.title ?? ""}\n${blocks}\n${s.source ?? ""}`;
    })
    .join("\n")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "[img]")
    .replace(/<\/?u>/g, "")
    .replace(/\s+/g, "")
    .trim();

// 줄 단위 — 사라진/늘어난 문단을 짚어 원인을 가르는 용도.
const linesOfSections = (secs) =>
  (secs ?? [])
    .flatMap((s) =>
      (s.blocks ?? []).map((b) =>
        b.type === "table"
          ? `⟨표⟩${(b.rows ?? []).flat().map((c) => c.text ?? "").join("|")}`
          : b.text ?? "",
      ),
    )
    .map((t) =>
      t
        .replace(/!\[[^\]]*\]\([^)]*\)/g, "[img]")
        .replace(/<\/?u>/g, "")
        .replace(/\s+/g, "")
        .trim(),
    )
    .filter(Boolean);

let updated = 0, noBook = 0, failed = 0, imgAdded = 0;
let cmpSame = 0;
const cmpDiff = [];
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
  if (COMPARE) {
    const now = textOfSections(r.book_sections?.sections);
    const next = textOfSections(sections);
    if (now === next) cmpSame++;
    else {
      // 어느 줄이 빠지고 어느 줄이 늘었는지 — 후처리 단계가 지운 줄인지 수기 보정인지 가른다.
      const lines = (secs) => linesOfSections(secs);
      const a = lines(r.book_sections?.sections);
      const b = lines(sections);
      const bs = new Set(b);
      const as = new Set(a);
      cmpDiff.push({
        no: r.case_number,
        db: now.length,
        book: next.length,
        onlyDb: a.filter((l) => !bs.has(l)),
        onlyBook: b.filter((l) => !as.has(l)),
      });
    }
    continue;
  }
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
if (COMPARE) {
  console.log(
    `대조: 대상 ${rows.length} / 교재와 동일 ${cmpSame} / 다름 ${cmpDiff.length} / 교재외 ${noBook}`,
  );
  // 원인 분류 — 알려진 후처리(인덱스 메타 추출·글상자 참고 부착)로 설명되는지.
  // extract-tm-index-meta 가 인덱스에서 걷어 case_references·exam_2nd_years 로 옮기는 줄들.
  const IDX_META =
    /^(대법원판례해설|지식재산법?\s*중요판례평석|중요판례평석|특허판례연구|\d+회\(\d{4}\)기출)/;
  // 특허청→지식재산처 치환(2026-07-20 원장 지시)은 교재에는 없고 DB 에만 있다 —
  // 교재쪽 줄에 같은 치환을 걸어 맞아떨어지면 그 차이는 치환분이다.
  const kipo = (l) => l.replace(/특허청(?!구)/g, "지식재산처");
  const buckets = { indexMeta: [], refAttach: [], kipoRename: [], other: [] };
  for (const d of cmpDiff) {
    const rest = (arr, other) => {
      const s = new Set(other.map(kipo));
      return arr.filter((l) => !s.has(kipo(l)));
    };
    const dbLeft = rest(d.onlyDb, d.onlyBook);
    const bookLeft = rest(d.onlyBook, d.onlyDb);
    const removedAllMeta =
      bookLeft.length > 0 && bookLeft.every((l) => IDX_META.test(l)) && dbLeft.length === 0;
    if (dbLeft.length === 0 && bookLeft.length === 0) buckets.kipoRename.push(d);
    else if (removedAllMeta) buckets.indexMeta.push(d);
    else if (dbLeft.length > 0 && bookLeft.length === 0) buckets.refAttach.push({ ...d, onlyDb: dbLeft });
    else buckets.other.push({ ...d, onlyDb: dbLeft, onlyBook: bookLeft });
  }
  console.log(
    `  분류: 특허청→지식재산처 치환분 ${buckets.kipoRename.length} / 인덱스메타 추출분 ${buckets.indexMeta.length} / DB 에만 있는 문단(수기·부착) ${buckets.refAttach.length} / 그 밖의 상이 ${buckets.other.length}`,
  );
  for (const d of buckets.refAttach)
    console.log(`  [DB에만] ${d.no}  +${d.onlyDb.length}문단  예: ${d.onlyDb[0]?.slice(0, 60)}`);
  for (const d of buckets.other.sort((a, b) => b.onlyDb.length - a.onlyDb.length))
    console.log(
      `  [상이] ${d.no}  DB만 ${d.onlyDb.length} / 교재만 ${d.onlyBook.length}  예DB: ${d.onlyDb[0]?.slice(0, 50) ?? "-"}  예교재: ${d.onlyBook[0]?.slice(0, 50) ?? "-"}`,
    );
} else {
  console.log(
    `${APPLY ? "적용" : "dry-run"}: 대상 ${rows.length} / 갱신 ${updated} / 교재외 ${noBook} / 실패 ${failed} / 인라인 이미지 추가 ${imgAdded}`,
  );
}
