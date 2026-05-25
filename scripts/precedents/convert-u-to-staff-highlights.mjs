// case 본문의 <u>...</u> 마커를 staff(원장/관리자/강사) underline highlight 로 변환.
//
// 정책:
//   - field_path: case.summary / case.reasoning / case.comment
//   - color: "underline" — feat-3-207 의 5번째 옵션. 학생 viewer 에 staff-style 로 노출(RLS).
//   - start_offset/end_offset: case-body.tsx 의 textContent flow 정확 모방
//   - excerpt: <u> 안 텍스트 (label 미포함 plain)
//   - content_hash: SHA-256(excerpt)
//   - user_id: 사용자 본인의 admin profile_id (8dbc9c0e-... 임병웅)
//
// 적용 후:
//   - cases.summary_items / summary_body_md / reasoning_md / comment_body_md 에서 <u> 마커 제거
//   - search_tsv 자동 재계산 (generated stored)
//   - 학생 viewer 는 기존 HighlightOverlay (CSS Highlight API) 로 자동 표시
//   - staff 는 toolbar 로 underline 추가/삭제·기존 항목 toolbar 로 선택해 삭제 가능
//
// 사용:
//   node scripts/precedents/convert-u-to-staff-highlights.mjs                # dry-run
//   node scripts/precedents/convert-u-to-staff-highlights.mjs --apply        # 실행
//   node scripts/precedents/convert-u-to-staff-highlights.mjs --case 2017후523  # 1건만

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

loadEnv();

const APPLY = process.argv.includes("--apply");
const caseIdx = process.argv.indexOf("--case");
const ONLY_CASE = caseIdx >= 0 ? process.argv[caseIdx + 1] : null;
const STAFF_USER_ID = "8dbc9c0e-a32d-456e-bf53-bf89160669e0"; // bwyim@lidamip.com 임병웅 (admin)

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

function stripU(s) {
  return (s ?? "").replace(/<\/?u>/g, "");
}

// ─── textContent flow 모방 — case-body.tsx 의 SummaryBlock + Prose 정확히 따라감.
//     reflow 는 적용하지 않는다 (case-body 가 본문을 reflow 없이 그대로 렌더).
//     labelNumber 는 괄호 없는 숫자만, dupHeader 휴리스틱은 폐기(commit 8aa2fa6),
//     commentMd 분기는 "비고 N" + "이 요지에 대한 코멘트" + Prose(commentMd) 추가.
//     단, 본문에 <u> 가 박혀있는 동안의 누적 offset 계산이 목적이므로 consume() 가
//     본문에서 <u> 마커를 strip 하면서 그 안 텍스트만 acc 에 누적.

// markdown 표 detection (case-body 의 isMarkdownTableParagraph 정합)
function isMarkdownTableParagraph(p) {
  const lines = p.split("\n");
  if (lines.length < 2) return false;
  const head = lines[0].trim();
  const sep = lines[1].trim();
  if (!head.startsWith("|") || !head.endsWith("|")) return false;
  if (!sep.startsWith("|") || !sep.endsWith("|")) return false;
  const cells = sep
    .slice(1, -1)
    .split("|")
    .map((c) => c.trim());
  if (cells.length === 0) return false;
  return cells.every((c) => /^:?-{3,}:?$/.test(c));
}
// 표 paragraph 의 textContent — header + body row cells join.
function tableTextContent(p) {
  const lines = p.split("\n");
  const cells = [];
  for (const l of lines) {
    const t = l.trim();
    if (!t.startsWith("|")) continue;
    if (/^\|\s*:?-{3,}:?(\s*\|\s*:?-{3,}:?\s*)+\|$/.test(t)) continue;
    const arr = t
      .slice(1, t.endsWith("|") ? -1 : undefined)
      .split("|")
      .map((c) => c.trim());
    cells.push(...arr);
  }
  return cells.join("");
}
const IMG_PARA_RE =
  /^!\[(?<alt>[^\]]*)\]\((?<url>[^)\s]+)(?:\s+"[^"]*")?\)\s*$/;
function parseImageParagraph(p) {
  const m = p.trim().match(IMG_PARA_RE);
  if (!m || !m.groups) return null;
  return { alt: m.groups.alt, url: m.groups.url };
}

// consume — 주어진 문자열을 acc 에 누적하면서 <u>...</u> 마커를 검출.
// 마커 안 텍스트의 acc 상 [start, end) 를 marks 에 push.
function makeConsumer() {
  let acc = "";
  const marks = [];
  function consume(s) {
    if (!s) return;
    const re = /<u>([\s\S]*?)<\/u>/g;
    let last = 0;
    let m;
    while ((m = re.exec(s)) !== null) {
      acc += s.slice(last, m.index);
      const start = acc.length;
      acc += m[1];
      const end = acc.length;
      marks.push({ start, end, content: m[1] });
      last = m.index + m[0].length;
    }
    acc += s.slice(last);
  }
  return {
    consume,
    get acc() {
      return acc;
    },
    marks,
  };
}

// Prose 의 textContent — paragraph 별 처리 (이미지/표/텍스트).
// case-body.tsx 의 buildProseBlocks + Prose 와 정확히 정합. reflow 없음.
function feedProse(text, c) {
  if (!text) return;
  const paras = text.split(/\n{2,}/).filter((s) => s.trim() !== "");
  for (const p of paras) {
    const img = parseImageParagraph(p);
    if (img) {
      // InlineImage 의 figcaption = alt (alt 있을 때만 텍스트로 출력).
      // img element 자체는 textContent 빈.
      c.consume(img.alt ?? "");
      continue;
    }
    if (isMarkdownTableParagraph(p)) {
      // 표 paragraph 에는 <u> 마커 검사하지 않음 — 표 안에 <u> 있을 경우 stripU 만.
      c.consume(stripU(tableTextContent(p)));
      continue;
    }
    c.consume(p);
  }
}

// SummaryBlock textContent — labelNumber + displayTitle + Prose(body) [+ "비고 N" +
// "이 요지에 대한 코멘트" + Prose(commentMd)].
function feedSummaryItem(item, index, totalItems, c) {
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

  if (labelNumber) c.consume(labelNumber);
  c.consume(displayTitle);
  feedProse(item.body ?? "", c);

  const commentRaw =
    typeof item.commentMd === "string"
      ? item.commentMd
      : typeof item.comment_md === "string"
        ? item.comment_md
        : "";
  if (commentRaw && commentRaw.trim() !== "") {
    c.consume(labelNumber ? `비고 ${labelNumber}` : "비고");
    c.consume("이 요지에 대한 코멘트");
    feedProse(commentRaw, c);
  }
}

// case.summary container — 여러 SummaryBlock 누적.
function buildSummaryOffsets(summaryItems) {
  const c = makeConsumer();
  for (let i = 0; i < summaryItems.length; i += 1) {
    feedSummaryItem(summaryItems[i], i, summaryItems.length, c);
  }
  return { textContent: c.acc, marks: c.marks };
}

// case.reasoning / case.comment container — Prose 1개.
function buildProseOffsets(text) {
  const c = makeConsumer();
  feedProse(text, c);
  return { textContent: c.acc, marks: c.marks };
}

// ─── 본문 cleanup — DB 에서 <u> 마커 제거 (commentMd 포함) ────────────
function cleanSummaryItems(items) {
  return (items ?? []).map((it) => ({
    ...it,
    title: it.title ? stripU(it.title) : it.title,
    body: it.body ? stripU(it.body) : it.body,
    ...(typeof it.commentMd === "string"
      ? { commentMd: stripU(it.commentMd) }
      : {}),
    ...(typeof it.comment_md === "string"
      ? { comment_md: stripU(it.comment_md) }
      : {}),
  }));
}

async function main() {
  console.log(`mode  : ${APPLY ? "APPLY" : "DRY-RUN"}`);
  console.log(`staff : ${STAFF_USER_ID}`);

  let q = supabase
    .from("cases")
    .select(
      "case_id, case_number, case_title, summary_items, summary_body_md, reasoning_md, comment_body_md",
    )
    .contains("subject_laws", ["patent"]);
  if (ONLY_CASE) q = q.eq("case_number", ONLY_CASE);
  const { data: rows, error } = await q;
  if (error) {
    console.error("cases 조회 실패:", error.message);
    process.exit(1);
  }
  console.log(`cases: ${rows.length}`);

  const insertRows = [];
  const updateRows = [];
  let casesAffected = 0;
  let totalMarks = 0;
  const sampleSeen = { summary: false, reasoning: false, comment: false };

  for (const c of rows) {
    let touched = false;
    const fieldsToConsider = [];

    // summary
    if ((c.summary_items ?? []).length > 0) {
      const { textContent, marks } = buildSummaryOffsets(c.summary_items);
      for (const mk of marks) {
        insertRows.push({
          user_id: STAFF_USER_ID,
          target_type: "case",
          target_id: c.case_id,
          field_path: "case.summary",
          start_offset: mk.start,
          end_offset: mk.end,
          content_hash: sha256Hex(mk.content),
          color: "underline",
          label: mk.content.slice(0, 500),
        });
      }
      fieldsToConsider.push({
        name: "summary",
        marks: marks.length,
        textLen: textContent.length,
      });
      totalMarks += marks.length;
      if (!sampleSeen.summary && marks.length > 0) {
        sampleSeen.summary = true;
        console.log(
          `\n--- sample summary (${c.case_number}) — marks=${marks.length}, textLen=${textContent.length} ---`,
        );
        for (const mk of marks.slice(0, 3)) {
          console.log(
            `  [${mk.start}..${mk.end}] "${mk.content.slice(0, 80)}${mk.content.length > 80 ? "…" : ""}"`,
          );
          console.log(
            `  context: "…${textContent.slice(Math.max(0, mk.start - 20), mk.start)}[${textContent.slice(mk.start, mk.end)}]${textContent.slice(mk.end, Math.min(textContent.length, mk.end + 20))}…"`,
          );
        }
      }
    }

    // reasoning
    if (c.reasoning_md) {
      const { textContent, marks } = buildProseOffsets(c.reasoning_md);
      for (const mk of marks) {
        insertRows.push({
          user_id: STAFF_USER_ID,
          target_type: "case",
          target_id: c.case_id,
          field_path: "case.reasoning",
          start_offset: mk.start,
          end_offset: mk.end,
          content_hash: sha256Hex(mk.content),
          color: "underline",
          label: mk.content.slice(0, 500),
        });
      }
      fieldsToConsider.push({ name: "reasoning", marks: marks.length, textLen: textContent.length });
      totalMarks += marks.length;
      if (!sampleSeen.reasoning && marks.length > 0) {
        sampleSeen.reasoning = true;
        console.log(
          `\n--- sample reasoning (${c.case_number}) — marks=${marks.length} ---`,
        );
        for (const mk of marks.slice(0, 2)) {
          console.log(
            `  [${mk.start}..${mk.end}] "${mk.content.slice(0, 80)}${mk.content.length > 80 ? "…" : ""}"`,
          );
        }
      }
    }

    // comment
    if (c.comment_body_md) {
      const { textContent, marks } = buildProseOffsets(c.comment_body_md);
      for (const mk of marks) {
        insertRows.push({
          user_id: STAFF_USER_ID,
          target_type: "case",
          target_id: c.case_id,
          field_path: "case.comment",
          start_offset: mk.start,
          end_offset: mk.end,
          content_hash: sha256Hex(mk.content),
          color: "underline",
          label: mk.content.slice(0, 500),
        });
      }
      fieldsToConsider.push({ name: "comment", marks: marks.length, textLen: textContent.length });
      totalMarks += marks.length;
      if (!sampleSeen.comment && marks.length > 0) {
        sampleSeen.comment = true;
        console.log(
          `\n--- sample comment (${c.case_number}) — marks=${marks.length} ---`,
        );
        for (const mk of marks.slice(0, 2)) {
          console.log(
            `  [${mk.start}..${mk.end}] "${mk.content.slice(0, 80)}${mk.content.length > 80 ? "…" : ""}"`,
          );
        }
      }
    }

    const hasMarks = fieldsToConsider.some((f) => f.marks > 0);
    if (hasMarks) {
      touched = true;
      casesAffected += 1;
      updateRows.push({
        case_id: c.case_id,
        case_number: c.case_number,
        summary_items: cleanSummaryItems(c.summary_items),
        summary_body_md: c.summary_body_md ? stripU(c.summary_body_md) : null,
        reasoning_md: c.reasoning_md ? stripU(c.reasoning_md) : null,
        comment_body_md: c.comment_body_md ? stripU(c.comment_body_md) : null,
      });
    }
  }

  console.log(`\n=== 변환 통계 ===`);
  console.log(`cases affected   : ${casesAffected} / ${rows.length}`);
  console.log(`highlights total : ${totalMarks}`);
  console.log(`  inserts queued : ${insertRows.length}`);
  console.log(`  updates queued : ${updateRows.length}`);

  if (!APPLY) {
    console.log(`\n(dry-run — 실제 변경 안 함. --apply 로 실행)`);
    return;
  }

  // 변환 대상은 "본문에 <u> 가 있는 case" 만 (updateRows 로 좁힘). 한 번 변환하면
  // 본문 <u> 가 제거돼 재실행 시 자동 skip — 멱등. 따라서 사전 delete 불필요.
  // 이 정책 덕에 staff 가 직접 그어둔 underline highlight 가 보존된다.
  //
  // dedup 가드 — 과거 실행 등으로 이미 같은 (target_id, field_path, start, end,
  // content_hash) underline 이 있으면 skip. 본문에서 <u> 마커는 제거하지만 highlight
  // 는 새로 만들지 않는다. 본문 cleanup 만 이뤄지므로 다음 실행부터 정합.

  // 1) 대상 case 의 기존 underline highlight (이 user_id 의) 를 모두 가져와 key set 구성.
  const targetCaseIds = updateRows.map((r) => r.case_id);
  const existingKey = new Set();
  for (let i = 0; i < targetCaseIds.length; i += 500) {
    const slice = targetCaseIds.slice(i, i + 500);
    const { data: exist, error: exErr } = await supabase
      .from("user_highlights")
      .select("target_id, field_path, start_offset, end_offset, content_hash")
      .eq("user_id", STAFF_USER_ID)
      .eq("target_type", "case")
      .eq("color", "underline")
      .in("target_id", slice);
    if (exErr) {
      console.error(`  기존 highlight 조회 실패:`, exErr.message);
      process.exit(1);
    }
    for (const r of exist ?? []) {
      existingKey.add(
        `${r.target_id}|${r.field_path}|${r.start_offset}|${r.end_offset}|${r.content_hash}`,
      );
    }
  }
  const toInsert = insertRows.filter(
    (r) =>
      !existingKey.has(
        `${r.target_id}|${r.field_path}|${r.start_offset}|${r.end_offset}|${r.content_hash}`,
      ),
  );
  const skipped = insertRows.length - toInsert.length;
  console.log(
    `\nhighlights insert ... (dedup skip ${skipped}, will insert ${toInsert.length})`,
  );

  // 2) highlights insert (200 개씩).
  let okIns = 0;
  let failIns = 0;
  for (let i = 0; i < toInsert.length; i += 200) {
    const slice = toInsert.slice(i, i + 200);
    const { error: insErr } = await supabase
      .from("user_highlights")
      .insert(slice);
    if (insErr) {
      console.error(`  insert batch ${i}~${i + slice.length} 실패:`, insErr.message);
      failIns += slice.length;
    } else {
      okIns += slice.length;
    }
  }
  console.log(`  ok=${okIns}, fail=${failIns}`);

  // 3) cases 본문 update — <u> 마커 제거.
  console.log(`\ncases 본문 cleanup ...`);
  let okUpd = 0;
  let failUpd = 0;
  for (const r of updateRows) {
    const { case_id, case_number: _cn, ...patch } = r;
    const { error: updErr } = await supabase
      .from("cases")
      .update(patch)
      .eq("case_id", case_id);
    if (updErr) {
      console.error(`  ${case_id} (${_cn}) 실패:`, updErr.message);
      failUpd += 1;
    } else {
      okUpd += 1;
    }
  }
  console.log(`  ok=${okUpd}, fail=${failUpd}`);

  console.log(`\n=== 완료 ===`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
