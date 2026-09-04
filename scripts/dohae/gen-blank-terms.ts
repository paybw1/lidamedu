// feat-2-037 S3 — 도해 빈칸이 될 말을 뽑아 `dohae_blank_terms` 에 적재한다.
//
// 규칙은 `lib/blank-term-extract.ts` — 실측 도구(probe-blank-terms)와 **같은 모듈**이다.
//
// ★멱등이다. 다시 돌려도 `excluded_at`(운영자가 뺀 말)은 건드리지 않는다 — 나머지
//   컬럼은 스크립트 산출물이라 다시 넣어도 되지만, 뺀 말은 사람의 판단이라 날리면
//   운영자가 같은 잡티를 또 빼야 한다. 후보에서 빠진 말도 **뺀 표시가 있으면 남긴다**
//   (나중에 다시 후보가 되었을 때 그 판단이 살아 있어야 한다).
//
//   npx tsx scripts/dohae/gen-blank-terms.ts             # dry-run(기본)
//   npx tsx scripts/dohae/gen-blank-terms.ts --commit
//   npx tsx scripts/dohae/gen-blank-terms.ts --unit t25 --verbose

import { createClient } from "@supabase/supabase-js";
import type { Database } from "database.types";
import "dotenv/config";

import { blankableNodes } from "~/features/dohae/lib/dohae-blanks";

import { loadCorpus, unitSourcesOf } from "./lib/blank-term-corpus";
import { extractTerms, pickForStorage } from "./lib/blank-term-extract";

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!new URL(url).host.includes("mcgdoplo")) throw new Error("ABORT: not prod");
const c = createClient<Database>(url, key, { auth: { persistSession: false } });

const args = process.argv.slice(2);
const commit = args.includes("--commit");
const verbose = args.includes("--verbose");
const only = args.includes("--unit") ? args[args.indexOf("--unit") + 1] : null;
/**
 * 유닛당 저장할 말의 수.
 * ★2026-09-05 부터 **자르지 않는다.** 화면이 말 수에 상한을 두지 않고 밀도를 「한 줄에 하나」로
 *   잡으므로(원장 결정), 저장에서 자르면 그게 곧 빈칸 수의 상한이 된다. 예전엔 24개로 잘라
 *   유닛당 19.2개만 들어갔고 그 탓에 빈칸이 18칸에서 멈췄다(후보는 유닛당 30.1개다).
 *   실험용으로만 `--headroom N`.
 */
const HEADROOM = args.includes("--headroom")
  ? Number(args[args.indexOf("--headroom") + 1])
  : Number.POSITIVE_INFINITY;

type Row = Database["public"]["Tables"]["dohae_blank_terms"]["Row"];
type Insert = Database["public"]["Tables"]["dohae_blank_terms"]["Insert"];

const corpus = await loadCorpus(c);
const units = only ? corpus.units.filter((u) => u.unitKey === only) : corpus.units;
if (units.length === 0) throw new Error(`유닛을 찾지 못했다: ${only}`);
console.log(
  `유닛 ${units.length} · 문제 ${corpus.problemById.size} · 여유분 ${HEADROOM}` +
    ` · ${commit ? "적재" : "dry-run(적재 안 함)"}`,
);

// 기존 행 — 유닛 단위로 비교한다.
const existing = new Map<string, Row[]>();
for (let from = 0; ; from += 1000) {
  const { data, error } = await c
    .from("dohae_blank_terms")
    .select("*")
    .order("term_id")
    .range(from, from + 999);
  if (error) throw error;
  for (const r of data ?? []) {
    const cur = existing.get(r.unit_id);
    if (cur) cur.push(r);
    else existing.set(r.unit_id, [r]);
  }
  if (!data || data.length < 1000) break;
}

const toInsert: Insert[] = [];
const toUpdate: Array<{ termId: string; patch: Partial<Insert> }> = [];
const toDelete: string[] = [];
let keptExcluded = 0;
let unchanged = 0;
const emptyUnits: string[] = [];

for (const u of units) {
  const nodes = blankableNodes(u.blocks);
  const src = unitSourcesOf(corpus, u.unitId);
  const all = extractTerms(nodes.map((n) => n.text).join("\n"), src, corpus.vocab);
  const desired = pickForStorage(all, HEADROOM);
  if (desired.length === 0) emptyUnits.push(u.unitKey);

  const have = new Map((existing.get(u.unitId) ?? []).map((r) => [r.term, r]));
  const want = new Map(desired.map((t) => [t.term, t]));

  for (const t of desired) {
    const row = have.get(t.term);
    if (!row) {
      toInsert.push({
        unit_id: u.unitId,
        term: t.term,
        from_exam: t.fromExam,
        from_ox: t.fromOx,
        exam_count: t.examCount,
        ox_count: t.oxCount,
        score: t.score,
      });
      continue;
    }
    const same =
      row.from_exam === t.fromExam &&
      row.from_ox === t.fromOx &&
      row.exam_count === t.examCount &&
      row.ox_count === t.oxCount &&
      Number(row.score) === t.score;
    if (same) {
      unchanged++;
      continue;
    }
    // ★excluded_at·excluded_by 는 패치에 넣지 않는다 — 사람의 판단이다.
    toUpdate.push({
      termId: row.term_id,
      patch: {
        from_exam: t.fromExam,
        from_ox: t.fromOx,
        exam_count: t.examCount,
        ox_count: t.oxCount,
        score: t.score,
        updated_at: new Date().toISOString(),
      },
    });
  }

  for (const [term, row] of have) {
    if (want.has(term)) continue;
    if (row.excluded_at) {
      keptExcluded++; // 후보에서 빠졌지만 뺀 표시가 있으므로 남긴다.
      continue;
    }
    toDelete.push(row.term_id);
  }

  if (verbose) {
    console.log(
      `  ${u.unitKey.padEnd(6)} 후보 ${String(all.length).padStart(4)} → 저장 ${String(desired.length).padStart(3)}` +
        `  (기출 ${desired.filter((t) => t.fromExam).length} · 정오 ${desired.filter((t) => t.fromOx).length})` +
        `  ${u.title}`,
    );
  }
}

console.log(
  `\n신규 ${toInsert.length} · 갱신 ${toUpdate.length} · 삭제 ${toDelete.length}` +
    ` · 그대로 ${unchanged} · 뺀 말 보존 ${keptExcluded}`,
);
if (emptyUnits.length) {
  console.log(`빈칸을 만들 수 없는 유닛 ${emptyUnits.length}: ${emptyUnits.join(" ")}`);
}

if (!commit) {
  console.log("\n--commit 없이 끝냈다(적재 안 함).");
  process.exit(0);
}

// ── 적재 ───────────────────────────────────────────────────────────────────
for (let i = 0; i < toInsert.length; i += 500) {
  const { error } = await c.from("dohae_blank_terms").insert(toInsert.slice(i, i + 500));
  if (error) throw error;
}
for (const u of toUpdate) {
  const { error } = await c
    .from("dohae_blank_terms")
    .update(u.patch)
    .eq("term_id", u.termId);
  if (error) throw error;
}
for (let i = 0; i < toDelete.length; i += 500) {
  const { error } = await c
    .from("dohae_blank_terms")
    .delete()
    .in("term_id", toDelete.slice(i, i + 500));
  if (error) throw error;
}

const { count, error: cntErr } = await c
  .from("dohae_blank_terms")
  .select("term_id", { count: "exact", head: true });
if (cntErr) throw cntErr;
console.log(`적재 완료 — 현재 ${count}행`);
