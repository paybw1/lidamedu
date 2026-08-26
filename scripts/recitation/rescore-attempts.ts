// 암기 모드 시도 이력 **재채점**.
//
// 조문 본문 텍스트에 관련조문 참조("法 200의2①")와 개정 표기("<개정 2014.6.11.>")가
// 문자열로 박혀 있어, 암기 모드가 그걸 정답의 일부로 채점하던 시절이 있었다(2026-08-26 수정).
// 그때 저장된 시도는 **본문을 정확히 썼는데도 오답으로 굳어** 있고, 암기 통계에 그대로 남는다.
//
// 저장 행에 채점 당시의 `expected_text` 가 그대로 있어 되돌릴 수 있다 —
// 정답을 지금 규칙(cleanupExpected)으로 다시 만들고 유사도·완료 여부를 다시 계산한다.
//
// ★`user_input` 은 절대 건드리지 않는다 — 학생이 실제로 쓴 글이다.
// ★정답이 바뀌지 않는 행은 손대지 않는다(재실행해도 같은 결과 = 멱등).
// ★적용 전 tmp/recitation 에 이전 채점 결과를 백업한다.
//
// 사용:
//   npx tsx scripts/recitation/rescore-attempts.ts            # 예행
//   npx tsx scripts/recitation/rescore-attempts.ts --apply

import "dotenv/config";

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

import { stripRefsAndNotes } from "../../app/features/laws/lib/article-body";
import {
  computeSimilarity,
  isRecitationComplete,
} from "../../app/features/recitation/lib/similarity";

const SUPA = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const BACKUP_DIR = path.resolve(process.cwd(), "tmp", "recitation");
const PAGE = 500;

const APPLY = process.argv.includes("--apply");

interface Row {
  attempt_id: string;
  user_id: string;
  article_id: string;
  block_index: number;
  user_input: string;
  expected_text: string;
  similarity: number;
  is_complete: boolean;
  attempted_at: string;
}

/** 화면(recitation-view)의 cleanupExpected 와 같은 규칙. */
function cleanExpected(s: string): string {
  return stripRefsAndNotes(s)
    .replace(/[\s,、·]+$/g, "")
    .replace(/^\s+/, "");
}

async function main(): Promise<void> {
  // ★range 페이징은 유일 정렬키로 — 정렬이 흔들리면 건너뛰거나 겹친다.
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await SUPA
      .from("user_recitation_attempts")
      .select(
        "attempt_id, user_id, article_id, block_index, user_input, expected_text, similarity, is_complete, attempted_at",
      )
      .order("attempt_id")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const page = (data ?? []) as Row[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }

  const plan = [];
  for (const r of rows) {
    const expected = cleanExpected(r.expected_text ?? "");
    if (expected === (r.expected_text ?? "")) continue;
    const similarity = computeSimilarity(r.user_input, expected);
    plan.push({
      row: r,
      expected,
      similarity,
      isComplete: isRecitationComplete(similarity),
    });
  }

  const flips = plan.filter((p) => p.isComplete !== p.row.is_complete);
  console.log(
    `시도 ${rows.length}건 · 정답이 바뀌는 행 ${plan.length}건 · 완료 여부가 뒤집히는 행 ${flips.length}건`,
  );
  for (const p of plan) {
    const arrow = `${Number(p.row.similarity).toFixed(2)} → ${p.similarity.toFixed(2)}`;
    const mark = p.isComplete !== p.row.is_complete ? ` · 완료 ${p.row.is_complete} → ${p.isComplete}` : "";
    console.log(
      `  ${p.row.attempted_at.slice(0, 10)} 조문 ${p.row.article_id.slice(0, 8)} 블록 ${p.row.block_index}  ${arrow}${mark}`,
    );
  }
  if (plan.length === 0) return;

  if (!APPLY) {
    console.log("\n--apply 를 붙이면 재채점합니다. user_input 은 건드리지 않습니다.");
    return;
  }

  mkdirSync(BACKUP_DIR, { recursive: true });
  const backup = path.join(BACKUP_DIR, `rescore-backup-${plan.length}.json`);
  writeFileSync(
    backup,
    JSON.stringify(
      plan.map((p) => ({
        attempt_id: p.row.attempt_id,
        expected_text: p.row.expected_text,
        similarity: p.row.similarity,
        is_complete: p.row.is_complete,
      })),
      null,
      2,
    ),
    "utf8",
  );
  console.log(`\n백업 ${backup}`);

  let done = 0;
  for (const p of plan) {
    const { error } = await SUPA
      .from("user_recitation_attempts")
      .update({
        expected_text: p.expected,
        similarity: p.similarity,
        is_complete: p.isComplete,
      })
      .eq("attempt_id", p.row.attempt_id);
    if (error) {
      console.log(`  ✗ ${p.row.attempt_id} — ${error.message}`);
      continue;
    }
    done += 1;
  }
  console.log(`재채점 ${done}/${plan.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
