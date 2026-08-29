// tm-precedents.json → cases.book_sections 백필 (상표 337건)
//   교재 구조 그대로: 쟁점상표(표+도형 셀) / 사안의 쟁점 / 사실관계 / 전심의 판단 /
//   관련 법리 / 본심의 판단 / 인덱스 / 평석
//   셀 이미지: binId → **원본 해시** → cases.images 의 storagePath(tmc-{sha1}.webp) 매칭 → URL
//
//   node scripts/precedents/backfill-tm-book-sections.mjs           # dry-run(1건 미리보기)
//   node scripts/precedents/backfill-tm-book-sections.mjs --apply
import "dotenv/config";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { binIdsOf, hashFromPath, openBook } from "./lib-tm-images.mjs";

const APPLY = process.argv.includes("--apply");
// --links : feat-3-214 다중 배치. 교재에 수록된 **자리마다** 링크를 만들고
//   그 주제에서의 서술을 case_systematic_links.book_sections 에 담는다.
//   (cases.book_sections 는 건드리지 않는다 — 대표 배치 본문 그대로.)
const LINKS = process.argv.includes("--links");
// --compare : DB 의 현재 book_sections 와 교재에서 새로 만든 것을 글자로 대조만 한다.
//   개정판 반영 전에 "지금 DB 가 교재 파싱본에서 얼마나 벗어나 있나"(수기 보정분)를 재는 용도.
const COMPARE = process.argv.includes("--compare");
// --only 2004도4420[,...] : 그 사건번호만. 한 링크만 되살릴 때 쓴다(전체 재생성은
//   수기 보정분을 덮으므로 금지). --links 예행이면 DB 와 글자 대조 결과를 찍는다.
const ONLY = (process.argv.includes("--only")
  ? process.argv[process.argv.indexOf("--only") + 1]
  : ""
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
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

// 이미지는 sync-tm-images.mjs 가 올린다. 여기선 binId → 해시 로 URL 만 찾는다.
const { hashOf } = openBook(
  argOf("--hwpx", "source/상표법/상표법 판례(제16판)/[완0825+내지] 리담상표법 판례 (제16판).hwpx"),
);
const missingImg = [];

// 케이스 경계 수동 보정(원장 지시) — 앞 판례 인덱스 말미에 붙은 법리 블록을 다음 판례의 참고로.
// ★anchor(from)는 판본마다 바뀐다 — 제16판(0825)은 "분리관찰 기본법리" 를 2023도352 인덱스에서
//   신규 판례 2023후10118 의 본심 말미로 옮겼다(둘 다 바로 다음 판례가 2006후4086 인 건 그대로).
//   그래서 섹션도 고정하지 않고 전 섹션에서 제목을 찾는다.
const CROSS_MOVES = [
  { from: "2015후1348", heading: "요부관찰 기본법리", to: "2017후2208" },
  { from: "2023후10118", heading: "분리관찰 기본법리", to: "2006후4086" },
];

// 최초 수록분 기준 (시드와 동일 정책)
const bookCase = new Map();
for (const t of data.topics) for (const c of t.cases) if (!bookCase.has(c.caseNumber)) bookCase.set(c.caseNumber, c);

// ★교재는 같은 판결을 두 주제에서 **다른 각도로** 다룬다(상표 5건). 위 map 은 최초 1곳만
//   담으므로 다중 배치(feat-3-214)에서는 수록된 자리를 전부 들고 있어야 한다.
const bookOccurrences = new Map(); // case_number → [{ topic, kase }]
for (const t of data.topics)
  for (const c of t.cases) {
    if (!bookOccurrences.has(c.caseNumber)) bookOccurrences.set(c.caseNumber, []);
    bookOccurrences.get(c.caseNumber).push({ topic: t, kase: c });
  }

// CROSS_MOVES 적용 — from 판례 인덱스에서 heading 부터 끝까지 잘라 to 판례의 참고로.
for (const mv of CROSS_MOVES) {
  const src = bookCase.get(mv.from);
  const dst = bookCase.get(mv.to);
  if (!src || !dst) continue;
  const clean = (p) => p.replace(/⟦[^⟧]*⟧/g, "").replace(/<\/?u>/g, "").trim();
  let hit = null;
  for (const key of ["index", "holding", "doctrine", "comment", "lower", "facts"]) {
    const arr = src.sections[key];
    if (!Array.isArray(arr)) continue;
    const at = arr.findIndex((p) => clean(p) === mv.heading);
    if (at >= 0) {
      hit = { key, arr, at };
      break;
    }
  }
  if (!hit) {
    console.log(`! 경계 보정 앵커 없음: ${mv.from} "${mv.heading}" — CROSS_MOVES 확인 필요`);
    continue;
  }
  const moved = hit.arr.splice(hit.at);
  (dst.sections.__refExtra ??= []).push({ title: mv.heading, paras: moved.slice(1) });
  console.log(`경계 보정: ${mv.from} ${hit.key} "${mv.heading}"(${moved.length - 1}문단) → ${mv.to} 참고`);
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

if (LINKS) {
  // 주제 노드 색인 — 라벨 "주제N 제목" 에서 번호를 떼고 제목으로 찾는다(판본마다 번호가 밀린다).
  const { data: nodes, error: nErr } = await sb
    .from("systematic_nodes")
    .select("node_id, display_label, case_only")
    .eq("law_code", "trademark");
  if (nErr) throw nErr;
  const titleKey = (s) => String(s ?? "").replace(/^주제\s*\d+\s*/, "").replace(/\s+/g, "");
  const nodeByTitle = new Map();
  for (const n of nodes ?? []) {
    if (!n.case_only || !/^주제\s*\d+\s/.test(n.display_label)) continue;
    if (!nodeByTitle.has(titleKey(n.display_label))) nodeByTitle.set(titleKey(n.display_label), n);
  }

  // 교재 전체 순번(주제 순 → 주제 내 순) — 링크별 source_seq.
  const seqOf = new Map();
  let running = 0;
  for (const t of data.topics)
    for (const c of t.cases) seqOf.set(`${c.caseNumber}@${t.no}`, ++running);

  const byNumber = new Map(rows.map((r) => [r.case_number, r]));
  let made = 0, skipped = 0, noNode = 0;
  const multi = [];
  // 예행일 때 DB 의 현재 링크 본문과 글자 대조 — 생성기가 DB 를 그대로 재현하는지 본다.
  const { data: existing } = await sb
    .from("case_systematic_links")
    .select("case_id, node_id, book_sections");
  // ★jsonb 는 키 순서를 제 맘대로 돌려준다 — 키를 정렬해 비교해야 "전부 다름"이 안 뜬다.
  const canon = (v) =>
    JSON.stringify(v, (_k, val) =>
      val && typeof val === "object" && !Array.isArray(val)
        ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => a.localeCompare(b)))
        : val,
    );
  const existingBody = new Map(
    (existing ?? []).map((l) => [`${l.case_id}@${l.node_id}`, canon(l.book_sections)]),
  );
  let same = 0, diff = 0;

  for (const [caseNumber, occs] of bookOccurrences) {
    if (ONLY.length > 0 && !ONLY.includes(caseNumber)) continue;
    const row = byNumber.get(caseNumber);
    if (!row) continue;
    if (occs.length > 1) multi.push(`${caseNumber}(${occs.map((o) => `주제${o.topic.no}`).join("+")})`);
    const urlByHash = new Map();
    for (const img of row.images ?? []) {
      const h = hashFromPath(img.storagePath);
      if (h) urlByHash.set(h, img.url);
    }
    for (const { topic, kase } of occs) {
      const node = nodeByTitle.get(titleKey(topic.title));
      if (!node) {
        noNode++;
        console.log(`  ? 주제 노드 없음: 주제${topic.no} ${topic.title}`);
        continue;
      }
      const imageUrlByBin = new Map();
      for (const bin of binIdsOf(kase)) {
        const url = urlByHash.get(hashOf(bin) ?? "");
        if (url) imageUrlByBin.set(bin, url);
      }
      const sections = buildSections(kase, imageUrlByBin);
      const payload = {
        case_id: row.case_id,
        node_id: node.node_id,
        seq: occs.findIndex((o) => o.topic.no === topic.no) + 1,
        book_sections: { kind: "tm-book", sections },
        source_seq: seqOf.get(`${caseNumber}@${topic.no}`) ?? null,
      };
      if (!APPLY) {
        skipped++;
        const now = existingBody.get(`${row.case_id}@${node.node_id}`);
        if (now === undefined) console.log(`  + 새 링크 ${caseNumber} 주제${topic.no}`);
        else if (now === canon(payload.book_sections)) same++;
        else {
          diff++;
          console.log(`  ≠ ${caseNumber} 주제${topic.no} — DB 와 다름 (DB ${now?.length ?? 0}자 / 생성 ${canon(payload.book_sections).length}자)`);
        }
        continue;
      }
      const { error: uErr } = await sb
        .from("case_systematic_links")
        .upsert(payload, { onConflict: "case_id,node_id", ignoreDuplicates: false })
        .select("link_id");
      if (uErr) console.log(`  ! ${caseNumber} 주제${topic.no}: ${uErr.message}`);
      else made++;
    }
  }
  console.log(
    `${APPLY ? "적용" : "dry-run"}: 판례 ${rows.length} / 링크 기록 ${APPLY ? made : skipped} / 주제노드 미매칭 ${noNode}`,
  );
  if (!APPLY) console.log(`  DB 와 동일 ${same} · 다름 ${diff}`);
  console.log(`다중 배치 판례 ${multi.length}건: ${multi.join(", ")}`);
  process.exit(0);
}

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

let updated = 0, noBook = 0, failed = 0;
let cmpSame = 0;
const cmpDiff = [];
for (const r of rows) {
  const c = bookCase.get(r.case_number);
  if (!c) {
    noBook++;
    console.log("? 교재 미수록:", r.case_number);
    continue;
  }
  // binId → URL. ★식별은 해시로 한다(규칙 2) — 판본마다 binId 가 밀려서
  //   tm16-{binId} 로 맞추면 그림이 엉뚱한 판례에 붙는다. 업로드는 sync-tm-images 가 맡는다.
  const urlByHash = new Map();
  for (const img of r.images ?? []) {
    const h = hashFromPath(img.storagePath);
    if (h) urlByHash.set(h, img.url);
  }
  const imageUrlByBin = new Map();
  for (const bin of binIdsOf(c)) {
    const url = urlByHash.get(hashOf(bin) ?? "");
    if (url) imageUrlByBin.set(bin, url);
    else missingImg.push(`${r.case_number}:${bin}`);
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
  if (missingImg.length)
    console.log(`  ! 이미지 URL 미확보 ${missingImg.length}건: ${missingImg.slice(0, 10).join(", ")}`);
  console.log(
    `${APPLY ? "적용" : "dry-run"}: 대상 ${rows.length} / 갱신 ${updated} / 교재외 ${noBook} / 실패 ${failed} `,
  );
}
