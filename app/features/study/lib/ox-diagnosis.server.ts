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
  /** (100-정답률)*log10(시도+1). belowThreshold 면 0. weak-nodes 와 동일 공식. */
  weaknessScore: number;
}

export interface OxCrossCell extends OxCell {
  nodeId: string | null;
  choiceType: ProblemChoiceType | null;
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
    minAttempts,
    dedup,
  };
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

  // article → node (primary_node_id 없을 때 fallback).
  const articleIds = [
    ...new Set(
      [...articleByProblem.values()].filter((v): v is string => !!v),
    ),
  ];
  const nodeByArticle = new Map<string, string>();
  for (let i = 0; i < articleIds.length; i += CHUNK) {
    const slice = articleIds.slice(i, i + CHUNK);
    const { data } = await client
      .from("article_systematic_links")
      .select("article_id, node_id")
      .in("article_id", slice);
    for (const l of data ?? [])
      if (!nodeByArticle.has(l.article_id))
        nodeByArticle.set(l.article_id, l.node_id);
  }
  const nodeByProblem = new Map<string, string | null>();
  for (const pid of problemIds) {
    const pinned = pinnedNodeByProblem.get(pid) ?? null;
    if (pinned) {
      nodeByProblem.set(pid, pinned);
      continue;
    }
    const aid = articleByProblem.get(pid) ?? null;
    nodeByProblem.set(pid, aid ? (nodeByArticle.get(aid) ?? null) : null);
  }

  // node 라벨.
  const nodeIds = [
    ...new Set([...nodeByProblem.values()].filter((v): v is string => !!v)),
  ];
  const labelByNode = new Map<string, string>();
  for (let i = 0; i < nodeIds.length; i += CHUNK) {
    const slice = nodeIds.slice(i, i + CHUNK);
    const { data } = await client
      .from("systematic_nodes")
      .select("node_id, display_label")
      .in("node_id", slice);
    for (const n of data ?? []) labelByNode.set(n.node_id, n.display_label);
  }

  return buildOxDiagnosis(rows, { ctByRef, nodeByProblem, labelByNode }, {
    dedup,
    minAttempts,
  });
}
