// feat-7-049 — 본문 찾아 고치기: 검색 · 적용 · 되돌리기.
//
// ★스캔은 DB 안에서(find_content_matches RPC). jsonb 본문을 앱으로 끌어와 훑으면
//   book_sections 때문에 fetch 가 끊긴다(1000행 실측).
// ★적용·되돌리기는 **현재 값을 다시 읽고** 쓴다. 미리보기와 적용 사이에 누가
//   고쳤을 수 있다. 어긋나면 덮지 않고 건너뛴 사실을 돌려준다.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "database.types";
import {
  CONTEXT_CHARS,
  FIND_REPLACE_TARGETS,
  fieldLabelOf,
  fieldSpecOf,
  MAX_MATCHES,
  type FindReplaceEntity,
} from "~/features/admin/lib/find-replace-targets";

type Client = SupabaseClient<Database>;

export interface MatchContext {
  before: string;
  after: string;
}

export interface FindMatch {
  entityType: FindReplaceEntity;
  entityId: string;
  field: string;
  fieldLabel: string;
  entityLabel: string;
  entitySub: string | null;
  href: string | null;
  occurrences: number;
  contexts: MatchContext[];
}

export interface ApplyTarget {
  entityType: FindReplaceEntity;
  entityId: string;
  field: string;
}

export interface SkippedTarget {
  entityType: string;
  entityId: string;
  field: string;
  reason: string;
}

export interface ApplyResult {
  batchId: string;
  applied: number;
  skipped: SkippedTarget[];
}

export interface EditBatch {
  batchId: string;
  searchTerm: string;
  replaceTerm: string;
  rows: number;
  occurrences: number;
  createdAt: string;
  revertedAt: string | null;
  authorName: string | null;
}

const MAX_CONTEXTS = 3;
/** book_sections 가 큰 편이라 넉넉히 나눠 받는다(1000행 한 번에 = fetch 끊김). */
const CHUNK = 100;

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let n = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    n += 1;
    i = haystack.indexOf(needle, i + needle.length);
  }
  return n;
}

const replaceAll = (haystack: string, needle: string, replacement: string) =>
  haystack.split(needle).join(replacement);

function buildContexts(text: string, term: string, replacement: string): MatchContext[] {
  const out: MatchContext[] = [];
  let i = text.indexOf(term);
  while (i !== -1 && out.length < MAX_CONTEXTS) {
    const head = text.slice(Math.max(0, i - CONTEXT_CHARS), i);
    const tail = text.slice(i + term.length, i + term.length + CONTEXT_CHARS);
    const lead = i - CONTEXT_CHARS > 0 ? "…" : "";
    const trail = i + term.length + CONTEXT_CHARS < text.length ? "…" : "";
    out.push({
      before: `${lead}${head}${term}${tail}${trail}`,
      after: `${lead}${head}${replacement}${tail}${trail}`,
    });
    i = text.indexOf(term, i + term.length);
  }
  return out;
}

/**
 * jsonb 안에서 **화이트리스트 키**의 문자열만 바꾼다.
 * ★키를 안 가리고 모든 문자열을 바꾸면 kind·key·type 같은 구조 키와 이미지 URL 까지
 *   망가진다("텍스트"를 찾는데 storage 경로가 바뀌는 식).
 */
function replaceInJson(
  value: unknown,
  keys: readonly string[],
  term: string,
  replacement: string,
): { value: unknown; count: number; texts: string[] } {
  let count = 0;
  const texts: string[] = [];

  const walk = (node: unknown, keyOfNode: string | null): unknown => {
    if (Array.isArray(node)) return node.map((x) => walk(x, keyOfNode));
    if (node !== null && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        out[k] = walk(v, k);
      }
      return out;
    }
    if (typeof node === "string" && keyOfNode !== null && keys.includes(keyOfNode)) {
      const n = countOccurrences(node, term);
      if (n > 0) {
        count += n;
        texts.push(node);
        return replaceAll(node, term, replacement);
      }
    }
    return node;
  };

  return { value: walk(value, null), count, texts };
}

/** 필드 값의 등장 횟수·맥락·바뀐 값. 안 걸리면 null. */
function inspectField(
  entityType: FindReplaceEntity,
  field: string,
  raw: unknown,
  term: string,
  replacement: string,
): { occurrences: number; contexts: MatchContext[]; next: unknown } | null {
  const spec = fieldSpecOf(entityType, field);
  if (!spec) return null;
  if (spec.jsonKeys) {
    if (raw === null || raw === undefined) return null;
    const r = replaceInJson(raw, spec.jsonKeys, term, replacement);
    if (r.count === 0) return null;
    const contexts: MatchContext[] = [];
    for (const t of r.texts) {
      for (const c of buildContexts(t, term, replacement)) {
        if (contexts.length < MAX_CONTEXTS) contexts.push(c);
      }
    }
    return { occurrences: r.count, contexts, next: r.value };
  }
  if (typeof raw !== "string") return null;
  const n = countOccurrences(raw, term);
  if (n === 0) return null;
  return {
    occurrences: n,
    contexts: buildContexts(raw, term, replacement),
    next: replaceAll(raw, term, replacement),
  };
}

// ── 한 필드 읽기/쓰기 ────────────────────────────────────────────────────────
// 테이블·필드가 실행 시점에 정해지므로 update 페이로드는 만들어서 그 테이블의
// Update 타입으로 좁힌다. 필드 이름은 FIND_REPLACE_TARGETS 화이트리스트에서만 오고,
// 호출 전에 fieldSpecOf 로 검증한다.
function payload<T>(field: string, value: unknown): T {
  return { [field]: value } as unknown as T;
}

async function readField(
  client: Client,
  entityType: FindReplaceEntity,
  entityId: string,
  field: string,
): Promise<{ ok: true; value: unknown } | { ok: false; reason: string }> {
  const spec = FIND_REPLACE_TARGETS[entityType];
  const q =
    entityType === "case"
      ? client.from("cases").select(field).eq("case_id", entityId)
      : entityType === "case_placement"
        ? client.from("case_systematic_links").select(field).eq("link_id", entityId)
        : entityType === "case_reference"
          ? client.from("case_references").select(field).eq("reference_id", entityId)
          : client.from("problems").select(field).eq("problem_id", entityId);
  void spec;
  const { data, error } = await q.maybeSingle();
  if (error) return { ok: false, reason: error.message };
  if (!data) return { ok: false, reason: "대상이 없어졌습니다" };
  return { ok: true, value: (data as unknown as Record<string, unknown>)[field] };
}

async function writeField(
  client: Client,
  entityType: FindReplaceEntity,
  entityId: string,
  field: string,
  value: unknown,
): Promise<string | null> {
  if (entityType === "case") {
    const { error } = await client
      .from("cases")
      .update(payload<Database["public"]["Tables"]["cases"]["Update"]>(field, value))
      .eq("case_id", entityId);
    return error?.message ?? null;
  }
  if (entityType === "case_placement") {
    const { error } = await client
      .from("case_systematic_links")
      .update(
        payload<Database["public"]["Tables"]["case_systematic_links"]["Update"]>(
          field,
          value,
        ),
      )
      .eq("link_id", entityId);
    return error?.message ?? null;
  }
  if (entityType === "case_reference") {
    const { error } = await client
      .from("case_references")
      .update(
        payload<Database["public"]["Tables"]["case_references"]["Update"]>(field, value),
      )
      .eq("reference_id", entityId);
    return error?.message ?? null;
  }
  const { error } = await client
    .from("problems")
    .update(payload<Database["public"]["Tables"]["problems"]["Update"]>(field, value))
    .eq("problem_id", entityId);
  return error?.message ?? null;
}

/**
 * 대표 배치의 book_sections 가 cases 의 **사본일 때만** 따라 바꾼다
 * (api/admin/case.tsx 가 저장 때마다 미러링해 둔 경우).
 *
 * ★무조건 덮으면 안 된다 — 대표 배치가 자기 본문을 따로 갖는 경우가 있고
 *   (상표 대표 배치 359건 중 153건), 덮으면 그 본문이 사라진다. 실제로 한 번 날렸다.
 *   사본이 아닌 대표 배치는 `find_content_matches` 가 따로 잡아 준다.
 */
async function mirrorPrimaryPlacement(
  client: Client,
  caseId: string,
  previousCaseValue: unknown,
  nextValue: unknown,
): Promise<void> {
  const { data: link } = await client
    .from("case_systematic_links")
    .select("link_id, book_sections")
    .eq("case_id", caseId)
    .eq("is_primary", true)
    .maybeSingle();
  if (!link) return;
  if (JSON.stringify(link.book_sections ?? null) !== JSON.stringify(previousCaseValue ?? null)) {
    return; // 자기 본문을 가진 대표 배치 — 건드리지 않는다
  }
  await client
    .from("case_systematic_links")
    .update(
      payload<Database["public"]["Tables"]["case_systematic_links"]["Update"]>(
        "book_sections",
        nextValue,
      ),
    )
    .eq("link_id", link.link_id);
}

// ── 검색 ────────────────────────────────────────────────────────────────────
interface RowBundle {
  values: Map<string, unknown>;
  label: string;
  sub: string | null;
  href: string | null;
}

async function loadRows(
  client: Client,
  entityType: FindReplaceEntity,
  ids: string[],
  fields: string[],
): Promise<Map<string, RowBundle>> {
  const out = new Map<string, RowBundle>();
  if (ids.length === 0) return out;

  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);

    if (entityType === "case") {
      const { data, error } = await client
        .from("cases")
        .select(["case_id", "case_number", "case_title", ...fields].join(", "))
        .in("case_id", slice);
      if (error) throw error;
      for (const raw of data ?? []) {
        const r = raw as unknown as Record<string, unknown>;
        const id = String(r.case_id);
        out.set(id, {
          values: new Map(fields.map((f) => [f, r[f]])),
          label: String(r.case_number ?? ""),
          sub: typeof r.case_title === "string" ? r.case_title : null,
          href: `/admin/cases/edit/${id}`,
        });
      }
      continue;
    }

    if (entityType === "case_placement") {
      const { data, error } = await client
        .from("case_systematic_links")
        .select("link_id, case_id, book_sections")
        .in("link_id", slice);
      if (error) throw error;
      const caseIds = [...new Set((data ?? []).map((r) => r.case_id))];
      const labels = await loadCaseLabels(client, caseIds);
      for (const r of data ?? []) {
        const kase = labels.get(r.case_id);
        out.set(r.link_id, {
          values: new Map<string, unknown>([["book_sections", r.book_sections]]),
          label: kase?.number ?? "(판례 없음)",
          sub: kase?.title ?? null,
          href: `/admin/cases/edit/${r.case_id}`,
        });
      }
      continue;
    }

    if (entityType === "case_reference") {
      const { data, error } = await client
        .from("case_references")
        .select("reference_id, case_id, title, authors, source, note")
        .in("reference_id", slice);
      if (error) throw error;
      const labels = await loadCaseLabels(client, [
        ...new Set((data ?? []).map((r) => r.case_id)),
      ]);
      for (const r of data ?? []) {
        out.set(r.reference_id, {
          values: new Map<string, unknown>([
            ["title", r.title],
            ["authors", r.authors],
            ["source", r.source],
            ["note", r.note],
          ]),
          label: labels.get(r.case_id)?.number ?? "(판례 없음)",
          sub: r.title,
          href: `/admin/cases/edit/${r.case_id}`,
        });
      }
      continue;
    }

    const { data, error } = await client
      .from("problems")
      .select("problem_id, display_no, body_md, explanation_md")
      .in("problem_id", slice);
    if (error) throw error;
    for (const r of data ?? []) {
      out.set(r.problem_id, {
        values: new Map<string, unknown>([["explanation_md", r.explanation_md]]),
        label: r.display_no ? `P-${r.display_no}` : "문제",
        sub: (r.body_md ?? "").replace(/\s+/g, " ").slice(0, 60),
        href: `/admin/problems/${r.problem_id}`,
      });
    }
  }
  return out;
}

async function loadCaseLabels(
  client: Client,
  caseIds: string[],
): Promise<Map<string, { number: string; title: string | null }>> {
  const out = new Map<string, { number: string; title: string | null }>();
  for (let i = 0; i < caseIds.length; i += CHUNK) {
    const { data } = await client
      .from("cases")
      .select("case_id, case_number, case_title")
      .in("case_id", caseIds.slice(i, i + CHUNK));
    for (const c of data ?? []) {
      out.set(c.case_id, { number: c.case_number, title: c.case_title });
    }
  }
  return out;
}

export async function searchContent(
  client: Client,
  params: { term: string; replacement: string; entityTypes: FindReplaceEntity[] },
): Promise<{ matches: FindMatch[]; truncated: boolean }> {
  const { term, replacement, entityTypes } = params;
  const { data, error } = await client.rpc("find_content_matches", {
    p_term: term,
    p_limit: MAX_MATCHES + 1,
  });
  if (error) throw error;

  const hits = (data ?? []).filter((h) =>
    entityTypes.includes(h.entity_type as FindReplaceEntity),
  );
  const truncated = hits.length > MAX_MATCHES;
  const kept = hits.slice(0, MAX_MATCHES);

  const byType = new Map<FindReplaceEntity, { ids: Set<string>; fields: Set<string> }>();
  for (const h of kept) {
    const t = h.entity_type as FindReplaceEntity;
    if (!FIND_REPLACE_TARGETS[t]) continue;
    const bucket = byType.get(t) ?? { ids: new Set<string>(), fields: new Set<string>() };
    bucket.ids.add(h.entity_id);
    bucket.fields.add(h.field);
    byType.set(t, bucket);
  }

  const matches: FindMatch[] = [];
  for (const [entityType, bucket] of byType) {
    const allowed = [...bucket.fields].filter((f) => fieldSpecOf(entityType, f));
    const rows = await loadRows(client, entityType, [...bucket.ids], allowed);
    for (const h of kept) {
      if (h.entity_type !== entityType) continue;
      const row = rows.get(h.entity_id);
      if (!row) continue;
      const found = inspectField(
        entityType,
        h.field,
        row.values.get(h.field),
        term,
        replacement,
      );
      // RPC 는 jsonb 를 통째 문자열로 훑으므로 화이트리스트 밖(구조 키·이미지 URL)에만
      // 걸린 행이 섞여 온다 — 여기서 걸러진다.
      if (!found) continue;
      matches.push({
        entityType,
        entityId: h.entity_id,
        field: h.field,
        fieldLabel: fieldLabelOf(entityType, h.field),
        entityLabel: row.label,
        entitySub: row.sub,
        href: row.href,
        occurrences: found.occurrences,
        contexts: found.contexts,
      });
    }
  }
  matches.sort(
    (a, b) =>
      a.entityType.localeCompare(b.entityType) ||
      a.entityLabel.localeCompare(b.entityLabel) ||
      a.field.localeCompare(b.field),
  );
  return { matches, truncated };
}

// ── 적용 ────────────────────────────────────────────────────────────────────
export async function applyReplacements(
  client: Client,
  params: {
    term: string;
    replacement: string;
    targets: ApplyTarget[];
    authorId: string;
  },
): Promise<ApplyResult> {
  const { term, replacement, targets, authorId } = params;
  const batchId = crypto.randomUUID();
  const skipped: SkippedTarget[] = [];
  let applied = 0;

  for (const t of targets) {
    if (!FIND_REPLACE_TARGETS[t.entityType] || !fieldSpecOf(t.entityType, t.field)) {
      skipped.push({ ...t, reason: "허용되지 않은 대상" });
      continue;
    }
    // ★현재 값을 다시 읽는다 — 미리보기 이후 바뀌었을 수 있다.
    const read = await readField(client, t.entityType, t.entityId, t.field);
    if (!read.ok) {
      skipped.push({ ...t, reason: read.reason });
      continue;
    }
    const found = inspectField(t.entityType, t.field, read.value, term, replacement);
    if (!found) {
      skipped.push({ ...t, reason: "그 사이 내용이 바뀌어 검색어가 없습니다" });
      continue;
    }

    const writeErr = await writeField(
      client,
      t.entityType,
      t.entityId,
      t.field,
      found.next,
    );
    if (writeErr) {
      skipped.push({ ...t, reason: writeErr });
      continue;
    }
    if (t.entityType === "case" && t.field === "book_sections") {
      await mirrorPrimaryPlacement(client, t.entityId, read.value, found.next);
    }

    const { error: logErr } = await client.from("content_edit_logs").insert({
      batch_id: batchId,
      entity_type: t.entityType,
      entity_id: t.entityId,
      field: t.field,
      before_value: (read.value ?? null) as Database["public"]["Tables"]["content_edit_logs"]["Insert"]["before_value"],
      after_value: (found.next ?? null) as Database["public"]["Tables"]["content_edit_logs"]["Insert"]["after_value"],
      search_term: term,
      replace_term: replacement,
      occurrences: found.occurrences,
      created_by: authorId,
    });
    if (logErr) {
      // 기록이 없으면 되돌릴 수 없다 — 원래 값으로 되돌려 놓고 실패로 보고한다.
      await writeField(client, t.entityType, t.entityId, t.field, read.value);
      if (t.entityType === "case" && t.field === "book_sections") {
        await mirrorPrimaryPlacement(client, t.entityId, found.next, read.value);
      }
      skipped.push({ ...t, reason: `기록 실패로 취소: ${logErr.message}` });
      continue;
    }
    applied += 1;
  }
  return { batchId, applied, skipped };
}

// ── 되돌리기 ────────────────────────────────────────────────────────────────
export async function listEditBatches(client: Client, limit = 20): Promise<EditBatch[]> {
  const { data, error } = await client
    .from("content_edit_logs")
    .select(
      "batch_id, search_term, replace_term, occurrences, created_at, reverted_at, created_by",
    )
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;

  const byBatch = new Map<string, EditBatch & { authorId: string | null }>();
  for (const r of data ?? []) {
    const cur = byBatch.get(r.batch_id);
    if (cur) {
      cur.rows += 1;
      cur.occurrences += r.occurrences;
      // 한 건이라도 안 되돌려졌으면 그 batch 는 아직 되돌릴 게 남았다.
      if (!r.reverted_at) cur.revertedAt = null;
      continue;
    }
    byBatch.set(r.batch_id, {
      batchId: r.batch_id,
      searchTerm: r.search_term,
      replaceTerm: r.replace_term,
      rows: 1,
      occurrences: r.occurrences,
      createdAt: r.created_at,
      revertedAt: r.reverted_at,
      authorName: null,
      authorId: r.created_by,
    });
  }
  const batches = [...byBatch.values()].slice(0, limit);
  const authorIds = [
    ...new Set(batches.map((b) => b.authorId).filter((x): x is string => Boolean(x))),
  ];
  if (authorIds.length > 0) {
    const { data: profiles } = await client
      .from("profiles")
      .select("profile_id, name")
      .in("profile_id", authorIds);
    const nameOf = new Map((profiles ?? []).map((p) => [p.profile_id, p.name]));
    for (const b of batches) b.authorName = b.authorId ? (nameOf.get(b.authorId) ?? null) : null;
  }
  return batches.map(({ authorId: _authorId, ...b }) => b);
}

export async function revertBatch(
  client: Client,
  batchId: string,
  authorId: string,
): Promise<{ reverted: number; skipped: string[] }> {
  const { data: logs, error } = await client
    .from("content_edit_logs")
    .select("log_id, entity_type, entity_id, field, before_value, after_value")
    .eq("batch_id", batchId)
    .is("reverted_at", null);
  if (error) throw error;

  const skipped: string[] = [];
  let reverted = 0;
  for (const log of logs ?? []) {
    const entityType = log.entity_type as FindReplaceEntity;
    if (!FIND_REPLACE_TARGETS[entityType] || !fieldSpecOf(entityType, log.field)) {
      skipped.push(`${log.entity_id}: 알 수 없는 대상`);
      continue;
    }
    const read = await readField(client, entityType, log.entity_id, log.field);
    if (!read.ok) {
      skipped.push(`${log.entity_id}: ${read.reason}`);
      continue;
    }
    // ★적용 직후 값과 지금 값이 같을 때만 되돌린다 — 그 뒤 누가 또 고쳤으면 두지 않는다.
    if (JSON.stringify(read.value ?? null) !== JSON.stringify(log.after_value ?? null)) {
      skipped.push(`${log.entity_id}: 그 뒤 내용이 또 바뀌어 건너뜀`);
      continue;
    }
    const writeErr = await writeField(
      client,
      entityType,
      log.entity_id,
      log.field,
      log.before_value,
    );
    if (writeErr) {
      skipped.push(`${log.entity_id}: ${writeErr}`);
      continue;
    }
    if (entityType === "case" && log.field === "book_sections") {
      await mirrorPrimaryPlacement(client, log.entity_id, log.after_value, log.before_value);
    }
    await client
      .from("content_edit_logs")
      .update({ reverted_at: new Date().toISOString(), reverted_by: authorId })
      .eq("log_id", log.log_id);
    reverted += 1;
  }
  return { reverted, skipped };
}
