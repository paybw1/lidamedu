// feat-2-023 — 암기 카드(SRS v2) 인앱 생성 엔진.
// 조문(articles)·판례(cases) → srs_items(type='qa') 전역 풀(공유). 운영자 1회 생성으로
// 전 학생이 /srs 에서 사용. 멱등(소스 기준 skip) + dry-run(previewCards) + 소프트삭제.
//
// 경계(중복 회피): 조문 "핵심 문구 cloze 암기"는 빈칸 시스템(article_blank_sets)이 담당.
// 본 카드(qa)는 조문 통독형(식별자→본문)·판례 이해형(사건/쟁점→요지)으로 차별화한다.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import { flattenBodyForCard } from "~/features/srs/lib/srs-flatten";
import { flattenMarkdownForCard } from "~/features/srs/lib/srs-markdown";
import {
  LAW_SUBJECTS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

type Client = SupabaseClient<Database>;

export type CardSourceType = "article" | "case";

const ARTICLE_BACK_MAX = 600;
const CASE_BACK_MAX = 600;

export interface CardGenParams {
  subject: LawSubjectSlug;
  sourceType: CardSourceType;
  /** importance >= 이 값인 소스만. */
  importanceMin: number;
  /** 소스 엔티티(조문 수 / 판례 수) 상한. */
  limit: number;
}

interface CardRow {
  subject: string;
  topic: string | null;
  type: "qa";
  front: string;
  back: string;
  law_ref: string | null;
  /** 안정 멱등 키 — article:{id} / case:{id}#{idx}. */
  source: string;
  source_type: CardSourceType;
  source_id: string;
}

interface CardGenPlan {
  /** 소스 후보 수(조문/판례 엔티티). */
  candidateCount: number;
  newRows: CardRow[];
  /** 이미 있어 skip 한 카드 수. */
  skipExisting: number;
}

export interface CardGenPreview {
  subject: LawSubjectSlug;
  sourceType: CardSourceType;
  importanceMin: number;
  limit: number;
  candidateCount: number;
  wouldInsert: number;
  skipExisting: number;
  /** 생성될 카드 front 미리보기(최대 8). */
  sample: string[];
}

export interface CardGenResult {
  inserted: number;
  skipExisting: number;
}

/* ── 조문 카드 ─────────────────────────────────────────────────────── */

async function planArticleCards(
  client: Client,
  params: CardGenParams,
): Promise<CardGenPlan> {
  const subjectName = LAW_SUBJECTS[params.subject].name;
  const { data: law } = await client
    .from("laws")
    .select("law_id")
    .eq("law_code", params.subject)
    .maybeSingle();
  if (!law) return { candidateCount: 0, newRows: [], skipExisting: 0 };

  const { data: arts } = await client
    .from("articles")
    .select(
      "article_id, article_number, display_label, importance, current_revision_id",
    )
    .eq("law_id", law.law_id)
    .eq("level", "article")
    .is("deleted_at", null)
    .not("current_revision_id", "is", null)
    .gte("importance", params.importanceMin)
    .order("importance", { ascending: false, nullsFirst: false })
    .limit(params.limit);
  const candidates = arts ?? [];
  if (candidates.length === 0)
    return { candidateCount: 0, newRows: [], skipExisting: 0 };

  // 멱등 — 기존 article 카드(source_id=article_id) skip.
  const ids = candidates.map((a) => a.article_id);
  const { data: existing } = await client
    .from("srs_items")
    .select("source_id")
    .eq("source_type", "article")
    .in("source_id", ids);
  const existingIds = new Set(
    (existing ?? []).map((r) => r.source_id).filter(Boolean) as string[],
  );

  const fresh = candidates.filter((a) => !existingIds.has(a.article_id));
  const skipExisting = candidates.length - fresh.length;
  if (fresh.length === 0)
    return { candidateCount: candidates.length, newRows: [], skipExisting };

  // 본문 일괄 조회.
  const revIds = fresh
    .map((a) => a.current_revision_id)
    .filter((x): x is string => x !== null);
  const { data: revs } = await client
    .from("article_revisions")
    .select("revision_id, body_text")
    .in("revision_id", revIds);
  const bodyMap = new Map<string, string>();
  for (const r of revs ?? []) if (r.body_text) bodyMap.set(r.revision_id, r.body_text);

  const newRows: CardRow[] = fresh.map((a) => {
    const label =
      a.display_label ??
      (a.article_number != null ? `제${a.article_number}조` : "조문");
    const raw = a.current_revision_id
      ? (bodyMap.get(a.current_revision_id) ?? null)
      : null;
    const flat = raw ? flattenBodyForCard(raw) : null;
    let back = flat ?? raw ?? "(본문 미수록 — 조문 학습 화면에서 확인)";
    if (back.length > ARTICLE_BACK_MAX)
      back = back.slice(0, ARTICLE_BACK_MAX).trimEnd() + "…";
    return {
      subject: params.subject,
      topic: label,
      type: "qa" as const,
      front: `${subjectName} ${label}`,
      back,
      law_ref:
        a.article_number != null
          ? `${params.subject}#${a.article_number}`
          : null,
      source: `article:${a.article_id}`,
      source_type: "article" as const,
      source_id: a.article_id,
    };
  });
  return { candidateCount: candidates.length, newRows, skipExisting };
}

/* ── 판례 카드 (쟁점=요지 항목당 1카드) ───────────────────────────── */

interface LiteSummaryItem {
  title: string;
  body: string;
}

function parseSummaryItemsLite(raw: unknown): LiteSummaryItem[] {
  if (!Array.isArray(raw)) return [];
  const out: LiteSummaryItem[] = [];
  for (const it of raw) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    if (typeof o.title === "string" && typeof o.body === "string")
      out.push({ title: o.title, body: o.body });
  }
  return out;
}

async function planCaseCards(
  client: Client,
  params: CardGenParams,
): Promise<CardGenPlan> {
  const { data: cases } = await client
    .from("cases")
    .select(
      "case_id, case_title, nickname, summary_items, summary_body_md, importance",
    )
    .contains("subject_laws", [params.subject])
    .is("deleted_at", null)
    .gte("importance", params.importanceMin)
    .order("importance", { ascending: false, nullsFirst: false })
    .order("decided_at", { ascending: false, nullsFirst: false })
    .limit(params.limit);
  const candidates = cases ?? [];
  if (candidates.length === 0)
    return { candidateCount: 0, newRows: [], skipExisting: 0 };

  // 멱등 — 기존 case 카드의 source 키(case:{id}#{idx}) skip.
  const caseIds = candidates.map((c) => c.case_id);
  const { data: existing } = await client
    .from("srs_items")
    .select("source")
    .eq("source_type", "case")
    .in("source_id", caseIds);
  const existingKeys = new Set(
    (existing ?? []).map((r) => r.source).filter(Boolean) as string[],
  );

  const newRows: CardRow[] = [];
  let skipExisting = 0;
  for (const c of candidates) {
    const title = c.case_title ?? c.nickname ?? "(제목 없음)";
    const items = parseSummaryItemsLite(c.summary_items);
    // summary_items 있으면 쟁점당 1카드, 없으면 summary_body_md 로 1카드 폴백.
    const units: Array<{ key: string; topic: string; front: string; md: string }> =
      items.length > 0
        ? items.map((it, idx) => ({
            key: `case:${c.case_id}#${idx}`,
            topic: it.title,
            front: `${title} — ${it.title}`,
            md: it.body,
          }))
        : c.summary_body_md
          ? [
              {
                key: `case:${c.case_id}#full`,
                topic: "판결요지",
                front: `${title} — 판결요지`,
                md: c.summary_body_md,
              },
            ]
          : [];
    for (const u of units) {
      if (existingKeys.has(u.key)) {
        skipExisting += 1;
        continue;
      }
      const back = flattenMarkdownForCard(u.md, CASE_BACK_MAX);
      if (!back) continue; // 평탄화 후 빈 본문 — skip(무음 아님: candidateCount 로 드러남).
      newRows.push({
        subject: params.subject,
        topic: u.topic,
        type: "qa" as const,
        front: u.front,
        back,
        law_ref: null,
        source: u.key,
        source_type: "case" as const,
        source_id: c.case_id,
      });
    }
  }
  return { candidateCount: candidates.length, newRows, skipExisting };
}

/* ── 공용 (preview / generate) ─────────────────────────────────────── */

function planCards(client: Client, params: CardGenParams): Promise<CardGenPlan> {
  return params.sourceType === "article"
    ? planArticleCards(client, params)
    : planCaseCards(client, params);
}

/** dry-run — 생성하지 않고 몇 장 생성될지(+미리보기) 만 계산. */
export async function previewCards(
  client: Client,
  params: CardGenParams,
): Promise<CardGenPreview> {
  const plan = await planCards(client, params);
  return {
    subject: params.subject,
    sourceType: params.sourceType,
    importanceMin: params.importanceMin,
    limit: params.limit,
    candidateCount: plan.candidateCount,
    wouldInsert: plan.newRows.length,
    skipExisting: plan.skipExisting,
    sample: plan.newRows.slice(0, 8).map((r) => r.front),
  };
}

/** 실제 생성 — 신규 카드만 insert(멱등). created_by 기록. */
export async function generateCards(
  client: Client,
  params: CardGenParams,
  createdBy: string,
): Promise<CardGenResult> {
  const plan = await planCards(client, params);
  if (plan.newRows.length === 0)
    return { inserted: 0, skipExisting: plan.skipExisting };
  const rows = plan.newRows.map((r) => ({ ...r, created_by: createdBy }));
  const { error, count } = await client
    .from("srs_items")
    .insert(rows, { count: "exact" });
  if (error) throw error;
  return { inserted: count ?? rows.length, skipExisting: plan.skipExisting };
}

/* ── 풀 현황 / 최근 카드 / 소프트삭제 ─────────────────────────────── */

export interface PoolStatRow {
  subject: string;
  sourceType: string;
  count: number;
}

export async function getCardPoolStats(client: Client): Promise<PoolStatRow[]> {
  const { data } = await client
    .from("srs_items")
    .select("subject, source_type")
    .is("deleted_at", null)
    .limit(10000);
  const map = new Map<string, number>();
  for (const r of data ?? []) {
    const key = `${r.subject}|${r.source_type ?? "manual"}`;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([k, count]) => {
      const [subject, sourceType] = k.split("|");
      return { subject, sourceType, count };
    })
    .sort(
      (a, b) =>
        a.subject.localeCompare(b.subject) ||
        a.sourceType.localeCompare(b.sourceType),
    );
}

export interface RecentCard {
  itemId: string;
  front: string;
  subject: string;
  sourceType: string | null;
  createdAt: string;
}

export async function listRecentCards(
  client: Client,
  limit = 30,
): Promise<RecentCard[]> {
  const { data } = await client
    .from("srs_items")
    .select("item_id, front, subject, source_type, created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => ({
    itemId: r.item_id,
    front: r.front,
    subject: r.subject,
    sourceType: r.source_type,
    createdAt: r.created_at,
  }));
}

export async function softDeleteCard(
  client: Client,
  itemId: string,
): Promise<void> {
  const { error } = await client
    .from("srs_items")
    .update({ deleted_at: new Date().toISOString() })
    .eq("item_id", itemId);
  if (error) throw error;
}
