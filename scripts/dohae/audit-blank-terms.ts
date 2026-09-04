// feat-2-037 S5 — 적재된 빈칸 낱말 **검수 보조**. 기본은 읽기만 한다.
//
// 사람이 판단할 것(법리·중요도)은 건드리지 않는다. 기계가 확실히 말할 수 있는 것만 짚는다:
//
//   ①답이 화면에 그대로 있다 — 유닛 제목이나 소제목(로마숫자 절 이름)에 같은 말이 있으면
//     빈칸을 봐도 바로 위에 답이 적혀 있다. 빈칸이 아니라 받아쓰기가 된다.
//   ②두 글자 일반어 — 문서빈도 상한을 넘기지 않았어도 답이 뻔한 말이 남는다.
//   ③한 칸 안에서 두 번 — 같은 칸에 같은 답을 두 번 치게 된다.
//
//   npx tsx scripts/dohae/audit-blank-terms.ts               # 보고만
//   npx tsx scripts/dohae/audit-blank-terms.ts --exclude-visible --commit
//     └ ①(답이 화면에 있는 말)만 excluded_at 으로 뺀다. ②③은 사람이 고른다.

import { createClient } from "@supabase/supabase-js";
import type { Database } from "database.types";
import "dotenv/config";

import type { DohaeBlock } from "~/features/dohae/labels";
import {
  DOHAE_BLANK_TYPES,
  type DohaeBlankType,
  type DohaeTerm,
  blankableNodes,
  buildBlanks,
} from "~/features/dohae/lib/dohae-blanks";

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!new URL(url).host.includes("mcgdoplo")) throw new Error("ABORT: not prod");
const c = createClient<Database>(url, key, { auth: { persistSession: false } });

const args = process.argv.slice(2);
const commit = args.includes("--commit");
const excludeVisible = args.includes("--exclude-visible");
const only = args.includes("--unit") ? args[args.indexOf("--unit") + 1] : null;

async function page<T>(
  q: (from: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let f = 0; ; f += 1000) {
    const { data, error } = await q(f);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const unitRows = await page<{
  unit_id: string;
  unit_key: string;
  title: string;
  blocks: unknown;
}>((f) =>
  c
    .from("dohae_units")
    .select("unit_id, unit_key, title, blocks")
    .order("unit_key")
    .range(f, f + 999),
);
const units = unitRows.map((u) => ({
  unitId: u.unit_id,
  unitKey: u.unit_key,
  title: u.title,
  blocks: (u.blocks ?? []) as DohaeBlock[],
}));
const rows = await page<{
  term_id: string;
  unit_id: string;
  term: string;
  from_exam: boolean;
  from_ox: boolean;
  exam_count: number;
  ox_count: number;
  score: number;
  excluded_at: string | null;
}>((f) =>
  c.from("dohae_blank_terms").select("*").order("term_id").range(f, f + 999),
);

const termsByUnit = new Map<string, typeof rows>();
for (const r of rows) {
  const cur = termsByUnit.get(r.unit_id);
  if (cur) cur.push(r);
  else termsByUnit.set(r.unit_id, [r]);
}

/**
 * 그 빈칸 곁에서 **눈에 보이는 글** — 유닛 제목 + 그 빈칸이 속한 절의 이름.
 * ★유닛의 소제목을 전부 합쳐 보면 안 된다. 다른 절의 이름은 접혀 있거나 멀리 있어
 *   답을 알려 주지 않는다. 빈칸 바로 위에 있는 것만 단서다.
 */
function visibleNear(
  u: (typeof units)[number],
  path: string,
): string {
  const bi = Number(/^b(\d+)/.exec(path)?.[1] ?? -1);
  let heading = "";
  for (let i = 0; i < bi; i++) {
    const b = u.blocks[i];
    if (b?.type === "h") heading = b.text;
  }
  return [u.title, heading].filter(Boolean).join(" / ");
}

interface Finding {
  unitKey: string;
  unitTitle: string;
  termId: string;
  term: string;
  kind: "visible" | "short" | "repeat";
  detail: string;
}

const findings: Finding[] = [];
let usedTotal = 0;

for (const u of only ? units.filter((x) => x.unitKey === only) : units) {
  const stored = (termsByUnit.get(u.unitId) ?? []).filter((r) => !r.excluded_at);
  if (stored.length === 0) continue;
  const nodes = blankableNodes(u.blocks);
  const live: DohaeTerm[] = stored.map((r) => ({
    termId: r.term_id,
    term: r.term,
    fromExam: r.from_exam,
    fromOx: r.from_ox,
    examCount: r.exam_count,
    oxCount: r.ox_count,
    score: Number(r.score),
  }));

  // 어느 유형에서든 실제로 뚫리는 말 = 검수 대상. 저장만 되고 안 쓰이는 말은 화면에 없다.
  // ★자리는 유형마다 따로 센다 — 세 유형의 배치를 한 통에 부으면 같은 자리가 세 번
  //   들어가 "같은 칸에 두 번"이 전건 오탐이 된다.
  const used = new Map<string, DohaeTerm>();
  const spots = new Map<string, Set<string>>(); // termId → "type:path:start"
  const sameCell = new Set<string>(); // 한 유형 안에서 같은 칸에 두 번 뚫린 termId
  for (const ty of DOHAE_BLANK_TYPES as readonly DohaeBlankType[]) {
    const plan = buildBlanks(nodes, live, ty);
    for (const x of plan.terms) used.set(x.termId, x);
    const byTermPath = new Map<string, number>();
    for (const h of plan.hits) {
      const cur = spots.get(h.termId);
      const spot = `${ty}:${h.path}:${h.start}`;
      if (cur) cur.add(spot);
      else spots.set(h.termId, new Set([spot]));
      const k = `${h.termId}|${h.path}`;
      const n = (byTermPath.get(k) ?? 0) + 1;
      byTermPath.set(k, n);
      if (n > 1) sameCell.add(h.termId);
    }
  }
  usedTotal += used.size;

  for (const t of used.values()) {
    // ①은 자리마다 본다 — 같은 말이라도 어느 절에 있느냐에 따라 답이 보이기도, 아니기도.
    const near = [...(spots.get(t.termId) ?? [])]
      .map((s) => visibleNear(u, s.split(":")[1]))
      .find((v) => v.includes(t.term));
    if (near)
      findings.push({
        unitKey: u.unitKey,
        unitTitle: u.title,
        termId: t.termId,
        term: t.term,
        kind: "visible",
        detail: near.length > 56 ? near.slice(0, 56) + "…" : near,
      });
    if (t.term.length === 2)
      findings.push({
        unitKey: u.unitKey,
        unitTitle: u.title,
        termId: t.termId,
        term: t.term,
        kind: "short",
        detail: `기출 ${t.examCount} · 정오 ${t.oxCount}`,
      });
    if (sameCell.has(t.termId))
      findings.push({
        unitKey: u.unitKey,
        unitTitle: u.title,
        termId: t.termId,
        term: t.term,
        kind: "repeat",
        detail: "한 칸에 두 번",
      });
  }
}

const of = (k: Finding["kind"]) => findings.filter((f) => f.kind === k);
console.log(
  `검수 대상(어느 유형에서든 실제로 뚫리는 말) ${usedTotal}개\n` +
    `  ①답이 화면에 있다 ${of("visible").length}` +
    ` · ②두 글자 일반어 ${of("short").length}` +
    ` · ③한 칸에 두 번 ${of("repeat").length}`,
);

for (const kind of ["visible", "short", "repeat"] as const) {
  const list = of(kind);
  if (list.length === 0) continue;
  const head =
    kind === "visible"
      ? "① 답이 화면에 그대로 있다 (제목·소제목)"
      : kind === "short"
        ? "② 두 글자 일반어"
        : "③ 같은 칸에 두 번";
  console.log(`\n━━ ${head} — ${list.length}건`);
  // 낱말별로 몇 유닛에서 걸렸는지 — 목록을 다 읽지 않고도 무엇을 뺄지 정할 수 있다.
  const byTerm = new Map<string, number>();
  for (const f of list) byTerm.set(f.term, (byTerm.get(f.term) ?? 0) + 1);
  console.log(
    `   [낱말 ${byTerm.size}종] ` +
      [...byTerm.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([t, n]) => (n > 1 ? `${t}(${n})` : t))
        .join(" "),
  );
  const cap = args.includes("--all") ? list.length : 40;
  for (const f of list.slice(0, cap))
    console.log(`   ${f.unitKey.padEnd(6)} ${f.term.padEnd(12)} ${f.detail}`);
  if (list.length > cap) console.log(`   … 외 ${list.length - cap}건 (--all 로 전부)`);
}

if (!excludeVisible) {
  console.log("\n보고만 했다. ①을 빼려면 --exclude-visible --commit");
  process.exit(0);
}

const ids = [...new Set(of("visible").map((f) => f.termId))];
if (!commit) {
  console.log(`\n--commit 없이 끝냈다. 뺄 대상 ${ids.length}건.`);
  process.exit(0);
}
for (let i = 0; i < ids.length; i += 500) {
  const { error } = await c
    .from("dohae_blank_terms")
    .update({ excluded_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .in("term_id", ids.slice(i, i + 500));
  if (error) throw error;
}
console.log(`\n뺐다 — ${ids.length}건(excluded_at). 지운 것이 아니라 표시만 켰다.`);
