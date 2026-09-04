// feat-2-037 — 도해 빈칸 말 추출 **실측 도구**. 아무것도 저장하지 않는다.
//
// 규칙은 `lib/blank-term-extract.ts`, 원천 적재는 `lib/blank-term-corpus.ts` 에 있고
// 적재 스크립트(gen-blank-terms)와 **같은 모듈**을 쓴다 — 재 본 것과 넣은 것이
// 달라지지 않게.
//
//   npx tsx scripts/dohae/probe-blank-terms.ts [--unit <unit_key>] [--top N]
//   npx tsx scripts/dohae/probe-blank-terms.ts --place    # 실제로 몇 칸이 뚫리는지

import { createClient } from "@supabase/supabase-js";
import type { Database } from "database.types";
import "dotenv/config";

import { blankableNodes, buildBlanks, isArticleBox } from "~/features/dohae/lib/dohae-blanks";
import type { DohaeTerm } from "~/features/dohae/lib/dohae-blanks";

import { loadCorpus, unitSourcesOf } from "./lib/blank-term-corpus";
import { extractTerms } from "./lib/blank-term-extract";

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!new URL(url).host.includes("mcgdoplo")) throw new Error("ABORT: not prod");
const c = createClient<Database>(url, key, { auth: { persistSession: false } });

const args = process.argv.slice(2);
const only = args.includes("--unit") ? args[args.indexOf("--unit") + 1] : null;
const TOP = args.includes("--top") ? Number(args[args.indexOf("--top") + 1]) : 25;

const corpus = await loadCorpus(c);
console.log(`유닛 ${corpus.units.length} · 문제 ${corpus.problemById.size}`);

function analyze(u: (typeof corpus.units)[number]) {
  const nodes = blankableNodes(u.blocks);
  const src = unitSourcesOf(corpus, u.unitId);
  const terms = extractTerms(nodes.map((n) => n.text).join("\n"), src, corpus.vocab);
  return { nodes, src, terms };
}

/** 실측용 합성 id — 저장하지 않으므로 유닛 안에서만 유일하면 된다. */
const asDohaeTerms = (unitKey: string, terms: ReturnType<typeof analyze>["terms"]): DohaeTerm[] =>
  terms.map((t, i) => ({ termId: `${unitKey}-${i}`, ...t }));

// ── 실제 배치까지 재 본다 ──────────────────────────────────────────────────
// ★말이 좋아도 배치가 몇 칸 안 나오면 연습이 안 된다. 화면을 짓기 전에 칸 수를 본다.
if (args.includes("--place")) {
  let t1 = 0;
  let t2 = 0;
  let t3 = 0;
  let zero = 0;
  let boxes = 0;
  const thin: string[] = [];
  for (const u of corpus.units) {
    const { nodes, terms } = analyze(u);
    boxes += u.blocks.filter(isArticleBox).length;
    const dt = asDohaeTerms(u.unitKey, terms);
    const n3 = buildBlanks(nodes, dt, 3).hits.length;
    t1 += buildBlanks(nodes, dt, 1).hits.length;
    t2 += buildBlanks(nodes, dt, 2).hits.length;
    t3 += n3;
    if (n3 === 0) zero++;
    else if (n3 < 5) thin.push(`${u.unitKey}(${n3})`);
  }
  const avg = (n: number) => (n / corpus.units.length).toFixed(1);
  console.log(
    `\n배치 — 유형1 평균 ${avg(t1)}칸 · 유형2 ${avg(t2)}칸 · 유형3 ${avg(t3)}칸` +
      ` · 빈칸 0인 유닛 ${zero} · 5칸 미만 ${thin.length}`,
  );
  console.log(`   조문 원문 박스 ${boxes}개 — 전부 빈칸 대상에서 제외됨`);
  if (thin.length) console.log(`   적은 유닛: ${thin.join(" ")}`);
  process.exit(0);
}

for (const u of only ? corpus.units.filter((x) => x.unitKey === only) : corpus.units) {
  const { nodes, src, terms } = analyze(u);
  const chars = nodes.reduce((n, x) => n + x.text.length, 0);
  const k = (f: (t: (typeof terms)[number]) => boolean) => terms.filter(f).length;
  console.log(
    `\n━━ ${u.unitKey} ${u.title} — 기출글 ${src.exam.length} · OX지문 ${src.ox.length}` +
      ` · 텍스트칸 ${nodes.length}(${chars}자) · 후보 ${terms.length}` +
      ` [기출만 ${k((t) => t.fromExam && !t.fromOx)} · 정오만 ${k((t) => !t.fromExam && t.fromOx)}` +
      ` · 둘다 ${k((t) => t.fromExam && t.fromOx)}]`,
  );
  for (const t of terms.slice(0, TOP)) {
    const cells = nodes.filter((n) => n.text.includes(t.term)).length;
    console.log(
      `   ${t.term.padEnd(14)} 기출${String(t.examCount).padStart(3)}` +
        ` OX${String(t.oxCount).padStart(3)}  ${t.score.toFixed(0).padStart(5)}  칸${cells}`,
    );
  }
}
