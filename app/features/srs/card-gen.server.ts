// feat-2-023 / feat-2-023b — 암기 카드(SRS v2) 인앱 생성 엔진.
// 조문(articles)·판례(cases) → srs_items(type='qa') 전역 풀(공유). 멱등(소스 기준) +
// dry-run(previewCards) + 소프트삭제 + in-place 갱신(updateExisting — item_id 보존).
//
// 판례 카드(feat-2-023b): front = 〔표준 인용(법원·선고일·번호·★사건유형)〕 + 〔쟁점 질문〕,
// back = 그 쟁점의 결론·법리(요지, cap 1500). 경계: 조문 문구 cloze 는 빈칸 시스템 담당.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import { buildCitation } from "~/features/cases/labels";
import {
  composeCaseFront,
  composeCaseTopic,
} from "~/features/srs/lib/case-card";
import { flattenBodyForCard } from "~/features/srs/lib/srs-flatten";
import { flattenMarkdownForCard } from "~/features/srs/lib/srs-markdown";
import {
  LAW_SUBJECTS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

type Client = SupabaseClient<Database>;

export type CardSourceType = "article" | "case";

// 조문 전문 보존 — 학생 요청(짤림 수정). 실측 site max 16,672자라 20000 은 사실상 무제한.
//   과거 600 은 긴 절차 조문을 문장 중간에서 잘라 노이즈를 만들었다.
const ARTICLE_BACK_MAX = 20000;
// feat-2-023b — 요지 항목 보존. 실측 분포(특허 판례 119항목): median 350·최대 3693자,
// >1500은 5장뿐. 한 쟁점 법리는 더 분할하면 잘리므로 4000으로 상향(현 전량 포함, 잘림 0).
const CASE_BACK_MAX = 4000;

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
  /** 강사 지정 중요도(원본 조문/판례에서 비정규화) — 학생 필터용. */
  importance: number;
  /** 안정 멱등 키 — article:{id} / case:{id}#{idx}. */
  source: string;
  source_type: CardSourceType;
  source_id: string;
}

interface ExistingCard {
  itemId: string;
  front: string;
  back: string;
  importance: number;
}

interface CardGenPlan {
  /** 소스 후보 수(조문/판례 엔티티). */
  candidateCount: number;
  /** 합성된 전체 카드(신규 + 기존). */
  rows: CardRow[];
  /** row.source → 기존 카드(갱신 매칭·진척 보존용 item_id). */
  existing: Map<string, ExistingCard>;
}

export interface CardGenPreview {
  subject: LawSubjectSlug;
  sourceType: CardSourceType;
  importanceMin: number;
  limit: number;
  candidateCount: number;
  /** 신규 삽입될 카드 수. */
  wouldInsert: number;
  /** 기존이지만 front/back 이 달라져 갱신될 카드 수(updateExisting 시). */
  wouldUpdate: number;
  /** 이미 있어 신규 삽입 대상이 아닌 카드 수. */
  skipExisting: number;
  /** back 최대 길이 + 잘림(…) 카드 수 — cap 점검용. */
  maxBackLen: number;
  truncatedCount: number;
  /** 신규 카드 front 미리보기(최대 8). */
  sample: string[];
  /** 갱신 카드 before→after front(최대 5). */
  updateSample: Array<{ before: string; after: string }>;
}

export interface CardGenResult {
  inserted: number;
  updated: number;
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
  if (!law) return { candidateCount: 0, rows: [], existing: new Map() };

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
    return { candidateCount: 0, rows: [], existing: new Map() };

  // 기존 article 카드(멱등 키 article:{id}) — 갱신 매칭용.
  const ids = candidates.map((a) => a.article_id);
  const { data: existRows } = await client
    .from("srs_items")
    .select("item_id, source_id, front, back, importance")
    .eq("source_type", "article")
    .in("source_id", ids);
  const existing = new Map<string, ExistingCard>();
  for (const r of existRows ?? [])
    if (r.source_id)
      existing.set(`article:${r.source_id}`, {
        itemId: r.item_id,
        front: r.front,
        back: r.back,
        importance: r.importance,
      });

  // 본문 일괄 조회(전체 후보 — 신규·기존 모두 합성).
  const revIds = candidates
    .map((a) => a.current_revision_id)
    .filter((x): x is string => x !== null);
  const { data: revs } = await client
    .from("article_revisions")
    .select("revision_id, body_text")
    .in("revision_id", revIds);
  const bodyMap = new Map<string, string>();
  for (const r of revs ?? []) if (r.body_text) bodyMap.set(r.revision_id, r.body_text);

  const rows: CardRow[] = candidates.map((a) => {
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
        a.article_number != null ? `${params.subject}#${a.article_number}` : null,
      importance: a.importance ?? 0,
      source: `article:${a.article_id}`,
      source_type: "article" as const,
      source_id: a.article_id,
    };
  });
  return { candidateCount: candidates.length, rows, existing };
}

/* ── 판례 카드 (쟁점=요지 항목당 1카드, front=인용+쟁점) ──────────── */

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
      "case_id, court, decided_at, case_number, case_type, is_en_banc, case_title, nickname, summary_items, summary_body_md, importance",
    )
    .contains("subject_laws", [params.subject])
    .is("deleted_at", null)
    .gte("importance", params.importanceMin)
    .order("importance", { ascending: false, nullsFirst: false })
    .order("decided_at", { ascending: false, nullsFirst: false })
    .limit(params.limit);
  const candidates = cases ?? [];
  if (candidates.length === 0)
    return { candidateCount: 0, rows: [], existing: new Map() };

  // 기존 case 카드(멱등 키 source=case:{id}#{idx}) — 갱신 매칭용.
  const caseIds = candidates.map((c) => c.case_id);
  const { data: existRows } = await client
    .from("srs_items")
    .select("item_id, source, front, back, importance")
    .eq("source_type", "case")
    .in("source_id", caseIds);
  const existing = new Map<string, ExistingCard>();
  for (const r of existRows ?? [])
    if (r.source)
      existing.set(r.source, {
        itemId: r.item_id,
        front: r.front,
        back: r.back,
        importance: r.importance,
      });

  const rows: CardRow[] = [];
  for (const c of candidates) {
    const citation = buildCitation({
      court: c.court,
      decidedAt: c.decided_at,
      caseNumber: c.case_number,
      caseType: c.case_type,
      isEnBanc: c.is_en_banc ?? false,
    });
    const titleSrc = c.case_title ?? c.nickname ?? null;
    const items = parseSummaryItemsLite(c.summary_items);
    const units: Array<{ key: string; topic: string; md: string }> =
      items.length > 0
        ? items.map((it, idx) => ({
            key: `case:${c.case_id}#${idx}`,
            topic: composeCaseTopic(it.title, titleSrc, idx),
            md: it.body,
          }))
        : c.summary_body_md
          ? [
              {
                key: `case:${c.case_id}#full`,
                topic: "판결요지",
                md: c.summary_body_md,
              },
            ]
          : [];
    for (const u of units) {
      const back = flattenMarkdownForCard(u.md, CASE_BACK_MAX);
      if (!back) continue;
      rows.push({
        subject: params.subject,
        topic: u.topic,
        type: "qa" as const,
        front: composeCaseFront(citation, u.topic),
        back,
        law_ref: null,
        importance: c.importance ?? 0,
        source: u.key,
        source_type: "case" as const,
        source_id: c.case_id,
      });
    }
  }
  return { candidateCount: candidates.length, rows, existing };
}

/* ── 공용 (preview / generate) ─────────────────────────────────────── */

function planCards(client: Client, params: CardGenParams): Promise<CardGenPlan> {
  return params.sourceType === "article"
    ? planArticleCards(client, params)
    : planCaseCards(client, params);
}

function isChanged(ex: ExistingCard, r: CardRow): boolean {
  return (
    ex.front !== r.front || ex.back !== r.back || ex.importance !== r.importance
  );
}

/** dry-run — 신규/갱신 수 + 잘림 점검 + before→after 샘플(미적용). */
export async function previewCards(
  client: Client,
  params: CardGenParams,
): Promise<CardGenPreview> {
  const plan = await planCards(client, params);
  const newRows = plan.rows.filter((r) => !plan.existing.has(r.source));
  const updRows = plan.rows.filter((r) => {
    const ex = plan.existing.get(r.source);
    return ex && isChanged(ex, r);
  });
  const maxBackLen = plan.rows.reduce((m, r) => Math.max(m, r.back.length), 0);
  const truncatedCount = plan.rows.filter((r) => r.back.endsWith("…")).length;
  return {
    subject: params.subject,
    sourceType: params.sourceType,
    importanceMin: params.importanceMin,
    limit: params.limit,
    candidateCount: plan.candidateCount,
    wouldInsert: newRows.length,
    wouldUpdate: updRows.length,
    skipExisting: plan.rows.length - newRows.length,
    maxBackLen,
    truncatedCount,
    sample: newRows.slice(0, 8).map((r) => r.front),
    updateSample: updRows.slice(0, 5).map((r) => ({
      before: plan.existing.get(r.source)?.front ?? "",
      after: r.front,
    })),
  };
}

export interface GenerateOptions {
  /** 신규 카드 insert (기본 true). false = 기존 갱신만. */
  insertNew?: boolean;
  /** 기존 카드 in-place 갱신(item_id 보존, 기본 false). */
  updateExisting?: boolean;
}

/** 실제 생성 — (insertNew) 신규 insert + (updateExisting) 기존 in-place 갱신(item_id 보존). */
export async function generateCards(
  client: Client,
  params: CardGenParams,
  createdBy: string,
  opts: GenerateOptions = {},
): Promise<CardGenResult> {
  const insertNew = opts.insertNew ?? true;
  const updateExisting = opts.updateExisting ?? false;
  const plan = await planCards(client, params);
  const newRows = plan.rows.filter((r) => !plan.existing.has(r.source));

  let inserted = 0;
  if (insertNew && newRows.length > 0) {
    const { error, count } = await client
      .from("srs_items")
      .insert(
        newRows.map((r) => ({ ...r, created_by: createdBy })),
        { count: "exact" },
      );
    if (error) throw error;
    inserted = count ?? newRows.length;
  }

  let updated = 0;
  if (updateExisting) {
    for (const r of plan.rows) {
      const ex = plan.existing.get(r.source);
      if (!ex || !isChanged(ex, r)) continue;
      const { error } = await client
        .from("srs_items")
        .update({
          front: r.front,
          back: r.back,
          topic: r.topic,
          law_ref: r.law_ref,
          importance: r.importance,
        })
        .eq("item_id", ex.itemId);
      if (error) throw error;
      updated += 1;
    }
  }

  // 기존인데 갱신하지 않은 카드 수(변경 없음 또는 update 모드 아님).
  const existingCount = plan.rows.length - newRows.length;
  return { inserted, updated, skipExisting: existingCount - updated };
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
