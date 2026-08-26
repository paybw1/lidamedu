// feat-2-035 — 조각난 하급심 판결문 **재추출**.
//
// 예전 추출기는 판결문 PDF 의 텍스트 런을 순서대로 이어 붙여 문장을 조각냈다
// ("갑 제호증 5(9)"). 그렇게 적재된 body_text 는 사실관계 소스로 못 쓴다(날짜·번호를
// 잘못 옮긴 사실관계가 만들어지고, 2차는 그 사실관계를 각색해 출제한다).
//
// 오랫동안 손댈 수 없었다 — 화면 업로드가 **원본 바이트를 버렸기** 때문이다.
// 2026-08-26 에 원본 86개를 일괄 보관하면서(upload-lower-court-originals) 길이 열렸다:
// 보관된 원본을 지금 추출기(좌표 복원 pdf-extract.server)로 다시 읽어 본문만 갈아끼운다.
//
// ★본문(body_text·char_count)만 바꾼다 — files·source_ref·상태는 그대로.
// ★재추출이 더 나빠지면(조각 비율이 안 떨어지면) 그 건은 건너뛴다. 되돌릴 이유를 만들지 않는다.
// ★적용 전 기존 본문을 tmp/case-diagram 에 백업한다.
//
// 사용:
//   npx tsx scripts/case-diagram/reextract-lower-court.ts            # 예행
//   npx tsx scripts/case-diagram/reextract-lower-court.ts --apply
//   npx tsx scripts/case-diagram/reextract-lower-court.ts --case 2022후10814

import "dotenv/config";

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

import { parseLowerCourtFiles } from "../../app/features/cases/lib/lower-court";
import {
  SCRAMBLE_MAX,
  scrambleRatio,
} from "../../app/features/cases/lib/lower-court-text";
import { extractPdfText } from "../../app/features/cases/lib/pdf-extract.server";

const SUPA = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const BUCKET = "case-lower-courts";
const BACKUP_DIR = path.resolve(process.cwd(), "tmp", "case-diagram");
/** 재추출 결과가 이 비율보다 짧아지면 뭔가 잘못된 것 — 건너뛴다. */
const MIN_LEN_RATIO = 0.6;

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const oneIdx = args.indexOf("--case");
const ONE = oneIdx >= 0 && oneIdx + 1 < args.length ? args[oneIdx + 1] : null;

interface Row {
  case_id: string;
  source_ref: string | null;
  body_text: string | null;
  char_count: number | null;
  files: unknown;
}

async function main(): Promise<void> {
  let q = SUPA.from("case_lower_courts")
    .select("case_id, source_ref, body_text, char_count, files")
    .eq("status", "loaded")
    .is("deleted_at", null);
  if (ONE) {
    const { data: kase } = await SUPA
      .from("cases")
      .select("case_id")
      .eq("case_number", ONE)
      .maybeSingle();
    if (!kase) throw new Error(`판례를 못 찾음: ${ONE}`);
    q = q.eq("case_id", kase.case_id);
  }
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as Row[];

  const scrambled = rows
    .map((r) => ({ r, ratio: scrambleRatio(r.body_text ?? "") }))
    .filter((x) => x.ratio > SCRAMBLE_MAX);

  const noOriginal = scrambled.filter(
    (x) => !parseLowerCourtFiles(x.r.files).some((f) => f.kind === "original"),
  );
  const fixable = scrambled.filter((x) =>
    parseLowerCourtFiles(x.r.files).some((f) => f.kind === "original"),
  );

  console.log(
    `적재분 ${rows.length}건 · 조각남 ${scrambled.length}건 · 원본 있어 재추출 가능 ${fixable.length}건`,
  );
  if (noOriginal.length) {
    console.log(`\n[원본 없어 손 못 댐 ${noOriginal.length}]`);
    for (const x of noOriginal)
      console.log(`  ${x.r.source_ref ?? x.r.case_id} (조각 ${x.ratio.toFixed(2)})`);
  }
  if (fixable.length === 0) return;

  const plan: {
    row: Row;
    before: number;
    after: number;
    text: string;
    name: string;
  }[] = [];
  const rejected: string[] = [];

  for (const { r, ratio } of fixable) {
    // 원본이 여럿이면 화면 업로드와 같은 순서로 이어 붙인다(`[파일명]\n본문`).
    const originals = parseLowerCourtFiles(r.files).filter(
      (f) => f.kind === "original",
    );
    const parts: string[] = [];
    for (const f of originals) {
      const { data: blob, error: dlErr } = await SUPA.storage
        .from(BUCKET)
        .download(f.path);
      if (dlErr || !blob) {
        rejected.push(`${r.source_ref} — 원본 내려받기 실패: ${dlErr?.message}`);
        continue;
      }
      const { text } = await extractPdfText(
        Buffer.from(await blob.arrayBuffer()),
      );
      if (text.trim()) parts.push(`[${f.name}]\n${text.trim()}`);
    }
    if (parts.length === 0) {
      rejected.push(`${r.source_ref} — 추출 0자(스캔본)`);
      continue;
    }
    const text = parts.join("\n\n———\n\n");
    const after = scrambleRatio(text);
    const lenRatio = text.length / Math.max(1, r.char_count ?? 0);
    if (after > SCRAMBLE_MAX) {
      rejected.push(
        `${r.source_ref} — 재추출해도 조각 ${after.toFixed(2)} (이전 ${ratio.toFixed(2)})`,
      );
      continue;
    }
    if (lenRatio < MIN_LEN_RATIO) {
      rejected.push(
        `${r.source_ref} — 재추출이 너무 짧음 ${text.length}자 (이전 ${r.char_count}자)`,
      );
      continue;
    }
    plan.push({
      row: r,
      before: ratio,
      after,
      text,
      name: originals.map((f) => f.name).join(", "),
    });
  }

  console.log(`\n[재추출 ${plan.length}]`);
  for (const p of plan) {
    console.log(
      `  ${(p.row.source_ref ?? "").padEnd(24)} 조각 ${p.before.toFixed(2)} → ${p.after.toFixed(2)} · ${p.row.char_count}자 → ${p.text.length}자`,
    );
  }
  if (rejected.length) {
    console.log(`\n[건너뜀 ${rejected.length}]`);
    for (const m of rejected) console.log(`  ${m}`);
  }

  if (!APPLY) {
    console.log("\n--apply 를 붙이면 본문을 갈아끼웁니다.");
    return;
  }

  mkdirSync(BACKUP_DIR, { recursive: true });
  const backup = path.join(BACKUP_DIR, `lower-body-backup-${plan.length}.json`);
  writeFileSync(
    backup,
    JSON.stringify(
      plan.map((p) => ({
        case_id: p.row.case_id,
        source_ref: p.row.source_ref,
        body_text: p.row.body_text,
        char_count: p.row.char_count,
      })),
      null,
      2,
    ),
    "utf8",
  );
  console.log(`\n백업 ${backup}`);

  let done = 0;
  for (const p of plan) {
    const { error: upErr } = await SUPA.from("case_lower_courts")
      .update({ body_text: p.text, char_count: p.text.length })
      .eq("case_id", p.row.case_id);
    if (upErr) {
      console.log(`  ✗ ${p.row.source_ref} — ${upErr.message}`);
      continue;
    }
    done += 1;
  }
  console.log(`\n갈아끼움 ${done}/${plan.length}`);
  console.log("★도식 사실관계는 별도 — draft-diagrams --facts-only 로 채우세요.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
