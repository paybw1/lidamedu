// case.summary staff highlight offset 재계산.
//
// 배경: SummaryBlock 의 duplicatesHeader 휴리스틱이 폐기되면서(case_title ==
// summary[0].title 인 case 에서 박스 안 제목이 빈에서 displayTitle 로 채워짐),
// 본문 textContent flow 가 변경되어 staff highlight offset 이 어긋남.
//
// 알고리즘: 새 textContent 를 SummaryBlock + Prose 의 렌더 시뮬레이션으로
// 재구성한 뒤 highlight 의 label 을 그 안에서 검색해 새 offset 으로 update.
// label 이 안 보이면 unmatched 로 보고만 — 사용자가 admin 에서 재지정.
//
// 사용:
//   node scripts/precedents/recompute-summary-highlights.mjs              # dry-run
//   node scripts/precedents/recompute-summary-highlights.mjs --apply
//   node scripts/precedents/recompute-summary-highlights.mjs --case 96후658

import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv();

const APPLY = process.argv.includes("--apply");
const caseIdx = process.argv.indexOf("--case");
const ONLY_CASE = caseIdx >= 0 ? process.argv[caseIdx + 1] : null;
const STAFF_USER_ID = "8dbc9c0e-a32d-456e-bf53-bf89160669e0";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 .env 에 필요합니다.");
  process.exit(1);
}
const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function sha256Hex(s) {
  return createHash("sha256").update(s, "utf-8").digest("hex");
}

const IMG_PARA_RE =
  /^!\[(?<alt>[^\]]*)\]\((?<url>[^)\s]+)(?:\s+"[^"]*")?\)\s*$/;
function parseImageParagraph(p) {
  const m = p.trim().match(IMG_PARA_RE);
  if (!m || !m.groups) return null;
  return { alt: m.groups.alt, url: m.groups.url };
}
function isMarkdownTableParagraph(p) {
  const lines = p.split("\n");
  if (lines.length < 2) return false;
  const head = lines[0].trim();
  const sep = lines[1].trim();
  if (!head.startsWith("|") || !head.endsWith("|")) return false;
  if (!sep.startsWith("|") || !sep.endsWith("|")) return false;
  const cells = sep.slice(1, -1).split("|").map((c) => c.trim());
  if (cells.length === 0) return false;
  return cells.every((c) => /^:?-{3,}:?$/.test(c));
}
// markdown 표의 textContent — header + body row cells join (separator 행 제외).
function tableTextContent(p) {
  const lines = p.split("\n");
  const cells = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l.startsWith("|")) continue;
    // separator 행 skip
    if (/^\|\s*:?-{3,}:?(\s*\|\s*:?-{3,}:?\s*)+\|$/.test(l)) continue;
    const arr = l
      .slice(1, l.endsWith("|") ? -1 : undefined)
      .split("|")
      .map((c) => c.trim());
    cells.push(...arr);
  }
  return cells.join("");
}
function stripUnderline(s) {
  return (s ?? "").replace(/<\/?u>/g, "");
}

// Prose 의 textContent — paragraph 분리 + image/table/text 별 처리.
function proseTextContent(text) {
  if (!text) return "";
  const paras = text.split(/\n{2,}/).filter((s) => s.trim() !== "");
  let out = "";
  for (const p of paras) {
    const img = parseImageParagraph(p);
    if (img) {
      // InlineImage 의 caption = alt (있을 때만 figcaption 출력).
      // img 자체는 textContent 빈.
      out += img.alt ?? "";
      continue;
    }
    if (isMarkdownTableParagraph(p)) {
      out += tableTextContent(p);
      continue;
    }
    out += stripUnderline(p);
  }
  return out;
}

// SummaryBlock textContent — labelNumber + displayTitle + Prose(body) 합.
function summaryBlockTextContent(item, index, totalItems) {
  const t = item.title ?? "";
  let label = null;
  let displayTitle = t;
  const m = t.match(/^\[(\d+)\]\s*(.*)$/);
  if (m) {
    label = `[${m[1]}]`;
    displayTitle = m[2];
  }
  const showLabel = totalItems > 1;
  if (showLabel && !label) label = `[${index + 1}]`;
  const labelNumber = label ? label.replace(/[^\d]/g, "") : null;
  let out = "";
  if (labelNumber) out += labelNumber;
  out += stripUnderline(displayTitle);
  out += proseTextContent(item.body ?? "");
  return out;
}

// case 의 summary 섹션 전체 textContent.
function caseSummaryTextContent(kase) {
  const items =
    Array.isArray(kase.summary_items) && kase.summary_items.length > 0
      ? kase.summary_items
      : kase.summary_body_md
        ? [{ title: kase.summary_title ?? "", body: kase.summary_body_md }]
        : [];
  let out = "";
  items.forEach((it, i) => {
    out += summaryBlockTextContent(it, i, items.length);
  });
  return out;
}

async function main() {
  console.log(`mode  : ${APPLY ? "APPLY" : "DRY-RUN"}`);

  // 1) 영향 case + 그 staff summary highlights.
  let q = supabase
    .from("cases")
    .select(
      "case_id, case_number, summary_items, summary_title, summary_body_md",
    )
    .contains("subject_laws", ["patent"])
    .is("deleted_at", null);
  if (ONLY_CASE) q = q.eq("case_number", ONLY_CASE);
  const { data: cases, error: ce } = await q;
  if (ce) {
    console.error("cases 조회 실패:", ce.message);
    process.exit(1);
  }
  console.log(`cases: ${cases.length}`);

  const caseIds = cases.map((c) => c.case_id);
  const hlByCase = new Map();
  for (let i = 0; i < caseIds.length; i += 500) {
    const slice = caseIds.slice(i, i + 500);
    if (slice.length === 0) continue;
    const { data: hls, error: he } = await supabase
      .from("user_highlights")
      .select("highlight_id, target_id, start_offset, end_offset, label")
      .eq("user_id", STAFF_USER_ID)
      .eq("target_type", "case")
      .eq("color", "underline")
      .eq("field_path", "case.summary")
      .is("deleted_at", null)
      .in("target_id", slice);
    if (he) {
      console.error("highlights 조회 실패:", he.message);
      process.exit(1);
    }
    for (const h of hls ?? []) {
      const arr = hlByCase.get(h.target_id) ?? [];
      arr.push(h);
      hlByCase.set(h.target_id, arr);
    }
  }
  const totalHls = [...hlByCase.values()].reduce((a, arr) => a + arr.length, 0);
  console.log(`staff underline (case.summary): ${totalHls} in ${hlByCase.size} cases`);

  // 2) case 별 새 textContent + highlight label 검색.
  const updates = [];
  let matched = 0;
  let unmatched = 0;
  let noChange = 0;
  for (const c of cases) {
    const hls = hlByCase.get(c.case_id);
    if (!hls || hls.length === 0) continue;
    const newText = caseSummaryTextContent(c);
    // 같은 case 안 여러 highlight 가 같은 label 인 경우 순서 보장 — 기존 start_offset
    // 오름차순으로 처리 + cursor 진행.
    const sorted = [...hls].sort((a, b) => a.start_offset - b.start_offset);
    let cursor = 0;
    for (const h of sorted) {
      const label = h.label ?? "";
      if (!label) {
        unmatched += 1;
        continue;
      }
      const idx = newText.indexOf(label, cursor);
      if (idx < 0) {
        unmatched += 1;
        console.warn(
          `  unmatched: ${c.case_number} hl=${h.highlight_id} label="${label.slice(0, 50)}${label.length > 50 ? "…" : ""}"`,
        );
        continue;
      }
      matched += 1;
      const newStart = idx;
      const newEnd = idx + label.length;
      if (newStart === h.start_offset && newEnd === h.end_offset) {
        noChange += 1;
      } else {
        updates.push({
          highlight_id: h.highlight_id,
          case_number: c.case_number,
          start_offset: newStart,
          end_offset: newEnd,
          content_hash: sha256Hex(label),
          old: `${h.start_offset}→${h.end_offset}`,
          newRange: `${newStart}→${newEnd}`,
        });
      }
      cursor = newEnd;
    }
  }
  console.log(
    `\n── 결과 ── matched=${matched}, unmatched=${unmatched}, no-change=${noChange}, will-update=${updates.length}`,
  );

  if (updates.slice(0, 10).length > 0) {
    console.log(`\n── 샘플 변경 ──`);
    updates.slice(0, 10).forEach((u) => {
      console.log(
        `  ${u.case_number.padEnd(15, " ")} ${u.old.padStart(10, " ")} → ${u.newRange}`,
      );
    });
    if (updates.length > 10) console.log(`  … 외 ${updates.length - 10}건`);
  }

  if (!APPLY) {
    console.log(`\n(dry-run — --apply 로 실제 update)`);
    return;
  }

  console.log(`\n── apply ──`);
  let ok = 0;
  let fail = 0;
  for (const u of updates) {
    const { highlight_id, case_number, old, newRange, ...patch } = u;
    void case_number;
    void old;
    void newRange;
    const { error } = await supabase
      .from("user_highlights")
      .update(patch)
      .eq("highlight_id", highlight_id);
    if (error) {
      console.error(`  ${highlight_id} 실패: ${error.message}`);
      fail += 1;
    } else ok += 1;
  }
  console.log(`  ok=${ok}, fail=${fail}`);
  console.log(`\n=== 완료 ===`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
