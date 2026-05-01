import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "database.types";

import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";

export type ArticleLevel = Database["public"]["Enums"]["article_level"];

export interface LawHeader {
  lawId: string;
  lawCode: string;
  displayLabel: string;
  shortLabel: string;
}

export interface ArticleNode {
  articleId: string;
  parentId: string | null;
  level: ArticleLevel;
  path: string;
  articleNumber: string | null;
  displayLabel: string;
  importance: number;
  hasBody: boolean;
}

export async function getLawByCode(
  client: SupabaseClient<Database>,
  lawCode: LawSubjectSlug,
): Promise<LawHeader | null> {
  const { data, error } = await client
    .from("laws")
    .select("law_id, law_code, display_label, short_label")
    .eq("law_code", lawCode)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return {
    lawId: data.law_id,
    lawCode: data.law_code,
    displayLabel: data.display_label,
    shortLabel: data.short_label,
  };
}

export async function getArticleSkeleton(
  client: SupabaseClient<Database>,
  lawId: string,
): Promise<ArticleNode[]> {
  const { data, error } = await client
    .from("articles")
    .select(
      "article_id, parent_id, level, path, article_number, display_label, importance, current_revision_id",
    )
    .eq("law_id", lawId)
    .is("deleted_at", null)
    .order("path");

  if (error) throw error;

  return (data ?? []).map((row) => ({
    articleId: row.article_id,
    parentId: row.parent_id,
    level: row.level,
    path: typeof row.path === "string" ? row.path : String(row.path ?? ""),
    articleNumber: row.article_number,
    displayLabel: row.display_label,
    importance: row.importance ?? 1,
    hasBody: row.current_revision_id !== null,
  }));
}

export interface ArticleDetail {
  articleId: string;
  articleNumber: string | null;
  displayLabel: string;
  importance: number;
  bodyJson: unknown;
  effectiveDate: string | null;
  currentRevisionId: string | null;
}

export async function getArticleByNumber(
  client: SupabaseClient<Database>,
  lawId: string,
  articleNumber: string,
): Promise<ArticleDetail | null> {
  const { data, error } = await client
    .from("articles")
    .select(
      "article_id, article_number, display_label, importance, current_revision_id",
    )
    .eq("law_id", lawId)
    .eq("article_number", articleNumber)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  if (!data.current_revision_id) {
    return {
      articleId: data.article_id,
      articleNumber: data.article_number,
      displayLabel: data.display_label,
      importance: data.importance ?? 1,
      bodyJson: null,
      effectiveDate: null,
      currentRevisionId: null,
    };
  }

  const { data: rev, error: revErr } = await client
    .from("article_revisions")
    .select("body_json, effective_date")
    .eq("revision_id", data.current_revision_id)
    .maybeSingle();
  if (revErr) throw revErr;

  return {
    articleId: data.article_id,
    articleNumber: data.article_number,
    displayLabel: data.display_label,
    importance: data.importance ?? 1,
    bodyJson: rev?.body_json ?? null,
    effectiveDate: rev?.effective_date ?? null,
    currentRevisionId: data.current_revision_id,
  };
}

export async function getLatestPublishedRevisionDate(
  client: SupabaseClient<Database>,
  lawId: string,
): Promise<string | null> {
  const { data, error } = await client
    .from("law_revisions")
    .select("effective_date")
    .eq("law_id", lawId)
    .eq("status", "published")
    .order("effective_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.effective_date ?? null;
}

export interface SystematicArticleRef {
  articleId: string;
  articleNumber: string | null;
  displayLabel: string;
  importance: number;
}

export interface SystematicNode {
  nodeId: string;
  parentId: string | null;
  path: string;
  displayLabel: string;
  ord: number;
  articles: SystematicArticleRef[];
}

export async function getSystematicSkeleton(
  client: SupabaseClient<Database>,
  lawCode: LawSubjectSlug,
): Promise<SystematicNode[]> {
  const { data: nodes, error: nodeErr } = await client
    .from("systematic_nodes")
    .select("node_id, parent_id, path, display_label, ord")
    .eq("law_code", lawCode)
    .order("path");
  if (nodeErr) throw nodeErr;
  if (!nodes || nodes.length === 0) return [];

  const { data: links, error: linkErr } = await client
    .from("article_systematic_links")
    .select(
      "node_id, articles(article_id, article_number, display_label, importance)",
    )
    .in(
      "node_id",
      nodes.map((n) => n.node_id),
    );
  if (linkErr) throw linkErr;

  const articlesByNode = new Map<string, SystematicArticleRef[]>();
  for (const l of links ?? []) {
    const a = l.articles;
    if (!a) continue;
    const list = articlesByNode.get(l.node_id) ?? [];
    list.push({
      articleId: a.article_id,
      articleNumber: a.article_number,
      displayLabel: a.display_label,
      importance: a.importance ?? 1,
    });
    articlesByNode.set(l.node_id, list);
  }

  return nodes.map((n) => ({
    nodeId: n.node_id,
    parentId: n.parent_id,
    path: typeof n.path === "string" ? n.path : String(n.path ?? ""),
    displayLabel: n.display_label,
    ord: n.ord,
    articles: articlesByNode.get(n.node_id) ?? [],
  }));
}

export interface SystematicNodeWithArticles {
  nodeId: string;
  displayLabel: string;
  path: string;
  articles: Array<{
    articleId: string;
    articleNumber: string | null;
    displayLabel: string;
    importance: number;
    bodyJson: unknown;
    effectiveDate: string | null;
  }>;
}

export async function getSystematicNodeWithArticles(
  client: SupabaseClient<Database>,
  lawCode: LawSubjectSlug,
  nodeId: string,
): Promise<SystematicNodeWithArticles | null> {
  // 1. 대상 노드 + 같은 law 의 모든 노드 fetch (부분트리 계산용)
  const { data: allNodes, error: allErr } = await client
    .from("systematic_nodes")
    .select("node_id, display_label, path")
    .eq("law_code", lawCode);
  if (allErr) throw allErr;

  const target = allNodes?.find((n) => n.node_id === nodeId);
  if (!target) return null;

  const targetPathStr =
    typeof target.path === "string" ? target.path : String(target.path ?? "");

  // 2. target 부분트리에 속하는 모든 node id (자기 자신 + 후손)
  const subtreeIds = (allNodes ?? [])
    .filter((n) => {
      const p = typeof n.path === "string" ? n.path : String(n.path ?? "");
      return p === targetPathStr || p.startsWith(`${targetPathStr}.`);
    })
    .map((n) => n.node_id);

  // 3. 부분트리 article 모두 (DISTINCT)
  const { data: links, error: linkErr } = await client
    .from("article_systematic_links")
    .select(
      "articles(article_id, article_number, display_label, importance, current_revision_id)",
    )
    .in("node_id", subtreeIds);
  if (linkErr) throw linkErr;

  const linkedArticlesMap = new Map<
    string,
    NonNullable<NonNullable<typeof links>[number]["articles"]>
  >();
  for (const l of links ?? []) {
    const a = l.articles;
    if (a) linkedArticlesMap.set(a.article_id, a);
  }
  const linkedArticles = [...linkedArticlesMap.values()];

  const revIds = linkedArticles
    .map((a) => a.current_revision_id)
    .filter((x): x is string => x != null);

  const revMap = new Map<
    string,
    { body_json: unknown; effective_date: string | null }
  >();
  if (revIds.length > 0) {
    const { data: revs, error: revErr } = await client
      .from("article_revisions")
      .select("revision_id, body_json, effective_date")
      .in("revision_id", revIds);
    if (revErr) throw revErr;
    for (const r of revs ?? []) {
      revMap.set(r.revision_id, {
        body_json: r.body_json,
        effective_date: r.effective_date,
      });
    }
  }

  const articles = linkedArticles
    .map((a) => {
      const rev = a.current_revision_id ? revMap.get(a.current_revision_id) : null;
      return {
        articleId: a.article_id,
        articleNumber: a.article_number,
        displayLabel: a.display_label,
        importance: a.importance ?? 1,
        bodyJson: rev?.body_json ?? null,
        effectiveDate: rev?.effective_date ?? null,
      };
    })
    .sort((x, y) => {
      // article_number 자연 정렬 — 정수 → 가지조 순
      const xn = naturalKey(x.articleNumber);
      const yn = naturalKey(y.articleNumber);
      if (xn[0] !== yn[0]) return xn[0] - yn[0];
      return xn[1] - yn[1];
    });

  return {
    nodeId: target.node_id,
    displayLabel: target.display_label,
    path: targetPathStr,
    articles,
  };
}

function naturalKey(s: string | null): [number, number] {
  if (!s) return [0, 0];
  const m = s.match(/^(\d+)(?:의(\d+))?/);
  if (!m) return [0, 0];
  return [Number(m[1]), m[2] ? Number(m[2]) : 0];
}

// 한 chapter/section/part 노드 + 그 자손 article 들의 본문 일괄 fetch.
// "제1장 총칙" 같은 상위 노드를 클릭하면 그 안의 모든 조문을 한 화면에 보여주기 위함.
export interface ChapterWithArticles {
  chapterId: string;
  level: ArticleLevel;
  displayLabel: string;
  path: string;
  articles: Array<{
    articleId: string;
    articleNumber: string | null;
    displayLabel: string;
    importance: number;
    bodyJson: unknown;
    effectiveDate: string | null;
  }>;
}

export async function getChapterWithArticles(
  client: SupabaseClient<Database>,
  lawId: string,
  chapterId: string,
): Promise<ChapterWithArticles | null> {
  // 1. 같은 law 의 모든 노드 fetch (chapter path 기준 자손 필터링용)
  const { data: rows, error } = await client
    .from("articles")
    .select(
      "article_id, level, path, article_number, display_label, importance, current_revision_id",
    )
    .eq("law_id", lawId)
    .is("deleted_at", null);
  if (error) throw error;

  const target = rows?.find((r) => r.article_id === chapterId);
  if (!target) return null;
  // article 자체는 chapter-viewer 대상이 아니다 — article-viewer 로 직접 가야 함.
  if (target.level === "article") return null;

  const targetPath =
    typeof target.path === "string" ? target.path : String(target.path ?? "");

  // 2. 자손 article 만 추출 (자기 path prefix + level === 'article')
  const descendantArticles = (rows ?? [])
    .filter((r) => {
      if (r.level !== "article") return false;
      const p = typeof r.path === "string" ? r.path : String(r.path ?? "");
      return p === targetPath || p.startsWith(`${targetPath}.`);
    })
    .sort((a, b) => {
      const ax = naturalKey(a.article_number);
      const bx = naturalKey(b.article_number);
      if (ax[0] !== bx[0]) return ax[0] - bx[0];
      return ax[1] - bx[1];
    });

  // 3. 본문 fetch
  const revIds = descendantArticles
    .map((a) => a.current_revision_id)
    .filter((x): x is string => x != null);
  const revMap = new Map<
    string,
    { body_json: unknown; effective_date: string | null }
  >();
  if (revIds.length > 0) {
    const { data: revs, error: revErr } = await client
      .from("article_revisions")
      .select("revision_id, body_json, effective_date")
      .in("revision_id", revIds);
    if (revErr) throw revErr;
    for (const r of revs ?? []) {
      revMap.set(r.revision_id, {
        body_json: r.body_json,
        effective_date: r.effective_date,
      });
    }
  }

  return {
    chapterId: target.article_id,
    level: target.level,
    displayLabel: target.display_label,
    path: targetPath,
    articles: descendantArticles.map((a) => {
      const rev = a.current_revision_id ? revMap.get(a.current_revision_id) : null;
      return {
        articleId: a.article_id,
        articleNumber: a.article_number,
        displayLabel: a.display_label,
        importance: a.importance ?? 1,
        bodyJson: rev?.body_json ?? null,
        effectiveDate: rev?.effective_date ?? null,
      };
    }),
  };
}

export type StaffRole = "instructor" | "admin";

export async function getStaffRole(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<StaffRole | null> {
  const { data, error } = await client
    .from("profiles")
    .select("role")
    .eq("profile_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (data.role === "instructor" || data.role === "admin") return data.role;
  return null;
}

export interface SaveArticleRevisionInput {
  articleId: string;
  lawId: string;
  bodyJson: unknown;
  authorId: string;
  // 메타 (선택). 값이 들어오면 articles 테이블도 함께 업데이트.
  displayLabel?: string;
  importance?: number;
}

// 빠른 편집(quick edit) 모드에서 호출.
// 기존 article_revision 을 수정하지 않고(불변), 새 law_revision + article_revision 을 생성한 뒤
// articles.current_revision_id 를 새 revision 으로 swap 한다.
// 정식 개정 워크스페이스(feat-7-004) 가 만들어지면 이 quick-edit 흐름은 그쪽으로 합쳐질 수 있다.
export async function saveArticleQuickEdit(
  adminClient: SupabaseClient<Database>,
  input: SaveArticleRevisionInput,
): Promise<{ ok: true; revisionId: string } | { ok: false; error: string }> {
  const today = new Date().toISOString().slice(0, 10);
  const stamp = Date.now();

  const { data: lawRev, error: lawRevErr } = await adminClient
    .from("law_revisions")
    .insert({
      law_id: input.lawId,
      revision_number: `quick-${stamp}`,
      promulgated_at: today,
      effective_date: today,
      status: "published",
      published_at: new Date().toISOString(),
      published_by: input.authorId,
    })
    .select("law_revision_id")
    .single();
  if (lawRevErr) return { ok: false, error: lawRevErr.message };

  const { data: artRev, error: artRevErr } = await adminClient
    .from("article_revisions")
    .insert({
      article_id: input.articleId,
      law_revision_id: lawRev.law_revision_id,
      body_json: input.bodyJson as Json,
      change_kind: "amended",
      effective_date: today,
      created_by: input.authorId,
    })
    .select("revision_id")
    .single();
  if (artRevErr) return { ok: false, error: artRevErr.message };

  const articleUpdate: {
    current_revision_id: string;
    display_label?: string;
    importance?: number;
  } = { current_revision_id: artRev.revision_id };
  if (typeof input.displayLabel === "string" && input.displayLabel.length > 0) {
    articleUpdate.display_label = input.displayLabel;
  }
  if (typeof input.importance === "number") {
    articleUpdate.importance = input.importance;
  }
  const { error: articleErr } = await adminClient
    .from("articles")
    .update(articleUpdate)
    .eq("article_id", input.articleId);
  if (articleErr) return { ok: false, error: articleErr.message };

  return { ok: true, revisionId: artRev.revision_id };
}

export interface RevisionHistoryEntry {
  revisionId: string;
  effectiveDate: string;
  changeKind: Database["public"]["Enums"]["law_change_kind"];
  createdAt: string;
  createdBy: string | null;
  authorName: string | null;
  isCurrent: boolean;
  lawRevisionNumber: string | null;
}

export async function listArticleRevisionHistory(
  client: SupabaseClient<Database>,
  articleId: string,
  currentRevisionId: string | null,
): Promise<RevisionHistoryEntry[]> {
  const { data, error } = await client
    .from("article_revisions")
    .select(
      "revision_id, effective_date, change_kind, created_at, created_by, profiles!created_by(name), law_revisions!law_revision_id(revision_number)",
    )
    .eq("article_id", articleId)
    .order("effective_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    revisionId: row.revision_id,
    effectiveDate: row.effective_date,
    changeKind: row.change_kind,
    createdAt: row.created_at,
    createdBy: row.created_by,
    authorName: row.profiles?.name ?? null,
    isCurrent: row.revision_id === currentRevisionId,
    lawRevisionNumber: row.law_revisions?.revision_number ?? null,
  }));
}
