// §2 트리거 — official_text_md 채워졌고 official_text_pdf_path 비어 있는 cases 일괄 PDF 생성.
// 또는 --force 로 기존 PDF 덮어쓰기 재생성.
//
// 사용:
//   npx tsx scripts/precedents/build-case-pdfs.ts                # 비어 있는 것만
//   npx tsx scripts/precedents/build-case-pdfs.ts --force        # 전체 재생성
//   npx tsx scripts/precedents/build-case-pdfs.ts --case 2012후726
//
// 멱등: 같은 case_number 경로 덮어쓰기. 파일 누적 0.
// 미커버 정책: 1자라도 미커버 → 그 case 는 skip + 보고. □ 잠입 방지.

import "dotenv/config";

import { createClient } from "@supabase/supabase-js";

import { renderOfficialTextPdf } from "../../app/features/cases/lib/render-official-text-pdf.server";
import { normalizeCaseNumber } from "../../app/features/cases/lib/case-number";

const SUPA = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const idx = args.indexOf("--case");
const ONE = idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null;

interface CaseRow {
  case_id: string;
  case_number: string;
  case_title: string | null;
  court: string | null;
  decided_at: string | null;
  official_text_md: string | null;
  official_text_pdf_path: string | null;
}

async function loadCandidates(): Promise<CaseRow[]> {
  let q = SUPA
    .from("cases")
    .select("case_id, case_number, case_title, court, decided_at, official_text_md, official_text_pdf_path")
    .not("official_text_md", "is", null)
    .is("deleted_at", null);
  if (ONE) q = q.eq("case_number", ONE);
  else if (!FORCE) q = q.is("official_text_pdf_path", null);
  const { data, error } = await q.order("decided_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as CaseRow[];
}

const cases = await loadCandidates();
process.stdout.write(`\n=== build-case-pdfs (${cases.length}건) ===\n`);
process.stdout.write(`  mode: ${ONE ? `single ${ONE}` : FORCE ? "force-rebuild" : "missing-only"}\n\n`);

let ok = 0, skip = 0, err = 0;
const skipList: Array<{ caseNumber: string; chars: string[]; total: number }> = [];

for (const c of cases) {
  if (!c.official_text_md) continue;
  const token = normalizeCaseNumber(c.case_number) ?? c.case_number;
  try {
    const r = await renderOfficialTextPdf({
      caseNumber: token,
      caseTitle: c.case_title,
      court: c.court,
      decidedAt: c.decided_at,
      fullText: c.official_text_md,
    });
    if (r.unrenderable.length > 0) {
      skip++;
      const uniq = [...new Set(r.unrenderable.map((u) => u.char))];
      skipList.push({ caseNumber: c.case_number, chars: uniq.slice(0, 10), total: r.unrenderable.length });
      process.stdout.write(`  ⚠ ${c.case_number}  skip (미커버 ${r.unrenderable.length}자: ${uniq.slice(0, 5).join(" ")})\n`);
      continue;
    }
    // Supabase Storage 키는 ASCII 만 허용 — 한글 사건번호 회피해 case_id 기반.
    // 외부 노출은 signed URL 만이라 사람 가독성 손실 없음.
    const path = `${c.case_id}.pdf`;
    const { error: upErr } = await SUPA.storage
      .from("case-fulltext")
      .upload(path, r.pdfBytes, { contentType: "application/pdf", upsert: true });
    if (upErr) { err++; process.stdout.write(`  ✗ ${c.case_number}  upload: ${upErr.message}\n`); continue; }

    const { error: dbErr } = await SUPA
      .from("cases")
      .update({ official_text_pdf_path: path, updated_at: new Date().toISOString() })
      .eq("case_id", c.case_id);
    if (dbErr) { err++; process.stdout.write(`  ✗ ${c.case_number}  db: ${dbErr.message}\n`); continue; }

    ok++;
    process.stdout.write(`  ✓ ${c.case_number}  ${r.pageCount}p ${r.pdfBytes.length}B  → case-fulltext/${path}\n`);
  } catch (e) {
    err++;
    process.stdout.write(`  ✗ ${c.case_number}  ${e instanceof Error ? e.message : String(e)}\n`);
  }
}

process.stdout.write(`\n=== 결과 ===\n`);
process.stdout.write(`  ok=${ok}  skip(미커버)=${skip}  err=${err}\n`);
if (skipList.length > 0) {
  process.stdout.write(`\n⚠ 미커버 skip 목록 — 향후 Noto Serif CJK KR 등 대체 폰트 검토:\n`);
  for (const s of skipList) {
    process.stdout.write(`  ${s.caseNumber}  미커버 ${s.total}자 — ${s.chars.join(" ")}\n`);
  }
}
