// HWPX 판례집에서 표를 추출해 DB cases 본문(comment/summary/reasoning)에 삽입.
//
// 알고리즘:
//   1) section0.xml 파싱 (fast-xml-parser preserveOrder)
//   2) paragraph 순서대로 순회 — 사건번호 헤더 paragraph 검출 → 현재 case 컨텍스트
//      바뀜. 표(<hp:tbl>) 노드는 그 시점 현재 case 에 귀속.
//   3) 각 표 → markdown 표 변환 (셀 텍스트 join)
//   4) 매칭 case 의 DB 본문에서 동일 표 셀 텍스트가 squash 된 채 들어있는지 검사
//      → 있으면 그 부분을 markdown 표로 교체. 없으면 비고(comment_body_md) 끝에
//      append (or report only).
//
// 사용:
//   node scripts/precedents/insert-hwpx-tables.mjs               # dry-run
//   node scripts/precedents/insert-hwpx-tables.mjs --apply
//   node scripts/precedents/insert-hwpx-tables.mjs --case 2010다95390

import { readFileSync } from "node:fs";
import { XMLParser } from "fast-xml-parser";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv();

const APPLY = process.argv.includes("--apply");
const caseIdx = process.argv.indexOf("--case");
const ONLY_CASE = caseIdx >= 0 ? process.argv[caseIdx + 1] : null;
const VERBOSE = process.argv.includes("--verbose");

const HWPX_XML = ".tmp/hwpx-extract/Contents/section0.xml";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 .env 에 필요합니다.");
  process.exit(1);
}
const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ─── XML 파싱 ────────────────────────────────────────────────────────────
const xml = readFileSync(HWPX_XML, "utf-8");
const parser = new XMLParser({
  ignoreAttributes: false,
  preserveOrder: true,
  attributeNamePrefix: "@_",
  trimValues: false,
});
const tree = parser.parse(xml);

// preserveOrder tree 구조 — 배열의 각 원소가 { tagName: [children], ":@": attrs }
// text 노드는 { "#text": "..." }

// 한 node 의 children 배열을 얻기 (tagName 무관).
function childrenOf(node) {
  const keys = Object.keys(node).filter((k) => k !== ":@");
  if (keys.length !== 1) return [];
  const v = node[keys[0]];
  if (typeof v === "string") return [];
  return Array.isArray(v) ? v : [];
}
function tagOf(node) {
  const keys = Object.keys(node).filter((k) => k !== ":@");
  return keys[0] ?? null;
}

// DFS — 노드 안 모든 <hp:t> 텍스트 join.
function textOf(node) {
  if (!node) return "";
  const tag = tagOf(node);
  if (tag === "#text") return String(node["#text"] ?? "");
  if (tag === "hp:t") {
    let s = "";
    for (const c of childrenOf(node)) s += textOf(c);
    return s;
  }
  let s = "";
  for (const c of childrenOf(node)) {
    s += textOf(c);
  }
  return s;
}

// paragraph 안의 표 검색 (depth 무관). paragraph 자체는 표 없을 수도 있다.
function findTablesInParagraph(p) {
  const out = [];
  function recur(node) {
    const t = tagOf(node);
    if (t === "hp:tbl") {
      out.push(node);
      // 표 안 paragraph 의 표 (중첩)는 일단 무시 — 셀 내부 표는 드물.
      return;
    }
    for (const c of childrenOf(node)) recur(c);
  }
  recur(p);
  return out;
}

// 표가 "진짜 데이터 표" 인지 판정.
//   - rows >= 2 AND cols >= 2 (1행/1열 박스 제외)
//   - 첫 행 첫 셀이 "비고" 가 아님 (비고 박스 디자인은 markdown 표로 변환 안 함)
//   - "그림입니다" placeholder 셀 비율 50% 미만 (이미지-only 표 제외)
//   - 의미 있는 텍스트 셀(길이 ≥ 1) 비율 ≥ 50%
function isDataTable(rows) {
  if (rows.length < 2) return false;
  const cols = Math.max(...rows.map((r) => r.length));
  if (cols < 2) return false;
  // 첫 행 셀들이 메타 라벨(비고/관련판례/판례색인/저자약력/주요저서…)이면 진짜 데이터 표 아님.
  const META_LABELS = new Set([
    "비고",
    "관련판례",
    "판례색인",
    "저자약력",
    "주요저서",
    "참고문헌",
    "목차",
  ]);
  const headerCells = rows[0]?.map((c) => (c ?? "").trim()) ?? [];
  if (headerCells.some((c) => META_LABELS.has(c))) return false;
  let imgCells = 0;
  let nonEmpty = 0;
  let total = 0;
  for (const r of rows) {
    for (const c of r) {
      total++;
      const t = (c ?? "").trim();
      if (t === "") continue;
      nonEmpty++;
      if (t.includes("그림입니다") || t.includes("원본 그림")) imgCells++;
    }
  }
  if (total === 0) return false;
  if (imgCells / total >= 0.5) return false;
  if (nonEmpty / total < 0.5) return false;
  return true;
}

// 표 → markdown. <hp:tr><hp:tc> 구조.
function tableToMarkdown(tbl) {
  const rows = [];
  function recur(node, ctx) {
    const t = tagOf(node);
    if (t === "hp:tr") {
      const row = [];
      function walkTr(n2) {
        const t2 = tagOf(n2);
        if (t2 === "hp:tc") {
          // 셀 안 모든 text 추출, 줄넘김은 공백으로 단순화.
          const txt = textOf(n2).replace(/\s+/g, " ").trim();
          row.push(txt);
          return;
        }
        for (const c of childrenOf(n2)) walkTr(c);
      }
      for (const c of childrenOf(node)) walkTr(c);
      rows.push(row);
      return;
    }
    for (const c of childrenOf(node)) recur(c, ctx);
  }
  for (const c of childrenOf(tbl)) recur(c);
  if (rows.length === 0) return null;
  const cols = Math.max(...rows.map((r) => r.length));
  const norm = rows.map((r) => {
    const padded = [...r];
    while (padded.length < cols) padded.push("");
    return padded;
  });
  if (!isDataTable(norm)) return null;
  // markdown GFM 표 — 첫 행을 헤더.
  const lines = [];
  lines.push(`| ${norm[0].map(escMd).join(" | ")} |`);
  lines.push(`| ${new Array(cols).fill("---").join(" | ")} |`);
  for (let i = 1; i < norm.length; i++) {
    lines.push(`| ${norm[i].map(escMd).join(" | ")} |`);
  }
  return { markdown: lines.join("\n"), rows: norm };
}
function escMd(s) {
  return String(s ?? "").replace(/\|/g, "\\|");
}

// 사건번호 패턴 — 보통 paragraph 시작 부근에 단독 등장 (앞에 "대법원" 가능).
// 예: 2010다95390 / 97후2095 / 63후45 / 2011가합39552 / 99허710 / 2009허2432
const CASE_NUM_RX =
  /(?:^|[\s\(\[])(\d{2,4}(?:[가-힣]{1,3})\d+(?:의\d+)?)(?:[\s\)\],.:;\?!]|$)/g;
function extractCaseNumbers(text) {
  const out = new Set();
  for (const m of text.matchAll(CASE_NUM_RX)) {
    out.add(m[1]);
  }
  return out;
}

// section0.xml 의 root 는 [{ "?xml": ... }, { "hs:sec": [...]}].
// hs:sec children 을 순회.
function findSection(rootArr) {
  for (const n of rootArr) {
    if (tagOf(n) === "hs:sec") return n;
  }
  return null;
}
const section = findSection(tree);
if (!section) {
  console.error("hs:sec 을 찾을 수 없습니다.");
  process.exit(1);
}

// section 의 paragraph 들 — 보통 <hp:p> 가 직접 자식. 일부는 ctrl 안에.
function collectParagraphs(node) {
  const out = [];
  function recur(n) {
    const t = tagOf(n);
    if (t === "hp:p") {
      out.push(n);
      // p 안의 자식 paragraph 도 본다 (예: 표 셀 안의 p) — 다만 위치 기준이 깨질 수
      // 있으니 표 안의 paragraph 는 skip (findTablesInParagraph 가 같은 표 셀 텍스트도
      // 추출). 즉 표 안 p 는 표의 일부로만 처리.
      return;
    }
    for (const c of childrenOf(n)) recur(c);
  }
  recur(node);
  return out;
}
const paragraphs = collectParagraphs(section);
console.log(`paragraphs: ${paragraphs.length}`);

// 진단 — 사건번호 like 패턴이 등장하는 paragraph 의 시작 60자 미리보기.
if (process.argv.includes("--probe")) {
  let shown = 0;
  for (let i = 0; i < paragraphs.length; i++) {
    const txt = textOf(paragraphs[i]).trim();
    if (!txt) continue;
    if (
      /\d{2,4}(?:다|허|후|마|두|가합|카합|머|므|호)/.test(txt.slice(0, 80))
    ) {
      console.log(`  [P${i}] "${txt.slice(0, 80).replace(/\s+/g, " ")}"`);
      shown++;
      if (shown >= 30) break;
    }
  }
  process.exit(0);
}

// case 헤더 paragraph 검출 — HWPX는 표/이미지 등을 grouped object 로 처리해
// "묶음 개체입니다." prefix 가 자동 붙는다. 그 뒤 "대법원/특허법원/지방법원…" 으로
// 시작하는 paragraph 가 case 헤더.
const PARA_HEADER_PREFIX =
  /^(?:묶음 개체입니다\.?\s*)?(?:대법원|특허법원|서울.{0,5}법원|광주.{0,5}법원|부산.{0,5}법원|인천.{0,5}법원|대구.{0,5}법원|대전.{0,5}법원|수원.{0,5}법원|울산.{0,5}법원|창원.{0,5}법원|의정부.{0,5}법원|춘천.{0,5}법원|청주.{0,5}법원|전주.{0,5}법원|제주.{0,5}법원|특허심판원)/;
const CASE_NUM_HEADER_RX =
  /(?<!\d)(\d{2,4}(?:다|허|후|마|두|가합|가단|카합|카단|머|므|호|허단)\d+(?:의\d+)?)(?!\d)/;

// 결과 누적.
const tablesByCase = new Map(); // caseNumber → [{ markdown, rows, paraIndex }]
let currentCase = null;
const orphanTables = []; // 사건번호 컨텍스트 모르는 표

for (let i = 0; i < paragraphs.length; i++) {
  const p = paragraphs[i];
  const text = textOf(p).trim();

  // 사건번호 헤더 — paragraph 가 법원명으로 시작 + 첫 사건번호 매칭.
  if (PARA_HEADER_PREFIX.test(text)) {
    const cm = text.match(CASE_NUM_HEADER_RX);
    if (cm) {
      currentCase = cm[1];
      if (VERBOSE) console.log(`  [P${i}] case header → ${currentCase}`);
    }
  }

  // 표 추출.
  const tbls = findTablesInParagraph(p);
  for (const tbl of tbls) {
    const conv = tableToMarkdown(tbl);
    if (!conv) continue;
    const target = currentCase ?? "__ORPHAN__";
    if (target === "__ORPHAN__") {
      orphanTables.push({ paraIndex: i, ...conv });
    } else {
      const arr = tablesByCase.get(target) ?? [];
      arr.push({ paraIndex: i, ...conv });
      tablesByCase.set(target, arr);
    }
  }
}

console.log(
  `\ntables found: ${[...tablesByCase.values()].reduce((a, v) => a + v.length, 0)} in ${tablesByCase.size} cases (orphan ${orphanTables.length})`,
);

if (VERBOSE) {
  console.log(`\n── 케이스별 표 수 ──`);
  for (const [cn, ts] of tablesByCase) {
    console.log(`  ${cn}: ${ts.length}개`);
  }
}

// ─── DB 매칭 + 본문 점검 ──────────────────────────────────────────────────
const caseNumbers = [...tablesByCase.keys()];
if (ONLY_CASE) {
  caseNumbers.length = 0;
  if (tablesByCase.has(ONLY_CASE)) caseNumbers.push(ONLY_CASE);
}

const { data: rows, error: ce } = await supabase
  .from("cases")
  .select(
    "case_id, case_number, summary_items, summary_body_md, reasoning_md, comment_body_md",
  )
  .contains("subject_laws", ["patent"])
  .is("deleted_at", null)
  .in("case_number", caseNumbers);
if (ce) {
  console.error("cases 조회 실패:", ce.message);
  process.exit(1);
}
const dbByNum = new Map(rows.map((r) => [r.case_number, r]));

console.log(`\n── DB 매칭 ──`);
console.log(`HWPX 표 case_number 수: ${caseNumbers.length}`);
console.log(`DB 매칭됨: ${dbByNum.size}`);
const unmatched = caseNumbers.filter((cn) => !dbByNum.has(cn));
if (unmatched.length > 0) {
  console.log(`DB 매칭 안됨 (${unmatched.length}): ${unmatched.slice(0, 20).join(", ")}${unmatched.length > 20 ? " …" : ""}`);
}

// 표가 이미 본문에 markdown 형식으로 들어있는지 검사 — 셀 텍스트 join 으로 단순 검사.
function hasTableInBody(body, rows2) {
  if (!body) return false;
  // 표 GFM 형식 (`|`) 존재 + 셀 텍스트 일부 일치 여부.
  if (!body.includes("|")) return false;
  // 첫 행의 두 번째 셀(헤더 두 번째) + 마지막 행 첫 셀 의 존재 여부로 판정.
  // (셀이 너무 짧으면 false positive 가능 — 헤더는 보통 충분히 김.)
  const header2 = (rows2[0]?.[1] ?? "").trim();
  const lastFirst = (rows2[rows2.length - 1]?.[0] ?? "").trim();
  if (!header2 || !lastFirst) return false;
  return body.includes(header2) && body.includes(lastFirst);
}
function bodyContainsCellText(body, rows2) {
  // 본문이 squash 된 표 텍스트를 포함하는지 — 셀 텍스트들이 순서대로 단순 등장.
  if (!body) return null;
  // 모든 셀 텍스트를 공백 join 한 시퀀스 — 그 일부 (앞쪽 4 셀) 이 본문에 연속 등장하는지.
  const seq = rows2.flat().map((s) => s.trim()).filter(Boolean);
  if (seq.length < 4) return null;
  for (let start = 0; start + 4 <= seq.length; start++) {
    const probe = seq.slice(start, start + 4).join(" ");
    const idx = body.indexOf(probe);
    if (idx >= 0) return { idx, probeStart: start };
  }
  return null;
}

// 본문 내 squash 영역의 시작·끝 위치 찾기 — 전체 cell 시퀀스 forward search.
function findSquashRange(body, rows2) {
  const seq = rows2.flat().map((s) => s.trim()).filter(Boolean);
  if (seq.length === 0) return null;
  // 첫 셀 (가장 식별력 있는 것) — 보통 헤더 첫 셀. 그러나 헤더 첫 셀이 ""(빈) 일 수 있음.
  // 그래서 시퀀스 첫 non-empty 부터 시작 위치 찾기.
  const first = seq[0];
  const last = seq[seq.length - 1];
  // 마지막 셀 last 의 끝 위치.
  const startIdx = body.indexOf(first);
  if (startIdx < 0) return null;
  const lastIdx = body.indexOf(last, startIdx);
  if (lastIdx < 0) return null;
  const endIdx = lastIdx + last.length;
  // 안전 점검 — 사이 거리가 너무 멀면 (예: 본문 절반 이상) skip.
  if (endIdx - startIdx > 3000) return null;
  return { start: startIdx, end: endIdx };
}

// ─── 대상 case 별 처리 plan 작성 ─────────────────────────────────────────
const plans = [];
for (const cn of caseNumbers) {
  const tbls = tablesByCase.get(cn) ?? [];
  const dbRow = dbByNum.get(cn);
  if (!dbRow) continue;

  // 본문 fields — case-viewer 가 실제 렌더하는 것만 검사. summary_items 가 있으면
  // summary_body_md 는 legacy 이므로 검사하지 않는다 (사용자 화면에 안 보임).
  for (const tbl of tbls) {
    const fields = [];
    const items = dbRow.summary_items ?? [];
    const hasItems = Array.isArray(items) && items.length > 0;
    if (hasItems) {
      for (let ii = 0; ii < items.length; ii++) {
        const it = items[ii];
        if (typeof it?.body === "string") {
          fields.push({ key: `summary_items[${ii}].body`, body: it.body });
        }
        if (typeof it?.commentMd === "string") {
          fields.push({
            key: `summary_items[${ii}].commentMd`,
            body: it.commentMd,
          });
        }
      }
    } else if (dbRow.summary_body_md) {
      fields.push({ key: "summary_body", body: dbRow.summary_body_md });
    }
    fields.push({ key: "comment", body: dbRow.comment_body_md ?? "" });
    fields.push({ key: "reasoning", body: dbRow.reasoning_md ?? "" });

    const alreadyAt = fields.find((f) => hasTableInBody(f.body, tbl.rows));
    if (alreadyAt) {
      plans.push({ cn, action: "skip-already", field: alreadyAt.key, tbl });
      continue;
    }
    // squash 위치 검출.
    let squashAt = null;
    for (const f of fields) {
      const r = findSquashRange(f.body, tbl.rows);
      if (r) {
        squashAt = { field: f.key, ...r };
        break;
      }
    }
    if (squashAt) {
      plans.push({ cn, action: "replace-squash", squashAt, tbl });
    } else {
      plans.push({ cn, action: "append-comment", tbl });
    }
  }
}

// ─── plan 요약 출력 ──────────────────────────────────────────────────────
const counts = { "skip-already": 0, "replace-squash": 0, "append-comment": 0 };
for (const p of plans) counts[p.action]++;
console.log(`\n=== plan 요약 ===`);
console.log(`  이미 markdown 표로 존재    : ${counts["skip-already"]}`);
console.log(`  본문 squash → markdown 교체: ${counts["replace-squash"]}`);
console.log(`  본문에 없음 → 비고 append  : ${counts["append-comment"]}`);

// 상세 — case 별 첫 plan 만 sample 출력.
const samplesByAction = { "replace-squash": [], "append-comment": [] };
for (const p of plans) {
  if (samplesByAction[p.action]?.length < 8) {
    samplesByAction[p.action]?.push(p);
  }
}
for (const action of ["replace-squash", "append-comment"]) {
  if (samplesByAction[action].length === 0) continue;
  console.log(`\n── ${action} 샘플 ──`);
  for (const p of samplesByAction[action]) {
    const head = p.tbl.rows[0].map((c) => c.slice(0, 12)).join(" / ");
    console.log(`  ${p.cn}: rows=${p.tbl.rows.length}, cols=${p.tbl.rows[0].length}, header="${head}"`);
    if (process.argv.includes("--dump-md")) {
      console.log(p.tbl.markdown.replace(/^/gm, "      "));
    }
    if (action === "replace-squash") {
      const dbRow = dbByNum.get(p.cn);
      const field = p.squashAt.field;
      const body =
        field === "comment"
          ? dbRow.comment_body_md ?? ""
          : field === "summary_body"
            ? dbRow.summary_body_md ?? ""
            : field === "reasoning"
              ? dbRow.reasoning_md ?? ""
              : field.startsWith("summary_items")
                ? "(jsonb path)"
                : "(?)";
      const snippet =
        body && typeof body === "string"
          ? body.slice(p.squashAt.start, p.squashAt.end).slice(0, 100)
          : "";
      console.log(
        `    field=${field} squash [${p.squashAt.start}..${p.squashAt.end}] "${snippet}…"`,
      );
    }
  }
}

if (!APPLY) {
  console.log(`\n(dry-run — --apply 로 실제 update)`);
  process.exit(0);
}

// ─── apply ───────────────────────────────────────────────────────────────
console.log(`\n=== apply ===`);
let ok = 0;
let fail = 0;
// case 별로 변경을 집계 후 한 번에 update.
const patchesByCase = new Map(); // case_id → { comment?, summary_body?, reasoning?, summary_items? }
for (const p of plans) {
  if (p.action === "skip-already") continue;
  const dbRow = dbByNum.get(p.cn);
  if (!dbRow) continue;
  const patch = patchesByCase.get(dbRow.case_id) ?? {
    comment_body_md: dbRow.comment_body_md,
    summary_body_md: dbRow.summary_body_md,
    reasoning_md: dbRow.reasoning_md,
    summary_items: dbRow.summary_items,
  };
  if (p.action === "replace-squash") {
    const f = p.squashAt.field;
    const tableBlock = `\n\n${p.tbl.markdown}\n`;
    if (f === "comment") {
      const b = patch.comment_body_md ?? "";
      patch.comment_body_md =
        b.slice(0, p.squashAt.start) + tableBlock + b.slice(p.squashAt.end);
    } else if (f === "summary_body") {
      const b = patch.summary_body_md ?? "";
      patch.summary_body_md =
        b.slice(0, p.squashAt.start) + tableBlock + b.slice(p.squashAt.end);
    } else if (f === "reasoning") {
      const b = patch.reasoning_md ?? "";
      patch.reasoning_md =
        b.slice(0, p.squashAt.start) + tableBlock + b.slice(p.squashAt.end);
    } else if (f.startsWith("summary_items[")) {
      const mIdx = f.match(/summary_items\[(\d+)\]\.(body|commentMd)/);
      if (mIdx) {
        const idx = Number(mIdx[1]);
        const sub = mIdx[2];
        const items = [...(patch.summary_items ?? [])];
        const it = { ...items[idx] };
        const b = it[sub] ?? "";
        it[sub] = b.slice(0, p.squashAt.start) + tableBlock + b.slice(p.squashAt.end);
        items[idx] = it;
        patch.summary_items = items;
      }
    }
  } else if (p.action === "append-comment") {
    const b = patch.comment_body_md ?? "";
    const tableBlock = b ? `\n\n${p.tbl.markdown}` : p.tbl.markdown;
    patch.comment_body_md = b + tableBlock;
  }
  patchesByCase.set(dbRow.case_id, patch);
}

for (const [caseId, patch] of patchesByCase) {
  const { error: uerr } = await supabase
    .from("cases")
    .update({
      comment_body_md: patch.comment_body_md,
      summary_body_md: patch.summary_body_md,
      reasoning_md: patch.reasoning_md,
      summary_items: patch.summary_items,
    })
    .eq("case_id", caseId);
  if (uerr) {
    console.error(`  ${caseId} 실패: ${uerr.message}`);
    fail++;
  } else {
    ok++;
  }
}
console.log(`  ok=${ok}, fail=${fail}`);
console.log(`\n=== 완료 ===`);
