import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import type {
  AnnotationTargetType,
  BookmarkRecord,
  BookmarkStepNotes,
  HighlightColor,
  HighlightRecord,
  MemoRecord,
} from "./labels";

import { articleDisplayPrefix } from "~/features/laws/lib/identifier";
import {
  scienceProblemHref,
  scienceSubjectName,
} from "~/features/subjects/lib/science";

export type {
  AnnotationTargetType,
  BookmarkRecord,
  BookmarkStepNotes,
  MemoRecord,
  HighlightColor,
  HighlightRecord,
} from "./labels";
export {
  ANNOTATION_TARGET_TYPES,
  annotationTargetTypeSchema,
  BOOKMARK_STEP_LEVELS,
  HIGHLIGHT_COLORS,
  HIGHLIGHT_COLOR_DEFAULT_LABEL,
  HIGHLIGHT_ALIAS_MAX_LEN,
  highlightAliasSchema,
  highlightColorLabel,
  highlightColorSchema,
  normalizeHighlightColorAliases,
} from "./labels";
export type { HighlightColorAliases } from "./labels";

// 사용자별 색상 alias (닉네임) 읽기 — feat-3-208.
// 누락 키 또는 빈 값은 호출부 highlightColorLabel() 가 기본 색 이름으로 폴백.
export async function getHighlightColorAliases(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<import("./labels").HighlightColorAliases> {
  const { data, error } = await client
    .from("profiles")
    .select("highlight_color_aliases")
    .eq("profile_id", userId)
    .maybeSingle();
  if (error) throw error;
  // 모듈 순환을 피하기 위해 normalize 는 require 가 아닌 위 import 의 reexport 사용.
  const { normalizeHighlightColorAliases } = await import("./labels");
  return normalizeHighlightColorAliases(data?.highlight_color_aliases ?? null);
}

// 특정 색상의 alias 값을 저장. 빈 문자열을 넘기면 해당 키를 삭제(기본 라벨로 복귀).
// jsonb merge — 다른 색 alias 는 보존.
export async function setHighlightColorAlias(
  client: SupabaseClient<Database>,
  userId: string,
  color: HighlightColor,
  alias: string,
): Promise<import("./labels").HighlightColorAliases> {
  // 기존 alias 맵 → 키 삽입/삭제 → 전체 jsonb 갱신. 동시 편집 충돌 가능성은 낮은 사용자
  // 본인 데이터라 무시. (race 가 문제되는 양은 5색 × 1 명, 발생 가능성 거의 0.)
  const current = await getHighlightColorAliases(client, userId);
  const next: import("./labels").HighlightColorAliases = { ...current };
  const trimmed = alias.trim().slice(0, 24);
  if (trimmed) {
    next[color] = trimmed;
  } else {
    delete next[color];
  }
  const { error } = await client
    .from("profiles")
    .update({ highlight_color_aliases: next })
    .eq("profile_id", userId);
  if (error) throw error;
  return next;
}

// JSONB → BookmarkStepNotes 안전 변환. 알 수 없는 키는 무시.
function parseStepNotes(value: unknown): BookmarkStepNotes {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: BookmarkStepNotes = {};
  for (const key of ["1", "2", "3", "4", "5"] as const) {
    const v = (value as Record<string, unknown>)[key];
    if (typeof v === "string" && v.length > 0) out[key] = v;
  }
  return out;
}

// 사용자의 article 타입 즐겨찾기 단계를 articleId → star_level 맵으로 반환.
// 트리 필터링용. (제거된 즐겨찾기 = deleted_at IS NULL 조건으로 제외)
export async function getUserArticleBookmarkLevels(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<Record<string, number>> {
  const { data, error } = await client
    .from("user_bookmarks")
    .select("target_id, star_level")
    .eq("user_id", userId)
    .eq("target_type", "article")
    .is("deleted_at", null);
  if (error) throw error;
  const out: Record<string, number> = {};
  for (const row of data ?? []) {
    out[row.target_id] = row.star_level;
  }
  return out;
}

// 사용자의 article 단위 메모·하이라이트 카운트.
// 같은 article_id 에 대한 학습 활동을, 그 article 이 매핑된 모든 트리 노드(체계도/조문)에서
// 동일하게 표시하기 위한 데이터.
export interface ArticleAnnotationCounts {
  memos: number;
  highlights: number;
}

export async function getUserArticleAnnotationCounts(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<Record<string, ArticleAnnotationCounts>> {
  const [memos, highlights] = await Promise.all([
    client
      .from("user_memos")
      .select("target_id")
      .eq("user_id", userId)
      .eq("target_type", "article")
      .is("deleted_at", null),
    client
      .from("user_highlights")
      .select("target_id")
      .eq("user_id", userId)
      .eq("target_type", "article")
      .is("deleted_at", null),
  ]);
  if (memos.error) throw memos.error;
  if (highlights.error) throw highlights.error;

  const out: Record<string, ArticleAnnotationCounts> = {};
  for (const row of memos.data ?? []) {
    const cur = out[row.target_id] ?? { memos: 0, highlights: 0 };
    cur.memos += 1;
    out[row.target_id] = cur;
  }
  for (const row of highlights.data ?? []) {
    const cur = out[row.target_id] ?? { memos: 0, highlights: 0 };
    cur.highlights += 1;
    out[row.target_id] = cur;
  }
  return out;
}

// multi-article: 여러 article 의 bookmark / memos / highlights 를 한 번에 가져와 articleId map 으로 반환.
// 그룹 viewer (체계도 그룹 노드) 처럼 article 여러 개를 한 화면에 동시 표시할 때 사용.
export async function getBookmarksByArticleIds(
  client: SupabaseClient<Database>,
  userId: string,
  articleIds: string[],
): Promise<Record<string, BookmarkRecord>> {
  if (articleIds.length === 0) return {};
  const { data, error } = await client
    .from("user_bookmarks")
    .select(
      "bookmark_id, target_id, star_level, note_md, step_notes, updated_at",
    )
    .eq("user_id", userId)
    .eq("target_type", "article")
    .in("target_id", articleIds)
    .is("deleted_at", null);
  if (error) throw error;
  const out: Record<string, BookmarkRecord> = {};
  for (const row of data ?? []) {
    out[row.target_id] = {
      bookmarkId: row.bookmark_id,
      starLevel: row.star_level,
      noteMd: row.note_md,
      stepNotes: parseStepNotes(row.step_notes),
      updatedAt: row.updated_at,
    };
  }
  return out;
}

export async function listMemosByArticleIds(
  client: SupabaseClient<Database>,
  userId: string,
  articleIds: string[],
): Promise<Record<string, MemoRecord[]>> {
  if (articleIds.length === 0) return {};
  // 본인 + 강사 작성 포스트잇 모두 반환 (RLS 가 가시성 경계). isMine 으로 구분.
  const { data, error } = await client
    .from("user_memos")
    .select(
      "memo_id, user_id, target_id, body_md, snippet, block_index, cum_offset, created_at, updated_at",
    )
    .eq("target_type", "article")
    .in("target_id", articleIds)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const out: Record<string, MemoRecord[]> = {};
  for (const row of data ?? []) {
    const list = out[row.target_id] ?? [];
    list.push({
      memoId: row.memo_id,
      bodyMd: row.body_md,
      snippet: row.snippet ?? null,
      blockIndex: row.block_index ?? null,
      cumOffset: row.cum_offset ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      isMine: row.user_id === userId,
    });
    out[row.target_id] = list;
  }
  return out;
}

export async function listHighlightsByArticleIds(
  client: SupabaseClient<Database>,
  userId: string,
  articleIds: string[],
): Promise<Record<string, HighlightRecord[]>> {
  if (articleIds.length === 0) return {};
  // 본인 + 강사 작성 하이라이트 모두 반환 (RLS 가 가시성 경계). isMine 으로 구분.
  const { data, error } = await client
    .from("user_highlights")
    .select(
      "highlight_id, user_id, target_id, field_path, start_offset, end_offset, content_hash, color, label, snippet, before_ctx, after_ctx, created_at",
    )
    .eq("target_type", "article")
    .in("target_id", articleIds)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const out: Record<string, HighlightRecord[]> = {};
  for (const row of data ?? []) {
    const list = out[row.target_id] ?? [];
    list.push({
      highlightId: row.highlight_id,
      fieldPath: row.field_path,
      startOffset: row.start_offset,
      endOffset: row.end_offset,
      contentHash: row.content_hash,
      color: row.color as HighlightColor,
      label: row.label,
      createdAt: row.created_at,
      excerpt: row.label ?? "",
      isMine: row.user_id === userId,
      snippet: row.snippet,
      beforeCtx: row.before_ctx,
      afterCtx: row.after_ctx,
    });
    out[row.target_id] = list;
  }
  return out;
}

// polymorphic bulk: 같은 target_type 의 여러 target_id 에 대한 bookmark / memos 를
// 한 번에 조회. OX 패널처럼 한 화면에서 다수의 problem_choice / problem_box_item
// 주석을 동시에 다뤄야 할 때 사용.
export async function getBookmarksByTargets(
  client: SupabaseClient<Database>,
  userId: string,
  targetType: AnnotationTargetType,
  targetIds: string[],
): Promise<Record<string, BookmarkRecord>> {
  if (targetIds.length === 0) return {};
  const { data, error } = await client
    .from("user_bookmarks")
    .select(
      "bookmark_id, target_id, star_level, note_md, step_notes, updated_at",
    )
    .eq("user_id", userId)
    .eq("target_type", targetType)
    .in("target_id", targetIds)
    .is("deleted_at", null);
  if (error) throw error;
  const out: Record<string, BookmarkRecord> = {};
  for (const row of data ?? []) {
    out[row.target_id] = {
      bookmarkId: row.bookmark_id,
      starLevel: row.star_level,
      noteMd: row.note_md,
      stepNotes: parseStepNotes(row.step_notes),
      updatedAt: row.updated_at,
    };
  }
  return out;
}

export async function listMemosByTargets(
  client: SupabaseClient<Database>,
  userId: string,
  targetType: AnnotationTargetType,
  targetIds: string[],
): Promise<Record<string, MemoRecord[]>> {
  if (targetIds.length === 0) return {};
  // 본인 + 강사 작성 포스트잇 모두 반환 (RLS 가 가시성 경계). isMine 으로 구분.
  const { data, error } = await client
    .from("user_memos")
    .select(
      "memo_id, user_id, target_id, body_md, snippet, block_index, cum_offset, created_at, updated_at",
    )
    .eq("target_type", targetType)
    .in("target_id", targetIds)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const out: Record<string, MemoRecord[]> = {};
  for (const row of data ?? []) {
    const list = out[row.target_id] ?? [];
    list.push({
      memoId: row.memo_id,
      bodyMd: row.body_md,
      snippet: row.snippet ?? null,
      blockIndex: row.block_index ?? null,
      cumOffset: row.cum_offset ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      isMine: row.user_id === userId,
    });
    out[row.target_id] = list;
  }
  return out;
}

// 대시보드 즐겨찾기 빠른 접근 위젯용 — star_level 높은 순.
export interface QuickBookmarkItem {
  targetType: AnnotationTargetType;
  targetId: string;
  starLevel: number;
  // type 별 표시 라벨 + href.
  label: string;
  href: string;
  subject: string | null;
}

export async function listTopBookmarks(
  client: SupabaseClient<Database>,
  userId: string,
  limit = 8,
): Promise<QuickBookmarkItem[]> {
  const { data: rows, error } = await client
    .from("user_bookmarks")
    .select("target_type, target_id, star_level")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .gt("star_level", 0)
    .order("star_level", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const list = rows ?? [];
  if (list.length === 0) return [];

  const articleIds = list
    .filter((r) => r.target_type === "article")
    .map((r) => r.target_id);
  const caseIds = list
    .filter((r) => r.target_type === "case")
    .map((r) => r.target_id);
  const problemIds = list
    .filter((r) => r.target_type === "problem")
    .map((r) => r.target_id);

  const { articleSlug } = await import("~/features/laws/lib/identifier");
  const articleMap = new Map<
    string,
    { displayLabel: string; lawCode: string; pathSlug: string }
  >();
  if (articleIds.length > 0) {
    const { data: rs } = await client
      .from("articles")
      .select("article_id, article_number, display_label, laws!inner(law_code)")
      .in("article_id", articleIds);
    for (const r of rs ?? []) {
      if (!r.article_number) continue;
      articleMap.set(r.article_id, {
        displayLabel: r.display_label,
        lawCode: r.laws.law_code,
        pathSlug: articleSlug(r.article_number),
      });
    }
  }

  const caseMap = new Map<string, { caseNumber: string; lawCode: string }>();
  if (caseIds.length > 0) {
    const { data: rs } = await client
      .from("cases")
      .select("case_id, case_number, subject_laws")
      .in("case_id", caseIds);
    for (const r of rs ?? []) {
      caseMap.set(r.case_id, {
        caseNumber: r.case_number,
        lawCode: (r.subject_laws as string[] | null)?.[0] ?? "patent",
      });
    }
  }

  const problemMap = new Map<
    string,
    {
      year: number | null;
      problemNumber: number | null;
      lawCode: string | null;
      scienceSubject: string | null;
    }
  >();
  if (problemIds.length > 0) {
    const { data: rs } = await client
      .from("problems")
      .select("problem_id, year, problem_number, science_subject, laws(law_code)")
      .in("problem_id", problemIds);
    for (const r of rs ?? []) {
      problemMap.set(r.problem_id, {
        year: r.year,
        problemNumber: r.problem_number,
        lawCode: r.laws?.law_code ?? null,
        scienceSubject: r.science_subject,
      });
    }
  }

  return list.flatMap((r): QuickBookmarkItem[] => {
    if (r.target_type === "article") {
      const a = articleMap.get(r.target_id);
      if (!a) return [];
      return [
        {
          targetType: "article",
          targetId: r.target_id,
          starLevel: r.star_level,
          label: a.displayLabel,
          href: `/subjects/${a.lawCode}/articles/${a.pathSlug}`,
          subject: a.lawCode,
        },
      ];
    }
    if (r.target_type === "case") {
      const c = caseMap.get(r.target_id);
      if (!c) return [];
      return [
        {
          targetType: "case",
          targetId: r.target_id,
          starLevel: r.star_level,
          label: c.caseNumber,
          href: `/subjects/${c.lawCode}/cases/${r.target_id}`,
          subject: c.lawCode,
        },
      ];
    }
    if (r.target_type === "problem") {
      const p = problemMap.get(r.target_id);
      if (!p) return [];
      const sci = p.scienceSubject;
      if (!p.lawCode && !sci) return [];
      const yearLabel = p.year
        ? `${p.year}년${p.problemNumber ? ` · ${p.problemNumber}번` : ""}`
        : "문제";
      return [
        {
          targetType: "problem",
          targetId: r.target_id,
          starLevel: r.star_level,
          label: sci ? `${scienceSubjectName(sci)} ${yearLabel}` : yearLabel,
          href: sci
            ? scienceProblemHref(sci, r.target_id)
            : `/subjects/${p.lawCode}/problems/${r.target_id}`,
          subject: sci ? "science" : p.lawCode,
        },
      ];
    }
    return [];
  });
}

// 즐겨찾기 모음 페이지(`/study/bookmarks`) 용 — 5개 target 전부 fetch.
// limit 없이 deleted_at IS NULL && star_level > 0 전부 — 별점 매긴 항목만.
export interface BookmarkListItem {
  bookmarkId: string;
  targetType: AnnotationTargetType;
  targetId: string;
  starLevel: number;
  notePreview: string | null;
  updatedAt: string;
  // 표시 정보.
  lawCode: string | null;
  primaryLabel: string;
  secondaryLabel: string | null;
  bodySnippet: string | null;
  href: string;
  // OX(choice/box) 의 경우 정답 O/X 표시용.
  oxTruth: "O" | "X" | null;
}

export async function listAllBookmarks(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<BookmarkListItem[]> {
  const { data: rows, error } = await client
    .from("user_bookmarks")
    .select(
      "bookmark_id, target_type, target_id, star_level, note_md, step_notes, updated_at",
    )
    .eq("user_id", userId)
    .is("deleted_at", null)
    .gt("star_level", 0)
    .order("star_level", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(2000);
  if (error) throw error;
  const list = rows ?? [];
  if (list.length === 0) return [];

  const articleIds = list
    .filter((r) => r.target_type === "article")
    .map((r) => r.target_id);
  const caseIds = list
    .filter((r) => r.target_type === "case")
    .map((r) => r.target_id);
  const problemIds = list
    .filter((r) => r.target_type === "problem")
    .map((r) => r.target_id);
  const choiceIds = list
    .filter((r) => r.target_type === "problem_choice")
    .map((r) => r.target_id);
  const boxItemIds = list
    .filter((r) => r.target_type === "problem_box_item")
    .map((r) => r.target_id);

  const { articleSlug } = await import("~/features/laws/lib/identifier");
  // article
  const articleMap = new Map<
    string,
    {
      displayLabel: string;
      articleNumber: string | null;
      lawCode: string;
      pathSlug: string;
    }
  >();
  if (articleIds.length > 0) {
    const { data: rs } = await client
      .from("articles")
      .select("article_id, article_number, display_label, laws!inner(law_code)")
      .in("article_id", articleIds);
    for (const r of rs ?? []) {
      if (!r.article_number) continue;
      articleMap.set(r.article_id, {
        displayLabel: r.display_label,
        articleNumber: r.article_number,
        lawCode: r.laws.law_code,
        pathSlug: articleSlug(r.article_number),
      });
    }
  }
  // case
  const caseMap = new Map<
    string,
    { caseNumber: string; caseTitle: string | null; lawCode: string }
  >();
  if (caseIds.length > 0) {
    const { data: rs } = await client
      .from("cases")
      .select("case_id, case_number, case_title, subject_laws")
      .in("case_id", caseIds);
    for (const r of rs ?? []) {
      caseMap.set(r.case_id, {
        caseNumber: r.case_number,
        caseTitle: r.case_title,
        lawCode: (r.subject_laws as string[] | null)?.[0] ?? "patent",
      });
    }
  }
  // problem_choice / box_item → 부모 problem 으로 viewer 진입. 본문 발췌 + ox_truth 도 보존.
  const choiceProblemMap = new Map<
    string,
    { problemId: string; bodyMd: string | null; oxTruth: "O" | "X" | null }
  >();
  if (choiceIds.length > 0) {
    const { data: cs } = await client
      .from("problem_choices")
      .select("choice_id, problem_id, body_md, ox_truth")
      .in("choice_id", choiceIds);
    for (const c of cs ?? []) {
      choiceProblemMap.set(c.choice_id, {
        problemId: c.problem_id,
        bodyMd: c.body_md,
        oxTruth: c.ox_truth as "O" | "X" | null,
      });
    }
  }
  const boxItemProblemMap = new Map<
    string,
    {
      problemId: string;
      bodyMd: string | null;
      marker: string | null;
      oxTruth: "O" | "X" | null;
    }
  >();
  if (boxItemIds.length > 0) {
    const { data: bs } = await client
      .from("problem_box_items")
      .select("box_item_id, problem_id, body_md, marker, ox_truth")
      .in("box_item_id", boxItemIds);
    for (const b of bs ?? []) {
      boxItemProblemMap.set(b.box_item_id, {
        problemId: b.problem_id,
        bodyMd: b.body_md,
        marker: b.marker,
        oxTruth: b.ox_truth as "O" | "X" | null,
      });
    }
  }

  // problem 정보 — bookmark target 인 problem + 위 choice/box 의 부모 problem 모두 포함.
  const problemMap = new Map<
    string,
    {
      year: number | null;
      problemNumber: number | null;
      bodySnippet: string;
      lawCode: string | null;
      scienceSubject: string | null;
    }
  >();
  const allProblemIds = new Set<string>(problemIds);
  for (const v of choiceProblemMap.values()) allProblemIds.add(v.problemId);
  for (const v of boxItemProblemMap.values()) allProblemIds.add(v.problemId);
  if (allProblemIds.size > 0) {
    const { data: ps } = await client
      .from("problems")
      .select(
        "problem_id, year, problem_number, body_md, science_subject, laws(law_code)",
      )
      .in("problem_id", [...allProblemIds]);
    for (const p of ps ?? []) {
      const body = p.body_md ?? "";
      problemMap.set(p.problem_id, {
        year: p.year,
        problemNumber: p.problem_number,
        bodySnippet: body.length > 80 ? `${body.slice(0, 80)}…` : body,
        lawCode: p.laws?.law_code ?? null,
        scienceSubject: p.science_subject,
      });
    }
  }

  function notePreview(
    noteMd: string | null,
    stepNotes: unknown,
  ): string | null {
    if (noteMd && noteMd.trim().length > 0) {
      const t = noteMd.trim().replace(/\s+/g, " ");
      return t.length > 80 ? `${t.slice(0, 80)}…` : t;
    }
    if (
      stepNotes &&
      typeof stepNotes === "object" &&
      !Array.isArray(stepNotes)
    ) {
      // 가장 최근 단계 메모.
      for (const key of ["5", "4", "3", "2", "1"] as const) {
        const v = (stepNotes as Record<string, unknown>)[key];
        if (typeof v === "string" && v.trim().length > 0) {
          const t = v.trim().replace(/\s+/g, " ");
          return t.length > 80 ? `${t.slice(0, 80)}…` : t;
        }
      }
    }
    return null;
  }

  return list.flatMap((r): BookmarkListItem[] => {
    const preview = notePreview(r.note_md, r.step_notes);
    if (r.target_type === "article") {
      const a = articleMap.get(r.target_id);
      if (!a) return [];
      return [
        {
          bookmarkId: r.bookmark_id,
          targetType: "article",
          targetId: r.target_id,
          starLevel: r.star_level,
          notePreview: preview,
          updatedAt: r.updated_at,
          lawCode: a.lawCode,
          primaryLabel: a.displayLabel,
          secondaryLabel: a.articleNumber
            ? articleDisplayPrefix(a.articleNumber)
            : null,
          bodySnippet: null,
          href: `/subjects/${a.lawCode}/articles/${a.pathSlug}`,
          oxTruth: null,
        },
      ];
    }
    if (r.target_type === "case") {
      const c = caseMap.get(r.target_id);
      if (!c) return [];
      return [
        {
          bookmarkId: r.bookmark_id,
          targetType: "case",
          targetId: r.target_id,
          starLevel: r.star_level,
          notePreview: preview,
          updatedAt: r.updated_at,
          lawCode: c.lawCode,
          primaryLabel: c.caseTitle ?? c.caseNumber,
          secondaryLabel: c.caseTitle ? c.caseNumber : null,
          bodySnippet: null,
          href: `/subjects/${c.lawCode}/cases/${r.target_id}`,
          oxTruth: null,
        },
      ];
    }
    if (r.target_type === "problem") {
      const p = problemMap.get(r.target_id);
      if (!p) return [];
      const sci = p.scienceSubject;
      if (!p.lawCode && !sci) return [];
      const yearLabel = p.year
        ? `${p.year}년${p.problemNumber ? ` · ${p.problemNumber}번` : ""}`
        : "문제";
      return [
        {
          bookmarkId: r.bookmark_id,
          targetType: "problem",
          targetId: r.target_id,
          starLevel: r.star_level,
          notePreview: preview,
          updatedAt: r.updated_at,
          lawCode: sci ? null : p.lawCode,
          primaryLabel: yearLabel,
          secondaryLabel: sci ? scienceSubjectName(sci) : null,
          bodySnippet: p.bodySnippet,
          href: sci
            ? scienceProblemHref(sci, r.target_id)
            : `/subjects/${p.lawCode}/problems/${r.target_id}`,
          oxTruth: null,
        },
      ];
    }
    if (r.target_type === "problem_choice") {
      const c = choiceProblemMap.get(r.target_id);
      if (!c) return [];
      const p = problemMap.get(c.problemId);
      if (!p) return [];
      const body = c.bodyMd ?? "";
      return [
        {
          bookmarkId: r.bookmark_id,
          targetType: "problem_choice",
          targetId: r.target_id,
          starLevel: r.star_level,
          notePreview: preview,
          updatedAt: r.updated_at,
          lawCode: p.lawCode,
          primaryLabel: `정오문제 지문`,
          secondaryLabel: p.year
            ? `${p.year}년${p.problemNumber ? ` · ${p.problemNumber}번` : ""}`
            : "문제",
          bodySnippet: body.length > 120 ? `${body.slice(0, 120)}…` : body,
          href: `/subjects/${p.lawCode}/problems/${c.problemId}`,
          oxTruth: c.oxTruth,
        },
      ];
    }
    if (r.target_type === "problem_box_item") {
      const b = boxItemProblemMap.get(r.target_id);
      if (!b) return [];
      const p = problemMap.get(b.problemId);
      if (!p) return [];
      const raw = b.bodyMd ?? "";
      const body = b.marker ? `[${b.marker}] ${raw}` : raw;
      return [
        {
          bookmarkId: r.bookmark_id,
          targetType: "problem_box_item",
          targetId: r.target_id,
          starLevel: r.star_level,
          notePreview: preview,
          updatedAt: r.updated_at,
          lawCode: p.lawCode,
          primaryLabel: `정오문제 박스 항목`,
          secondaryLabel: p.year
            ? `${p.year}년${p.problemNumber ? ` · ${p.problemNumber}번` : ""}`
            : "문제",
          bodySnippet: body.length > 120 ? `${body.slice(0, 120)}…` : body,
          href: `/subjects/${p.lawCode}/problems/${b.problemId}`,
          oxTruth: b.oxTruth,
        },
      ];
    }
    return [];
  });
}

// 메모 모아보기 페이지(`/study/notes`) — 5 target type 전체.
// 메모 작성 시점이 최근 학습 활동의 지표 — 정렬: updated_at DESC.
export interface MemoListItem {
  memoId: string;
  targetType: AnnotationTargetType;
  targetId: string;
  bodyMd: string;
  snippet: string | null;
  createdAt: string;
  updatedAt: string;
  // 표시 정보.
  lawCode: string | null;
  primaryLabel: string;
  secondaryLabel: string | null;
  bodySnippet: string | null;
  href: string;
}

export async function listAllMemos(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<MemoListItem[]> {
  const { data: rows, error } = await client
    .from("user_memos")
    .select(
      "memo_id, target_type, target_id, body_md, snippet, created_at, updated_at",
    )
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(2000);
  if (error) throw error;
  const list = rows ?? [];
  if (list.length === 0) return [];

  const articleIds = list
    .filter((r) => r.target_type === "article")
    .map((r) => r.target_id);
  const caseIds = list
    .filter((r) => r.target_type === "case")
    .map((r) => r.target_id);
  const problemIds = list
    .filter((r) => r.target_type === "problem")
    .map((r) => r.target_id);
  const choiceIds = list
    .filter((r) => r.target_type === "problem_choice")
    .map((r) => r.target_id);
  const boxItemIds = list
    .filter((r) => r.target_type === "problem_box_item")
    .map((r) => r.target_id);

  const { articleSlug } = await import("~/features/laws/lib/identifier");
  const articleMap = new Map<
    string,
    {
      displayLabel: string;
      articleNumber: string | null;
      lawCode: string;
      pathSlug: string;
    }
  >();
  if (articleIds.length > 0) {
    const { data: rs } = await client
      .from("articles")
      .select("article_id, article_number, display_label, laws!inner(law_code)")
      .in("article_id", articleIds);
    for (const r of rs ?? []) {
      if (!r.article_number) continue;
      articleMap.set(r.article_id, {
        displayLabel: r.display_label,
        articleNumber: r.article_number,
        lawCode: r.laws.law_code,
        pathSlug: articleSlug(r.article_number),
      });
    }
  }
  const caseMap = new Map<
    string,
    { caseNumber: string; caseTitle: string | null; lawCode: string }
  >();
  if (caseIds.length > 0) {
    const { data: rs } = await client
      .from("cases")
      .select("case_id, case_number, case_title, subject_laws")
      .in("case_id", caseIds);
    for (const r of rs ?? []) {
      caseMap.set(r.case_id, {
        caseNumber: r.case_number,
        caseTitle: r.case_title,
        lawCode: (r.subject_laws as string[] | null)?.[0] ?? "patent",
      });
    }
  }
  // choice / box → 부모 problem.
  const choiceParentMap = new Map<
    string,
    { problemId: string; bodyMd: string | null }
  >();
  if (choiceIds.length > 0) {
    const { data: cs } = await client
      .from("problem_choices")
      .select("choice_id, problem_id, body_md")
      .in("choice_id", choiceIds);
    for (const c of cs ?? [])
      choiceParentMap.set(c.choice_id, {
        problemId: c.problem_id,
        bodyMd: c.body_md,
      });
  }
  const boxParentMap = new Map<
    string,
    { problemId: string; bodyMd: string | null; marker: string | null }
  >();
  if (boxItemIds.length > 0) {
    const { data: bs } = await client
      .from("problem_box_items")
      .select("box_item_id, problem_id, body_md, marker")
      .in("box_item_id", boxItemIds);
    for (const b of bs ?? [])
      boxParentMap.set(b.box_item_id, {
        problemId: b.problem_id,
        bodyMd: b.body_md,
        marker: b.marker,
      });
  }
  const problemMap = new Map<
    string,
    {
      year: number | null;
      problemNumber: number | null;
      bodySnippet: string;
      lawCode: string | null;
      scienceSubject: string | null;
    }
  >();
  const allProblemIds = new Set<string>(problemIds);
  for (const v of choiceParentMap.values()) allProblemIds.add(v.problemId);
  for (const v of boxParentMap.values()) allProblemIds.add(v.problemId);
  if (allProblemIds.size > 0) {
    const { data: ps } = await client
      .from("problems")
      .select(
        "problem_id, year, problem_number, body_md, science_subject, laws(law_code)",
      )
      .in("problem_id", [...allProblemIds]);
    for (const p of ps ?? []) {
      const body = p.body_md ?? "";
      problemMap.set(p.problem_id, {
        year: p.year,
        problemNumber: p.problem_number,
        bodySnippet: body.length > 80 ? `${body.slice(0, 80)}…` : body,
        lawCode: p.laws?.law_code ?? null,
        scienceSubject: p.science_subject,
      });
    }
  }

  return list.flatMap((r): MemoListItem[] => {
    const base = {
      memoId: r.memo_id,
      targetType: r.target_type,
      targetId: r.target_id,
      bodyMd: r.body_md,
      snippet: r.snippet ?? null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
    if (r.target_type === "article") {
      const a = articleMap.get(r.target_id);
      if (!a) return [];
      return [
        {
          ...base,
          lawCode: a.lawCode,
          primaryLabel: a.displayLabel,
          secondaryLabel: a.articleNumber
            ? articleDisplayPrefix(a.articleNumber)
            : null,
          bodySnippet: null,
          href: `/subjects/${a.lawCode}/articles/${a.pathSlug}`,
        },
      ];
    }
    if (r.target_type === "case") {
      const c = caseMap.get(r.target_id);
      if (!c) return [];
      return [
        {
          ...base,
          lawCode: c.lawCode,
          primaryLabel: c.caseTitle ?? c.caseNumber,
          secondaryLabel: c.caseTitle ? c.caseNumber : null,
          bodySnippet: null,
          href: `/subjects/${c.lawCode}/cases/${r.target_id}`,
        },
      ];
    }
    if (r.target_type === "problem") {
      const p = problemMap.get(r.target_id);
      if (!p) return [];
      const sci = p.scienceSubject;
      if (!p.lawCode && !sci) return [];
      const yearLabel = p.year
        ? `${p.year}년${p.problemNumber ? ` · ${p.problemNumber}번` : ""}`
        : "문제";
      return [
        {
          ...base,
          lawCode: sci ? null : p.lawCode,
          primaryLabel: yearLabel,
          secondaryLabel: sci ? scienceSubjectName(sci) : null,
          bodySnippet: p.bodySnippet,
          href: sci
            ? scienceProblemHref(sci, r.target_id)
            : `/subjects/${p.lawCode}/problems/${r.target_id}`,
        },
      ];
    }
    if (r.target_type === "problem_choice") {
      const c = choiceParentMap.get(r.target_id);
      if (!c) return [];
      const p = problemMap.get(c.problemId);
      if (!p) return [];
      const body = c.bodyMd ?? "";
      return [
        {
          ...base,
          lawCode: p.lawCode,
          primaryLabel: "정오문제 지문",
          secondaryLabel: p.year
            ? `${p.year}년${p.problemNumber ? ` · ${p.problemNumber}번` : ""}`
            : "문제",
          bodySnippet: body.length > 120 ? `${body.slice(0, 120)}…` : body,
          href: `/subjects/${p.lawCode}/problems/${c.problemId}`,
        },
      ];
    }
    if (r.target_type === "problem_box_item") {
      const b = boxParentMap.get(r.target_id);
      if (!b) return [];
      const p = problemMap.get(b.problemId);
      if (!p) return [];
      const raw = b.bodyMd ?? "";
      const body = b.marker ? `[${b.marker}] ${raw}` : raw;
      return [
        {
          ...base,
          lawCode: p.lawCode,
          primaryLabel: "정오문제 박스 항목",
          secondaryLabel: p.year
            ? `${p.year}년${p.problemNumber ? ` · ${p.problemNumber}번` : ""}`
            : "문제",
          bodySnippet: body.length > 120 ? `${body.slice(0, 120)}…` : body,
          href: `/subjects/${p.lawCode}/problems/${b.problemId}`,
        },
      ];
    }
    return [];
  });
}

// 하이라이트 모아보기 페이지(`/study/highlights`) — 5 target type 전체.
// 정렬: created_at DESC. label 컬럼이 발췌 텍스트.
export interface HighlightListItem {
  highlightId: string;
  targetType: AnnotationTargetType;
  targetId: string;
  color: HighlightColor;
  excerpt: string;
  // 하이라이트 앞·뒤 문맥(±30자, 작성 시 캡처). 구 데이터는 null — 문맥 없이 발췌만 표시.
  beforeCtx: string | null;
  afterCtx: string | null;
  fieldPath: string;
  createdAt: string;
  lawCode: string | null;
  primaryLabel: string;
  secondaryLabel: string | null;
  bodySnippet: string | null;
  href: string;
}

export async function listAllHighlights(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<HighlightListItem[]> {
  const { data: rows, error } = await client
    .from("user_highlights")
    .select(
      "highlight_id, target_type, target_id, color, label, before_ctx, after_ctx, field_path, created_at",
    )
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) throw error;
  const list = rows ?? [];
  if (list.length === 0) return [];

  const articleIds = list
    .filter((r) => r.target_type === "article")
    .map((r) => r.target_id);
  const caseIds = list
    .filter((r) => r.target_type === "case")
    .map((r) => r.target_id);
  const problemIds = list
    .filter((r) => r.target_type === "problem")
    .map((r) => r.target_id);
  const choiceIds = list
    .filter((r) => r.target_type === "problem_choice")
    .map((r) => r.target_id);
  const boxItemIds = list
    .filter((r) => r.target_type === "problem_box_item")
    .map((r) => r.target_id);

  const { articleSlug } = await import("~/features/laws/lib/identifier");
  const articleMap = new Map<
    string,
    {
      displayLabel: string;
      articleNumber: string | null;
      lawCode: string;
      pathSlug: string;
    }
  >();
  if (articleIds.length > 0) {
    const { data: rs } = await client
      .from("articles")
      .select("article_id, article_number, display_label, laws!inner(law_code)")
      .in("article_id", articleIds);
    for (const r of rs ?? []) {
      if (!r.article_number) continue;
      articleMap.set(r.article_id, {
        displayLabel: r.display_label,
        articleNumber: r.article_number,
        lawCode: r.laws.law_code,
        pathSlug: articleSlug(r.article_number),
      });
    }
  }
  const caseMap = new Map<
    string,
    { caseNumber: string; caseTitle: string | null; lawCode: string }
  >();
  if (caseIds.length > 0) {
    const { data: rs } = await client
      .from("cases")
      .select("case_id, case_number, case_title, subject_laws")
      .in("case_id", caseIds);
    for (const r of rs ?? []) {
      caseMap.set(r.case_id, {
        caseNumber: r.case_number,
        caseTitle: r.case_title,
        lawCode: (r.subject_laws as string[] | null)?.[0] ?? "patent",
      });
    }
  }
  const choiceParentMap = new Map<
    string,
    { problemId: string; bodyMd: string | null }
  >();
  if (choiceIds.length > 0) {
    const { data: cs } = await client
      .from("problem_choices")
      .select("choice_id, problem_id, body_md")
      .in("choice_id", choiceIds);
    for (const c of cs ?? [])
      choiceParentMap.set(c.choice_id, {
        problemId: c.problem_id,
        bodyMd: c.body_md,
      });
  }
  const boxParentMap = new Map<
    string,
    { problemId: string; bodyMd: string | null; marker: string | null }
  >();
  if (boxItemIds.length > 0) {
    const { data: bs } = await client
      .from("problem_box_items")
      .select("box_item_id, problem_id, body_md, marker")
      .in("box_item_id", boxItemIds);
    for (const b of bs ?? [])
      boxParentMap.set(b.box_item_id, {
        problemId: b.problem_id,
        bodyMd: b.body_md,
        marker: b.marker,
      });
  }
  const problemMap = new Map<
    string,
    {
      year: number | null;
      problemNumber: number | null;
      bodySnippet: string;
      lawCode: string | null;
      scienceSubject: string | null;
    }
  >();
  const allProblemIds = new Set<string>(problemIds);
  for (const v of choiceParentMap.values()) allProblemIds.add(v.problemId);
  for (const v of boxParentMap.values()) allProblemIds.add(v.problemId);
  if (allProblemIds.size > 0) {
    const { data: ps } = await client
      .from("problems")
      .select(
        "problem_id, year, problem_number, body_md, science_subject, laws(law_code)",
      )
      .in("problem_id", [...allProblemIds]);
    for (const p of ps ?? []) {
      const body = p.body_md ?? "";
      problemMap.set(p.problem_id, {
        year: p.year,
        problemNumber: p.problem_number,
        bodySnippet: body.length > 80 ? `${body.slice(0, 80)}…` : body,
        lawCode: p.laws?.law_code ?? null,
        scienceSubject: p.science_subject,
      });
    }
  }

  return list.flatMap((r): HighlightListItem[] => {
    const base = {
      highlightId: r.highlight_id,
      targetType: r.target_type,
      targetId: r.target_id,
      color: r.color as HighlightColor,
      excerpt: r.label ?? "",
      beforeCtx: r.before_ctx,
      afterCtx: r.after_ctx,
      fieldPath: r.field_path,
      createdAt: r.created_at,
    };
    if (r.target_type === "article") {
      const a = articleMap.get(r.target_id);
      if (!a) return [];
      return [
        {
          ...base,
          lawCode: a.lawCode,
          primaryLabel: a.displayLabel,
          secondaryLabel: a.articleNumber
            ? articleDisplayPrefix(a.articleNumber)
            : null,
          bodySnippet: null,
          href: `/subjects/${a.lawCode}/articles/${a.pathSlug}`,
        },
      ];
    }
    if (r.target_type === "case") {
      const c = caseMap.get(r.target_id);
      if (!c) return [];
      return [
        {
          ...base,
          lawCode: c.lawCode,
          primaryLabel: c.caseTitle ?? c.caseNumber,
          secondaryLabel: c.caseTitle ? c.caseNumber : null,
          bodySnippet: null,
          href: `/subjects/${c.lawCode}/cases/${r.target_id}`,
        },
      ];
    }
    if (r.target_type === "problem") {
      const p = problemMap.get(r.target_id);
      if (!p) return [];
      const sci = p.scienceSubject;
      if (!p.lawCode && !sci) return [];
      const yearLabel = p.year
        ? `${p.year}년${p.problemNumber ? ` · ${p.problemNumber}번` : ""}`
        : "문제";
      return [
        {
          ...base,
          lawCode: sci ? null : p.lawCode,
          primaryLabel: yearLabel,
          secondaryLabel: sci ? scienceSubjectName(sci) : null,
          bodySnippet: p.bodySnippet,
          href: sci
            ? scienceProblemHref(sci, r.target_id)
            : `/subjects/${p.lawCode}/problems/${r.target_id}`,
        },
      ];
    }
    if (r.target_type === "problem_choice") {
      const c = choiceParentMap.get(r.target_id);
      if (!c) return [];
      const p = problemMap.get(c.problemId);
      if (!p) return [];
      const body = c.bodyMd ?? "";
      return [
        {
          ...base,
          lawCode: p.lawCode,
          primaryLabel: "정오문제 지문",
          secondaryLabel: p.year
            ? `${p.year}년${p.problemNumber ? ` · ${p.problemNumber}번` : ""}`
            : "문제",
          bodySnippet: body.length > 120 ? `${body.slice(0, 120)}…` : body,
          href: `/subjects/${p.lawCode}/problems/${c.problemId}`,
        },
      ];
    }
    if (r.target_type === "problem_box_item") {
      const b = boxParentMap.get(r.target_id);
      if (!b) return [];
      const p = problemMap.get(b.problemId);
      if (!p) return [];
      const raw = b.bodyMd ?? "";
      const body = b.marker ? `[${b.marker}] ${raw}` : raw;
      return [
        {
          ...base,
          lawCode: p.lawCode,
          primaryLabel: "정오문제 박스 항목",
          secondaryLabel: p.year
            ? `${p.year}년${p.problemNumber ? ` · ${p.problemNumber}번` : ""}`
            : "문제",
          bodySnippet: body.length > 120 ? `${body.slice(0, 120)}…` : body,
          href: `/subjects/${p.lawCode}/problems/${b.problemId}`,
        },
      ];
    }
    return [];
  });
}

// 즐겨찾기 문제 ID 만 — 세션 시작용. 정렬: star DESC, updated_at DESC.
// lawCode 가 주어지면 그 과목 problem 만. minStar 미지정 = 1.
export interface BookmarkedProblemRef {
  problemId: string;
  lawCode: string;
  starLevel: number;
}

export async function listBookmarkedProblems(
  client: SupabaseClient<Database>,
  userId: string,
  opts: { lawCode?: string; minStar?: number } = {},
): Promise<BookmarkedProblemRef[]> {
  const minStar = opts.minStar ?? 1;
  const { data: rows, error } = await client
    .from("user_bookmarks")
    .select("target_id, star_level, updated_at")
    .eq("user_id", userId)
    .eq("target_type", "problem")
    .is("deleted_at", null)
    .gte("star_level", minStar)
    .order("star_level", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(2000);
  if (error) throw error;
  const list = rows ?? [];
  if (list.length === 0) return [];

  const { data: ps } = await client
    .from("problems")
    .select("problem_id, deleted_at, laws!inner(law_code)")
    .in(
      "problem_id",
      list.map((r) => r.target_id),
    );
  const lawByProblem = new Map<string, string>();
  for (const p of ps ?? []) {
    if (p.deleted_at) continue;
    lawByProblem.set(p.problem_id, p.laws.law_code);
  }

  const out: BookmarkedProblemRef[] = [];
  for (const r of list) {
    const lawCode = lawByProblem.get(r.target_id);
    if (!lawCode) continue;
    if (opts.lawCode && lawCode !== opts.lawCode) continue;
    out.push({
      problemId: r.target_id,
      lawCode,
      starLevel: r.star_level,
    });
  }
  return out;
}

// 즐겨찾기(별점>0) 판례 ID 목록 — 과목 판례 색인 "즐겨찾기만 보기" 필터용.
// 과목 무관 전체 반환 — 호출부(listCasesBySubject filterCaseIds)가 과목으로 다시 한정.
export async function listBookmarkedCaseIds(
  client: SupabaseClient<Database>,
  userId: string,
  minStar = 1,
): Promise<string[]> {
  const { data, error } = await client
    .from("user_bookmarks")
    .select("target_id")
    .eq("user_id", userId)
    .eq("target_type", "case")
    .is("deleted_at", null)
    .gte("star_level", minStar);
  if (error) throw error;
  return (data ?? []).map((r) => r.target_id);
}

export async function getBookmark(
  client: SupabaseClient<Database>,
  userId: string,
  targetType: AnnotationTargetType,
  targetId: string,
): Promise<BookmarkRecord | null> {
  const { data, error } = await client
    .from("user_bookmarks")
    .select("bookmark_id, star_level, note_md, step_notes, updated_at")
    .eq("user_id", userId)
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return {
    bookmarkId: data.bookmark_id,
    starLevel: data.star_level,
    noteMd: data.note_md,
    stepNotes: parseStepNotes(data.step_notes),
    updatedAt: data.updated_at,
  };
}

// 평점만 갱신. 단계별 메모는 건드리지 않는다.
export async function upsertBookmarkRating(
  client: SupabaseClient<Database>,
  userId: string,
  targetType: AnnotationTargetType,
  targetId: string,
  starLevel: number,
): Promise<BookmarkRecord> {
  const { data, error } = await client
    .from("user_bookmarks")
    .upsert(
      {
        user_id: userId,
        target_type: targetType,
        target_id: targetId,
        star_level: starLevel,
        deleted_at: null,
      },
      { onConflict: "user_id,target_type,target_id" },
    )
    .select("bookmark_id, star_level, note_md, step_notes, updated_at")
    .single();

  if (error) throw error;
  return {
    bookmarkId: data.bookmark_id,
    starLevel: data.star_level,
    noteMd: data.note_md,
    stepNotes: parseStepNotes(data.step_notes),
    updatedAt: data.updated_at,
  };
}

// 단계별 메모 한 칸 갱신/삭제. trim 후 비어있으면 해당 키 제거.
// 행이 없으면 starLevel = stepLevel 로 새로 만들어서 함께 저장.
export async function upsertBookmarkStepNote(
  client: SupabaseClient<Database>,
  userId: string,
  targetType: AnnotationTargetType,
  targetId: string,
  stepLevel: number,
  stepNote: string | null,
): Promise<BookmarkRecord> {
  const existing = await getBookmark(client, userId, targetType, targetId);
  const next: BookmarkStepNotes = { ...(existing?.stepNotes ?? {}) };
  const key = String(stepLevel) as "1" | "2" | "3" | "4" | "5";
  if (stepNote && stepNote.trim().length > 0) {
    next[key] = stepNote;
  } else {
    delete next[key];
  }

  const starLevel = existing?.starLevel ?? stepLevel;

  const { data, error } = await client
    .from("user_bookmarks")
    .upsert(
      {
        user_id: userId,
        target_type: targetType,
        target_id: targetId,
        star_level: starLevel,
        step_notes: next,
        deleted_at: null,
      },
      { onConflict: "user_id,target_type,target_id" },
    )
    .select("bookmark_id, star_level, note_md, step_notes, updated_at")
    .single();

  if (error) throw error;
  return {
    bookmarkId: data.bookmark_id,
    starLevel: data.star_level,
    noteMd: data.note_md,
    stepNotes: parseStepNotes(data.step_notes),
    updatedAt: data.updated_at,
  };
}

export async function listMemos(
  client: SupabaseClient<Database>,
  userId: string,
  targetType: AnnotationTargetType,
  targetId: string,
): Promise<MemoRecord[]> {
  // 본인 + 강사 작성 포스트잇 모두 반환 (RLS 가 가시성 경계). isMine 으로 구분.
  const { data, error } = await client
    .from("user_memos")
    .select(
      "memo_id, user_id, body_md, snippet, block_index, cum_offset, created_at, updated_at",
    )
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row) => ({
    memoId: row.memo_id,
    bodyMd: row.body_md,
    snippet: row.snippet ?? null,
    blockIndex: row.block_index ?? null,
    cumOffset: row.cum_offset ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isMine: row.user_id === userId,
  }));
}

export async function createMemo(
  client: SupabaseClient<Database>,
  userId: string,
  targetType: AnnotationTargetType,
  targetId: string,
  bodyMd: string,
  snippet?: string | null,
  position?: { blockIndex: number; cumOffset: number } | null,
): Promise<MemoRecord> {
  const { data, error } = await client
    .from("user_memos")
    .insert({
      user_id: userId,
      target_type: targetType,
      target_id: targetId,
      body_md: bodyMd,
      snippet: snippet?.trim() ? snippet.trim() : null,
      block_index: position?.blockIndex ?? null,
      cum_offset: position?.cumOffset ?? null,
    })
    .select(
      "memo_id, body_md, snippet, block_index, cum_offset, created_at, updated_at",
    )
    .single();

  if (error) throw error;
  return {
    memoId: data.memo_id,
    bodyMd: data.body_md,
    snippet: data.snippet ?? null,
    blockIndex: data.block_index ?? null,
    cumOffset: data.cum_offset ?? null,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    isMine: true,
  };
}

interface HighlightInput {
  fieldPath: string;
  startOffset: number;
  endOffset: number;
  contentHash: string;
  color: HighlightColor;
  label: string | null;
  excerpt: string;
  // 자동 재앵커링용 컨텍스트 — Phase 2. 본문 수정 시 snippet + before/after 로
  // 새 위치를 단일 매치 탐색. null 이면 hash 검증만(legacy 데이터).
  snippet?: string | null;
  beforeCtx?: string | null;
  afterCtx?: string | null;
}

export async function listHighlights(
  client: SupabaseClient<Database>,
  userId: string,
  targetType: AnnotationTargetType,
  targetId: string,
): Promise<HighlightRecord[]> {
  // 본인 + 강사 작성 하이라이트 모두 반환 (RLS 가 가시성 경계). isMine 으로 구분.
  const { data, error } = await client
    .from("user_highlights")
    .select(
      "highlight_id, user_id, field_path, start_offset, end_offset, content_hash, color, label, snippet, before_ctx, after_ctx, created_at",
    )
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row) => ({
    highlightId: row.highlight_id,
    fieldPath: row.field_path,
    startOffset: row.start_offset,
    endOffset: row.end_offset,
    contentHash: row.content_hash,
    color: row.color as HighlightColor,
    label: row.label,
    createdAt: row.created_at,
    // excerpt 는 label(500자 truncate) — 표시용. reanchor 는 snippet 사용.
    excerpt: row.label ?? "",
    isMine: row.user_id === userId,
    snippet: row.snippet,
    beforeCtx: row.before_ctx,
    afterCtx: row.after_ctx,
  }));
}

export async function createHighlight(
  client: SupabaseClient<Database>,
  userId: string,
  targetType: AnnotationTargetType,
  targetId: string,
  input: HighlightInput,
): Promise<HighlightRecord> {
  // 발췌 텍스트는 label(500자 truncate, UI 표시용) + snippet(full, reanchor 용) 둘 다 저장.
  const { data, error } = await client
    .from("user_highlights")
    .insert({
      user_id: userId,
      target_type: targetType,
      target_id: targetId,
      field_path: input.fieldPath,
      start_offset: input.startOffset,
      end_offset: input.endOffset,
      content_hash: input.contentHash,
      color: input.color,
      label: input.excerpt.slice(0, 500),
      snippet: input.snippet ?? input.excerpt,
      before_ctx: input.beforeCtx ?? null,
      after_ctx: input.afterCtx ?? null,
    })
    .select(
      "highlight_id, field_path, start_offset, end_offset, content_hash, color, label, snippet, before_ctx, after_ctx, created_at",
    )
    .single();

  if (error) throw error;
  return {
    highlightId: data.highlight_id,
    fieldPath: data.field_path,
    startOffset: data.start_offset,
    endOffset: data.end_offset,
    contentHash: data.content_hash,
    color: data.color as HighlightColor,
    label: data.label,
    createdAt: data.created_at,
    excerpt: data.label ?? "",
    isMine: true,
    snippet: data.snippet,
    beforeCtx: data.before_ctx,
    afterCtx: data.after_ctx,
  };
}

export async function softDeleteHighlight(
  client: SupabaseClient<Database>,
  userId: string,
  highlightId: string,
): Promise<void> {
  const { error } = await client
    .from("user_highlights")
    .update({ deleted_at: new Date().toISOString() })
    .eq("highlight_id", highlightId)
    .eq("user_id", userId);

  if (error) throw error;
}

export async function softDeleteMemo(
  client: SupabaseClient<Database>,
  userId: string,
  memoId: string,
): Promise<void> {
  const { error } = await client
    .from("user_memos")
    .update({ deleted_at: new Date().toISOString() })
    .eq("memo_id", memoId)
    .eq("user_id", userId);

  if (error) throw error;
}
