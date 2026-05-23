// 기존 cases.comment_body_md 의 "N. ..." paragraph 들을 summary_items[i].commentMd
// 로 분배 — 사용자 결정: 비고는 요지 소제목/내용별로 매칭되는 코멘트.
//
// 안전 정책:
//   • 분리된 단락 개수가 summary_items 길이와 정확히 일치할 때만 적용.
//     일치하지 않으면 legacy comment_body_md 그대로 유지(개입 X).
//   • 적용된 case 는 comment_body_md = NULL 로 비움 → render 가 항목별 코멘트를
//     "N. ..." 형태로 재조립해 textContent flow 가 동일하게 유지됨
//     (case.comment 99 건 staff highlight 보호).
//   • dry-run 기본 — --apply 로만 실제 update.
//
// 사용:
//   node scripts/precedents/migrate-comment-to-per-item.mjs              # dry-run
//   node scripts/precedents/migrate-comment-to-per-item.mjs --apply

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

// comment_body_md 를 "N. ..." 단락 단위로 split.
// 규칙:
//   • paragraph 는 `\n\n` 로 split.
//   • 단락 시작이 `^\s*\d+\.\s+` 면 그 숫자가 새 항목의 시작.
//   • 시작 인덱스가 1, 2, 3, … 순서일 때만 valid (1 부터 N 까지 빠짐 없이).
//   • 새 항목이 시작되기 전의 paragraph 가 있으면(예: 도입부) 그건 valid 아님 →
//     "prelude exists" 로 skip 표시.
//   • 각 항목의 본문 = 그 항목의 첫 단락(`N. ` prefix 제거) + 다음 항목까지의
//     paragraph 들을 `\n\n` 로 join.
function splitIntoNumberedItems(text) {
  if (!text) return { ok: false, reason: "empty" };
  const paragraphs = text.split(/\n{2,}/).map((p) => p);
  const items = []; // { num: number, body: string }
  let prelude = false;
  for (const p of paragraphs) {
    const m = p.match(/^\s*(\d+)\.\s+([\s\S]*)$/);
    if (m) {
      const num = parseInt(m[1], 10);
      const body = m[2];
      items.push({ num, body, parts: [body] });
    } else {
      if (items.length === 0) {
        // 첫 항목 이전의 단락 — 도입부. 분배 불가.
        prelude = true;
      } else {
        items[items.length - 1].parts.push(p);
      }
    }
  }
  if (prelude) return { ok: false, reason: "prelude" };
  if (items.length === 0) return { ok: false, reason: "no_numbered_items" };
  // 순서 검증 — 1, 2, 3, ... 연속이어야 함.
  for (let i = 0; i < items.length; i++) {
    if (items[i].num !== i + 1) {
      return { ok: false, reason: `out_of_order_at_${i}_${items[i].num}` };
    }
  }
  const bodies = items.map((it) => it.parts.join("\n\n").trim());
  return { ok: true, bodies };
}

// case-body 의 Prose 가 컨테이너 textContent 로 누적하는 흐름과 동일하게 시뮬레이션.
// `<u>...</u>` 마커는 stripUnderline 처리(렌더 시 `<u>` element 가 끼지만 .data 는 그대로).
// paragraph 사이엔 추가 char 없음 (DOM 트리 워커는 text node 만 누적).
function proseTextContent(text) {
  if (!text) return "";
  const paras = text.split(/\n{2,}/).filter((s) => s.trim() !== "");
  let out = "";
  for (const p of paras) {
    out += p.replace(/<\/?u>/g, "");
  }
  return out;
}

function reconstructFromItems(items) {
  return items
    .map((it, i) => {
      const c = (it.commentMd ?? "").trim();
      return c ? `${i + 1}. ${c}` : null;
    })
    .filter((s) => s !== null)
    .join("\n\n");
}

async function main() {
  console.log(`mode: ${APPLY ? "APPLY" : "DRY-RUN"}`);
  // comment_body_md 가 비어있지 않은 모든 case 조회.
  const { data: cases, error } = await supabase
    .from("cases")
    .select("case_id, case_number, summary_items, comment_body_md")
    .not("comment_body_md", "is", null)
    .is("deleted_at", null);
  if (error) {
    console.error("쿼리 실패:", error.message);
    process.exit(1);
  }
  console.log(`comment_body_md 보유 case: ${cases.length}`);

  let migrated = 0;
  let skippedNoItems = 0;
  let skippedMismatch = 0;
  let skippedPrelude = 0;
  let skippedOther = 0;
  const samples = [];
  const updates = [];
  for (const c of cases) {
    const items = Array.isArray(c.summary_items) ? c.summary_items : [];
    if (items.length < 2) {
      skippedNoItems += 1;
      continue;
    }
    const parsed = splitIntoNumberedItems(c.comment_body_md ?? "");
    if (!parsed.ok) {
      if (parsed.reason === "prelude") skippedPrelude += 1;
      else if (parsed.reason === "no_numbered_items") skippedOther += 1;
      else skippedOther += 1;
      continue;
    }
    if (parsed.bodies.length !== items.length) {
      skippedMismatch += 1;
      if (samples.length < 5) {
        samples.push({
          case_number: c.case_number,
          items: items.length,
          parsed: parsed.bodies.length,
        });
      }
      continue;
    }
    // valid — items[i].commentMd 에 분배.
    const newItems = items.map((it, i) => {
      const base = {
        title: typeof it.title === "string" ? it.title : "",
        body: typeof it.body === "string" ? it.body : "",
      };
      const c = parsed.bodies[i];
      return c ? { ...base, commentMd: c } : base;
    });

    // textContent 가 보존되는지 검증 — case.comment 의 staff highlight 99 건을
    // 깨뜨리지 않도록. 재조립 결과의 textContent 가 원본과 정확 일치할 때만 적용.
    const reconstructed = reconstructFromItems(newItems);
    const oldTC = proseTextContent(c.comment_body_md ?? "");
    const newTC = proseTextContent(reconstructed);
    if (oldTC !== newTC) {
      skippedOther += 1;
      continue;
    }

    updates.push({
      case_id: c.case_id,
      case_number: c.case_number,
      newItems,
    });
    migrated += 1;
  }

  console.log(`\n── 결과 ──`);
  console.log(`  migrate 가능: ${migrated}`);
  console.log(`  skip(요지 항목 < 2): ${skippedNoItems}`);
  console.log(`  skip(개수 불일치): ${skippedMismatch}`);
  console.log(`  skip(도입부 단락 존재): ${skippedPrelude}`);
  console.log(`  skip(N. numbering 없음): ${skippedOther}`);
  if (samples.length > 0) {
    console.log(`\n── 개수 불일치 샘플 (앞 5건) ──`);
    samples.forEach((s) =>
      console.log(`  ${s.case_number.padEnd(15)} items=${s.items}  parsed=${s.parsed}`),
    );
  }

  if (!APPLY) {
    console.log(`\n(dry-run — --apply 로 실제 update)`);
    return;
  }
  if (updates.length === 0) {
    console.log("\napply 대상 없음 — 종료.");
    return;
  }
  console.log(`\n── apply ──`);
  let ok = 0;
  let fail = 0;
  for (const u of updates) {
    const { error: e } = await supabase
      .from("cases")
      .update({ summary_items: u.newItems, comment_body_md: null })
      .eq("case_id", u.case_id);
    if (e) {
      console.error(`  ${u.case_number} 실패: ${e.message}`);
      fail += 1;
    } else {
      ok += 1;
    }
  }
  console.log(`  ok=${ok}, fail=${fail}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
