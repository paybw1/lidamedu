// feat-2-035 — 하급심 판결문 **원본 파일 일괄 보관**.
//
// 업로드 경로는 2026-08-24 이전까지 텍스트만 뽑고 원본 바이트를 버렸다. 그래서 그 전에
// 올린 lower_manual 86건은 files 가 비어 있다(원본을 되찾을 방법이 없었다). 원장이 원본
// 폴더를 다시 확보해 주어(source/판례데이터/특허_하급심판례) 여기서 일괄로 보관한다.
//
// ★화면 업로드(api/lower-court-upload)와 같은 규칙을 따른다 —
//   Storage 키는 ASCII, 한글 파일명은 files[].name 에만. kind='original'.
// ★기존 files 항목(생성본 등)은 보존하고 추가만 한다. body_text 는 건드리지 않는다.
// ★멱등: 경로가 case_id 당 고정(<case_id>/original-<i>.pdf) — 같은 이름이 이미 있으면 skip.
//
// 사용:
//   npx tsx scripts/case-diagram/upload-lower-court-originals.ts            # dry-run
//   npx tsx scripts/case-diagram/upload-lower-court-originals.ts --apply
//   npx tsx scripts/case-diagram/upload-lower-court-originals.ts --dir <경로>

import "dotenv/config";

import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

import { createClient } from "@supabase/supabase-js";

import {
  parseLowerCourtFiles,
  type LowerCourtFile,
} from "../../app/features/cases/lib/lower-court";
import { extractPdfText } from "../../app/features/cases/lib/pdf-extract.server";

const SUPA = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const BUCKET = "case-lower-courts";
const DEFAULT_DIR = "source/판례데이터/특허_하급심판례";
/** 추출 텍스트와 적재 본문의 길이 비가 이 밖이면 "다른 판결문 아닌가" 경고. */
const LEN_RATIO_MIN = 0.5;
const LEN_RATIO_MAX = 2;

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const dirIdx = args.indexOf("--dir");
const DIR = dirIdx >= 0 && dirIdx + 1 < args.length ? args[dirIdx + 1] : DEFAULT_DIR;

interface Row {
  case_id: string;
  source_kind: string | null;
  source_ref: string | null;
  lower_case_number: string | null;
  char_count: number | null;
  files: unknown;
}

/** 공백·밑줄만 다른 표기를 같은 것으로 본다("특허법원_2004허127" ↔ "특허법원 2004허127"). */
const norm = (s: string): string => s.replace(/[\s_]/g, "");

async function main(): Promise<void> {
  const { data, error } = await SUPA
    .from("case_lower_courts")
    .select("case_id, source_kind, source_ref, lower_case_number, char_count, files")
    .is("deleted_at", null);
  if (error) throw error;
  const rows = (data ?? []) as Row[];

  // 매칭 색인 — 파일명 stem 을 source_ref(여러 파일을 함께 올렸으면 " / " 로 이어져 있다)
  // → 정규화 표기 → 사건번호 순으로 찾는다.
  const byRef = new Map<string, Row>();
  const byNorm = new Map<string, Row>();
  const byNumber = new Map<string, Row>();
  for (const r of rows) {
    for (const part of (r.source_ref ?? "").split(" / ")) {
      const key = part.trim();
      if (!key) continue;
      byRef.set(key, r);
      byNorm.set(norm(key), r);
    }
    if (r.lower_case_number) byNumber.set(norm(r.lower_case_number), r);
  }
  const findRow = (stem: string): Row | null =>
    byRef.get(stem) ??
    byNorm.get(norm(stem)) ??
    // "특허법원_2004허127" 처럼 법원명이 앞에 붙은 파일명 → 사건번호만 떼어 다시 찾는다.
    byNumber.get(norm(stem.replace(/^[^_ ]+[_ ]/, ""))) ??
    null;

  const files = readdirSync(DIR)
    .filter((f) => f.toLowerCase().endsWith(".pdf"))
    .sort();

  // case_id 별로 묶는다 — 한 판례에 원본이 둘 이상일 수 있어(스캔본 + 텍스트본) 경로 번호를 준다.
  const plan = new Map<string, { row: Row; picks: string[] }>();
  const unmatched: string[] = [];
  for (const f of files) {
    const stem = basename(f, ".pdf");
    const row = findRow(stem);
    if (!row) {
      unmatched.push(stem);
      continue;
    }
    const entry = plan.get(row.case_id) ?? { row, picks: [] };
    entry.picks.push(f);
    plan.set(row.case_id, entry);
  }

  console.log(`디렉터리 ${DIR} — PDF ${files.length}개`);
  console.log(`매칭 ${files.length - unmatched.length}개 → 판례 ${plan.size}건`);
  if (unmatched.length) {
    console.log(`\n[매칭 실패 ${unmatched.length}]`);
    for (const s of unmatched) console.log(`  ${s}`);
  }

  let uploaded = 0;
  let skipped = 0;
  const warnings: string[] = [];

  for (const [caseId, { row, picks }] of plan) {
    const existing = parseLowerCourtFiles(row.files);
    const already = new Set(existing.map((x) => x.name));
    const add: LowerCourtFile[] = [];
    let slot = existing.filter((x) => x.kind === "original").length;

    for (const f of picks) {
      if (already.has(f)) {
        skipped += 1;
        continue;
      }
      const bytes = readFileSync(join(DIR, f));
      // 검증 — 텍스트 레이어가 있으면 적재 본문과 분량이 비슷해야 한다.
      //   스캔본(0자)은 그대로 통과시킨다. 원본은 원본대로 가치가 있다.
      const { text } = await extractPdfText(bytes);
      const len = text.trim().length;
      if (len > 0 && row.char_count && row.char_count > 0) {
        const ratio = len / row.char_count;
        if (ratio < LEN_RATIO_MIN || ratio > LEN_RATIO_MAX) {
          warnings.push(
            `${f} — 추출 ${len}자 vs 적재 ${row.char_count}자 (비 ${ratio.toFixed(2)})`,
          );
        }
      } else if (len === 0) {
        warnings.push(`${f} — 텍스트 레이어 없음(스캔본). 원본으로만 보관.`);
      }
      const path = `${caseId}/original-${slot}.pdf`;
      slot += 1;
      if (APPLY) {
        const { error: upErr } = await SUPA.storage
          .from(BUCKET)
          .upload(path, bytes, {
            contentType: "application/pdf",
            upsert: true,
          });
        if (upErr) {
          console.error(`  ✗ ${f} — 업로드 실패: ${upErr.message}`);
          continue;
        }
      }
      add.push({
        name: f,
        path,
        size: bytes.byteLength,
        mime: "application/pdf",
        kind: "original",
      });
      uploaded += 1;
    }

    if (add.length === 0) continue;
    if (APPLY) {
      const { error: updErr } = await SUPA
        .from("case_lower_courts")
        .update({ files: [...existing, ...add] })
        .eq("case_id", caseId);
      if (updErr) console.error(`  ✗ ${caseId} — files 갱신 실패: ${updErr.message}`);
    }
    console.log(
      `  ${APPLY ? "✔" : "·"} ${row.source_ref ?? row.lower_case_number} — ${add
        .map((x) => x.name)
        .join(", ")}`,
    );
  }

  // 원본을 못 받은 **수기 적재분** — 어떤 판결문을 더 구해야 하는지 목록으로 남긴다.
  //   자동 수집분(lower_auto)은 애초에 파일이 없던 것이라 여기 세지 않는다.
  const covered = new Set(plan.keys());
  const missing = rows.filter(
    (r) =>
      r.source_kind === "lower_manual" &&
      !covered.has(r.case_id) &&
      parseLowerCourtFiles(r.files).every((x) => x.kind !== "original"),
  );

  if (warnings.length) {
    console.log(`\n[확인 필요 ${warnings.length}]`);
    for (const w of warnings) console.log(`  ${w}`);
  }
  if (missing.length) {
    console.log(`\n[수기 적재분인데 원본 없음 ${missing.length}]`);
    for (const r of missing)
      console.log(`  ${r.source_ref ?? r.lower_case_number ?? r.case_id}`);
  }
  console.log(
    `\n${APPLY ? "적용" : "예행"} — 보관 ${uploaded} · 이미 있음 ${skipped} · 원본 없는 수기 적재분 ${missing.length}`,
  );
  if (!APPLY) console.log("실제 반영: --apply");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
