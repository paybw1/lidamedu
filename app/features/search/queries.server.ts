// 전역 검색 (⌘K Command Palette) — 조문/판례/문제/질의응답/도해특허법/메모/즐겨찾기 통합.
// 각 도메인별 ILIKE 다중 컬럼 + 그룹별 최대 6건. 너무 짧은 query 는 빈 결과.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import {
  DOHAE_LAW_CODE,
  type DohaeBlock,
  dohaeBlocksText,
  dohaeUnitHref,
} from "~/features/dohae/labels";
import { getDohaeUnitRefs } from "~/features/dohae/queries.server";
import { articleDisplayPrefix, articleSlug } from "~/features/laws/lib/identifier";
import { getStaffRole } from "~/features/laws/queries.server";

export interface SearchHit {
  group: "article" | "case" | "problem" | "qna" | "dohae" | "memo" | "bookmark";
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
  qna: SearchHit[];
  /** 도해특허법 유닛 — 로그인 사용자만 보인다(dohae_units RLS). */
  dohae: SearchHit[];
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

// 검색 범위 — title: 제목·라벨류만 / full: 본문 전체(요지·판시이유·평석·선지·해설).
export type SearchScope = "title" | "full";

// 본문 전체 검색 히트의 스니펫 — 검색어가 실제로 등장한 필드의 주변 문맥을 보여준다.
// (요지 첫머리만 보여주면 판시이유·평석 매칭이 왜 잡혔는지 알 수 없음.)
function matchSnippet(q: string, fields: Array<string | null | undefined>): string | null {
  const needle = q.toLowerCase();
  for (const f of fields) {
    if (!f) continue;
    const idx = f.toLowerCase().indexOf(needle);
    if (idx < 0) continue;
    const start = Math.max(0, idx - 40);
    const seg = f
      .slice(start, idx + q.length + 60)
      .replace(/\s+/g, " ")
      .trim();
    if (!seg) continue;
    return `${start > 0 ? "…" : ""}${seg}…`;
  }
  return null;
}

export async function runGlobalSearch(
  client: SupabaseClient<Database>,
  userId: string | null,
  rawQuery: string,
  scope: SearchScope = "title",
): Promise<SearchResults> {
  // 공백 정규화 — 복사한 검색어의 NBSP( )·중복/이형 공백을 일반 공백 1개로.
  //   (본문의 공백은 일반 space 라, 검색어에 NBSP 가 섞이면 ilike '%q%' 가 안 맞아 "검색 안 됨".)
  const q = rawQuery.replace(/\s+/g, " ").trim().slice(0, 100);
  const empty: SearchResults = {
    query: q,
    articles: [],
    cases: [],
    problems: [],
    qna: [],
    dohae: [],
    memos: [],
    bookmarks: [],
  };
  if (q.length < MIN_QUERY_LEN) return empty;
  const pattern = `%${escapeForIlike(q)}%`;
  // 주관식(2차)은 고도화 전까지 staff 전용 — 검색 결과에서도 학생에겐 제외.
  const viewerIsStaff = userId ? (await getStaffRole(client, userId)) !== null : false;

  // articles — similarity ranked. RPC 가 조문 ID 만 반환 → label/href hydration.
  async function fetchArticles(): Promise<SearchHit[]> {
    const { data: ranked } = await client.rpc("search_articles_ranked", {
      q,
      lim: GROUP_LIMIT,
      search_scope: scope,
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

  // cases — similarity ranked. full 범위는 매칭 문맥 스니펫(판시이유·평석 포함).
  async function fetchCases(): Promise<SearchHit[]> {
    const { data: ranked } = await client.rpc("search_cases_ranked", {
      q,
      lim: GROUP_LIMIT,
      search_scope: scope,
    });
    const ids = (ranked ?? []).map((r) => r.case_id);
    if (ids.length === 0) return [];
    const { data: rows } = await client
      .from("cases")
      .select(
        "case_id, case_number, case_title, summary_title, summary_body_md, reasoning_md, comment_body_md, related_md, subject_laws",
      )
      .in("case_id", ids);
    const byId = new Map((rows ?? []).map((r) => [r.case_id, r] as const));
    return ids.flatMap((id): SearchHit[] => {
      const r = byId.get(id);
      if (!r) return [];
      const lawCode = (r.subject_laws as string[] | null)?.[0] ?? "patent";
      const bodySnippet =
        scope === "full"
          ? (matchSnippet(q, [
              r.summary_body_md,
              r.reasoning_md,
              r.comment_body_md,
              r.related_md,
            ]) ?? snippet(r.summary_body_md))
          : snippet(r.summary_body_md);
      return [
        {
          group: "case",
          id: r.case_id,
          primaryLabel: r.case_title ?? r.case_number,
          secondaryLabel: r.case_title ? r.case_number : r.summary_title,
          bodySnippet,
          href: `/subjects/${lawCode}/cases/${r.case_id}`,
          lawCode,
        },
      ];
    });
  }

  // problems — P-번호 정확 매칭 우선 + similarity ranked.
  async function fetchProblems(): Promise<SearchHit[]> {
    const hits: SearchHit[] = [];
    const seen = new Set<string>();

    // "P-1234" / "P1234" / "p 1234" → 문제 고유번호(display_no)로 직행.
    //   ★명시적 P 접두 필수 — 순수 숫자("123")는 조문/내용 검색을 가리지 않게.
    const dn = /^p-?\s*(\d{1,7})$/i.exec(q.trim());
    if (dn) {
      const { data: exact } = await client
        .from("problems")
        .select(
          "problem_id, display_no, year, problem_number, body_md, format, laws!inner(law_code)",
        )
        .eq("display_no", Number(dn[1]))
        .eq("review_status", "approved")
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();
      if (exact && (viewerIsStaff || exact.format !== "subjective")) {
        seen.add(exact.problem_id);
        hits.push({
          group: "problem",
          id: exact.problem_id,
          primaryLabel: `P-${exact.display_no}`,
          secondaryLabel: exact.year
            ? `${exact.year}년${exact.problem_number ? ` · ${exact.problem_number}번` : ""}`
            : null,
          bodySnippet: snippet(exact.body_md),
          href: `/subjects/${exact.laws.law_code}/problems/${exact.problem_id}`,
          lawCode: exact.laws.law_code,
        });
      }
    }

    const { data: ranked } = await client.rpc("search_problems_ranked", {
      q,
      lim: GROUP_LIMIT,
      search_scope: scope,
    });
    const ids = (ranked ?? [])
      .map((r) => r.problem_id)
      .filter((id) => !seen.has(id));
    if (ids.length === 0) return hits;
    let rowsQuery = client
      .from("problems")
      .select(
        "problem_id, year, problem_number, body_md, explanation_md, laws!inner(law_code)",
      )
      .in("problem_id", ids);
    if (!viewerIsStaff) rowsQuery = rowsQuery.neq("format", "subjective");
    const { data: rows } = await rowsQuery;
    // full 범위 — 발문에 없는 매칭(선지·박스 지문)의 문맥 스니펫용으로 함께 조회.
    const choiceTextByProblem = new Map<string, string[]>();
    if (scope === "full") {
      const [{ data: chs }, { data: bis }] = await Promise.all([
        client
          .from("problem_choices")
          .select("problem_id, body_md, explanation_md")
          .in("problem_id", ids)
          .or(`body_md.ilike.${pattern},explanation_md.ilike.${pattern}`)
          .limit(60),
        client
          .from("problem_box_items")
          .select("problem_id, body_md, explanation_md")
          .in("problem_id", ids)
          .or(`body_md.ilike.${pattern},explanation_md.ilike.${pattern}`)
          .limit(60),
      ]);
      for (const r of [...(chs ?? []), ...(bis ?? [])]) {
        const list = choiceTextByProblem.get(r.problem_id) ?? [];
        if (r.body_md) list.push(r.body_md);
        if (r.explanation_md) list.push(r.explanation_md);
        choiceTextByProblem.set(r.problem_id, list);
      }
    }
    const byId = new Map((rows ?? []).map((r) => [r.problem_id, r] as const));
    for (const id of ids) {
      const r = byId.get(id);
      if (!r) continue;
      const yearLabel = r.year
        ? `${r.year}년${r.problem_number ? ` · ${r.problem_number}번` : ""}`
        : "문제";
      const bodySnippet =
        scope === "full"
          ? (matchSnippet(q, [
              r.body_md,
              ...(choiceTextByProblem.get(id) ?? []),
              r.explanation_md,
            ]) ?? snippet(r.body_md))
          : snippet(r.body_md);
      hits.push({
        group: "problem",
        id: r.problem_id,
        primaryLabel: yearLabel,
        secondaryLabel: null,
        bodySnippet,
        href: `/subjects/${r.laws.law_code}/problems/${r.problem_id}`,
        lawCode: r.laws.law_code,
      });
    }
    return hits;
  }

  // 질의응답(qna_threads) — 제목 / (full 범위) 질문·답변 본문. RLS 로 공개 스레드만.
  async function fetchQna(): Promise<SearchHit[]> {
    let query = client
      .from("qna_threads")
      .select("thread_id, title, question_md, answer_md, display_no, status")
      .is("deleted_at", null);
    query =
      scope === "full"
        ? query.or(
            `title.ilike.${pattern},question_md.ilike.${pattern},answer_md.ilike.${pattern}`,
          )
        : query.ilike("title", pattern);
    const { data } = await query
      .order("updated_at", { ascending: false })
      .limit(GROUP_LIMIT);
    const list = data ?? [];
    if (list.length === 0) return [];
    return list.map((t): SearchHit => ({
      group: "qna",
      id: t.thread_id,
      primaryLabel: t.title?.trim() || snippet(t.question_md, 60) || "질의응답",
      secondaryLabel: t.display_no ? `Q-${t.display_no}` : null,
      bodySnippet:
        scope === "full"
          ? (matchSnippet(q, [t.question_md, t.answer_md]) ??
            snippet(t.question_md, 80))
          : snippet(t.question_md, 80),
      href: `/qna/${t.thread_id}`,
      lawCode: null,
    }));
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

  // dohae — 도해특허법 유닛(제목·장 제목 + full 이면 blocks 본문).
  // ★RPC 는 SECURITY INVOKER — dohae_units RLS(로그인 사용자만)가 그대로 걸린다.
  //   비로그인 방문자에게는 0건. 유출방지 대상 콘텐츠라 검색에서도 새지 않아야 한다.
  async function fetchDohae(): Promise<SearchHit[]> {
    const { data: ranked } = await client.rpc("search_dohae_units", {
      q,
      lim: GROUP_LIMIT,
      search_scope: scope,
    });
    const ids = (ranked ?? []).map((r) => r.unit_id);
    if (ids.length === 0) return [];
    const [refs, { data: rows }] = await Promise.all([
      getDohaeUnitRefs(client, ids),
      client.from("dohae_units").select("unit_id, blocks").in("unit_id", ids),
    ]);
    const blocksById = new Map(
      (rows ?? []).map((r) => [r.unit_id, (r.blocks ?? []) as unknown as DohaeBlock[]] as const),
    );
    // RPC ranking 순서 보존.
    return ids.flatMap((id): SearchHit[] => {
      const ref = refs.get(id);
      if (!ref) return [];
      return [
        {
          group: "dohae",
          id,
          primaryLabel: ref.primaryLabel,
          secondaryLabel: ref.secondaryLabel,
          bodySnippet:
            scope === "full"
              ? matchSnippet(q, dohaeBlocksText(blocksById.get(id) ?? []))
              : null,
          href: dohaeUnitHref(ref.nodeId, id),
          lawCode: DOHAE_LAW_CODE,
        },
      ];
    });
  }

  const [articles, cases, problems, qna, dohae, memos, bookmarks] = await Promise.all([
    fetchArticles(),
    fetchCases(),
    fetchProblems(),
    fetchQna(),
    fetchDohae(),
    fetchMemos(),
    fetchBookmarks(),
  ]);
  return { query: q, articles, cases, problems, qna, dohae, memos, bookmarks };
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
          secondaryLabel: `${l.targetType === "problem_choice" ? "정오문제 지문" : "정오문제 박스"} · ${p.label}`,
          bodySnippet: snippet(l.body),
          href: `/subjects/${p.lawCode}/problems/${parentId}`,
          lawCode: p.lawCode,
        },
      ];
    }
    return [];
  });
}
