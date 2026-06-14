// 강의 시청 추적 (feat-7-029).
// curriculum_items.kind='lecture' 항목에 대한 학생 시청 진행률 + 완료 기록.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";

export interface LectureItemDetail {
  itemId: string;
  weekId: string;
  curriculumId: string;
  curriculumName: string;
  weekNumber: number;
  weekTitle: string;
  lectureTitle: string;
  lectureUrl: string;
  lectureDurationMin: number | null;
  ord: number;
}

export interface LectureView {
  viewId: string;
  viewedAt: string;
  completedAt: string | null;
  lastPositionSec: number;
  updatedAt: string;
}

// 학생이 lecture 페이지 진입 시 권한·메타 fetch.
// 학생이 그 lecture 의 curriculum 을 적용 받은 cohort 의 멤버인지 검증.
export async function getLectureItemForUser(
  itemId: string,
  userId: string,
): Promise<LectureItemDetail | null> {
  const admin = adminClient as SupabaseClient<Database>;
  const { data: item } = await admin
    .from("curriculum_items")
    .select(
      "item_id, week_id, ord, kind, lecture_title, lecture_url, lecture_duration_min, curriculum_weeks!inner(week_number, title, curriculum_id, curricula!inner(name))",
    )
    .eq("item_id", itemId)
    .maybeSingle();
  if (!item || item.kind !== "lecture" || !item.lecture_url) return null;
  const curriculumId = item.curriculum_weeks?.curriculum_id;
  if (!curriculumId) return null;

  // 학생 cohort 가 그 curriculum 적용 중인가
  const { data: membership } = await admin
    .from("cohort_curricula")
    .select("cohort_id, cohort_members!inner(profile_id)")
    .eq("curriculum_id", curriculumId)
    .eq("cohort_members.profile_id", userId)
    .limit(1);
  if (!membership || membership.length === 0) return null;

  return {
    itemId: item.item_id,
    weekId: item.week_id,
    curriculumId,
    curriculumName: item.curriculum_weeks!.curricula!.name,
    weekNumber: item.curriculum_weeks!.week_number,
    weekTitle: item.curriculum_weeks!.title,
    lectureTitle: item.lecture_title ?? "강의",
    lectureUrl: item.lecture_url,
    lectureDurationMin: item.lecture_duration_min,
    ord: item.ord,
  };
}

export async function getMyLectureView(
  itemId: string,
  userId: string,
): Promise<LectureView | null> {
  const admin = adminClient as SupabaseClient<Database>;
  const { data } = await admin
    .from("lecture_views")
    .select("view_id, viewed_at, completed_at, last_position_sec, updated_at")
    .eq("user_id", userId)
    .eq("item_id", itemId)
    .maybeSingle();
  if (!data) return null;
  return {
    viewId: data.view_id,
    viewedAt: data.viewed_at,
    completedAt: data.completed_at,
    lastPositionSec: data.last_position_sec,
    updatedAt: data.updated_at,
  };
}

export async function recordView(
  itemId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = adminClient as SupabaseClient<Database>;
  // upsert — 첫 시청이면 insert, 이후엔 updated_at 만 갱신
  const { error } = await admin.from("lecture_views").upsert(
    {
      user_id: userId,
      item_id: itemId,
      viewed_at: new Date().toISOString(),
    },
    { onConflict: "user_id,item_id", ignoreDuplicates: false },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function markCompleted(
  itemId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = adminClient as SupabaseClient<Database>;
  const { error } = await admin.from("lecture_views").upsert(
    {
      user_id: userId,
      item_id: itemId,
      completed_at: new Date().toISOString(),
    },
    { onConflict: "user_id,item_id" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function updateLastPosition(
  itemId: string,
  userId: string,
  positionSec: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = adminClient as SupabaseClient<Database>;
  const { error } = await admin.from("lecture_views").upsert(
    {
      user_id: userId,
      item_id: itemId,
      last_position_sec: Math.max(0, Math.floor(positionSec)),
    },
    { onConflict: "user_id,item_id" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ──────────────────────────────────────────────────────────
// feat-4-A-117 — lecture_resources (관련자료)
// docs/features/feat-4-A-117-lecture-resources.md
// staff(instructor/manager/admin) CRUD · authenticated read.
// RLS 가 권한을 검사하므로 클라이언트는 요청 컨텍스트(supa-client) 전달.
// ──────────────────────────────────────────────────────────

export const LECTURE_NOTES_BUCKET = "lecture-notes";
const SIGNED_URL_EXPIRES_SEC = 300; // 5 min — gs-papers 패턴

export type LectureResourceKind = Database["public"]["Enums"]["resource_kind"];
export type LectureResourceTargetType =
  Database["public"]["Enums"]["resource_target_type"];

export interface LectureResourceListItem {
  resourceId: string;
  kind: LectureResourceKind;
  title: string;
  pdfUrl: string | null; // Storage object key (e.g. "lidam-patent-v10/p0067-0072.pdf")
  url: string | null; // 외부 영상 URL
  sourcePdfId: string | null;
  sourcePageStart: number | null;
  sourcePageEnd: number | null;
  ord: number;
  createdAt: string;
}

function mapLectureResourceRow(r: {
  resource_id: string;
  kind: LectureResourceKind;
  title: string;
  pdf_url: string | null;
  url: string | null;
  source_pdf_id: string | null;
  source_page_start: number | null;
  source_page_end: number | null;
  ord: number;
  created_at: string;
}): LectureResourceListItem {
  return {
    resourceId: r.resource_id,
    kind: r.kind,
    title: r.title,
    pdfUrl: r.pdf_url,
    url: r.url,
    sourcePdfId: r.source_pdf_id,
    sourcePageStart: r.source_page_start,
    sourcePageEnd: r.source_page_end,
    ord: r.ord,
    createdAt: r.created_at,
  };
}

// chapter-viewer 처럼 여러 article 카드를 한 화면에 렌더할 때 사용. N+1 방지.
export async function listLectureResourcesByArticleIds(
  client: SupabaseClient<Database>,
  articleIds: string[],
): Promise<Record<string, LectureResourceListItem[]>> {
  if (articleIds.length === 0) return {};
  const { data, error } = await client
    .from("lecture_resources")
    .select(
      "resource_id, target_id, kind, title, pdf_url, url, source_pdf_id, source_page_start, source_page_end, ord, created_at",
    )
    .eq("target_type", "article")
    .in("target_id", articleIds)
    .is("deleted_at", null)
    .order("ord", { ascending: true })
    .order("source_page_start", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (error) throw error;
  const map: Record<string, LectureResourceListItem[]> = {};
  for (const id of articleIds) map[id] = [];
  for (const r of data ?? []) {
    map[r.target_id]?.push(mapLectureResourceRow(r));
  }
  return map;
}

export async function listLectureResources(
  client: SupabaseClient<Database>,
  targetType: LectureResourceTargetType,
  targetId: string,
): Promise<LectureResourceListItem[]> {
  const { data, error } = await client
    .from("lecture_resources")
    .select(
      "resource_id, kind, title, pdf_url, url, source_pdf_id, source_page_start, source_page_end, ord, created_at",
    )
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .is("deleted_at", null)
    .order("ord", { ascending: true })
    .order("source_page_start", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    resourceId: r.resource_id,
    kind: r.kind,
    title: r.title,
    pdfUrl: r.pdf_url,
    url: r.url,
    sourcePdfId: r.source_pdf_id,
    sourcePageStart: r.source_page_start,
    sourcePageEnd: r.source_page_end,
    ord: r.ord,
    createdAt: r.created_at,
  }));
}

export interface CreateLectureResourceInput {
  targetType: LectureResourceTargetType;
  targetId: string;
  kind: LectureResourceKind;
  title: string;
  pdfUrl?: string | null;
  url?: string | null;
  durationSec?: number | null;
  ord?: number;
  sourcePdfId?: string | null;
  sourcePageStart?: number | null;
  sourcePageEnd?: number | null;
}

export async function createLectureResource(
  client: SupabaseClient<Database>,
  input: CreateLectureResourceInput,
  createdBy: string,
): Promise<{ resourceId: string }> {
  const { data, error } = await client
    .from("lecture_resources")
    .insert({
      target_type: input.targetType,
      target_id: input.targetId,
      kind: input.kind,
      title: input.title,
      pdf_url: input.pdfUrl ?? null,
      url: input.url ?? null,
      duration_sec: input.durationSec ?? null,
      ord: input.ord ?? 0,
      source_pdf_id: input.sourcePdfId ?? null,
      source_page_start: input.sourcePageStart ?? null,
      source_page_end: input.sourcePageEnd ?? null,
      created_by: createdBy,
    })
    .select("resource_id")
    .single();
  if (error) throw error;
  return { resourceId: data.resource_id };
}

export async function softDeleteLectureResource(
  client: SupabaseClient<Database>,
  resourceId: string,
): Promise<void> {
  // soft-delete 는 SECURITY DEFINER RPC 로 수행한다.
  // SELECT 정책(deleted_at IS NULL)이 UPDATE 의 새 행(deleted_at 세팅)을 막아
  // 직접 UPDATE 는 RLS 로 42501 실패한다(staff 라도). RPC 가 내부에서 staff 를
  // 검사하고 definer 권한으로 UPDATE 한다.
  const { error } = await client.rpc("soft_delete_lecture_resource", {
    p_resource_id: resourceId,
  });
  if (error) throw error;
}

// signed URL — 5분. 학생 클릭 시마다 재발급.
export async function getLectureResourceSignedUrl(
  client: SupabaseClient<Database>,
  pdfPath: string,
  downloadName?: string,
): Promise<string> {
  // downloadName 지정 시 Content-Disposition 파일명 = 강의노트 제목 (저장 시 한글 파일명).
  const { data, error } = await client.storage
    .from(LECTURE_NOTES_BUCKET)
    .createSignedUrl(
      pdfPath,
      SIGNED_URL_EXPIRES_SEC,
      downloadName ? { download: downloadName } : undefined,
    );
  if (error) throw error;
  return data.signedUrl;
}

// 통합본 원본 PDF inline signed URL — download 옵션 미사용(브라우저 네이티브 뷰어 inline),
// #page=N 점프 가능. 통PDF 장시간 열람 대비 기본 1h.
export async function getOriginalPdfSignedUrl(
  client: SupabaseClient<Database>,
  pdfPath: string,
  expiresSec = 3600,
): Promise<string> {
  const { data, error } = await client.storage
    .from(LECTURE_NOTES_BUCKET)
    .createSignedUrl(pdfPath, expiresSec);
  if (error) throw error;
  return data.signedUrl;
}

// 조문/판례 → 통합본 PDF 전역 페이지 위치 (lecture_pdf_locations). 조각과 병존.
export interface PdfLocationItem {
  page: number;
  label: string | null;
  storagePath: string;
  totalPages: number;
  sourcePdfId: string;
}

export async function getPdfLocations(
  client: SupabaseClient<Database>,
  targetType: LectureResourceTargetType,
  targetId: string,
): Promise<PdfLocationItem[]> {
  const { data: locs, error } = await client
    .from("lecture_pdf_locations")
    .select("page, label, source_pdf_id")
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .order("page", { ascending: true });
  if (error) throw error;
  if (!locs || locs.length === 0) return [];
  const srcIds = [...new Set(locs.map((l) => l.source_pdf_id))];
  const { data: srcs } = await client
    .from("lecture_source_pdfs")
    .select("source_pdf_id, storage_path, total_pages")
    .in("source_pdf_id", srcIds);
  const byId = new Map((srcs ?? []).map((s) => [s.source_pdf_id, s]));
  return locs
    .map((l) => {
      const s = byId.get(l.source_pdf_id);
      return s
        ? {
            page: l.page,
            label: l.label,
            storagePath: s.storage_path,
            totalPages: s.total_pages,
            sourcePdfId: l.source_pdf_id,
          }
        : null;
    })
    .filter((x): x is PdfLocationItem => x !== null);
}

// ──────────────────────────────────────────────────────────
// case-study 미매칭 슬라이드 검토 (운영자) — /admin/case-study-review
// ──────────────────────────────────────────────────────────

// book_slug 와 PPT 책 이름의 매핑 — title 생성·source_pdf_id 계산에 사용.
// import-pptx-lecture.mjs / import-pptx-case-study.mjs 와 동일한 BOOK_NAME 사용해야
// source_pdf_id 도 동일해진다.
const BOOK_NAMES: Record<string, string> = {
  "patent-lecture-ch1": "리담특허법 강의노트 — 제1편 총칙·보칙 (PPT)",
  "patent-lecture-ch2": "리담특허법 강의노트 — 제2편 특허요건 (PPT)",
  "patent-lecture-ch3": "리담특허법 강의노트 — 제3편 이익제도 (PPT)",
  "patent-lecture-ch4": "리담특허법 강의노트 — 제4편 심사·제도 (PPT)",
  "patent-lecture-ch5": "리담특허법 강의노트 — 제5편 특허권 (PPT)",
  "patent-lecture-ch6": "리담특허법 강의노트 — 제6편 심판·소송 (PPT)",
  "patent-lecture-ch7": "리담특허법 강의노트 — 제7편 PCT (PPT)",
};

export function getBookNameBySlug(slug: string): string {
  return BOOK_NAMES[slug] ?? slug;
}

// import 스크립트의 deterministicUuid 와 동일 알고리즘 (책 이름 sha1 → UUID v5-like).
async function deterministicSourcePdfId(bookSlug: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  const h = createHash("sha1")
    .update(getBookNameBySlug(bookSlug))
    .digest("hex");
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    "5" + h.slice(13, 16),
    ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16) + h.slice(17, 20),
    h.slice(20, 32),
  ].join("-");
}

export interface SlideCandidateLinkedCase {
  caseId: string;
  caseNumber: string;
  court: string | null;
}

export interface SlideCandidateRow {
  candidateId: string;
  bookSlug: string;
  slideIdx: number;
  pdfUrl: string;
  bodyPreview: string | null;
  autoCandidates: string[];
  resolvedAt: string | null;
  linkedCases: SlideCandidateLinkedCase[];
}

export async function listSlideCandidates(
  client: SupabaseClient<Database>,
  opts: { includeResolved?: boolean } = {},
): Promise<SlideCandidateRow[]> {
  let q = client
    .from("lecture_slide_candidates")
    .select(
      "candidate_id, book_slug, slide_idx, pdf_url, body_preview, auto_candidates, resolved_at",
    )
    .order("book_slug", { ascending: true })
    .order("slide_idx", { ascending: true });
  if (!opts.includeResolved) q = q.is("resolved_at", null);
  const { data: cands, error } = await q;
  if (error) throw error;
  if (!cands || cands.length === 0) return [];

  const pdfUrls = cands.map((c) => c.pdf_url);
  // lecture_resources.target_id 는 polymorphic 컬럼 — cases 로의 외래키 정의 없음.
  // PostgREST embed (`cases:target_id(...)`) 는 FK 없으면 400 throw 하므로
  // 두 쿼리로 분리해 안전하게 join 한다.
  const { data: links, error: linkErr } = await client
    .from("lecture_resources")
    .select("pdf_url, target_id")
    .eq("target_type", "case")
    .is("deleted_at", null)
    .in("pdf_url", pdfUrls);
  if (linkErr) throw linkErr;

  const targetIds = Array.from(
    new Set(
      (links ?? [])
        .map((l) => l.target_id)
        .filter((v): v is string => typeof v === "string" && v.length > 0),
    ),
  );
  const casesById = new Map<
    string,
    { case_id: string; case_number: string; court: string | null }
  >();
  if (targetIds.length > 0) {
    const { data: caseRows, error: caseErr } = await client
      .from("cases")
      .select("case_id, case_number, court")
      .in("case_id", targetIds);
    if (caseErr) throw caseErr;
    for (const c of caseRows ?? []) casesById.set(c.case_id, c);
  }

  const linkedByUrl = new Map<string, SlideCandidateLinkedCase[]>();
  for (const l of links ?? []) {
    if (!l.pdf_url || !l.target_id) continue;
    const c = casesById.get(l.target_id);
    if (!c) continue;
    const arr = linkedByUrl.get(l.pdf_url) ?? [];
    arr.push({ caseId: c.case_id, caseNumber: c.case_number, court: c.court });
    linkedByUrl.set(l.pdf_url, arr);
  }

  return cands.map((c) => ({
    candidateId: c.candidate_id,
    bookSlug: c.book_slug,
    slideIdx: c.slide_idx,
    pdfUrl: c.pdf_url,
    bodyPreview: c.body_preview,
    autoCandidates: c.auto_candidates ?? [],
    resolvedAt: c.resolved_at,
    linkedCases: linkedByUrl.get(c.pdf_url) ?? [],
  }));
}

export interface CaseSearchResult {
  caseId: string;
  caseNumber: string;
  court: string | null;
  decidedAt: string | null;
}

export async function searchCasesByNumber(
  client: SupabaseClient<Database>,
  query: string,
  limit = 20,
): Promise<CaseSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const { data, error } = await client
    .from("cases")
    .select("case_id, case_number, court, decided_at")
    .ilike("case_number", `%${trimmed}%`)
    .is("deleted_at", null)
    .order("decided_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    caseId: r.case_id,
    caseNumber: r.case_number,
    court: r.court,
    decidedAt: r.decided_at,
  }));
}

export async function linkCandidateToCase(
  client: SupabaseClient<Database>,
  args: {
    bookSlug: string;
    slideIdx: number;
    pdfUrl: string;
    caseId: string;
    createdBy: string;
  },
): Promise<{ resourceId: string; alreadyExists: boolean }> {
  // 중복 등록 방지
  const { data: existing } = await client
    .from("lecture_resources")
    .select("resource_id")
    .eq("target_type", "case")
    .eq("target_id", args.caseId)
    .eq("pdf_url", args.pdfUrl)
    .is("deleted_at", null)
    .maybeSingle();
  if (existing)
    return { resourceId: existing.resource_id, alreadyExists: true };

  const sourcePdfId = await deterministicSourcePdfId(args.bookSlug);
  const title = `${getBookNameBySlug(args.bookSlug)} (슬라이드 ${args.slideIdx})`;
  const { data, error } = await client
    .from("lecture_resources")
    .insert({
      target_type: "case",
      target_id: args.caseId,
      kind: "lecture_note",
      title,
      pdf_url: args.pdfUrl,
      source_pdf_id: sourcePdfId,
      source_page_start: args.slideIdx,
      source_page_end: args.slideIdx,
      created_by: args.createdBy,
    })
    .select("resource_id")
    .single();
  if (error) throw error;
  return { resourceId: data.resource_id, alreadyExists: false };
}

export async function unlinkCandidateCase(
  client: SupabaseClient<Database>,
  args: { pdfUrl: string; caseId: string },
): Promise<void> {
  const { error } = await client
    .from("lecture_resources")
    .update({ deleted_at: new Date().toISOString() })
    .eq("target_type", "case")
    .eq("target_id", args.caseId)
    .eq("pdf_url", args.pdfUrl)
    .is("deleted_at", null);
  if (error) throw error;
}

export async function setCandidateResolved(
  client: SupabaseClient<Database>,
  candidateId: string,
  resolved: boolean,
): Promise<void> {
  const { error } = await client
    .from("lecture_slide_candidates")
    .update({ resolved_at: resolved ? new Date().toISOString() : null })
    .eq("candidate_id", candidateId);
  if (error) throw error;
}

// ──────────────────────────────────────────────────────────
// 체계도(systematic_nodes) 트리 export / import (운영자)
// /admin/systematic-tree — 한 과목 트리를 JSON 으로 다운로드 → 수정 → 다른 과목으로 적재
// ──────────────────────────────────────────────────────────

export interface SystematicNodeExport {
  tmpId: string;
  parentTmpId: string | null;
  ord: number;
  displayLabel: string;
  linkedArticleNumbers: string[]; // articles.article_number — target law lookup 용
}

export interface SystematicTreeExport {
  sourceLawCode: string;
  exportedAt: string;
  nodeCount: number;
  nodes: SystematicNodeExport[];
}

export async function exportSystematicTree(
  client: SupabaseClient<Database>,
  lawCode: string,
): Promise<SystematicTreeExport> {
  const { data: nodes, error: nErr } = await client
    .from("systematic_nodes")
    .select("node_id, parent_id, display_label, ord, path")
    .eq("law_code", lawCode)
    .order("path", { ascending: true });
  if (nErr) throw nErr;
  const nodeList = nodes ?? [];

  // tmp_id 매핑 — path 순으로 (트리 안정 순서) n_001 ~
  const idMap = new Map<string, string>();
  nodeList.forEach((n, i) => {
    idMap.set(n.node_id, `n_${String(i + 1).padStart(3, "0")}`);
  });

  // article links
  const linkMap = new Map<string, string[]>();
  if (nodeList.length > 0) {
    const { data: links, error: lErr } = await client
      .from("article_systematic_links")
      .select("node_id, articles:article_id(article_number)")
      .in(
        "node_id",
        nodeList.map((n) => n.node_id),
      );
    if (lErr) throw lErr;
    for (const l of links ?? []) {
      const art = l.articles as unknown as { article_number: string } | null;
      if (!art) continue;
      const arr = linkMap.get(l.node_id) ?? [];
      arr.push(art.article_number);
      linkMap.set(l.node_id, arr);
    }
  }

  return {
    sourceLawCode: lawCode,
    exportedAt: new Date().toISOString(),
    nodeCount: nodeList.length,
    nodes: nodeList.map((n) => ({
      tmpId: idMap.get(n.node_id)!,
      parentTmpId: n.parent_id ? (idMap.get(n.parent_id) ?? null) : null,
      ord: n.ord,
      displayLabel: n.display_label,
      linkedArticleNumbers: (linkMap.get(n.node_id) ?? []).sort(),
    })),
  };
}

export interface ImportSystematicResult {
  inserted: number;
  linked: number;
  skippedLinks: { articleNumber: string; reason: string }[];
  deletedExisting: number;
}

export async function importSystematicTree(
  client: SupabaseClient<Database>,
  args: {
    targetLawCode: string;
    tree: SystematicTreeExport;
    replaceExisting: boolean;
  },
): Promise<ImportSystematicResult> {
  // 1) target law_id
  const { data: law, error: lawErr } = await client
    .from("laws")
    .select("law_id")
    .eq("law_code", args.targetLawCode)
    .single();
  if (lawErr || !law)
    throw new Error(`law_code=${args.targetLawCode} 미적재 (laws 테이블)`);

  // 2) 기존 nodes 삭제 (옵션)
  let deletedExisting = 0;
  if (args.replaceExisting) {
    const { data: existing } = await client
      .from("systematic_nodes")
      .select("node_id")
      .eq("law_code", args.targetLawCode);
    if (existing && existing.length > 0) {
      const ids = existing.map((e) => e.node_id);
      // links 먼저 (FK)
      await client.from("article_systematic_links").delete().in("node_id", ids);
      await client.from("systematic_nodes").delete().in("node_id", ids);
      deletedExisting = ids.length;
    }
  }

  // 3) BFS — parent 가 먼저 insert 되도록
  const tmpToReal = new Map<string, { nodeId: string; path: string }>();
  let inserted = 0;
  let processedThisIter = true;
  const remaining = [...args.tree.nodes];
  for (
    let safety = 0;
    safety < 30 && remaining.length > 0 && processedThisIter;
    safety++
  ) {
    processedThisIter = false;
    for (let i = remaining.length - 1; i >= 0; i--) {
      const n = remaining[i];
      if (n.parentTmpId && !tmpToReal.has(n.parentTmpId)) continue;
      const parentInfo = n.parentTmpId ? tmpToReal.get(n.parentTmpId)! : null;
      const path = parentInfo
        ? `${parentInfo.path}.b${n.ord}`
        : `${args.targetLawCode}.b${n.ord}`;
      const { data, error } = await client
        .from("systematic_nodes")
        .insert({
          law_code: args.targetLawCode,
          parent_id: parentInfo?.nodeId ?? null,
          path,
          display_label: n.displayLabel,
          ord: n.ord,
        })
        .select("node_id")
        .single();
      if (error) throw error;
      tmpToReal.set(n.tmpId, { nodeId: data.node_id, path });
      inserted++;
      processedThisIter = true;
      remaining.splice(i, 1);
    }
  }
  if (remaining.length > 0)
    throw new Error(
      `${remaining.length} 노드를 트리에 배치하지 못했습니다 (parent_tmp_id 참조 오류 가능)`,
    );

  // 4) article_systematic_links — article_number 로 lookup
  let linked = 0;
  const skippedLinks: { articleNumber: string; reason: string }[] = [];
  for (const n of args.tree.nodes) {
    if (n.linkedArticleNumbers.length === 0) continue;
    const real = tmpToReal.get(n.tmpId);
    if (!real) continue;
    for (const num of n.linkedArticleNumbers) {
      const { data: art } = await client
        .from("articles")
        .select("article_id")
        .eq("law_id", law.law_id)
        .eq("article_number", num)
        .maybeSingle();
      if (!art) {
        skippedLinks.push({
          articleNumber: num,
          reason: `${args.targetLawCode} articles 에 없음`,
        });
        continue;
      }
      const { error } = await client
        .from("article_systematic_links")
        .insert({ article_id: art.article_id, node_id: real.nodeId });
      if (error) {
        skippedLinks.push({ articleNumber: num, reason: error.message });
        continue;
      }
      linked++;
    }
  }

  return { inserted, linked, skippedLinks, deletedExisting };
}
