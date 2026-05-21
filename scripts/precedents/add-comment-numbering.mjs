// cases.comment_body_md 의 paragraph(\n\n split) 별 "N. " prefix 추가.
// 원본 hwpx 의 ▪ 단락 마커가 parse-hwp-text.mjs 에서 stripped 됐으나, 사용자가 다시
// numbering 형태로 복원 요청 — feat-3-211 후속.
//
// 본문 변경되니 case.comment fieldPath staff underline highlight 의 offset 도 재계산.
//
// 사용:
//   node scripts/precedents/add-comment-numbering.mjs                 # dry-run
//   node scripts/precedents/add-comment-numbering.mjs --apply         # 실행
//   node scripts/precedents/add-comment-numbering.mjs --case 2017후523  # 1건만

import { createHash } from "node:crypto";
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

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

// ─── reflowNumberingSafe (case-body.tsx Prose 가 사용하는 것과 동일) ─────
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

// Prose 의 textContent flow — paragraphs(reflow + split) 의 join("")
function caseCommentTextContent(commentMd) {
  return reflowNumberingSafe(commentMd ?? "")
    .split(/\n{2,}/)
    .filter((s) => s.trim() !== "")
    .join("");
}

// "N. " prefix 가 이미 paragraph 시작에 있는지 검사 — 재실행 안전.
function alreadyNumbered(p) {
  return /^\d+\.\s/.test(p);
}

function addNumbering(commentMd) {
  if (!commentMd) return commentMd;
  const paras = commentMd.split(/\n{2,}/);
  // 빈 paragraph 보존: index 만 카운트 — 빈 paragraph 는 skip 하지 않고 그대로 둠.
  const nonEmptyIdxs = [];
  paras.forEach((p, i) => {
    if (p.trim() !== "") nonEmptyIdxs.push(i);
  });
  let n = 0;
  return paras
    .map((p, i) => {
      if (p.trim() === "") return p;
      n += 1;
      if (alreadyNumbered(p.trimStart())) return p;
      // paragraph 시작 공백 보존하면서 prefix 추가 (보통 trim 됐을 것)
      return `${n}. ${p}`;
    })
    .join("\n\n");
}

async function main() {
  console.log(`mode  : ${APPLY ? "APPLY" : "DRY-RUN"}`);

  let q = supabase
    .from("cases")
    .select("case_id, case_number, comment_body_md")
    .contains("subject_laws", ["patent"])
    .not("comment_body_md", "is", null);
  if (ONLY_CASE) q = q.eq("case_number", ONLY_CASE);
  const { data: cases, error } = await q;
  if (error) {
    console.error("cases 조회 실패:", error.message);
    process.exit(1);
  }
  console.log(`cases (with comment): ${cases.length}`);

  // 1) numbering 적용 + 변경된 case 만 update.
  const updates = [];
  let skipAlready = 0;
  for (const c of cases) {
    const newComment = addNumbering(c.comment_body_md);
    if (newComment === c.comment_body_md) {
      skipAlready += 1;
      continue;
    }
    updates.push({
      case_id: c.case_id,
      case_number: c.case_number,
      oldComment: c.comment_body_md,
      newComment,
    });
  }
  console.log(`updates queued: ${updates.length}, skip-already-numbered: ${skipAlready}`);

  // 2) 영향받는 case 의 case.comment staff underline highlight 가져오기.
  const targetCaseIds = updates.map((u) => u.case_id);
  let hlByCase = new Map();
  if (targetCaseIds.length > 0) {
    for (let i = 0; i < targetCaseIds.length; i += 500) {
      const slice = targetCaseIds.slice(i, i + 500);
      const { data: hls } = await supabase
        .from("user_highlights")
        .select("highlight_id, target_id, start_offset, end_offset, label, content_hash")
        .eq("user_id", STAFF_USER_ID)
        .eq("target_type", "case")
        .eq("color", "underline")
        .eq("field_path", "case.comment")
        .is("deleted_at", null)
        .in("target_id", slice);
      for (const h of hls ?? []) {
        const arr = hlByCase.get(h.target_id) ?? [];
        arr.push(h);
        hlByCase.set(h.target_id, arr);
      }
    }
  }
  const totalHls = Array.from(hlByCase.values()).reduce(
    (a, arr) => a + arr.length,
    0,
  );
  console.log(`case.comment staff highlights to recompute: ${totalHls} in ${hlByCase.size} cases`);

  // 3) 각 case 의 hl offset 재계산 — 새 textContent 에서 label 순차 매칭.
  const hlUpdates = [];
  let hlMatched = 0;
  let hlUnmatched = 0;
  let sampleShown = false;
  for (const u of updates) {
    const hls = (hlByCase.get(u.case_id) ?? []).slice().sort(
      (a, b) => a.start_offset - b.start_offset,
    );
    if (hls.length === 0) continue;
    const newText = caseCommentTextContent(u.newComment);
    let cursor = 0;
    for (const h of hls) {
      const label = h.label ?? "";
      const idx = newText.indexOf(label, cursor);
      if (idx < 0) {
        hlUnmatched += 1;
        continue;
      }
      hlMatched += 1;
      hlUpdates.push({
        highlight_id: h.highlight_id,
        start_offset: idx,
        end_offset: idx + label.length,
        content_hash: sha256Hex(label),
      });
      cursor = idx + label.length;
      if (!sampleShown) {
        sampleShown = true;
        console.log(
          `\n--- sample (${u.case_number}) — hl offset ${h.start_offset}→${idx}, label "${label.slice(0, 60)}${label.length > 60 ? "…" : ""}" ---`,
        );
      }
    }
  }
  console.log(
    `\nhighlight offset recompute: matched=${hlMatched}, unmatched=${hlUnmatched}`,
  );

  if (!APPLY) {
    console.log(`\n(dry-run — 실제 변경 안 함. --apply 로 실행)`);
    // sample 첫 변환 paragraph
    if (updates[0]) {
      console.log(`\n--- sample new comment (${updates[0].case_number}) ---`);
      console.log(updates[0].newComment.slice(0, 400));
    }
    return;
  }

  // 4) cases.comment_body_md update.
  console.log(`\ncases comment update ...`);
  let okC = 0;
  let failC = 0;
  for (const u of updates) {
    const { error: e } = await supabase
      .from("cases")
      .update({ comment_body_md: u.newComment })
      .eq("case_id", u.case_id);
    if (e) {
      console.error(`  ${u.case_number} 실패: ${e.message}`);
      failC += 1;
    } else okC += 1;
  }
  console.log(`  ok=${okC}, fail=${failC}`);

  // 5) staff highlight offset update.
  console.log(`\nstaff highlight offset update ...`);
  let okH = 0;
  let failH = 0;
  for (const h of hlUpdates) {
    const { highlight_id, ...patch } = h;
    const { error: e } = await supabase
      .from("user_highlights")
      .update(patch)
      .eq("highlight_id", highlight_id);
    if (e) {
      console.error(`  ${highlight_id} 실패: ${e.message}`);
      failH += 1;
    } else okH += 1;
  }
  console.log(`  ok=${okH}, fail=${failH}`);

  console.log(`\n=== 완료 ===`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
