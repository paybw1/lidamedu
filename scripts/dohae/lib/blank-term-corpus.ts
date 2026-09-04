// feat-2-037 — 도해 빈칸 말 추출이 쓰는 **원천 적재**. probe·gen 이 함께 쓴다.
//
// 문제는 체계도 노드로 붙는다 — `dohae_unit_nodes` → 그 노드의 **서브트리** →
// `problems.primary_node_id`. 조문·판례·문제와 같은 규칙이다(정확일치로 두면 부모
// 노드에서 늘 0 이 된다).
//
// ★1차 대비 기능이라 2차 주관식은 들어오지 않는다 — `primary_node_id` 가 붙은 특허
//   문제는 전부 객관식(mc_*)이고, 2차 주관식은 `problem_systematic_links` 로 배치된다.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import type { DohaeBlock } from "~/features/dohae/labels";

import { type UnitSources, type Vocabulary, buildVocabulary } from "./blank-term-extract";

export const DOHAE_LAW_CODE = "patent";
/** 기출로 보는 출처. 예상문제는 유형2(OX)에서만 쓰인다. */
const EXAM_ORIGINS = new Set(["past_exam", "past_exam_variant"]);

export interface DohaeUnitRow {
  unitId: string;
  unitKey: string;
  title: string;
  blocks: DohaeBlock[];
}

interface ProblemRow {
  problemId: string;
  origin: string;
  bodyMd: string;
  nodeId: string | null;
}
interface OxRow {
  problemId: string;
  text: string;
  oxEligible: boolean;
}

export interface Corpus {
  units: DohaeUnitRow[];
  vocab: Vocabulary;
  /** unitId → 그 유닛에 걸린 문제 id 들. */
  problemsByUnit: Map<string, string[]>;
  problemById: Map<string, ProblemRow>;
  choicesByProblem: Map<string, OxRow[]>;
  boxesByProblem: Map<string, OxRow[]>;
}

async function page<T>(
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

export async function loadCorpus(c: SupabaseClient<Database>): Promise<Corpus> {
  const { data: law, error: lawErr } = await c
    .from("laws")
    .select("law_id")
    .eq("law_code", DOHAE_LAW_CODE)
    .maybeSingle();
  if (lawErr) throw lawErr;
  if (!law) throw new Error(`법을 찾지 못했다: ${DOHAE_LAW_CODE}`);

  const [nodes, unitNodes, unitRows, problemRows] = await Promise.all([
    page((f) =>
      c
        .from("systematic_nodes")
        .select("node_id, path")
        .eq("law_code", DOHAE_LAW_CODE)
        .order("node_id")
        .range(f, f + 999),
    ),
    page((f) =>
      c.from("dohae_unit_nodes").select("unit_id, node_id").order("unit_id").range(f, f + 999),
    ),
    page((f) =>
      c
        .from("dohae_units")
        .select("unit_id, unit_key, title, blocks")
        .order("unit_key")
        .range(f, f + 999),
    ),
    page((f) =>
      c
        .from("problems")
        .select("problem_id, origin, body_md, primary_node_id")
        .eq("law_id", law.law_id)
        .is("deleted_at", null)
        .eq("review_status", "approved")
        .order("problem_id")
        .range(f, f + 999),
    ),
  ]);

  const problems: ProblemRow[] = problemRows.map((p) => ({
    problemId: p.problem_id,
    origin: p.origin,
    bodyMd: p.body_md ?? "",
    nodeId: p.primary_node_id,
  }));
  const known = new Set(problems.map((p) => p.problemId));

  const [choiceRows, boxRows] = await Promise.all([
    page((f) =>
      c
        .from("problem_choices")
        .select("problem_id, body_md, ox_body_md, ox_truth, ox_ineligible, ox_hidden_at")
        .order("choice_id")
        .range(f, f + 999),
    ),
    page((f) =>
      c
        .from("problem_box_items")
        .select("problem_id, body_md, ox_truth, ox_ineligible, ox_hidden_at")
        .order("box_item_id")
        .range(f, f + 999),
    ),
  ]);

  // 정오문제로 학습 가능한 지문인지 — 학생 노출 조건과 같은 잣대(isOxEligible + 숨김 제외).
  const eligible = (r: {
    ox_truth: string | null;
    ox_ineligible: boolean | null;
    ox_hidden_at: string | null;
  }) => r.ox_truth != null && r.ox_ineligible !== true && r.ox_hidden_at == null;

  const choicesByProblem = new Map<string, OxRow[]>();
  for (const r of choiceRows) {
    if (!known.has(r.problem_id)) continue;
    const row: OxRow = {
      problemId: r.problem_id,
      text: r.ox_body_md ?? r.body_md,
      oxEligible: eligible(r),
    };
    const cur = choicesByProblem.get(r.problem_id);
    if (cur) cur.push(row);
    else choicesByProblem.set(r.problem_id, [row]);
  }
  const boxesByProblem = new Map<string, OxRow[]>();
  for (const r of boxRows) {
    if (!known.has(r.problem_id)) continue;
    const row: OxRow = { problemId: r.problem_id, text: r.body_md, oxEligible: eligible(r) };
    const cur = boxesByProblem.get(r.problem_id);
    if (cur) cur.push(row);
    else boxesByProblem.set(r.problem_id, [row]);
  }

  // 노드 서브트리 → 유닛별 문제.
  // ★`systematic_nodes.path` 는 ltree 라 생성 타입이 `unknown` 이다 — 문자열로 받아
  //   접두 비교한다(ltree 텍스트 표현이 곧 경로다).
  const pathText = (p: unknown): string => String(p ?? "");
  const nodePaths = nodes.map((n) => ({ nodeId: n.node_id, path: pathText(n.path) }));
  const pathOf = new Map(nodePaths.map((n) => [n.nodeId, n.path]));
  const rootsByUnit = new Map<string, string[]>();
  for (const l of unitNodes) {
    const p = pathOf.get(l.node_id);
    if (!p) continue;
    const cur = rootsByUnit.get(l.unit_id);
    if (cur) cur.push(p);
    else rootsByUnit.set(l.unit_id, [p]);
  }
  const problemsByNode = new Map<string, string[]>();
  for (const p of problems) {
    if (!p.nodeId) continue;
    const cur = problemsByNode.get(p.nodeId);
    if (cur) cur.push(p.problemId);
    else problemsByNode.set(p.nodeId, [p.problemId]);
  }
  const problemsByUnit = new Map<string, string[]>();
  for (const [unitId, roots] of rootsByUnit) {
    const ids = new Set<string>();
    for (const n of nodePaths) {
      if (!roots.some((r) => n.path === r || n.path.startsWith(r + "."))) continue;
      for (const pid of problemsByNode.get(n.nodeId) ?? []) ids.add(pid);
    }
    problemsByUnit.set(unitId, [...ids]);
  }

  // 문서빈도는 **과목 전체**로 잰다 — 유닛 안에서만 세면 그 단원의 흔한 말을 못 거른다.
  const docTexts = problems.map((p) =>
    [p.bodyMd, ...(choicesByProblem.get(p.problemId) ?? []).map((x) => x.text)].join("\n"),
  );
  const boxTexts = [...boxesByProblem.values()].flat().map((x) => x.text);

  return {
    units: unitRows.map((u) => ({
      unitId: u.unit_id,
      unitKey: u.unit_key,
      title: u.title,
      blocks: (u.blocks ?? []) as DohaeBlock[],
    })),
    vocab: buildVocabulary(docTexts, boxTexts),
    problemsByUnit,
    problemById: new Map(problems.map((p) => [p.problemId, p])),
    choicesByProblem,
    boxesByProblem,
  };
}

/** 그 유닛에 걸린 원천 글 — 유형1 = 기출 문제 한 건씩, 유형2 = OX 지문 한 줄씩. */
export function unitSourcesOf(corpus: Corpus, unitId: string): UnitSources {
  const exam: string[] = [];
  const ox: string[] = [];
  for (const pid of corpus.problemsByUnit.get(unitId) ?? []) {
    const p = corpus.problemById.get(pid);
    if (!p) continue;
    const chs = corpus.choicesByProblem.get(pid) ?? [];
    const bxs = corpus.boxesByProblem.get(pid) ?? [];
    if (EXAM_ORIGINS.has(p.origin)) {
      exam.push([p.bodyMd, ...chs.map((x) => x.text), ...bxs.map((x) => x.text)].join("\n"));
    }
    for (const r of [...chs, ...bxs]) if (r.oxEligible) ox.push(r.text);
  }
  return { exam, ox };
}
