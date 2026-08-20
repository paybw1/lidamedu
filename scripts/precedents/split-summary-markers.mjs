// 판결요지 "가. 나. 다." 항목 분리 (원장 지적 2026-08-21).
//
// 적재 시 판시사항/판결요지를 `[1] [2]` 마커로만 나눴다. 옛 대법원 판례는 `가. 나. 다.`
// 를 쓰는데 그건 못 갈라 제목·내용이 한 덩어리로 뭉쳐 있었다.
// 제목(판시사항)과 내용(판결요지)의 항목 수가 같을 때만 짝지어 나눈다 —
// 개수가 어긋나면 잘못 붙는 게 뭉쳐 있는 것보다 나쁘다.
//
//   node scripts/precedents/split-summary-markers.mjs            # dry-run
//   node scripts/precedents/split-summary-markers.mjs --apply
//   node scripts/precedents/split-summary-markers.mjs --law civil
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const LAW = argv.includes("--law") ? argv[argv.indexOf("--law") + 1] : null;
const BACKUP = path.resolve(process.cwd(), "tmp/summary-split-backup.json");

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const ORDER = "가나다라마바사아자차카타파하".split("");

/**
 * "가. … 나. … 다. …" → 항목 배열.
 * ★마커는 순서대로 등장할 때만 인정한다 — 본문 중간의 "가."(예: "이하 '가.'항")를
 *   마커로 오인하면 문장이 잘린다.
 */
export function splitKoreanMarkers(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return [];
  const cuts = [];
  let from = 0;
  for (const ch of ORDER) {
    const re = new RegExp(`(^|[\\s\\n])${ch}\\.\\s*`, "g");
    re.lastIndex = from;
    const m = re.exec(text);
    if (!m) break;
    cuts.push({ markStart: m.index + m[1].length, bodyStart: m.index + m[0].length });
    from = m.index + m[0].length;
  }
  if (cuts.length < 2) return [];
  const out = [];
  for (let i = 0; i < cuts.length; i++) {
    const end = i + 1 < cuts.length ? cuts[i + 1].markStart : text.length;
    const seg = text.slice(cuts[i].bodyStart, end).trim();
    if (seg) out.push(seg);
  }
  return out.length === cuts.length ? out : [];
}

async function pageAll(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

async function main() {
  let q = () => {
    let b = sb
      .from("cases")
      .select("case_id, case_number, subject_laws, summary_items")
      .is("deleted_at", null)
      .order("case_id");
    if (LAW) b = b.contains("subject_laws", [LAW]);
    return b;
  };
  const cases = await pageAll(q);

  const targets = [];
  let mismatched = 0;
  for (const c of cases) {
    const items = Array.isArray(c.summary_items) ? c.summary_items : [];
    if (items.length !== 1) continue; // 이미 나뉜 것은 건드리지 않는다
    const t = splitKoreanMarkers(items[0]?.title);
    const b = splitKoreanMarkers(items[0]?.body);
    if (t.length < 2 && b.length < 2) continue;
    if (t.length !== b.length) {
      mismatched += 1;
      continue;
    }
    targets.push({
      caseId: c.case_id,
      caseNumber: c.case_number,
      laws: c.subject_laws,
      before: items,
      after: t.map((title, i) => ({ title, body: b[i] })),
    });
  }

  console.log(
    `대상 판례 ${cases.length}건 · 분리 가능 ${targets.length}건 · 제목/내용 항목수 불일치(보류) ${mismatched}건`,
  );
  for (const t of targets.slice(0, 5)) {
    console.log(`\n  ${t.caseNumber} → ${t.after.length}항목`);
    for (const it of t.after.slice(0, 2)) {
      console.log(`    · ${it.title.slice(0, 50)}`);
      console.log(`      ${it.body.slice(0, 60)}…`);
    }
  }
  if (!APPLY) {
    console.log("\n--apply 를 붙이면 반영합니다.");
    return;
  }

  fs.writeFileSync(
    BACKUP,
    JSON.stringify(targets.map((t) => ({ caseId: t.caseId, caseNumber: t.caseNumber, before: t.before })), null, 2),
    "utf8",
  );
  // 적재·정정은 추록 발행 대상이 아니다 — 개정 원장 억제.
  const { data: win, error: winErr } = await sb.rpc("fn_open_suppress_window", {
    p_minutes: 30,
    p_reason: "판결요지 가나다 항목 분리",
    p_scope: ["precedent"],
  });
  if (winErr) throw new Error(winErr.message);
  let done = 0;
  try {
    for (const t of targets) {
      const { error } = await sb
        .from("cases")
        .update({ summary_items: t.after })
        .eq("case_id", t.caseId);
      if (error) throw new Error(`${t.caseNumber}: ${error.message}`);
      done += 1;
      if (done % 100 === 0) console.log(`  ${done}/${targets.length}`);
    }
  } finally {
    await sb.rpc("fn_close_suppress_window", { p_window_id: win });
  }
  console.log(`\n분리 완료 ${done}건 · 백업 ${BACKUP}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
