// §1 검증 — renderOfficialTextPdf 단독 동작 + 한자 미커버 감지.
//
// 1) 2012후726 (한자 0) → PDF 생성, 파일 저장, unrenderable=0 확인
// 2) 인위적 한자 포함 텍스트 → unrenderable 1건 이상 + pdfBytes=0 (skip)
//
// 사용: npx tsx scripts/precedents/verify-pdf-render.ts

import "dotenv/config";

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

import { renderOfficialTextPdf } from "../../app/features/cases/lib/render-official-text-pdf.server";

const SUPA = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

mkdirSync(resolve(process.cwd(), "tmp/pdf-test"), { recursive: true });

// ── (1) 정상 케이스 — 2012후726 ───────────────────────────────────────────
process.stdout.write(`\n=== ① 2012후726 (한자 0 예상) ===\n`);
const { data: row } = await SUPA
  .from("cases")
  .select("case_number, case_title, court, decided_at, official_text_md")
  .eq("case_number", "2012후726")
  .is("deleted_at", null)
  .maybeSingle();
if (!row?.official_text_md) {
  process.stderr.write(`row 없음 또는 official_text_md null\n`);
  process.exit(1);
}

const t0 = Date.now();
const res = await renderOfficialTextPdf({
  caseNumber: row.case_number,
  caseTitle: row.case_title,
  court: row.court,
  decidedAt: row.decided_at,
  fullText: row.official_text_md,
});
const ms = Date.now() - t0;
process.stdout.write(
  `  pages=${res.pageCount}  bytes=${res.pdfBytes.length}  unrenderable=${res.unrenderable.length}  t=${ms}ms\n`,
);
const path1 = resolve(process.cwd(), "tmp/pdf-test/2012후726.pdf");
writeFileSync(path1, res.pdfBytes);
process.stdout.write(`  saved: ${path1}\n`);
if (res.unrenderable.length > 0) {
  process.stdout.write(`  ⚠ unrenderable detected:\n`);
  for (const u of res.unrenderable.slice(0, 5))
    process.stdout.write(`    "${u.char}" U+${u.codePoint.toString(16).padStart(4, "0")} @${u.offset}\n`);
}

// ── (2) 한자 인위 삽입 — 미커버 감지 ─────────────────────────────────────
process.stdout.write(`\n=== ② 한자 포함 시뮬레이션 — unrenderable 감지 ===\n`);
const probeText = [
  "이 사건은 1985후31 옛 판례 인용 시 한자 표기 가능.",
  "원고는 韓國語 와 漢字混用 으로 主張하고, 鬱憂 한 心情을 토로하였다.",
  "이러한 一二三 같은 漢字가 미커버 감지되어야 한다.",
].join("\n");
const res2 = await renderOfficialTextPdf({
  caseNumber: "TEST-HANJA",
  caseTitle: "한자 미커버 감지 시뮬레이션",
  court: "supreme",
  decidedAt: "1985-03-26",
  fullText: probeText,
});
process.stdout.write(
  `  pages=${res2.pageCount}  bytes=${res2.pdfBytes.length}  unrenderable=${res2.unrenderable.length}\n`,
);
if (res2.unrenderable.length === 0) {
  process.stdout.write(`  ✗ 미커버 감지 실패 (한자도 렌더된 듯 — 폰트 사양 재확인)\n`);
} else {
  const uniq = new Map<string, { codePoint: number; count: number }>();
  for (const u of res2.unrenderable) {
    const e = uniq.get(u.char) ?? { codePoint: u.codePoint, count: 0 };
    e.count++;
    uniq.set(u.char, e);
  }
  process.stdout.write(`  ✓ 미커버 ${res2.unrenderable.length}자, 고유 ${uniq.size}자:\n`);
  for (const [ch, info] of [...uniq.entries()].slice(0, 15))
    process.stdout.write(
      `    "${ch}" U+${info.codePoint.toString(16).padStart(4, "0")} ×${info.count}\n`,
    );
  if (res2.pdfBytes.length === 0)
    process.stdout.write(`  ✓ pdfBytes=0 (PDF skip — □ 잠입 방지 동작)\n`);
}
