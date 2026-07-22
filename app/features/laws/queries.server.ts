import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "database.types";

import { fetchAllIn } from "~/core/lib/supa-batch.server";
import { sortSystematicTreeOrder } from "~/features/laws/lib/systematic-order";
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
  // PostgREST 는 응답을 기본 1000행으로 제한한다. 민법은 노드가 1300개를 넘어
  // 페이지네이션 없이 한 번에 받으면 path 정렬 끝쪽(제5편 상속 등)이 잘린다.
  // → 1000행씩 끝까지 받아 합친다(특허·상표 등 1000 미만 법령은 1회로 끝).
  const PAGE = 1000;
  const out: ArticleNode[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from("articles")
      .select(
        "article_id, parent_id, level, path, article_number, display_label, importance, current_revision_id",
      )
      .eq("law_id", lawId)
      .is("deleted_at", null)
      .order("path")
      .range(from, from + PAGE - 1);

    if (error) throw error;
    const batch = data ?? [];
    for (const row of batch) {
      out.push({
        articleId: row.article_id,
        parentId: row.parent_id,
        level: row.level,
        path: typeof row.path === "string" ? row.path : String(row.path ?? ""),
        articleNumber: row.article_number,
        displayLabel: row.display_label,
        importance: row.importance ?? 1,
        hasBody: row.current_revision_id !== null,
      });
    }
    if (batch.length < PAGE) break;
  }
  return out;
}

// 큰 법령 lazy-load 용 — 한 부모의 직속 자식만 가져옴.
// parentId === null 이면 최상위(편/장 등) 노드 반환.
// 민법 1118조 시드 시 ArticleTree 가 펼침 이벤트로 호출.
export async function getArticleChildren(
  client: SupabaseClient<Database>,
  lawId: string,
  parentId: string | null,
): Promise<ArticleNode[]> {
  let q = client
    .from("articles")
    .select(
      "article_id, parent_id, level, path, article_number, display_label, importance, current_revision_id",
    )
    .eq("law_id", lawId)
    .is("deleted_at", null);
  q = parentId === null ? q.is("parent_id", null) : q.eq("parent_id", parentId);
  const { data, error } = await q.order("path");
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

// 조문 시점 조회 — 주어진 날짜에 시행 중이던 article_revisions 를 반환.
// 현재 조회는 currentRevisionId 가 가리키는 가장 최신 시행 본을 그대로 쓰지만,
// 시점이 지정된 경우 effective_date <= at < expired_date 조건의 revision 을 찾는다.
export async function getArticleByNumberAt(
  client: SupabaseClient<Database>,
  lawId: string,
  articleNumber: string,
  atDate: string, // "YYYY-MM-DD"
): Promise<ArticleDetail | null> {
  const { data: art, error } = await client
    .from("articles")
    .select("article_id, article_number, display_label, importance")
    .eq("law_id", lawId)
    .eq("article_number", articleNumber)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!art) return null;

  const { data: rev, error: revErr } = await client
    .from("article_revisions")
    .select("revision_id, body_json, effective_date, expired_date")
    .eq("article_id", art.article_id)
    .lte("effective_date", atDate)
    .or(`expired_date.is.null,expired_date.gt.${atDate}`)
    .order("effective_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (revErr) throw revErr;

  return {
    articleId: art.article_id,
    articleNumber: art.article_number,
    displayLabel: art.display_label,
    importance: art.importance ?? 1,
    bodyJson: rev?.body_json ?? null,
    effectiveDate: rev?.effective_date ?? null,
    currentRevisionId: rev?.revision_id ?? null,
  };
}

// 조문 코멘트/평석 — content_comments 폴리모픽 (feat-8-021).
// 호환 layer — 기존 caller 가 단일 primary 평석 1개만 다루면 첫 번째(고정 우선) 반환.
// feat-8-022: body_md 가 NULL 허용(하이라이트형 코멘트) 이 되어 bodyMd 도 nullable.
export interface ArticleComment {
  bodyMd: string | null;
  authorId: string | null;
  updatedAt: string;
}

export async function getArticleComment(
  client: SupabaseClient<Database>,
  articleId: string,
): Promise<ArticleComment | null> {
  const { data, error } = await client
    .from("content_comments")
    .select("body_md, author_id, updated_at")
    .eq("target_type", "article")
    .eq("target_id", articleId)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    bodyMd: data.body_md,
    authorId: data.author_id,
    updatedAt: data.updated_at,
  };
}

// 최근 published 법 개정 (대시보드 위젯 + /latest/laws). 모든 과목 통합.
export type LawRevisionKind = "act" | "decree" | "rule";

export interface RecentRevisionItem {
  lawRevisionId: string;
  lawId: string;
  lawCode: string;
  lawName: string;
  revisionKind: LawRevisionKind;
  revisionNumber: string | null;
  promulgatedAt: string | null;
  effectiveDate: string | null;
  hasReason: boolean;
  hasComparison: boolean;
  hasExplanation: boolean;
  hasVideo: boolean;
  reasonMd: string | null;
  comparisonPdf: string | null;
  explanationPdf: string | null;
  videoUrl: string | null;
  // 이 개정에 포함된 article_revisions 개수 (영향 조문 수).
  affectedArticleCount: number;
  // 본인이 즐겨찾기한 조문 중 영향받은 개수 (≥1 이면 강조).
  myBookmarkedAffectedCount: number;
}

export interface ListLawRevisionsOptions {
  subject?: LawSubjectSlug;
  query?: string; // 법명·개정 번호 검색
}

export async function listRecentLawRevisions(
  client: SupabaseClient<Database>,
  limit = 5,
  userId?: string,
  options: ListLawRevisionsOptions = {},
): Promise<RecentRevisionItem[]> {
  let q = client
    .from("law_revisions")
    .select(
      "law_revision_id, law_id, revision_kind, revision_number, promulgated_at, effective_date, reason_md, comparison_pdf, explanation_pdf, video_url, laws!inner(law_code, display_label, short_label)",
    )
    // 반영된 개정만 (시행일 set). 미반영 초안은 학습지원 목록에서 제외.
    .not("effective_date", "is", null)
    // 조문 편집 도구·정리 스크립트가 본문 수정을 적용하려고 자동 생성한 revision
    // (revision_number 가 placeholder: quick-… / fix-… / "…조문정리…" 시드)은
    // 실제 "법 개정"이 아니므로 학습정보 목록에서 제외. 이 revision 들은 현재 조문
    // 본문(current)을 보유하므로 삭제하면 안 되고, 목록에서 숨기기만 한다.
    .not("revision_number", "ilike", "quick-%")
    .not("revision_number", "ilike", "fix-%")
    .not("revision_number", "ilike", "%조문정리%");
  if (options.subject) q = q.eq("laws.law_code", options.subject);
  const trimmed = options.query?.trim();
  if (trimmed) {
    const escaped = trimmed.replaceAll("%", "").replaceAll(",", " ");
    const pattern = `%${escaped}%`;
    q = q.or(
      `revision_number.ilike.${pattern},laws.display_label.ilike.${pattern},laws.short_label.ilike.${pattern}`,
    );
  }
  const { data, error } = await q
    .order("effective_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) return [];

  // 영향 조문 수 + 본인 즐겨찾기 매칭.
  const lawRevisionIds = rows.map((r) => r.law_revision_id);
  const { data: arRows } = await client
    .from("article_revisions")
    .select("law_revision_id, article_id")
    .in("law_revision_id", lawRevisionIds);
  const articlesByRevision = new Map<string, string[]>();
  for (const r of arRows ?? []) {
    if (!r.law_revision_id) continue;
    const arr = articlesByRevision.get(r.law_revision_id) ?? [];
    arr.push(r.article_id);
    articlesByRevision.set(r.law_revision_id, arr);
  }

  // 본인 즐겨찾기 조문 (전체) 한 번만 조회.
  let myBookmarkedArticles = new Set<string>();
  if (userId) {
    const { data: bms } = await client
      .from("user_bookmarks")
      .select("target_id")
      .eq("user_id", userId)
      .eq("target_type", "article")
      .is("deleted_at", null)
      .gt("star_level", 0);
    for (const b of bms ?? []) myBookmarkedArticles.add(b.target_id);
  }

  return rows.map((r) => {
    const affected = articlesByRevision.get(r.law_revision_id) ?? [];
    const myMatched = affected.filter((id) =>
      myBookmarkedArticles.has(id),
    ).length;
    return {
      lawRevisionId: r.law_revision_id,
      lawId: r.law_id,
      lawCode: r.laws.law_code,
      lawName: r.laws.short_label ?? r.laws.display_label,
      revisionKind: (r.revision_kind ?? "act") as LawRevisionKind,
      revisionNumber: r.revision_number,
      promulgatedAt: r.promulgated_at,
      effectiveDate: r.effective_date,
      hasReason: !!r.reason_md && r.reason_md.trim().length > 0,
      hasComparison: !!r.comparison_pdf && r.comparison_pdf.trim().length > 0,
      hasExplanation:
        !!r.explanation_pdf && r.explanation_pdf.trim().length > 0,
      hasVideo: !!r.video_url && r.video_url.trim().length > 0,
      reasonMd: r.reason_md ?? null,
      comparisonPdf: r.comparison_pdf ?? null,
      explanationPdf: r.explanation_pdf ?? null,
      videoUrl: r.video_url ?? null,
      affectedArticleCount: affected.length,
      myBookmarkedAffectedCount: myMatched,
    };
  });
}

export async function getLatestPublishedRevisionDate(
  client: SupabaseClient<Database>,
  lawId: string,
): Promise<string | null> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await client
    .from("law_revisions")
    .select("effective_date")
    .eq("law_id", lawId)
    .not("effective_date", "is", null)
    .lte("effective_date", today)
    .order("effective_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.effective_date ?? null;
}

// 다가오는 시행 예정 조문 — effective_date 가 미래(오늘 초과)인 가장 이른 스냅샷.
// 조문 뷰어에서 "현재본 + 시행 예정본" 동시 표시에 사용.
export interface UpcomingArticleRevision {
  revisionId: string;
  bodyJson: unknown;
  effectiveDate: string;
}

export async function getUpcomingArticleRevision(
  client: SupabaseClient<Database>,
  articleId: string,
  today: string, // "YYYY-MM-DD"
): Promise<UpcomingArticleRevision | null> {
  const { data, error } = await client
    .from("article_revisions")
    .select("revision_id, body_json, effective_date")
    .eq("article_id", articleId)
    .gt("effective_date", today)
    .order("effective_date", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data || !data.effective_date) return null;
  return {
    revisionId: data.revision_id,
    bodyJson: data.body_json,
    effectiveDate: data.effective_date,
  };
}

export interface SystematicArticleRef {
  articleId: string;
  articleNumber: string | null;
  displayLabel: string;
  importance: number;
}

// caseOnly / caseDisplayLabel — 판례 체계도 전용 노출·라벨 오버라이드.
// 트리 빌더는 화면 컨텍스트(case vs article/problem)에 따라 두 필드를 다르게 처리:
//   • 판례 트리 (cases-tree)            → caseOnly 포함, 라벨은 caseDisplayLabel ?? displayLabel
//   • 조문/문제 트리 (systematic-tree,
//     problem-systematic-tree)        → caseOnly 제외, 라벨은 항상 displayLabel
// loader 는 모든 노드를 한 번에 fetch 하고 각 트리 컴포넌트가 자기 규칙으로 거른다.
export interface SystematicNode {
  nodeId: string;
  parentId: string | null;
  path: string;
  displayLabel: string;
  caseDisplayLabel: string | null;
  caseOnly: boolean;
  ord: number;
  articles: SystematicArticleRef[];
}

export async function getSystematicSkeleton(
  client: SupabaseClient<Database>,
  lawCode: LawSubjectSlug,
): Promise<SystematicNode[]> {
  const { data: nodes, error: nodeErr } = await client
    .from("systematic_nodes")
    .select(
      "node_id, parent_id, path, display_label, case_display_label, case_only, ord",
    )
    .eq("law_code", lawCode)
    .order("path");
  if (nodeErr) throw nodeErr;
  if (!nodes || nodes.length === 0) return [];

  // ★배치+페이지네이션 — 민법 링크 1193건은 단일 요청 max-rows(1000)를 넘는다.
  const links = await fetchAllIn(
    nodes.map((n) => n.node_id),
    (slice) =>
      client
        .from("article_systematic_links")
        .select(
          "node_id, articles(article_id, article_number, display_label, importance)",
        )
        .in("node_id", slice)
        .order("article_id"),
  );

  const articlesByNode = new Map<string, SystematicArticleRef[]>();
  for (const l of links) {
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

  // ★트리 표시 순(parent+ord DFS) — path 문자열 정렬은 대분류 10개 초과 시 깨짐(b13 < b2).
  //   전체 순번(computeCaseOverallOrder) 랭킹이 이 배열 순서를 그대로 쓴다.
  return sortSystematicTreeOrder(
    nodes.map((n) => ({
    nodeId: n.node_id,
    parentId: n.parent_id,
    path: typeof n.path === "string" ? n.path : String(n.path ?? ""),
    displayLabel: n.display_label,
    caseDisplayLabel: n.case_display_label ?? null,
    caseOnly: n.case_only ?? false,
    ord: n.ord,
    // 노드 내 조문 자연 정렬 — 81 → 81의2 → 81의3 → 82 (링크 테이블에 ord 없음,
    // 삽입 순서라 나중 추가된 가지조가 끝에 붙는 문제 교정). 노드 상세(getSystematicNodeWithArticles)와 동일 규칙.
    articles: [...(articlesByNode.get(n.node_id) ?? [])].sort((x, y) => {
      const xn = naturalKey(x.articleNumber);
      const yn = naturalKey(y.articleNumber);
      return xn[0] !== yn[0] ? xn[0] - yn[0] : xn[1] - yn[1];
    }),
    })),
  );
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

  // 3. 부분트리 article 모두 (DISTINCT) — 배치+페이지네이션(민법 subtree 1000행 초과 가능).
  const links = await fetchAllIn(subtreeIds, (slice) =>
    client
      .from("article_systematic_links")
      .select(
        "articles(article_id, article_number, display_label, importance, current_revision_id)",
      )
      .in("node_id", slice)
      .order("article_id"),
  );

  const linkedArticlesMap = new Map<
    string,
    NonNullable<(typeof links)[number]["articles"]>
  >();
  for (const l of links) {
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
  // .in() 의 id 가 많으면 URL 길이 초과(414/fetch failed) — 100개씩 청크로 분할.
  const REV_CHUNK = 100;
  for (let i = 0; i < revIds.length; i += REV_CHUNK) {
    const { data: revs, error: revErr } = await client
      .from("article_revisions")
      .select("revision_id, body_json, effective_date")
      .in("revision_id", revIds.slice(i, i + REV_CHUNK));
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
  /** 자손 조문 전체 수 (articles 는 RENDER_MAX 로 잘릴 수 있음) */
  totalArticles: number;
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
  opts: { offset?: number; limit?: number } = {},
): Promise<ChapterWithArticles | null> {
  // 1. 같은 law 의 모든 노드 fetch (chapter path 기준 자손 필터링용).
  //    PostgREST 기본 1000행 제한 — 민법(1300+ 노드)은 페이지네이션 필수.
  //    누락 시 제5편 상속 등 path 끝쪽 그룹을 클릭하면 자손 조문이 비어 보인다.
  const NODE_PAGE = 1000;
  const rows: Array<{
    article_id: string;
    level: ArticleLevel;
    path: unknown;
    article_number: string | null;
    display_label: string;
    importance: number | null;
    current_revision_id: string | null;
  }> = [];
  for (let from = 0; ; from += NODE_PAGE) {
    const { data, error } = await client
      .from("articles")
      .select(
        "article_id, level, path, article_number, display_label, importance, current_revision_id",
      )
      .eq("law_id", lawId)
      .is("deleted_at", null)
      .order("path")
      .range(from, from + NODE_PAGE - 1);
    if (error) throw error;
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < NODE_PAGE) break;
  }

  const target = rows.find((r) => r.article_id === chapterId);
  if (!target) return null;
  // article 자체는 chapter-viewer 대상이 아니다 — article-viewer 로 직접 가야 함.
  if (target.level === "article") return null;

  const targetPath =
    typeof target.path === "string" ? target.path : String(target.path ?? "");

  // 2. 자손 article 만 추출 (자기 path prefix + level === 'article')
  const allDescendants = rows
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
  // 한 화면에 너무 많은 본문을 렌더하면 클라이언트가 과부하(민법 제3편 채권 405조 등).
  // offset/limit 으로 페이지 단위 본문 렌더, 전체 수는 totalArticles 로 알린다(끝까지 페이지로 열람).
  const totalArticles = allDescendants.length;
  const limit = opts.limit ?? 150;
  const offset = Math.max(0, opts.offset ?? 0);
  const descendantArticles = allDescendants.slice(offset, offset + limit);

  // 3. 본문 fetch
  const revIds = descendantArticles
    .map((a) => a.current_revision_id)
    .filter((x): x is string => x != null);
  const revMap = new Map<
    string,
    { body_json: unknown; effective_date: string | null }
  >();
  // .in() 의 id 가 많으면 URL 길이 초과(414/fetch failed) — 100개씩 청크로 분할.
  const REV_CHUNK = 100;
  for (let i = 0; i < revIds.length; i += REV_CHUNK) {
    const { data: revs, error: revErr } = await client
      .from("article_revisions")
      .select("revision_id, body_json, effective_date")
      .in("revision_id", revIds.slice(i, i + REV_CHUNK));
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
    totalArticles,
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

export type StaffRole = "instructor" | "manager" | "admin";

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
  if (
    data.role === "instructor" ||
    data.role === "manager" ||
    data.role === "admin"
  )
    return data.role;
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
// 기존 article_revision 을 수정하지 않고(불변), 새 article_revision 을 생성한 뒤
// articles.current_revision_id 를 새 revision 으로 swap 한다.
// ⚠️ 빠른편집은 "법 개정"이 아니라 staff 직접 정정이므로 **law_revision 을 만들지 않는다**
//    (law_revision_id = null). 따라서 학습정보>법 개정 이력에 남지 않는다. 단 article_revision
//    스냅샷은 그대로 생성돼 변경 audit·롤백 근거는 유지(불변성 정책 준수).
//    정식 법 개정은 개정 워크스페이스(feat-7-004)로 — 그쪽은 law_revision 을 만든다.
export async function saveArticleQuickEdit(
  adminClient: SupabaseClient<Database>,
  input: SaveArticleRevisionInput,
): Promise<{ ok: true; revisionId: string } | { ok: false; error: string }> {
  const today = new Date().toISOString().slice(0, 10);

  const { data: artRev, error: artRevErr } = await adminClient
    .from("article_revisions")
    .insert({
      article_id: input.articleId,
      law_revision_id: null, // 직접편집 — 법 개정 이력 미생성
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

// ── 필터 정독(중요도/즐겨찾기) — 학습과목 허브 가운데 본문 영역용 ──────────
// 트리 필터와 같은 AND 의미론: importanceMin(0=무시) + bookmarkMin(0=무시, 본인
// user_bookmarks star_level 기준). 조(level=article) 단위, 자연 정렬(정수→가지조).

export interface FilteredArticleBody {
  articleId: string;
  articleNumber: string | null;
  displayLabel: string;
  importance: number;
  bodyJson: unknown;
}

export async function getArticlesByTreeFilter(
  client: SupabaseClient<Database>,
  lawCode: string,
  opts: {
    importanceMin: number;
    bookmarkMin: number;
    userId: string;
    offset: number;
    limit: number;
  },
): Promise<{ total: number; items: FilteredArticleBody[] }> {
  const { data: law } = await client
    .from("laws")
    .select("law_id")
    .eq("law_code", lawCode)
    .maybeSingle();
  if (!law) return { total: 0, items: [] };

  let q = client
    .from("articles")
    .select(
      "article_id, article_number, display_label, importance, current_revision_id",
    )
    .eq("law_id", law.law_id)
    .eq("level", "article")
    .is("deleted_at", null);
  if (opts.importanceMin > 0) q = q.gte("importance", opts.importanceMin);
  const { data: rows, error } = await q;
  if (error) throw error;
  let matched = rows ?? [];

  if (opts.bookmarkMin > 0) {
    const { data: bms, error: bmErr } = await client
      .from("user_bookmarks")
      .select("target_id, star_level")
      .eq("user_id", opts.userId)
      .eq("target_type", "article")
      .gte("star_level", opts.bookmarkMin)
      .is("deleted_at", null);
    if (bmErr) throw bmErr;
    const bmSet = new Set((bms ?? []).map((b) => b.target_id));
    matched = matched.filter((a) => bmSet.has(a.article_id));
  }

  matched.sort((x, y) => {
    const xn = naturalKey(x.article_number);
    const yn = naturalKey(y.article_number);
    if (xn[0] !== yn[0]) return xn[0] - yn[0];
    return xn[1] - yn[1];
  });

  const total = matched.length;
  const page = matched.slice(opts.offset, opts.offset + opts.limit);

  // 본문 — current_revision_id 청크 조회(★대량 .in() URL 초과 방지).
  const revIds = page
    .map((a) => a.current_revision_id)
    .filter((x): x is string => x != null);
  const revMap = new Map<string, unknown>();
  const CHUNK = 100;
  for (let i = 0; i < revIds.length; i += CHUNK) {
    const { data: revs, error: revErr } = await client
      .from("article_revisions")
      .select("revision_id, body_json")
      .in("revision_id", revIds.slice(i, i + CHUNK));
    if (revErr) throw revErr;
    for (const r of revs ?? []) revMap.set(r.revision_id, r.body_json);
  }

  return {
    total,
    items: page.map((a) => ({
      articleId: a.article_id,
      articleNumber: a.article_number,
      displayLabel: a.display_label,
      importance: a.importance ?? 0,
      bodyJson: a.current_revision_id
        ? (revMap.get(a.current_revision_id) ?? null)
        : null,
    })),
  };
}

export interface FilteredArticleRef {
  articleId: string;
  articleNumber: string | null;
  displayLabel: string;
}

// 필터 정독 스코프의 조문 목록(본문 제외) — 조문 뷰어 prev/next 를 필터셋으로 한정하려
// 전체 매칭 조문을 자연순으로 반환. getArticlesByTreeFilter 와 같은 AND 의미론이되
// 본문(article_revisions)은 조회하지 않아 가볍다.
export async function getFilteredArticleRefs(
  client: SupabaseClient<Database>,
  lawCode: string,
  opts: { importanceMin: number; bookmarkMin: number; userId: string },
): Promise<FilteredArticleRef[]> {
  if (opts.importanceMin <= 0 && opts.bookmarkMin <= 0) return [];
  const { data: law } = await client
    .from("laws")
    .select("law_id")
    .eq("law_code", lawCode)
    .maybeSingle();
  if (!law) return [];

  let q = client
    .from("articles")
    .select("article_id, article_number, display_label, importance")
    .eq("law_id", law.law_id)
    .eq("level", "article")
    .is("deleted_at", null);
  if (opts.importanceMin > 0) q = q.gte("importance", opts.importanceMin);
  const { data: rows, error } = await q;
  if (error) throw error;
  let matched = rows ?? [];

  if (opts.bookmarkMin > 0) {
    const { data: bms, error: bmErr } = await client
      .from("user_bookmarks")
      .select("target_id, star_level")
      .eq("user_id", opts.userId)
      .eq("target_type", "article")
      .gte("star_level", opts.bookmarkMin)
      .is("deleted_at", null);
    if (bmErr) throw bmErr;
    const bmSet = new Set((bms ?? []).map((b) => b.target_id));
    matched = matched.filter((a) => bmSet.has(a.article_id));
  }

  matched.sort((x, y) => {
    const xn = naturalKey(x.article_number);
    const yn = naturalKey(y.article_number);
    if (xn[0] !== yn[0]) return xn[0] - yn[0];
    return xn[1] - yn[1];
  });

  return matched.map((a) => ({
    articleId: a.article_id,
    articleNumber: a.article_number,
    displayLabel: a.display_label,
  }));
}

export interface RevisionHistoryEntry {
  revisionId: string;
  // draft 상태에서는 NULL.
  effectiveDate: string | null;
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
