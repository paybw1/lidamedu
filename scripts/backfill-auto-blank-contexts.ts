// feat-2-030 후속 — 자동생성(명사) 빈칸 세트 좌표·컨텍스트 백필.
//   증상: version='자동생성' 세트의 blanks 에 blockIndex/cumOffset·컨텍스트가 없어
//   배치가 substring(답≥3자)에만 의존 → 2자 답(자기·점유·하자 등)은 슬롯 미렌더.
//   백필: 현재 body 로 deriveNounBlanks 재도출(결정적, 좌표 포함) → 저장된 답 시퀀스와
//   읽기순 그리디 매칭 → 매칭된 빈칸에 block_index/cum_offset + ±30자 컨텍스트 부여.
//   idx 는 절대 변경하지 않는다(attempt·tier 기록이 idx 기준). 미매칭 빈칸은 원본 유지
//   (placeable 필터가 티어 모수에서 제외 — 기존 동작 그대로).
//
//   실행: npx tsx scripts/backfill-auto-blank-contexts.ts [--limit N] [--commit]
//     --commit 없으면 dry-run(집계만). 적용 전 원본 blanks 전체를 백업 JSON 으로 저장.

import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

import { deriveNounBlanks } from "~/features/blanks/lib/noun-blanks";
import { blockCumulativeText, walkBlocks } from "~/features/blanks/lib/blank-layout";
import { parseBlanks } from "~/features/blanks/queries.server";
import { parseArticleBody } from "~/features/laws/lib/article-body";
import type { ArticleBody } from "~/features/laws/lib/article-body";

const CTX_LEN = 30; // addBlankToSet 와 동일한 ±30자 컨텍스트
const args = process.argv.slice(2);
const commit = args.includes("--commit");
const limitArg = args.find((a) => a.startsWith("--limit"));
const limit = limitArg ? Number(args[args.indexOf(limitArg) + 1]) : Infinity;

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!new URL(url).host.includes("mcgdoplo")) throw new Error("ABORT: not prod(mcgdoplo)");
const c = createClient(url, key, { auth: { persistSession: false } });

// 1) 자동생성 세트 전량(페이지네이션).
type SetRow = { set_id: string; article_id: string; blanks: unknown };
const sets: SetRow[] = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await c
    .from("article_blank_sets")
    .select("set_id, article_id, blanks")
    .eq("version", "자동생성")
    .order("set_id")
    .range(from, from + 999);
  if (error) throw error;
  sets.push(...((data ?? []) as SetRow[]));
  if ((data ?? []).length < 1000) break;
}
console.log("자동생성 세트:", sets.length);

// 2) 조문 → 현재 리비전 body (150 배치).
const artIds = [...new Set(sets.map((s) => s.article_id))];
const artRev = new Map<string, string>();
for (let i = 0; i < artIds.length; i += 150) {
  const { data, error } = await c
    .from("articles")
    .select("article_id, current_revision_id")
    .in("article_id", artIds.slice(i, i + 150));
  if (error) throw error;
  for (const r of data ?? []) {
    if (r.current_revision_id) artRev.set(r.article_id, r.current_revision_id);
  }
}
const revBody = new Map<string, unknown>();
const revIds = [...new Set(artRev.values())];
for (let i = 0; i < revIds.length; i += 150) {
  const { data, error } = await c
    .from("article_revisions")
    .select("revision_id, body_json")
    .in("revision_id", revIds.slice(i, i + 150));
  if (error) throw error;
  for (const r of data ?? []) revBody.set(r.revision_id, r.body_json);
}

// 블록 텍스트 캐시 — 컨텍스트 추출용.
function blockTexts(body: ArticleBody): string[] {
  const out: string[] = [];
  walkBlocks(body, (b) => out.push(blockCumulativeText(b)));
  return out;
}

// 3) 세트별 그리디 매칭 → 새 blanks 배열 생성.
const backup: Array<{ set_id: string; blanks: unknown }> = [];
const updates: Array<{ set_id: string; blanks: unknown }> = [];
let matchedTotal = 0;
let unmatchedTotal = 0;
let blanksTotal = 0;
let skippedSets = 0;
const unmatchedSamples: string[] = [];

for (const s of sets.slice(0, limit)) {
  const revId = artRev.get(s.article_id);
  const body = revId ? parseArticleBody(revBody.get(revId)) : null;
  const stored = parseBlanks(s.blanks);
  if (!body || stored.length === 0) {
    skippedSets++;
    continue;
  }
  const derived = deriveNounBlanks(body); // idx 순 = 읽기 순, blockIndex/cumOffset 포함
  const texts = blockTexts(body);
  let di = 0;
  let changed = false;
  const next = stored.map((b) => {
    blanksTotal++;
    // 이미 좌표 있으면 보존(수동 보정분 존중).
    if (typeof b.blockIndex === "number" && typeof b.cumOffset === "number") {
      matchedTotal++;
      return rawOf(b);
    }
    // 읽기순 그리디: derived 에서 같은 답의 다음 후보를 소비.
    let hit = -1;
    for (let j = di; j < derived.length; j++) {
      if (derived[j].answer === b.answer) {
        hit = j;
        break;
      }
    }
    if (hit === -1) {
      unmatchedTotal++;
      if (unmatchedSamples.length < 12)
        unmatchedSamples.push(`${s.set_id.slice(0, 8)} idx=${b.idx} "${b.answer}"`);
      return rawOf(b);
    }
    di = hit + 1;
    const d = derived[hit];
    const text = texts[d.blockIndex!] ?? "";
    const start = d.cumOffset!;
    const end = start + d.answer.length;
    matchedTotal++;
    changed = true;
    return {
      idx: b.idx,
      answer: b.answer,
      length: b.answer.length,
      block_index: d.blockIndex,
      cum_offset: d.cumOffset,
      before_context: text.slice(Math.max(0, start - CTX_LEN), start),
      after_context: text.slice(end, end + CTX_LEN),
    };
  });
  if (changed) {
    backup.push({ set_id: s.set_id, blanks: s.blanks });
    updates.push({ set_id: s.set_id, blanks: next });
  }
}

console.log(
  `빈칸 ${blanksTotal}개 중 좌표 확보 ${matchedTotal} · 미매칭 ${unmatchedTotal} · 세트 skip ${skippedSets}`,
);
console.log(`업데이트 대상 세트: ${updates.length}`);
if (unmatchedSamples.length)
  console.log("미매칭 샘플:\n  " + unmatchedSamples.join("\n  "));

function rawOf(b: ReturnType<typeof parseBlanks>[number]) {
  return {
    idx: b.idx,
    answer: b.answer,
    length: b.length,
    before_context: b.beforeContext ?? "",
    after_context: b.afterContext ?? "",
    ...(typeof b.blockIndex === "number" ? { block_index: b.blockIndex } : {}),
    ...(typeof b.cumOffset === "number" ? { cum_offset: b.cumOffset } : {}),
  };
}

// 4) COMMIT — 백업 저장 후 세트별 update.
if (commit && updates.length > 0) {
  const backupPath = `scripts/jagwa/.factbox/auto-blank-contexts-backup-${updates.length}sets.json`;
  writeFileSync(backupPath, JSON.stringify(backup));
  console.log("백업 저장:", backupPath);
  let done = 0;
  for (const u of updates) {
    const { error } = await c
      .from("article_blank_sets")
      .update({ blanks: u.blanks as never })
      .eq("set_id", u.set_id);
    if (error) throw error;
    done++;
    if (done % 100 === 0) console.log(`  updated ${done}/${updates.length}`);
  }
  console.log("완료:", done, "세트 백필");
} else if (!commit) {
  console.log("(DRY — --commit 붙이면 적용)");
}
