// feat-2-037 S5 — 검수 미리보기용 **실측(읽기 전용)**. 아직 남은 두 글자 말(과 ①답이 화면에
// 있는 말)이 실제로 어느 유닛·어느 칸에서 뚫리는지, 그 칸의 글을 앞뒤 문맥과 함께 JSON 으로 낸다.
// 원장이 화면을 보지 않고도 "이 말을 빈칸으로 둘 만한가"를 판단할 수 있게 한다.
//
//   npx tsx scripts/dohae/probe-blank-contexts.ts <out.json>
import { writeFileSync } from "node:fs";

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
const out = process.argv[2];
if (!out) throw new Error("usage: probe-blank-contexts.ts <out.json>");

async function page<T>(
  q: (from: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const acc: T[] = [];
  for (let f = 0; ; f += 1000) {
    const { data, error } = await q(f);
    if (error) throw error;
    acc.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return acc;
}

const unitRows = await page<{ unit_id: string; unit_key: string; title: string; blocks: unknown }>(
  (f) => c.from("dohae_units").select("unit_id, unit_key, title, blocks").order("unit_key").range(f, f + 999),
);
const rows = await page<Database["public"]["Tables"]["dohae_blank_terms"]["Row"]>((f) =>
  c.from("dohae_blank_terms").select("*").order("term_id").range(f, f + 999),
);
const nodeLinks = await page<{ unit_id: string; node_id: string }>((f) =>
  c.from("dohae_unit_nodes").select("unit_id, node_id").range(f, f + 999),
);
const nodeOfUnit = new Map<string, string>();
for (const l of nodeLinks) if (!nodeOfUnit.has(l.unit_id)) nodeOfUnit.set(l.unit_id, l.node_id);

const termsByUnit = new Map<string, typeof rows>();
for (const r of rows) {
  if (r.excluded_at) continue;
  const cur = termsByUnit.get(r.unit_id);
  if (cur) cur.push(r);
  else termsByUnit.set(r.unit_id, [r]);
}

function headingBefore(blocks: DohaeBlock[], path: string): string {
  const bi = Number(/^b(\d+)/.exec(path)?.[1] ?? -1);
  let h = "";
  for (let i = 0; i < bi; i++) {
    const b = blocks[i];
    if (b?.type === "h") h = b.text;
  }
  return h;
}

interface Ctx {
  unitKey: string;
  unitTitle: string;
  unitId: string;
  nodeId: string | null;
  heading: string;
  path: string;
  types: number[];
  before: string;
  after: string;
  full: string;
}
interface Entry {
  term: string;
  termIds: string[];
  examCount: number;
  oxCount: number;
  units: number;
  contexts: Ctx[];
}

const WIN = 70;
const entries = new Map<string, Entry>();

for (const u of unitRows) {
  const blocks = (u.blocks ?? []) as DohaeBlock[];
  const stored = termsByUnit.get(u.unit_id) ?? [];
  if (stored.length === 0) continue;
  const nodes = blankableNodes(blocks);
  const textOf = new Map(nodes.map((n) => [n.path, n.text]));
  const live: DohaeTerm[] = stored.map((r) => ({
    termId: r.term_id,
    term: r.term,
    fromExam: r.from_exam,
    fromOx: r.from_ox,
    examCount: r.exam_count,
    oxCount: r.ox_count,
    score: Number(r.score),
  }));
  // spot → {term, types}
  const spots = new Map<string, { term: DohaeTerm; path: string; start: number; end: number; types: Set<number> }>();
  for (const ty of DOHAE_BLANK_TYPES as readonly DohaeBlankType[]) {
    const plan = buildBlanks(nodes, live, ty);
    for (const h of plan.hits) {
      const t = live.find((x) => x.termId === h.termId)!;
      const k = `${h.path}:${h.start}`;
      const cur = spots.get(k);
      if (cur) cur.types.add(ty);
      else spots.set(k, { term: t, path: h.path, start: h.start, end: h.end, types: new Set([ty]) });
    }
  }
  const heading1 = headingBefore(blocks, "b0");
  for (const s of spots.values()) {
    const t = s.term;
    const visibleNear = [u.title, headingBefore(blocks, s.path)].join(" / ");
    const isShort = t.term.length === 2;
    const isVisible = visibleNear.includes(t.term);
    if (!isShort && !isVisible) continue;
    const text = textOf.get(s.path) ?? "";
    const entry =
      entries.get(t.term) ??
      (() => {
        const e: Entry = { term: t.term, termIds: [], examCount: 0, oxCount: 0, units: 0, contexts: [] };
        entries.set(t.term, e);
        return e;
      })();
    if (!entry.termIds.includes(t.termId)) {
      entry.termIds.push(t.termId);
      entry.examCount += t.examCount;
      entry.oxCount += t.oxCount;
      entry.units += 1;
    }
    entry.contexts.push({
      unitKey: u.unit_key,
      unitTitle: u.title,
      unitId: u.unit_id,
      nodeId: nodeOfUnit.get(u.unit_id) ?? null,
      heading: headingBefore(blocks, s.path) || heading1,
      path: s.path,
      types: [...s.types].sort(),
      before: text.slice(Math.max(0, s.start - WIN), s.start),
      after: text.slice(s.end, s.end + WIN),
      full: text,
    });
  }
}

const list = [...entries.values()].sort(
  (a, b) => b.contexts.length - a.contexts.length || a.term.localeCompare(b.term, "ko"),
);
writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), terms: list }, null, 1));
console.log(
  `말 ${list.length}종 · 자리 ${list.reduce((n, e) => n + e.contexts.length, 0)}곳 → ${out}`,
);
