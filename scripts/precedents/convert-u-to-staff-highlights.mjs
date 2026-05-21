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

// ─── reflowNumberingSafe (app/features/cases/lib/reflow-numbering.ts 와 동일 로직) ───
const NUMBERING_RX =
  /(?<=[가-힣)\]]\.?)\s+(?=(?:\d\.|[가나다라마바사아자차카타파하]\.|\d\)|[가나다라마바사아자차카타파하]\)|\(\d\)|\([가나다라마바사아자차카타파하]\))\s)/g;
const SUBTITLE_WORDS = "판단|결론|사실관계|검토";
const SUBTITLE_RX = new RegExp(
  `(?<=(?:\\d\\.|[가나다라마바사아자차카타파하]\\.|\\d\\)|[가나다라마바사아자차카타파하]\\)|\\(\\d\\)|\\([가나다라마바사아자차카타파하]\\))\\s(?:${SUBTITLE_WORDS}))\\s+(?=\\S)`,
  "g",
);
function reflowNumberingSafe(text) {
  return text.replace(NUMBERING_RX, "\n\n").replace(SUBTITLE_RX, "\n\n");
}

function sha256Hex(s) {
  return createHash("sha256").update(s, "utf-8").digest("hex");
}

function stripU(s) {
  return s.replace(/<\/?u>/g, "");
}

// ─── textContent flow 모방 ─────────────────────────────────────────────────
// case-body.tsx 의 SummaryBlock + Prose 의 React 렌더가 만드는 textContent 시퀀스를
// 그대로 재현해서 각 <u>...</u> 마커의 누적 offset 을 계산.

// case.summary container: 여러 SummaryBlock 의 textContent 가 순서대로 누적.
// 각 SummaryBlock = (label?) + (shownTitle?) + body paragraphs (reflow 후 split)
function buildSummaryOffsets(summaryItems, caseTitle) {
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

  const showLabel = summaryItems.length > 1;
  for (let i = 0; i < summaryItems.length; i += 1) {
    const it = summaryItems[i];
    let label = null;
    let displayTitle = it.title ?? "";
    const tm = displayTitle.match(/^\[(\d+)\]\s*(.*)$/);
    if (tm) {
      label = `[${tm[1]}]`;
      displayTitle = tm[2];
    }
    if (showLabel && !label) label = `[${i + 1}]`;

    const titleStripped = stripU(displayTitle).trim();
    const dupHeader =
      titleStripped !== "" && titleStripped === (caseTitle ?? "").trim();
    const shownTitle = dupHeader ? "" : displayTitle;

    if (label || shownTitle) {
      if (label) consume(label);
      if (shownTitle) consume(shownTitle);
    }
    if (it.body) {
      const paras = reflowNumberingSafe(it.body)
        .split(/\n{2,}/)
        .filter((s) => s.trim() !== "");
      for (const p of paras) consume(p);
    }
  }
  return { textContent: acc, marks };
}

// case.reasoning / case.comment container: Prose 1개. body paragraphs.
function buildProseOffsets(text) {
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
  const paras = reflowNumberingSafe(text)
    .split(/\n{2,}/)
    .filter((s) => s.trim() !== "");
  for (const p of paras) consume(p);
  return { textContent: acc, marks };
}

// ─── 본문 cleanup — DB 에서 <u> 마커 제거 ─────────────────────────────────
function cleanSummaryItems(items) {
  return (items ?? []).map((it) => ({
    ...it,
    title: it.title ? stripU(it.title) : it.title,
    body: it.body ? stripU(it.body) : it.body,
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
      const { textContent, marks } = buildSummaryOffsets(
        c.summary_items,
        c.case_title,
      );
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

  // 1) 기존 underline staff highlight 가 중복 생성되지 않도록 사전 정리.
  console.log(`\n기존 staff underline highlight 제거 (멱등성)...`);
  const caseIds = updateRows.map((r) => r.case_id);
  // 배치 in() — 500 개씩.
  for (let i = 0; i < caseIds.length; i += 500) {
    const slice = caseIds.slice(i, i + 500);
    const { error: delErr } = await supabase
      .from("user_highlights")
      .delete()
      .eq("user_id", STAFF_USER_ID)
      .eq("target_type", "case")
      .eq("color", "underline")
      .in("target_id", slice);
    if (delErr) {
      console.error(`  delete batch ${i} 실패:`, delErr.message);
    }
  }

  // 2) highlights insert (200 개씩).
  console.log(`\nhighlights insert ...`);
  let okIns = 0;
  let failIns = 0;
  for (let i = 0; i < insertRows.length; i += 200) {
    const slice = insertRows.slice(i, i + 200);
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
