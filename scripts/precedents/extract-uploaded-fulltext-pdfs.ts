// 판례 편집 화면으로 올린 전문 PDF(`cases.full_text_pdf`)에서 텍스트를 뽑아
// `cases.official_text_md` 에 채운다.
//
// ★왜 필요한가 — 전문 PDF 적재 경로가 둘인데 한쪽만 텍스트를 뽑았다.
//   ① /admin/cases/pdf-missing 업로드(case-official-pdf API): 추출 → official_text_md + RAG 재색인
//   ② 판례 편집 화면 「전문 PDF 업로드」(case.tsx upload_full_text_pdf): URL 만 저장
//   ②로 올린 판례는 화면에선 전문이 열리지만 도식 생성기·RAG·검색이 읽는 official_text_md 가
//   비어 있어 "원문 없음"으로 취급된다(특허 9건, 2026-08-31 확인).
//   ②의 업로드 경로 자체도 추출하도록 고쳤으므로 이 스크립트는 **기존 적재분 백필용**이다.
//
//   npx tsx scripts/precedents/extract-uploaded-fulltext-pdfs.ts            # dry-run
//   npx tsx scripts/precedents/extract-uploaded-fulltext-pdfs.ts --apply
//   ... --case 2024후11590,2023후10965                                      # 대상 한정
//
// 이미 official_text_md 가 있는 판례는 건드리지 않는다(--force 없음 — 원문 덮어쓰기는
// 이 스크립트의 일이 아니다).
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

import { scrambleRatio } from "../../app/features/cases/lib/lower-court-text";
// ★게이트(짧음·조각남·껍데기)는 화면 업로드와 **같은 함수**를 쓴다 — 사본을 두면 한쪽이
//   뺀 PDF 를 다른 쪽이 통과시킨다.
import { extractOfficialTextFromPdf } from "../../app/features/cases/lib/official-text-from-pdf.server";

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const argOf = (n: string) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : null;
};
const CASE_LIST = (argOf("--case") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const BACKUP_DIR = path.resolve(process.cwd(), "tmp", "fulltext-backfill");

const sb = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

interface Row {
  case_id: string;
  case_number: string;
  decided_at: string | null;
  full_text_pdf: string | null;
  official_text_md: string | null;
}

async function main() {
  let q = sb
    .from("cases")
    .select("case_id, case_number, decided_at, full_text_pdf, official_text_md")
    .is("deleted_at", null)
    .not("full_text_pdf", "is", null)
    .order("decided_at");
  if (CASE_LIST.length > 0) q = q.in("case_number", CASE_LIST);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Row[];
  const targets = rows.filter((r) => !(r.official_text_md ?? "").trim());
  const skipped = rows.length - targets.length;
  console.log(
    `전문 PDF 적재분 ${rows.length}건 · 원문 텍스트 없는 대상 ${targets.length}건 (이미 있음 ${skipped}건 제외)\n`,
  );
  if (targets.length === 0) return;

  const ok: Array<{ row: Row; text: string; pages: number }> = [];
  const bad: Array<{ row: Row; why: string }> = [];

  for (const row of targets) {
    let bytes: Uint8Array;
    try {
      const res = await fetch(row.full_text_pdf!);
      if (!res.ok) {
        bad.push({ row, why: `내려받기 HTTP ${res.status}` });
        continue;
      }
      bytes = new Uint8Array(await res.arrayBuffer());
    } catch (e) {
      bad.push({ row, why: `내려받기 실패: ${String(e)}` });
      continue;
    }
    const r = await extractOfficialTextFromPdf(bytes);
    if (!r.text) {
      bad.push({ row, why: r.warning ?? "추출 실패" });
      continue;
    }
    ok.push({ row, text: r.text, pages: r.pageCount });
  }

  console.log("[적재 대상]");
  for (const t of ok) {
    console.log(
      `  ${t.row.case_number.padEnd(13)} ${t.row.decided_at}  ${String(t.pages).padStart(2)}쪽  ${String(t.text.length).padStart(6)}자  조각 ${scrambleRatio(t.text).toFixed(2)}`,
    );
    console.log(`      ${t.text.slice(0, 90).replace(/\n/g, " / ")}`);
  }
  if (bad.length > 0) {
    console.log("\n[제외]");
    for (const b of bad)
      console.log(`  ${b.row.case_number.padEnd(13)} ${b.why}`);
  }

  if (!APPLY) {
    console.log(`\n[dry-run] 적재 ${ok.length}건 · 제외 ${bad.length}건. --apply 를 붙이면 실행합니다.`);
    return;
  }
  if (ok.length === 0) return;

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const backup = path.join(BACKUP_DIR, `backup-${ok.length}.json`);
  fs.writeFileSync(
    backup,
    JSON.stringify(
      ok.map((t) => ({
        case_id: t.row.case_id,
        case_number: t.row.case_number,
        official_text_md: t.row.official_text_md,
      })),
      null,
      2,
    ),
  );
  console.log(`\n백업: ${backup}`);

  const now = new Date().toISOString();
  let done = 0;
  for (const t of ok) {
    // ★적재 직전 재확인 — dry-run 과 apply 사이에 누군가 원문을 넣었으면 덮지 않는다.
    const { data: cur } = await sb
      .from("cases")
      .select("official_text_md")
      .eq("case_id", t.row.case_id)
      .single();
    if ((cur?.official_text_md ?? "").trim()) {
      console.log(`  - ${t.row.case_number}: 그 사이 원문이 채워짐 — 건너뜀`);
      continue;
    }
    const { error: upd } = await sb
      .from("cases")
      .update({ official_text_md: t.text, updated_at: now })
      .eq("case_id", t.row.case_id);
    if (upd) {
      console.log(`  ✗ ${t.row.case_number}: ${upd.message}`);
      continue;
    }
    done += 1;
    console.log(`  ✓ ${t.row.case_number} ${t.text.length}자`);
  }
  console.log(`\n적재 ${done}/${ok.length}건 완료.`);
  console.log(
    "★RAG 색인은 별도입니다 — 임베딩 cron 이 dirty 로 재처리하거나 reindexCases 를 돌리세요.",
  );
}

await main();
