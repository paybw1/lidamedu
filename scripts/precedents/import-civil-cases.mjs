// 민법 기출 인용 판례 적재 — 국가법령정보센터 전문 → cases (원장 지시 2026-08-20).
//
// 입력: extract-civil-cited-cases.mjs 가 만든 JSON(사건번호·판례일련번호·인용 문항수).
// 중요도는 인용 문항수로 정한다 — 2~3문항=1, 4~5문항=2, 6문항 이상=3, 1문항=기본값(1).
//
// ★검증(엉뚱한 판례 적재가 최악의 실패):
//   목록 조회에서 얻은 일련번호를 그대로 믿지 않는다. 전문 응답의 사건번호·법원명·선고일자를
//   다시 대조해 하나라도 어긋나면 넣지 않고 리포트에 남긴다.
// ★개정 원장 억제: cases INSERT 마다 content_revisions 행이 생긴다(log_revision_cases).
//   1,300여 건이 발행 대기 큐를 덮으므로 억제 창(fn_open_suppress_window)을 열고 진행한다.
//   적재는 교재가 바뀐 게 아니라 발행 대상이 아니다.
// ★전문 PDF 는 만들지 않는다 — 1,300건 렌더는 몇 시간짜리고, 필요하면 나중에 백필한다.
//
//   node scripts/precedents/import-civil-cases.mjs                # dry-run
//   node scripts/precedents/import-civil-cases.mjs --apply
//   node scripts/precedents/import-civil-cases.mjs --apply --limit 50
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

import { normalizeCaseNumber } from "../../app/features/cases/lib/case-number.ts";
import { normalizeOfficialText } from "../../app/features/cases/lib/normalize-official-text.ts";
import { dateKey } from "../../app/features/cases/lib/lower-court-fetch.server.ts";

const argv = process.argv.slice(2);
const argOf = (n) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : null;
};
const APPLY = argv.includes("--apply");
const LIMIT = argOf("--limit") ? Number(argOf("--limit")) : Infinity;
const INPUT = path.resolve(
  process.cwd(),
  argOf("--input") ?? "tmp/civil-case-api.json",
);
const STATE = path.resolve(process.cwd(), "tmp/civil-import-state.json");
const REPORT = path.resolve(process.cwd(), "tmp/civil-import-report.json");
const LAW = "civil";
const OC = process.env.LAW_GO_KR_OC ?? "test";
const GAP_MS = 150;
const BATCH = 20;

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stripTags = (s) =>
  String(s ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\r\n?/g, "\n")
    .trim();

/** 인용 문항수 → 중요도. 1문항은 지정하지 않는다(컬럼 기본값 1). */
function importanceOf(n) {
  if (n >= 6) return 3;
  if (n >= 4) return 2;
  if (n >= 2) return 1;
  return null;
}

/**
 * 판시사항·판결요지 → summary_items[{title, body}].
 * 둘 다 "[1] … [2] …" 로 항이 나뉘어 오고 항 수가 같으면 짝지어 담는다.
 * 개수가 다르면 억지로 맞추지 않고 통째로 한 항목에 넣는다(잘못 짝지으면 다른 쟁점의
 * 요지가 엉뚱한 판시사항 밑에 붙는다).
 */
function buildSummaryItems(issueRaw, gistRaw) {
  const issue = stripTags(issueRaw);
  const gist = stripTags(gistRaw);
  if (!issue && !gist) return [];
  const split = (s) =>
    s
      .split(/\s*\[\d+\]\s*/)
      .map((x) => x.trim())
      .filter(Boolean);
  const issues = /\[\d+\]/.test(issue) ? split(issue) : issue ? [issue] : [];
  const gists = /\[\d+\]/.test(gist) ? split(gist) : gist ? [gist] : [];
  if (issues.length && gists.length && issues.length === gists.length) {
    return issues.map((t, i) => ({ title: t, body: gists[i] }));
  }
  return [{ title: issue || "판결요지", body: gist || issue }];
}

async function fetchDetail(serial) {
  const url = `https://www.law.go.kr/DRF/lawService.do?OC=${OC}&target=prec&ID=${serial}&type=JSON`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`lawService ${res.status}`);
  const json = await res.json().catch(() => null);
  return json?.PrecService ?? null;
}

async function main() {
  const rows = JSON.parse(fs.readFileSync(INPUT, "utf8")).filter(
    (r) => r.api === "ok" && r.serial,
  );
  const state = fs.existsSync(STATE)
    ? JSON.parse(fs.readFileSync(STATE, "utf8"))
    : { done: {} };

  // 이미 있는 사건번호는 건드리지 않는다 — 다른 과목 행이 있으면 사람이 판단할 일이다.
  const existing = new Map();
  const nums = rows.map((r) => r.raw);
  for (let i = 0; i < nums.length; i += 100) {
    const { data, error } = await sb
      .from("cases")
      .select("case_number, subject_laws")
      .in("case_number", nums.slice(i, i + 100))
      .is("deleted_at", null);
    if (error) throw new Error(error.message);
    for (const c of data ?? []) existing.set(c.case_number, c.subject_laws);
  }

  const queue = [];
  const skipped = [];
  for (const r of rows) {
    if (state.done[r.raw]) continue;
    if (existing.has(r.raw)) {
      skipped.push({ case: r.raw, why: `이미 존재(${existing.get(r.raw)})` });
      continue;
    }
    queue.push(r);
    if (queue.length >= LIMIT) break;
  }

  const tiers = queue.reduce((acc, r) => {
    const k = String(importanceOf(r.n) ?? "기본(1문항)");
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    `입력 ${rows.length}건 · 적재 대상 ${queue.length}건 · 건너뜀 ${skipped.length}건`,
  );
  console.log(`중요도 분포: ${JSON.stringify(tiers)}`);
  for (const s of skipped.slice(0, 10)) console.log(`  skip ${s.case} — ${s.why}`);
  if (!APPLY) {
    console.log("\n--apply 를 붙이면 적재합니다.");
    return;
  }

  // ★개정 원장 억제 창 — 적재로 생기는 revision 이 발행 대기 큐를 덮지 않게.
  const { data: windowId, error: winErr } = await sb.rpc("fn_open_suppress_window", {
    p_minutes: 120,
    p_reason: "민법 기출 인용 판례 일괄 적재",
    p_scope: ["precedent"],
  });
  if (winErr) throw new Error(`억제 창 실패: ${winErr.message}`);
  console.log(`억제 창 open (${windowId})\n`);

  const inserted = [];
  const rejected = [];
  let pending = [];

  const flush = async () => {
    if (!pending.length) return;
    const { data, error } = await sb
      .from("cases")
      .insert(pending)
      .select("case_id, case_number");
    if (error) throw new Error(`insert 실패: ${error.message}`);
    inserted.push(...(data ?? []));
    for (const c of data ?? []) state.done[c.case_number] = c.case_id;
    fs.writeFileSync(STATE, JSON.stringify(state, null, 2), "utf8");
    console.log(`  … 누적 ${inserted.length}/${queue.length}`);
    pending = [];
  };

  try {
    for (const r of queue) {
      let svc = null;
      try {
        svc = await fetchDetail(r.serial);
      } catch (e) {
        rejected.push({ case: r.raw, why: `조회 실패: ${e.message}` });
        continue;
      }
      await sleep(GAP_MS);
      if (!svc) {
        rejected.push({ case: r.raw, why: "전문 응답 없음" });
        continue;
      }

      // ── 3중 대조. 하나라도 어긋나면 넣지 않는다.
      const gotNo = normalizeCaseNumber(String(svc.사건번호 ?? ""));
      const wantNo = normalizeCaseNumber(r.raw);
      const gotCourt = String(svc.법원명 ?? "").replace(/\s+/g, "");
      const gotDate = dateKey(svc.선고일자);
      const wantDate = dateKey(r.decidedAt);
      if (!gotNo || gotNo !== wantNo) {
        rejected.push({ case: r.raw, why: `사건번호 불일치(${svc.사건번호})` });
        continue;
      }
      if (gotCourt !== "대법원") {
        rejected.push({ case: r.raw, why: `법원 불일치(${gotCourt})` });
        continue;
      }
      if (!gotDate || (wantDate && gotDate !== wantDate)) {
        rejected.push({ case: r.raw, why: `선고일 불일치(${svc.선고일자})` });
        continue;
      }

      const body = normalizeOfficialText(stripTags(svc.판례내용));
      if (!body || body.length < 200) {
        rejected.push({ case: r.raw, why: `전문 ${body.length}자 — 너무 짧음` });
        continue;
      }

      pending.push({
        subject_laws: [LAW],
        court: "supreme",
        decided_at: gotDate,
        case_number: r.raw,
        case_title: String(svc.사건명 ?? r.title ?? "").trim() || r.raw,
        is_en_banc: /전원합의체/.test(String(svc.판결유형 ?? "")),
        // 1문항 인용은 컬럼을 생략해 기본값(1)이 들어가게 둔다 — NULL 로 넣으면
        // 화면은 ?? 1 로 1성으로 보이는데 "중요도 N 이상" 필터에서는 빠져 어긋난다.
        ...(importanceOf(r.n) != null ? { importance: importanceOf(r.n) } : {}),
        summary_items: buildSummaryItems(svc.판시사항, svc.판결요지),
        official_text_md: body,
        law_api_serial_id: String(r.serial),
        official_text_checked_at: new Date().toISOString(),
      });
      if (pending.length >= BATCH) await flush();
    }
    await flush();
  } finally {
    await sb.rpc("fn_close_suppress_window", { p_window_id: windowId });
    console.log("억제 창 close");
  }

  fs.writeFileSync(
    REPORT,
    JSON.stringify(
      { at: new Date().toISOString(), inserted, rejected, skipped },
      null,
      2,
    ),
    "utf8",
  );
  console.log(
    `\n적재 ${inserted.length}건 · 거부 ${rejected.length}건 · 건너뜀 ${skipped.length}건`,
  );
  for (const x of rejected.slice(0, 20)) console.log(`  ✗ ${x.case} — ${x.why}`);
  console.log(`리포트: ${REPORT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
