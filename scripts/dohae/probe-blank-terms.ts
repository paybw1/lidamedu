// 도해 빈칸 학습 모드 — **추출 품질 실측**(설계 전 측정). 저장하지 않는다.
//
//   유형1 = 기출문제(past_exam·past_exam_variant)에서 논의된 말
//   유형2 = 정오문제(OX 지문)에서 논의된 말
//   유형3 = 유형1 ∪ 유형2
//
// 후보는 **문제 쪽에서 뽑는다**. 도해 표 칸은 "신규성"처럼 조사 없이 낱말만 있어
// 조사 기반 명사 추출(nounStem)이 유닛 본문에서는 거의 아무것도 못 잡는다 — 조사가
// 붙는 문제 지문에서 말을 모은 뒤 그 말을 유닛 본문에서 찾는다.
//
//   npx tsx scripts/dohae/probe-blank-terms.ts [--unit <unit_key>] [--top N]

import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

import { nounStem } from "~/features/blanks/lib/noun-blanks";
import type { DohaeBlock, DohaeCell } from "~/features/dohae/labels";

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!new URL(url).host.includes("mcgdoplo")) throw new Error("ABORT: not prod");
const c = createClient(url, key, { auth: { persistSession: false } });

const args = process.argv.slice(2);
const only = args.includes("--unit") ? args[args.indexOf("--unit") + 1] : null;
const TOP = args.includes("--top") ? Number(args[args.indexOf("--top") + 1]) : 25;

// ── 말 뽑기 ────────────────────────────────────────────────────────────────
/**
 * 한 덩이 글에서 후보 낱말들 — **조사가 실제로 벗겨진 체언만**.
 * ★조사 없이 끝난 어절까지 담으면 "공지된"·"반하여"·"받을" 같은 용언이 섞이고, 같은
 *   말이 "진보성 / 진보성이 / 진보성을" 세 항목으로 갈라진다(1차 실측에서 상위권을
 *   그런 것들이 차지했다). 도해 표 칸의 조사 없는 낱말("신규성")은 문제 지문 쪽에서
 *   조사가 붙어 나오므로, 어휘는 문제 쪽에서만 모아도 다 잡힌다.
 */
function termsOf(text: string): Set<string> {
  const out = new Set<string>();
  for (const tok of text.split(/\s+/)) {
    const core = tok.replace(/^[^가-힣]+/, "").replace(/[^가-힣]+$/, "");
    if (core.length < 2 || core.length > 12) continue;
    const stem = nounStem(core);
    if (stem) out.add(stem);
  }
  return out;
}

/** 코퍼스에서 **조사 없이 홀로 쓰인** 어절들 — 잘린 말을 걸러내는 근거. */
const bareCores = new Set<string>();
function collectBare(text: string): void {
  for (const tok of text.split(/\s+/)) {
    const core = tok.replace(/^[^가-힣]+/, "").replace(/[^가-힣]+$/, "");
    if (core.length >= 2 && core.length <= 12) bareCores.add(core);
  }
}

// ── 유닛 본문(빈칸을 놓을 자리) ────────────────────────────────────────────
interface TextNode {
  path: string;
  text: string;
}

function collectCells(cells: DohaeCell[][], prefix: string, out: TextNode[]): void {
  cells.forEach((row, r) =>
    row.forEach((cell, cc) => {
      const path = `${prefix}.r${r}.c${cc}`;
      // 도해가 그려진 칸은 이미지라 글자가 없다.
      if (!cell.diagram && cell.text) out.push({ path, text: cell.text });
      (cell.tables ?? []).forEach((t, ti) => collectCells(t, `${path}.t${ti}`, out));
    }),
  );
}

/** 빈칸을 놓을 수 있는 텍스트 — ★조문 원문 박스는 뺀다(조문 빈칸은 따로 있다). */
function blankableNodes(blocks: DohaeBlock[]): TextNode[] {
  const out: TextNode[] = [];
  blocks.forEach((b, i) => {
    const prefix = `b${i}`;
    if (b.type === "p") out.push({ path: prefix, text: b.text });
    else if (b.type === "table") {
      const single = b.cells.length === 1 && b.cells[0]?.length === 1;
      if (single && /^제\d+조/.test(b.cells[0][0].text)) return; // 조문 박스
      collectCells(b.cells, prefix, out);
    }
    // h(소제목)·diagram·image 는 제외.
  });
  return out;
}

// ── 적재 ───────────────────────────────────────────────────────────────────
async function all<T>(
  q: (from: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q(from);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const { data: law } = await c
  .from("laws")
  .select("law_id")
  .eq("law_code", "patent")
  .maybeSingle();
const lawId = law!.law_id;

const nodes = await all<{ node_id: string; path: string }>((from) =>
  c
    .from("systematic_nodes")
    .select("node_id, path")
    .eq("law_code", "patent")
    .order("node_id")
    .range(from, from + 999),
);
const unitNodes = await all<{ unit_id: string; node_id: string }>((from) =>
  c.from("dohae_unit_nodes").select("unit_id, node_id").order("unit_id").range(from, from + 999),
);
const units = await all<{
  unit_id: string;
  unit_key: string;
  title: string;
  blocks: DohaeBlock[];
}>((from) =>
  c
    .from("dohae_units")
    .select("unit_id, unit_key, title, blocks")
    .order("unit_key")
    .range(from, from + 999),
);
const problems = await all<{
  problem_id: string;
  origin: string;
  body_md: string | null;
  primary_node_id: string | null;
}>((from) =>
  c
    .from("problems")
    .select("problem_id, origin, body_md, primary_node_id")
    .eq("law_id", lawId)
    .is("deleted_at", null)
    .eq("review_status", "approved")
    .order("problem_id")
    .range(from, from + 999),
);
const pids = new Set(problems.map((p) => p.problem_id));
const choices = await all<{
  problem_id: string;
  body_md: string;
  ox_body_md: string | null;
  ox_truth: string | null;
  ox_ineligible: boolean | null;
  ox_hidden_at: string | null;
}>((from) =>
  c
    .from("problem_choices")
    .select("problem_id, body_md, ox_body_md, ox_truth, ox_ineligible, ox_hidden_at")
    .order("choice_id")
    .range(from, from + 999),
);
const boxes = await all<{
  problem_id: string;
  body_md: string;
  ox_truth: string | null;
  ox_ineligible: boolean | null;
  ox_hidden_at: string | null;
}>((from) =>
  c
    .from("problem_box_items")
    .select("problem_id, body_md, ox_truth, ox_ineligible, ox_hidden_at")
    .order("box_item_id")
    .range(from, from + 999),
);

console.log(
  `유닛 ${units.length} · 노드 ${nodes.length} · 문제 ${problems.length} · 선지 ${choices.length} · 박스 ${boxes.length}`,
);

// ── 노드 서브트리 ──────────────────────────────────────────────────────────
const pathOf = new Map(nodes.map((n) => [n.node_id, n.path]));
const rootsByUnit = new Map<string, string[]>();
for (const l of unitNodes) {
  const p = pathOf.get(l.node_id);
  if (!p) continue;
  const cur = rootsByUnit.get(l.unit_id);
  if (cur) cur.push(p);
  else rootsByUnit.set(l.unit_id, [p]);
}
function subtreeNodeIds(roots: string[]): string[] {
  const s: string[] = [];
  for (const n of nodes)
    if (roots.some((r) => n.path === r || n.path.startsWith(r + "."))) s.push(n.node_id);
  return s;
}

// ── 문제 텍스트 ────────────────────────────────────────────────────────────
const byProblem = new Map<string, (typeof problems)[number]>();
for (const p of problems) byProblem.set(p.problem_id, p);

const choicesByProblem = new Map<string, typeof choices>();
for (const ch of choices) {
  if (!pids.has(ch.problem_id)) continue;
  const cur = choicesByProblem.get(ch.problem_id);
  if (cur) cur.push(ch);
  else choicesByProblem.set(ch.problem_id, [ch]);
}
const boxesByProblem = new Map<string, typeof boxes>();
for (const bx of boxes) {
  if (!pids.has(bx.problem_id)) continue;
  const cur = boxesByProblem.get(bx.problem_id);
  if (cur) cur.push(bx);
  else boxesByProblem.set(bx.problem_id, [bx]);
}
const oxEligible = (r: {
  ox_truth: string | null;
  ox_ineligible: boolean | null;
  ox_hidden_at: string | null;
}) => r.ox_truth != null && r.ox_ineligible !== true && r.ox_hidden_at == null;

/** 유형1 원천 = 기출 문제 한 건의 글 전체. 유형2 원천 = OX 지문 한 줄. */
function sourcesOf(problemIds: string[]) {
  const exam: string[] = [];
  const ox: string[] = [];
  for (const pid of problemIds) {
    const p = byProblem.get(pid);
    if (!p) continue;
    const chs = choicesByProblem.get(pid) ?? [];
    const bxs = boxesByProblem.get(pid) ?? [];
    if (p.origin === "past_exam" || p.origin === "past_exam_variant") {
      exam.push(
        [p.body_md ?? "", ...chs.map((x) => x.body_md), ...bxs.map((x) => x.body_md)].join("\n"),
      );
    }
    for (const ch of chs) if (oxEligible(ch)) ox.push(ch.ox_body_md ?? ch.body_md);
    for (const bx of bxs) if (oxEligible(bx)) ox.push(bx.body_md);
  }
  return { exam, ox };
}

// ── 코퍼스 전체 문서빈도(흔한 말 눌러 두기) ────────────────────────────────
const df = new Map<string, number>();
let docs = 0;
for (const p of problems) {
  const chs = choicesByProblem.get(p.problem_id) ?? [];
  const text = [p.body_md ?? "", ...chs.map((x) => x.body_md)].join("\n");
  docs++;
  collectBare(text);
  for (const t of termsOf(text)) df.set(t, (df.get(t) ?? 0) + 1);
}
for (const b of boxes) collectBare(b.body_md);

/**
 * 쓸 만한 말인가.
 * ★조사를 벗기다 말이 잘리는 일이 있다 — "선출원주의"에서 `의`를 떼면 "선출원주"가
 *   된다. 그래서 **코퍼스 어딘가에 조사 없이 홀로 쓰인 적이 있는 말**만 인정한다.
 *   같은 규칙이 "적용받"·"소급되"·"보정하" 같은 용언 토막도 함께 걸러낸다.
 * ★두 글자 말은 웬만하면 일반어(판단·구성·방법·경우)라 문서빈도 상한을 더 좁힌다.
 */
function usable(t: string): boolean {
  if (t.length < 2 || !bareCores.has(t)) return false;
  return dfRatio(t) <= (t.length === 2 ? 0.02 : TOO_COMMON);
}
const dfRatio = (t: string) => (df.get(t) ?? 0) / docs;
const idf = (t: string) => Math.log(docs / (1 + (df.get(t) ?? 0)));
// ★과목 전체에 두루 쓰이는 말(발명·특허·경우·판단)은 빈칸이 되어도 답이 뻔하다.
//   문서빈도 상한으로 잘라낸다 — 점수만으로는 등장 횟수가 커서 늘 상위에 남았다.
const TOO_COMMON = 0.08;

// ── 유닛별 산출 ────────────────────────────────────────────────────────────
const problemsByNode = new Map<string, string[]>();
for (const p of problems) {
  if (!p.primary_node_id) continue;
  const cur = problemsByNode.get(p.primary_node_id);
  if (cur) cur.push(p.problem_id);
  else problemsByNode.set(p.primary_node_id, [p.problem_id]);
}

interface Hit {
  term: string;
  kind: "exam" | "ox" | "both";
  examN: number;
  oxN: number;
  score: number;
  cells: number;
}

function analyze(u: (typeof units)[number]) {
  const roots = rootsByUnit.get(u.unit_id) ?? [];
  const pidList = subtreeNodeIds(roots).flatMap((n) => problemsByNode.get(n) ?? []);
  const { exam, ox } = sourcesOf([...new Set(pidList)]);

  const examCount = new Map<string, number>();
  const oxCount = new Map<string, number>();
  for (const s of exam) for (const t of termsOf(s)) examCount.set(t, (examCount.get(t) ?? 0) + 1);
  for (const s of ox) for (const t of termsOf(s)) oxCount.set(t, (oxCount.get(t) ?? 0) + 1);

  const textNodes = blankableNodes(u.blocks);
  const unitText = textNodes.map((n) => n.text).join("\n");

  const hits: Hit[] = [];
  for (const t of new Set([...examCount.keys(), ...oxCount.keys()])) {
    if (!unitText.includes(t) || !usable(t)) continue;
    const e = examCount.get(t) ?? 0;
    const o = oxCount.get(t) ?? 0;
    hits.push({
      term: t,
      kind: e > 0 && o > 0 ? "both" : e > 0 ? "exam" : "ox",
      examN: e,
      oxN: o,
      score: (e + o) * idf(t),
      cells: textNodes.filter((n) => n.text.includes(t)).length,
    });
  }
  hits.sort((a, b) => b.score - a.score);
  return { hits, exam: exam.length, ox: ox.length, cells: textNodes.length, chars: unitText.length };
}

const targets = only ? units.filter((u) => u.unit_key === only) : units;
for (const u of targets) {
  const r = analyze(u);
  const k = (v: Hit["kind"]) => r.hits.filter((h) => h.kind === v).length;
  console.log(
    `\n━━ ${u.unit_key} ${u.title} — 기출글 ${r.exam} · OX지문 ${r.ox} · 텍스트칸 ${r.cells}(${r.chars}자)` +
      ` · 후보 ${r.hits.length} [기출만 ${k("exam")} · 정오만 ${k("ox")} · 둘다 ${k("both")}]`,
  );
  for (const h of r.hits.slice(0, TOP)) {
    console.log(
      `   ${h.term.padEnd(14)} ${h.kind.padEnd(5)} 기출${String(h.examN).padStart(3)} OX${String(h.oxN).padStart(3)}  ${h.score.toFixed(0).padStart(5)}  칸${h.cells}`,
    );
  }
}
