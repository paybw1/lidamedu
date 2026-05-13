// 전역 검색 (⌘K Command Palette) — 조문/판례/문제/메모/즐겨찾기 통합.
// 각 도메인별 ILIKE 다중 컬럼 + 그룹별 최대 6건. 너무 짧은 query 는 빈 결과.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import { articleDisplayPrefix, articleSlug } from "~/features/laws/lib/identifier";

export interface SearchHit {
  group: "article" | "case" | "problem" | "memo" | "bookmark";
  id: string;
  primaryLabel: string;
  secondaryLabel: string | null;
  bodySnippet: string | null;
  href: string;
  lawCode: string | null;
}

export interface SearchResults {
  query: string;
  articles: SearchHit[];
  cases: SearchHit[];
  problems: SearchHit[];
  memos: SearchHit[];
  bookmarks: SearchHit[];
}

const GROUP_LIMIT = 6;
const MIN_QUERY_LEN = 1;
// 히스토리 기록 최소 길이 — 너무 짧은 부분 검색은 노이즈.
const HISTORY_RECORD_MIN_LEN = 2;
const HISTORY_LIST_LIMIT = 8;

export interface RecentSearch {
  query: string;
  searchCount: number;
  lastSearchedAt: string;
}

export async function listRecentSearches(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<RecentSearch[]> {
  const { data, error } = await client
    .from("user_search_history")
    .select("query, search_count, last_searched_at")
    .eq("user_id", userId)
    .order("last_searched_at", { ascending: false })
    .limit(HISTORY_LIST_LIMIT);
  if (error) return [];
  return (data ?? []).map((r) => ({
    query: r.query,
    searchCount: r.search_count,
    lastSearchedAt: r.last_searched_at,
  }));
}

export async function recordSearchQuery(
  client: SupabaseClient<Database>,
  userId: string,
  rawQuery: string,
): Promise<void> {
  const q = rawQuery.trim().slice(0, 100);
  if (q.length < HISTORY_RECORD_MIN_LEN) return;
  try {
    // 기존 행 있으면 count + 1 / 시간 갱신.
    const { data: existing } = await client
      .from("user_search_history")
      .select("history_id, search_count")
      .eq("user_id", userId)
      .eq("query", q)
      .maybeSingle();
    if (existing) {
      await client
        .from("user_search_history")
        .update({
          search_count: existing.search_count + 1,
          last_searched_at: new Date().toISOString(),
        })
        .eq("history_id", existing.history_id);
    } else {
      await client.from("user_search_history").insert({
        user_id: userId,
        query: q,
      });
    }
  } catch {
    // best-effort — 검색 실패와 무관.
  }
}

export async function clearSearchHistory(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<void> {
  await client.from("user_search_history").delete().eq("user_id", userId);
}

function escapeForIlike(s: string): string {
  return s.replaceAll("%", "").replaceAll(",", " ");
}

function snippet(text: string | null | undefined, len = 100): string | null {
  if (!text) return null;
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length === 0) return null;
  return trimmed.length > len ? `${trimmed.slice(0, len)}…` : trimmed;
}

export async function runGlobalSearch(
  client: SupabaseClient<Database>,
  userId: string | null,
  rawQuery: string,
): Promise<SearchResults> {
  const q = rawQuery.trim().slice(0, 100);
  const empty: SearchResults = {
    query: q,
    articles: [],
    cases: [],
    problems: [],
    memos: [],
    bookmarks: [],
  };
  if (q.length < MIN_QUERY_LEN) return empty;
  const pattern = `%${escapeForIlike(q)}%`;

  // articles — similarity ranked. RPC 가 조문 ID 만 반환 → label/href hydration.
  async function fetchArticles(): Promise<SearchHit[]> {
    const { data: ranked } = await client.rpc("search_articles_ranked", {
      q,
      lim: GROUP_LIMIT,
    });
    const ids = (ranked ?? []).map((r) => r.article_id);
    if (ids.length === 0) return [];
    const { data: rows } = await client
      .from("articles")
      .select(
        "article_id, article_number, display_label, laws!inner(law_code)",
      )
      .in("article_id", ids);
    const byId = new Map((rows ?? []).map((r) => [r.article_id, r] as const));
    // RPC ranking 순서 보존.
    return ids.flatMap((id): SearchHit[] => {
      const r = byId.get(id);
      if (!r || !r.article_number) return [];
      return [
        {
          group: "article",
          id: r.article_id,
          primaryLabel: r.display_label,
          secondaryLabel: articleDisplayPrefix(r.article_number),
          bodySnippet: null,
          href: `/subjects/${r.laws.law_code}/articles/${articleSlug(r.article_number)}`,
          lawCode: r.laws.law_code,
        },
      ];
    });
  }

  // cases — similarity ranked.
  async function fetchCases(): Promise<SearchHit[]> {
    const { data: ranked } = await client.rpc("search_cases_ranked", {
      q,
      lim: GROUP_LIMIT,
    });
    const ids = (ranked ?? []).map((r) => r.case_id);
    if (ids.length === 0) return [];
    const { data: rows } = await client
      .from("cases")
      .select(
        "case_id, case_number, case_title, summary_title, summary_body_md, subject_laws",
      )
      .in("case_id", ids);
    const byId = new Map((rows ?? []).map((r) => [r.case_id, r] as const));
    return ids.flatMap((id): SearchHit[] => {
      const r = byId.get(id);
      if (!r) return [];
      const lawCode = (r.subject_laws as string[] | null)?.[0] ?? "patent";
      return [
        {
          group: "case",
          id: r.case_id,
          primaryLabel: r.case_title ?? r.case_number,
          secondaryLabel: r.case_title ? r.case_number : r.summary_title,
          bodySnippet: snippet(r.summary_body_md),
          href: `/subjects/${lawCode}/cases/${r.case_id}`,
          lawCode,
        },
      ];
    });
  }

  // problems — similarity ranked.
  async function fetchProblems(): Promise<SearchHit[]> {
    const { data: ranked } = await client.rpc("search_problems_ranked", {
      q,
      lim: GROUP_LIMIT,
    });
    const ids = (ranked ?? []).map((r) => r.problem_id);
    if (ids.length === 0) return [];
    const { data: rows } = await client
      .from("problems")
      .select(
        "problem_id, year, problem_number, body_md, laws!inner(law_code)",
      )
      .in("problem_id", ids);
    const byId = new Map((rows ?? []).map((r) => [r.problem_id, r] as const));
    return ids.flatMap((id): SearchHit[] => {
      const r = byId.get(id);
      if (!r) return [];
      const yearLabel = r.year
        ? `${r.year}년${r.problem_number ? ` · ${r.problem_number}번` : ""}`
        : "문제";
      return [
        {
          group: "problem",
          id: r.problem_id,
          primaryLabel: yearLabel,
          secondaryLabel: null,
          bodySnippet: snippet(r.body_md),
          href: `/subjects/${r.laws.law_code}/problems/${r.problem_id}`,
          lawCode: r.laws.law_code,
        },
      ];
    });
  }

  // 본인 메모 — body_md / snippet.
  async function fetchMemos(): Promise<SearchHit[]> {
    if (!userId) return [];
    const { data } = await client
      .from("user_memos")
      .select("memo_id, target_type, target_id, body_md, snippet, updated_at")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .or(`body_md.ilike.${pattern},snippet.ilike.${pattern}`)
      .order("updated_at", { ascending: false })
      .limit(GROUP_LIMIT);
    const list = data ?? [];
    if (list.length === 0) return [];
    return resolveAnnotationHrefs(
      client,
      list.map((m) => ({
        id: m.memo_id,
        targetType: m.target_type,
        targetId: m.target_id,
        primary: m.snippet
          ? `메모: ${snippet(m.snippet, 60)}`
          : `메모: ${snippet(m.body_md, 60)}`,
        body: m.body_md,
      })),
      "memo",
    );
  }

  // 본인 즐겨찾기 — note_md 매칭.
  async function fetchBookmarks(): Promise<SearchHit[]> {
    if (!userId) return [];
    const { data } = await client
      .from("user_bookmarks")
      .select(
        "bookmark_id, target_type, target_id, star_level, note_md, updated_at",
      )
      .eq("user_id", userId)
      .is("deleted_at", null)
      .gt("star_level", 0)
      .ilike("note_md", pattern)
      .order("updated_at", { ascending: false })
      .limit(GROUP_LIMIT);
    const list = data ?? [];
    if (list.length === 0) return [];
    return resolveAnnotationHrefs(
      client,
      list.map((b) => ({
        id: b.bookmark_id,
        targetType: b.target_type,
        targetId: b.target_id,
        primary: `★${b.star_level}: ${snippet(b.note_md, 60)}`,
        body: b.note_md,
      })),
      "bookmark",
    );
  }

  const [articles, cases, problems, memos, bookmarks] = await Promise.all([
    fetchArticles(),
    fetchCases(),
    fetchProblems(),
    fetchMemos(),
    fetchBookmarks(),
  ]);
  return { query: q, articles, cases, problems, memos, bookmarks };
}

// 메모/즐겨찾기 의 target → 부모 entity 의 viewer href 매핑.
interface AnnotationStub {
  id: string;
  targetType: string;
  targetId: string;
  primary: string;
  body: string | null;
}

async function resolveAnnotationHrefs(
  client: SupabaseClient<Database>,
  list: AnnotationStub[],
  group: "memo" | "bookmark",
): Promise<SearchHit[]> {
  const articleIds = list.filter((l) => l.targetType === "article").map((l) => l.targetId);
  const caseIds = list.filter((l) => l.targetType === "case").map((l) => l.targetId);
  const problemIds = list.filter((l) => l.targetType === "problem").map((l) => l.targetId);
  const choiceIds = list.filter((l) => l.targetType === "problem_choice").map((l) => l.targetId);
  const boxIds = list.filter((l) => l.targetType === "problem_box_item").map((l) => l.targetId);

  const articleMap = new Map<string, { lawCode: string; pathSlug: string; label: string }>();
  if (articleIds.length > 0) {
    const { data } = await client
      .from("articles")
      .select("article_id, article_number, display_label, laws!inner(law_code)")
      .in("article_id", articleIds);
    for (const r of data ?? []) {
      if (!r.article_number) continue;
      articleMap.set(r.article_id, {
        lawCode: r.laws.law_code,
        pathSlug: articleSlug(r.article_number),
        label: r.display_label,
      });
    }
  }
  const caseMap = new Map<string, { lawCode: string; label: string }>();
  if (caseIds.length > 0) {
    const { data } = await client
      .from("cases")
      .select("case_id, case_number, case_title, subject_laws")
      .in("case_id", caseIds);
    for (const r of data ?? []) {
      caseMap.set(r.case_id, {
        lawCode: (r.subject_laws as string[] | null)?.[0] ?? "patent",
        label: r.case_title ?? r.case_number,
      });
    }
  }
  const choiceParent = new Map<string, string>();
  if (choiceIds.length > 0) {
    const { data } = await client
      .from("problem_choices")
      .select("choice_id, problem_id")
      .in("choice_id", choiceIds);
    for (const r of data ?? []) choiceParent.set(r.choice_id, r.problem_id);
  }
  const boxParent = new Map<string, string>();
  if (boxIds.length > 0) {
    const { data } = await client
      .from("problem_box_items")
      .select("box_item_id, problem_id")
      .in("box_item_id", boxIds);
    for (const r of data ?? []) boxParent.set(r.box_item_id, r.problem_id);
  }
  const allProblemIds = new Set<string>(problemIds);
  for (const v of choiceParent.values()) allProblemIds.add(v);
  for (const v of boxParent.values()) allProblemIds.add(v);
  const problemMap = new Map<
    string,
    { lawCode: string; label: string }
  >();
  if (allProblemIds.size > 0) {
    const { data } = await client
      .from("problems")
      .select("problem_id, year, problem_number, laws!inner(law_code)")
      .in("problem_id", [...allProblemIds]);
    for (const r of data ?? []) {
      const yearLabel = r.year
        ? `${r.year}년${r.problem_number ? ` · ${r.problem_number}번` : ""}`
        : "문제";
      problemMap.set(r.problem_id, {
        lawCode: r.laws.law_code,
        label: yearLabel,
      });
    }
  }

  return list.flatMap((l): SearchHit[] => {
    if (l.targetType === "article") {
      const a = articleMap.get(l.targetId);
      if (!a) return [];
      return [
        {
          group,
          id: l.id,
          primaryLabel: l.primary,
          secondaryLabel: a.label,
          bodySnippet: snippet(l.body),
          href: `/subjects/${a.lawCode}/articles/${a.pathSlug}`,
          lawCode: a.lawCode,
        },
      ];
    }
    if (l.targetType === "case") {
      const c = caseMap.get(l.targetId);
      if (!c) return [];
      return [
        {
          group,
          id: l.id,
          primaryLabel: l.primary,
          secondaryLabel: c.label,
          bodySnippet: snippet(l.body),
          href: `/subjects/${c.lawCode}/cases/${l.targetId}`,
          lawCode: c.lawCode,
        },
      ];
    }
    if (l.targetType === "problem") {
      const p = problemMap.get(l.targetId);
      if (!p) return [];
      return [
        {
          group,
          id: l.id,
          primaryLabel: l.primary,
          secondaryLabel: p.label,
          bodySnippet: snippet(l.body),
          href: `/subjects/${p.lawCode}/problems/${l.targetId}`,
          lawCode: p.lawCode,
        },
      ];
    }
    if (l.targetType === "problem_choice" || l.targetType === "problem_box_item") {
      const parentId =
        l.targetType === "problem_choice"
          ? choiceParent.get(l.targetId)
          : boxParent.get(l.targetId);
      if (!parentId) return [];
      const p = problemMap.get(parentId);
      if (!p) return [];
      return [
        {
          group,
          id: l.id,
          primaryLabel: l.primary,
          secondaryLabel: `${l.targetType === "problem_choice" ? "OX 지문" : "OX 박스"} · ${p.label}`,
          bodySnippet: snippet(l.body),
          href: `/subjects/${p.lawCode}/problems/${parentId}`,
          lawCode: p.lawCode,
        },
      ];
    }
    return [];
  });
}
