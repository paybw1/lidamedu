// feat-2-035 — 하급심 판결문 **PDF 생성**(자동 수집분).
//
// 자동 수집(lower_auto)은 국가법령정보센터 API 텍스트라 내려받을 파일이 애초에 없다.
// 판례 전문 PDF 와 **같은 규칙**으로 조판해 case-lower-courts 버킷에 넣고,
// case_lower_courts.files 에 kind='generated' 로 등록한다 → 시트의 「PDF 내려받기」.
//
// ★조판 규칙은 renderOfficialTextPdf 하나뿐이다(pdf-lib + NotoSerifKR TTF, A4, 글자 단위 wrap).
//   사본을 만들지 않는다 — 판례 전문 PDF 와 다른 모양이 나오면 그때부터 두 벌을 관리해야 한다.
// ★미커버 정책도 그대로 — 폰트가 못 그리는 글자가 1자라도 있으면 skip + 보고.
//   "□ 로 조용히 내보내지 말 것"(사용자 결정, scripts/precedents/build-case-pdfs.ts 와 동일).
//
// 사용:
//   npx tsx scripts/case-diagram/build-lower-court-pdfs.ts              # 생성본 없는 것만
//   npx tsx scripts/case-diagram/build-lower-court-pdfs.ts --force      # 전체 재생성
//   npx tsx scripts/case-diagram/build-lower-court-pdfs.ts --case 2020후10292
//   npx tsx scripts/case-diagram/build-lower-court-pdfs.ts --all-kinds  # lower_self 까지
//
// 멱등: Storage 경로가 case_id 당 하나(<case_id>/generated.pdf) — 덮어쓰기. 파일 누적 0.

import "dotenv/config";

import { createClient } from "@supabase/supabase-js";

import {
  parseLowerCourtFiles,
  type LowerCourtFile,
} from "../../app/features/cases/lib/lower-court";
import { renderOfficialTextPdf } from "../../app/features/cases/lib/render-official-text-pdf.server";

const SUPA = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const BUCKET = "case-lower-courts";

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const ALL_KINDS = args.includes("--all-kinds");
const idx = args.indexOf("--case");
const ONE = idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null;

interface Row {
  case_id: string;
  source_ref: string | null;
  lower_case_number: string | null;
  lower_court: string | null;
  lower_decided_at: string | null;
  body_text: string;
  files: unknown;
  cases: {
    case_number: string;
    case_title: string | null;
  } | null;
}

/**
 * 대상 — 전문이 적재됐고 원본 파일이 없는 건.
 * 기본은 lower_auto 만: lower_manual 은 원본이 있거나 앞으로 올릴 것이고,
 * lower_self 는 판례 자체가 하급심이라 이미 판례 전문 PDF(case-fulltext)가 있다.
 */
async function loadTargets(): Promise<Row[]> {
  let q = SUPA.from("case_lower_courts")
    .select(
      `case_id, source_ref, lower_case_number, lower_court, lower_decided_at,
       body_text, files, cases:case_id ( case_number, case_title )`,
    )
    .eq("status", "loaded")
    .is("deleted_at", null);
  if (!ALL_KINDS) q = q.eq("source_kind", "lower_auto");
  else q = q.in("source_kind", ["lower_auto", "lower_self"]);
  const { data, error } = await q;
  if (error) throw error;

  // ★PostgREST 는 case_id unique 라 cases 를 객체로 내려주지만, 배열로 오는 배포도 있어 둘 다 받는다.
  const rows = (data ?? []).map((r) => {
    const raw = r.cases as Row["cases"] | Row["cases"][] | null;
    return { ...r, cases: Array.isArray(raw) ? (raw[0] ?? null) : raw } as Row;
  });

  return rows.filter((r) => {
    if (!r.body_text?.trim() || !r.cases) return false;
    if (ONE) return r.cases.case_number === ONE;
    if (FORCE) return true;
    return !parseLowerCourtFiles(r.files).some((f) => f.kind === "generated");
  });
}

const rows = await loadTargets();
process.stdout.write(`\n=== build-lower-court-pdfs (${rows.length}건) ===\n`);
process.stdout.write(
  `  mode: ${ONE ? `single ${ONE}` : FORCE ? "force-rebuild" : "missing-only"}` +
    `${ALL_KINDS ? " · lower_auto+lower_self" : " · lower_auto"}\n\n`,
);

let ok = 0,
  skip = 0,
  err = 0;
const skipList: { ref: string; chars: string[]; total: number }[] = [];

for (const r of rows) {
  const supreme = r.cases!.case_number;
  const ref =
    r.source_ref ??
    [r.lower_court, r.lower_case_number].filter(Boolean).join(" ") ??
    supreme;
  try {
    const result = await renderOfficialTextPdf({
      caseNumber: r.lower_case_number ?? ref,
      // 표제만 보고도 누구의 원심인지 알 수 있어야 한다 — 상고심 사건번호를 부제에 붙인다.
      caseTitle: [r.cases!.case_title, `대법원 ${supreme} 원심`]
        .filter(Boolean)
        .join(" — "),
      court: r.lower_court,
      decidedAt: r.lower_decided_at,
      fullText: r.body_text,
    });
    if (result.unrenderable.length > 0) {
      skip++;
      const uniq = [...new Set(result.unrenderable.map((u) => u.char))];
      skipList.push({ ref, chars: uniq.slice(0, 10), total: result.unrenderable.length });
      process.stdout.write(
        `  ⚠ ${ref}  skip (미커버 ${result.unrenderable.length}자: ${uniq.slice(0, 5).join(" ")})\n`,
      );
      continue;
    }

    // Storage 키는 ASCII 만 — case_id 기반 고정 경로라 재생성해도 파일이 쌓이지 않는다.
    const path = `${r.case_id}/generated.pdf`;
    const { error: upErr } = await SUPA.storage
      .from(BUCKET)
      .upload(path, result.pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });
    if (upErr) {
      err++;
      process.stdout.write(`  ✗ ${ref}  upload: ${upErr.message}\n`);
      continue;
    }

    // 업로드 원본은 건드리지 않는다 — 생성본만 갈아 끼운다.
    const kept = parseLowerCourtFiles(r.files).filter(
      (f) => f.kind !== "generated",
    );
    const next: LowerCourtFile[] = [
      ...kept,
      {
        name: `${ref}.pdf`,
        path,
        size: result.pdfBytes.length,
        mime: "application/pdf",
        kind: "generated",
      },
    ];
    const { error: dbErr } = await SUPA.from("case_lower_courts")
      .update({ files: next, updated_at: new Date().toISOString() })
      .eq("case_id", r.case_id);
    if (dbErr) {
      err++;
      process.stdout.write(`  ✗ ${ref}  db: ${dbErr.message}\n`);
      continue;
    }

    ok++;
    process.stdout.write(
      `  ✓ ${ref}  ${result.pageCount}p ${result.pdfBytes.length}B  → ${BUCKET}/${path}\n`,
    );
  } catch (e) {
    err++;
    process.stdout.write(
      `  ✗ ${ref}  ${e instanceof Error ? e.message : String(e)}\n`,
    );
  }
}

process.stdout.write(`\n=== 결과 ===\n`);
process.stdout.write(`  ok=${ok}  skip(미커버)=${skip}  err=${err}\n`);
if (skipList.length > 0) {
  process.stdout.write(`\n⚠ 미커버 skip 목록 — 폰트가 못 그리는 글자가 있는 건:\n`);
  for (const s of skipList) {
    process.stdout.write(`  ${s.ref}  미커버 ${s.total}자 — ${s.chars.join(" ")}\n`);
  }
}
