// feat-2-022 — OX 지문(선지·박스) 누적 정오의 단원(node) × 지식종류(choice_type) 교차 진단.
//
// 데이터 소스: user_problem_attempts(ox_answer IS NOT NULL). choice_type·노드는 JOIN 으로 도출
//   (기록 시점엔 컬럼 없음 — 마이그레이션 불필요). docs/features/feat-2-022-ox-diagnosis.md SSOT.
//
// 구조: 순수 집계부 buildOxDiagnosis(rows, meta, opts) 와 DB 조회부 computeOxDiagnosis 를 분리
//   → 순수부는 DB 없이 합성 표본으로 검산 가능(ox-diagnosis.test.ts). 핵심 설계:
//  - box-item 포함: 기존 getPackResultStats.byChoiceType 는 선지(selected_choice_id)만 집계해
//    box 누락 → 여기서는 selected_box_item_id → problem_box_items.choice_type 까지 union.
//  - 노드 귀속: problems.primary_node_id → article_systematic_links(article→node, 첫째) (getSessionWeakNodes 미러).
//  - dedup 기본 'latest'(ref별 최신 1회 = 현재 숙련도). 'all' = 전체 시도(빈도·궤적).
//  - attempted_at 보존(totals.firstAt/lastAt) + since/until 윈도우 → 합격자 패턴(시간·코호트·D-N) 미래 토대.
//  - 표본 게이트: 셀 시도수 N < OX_DIAGNOSIS_MIN_ATTEMPTS 면 belowThreshold=true → 약점/처방/순위 제외.
//  - 0/빈 데이터 안전: 모든 나눗셈 attempts>0 가드, 빈 배열·null 반환.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import type { ProblemChoiceType } from "~/features/problems/labels";
import {
  attributeProblemNodes,
  buildArticleToNodes,
} from "~/features/subjects/lib/problem-node-attribution.server";

// 표본 임계 — weak-nodes 의 MIN_ATTEMPTS_FOR_RANKING(=5) 과 일관. 추후 app_settings 조정 여지.
export const OX_DIAGNOSIS_MIN_ATTEMPTS = 5;

// in 절 청크 크기 — Postgrest URL 길이 한계 회피.
const CHUNK = 1000;

export interface OxCell {
  /** 분모 — dedup 후 시도 수. */
  attempts: number;
  correct: number;
  /** 0~100. attempts===0 → null (0-div 안전). */
  accuracyPct: number | null;
  /** N < minAttempts → 약점 단정/처방 제외. */
  belowThreshold: boolean;
}

export interface OxChoiceTypeRow extends OxCell {
  /** null = 미분류(choice_type 미입력). */
  choiceType: ProblemChoiceType | null;
}

export interface OxNodeRow extends OxCell {
  /** null = 기타(노드 귀속 실패). */
  nodeId: string | null;
  label: string;
  /** 과목 slug(systematic_nodes.law_code). null 이면 deep-link 불가 → 라벨만. */
  lawCode: string | null;
  /** (100-정답률)*log10(시도+1). belowThreshold 면 0. weak-nodes 와 동일 공식. */
  weaknessScore: number;
}

export interface OxCrossCell extends OxCell {
  nodeId: string | null;
  choiceType: ProblemChoiceType | null;
}

/** 체계도 노드 메타(트리 롤업용) — computeOxDiagnosis 가 조상 폐쇄까지 조회해 공급. */
export interface OxNodeMetaRow {
  nodeId: string;
  parentId: string | null;
  label: string;
  lawCode: string;
  /** 체계도 정렬 키(ltree path 문자열). */
  path: string;
}

/**
 * 체계도 정렬 트리 행(전위 순회 평탄화). 셀은 하위 노드 전체 롤업 합산 —
 * 리프 귀속은 1회뿐이라 조상 경로 합산에 중복 없음. 기타(귀속 실패)는 말미 평면 행.
 */
export interface OxTreeRow {
  /** null = 기타(노드 귀속 실패). */
  nodeId: string | null;
  label: string;
  lawCode: string | null;
  /** 루트 0. */
  depth: number;
  /** 접기/펼치기 렌더용 — 트리 내 부모 nodeId. */
  parentId: string | null;
  hasChildren: boolean;
  /** choiceType별 롤업 셀. key = choiceType | "null"(미분류). 시도>0 종류만. */
  cells: Record<string, OxCell>;
  /** 행 전체(종류 합산) 롤업. */
  total: OxCell;
}

export interface OxDiagnosis {
  totals: {
    attempts: number;
    correct: number;
    accuracyPct: number | null;
    distinctRefs: number;
    firstAt: string | null;
    lastAt: string | null;
  };
  byChoiceType: OxChoiceTypeRow[];
  byNode: OxNodeRow[];
  /** node × choiceType (시도>0 셀만). attempts 내림차순. */
  cross: OxCrossCell[];
  /**
   * 체계도 정렬 매트릭스(조상 롤업 포함, 전위 순회 평탄화).
   * buildOxDiagnosis 단독으로는 노드 계층을 모름 → 빈 배열. computeOxDiagnosis 가
   * buildOxDiagnosisTree 로 채운다. 뷰는 비어 있으면 평면 매트릭스로 폴백.
   */
  tree: OxTreeRow[];
  /**
   * 조문(법전) 기준 매트릭스 — 편→장→절 그룹 롤업. 전 과목 동일 기준(민법처럼
   * 체계도 없는 과목 포함)이라 과목 간 비교용 토글 뷰. nodeId = 그룹 article_id
   * (딥링크는 /subjects/:law/chapters/:id).
   */
  articleTree: OxTreeRow[];
  minAttempts: number;
  dedup: "latest" | "all";
}

export interface OxDiagnosisOptions {
  /** attempted_at >= (ISO). 궤적/윈도우 집계용. */
  since?: string | null;
  /** attempted_at <= (ISO). */
  until?: string | null;
  /** 'latest'(기본) = ref별 최신 1회. 'all' = 전체 시도. */
  dedup?: "latest" | "all";
  /** 안전 상한 (단일 사용자라 사실상 무제한). */
  maxRows?: number;
}

/** user_problem_attempts 의 OX 행(필요 컬럼만). */
export interface OxAttemptRow {
  problem_id: string;
  selected_choice_id: string | null;
  selected_box_item_id: string | null;
  is_correct: boolean;
  attempted_at: string | null;
}

/** ref/problem → 분류·노드 도출용 사전. */
export interface OxRefMeta {
  /** key `choice:${id}` / `box:${id}` → choice_type. */
  ctByRef: Map<string, ProblemChoiceType | null>;
  /** problem_id → nodeId (없으면 null=기타). */
  nodeByProblem: Map<string, string | null>;
  /** nodeId → 표시 라벨. */
  labelByNode: Map<string, string>;
  /** nodeId → 과목 slug(deep-link 용). 없으면 라벨만. */
  lawCodeByNode: Map<string, string>;
}

const CHOICE_TYPE_ORDER: ProblemChoiceType[] = ["statute", "precedent", "theory"];

function mkCell(attempts: number, correct: number, minAttempts: number): OxCell {
  return {
    attempts,
    correct,
    accuracyPct: attempts > 0 ? Math.round((correct / attempts) * 100) : null,
    belowThreshold: attempts < minAttempts,
  };
}

function refKeyOf(row: OxAttemptRow): string | null {
  if (row.selected_choice_id) return `choice:${row.selected_choice_id}`;
  if (row.selected_box_item_id) return `box:${row.selected_box_item_id}`;
  return null;
}

/**
 * 순수 집계 — DB 비의존. rows + 해석 사전(meta) 으로 진단 산출.
 * dedup='latest' 면 ref별 attempted_at 최신 1회만(내부에서 내림차순 정렬 — 입력 순서 무관).
 */
export function buildOxDiagnosis(
  rows: OxAttemptRow[],
  meta: OxRefMeta,
  options: { dedup?: "latest" | "all"; minAttempts?: number } = {},
): OxDiagnosis {
  const dedup = options.dedup ?? "latest";
  const minAttempts = options.minAttempts ?? OX_DIAGNOSIS_MIN_ATTEMPTS;

  // 시간 범위 — 전체 행 기준(dedup 무관).
  let firstAt: string | null = null;
  let lastAt: string | null = null;
  for (const r of rows) {
    if (!r.attempted_at) continue;
    if (!firstAt || r.attempted_at < firstAt) firstAt = r.attempted_at;
    if (!lastAt || r.attempted_at > lastAt) lastAt = r.attempted_at;
  }

  // latest dedup 을 위해 attempted_at 내림차순(나중 먼저, null 마지막).
  const ordered =
    dedup === "latest"
      ? [...rows].sort((a, b) =>
          (b.attempted_at ?? "").localeCompare(a.attempted_at ?? ""),
        )
      : rows;

  interface Rec {
    refKey: string;
    problemId: string;
    isCorrect: boolean;
  }
  const records: Rec[] = [];
  const seenRef = new Set<string>();
  for (const r of ordered) {
    const refKey = refKeyOf(r);
    if (!refKey) continue;
    if (dedup === "latest") {
      if (seenRef.has(refKey)) continue; // 최신만
      seenRef.add(refKey);
    }
    records.push({
      refKey,
      problemId: r.problem_id,
      isCorrect: r.is_correct === true,
    });
  }

  if (records.length === 0) {
    return {
      totals: {
        attempts: 0,
        correct: 0,
        accuracyPct: null,
        distinctRefs: 0,
        firstAt,
        lastAt,
      },
      byChoiceType: [],
      byNode: [],
      cross: [],
      tree: [],
      articleTree: [],
      minAttempts,
      dedup,
    };
  }

  interface Bucket {
    attempts: number;
    correct: number;
  }
  const bump = (b: Bucket, correct: boolean) => {
    b.attempts += 1;
    if (correct) b.correct += 1;
  };
  const ctBuckets = new Map<string, Bucket>(); // key = choiceType | "null"
  const nodeBuckets = new Map<string, Bucket>(); // key = nodeId | "null"
  const crossBuckets = new Map<
    string,
    Bucket & { nodeId: string | null; choiceType: ProblemChoiceType | null }
  >();
  let totalCorrect = 0;
  for (const rec of records) {
    const ct = meta.ctByRef.get(rec.refKey) ?? null;
    const node = meta.nodeByProblem.get(rec.problemId) ?? null;
    const ctKey = ct ?? "null";
    const nodeKey = node ?? "null";

    const cb = ctBuckets.get(ctKey) ?? { attempts: 0, correct: 0 };
    bump(cb, rec.isCorrect);
    ctBuckets.set(ctKey, cb);

    const nb = nodeBuckets.get(nodeKey) ?? { attempts: 0, correct: 0 };
    bump(nb, rec.isCorrect);
    nodeBuckets.set(nodeKey, nb);

    const xKey = `${nodeKey}¦${ctKey}`;
    const xb =
      crossBuckets.get(xKey) ??
      { attempts: 0, correct: 0, nodeId: node, choiceType: ct };
    bump(xb, rec.isCorrect);
    crossBuckets.set(xKey, xb);

    if (rec.isCorrect) totalCorrect += 1;
  }

  // byChoiceType — 정규 순서(조문/판례/이론) + 미분류 마지막.
  const byChoiceType: OxChoiceTypeRow[] = [];
  for (const ct of CHOICE_TYPE_ORDER) {
    const b = ctBuckets.get(ct);
    if (!b) continue;
    byChoiceType.push({
      choiceType: ct,
      ...mkCell(b.attempts, b.correct, minAttempts),
    });
  }
  const nullCt = ctBuckets.get("null");
  if (nullCt)
    byChoiceType.push({
      choiceType: null,
      ...mkCell(nullCt.attempts, nullCt.correct, minAttempts),
    });

  // byNode — weaknessScore 내림차순(약점 우선). 표본 미달 셀은 score 0(순위 하단).
  const byNode: OxNodeRow[] = [];
  for (const [key, b] of nodeBuckets) {
    const cell = mkCell(b.attempts, b.correct, minAttempts);
    const nodeId = key === "null" ? null : key;
    const acc = cell.accuracyPct ?? 0;
    const weaknessScore = cell.belowThreshold
      ? 0
      : (100 - acc) * Math.log10(b.attempts + 1);
    byNode.push({
      nodeId,
      label: nodeId ? (meta.labelByNode.get(nodeId) ?? "(라벨 없음)") : "기타",
      lawCode: nodeId ? (meta.lawCodeByNode.get(nodeId) ?? null) : null,
      weaknessScore,
      ...cell,
    });
  }
  byNode.sort((a, b) => b.weaknessScore - a.weaknessScore);

  // cross — attempts 내림차순.
  const cross: OxCrossCell[] = [];
  for (const xb of crossBuckets.values()) {
    cross.push({
      nodeId: xb.nodeId,
      choiceType: xb.choiceType,
      ...mkCell(xb.attempts, xb.correct, minAttempts),
    });
  }
  cross.sort((a, b) => b.attempts - a.attempts);

  return {
    totals: {
      attempts: records.length,
      correct: totalCorrect,
      accuracyPct: Math.round((totalCorrect / records.length) * 100),
      distinctRefs: new Set(records.map((r) => r.refKey)).size,
      firstAt,
      lastAt,
    },
    byChoiceType,
    byNode,
    cross,
    tree: [],
    articleTree: [],
    minAttempts,
    dedup,
  };
}

/**
 * 순수 트리 빌더 — cross(리프 노드×종류 셀)를 체계도 계층(nodes)에 얹어
 * 조상 롤업 매트릭스를 만든다. 반환은 전위 순회 평탄화(depth 포함).
 *  - 등장 리프의 조상 전체를 포함(중간 노드는 직접 시도 0이어도 합산 행으로 등장).
 *  - 정렬: lawCode → path (체계도 순서). 기타(nodeId null)는 말미.
 *  - 메타에 없는 노드(고아)는 루트 취급 — 라벨은 fallbackLabel 사전에서.
 */
export function buildOxDiagnosisTree(
  cross: OxCrossCell[],
  nodes: OxNodeMetaRow[],
  options: {
    minAttempts?: number;
    /** 메타 없는 노드용 라벨(byNode 라벨 재사용). */
    fallbackLabel?: Map<string, string>;
    fallbackLawCode?: Map<string, string>;
  } = {},
): OxTreeRow[] {
  const minAttempts = options.minAttempts ?? OX_DIAGNOSIS_MIN_ATTEMPTS;
  interface Bucket {
    attempts: number;
    correct: number;
  }
  // 리프 직접 셀: nodeKey → (ctKey → bucket).
  const leafCells = new Map<string, Map<string, Bucket>>();
  for (const c of cross) {
    const nodeKey = c.nodeId ?? "null";
    const ctKey = c.choiceType ?? "null";
    const byCt = leafCells.get(nodeKey) ?? new Map<string, Bucket>();
    const b = byCt.get(ctKey) ?? { attempts: 0, correct: 0 };
    b.attempts += c.attempts;
    b.correct += c.correct;
    byCt.set(ctKey, b);
    leafCells.set(nodeKey, byCt);
  }

  const metaById = new Map(nodes.map((n) => [n.nodeId, n]));
  // 등장 리프 + 조상 폐쇄.
  const involved = new Set<string>();
  for (const key of leafCells.keys()) {
    if (key === "null") continue;
    let cur: string | null = key;
    for (let guard = 0; cur && guard < 20; guard++) {
      if (involved.has(cur)) break;
      involved.add(cur);
      cur = metaById.get(cur)?.parentId ?? null;
    }
  }

  // 자식 사전 (트리 내 부모 없으면 루트).
  const childrenOf = new Map<string | null, string[]>();
  const parentInTree = new Map<string, string | null>();
  for (const id of involved) {
    const rawParent = metaById.get(id)?.parentId ?? null;
    const parent = rawParent && involved.has(rawParent) ? rawParent : null;
    parentInTree.set(id, parent);
    const list = childrenOf.get(parent) ?? [];
    list.push(id);
    childrenOf.set(parent, list);
  }
  const orderKey = (id: string) => {
    const m = metaById.get(id);
    return `${m?.lawCode ?? "~"}¦${m?.path ?? "~"}`;
  };
  for (const list of childrenOf.values())
    list.sort((a, b) => orderKey(a).localeCompare(orderKey(b)));

  // 롤업: 후위 합산(자식 → 부모).
  const rolled = new Map<string, Map<string, Bucket>>();
  const rollup = (id: string): Map<string, Bucket> => {
    const cached = rolled.get(id);
    if (cached) return cached;
    const acc = new Map<string, Bucket>();
    const merge = (src: Map<string, Bucket> | undefined) => {
      if (!src) return;
      for (const [ct, b] of src) {
        const cur = acc.get(ct) ?? { attempts: 0, correct: 0 };
        cur.attempts += b.attempts;
        cur.correct += b.correct;
        acc.set(ct, cur);
      }
    };
    merge(leafCells.get(id));
    for (const child of childrenOf.get(id) ?? []) merge(rollup(child));
    rolled.set(id, acc);
    return acc;
  };

  const out: OxTreeRow[] = [];
  const emit = (id: string, depth: number) => {
    const meta = metaById.get(id);
    const byCt = rollup(id);
    const cells: Record<string, OxCell> = {};
    let ta = 0;
    let tc = 0;
    for (const [ct, b] of byCt) {
      cells[ct] = mkCell(b.attempts, b.correct, minAttempts);
      ta += b.attempts;
      tc += b.correct;
    }
    const kids = childrenOf.get(id) ?? [];
    out.push({
      nodeId: id,
      label:
        meta?.label ??
        options.fallbackLabel?.get(id) ??
        "(라벨 없음)",
      lawCode: meta?.lawCode ?? options.fallbackLawCode?.get(id) ?? null,
      depth,
      parentId: parentInTree.get(id) ?? null,
      hasChildren: kids.length > 0,
      cells,
      total: mkCell(ta, tc, minAttempts),
    });
    for (const child of kids) emit(child, depth + 1);
  };
  for (const root of childrenOf.get(null) ?? []) emit(root, 0);

  // 기타(귀속 실패) — 말미 평면 행.
  const other = leafCells.get("null");
  if (other) {
    const cells: Record<string, OxCell> = {};
    let ta = 0;
    let tc = 0;
    for (const [ct, b] of other) {
      cells[ct] = mkCell(b.attempts, b.correct, minAttempts);
      ta += b.attempts;
      tc += b.correct;
    }
    out.push({
      nodeId: null,
      label: "기타",
      lawCode: null,
      depth: 0,
      parentId: null,
      hasChildren: false,
      cells,
      total: mkCell(ta, tc, minAttempts),
    });
  }
  return out;
}

/**
 * 한 학생의 OX 지문 누적 진단. 세션 무관 전역 집계.
 * 데이터 0 이면 빈 결과(크래시 없음). 합격자 코호트 비교는 본 함수를 코호트별·윈도우별로
 * 호출하는 래퍼로 미래에 구성(현재 미구현 — feat-2-022 §5).
 * client 는 학생 화면=본인 RLS 클라이언트, 강사 화면=adminClient(RLS 우회) 를 넘긴다.
 */
export async function computeOxDiagnosis(
  client: SupabaseClient<Database>,
  userId: string,
  options: OxDiagnosisOptions = {},
): Promise<OxDiagnosis> {
  const dedup = options.dedup ?? "latest";
  const minAttempts = OX_DIAGNOSIS_MIN_ATTEMPTS;
  const emptyMeta: OxRefMeta = {
    ctByRef: new Map(),
    nodeByProblem: new Map(),
    labelByNode: new Map(),
    lawCodeByNode: new Map(),
  };

  // 1) OX attempts.
  let q = client
    .from("user_problem_attempts")
    .select(
      "problem_id, selected_choice_id, selected_box_item_id, is_correct, attempted_at",
    )
    .eq("user_id", userId)
    .not("ox_answer", "is", null)
    .order("attempted_at", { ascending: false })
    .limit(options.maxRows ?? 50000);
  if (options.since) q = q.gte("attempted_at", options.since);
  if (options.until) q = q.lte("attempted_at", options.until);
  const { data: rows, error } = await q;
  if (error) throw error;
  if (!rows || rows.length === 0)
    return buildOxDiagnosis([], emptyMeta, { dedup, minAttempts });

  // 2) 해석 사전(meta) — 행에 등장하는 ref/problem 전체 대상.
  const choiceIds = [
    ...new Set(
      rows
        .map((r) => r.selected_choice_id)
        .filter((v): v is string => !!v),
    ),
  ];
  const boxIds = [
    ...new Set(
      rows
        .map((r) => r.selected_box_item_id)
        .filter((v): v is string => !!v),
    ),
  ];
  const problemIds = [...new Set(rows.map((r) => r.problem_id))];

  const ctByRef = new Map<string, ProblemChoiceType | null>();
  const articleByProblem = new Map<string, string | null>();
  const pinnedNodeByProblem = new Map<string, string | null>();

  await Promise.all([
    (async () => {
      for (let i = 0; i < choiceIds.length; i += CHUNK) {
        const slice = choiceIds.slice(i, i + CHUNK);
        const { data } = await client
          .from("problem_choices")
          .select("choice_id, choice_type")
          .in("choice_id", slice);
        for (const c of data ?? [])
          ctByRef.set(`choice:${c.choice_id}`, c.choice_type ?? null);
      }
    })(),
    (async () => {
      for (let i = 0; i < boxIds.length; i += CHUNK) {
        const slice = boxIds.slice(i, i + CHUNK);
        const { data } = await client
          .from("problem_box_items")
          .select("box_item_id, choice_type")
          .in("box_item_id", slice);
        for (const b of data ?? [])
          ctByRef.set(`box:${b.box_item_id}`, b.choice_type ?? null);
      }
    })(),
    (async () => {
      for (let i = 0; i < problemIds.length; i += CHUNK) {
        const slice = problemIds.slice(i, i + CHUNK);
        const { data } = await client
          .from("problems")
          .select("problem_id, primary_article_id, primary_node_id")
          .in("problem_id", slice);
        for (const p of data ?? []) {
          articleByProblem.set(p.problem_id, p.primary_article_id);
          pinnedNodeByProblem.set(p.problem_id, p.primary_node_id);
        }
      }
    })(),
  ]);

  // article → node[] (문제→노드 귀속 규칙 SSOT. 폴백 'first' = 기존 첫째-노드 동작 보존).
  //   articleIds 는 아래 조문(법전) 기준 트리 뷰에서도 재사용.
  const articleIds = [
    ...new Set(
      [...articleByProblem.values()].filter((v): v is string => !!v),
    ),
  ];
  const articleToNodes = await buildArticleToNodes(client, articleIds);
  const nodeByProblem = new Map<string, string | null>();
  for (const pid of problemIds) {
    const nodes = attributeProblemNodes(
      {
        primary_node_id: pinnedNodeByProblem.get(pid) ?? null,
        primary_article_id: articleByProblem.get(pid) ?? null,
      },
      articleToNodes,
      { fallbackMultiplicity: "first" },
    );
    nodeByProblem.set(pid, nodes[0] ?? null);
  }

  // node 라벨 + 과목(deep-link 용) + 트리 메타(부모 폐쇄까지 반복 조회 — 깊이 유한).
  const nodeIds = [
    ...new Set([...nodeByProblem.values()].filter((v): v is string => !!v)),
  ];
  const labelByNode = new Map<string, string>();
  const lawCodeByNode = new Map<string, string>();
  const nodeMeta = new Map<string, OxNodeMetaRow>();
  let pending = nodeIds;
  for (let round = 0; pending.length > 0 && round < 20; round++) {
    const fetched: string[] = [];
    for (let i = 0; i < pending.length; i += CHUNK) {
      const slice = pending.slice(i, i + CHUNK);
      const { data } = await client
        .from("systematic_nodes")
        .select("node_id, parent_id, path, display_label, law_code")
        .in("node_id", slice);
      for (const n of data ?? []) {
        labelByNode.set(n.node_id, n.display_label);
        lawCodeByNode.set(n.node_id, n.law_code);
        nodeMeta.set(n.node_id, {
          nodeId: n.node_id,
          parentId: n.parent_id,
          label: n.display_label,
          lawCode: n.law_code,
          path: String(n.path ?? ""),
        });
        if (n.parent_id) fetched.push(n.parent_id);
      }
    }
    pending = [...new Set(fetched)].filter((id) => !nodeMeta.has(id));
  }

  const diagnosis = buildOxDiagnosis(
    rows,
    { ctByRef, nodeByProblem, labelByNode, lawCodeByNode },
    { dedup, minAttempts },
  );
  diagnosis.tree = buildOxDiagnosisTree(diagnosis.cross, [...nodeMeta.values()], {
    minAttempts,
    fallbackLabel: labelByNode,
    fallbackLawCode: lawCodeByNode,
  });

  // ── 조문(법전) 기준 트리 — 전 과목 동일 기준(체계도 없는 민법 포함) 토글 뷰 ──
  // 조문의 조상 폐쇄를 조회해 문제를 가장 가까운 그룹(편/장/절)에 귀속시킨다.
  interface ArtMeta {
    parentId: string | null;
    label: string;
    level: string;
    path: string;
    lawId: string;
  }
  const artMeta = new Map<string, ArtMeta>();
  let pendingArt = articleIds;
  for (let round = 0; pendingArt.length > 0 && round < 12; round++) {
    const fetched: string[] = [];
    for (let i = 0; i < pendingArt.length; i += CHUNK) {
      const slice = pendingArt.slice(i, i + CHUNK);
      const { data } = await client
        .from("articles")
        .select("article_id, parent_id, path, display_label, level, law_id")
        .in("article_id", slice);
      for (const a of data ?? []) {
        artMeta.set(a.article_id, {
          parentId: a.parent_id,
          label: a.display_label,
          level: a.level,
          path: String(a.path ?? ""),
          lawId: a.law_id,
        });
        if (a.parent_id) fetched.push(a.parent_id);
      }
    }
    pendingArt = [...new Set(fetched)].filter((id) => !artMeta.has(id));
  }
  const lawIds = [...new Set([...artMeta.values()].map((a) => a.lawId))];
  const lawCodeByLawId = new Map<string, string>();
  if (lawIds.length > 0) {
    const { data } = await client
      .from("laws")
      .select("law_id, law_code")
      .in("law_id", lawIds);
    for (const l of data ?? []) lawCodeByLawId.set(l.law_id, l.law_code);
  }
  // 매트릭스 행 단위 = 그룹(편/장/절)만 — 조 단위(수백 행)는 과함.
  const GROUP_LEVELS = new Set(["part", "chapter", "section"]);
  const groupByProblem = new Map<string, string | null>();
  for (const pid of problemIds) {
    let cur = articleByProblem.get(pid) ?? null;
    let group: string | null = null;
    for (let guard = 0; cur && guard < 12; guard++) {
      const m = artMeta.get(cur);
      if (!m) break;
      if (GROUP_LEVELS.has(m.level)) {
        group = cur;
        break;
      }
      cur = m.parentId;
    }
    groupByProblem.set(pid, group);
  }
  const groupLabel = new Map<string, string>();
  const groupLawCode = new Map<string, string>();
  const groupMetaRows: OxNodeMetaRow[] = [];
  for (const [id, m] of artMeta) {
    if (!GROUP_LEVELS.has(m.level)) continue;
    // 그룹의 트리 부모는 그룹인 경우만 연결(조문 부모는 루트 취급 — 방어).
    const parentIsGroup =
      !!m.parentId && GROUP_LEVELS.has(artMeta.get(m.parentId)?.level ?? "");
    const lawCode = lawCodeByLawId.get(m.lawId) ?? "";
    groupMetaRows.push({
      nodeId: id,
      parentId: parentIsGroup ? m.parentId : null,
      label: m.label,
      lawCode,
      path: m.path,
    });
    groupLabel.set(id, m.label);
    groupLawCode.set(id, lawCode);
  }
  const articleDiag = buildOxDiagnosis(
    rows,
    {
      ctByRef,
      nodeByProblem: groupByProblem,
      labelByNode: groupLabel,
      lawCodeByNode: groupLawCode,
    },
    { dedup, minAttempts },
  );
  diagnosis.articleTree = buildOxDiagnosisTree(articleDiag.cross, groupMetaRows, {
    minAttempts,
    fallbackLabel: groupLabel,
    fallbackLawCode: groupLawCode,
  });
  return diagnosis;
}
