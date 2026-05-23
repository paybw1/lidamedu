// "[N] ..." 형식 비고 → summary_items[N-1].commentMd 분배.
//
// 직전 "1. ..." numbering 용 migrate-comment-to-per-item.mjs 와 별개. 사용자 결정에
// 따라 운영자가 [N] 대괄호 라벨로 작성한 비고도 항목별로 자동 분리.
//
// 알고리즘:
//   • text 내 모든 `[N]` 마커(`\[\d+\]\s*`)를 위치·번호와 함께 수집.
//   • 각 마커의 본문 = 그 마커 끝 ~ 다음 마커 시작 (또는 끝).
//   • 본문에서 마커 prefix 제거(이미 split 으로 안 들어옴) + trim.
//   • items[N-1].commentMd 에 분배. 비어 있는 commentMd 가 이미 있으면 덮어씀
//     (사용자가 "[N] 데이터 → 비고에 자동" 명시).
//   • 첫 마커 이전 prelude 가 있으면 comment_body_md 에 남기고, 없으면 NULL.
//
// 안전 정책:
//   • dry-run 기본 — --apply 로만 적용.
//   • items.length 보다 큰 N (예: items 2 인데 [3]) 은 skip 처리(warning).
//   • textContent 동일성은 별도로 보장 안 함 (사용자가 인라인 비고 디자인 채택
//     이후이므로, 항목별 비고 추가로 case.summary textContent 가 자연 증가함).
//     적용 후 recompute-summary-highlights.mjs --apply 로 case.summary/comment
//     하이라이트 일괄 재정렬 필요.
//
// 사용:
//   node scripts/precedents/migrate-bracket-comment-to-per-item.mjs              # dry-run
//   node scripts/precedents/migrate-bracket-comment-to-per-item.mjs --apply

import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv();

const APPLY = process.argv.includes("--apply");

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 .env 에 필요합니다.");
  process.exit(1);
}
const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const BRACKET_RE = /\[(\d+)\]\s*/g;

function parseBracketMarkers(text) {
  if (!text) return { ok: false, reason: "empty" };
  const matches = [];
  BRACKET_RE.lastIndex = 0;
  let m;
  while ((m = BRACKET_RE.exec(text)) !== null) {
    matches.push({
      num: parseInt(m[1], 10),
      start: m.index,
      contentStart: m.index + m[0].length,
    });
  }
  if (matches.length === 0) return { ok: false, reason: "no_markers" };
  // 본문 슬라이스
  const items = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].contentStart;
    const end = i + 1 < matches.length ? matches[i + 1].start : text.length;
    items.push({ num: matches[i].num, body: text.slice(start, end).trim() });
  }
  const prelude = text.slice(0, matches[0].start).trim();
  return { ok: true, items, prelude };
}

async function main() {
  console.log(`mode: ${APPLY ? "APPLY" : "DRY-RUN"}`);
  const { data: cases, error } = await supabase
    .from("cases")
    .select("case_id, case_number, summary_items, comment_body_md")
    .not("comment_body_md", "is", null)
    .is("deleted_at", null);
  if (error) {
    console.error("쿼리 실패:", error.message);
    process.exit(1);
  }

  let candidates = 0;
  let migrated = 0;
  let skippedNoMarker = 0;
  let skippedOutOfRange = 0;
  let preludeKept = 0;
  let preludeEmpty = 0;
  const updates = [];
  const samples = [];
  const outOfRangeSamples = [];

  for (const c of cases) {
    const text = c.comment_body_md ?? "";
    if (!/\[\d+\]/.test(text)) {
      skippedNoMarker += 1;
      continue;
    }
    candidates += 1;
    const parsed = parseBracketMarkers(text);
    if (!parsed.ok) {
      skippedNoMarker += 1;
      continue;
    }
    const items = Array.isArray(c.summary_items) ? c.summary_items : [];
    if (items.length === 0) {
      // 요지 항목 자체가 없으면 분배 불가 — prelude 만 남기고 마커 텍스트는 제거?
      // 운영 의도 모호하므로 skip (수동 대처).
      skippedOutOfRange += 1;
      continue;
    }
    // 마커 번호가 items 범위 (1..N) 안에 있는지 검증.
    const outOfRange = parsed.items.filter(
      (it) => it.num < 1 || it.num > items.length,
    );
    if (outOfRange.length > 0) {
      skippedOutOfRange += 1;
      if (outOfRangeSamples.length < 5) {
        outOfRangeSamples.push({
          case_number: c.case_number,
          items: items.length,
          out: outOfRange.map((o) => `[${o.num}]`).join(","),
        });
      }
      continue;
    }
    // items 복사 + 분배
    const newItems = items.map((it) => ({
      title: typeof it.title === "string" ? it.title : "",
      body: typeof it.body === "string" ? it.body : "",
      ...(typeof it.commentMd === "string" && it.commentMd !== ""
        ? { commentMd: it.commentMd }
        : {}),
    }));
    for (const m of parsed.items) {
      if (!m.body) continue;
      newItems[m.num - 1] = {
        ...newItems[m.num - 1],
        commentMd: m.body,
      };
    }
    const newCommentBody = parsed.prelude ? parsed.prelude : null;
    if (newCommentBody) preludeKept += 1;
    else preludeEmpty += 1;
    updates.push({
      case_id: c.case_id,
      case_number: c.case_number,
      newItems,
      newCommentBody,
      markers: parsed.items.map((it) => it.num),
    });
    migrated += 1;
    if (samples.length < 5) {
      samples.push({
        case_number: c.case_number,
        items: items.length,
        markers: parsed.items.map((it) => `[${it.num}]`).join(""),
        prelude_kept: !!newCommentBody,
      });
    }
  }

  console.log(`\n── 결과 ──`);
  console.log(`  comment_body_md 보유 case: ${cases.length}`);
  console.log(`  [N] 마커 미존재 skip: ${skippedNoMarker}`);
  console.log(`  마커 번호 out-of-range skip: ${skippedOutOfRange}`);
  console.log(`  migrate 가능: ${migrated}`);
  console.log(`    └ prelude 잔여 (comment_body_md 유지): ${preludeKept}`);
  console.log(`    └ prelude 비어 (comment_body_md = NULL): ${preludeEmpty}`);

  if (samples.length > 0) {
    console.log(`\n── migrate 샘플 ──`);
    samples.forEach((s) =>
      console.log(
        `  ${s.case_number.padEnd(15)} items=${s.items}  markers=${s.markers}  prelude=${s.prelude_kept ? "y" : "n"}`,
      ),
    );
  }
  if (outOfRangeSamples.length > 0) {
    console.log(`\n── out-of-range 샘플 ──`);
    outOfRangeSamples.forEach((s) =>
      console.log(`  ${s.case_number.padEnd(15)} items=${s.items} 마커=${s.out}`),
    );
  }

  if (!APPLY) {
    console.log(`\n(dry-run — --apply 로 실제 update)`);
    return;
  }
  if (updates.length === 0) {
    console.log(`\napply 대상 없음.`);
    return;
  }
  console.log(`\n── apply ──`);
  let ok = 0;
  let fail = 0;
  for (const u of updates) {
    const { error: e } = await supabase
      .from("cases")
      .update({
        summary_items: u.newItems,
        comment_body_md: u.newCommentBody,
      })
      .eq("case_id", u.case_id);
    if (e) {
      console.error(`  ${u.case_number} 실패: ${e.message}`);
      fail += 1;
    } else ok += 1;
  }
  console.log(`  ok=${ok}, fail=${fail}`);
  console.log(
    `\n=== 완료 — 다음 단계: node scripts/precedents/recompute-summary-highlights.mjs --apply ===`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
