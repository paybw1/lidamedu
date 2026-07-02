// Q&A 학습분석 — 과목·단원(체계도 노드)별 질문 볼륨 + 질문 수준(상/중/하) 분포
// + AI 정오 평가(verdict) 집계. 강사·스태프 전체 학습현황에서 오답률 약점과 나란히
// "질문이 몰리는 단원 = 학생들이 어려워하는 단원" 신호를 준다. manager+ 전용.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";
import {
  LAW_SUBJECTS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import { QNA_SUBJECT_LABEL, type QnaSubject } from "./labels";

export interface QnaNodeStat {
  /** null = 단원 미지정(공부방법·일반·과학 등 노드 없는 질문). */
  nodeId: string | null;
  subject: string | null;
  lawCode: string | null;
  lawName: string;
  displayLabel: string;
  total: number;
  high: number;
  mid: number;
  low: number;
  /** 질문 수준 미평가(미답 포함). */
  ungraded: number;
  answered: number;
  open: number;
  /** AI 정오 평가 — 강사가 정확/부정확 매긴 AI 답변 수. */
  aiCorrect: number;
  aiIncorrect: number;
}

export interface QnaAnalyticsResult {
  totalThreads: number;
  gradedThreads: number;
  nodes: QnaNodeStat[];
  /** nodeId → 질문 수 (약점 단원 행 배지용). */
  byNodeId: Record<string, number>;
}

function subjectLawName(subject: string | null): string {
  if (!subject) return "미분류";
  const meta = LAW_SUBJECTS[subject as LawSubjectSlug];
  if (meta) return meta.name;
  return QNA_SUBJECT_LABEL[subject as QnaSubject] ?? subject;
}

interface Bucket {
  nodeId: string | null;
  subject: string | null;
  total: number;
  high: number;
  mid: number;
  low: number;
  ungraded: number;
  answered: number;
  open: number;
  aiCorrect: number;
  aiIncorrect: number;
}

const NONE_PREFIX = "__none__:";
function bucketKey(nodeId: string | null, subject: string | null): string {
  return nodeId ?? `${NONE_PREFIX}${subject ?? "unknown"}`;
}

export async function getQnaAnalyticsByNode(opts?: {
  limit?: number;
}): Promise<QnaAnalyticsResult> {
  const admin = adminClient as SupabaseClient<Database>;
  const limit = opts?.limit ?? 20;

  const { data: threads, error } = await admin
    .from("qna_threads")
    .select("thread_id, subject, node_id, quality_grade, status")
    .is("deleted_at", null);
  if (error || !threads) {
    return { totalThreads: 0, gradedThreads: 0, nodes: [], byNodeId: {} };
  }

  const buckets = new Map<string, Bucket>();
  const threadKey = new Map<string, string>();
  let gradedThreads = 0;

  for (const t of threads) {
    const key = bucketKey(t.node_id, t.subject);
    threadKey.set(t.thread_id, key);
    let b = buckets.get(key);
    if (!b) {
      b = {
        nodeId: t.node_id,
        subject: t.subject,
        total: 0,
        high: 0,
        mid: 0,
        low: 0,
        ungraded: 0,
        answered: 0,
        open: 0,
        aiCorrect: 0,
        aiIncorrect: 0,
      };
      buckets.set(key, b);
    }
    b.total += 1;
    if (t.quality_grade === "high") b.high += 1;
    else if (t.quality_grade === "mid") b.mid += 1;
    else if (t.quality_grade === "low") b.low += 1;
    else b.ungraded += 1;
    if (t.quality_grade) gradedThreads += 1;
    if (t.status === "open") b.open += 1;
    else b.answered += 1;
  }

  // AI 정오 평가(verdict) — AI 메시지에 강사가 매긴 정확/부정확을 스레드 노드로 귀속.
  const { data: verdicts } = await admin
    .from("qna_messages")
    .select("thread_id, verdict")
    .not("verdict", "is", null);
  for (const m of verdicts ?? []) {
    const key = threadKey.get(m.thread_id);
    if (!key) continue;
    const b = buckets.get(key);
    if (!b) continue;
    if (m.verdict === "correct") b.aiCorrect += 1;
    else if (m.verdict === "incorrect") b.aiIncorrect += 1;
  }

  // 노드 라벨/과목 해석.
  const nodeIds = [...buckets.values()]
    .map((b) => b.nodeId)
    .filter((id): id is string => id != null);
  const nodeMeta = new Map<string, { label: string; lawCode: string }>();
  if (nodeIds.length > 0) {
    const { data: nodes } = await admin
      .from("systematic_nodes")
      .select("node_id, display_label, law_code")
      .in("node_id", nodeIds);
    for (const n of nodes ?? []) {
      nodeMeta.set(n.node_id, {
        label: n.display_label,
        lawCode: n.law_code,
      });
    }
  }

  const byNodeId: Record<string, number> = {};
  const rows: QnaNodeStat[] = [...buckets.values()].map((b) => {
    const meta = b.nodeId ? nodeMeta.get(b.nodeId) : undefined;
    const lawCode = meta?.lawCode ?? b.subject ?? null;
    if (b.nodeId) byNodeId[b.nodeId] = b.total;
    return {
      nodeId: b.nodeId,
      subject: b.subject,
      lawCode,
      lawName: subjectLawName(lawCode),
      displayLabel: meta?.label ?? "단원 미지정",
      total: b.total,
      high: b.high,
      mid: b.mid,
      low: b.low,
      ungraded: b.ungraded,
      answered: b.answered,
      open: b.open,
      aiCorrect: b.aiCorrect,
      aiIncorrect: b.aiIncorrect,
    };
  });
  rows.sort((a, b) => b.total - a.total);

  return {
    totalThreads: threads.length,
    gradedThreads,
    nodes: rows.slice(0, limit),
    byNodeId,
  };
}
