// feat-7-036 시드 import dry-run — CSV 일괄 정정의 dry-run preview + apply.
// 시드 v1 범위: articles.importance / cases.importance 일괄 정정.
// 형식: CSV 헤더 첫 줄 = (law_code,article_number,importance) 또는 (case_number,importance).
//
// 모든 다건 변경은 dry-run preview → 사용자 승인 후 apply 흐름. Non-negotiable §8 준수.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";
import { logAuditEvent } from "~/features/admin/queries/audit-log.server";

export type SeedEntity = "article_importance" | "case_importance";

export interface SeedDiffRow {
  /** UI 표시용 식별자 (예: "patent §29" 또는 사건번호). */
  key: string;
  /** matched DB row id, null = 매칭 실패. */
  dbId: string | null;
  /** 현재 값. */
  currentValue: number | null;
  /** CSV 신규 값. */
  newValue: number;
  /** 분류. */
  status: "unchanged" | "changed" | "not_found" | "invalid";
  /** 오류 사유 (invalid·not_found 일 때만). */
  note?: string;
}

export interface SeedDiffResult {
  entity: SeedEntity;
  rows: SeedDiffRow[];
  changedCount: number;
  unchangedCount: number;
  notFoundCount: number;
  invalidCount: number;
}

/* ── CSV 파서 ─────────────────────────────────────────────────────────── */

interface ParsedLine {
  raw: string;
  cells: string[];
}

function parseCsv(input: string): ParsedLine[] {
  const lines = input
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("#"));
  return lines.map((raw) => ({
    raw,
    cells: raw.split(",").map((c) => c.trim()),
  }));
}

function parseImportance(s: string): number | null {
  if (!/^-?\d+$/.test(s)) return null;
  const n = Number(s);
  if (n < 0 || n > 5) return null;
  return n;
}

/* ── articles.importance ─────────────────────────────────────────────── */

export async function previewArticleImportance(
  client: SupabaseClient<Database>,
  csv: string,
): Promise<SeedDiffResult> {
  const lines = parseCsv(csv);
  // 첫 줄이 헤더면 skip.
  const dataLines =
    lines[0] &&
    lines[0].cells[0]?.toLowerCase() === "law_code" &&
    lines[0].cells[1]?.toLowerCase().includes("article")
      ? lines.slice(1)
      : lines;

  const rows: SeedDiffRow[] = [];

  // batch lookup
  const lookup = new Map<string, { id: string; importance: number | null }>();
  const keys: Array<{ lawCode: string; articleNumber: string }> = [];

  const draftRows: Array<{
    key: string;
    lawCode: string;
    articleNumber: string;
    newValue: number | null;
    note?: string;
  }> = dataLines.map((line) => {
    const [lawCode, articleNumber, importanceRaw] = line.cells;
    const key = `${lawCode ?? ""} ${articleNumber ?? ""}`.trim() || line.raw;
    if (!lawCode || !articleNumber || importanceRaw === undefined) {
      return {
        key,
        lawCode: lawCode ?? "",
        articleNumber: articleNumber ?? "",
        newValue: null,
        note: "컬럼 누락 (law_code,article_number,importance)",
      };
    }
    const newValue = parseImportance(importanceRaw);
    if (newValue === null) {
      return {
        key,
        lawCode,
        articleNumber,
        newValue: null,
        note: `importance 는 0~5 정수 (입력: "${importanceRaw}")`,
      };
    }
    keys.push({ lawCode, articleNumber });
    return { key, lawCode, articleNumber, newValue };
  });

  // 일괄 조회 — law_code → law_id 변환 후 (law_id, article_number) 매칭.
  if (keys.length > 0) {
    const uniqueLawCodes = [...new Set(keys.map((k) => k.lawCode))];
    const { data: laws } = await client
      .from("laws")
      .select("law_id, law_code")
      .in("law_code", uniqueLawCodes);
    const lawIdByCode = new Map(
      (laws ?? []).map((l) => [l.law_code, l.law_id]),
    );

    // 단순화 — 한 번에 전체 조회 후 메모리 매칭.
    const lawIds = [...lawIdByCode.values()];
    const { data: arts } = await client
      .from("articles")
      .select("article_id, law_id, article_number, importance")
      .in("law_id", lawIds.length > 0 ? lawIds : ["00000000-0000-0000-0000-000000000000"])
      .eq("level", "article")
      .is("deleted_at", null);
    for (const a of arts ?? []) {
      const lawCode = [...lawIdByCode.entries()].find(
        ([, id]) => id === a.law_id,
      )?.[0];
      if (!lawCode) continue;
      lookup.set(`${lawCode}|${a.article_number}`, {
        id: a.article_id,
        importance: a.importance,
      });
    }
  }

  for (const d of draftRows) {
    if (d.newValue === null) {
      rows.push({
        key: d.key,
        dbId: null,
        currentValue: null,
        newValue: -1,
        status: "invalid",
        note: d.note,
      });
      continue;
    }
    const found = lookup.get(`${d.lawCode}|${d.articleNumber}`);
    if (!found) {
      rows.push({
        key: d.key,
        dbId: null,
        currentValue: null,
        newValue: d.newValue,
        status: "not_found",
        note: `해당 조문이 없습니다.`,
      });
      continue;
    }
    rows.push({
      key: d.key,
      dbId: found.id,
      currentValue: found.importance,
      newValue: d.newValue,
      status: found.importance === d.newValue ? "unchanged" : "changed",
    });
  }

  return summarize("article_importance", rows);
}

export async function applyArticleImportance(
  csv: string,
  actorId: string,
): Promise<{ applied: number; skipped: number }> {
  const client = adminClient as SupabaseClient<Database>;
  const preview = await previewArticleImportance(client, csv);
  let applied = 0;
  for (const r of preview.rows) {
    if (r.status !== "changed" || !r.dbId) continue;
    const { error } = await client
      .from("articles")
      .update({ importance: r.newValue })
      .eq("article_id", r.dbId);
    if (!error) applied += 1;
  }
  await logAuditEvent({
    actorId,
    action: "article.importance.bulk_update",
    entityType: "article",
    entityId: "bulk",
    metadata: {
      attempted: preview.changedCount,
      applied,
    },
  });
  return { applied, skipped: preview.rows.length - applied };
}

/* ── cases.importance ────────────────────────────────────────────────── */

export async function previewCaseImportance(
  client: SupabaseClient<Database>,
  csv: string,
): Promise<SeedDiffResult> {
  const lines = parseCsv(csv);
  const dataLines =
    lines[0] && lines[0].cells[0]?.toLowerCase() === "case_number"
      ? lines.slice(1)
      : lines;

  const rows: SeedDiffRow[] = [];
  const lookup = new Map<string, { id: string; importance: number | null }>();
  const numbers: string[] = [];

  const draftRows: Array<{
    key: string;
    caseNumber: string;
    newValue: number | null;
    note?: string;
  }> = dataLines.map((line) => {
    const [caseNumber, importanceRaw] = line.cells;
    const key = (caseNumber ?? "").trim() || line.raw;
    if (!caseNumber || importanceRaw === undefined) {
      return {
        key,
        caseNumber: caseNumber ?? "",
        newValue: null,
        note: "컬럼 누락 (case_number,importance)",
      };
    }
    const newValue = parseImportance(importanceRaw);
    if (newValue === null) {
      return {
        key,
        caseNumber,
        newValue: null,
        note: `importance 는 0~5 정수 (입력: "${importanceRaw}")`,
      };
    }
    numbers.push(caseNumber);
    return { key, caseNumber, newValue };
  });

  if (numbers.length > 0) {
    const { data: cases } = await client
      .from("cases")
      .select("case_id, case_number, importance")
      .in("case_number", numbers)
      .is("deleted_at", null);
    for (const c of cases ?? []) {
      lookup.set(c.case_number, {
        id: c.case_id,
        importance: c.importance,
      });
    }
  }

  for (const d of draftRows) {
    if (d.newValue === null) {
      rows.push({
        key: d.key,
        dbId: null,
        currentValue: null,
        newValue: -1,
        status: "invalid",
        note: d.note,
      });
      continue;
    }
    const found = lookup.get(d.caseNumber);
    if (!found) {
      rows.push({
        key: d.key,
        dbId: null,
        currentValue: null,
        newValue: d.newValue,
        status: "not_found",
        note: `해당 판례가 없습니다.`,
      });
      continue;
    }
    rows.push({
      key: d.key,
      dbId: found.id,
      currentValue: found.importance,
      newValue: d.newValue,
      status: found.importance === d.newValue ? "unchanged" : "changed",
    });
  }

  return summarize("case_importance", rows);
}

export async function applyCaseImportance(
  csv: string,
  actorId: string,
): Promise<{ applied: number; skipped: number }> {
  const client = adminClient as SupabaseClient<Database>;
  const preview = await previewCaseImportance(client, csv);
  let applied = 0;
  for (const r of preview.rows) {
    if (r.status !== "changed" || !r.dbId) continue;
    const { error } = await client
      .from("cases")
      .update({ importance: r.newValue })
      .eq("case_id", r.dbId);
    if (!error) applied += 1;
  }
  await logAuditEvent({
    actorId,
    action: "case.importance.bulk_update",
    entityType: "case",
    entityId: "bulk",
    metadata: {
      attempted: preview.changedCount,
      applied,
    },
  });
  return { applied, skipped: preview.rows.length - applied };
}

/* ── summary ─────────────────────────────────────────────────────────── */

function summarize(entity: SeedEntity, rows: SeedDiffRow[]): SeedDiffResult {
  let changed = 0;
  let unchanged = 0;
  let notFound = 0;
  let invalid = 0;
  for (const r of rows) {
    if (r.status === "changed") changed += 1;
    else if (r.status === "unchanged") unchanged += 1;
    else if (r.status === "not_found") notFound += 1;
    else invalid += 1;
  }
  return {
    entity,
    rows,
    changedCount: changed,
    unchangedCount: unchanged,
    notFoundCount: notFound,
    invalidCount: invalid,
  };
}
