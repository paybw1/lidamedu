// 한 법(예: 특허법) 의 모든 조문 빈칸 자료를 한 화면에서 편집.
//
// 각 조문 카드 (ArticleEditCard):
//   좌: 빈칸 자료 본문 (AdminBlanksRenderProvider 로 빈칸을 placeholder 버튼으로 시각화)
//   우: BlankRowEditor 목록 + 미매칭 빈칸 섹션 (정답 입력됨 / 미입력 분리, 일괄 삭제 버튼)
//
// 본문에서 텍스트를 드래그하면 해당 카드 위에 floating "새 빈칸" 버튼 표시 — top-level 에서
// selection 을 추적해 어느 카드 영역에서 발생했는지 식별 후 적절한 set 에 빈칸 추가.

import {
  ArrowLeftIcon,
  FileQuestionIcon,
  PlusCircleIcon,
  Trash2Icon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Link,
  data,
  redirect,
  useFetcher,
  useRevalidator,
  useSearchParams,
} from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminBlanksRenderProvider } from "~/features/blanks/components/admin-blanks-render-provider";
import {
  BlankRowEditor,
  type BlankRowData,
} from "~/features/blanks/components/blank-row-editor";
import { UnplacedBlanksSection } from "~/features/blanks/components/unplaced-blanks-section";
import {
  BLANK_LAW_TABS,
  isBlankLawSlug,
  type BlankLawSlug,
} from "~/features/blanks/lib/blank-law-slugs";
import { computeBlockBlankHits } from "~/features/blanks/lib/blank-layout";
import { ArticleBodyView } from "~/features/laws/components/article-body";
import {
  parseArticleBody,
  type ArticleBody,
} from "~/features/laws/lib/article-body";
import { articleDisplayPrefix } from "~/features/laws/lib/identifier";
import {
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-blanks-all";

interface BlankRow extends BlankRowData {
  beforeContext?: string;
  afterContext?: string;
}

function pickContext(...candidates: unknown[]): string | undefined {
  for (const v of candidates) {
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

function parseBlanks(value: unknown): BlankRow[] {
  if (!Array.isArray(value)) return [];
  const out: BlankRow[] = [];
  for (const v of value) {
    if (!v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    const idx = typeof o.idx === "number" ? o.idx : Number(o.idx);
    if (!Number.isFinite(idx)) continue;
    out.push({
      idx,
      length: typeof o.length === "number" ? o.length : 4,
      answer: typeof o.answer === "string" ? o.answer : "",
      beforeContext: pickContext(o.beforeContext, o.before_context),
      afterContext: pickContext(o.afterContext, o.after_context),
    });
  }
  return out.sort((a, b) => a.idx - b.idx);
}

// rangeRoot 안의 모든 text node 를 walk 해 cumulative text + range start/end offset 계산,
// ±contextLen 글자를 hint 로 반환. 동일 정답이 여러 곳에 등장할 때 disambiguation 에 사용.
function captureRangeContext(
  rangeRoot: Node,
  range: Range,
  contextLen: number,
): { beforeHint: string; afterHint: string } {
  if (typeof document === "undefined") return { beforeHint: "", afterHint: "" };
  const walker = document.createTreeWalker(rangeRoot, NodeFilter.SHOW_TEXT);
  let cumulative = "";
  let startOffset = -1;
  let endOffset = -1;
  let node = walker.nextNode();
  while (node) {
    if (node === range.startContainer) {
      startOffset = cumulative.length + range.startOffset;
    }
    if (node === range.endContainer) {
      endOffset = cumulative.length + range.endOffset;
    }
    cumulative += node.nodeValue ?? "";
    node = walker.nextNode();
  }
  if (startOffset < 0 || endOffset < 0) {
    return { beforeHint: "", afterHint: "" };
  }
  return {
    beforeHint: cumulative.slice(
      Math.max(0, startOffset - contextLen),
      startOffset,
    ),
    afterHint: cumulative.slice(
      endOffset,
      Math.min(cumulative.length, endOffset + contextLen),
    ),
  };
}

export const meta: Route.MetaFunction = ({ data: loaderData }) => {
  if (!loaderData) return [{ title: "빈칸 자료 (전체) | Lidam Edu" }];
  return [
    { title: `${loaderData.lawCode} 빈칸 자료 (전체) | Lidam Edu` },
  ];
};

interface ArticleData {
  articleId: string;
  articleNumber: string;
  displayLabel: string;
  importance: number;
  bodyJson: unknown;
  setId: string | null;
  blanks: BlankRow[];
  isOwner: boolean;
  // 가장 가까운 chapter (없으면 null — "기타" 그룹).
  chapterId: string | null;
}

interface ChapterInfo {
  chapterId: string;
  displayLabel: string;
  path: string;
}

const UNGROUPED_CHAPTER_ID = "__ungrouped__";

export async function loader({ params, request }: Route.LoaderArgs) {
  const rawLawCode = params.lawCode ?? "";
  if (!isBlankLawSlug(rawLawCode)) {
    // 빈칸 자료 대상 4과목 외이면 목록으로 redirect (운영 결정: 민사소송법은 빈칸 미대상).
    throw redirect("/admin/blanks?law=patent");
  }
  const lawCode: BlankLawSlug = rawLawCode;

  const [client] = makeServerClient(request);
  // private.layout 이 이미 auth.getUser 로 세션을 검증해서 redirect 가드를 통과한 상태.
  // 여기서는 cookie 에 저장된 session 만 읽어 user.id 만 확보 (network 라운드 트립 없음).
  // 로더가 무거워서 HMR 재실행시마다 getUser 까지 다시 호출하면 Supabase auth 429 에 쉽게 걸린다.
  const {
    data: { session },
  } = await client.auth.getSession();
  const user = session?.user;
  if (!user) throw data("Unauthorized", { status: 401 });
  const { data: profile } = await client
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .maybeSingle();
  const role = profile?.role ?? "student";
  if (role !== "instructor" && role !== "admin") {
    throw data("Forbidden", { status: 403 });
  }

  const { data: law } = await client
    .from("laws")
    .select("law_id, law_code")
    .eq("law_code", lawCode)
    .maybeSingle();
  // 조문 미업로드 법령(law row 아예 없음) — 안내 화면을 위해 articles=[], chapters=[] 로 반환.
  if (!law) {
    return {
      lawCode,
      articles: [] as ArticleData[],
      chapters: [] as ChapterInfo[],
    };
  }

  // article + chapter 노드 모두 fetch — chapter 그룹화에 사용.
  const { data: allNodes } = await client
    .from("articles")
    .select(
      "article_id, level, path, article_number, display_label, importance, current_revision_id",
    )
    .eq("law_id", law.law_id)
    .is("deleted_at", null);

  const nodeRows = allNodes ?? [];

  // chapter 노드 → { chapterId, label, path }, path 기준 정렬.
  const chapterRows = nodeRows
    .filter((n) => n.level === "chapter")
    .map((n) => ({
      chapterId: n.article_id,
      displayLabel: n.display_label ?? "",
      path: typeof n.path === "string" ? n.path : String(n.path ?? ""),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));

  function findChapterForPath(path: string): string | null {
    // 가장 긴 prefix 매칭 (chapter 가 중첩될 일은 없지만 path 비교는 prefix + '.' 기준).
    let best: { chapterId: string; pathLen: number } | null = null;
    for (const c of chapterRows) {
      if (path === c.path || path.startsWith(`${c.path}.`)) {
        if (!best || c.path.length > best.pathLen) {
          best = { chapterId: c.chapterId, pathLen: c.path.length };
        }
      }
    }
    return best ? best.chapterId : null;
  }

  // article_number "29의2" 같은 형식을 [major, minor] 로 파싱해 정렬.
  function articleSortKey(num: string | null): [number, number] {
    if (!num) return [0, 0];
    const m = num.match(/^(\d+)(?:의(\d+))?/);
    if (!m) return [0, 0];
    return [Number(m[1]), m[2] ? Number(m[2]) : 0];
  }
  const articleRows = nodeRows
    .filter((n) => n.level === "article")
    .slice()
    .sort((a, b) => {
      const aK = articleSortKey(a.article_number);
      const bK = articleSortKey(b.article_number);
      if (aK[0] !== bK[0]) return aK[0] - bK[0];
      return aK[1] - bK[1];
    });
  const revIds = articleRows
    .map((a) => a.current_revision_id)
    .filter((v): v is string => v != null);
  const revById = new Map<string, unknown>();
  if (revIds.length > 0) {
    const { data: revs } = await client
      .from("article_revisions")
      .select("revision_id, body_json")
      .in("revision_id", revIds);
    for (const r of revs ?? []) revById.set(r.revision_id, r.body_json);
  }

  // 현재 사용자의 set 만 fetch (소유한 자료에 대해서만 편집).
  const articleIds = articleRows.map((a) => a.article_id);
  const setByArticleId = new Map<
    string,
    { set_id: string; blanks: unknown }
  >();
  if (articleIds.length > 0) {
    const { data: setsData } = await client
      .from("article_blank_sets")
      .select("set_id, article_id, blanks")
      .in("article_id", articleIds)
      .eq("owner_id", user.id);
    for (const s of setsData ?? []) {
      setByArticleId.set(s.article_id, { set_id: s.set_id, blanks: s.blanks });
    }
  }

  const articlesData: ArticleData[] = articleRows.map((a) => {
    const rev = a.current_revision_id ? revById.get(a.current_revision_id) : null;
    const set = setByArticleId.get(a.article_id);
    const path = typeof a.path === "string" ? a.path : String(a.path ?? "");
    return {
      articleId: a.article_id,
      articleNumber: a.article_number ?? "",
      displayLabel: a.display_label ?? "",
      importance: a.importance ?? 0,
      bodyJson: rev ?? null,
      setId: set?.set_id ?? null,
      blanks: set ? parseBlanks(set.blanks) : [],
      isOwner: !!set,
      chapterId: findChapterForPath(path),
    };
  });

  // chapter 목록 (실제로 article 이 매핑된 chapter 만 + 미분류).
  const chapterIdsWithArticles = new Set(
    articlesData.map((a) => a.chapterId).filter((v): v is string => v !== null),
  );
  const chapters: ChapterInfo[] = chapterRows
    .filter((c) => chapterIdsWithArticles.has(c.chapterId))
    .map((c) => ({
      chapterId: c.chapterId,
      displayLabel: c.displayLabel,
      path: c.path,
    }));
  if (articlesData.some((a) => a.chapterId === null)) {
    chapters.push({
      chapterId: UNGROUPED_CHAPTER_ID,
      displayLabel: "미분류",
      path: "~", // 정렬 시 항상 맨 뒤.
    });
  }

  return { lawCode, articles: articlesData, chapters };
}

export default function AdminBlanksAll({ loaderData }: Route.ComponentProps) {
  const { lawCode, articles, chapters } = loaderData;

  // chapter 미지정 = 장 인덱스 화면.
  // chapter=__all__ = 모든 조문 한 화면 편집 (chapter 그룹 헤더는 유지).
  // chapter=<chapterId> = 그 장의 조문만 편집.
  const ALL_SENTINEL = "__all__";
  const [searchParams, setSearchParams] = useSearchParams();
  const chapterParam = searchParams.get("chapter");
  const isAllMode = chapterParam === ALL_SENTINEL;
  const activeChapterId =
    !isAllMode &&
    chapterParam &&
    chapters.some((c) => c.chapterId === chapterParam)
      ? chapterParam
      : null;
  const visibleArticles = useMemo(
    () =>
      activeChapterId === null
        ? articles
        : articles.filter((a) => {
            if (activeChapterId === UNGROUPED_CHAPTER_ID) {
              return a.chapterId === null;
            }
            return a.chapterId === activeChapterId;
          }),
    [articles, activeChapterId],
  );

  const setChapterFilter = useCallback(
    (chapterId: string | null) => {
      const next = new URLSearchParams(searchParams);
      if (chapterId === null) next.delete("chapter");
      else next.set("chapter", chapterId);
      setSearchParams(next, { preventScrollReset: true });
    },
    [searchParams, setSearchParams],
  );

  // selection 의 식별자는 articleId. setId 가 없는 카드 (자료 미생성) 에서도 selection 가능 —
  // server action 이 setId 없으면 자동으로 set 을 만들고 빈칸 추가.
  const [selection, setSelection] = useState<{
    articleId: string;
    setId: string | null;
    text: string;
    beforeHint: string;
    afterHint: string;
    // 선택 영역의 가장 가까운 clause/item/sub DOM id (예: "clause-5"). fallback hint.
    blockHint: string | null;
    // 정확 위치 — DOM data attribute 캡처 (blockIndex + cumulative offset within block).
    blockIndex: number | null;
    cumOffset: number | null;
    top: number;
    left: number;
  } | null>(null);

  // 카드별 ref 등록 — key 는 articleId.
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const registerRef = useCallback(
    (articleId: string, ref: HTMLDivElement | null) => {
      if (ref) cardRefs.current.set(articleId, ref);
      else cardRefs.current.delete(articleId);
    },
    [],
  );

  // articleId → setId 룩업 (selection 시점에 setId 있으면 같이 전달, 없으면 server 가 자동 생성).
  const setIdByArticle = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of articles) {
      if (a.setId) m.set(a.articleId, a.setId);
    }
    return m;
  }, [articles]);

  const captureSelection = useCallback(() => {
    if (typeof window === "undefined") return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      setSelection(null);
      return;
    }
    const text = sel.toString().trim();
    if (!text) {
      setSelection(null);
      return;
    }
    const range = sel.getRangeAt(0);

    for (const [articleId, ref] of cardRefs.current.entries()) {
      let n: Node | null = range.startContainer;
      let inside = false;
      let blockHint: string | null = null;
      let blockIndex: number | null = null;
      let cumOffsetSpan: HTMLElement | null = null;
      while (n) {
        if (n === ref) {
          inside = true;
          break;
        }
        if (n.nodeType === 1) {
          const el = n as HTMLElement;
          if (cumOffsetSpan === null && el.dataset?.cumoffset !== undefined) {
            cumOffsetSpan = el;
          }
          if (blockIndex === null && el.dataset?.blockIndex !== undefined) {
            const v = Number(el.dataset.blockIndex);
            if (Number.isFinite(v)) blockIndex = v;
          }
          const id = el.id;
          if (!blockHint && id && /^(clause|item|sub)-/.test(id)) {
            blockHint = id;
          }
        }
        n = n.parentNode;
      }
      if (inside) {
        let cumOffset: number | null = null;
        if (cumOffsetSpan) {
          const base = Number(cumOffsetSpan.dataset.cumoffset);
          if (Number.isFinite(base)) {
            let offsetInSpan = 0;
            const walker = document.createTreeWalker(
              cumOffsetSpan,
              NodeFilter.SHOW_TEXT,
            );
            let tn = walker.nextNode();
            while (tn) {
              if (tn === range.startContainer) {
                offsetInSpan += range.startOffset;
                cumOffset = base + offsetInSpan;
                break;
              }
              offsetInSpan += tn.nodeValue?.length ?? 0;
              tn = walker.nextNode();
            }
          }
        }
        const { beforeHint, afterHint } = captureRangeContext(ref, range, 80);
        const rect = range.getBoundingClientRect();
        setSelection({
          articleId,
          setId: setIdByArticle.get(articleId) ?? null,
          text,
          beforeHint,
          afterHint,
          blockHint,
          blockIndex,
          cumOffset,
          top: rect.bottom + 6,
          left: rect.left,
        });
        return;
      }
    }
    setSelection(null);
  }, [setIdByArticle]);

  useEffect(() => {
    document.addEventListener("selectionchange", captureSelection);
    return () =>
      document.removeEventListener("selectionchange", captureSelection);
  }, [captureSelection]);

  const addBlankFetcher = useFetcher<{
    ok: boolean;
    newIdx?: number;
    setId?: string;
    error?: string;
  }>();
  const revalidator = useRevalidator();
  const addNewBlankFromSelection = useCallback(() => {
    if (!selection) return;
    const fd = new FormData();
    if (selection.setId) {
      fd.set("setId", selection.setId);
    } else {
      fd.set("articleId", selection.articleId);
    }
    fd.set("selectionText", selection.text);
    fd.set("beforeHint", selection.beforeHint);
    fd.set("afterHint", selection.afterHint);
    if (selection.blockHint) fd.set("blockHint", selection.blockHint);
    if (selection.blockIndex !== null)
      fd.set("blockIndex", String(selection.blockIndex));
    if (selection.cumOffset !== null)
      fd.set("cumOffset", String(selection.cumOffset));
    addBlankFetcher.submit(fd, {
      method: "post",
      action: "/api/blanks/admin-add-blank",
    });
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  }, [selection, addBlankFetcher]);

  // setId 가 새로 만들어진 응답이 오면 (자료 없던 카드에 빈칸 추가 시) loader 재실행으로 새 set 반영.
  const lastNewSetIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (addBlankFetcher.state !== "idle" || !addBlankFetcher.data) return;
    if (!addBlankFetcher.data.ok || !addBlankFetcher.data.setId) return;
    const newSetId = addBlankFetcher.data.setId;
    const knownSet = articles.some((a) => a.setId === newSetId);
    // 아직 loader 데이터에 그 setId 가 없으면 — 자동 생성된 새 set. revalidate.
    if (!knownSet && lastNewSetIdRef.current !== newSetId) {
      lastNewSetIdRef.current = newSetId;
      revalidator.revalidate();
    }
  }, [addBlankFetcher.state, addBlankFetcher.data, articles, revalidator]);

  // 표시 중인 조문에 대해서만 미매칭 빈칸 사전 계산. 일괄 삭제도 표시 범위 기준.
  const unplacedByArticle = useMemo(() => {
    const out = new Map<string, BlankRow[]>();
    for (const a of visibleArticles) {
      if (!a.setId || a.blanks.length === 0) continue;
      const body = parseArticleBody(a.bodyJson);
      if (!body) {
        // body 가 없는데 blanks 만 있으면 모두 미매칭으로 취급.
        out.set(a.articleId, a.blanks);
        continue;
      }
      const map = computeBlockBlankHits(body, a.blanks);
      const placed = new Set<number>();
      for (const hits of map.values()) {
        for (const h of hits) placed.add(h.blank.idx);
      }
      const unplaced = a.blanks.filter((b) => !placed.has(b.idx));
      if (unplaced.length > 0) out.set(a.articleId, unplaced);
    }
    return out;
  }, [visibleArticles]);

  const totalUnplaced = useMemo(() => {
    let n = 0;
    for (const arr of unplacedByArticle.values()) n += arr.length;
    return n;
  }, [unplacedByArticle]);

  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkResult, setBulkResult] = useState<string | null>(null);
  const handleDeleteAllUnmatched = useCallback(async () => {
    if (totalUnplaced === 0) {
      setBulkResult("미매칭 빈칸이 없습니다.");
      return;
    }
    if (
      !confirm(
        `전체 미매칭 빈칸 ${totalUnplaced}개를 모두 삭제할까요? 이 작업은 되돌릴 수 없습니다.`,
      )
    )
      return;
    setBulkDeleting(true);
    setBulkResult(null);
    let removedTotal = 0;
    let failedSets = 0;
    for (const a of articles) {
      if (!a.setId) continue;
      const unplaced = unplacedByArticle.get(a.articleId);
      if (!unplaced || unplaced.length === 0) continue;
      const fd = new FormData();
      fd.set("setId", a.setId);
      fd.set("blankIdxs", unplaced.map((b) => b.idx).join(","));
      try {
        const res = await fetch("/api/blanks/admin-remove-blanks", {
          method: "POST",
          body: fd,
        });
        const json = (await res.json()) as { ok: boolean; removed?: number };
        if (json.ok) removedTotal += json.removed ?? 0;
        else failedSets++;
      } catch {
        failedSets++;
      }
    }
    setBulkDeleting(false);
    setBulkResult(
      `삭제 완료: ${removedTotal}개 제거됨` +
        (failedSets > 0 ? ` (실패한 set ${failedSets}개)` : ""),
    );
    // 페이지 reload 로 loader 재실행 → 최신 데이터 반영.
    window.location.reload();
  }, [visibleArticles, unplacedByArticle, totalUnplaced]);

  // 통계 — 표시 중인 범위 기준.
  const totalArticles = visibleArticles.length;
  const articlesWithSet = visibleArticles.filter((a) => a.setId).length;
  const totalBlanks = visibleArticles.reduce((s, a) => s + a.blanks.length, 0);
  const filledBlanks = visibleArticles.reduce(
    (s, a) => s + a.blanks.filter((b) => b.answer.trim().length > 0).length,
    0,
  );

  // chapter 단위 그룹화 (표시 순). chapterId 가 null 인 article 은 UNGROUPED 그룹.
  const groupedArticles = useMemo(() => {
    const groups: Array<{ chapter: typeof chapters[number]; items: typeof visibleArticles }> = [];
    const byChapterId = new Map<string, typeof visibleArticles>();
    for (const a of visibleArticles) {
      const key = a.chapterId ?? UNGROUPED_CHAPTER_ID;
      const arr = byChapterId.get(key) ?? [];
      arr.push(a);
      byChapterId.set(key, arr);
    }
    for (const c of chapters) {
      const items = byChapterId.get(c.chapterId);
      if (items && items.length > 0) groups.push({ chapter: c, items });
    }
    return groups;
  }, [visibleArticles, chapters]);

  // chapter 별 카운트 (필터 chip 표시용).
  const chapterCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of articles) {
      const key = a.chapterId ?? UNGROUPED_CHAPTER_ID;
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return m;
  }, [articles]);

  // chapter 별 통계 (인덱스 카드 표시용) — 조문 수 / 자료 보유 / 빈칸 합계 / 입력 완료 합계.
  interface ChapterStats {
    articleCount: number;
    setCount: number;
    totalBlanks: number;
    filledBlanks: number;
  }
  const chapterStats = useMemo(() => {
    const m = new Map<string, ChapterStats>();
    for (const a of articles) {
      const key = a.chapterId ?? UNGROUPED_CHAPTER_ID;
      const cur = m.get(key) ?? {
        articleCount: 0,
        setCount: 0,
        totalBlanks: 0,
        filledBlanks: 0,
      };
      cur.articleCount += 1;
      if (a.setId) cur.setCount += 1;
      cur.totalBlanks += a.blanks.length;
      cur.filledBlanks += a.blanks.filter((b) => b.answer.trim().length > 0)
        .length;
      m.set(key, cur);
    }
    return m;
  }, [articles]);

  // 인덱스 모드 = chapter 가 존재하고 chapter param 미지정 + __all__ 도 아닌 상태.
  // chapter=__all__ 이면 모든 조문을 한 화면에 펼쳐 편집.
  const indexMode =
    chapters.length > 0 && !isAllMode && activeChapterId === null;
  // 조문 자체가 업로드되지 않은 법령 — 안내 화면.
  const articlesEmpty = articles.length === 0;
  const lawName =
    BLANK_LAW_TABS.find((t) => t.slug === lawCode)?.name ?? lawCode;

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-5 py-6 md:px-10 md:py-8">
      {selection && !articlesEmpty ? (
        <button
          type="button"
          className="fixed z-50 inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-xs text-white shadow-lg hover:bg-emerald-700"
          style={{ top: selection.top, left: selection.left }}
          onMouseDown={(e) => {
            e.preventDefault();
            addNewBlankFromSelection();
          }}
          title="이 위치에 새 빈칸"
        >
          <PlusCircleIcon className="size-3" />새 빈칸 ({selection.text.length}자)
        </button>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="text-muted-foreground mr-1 text-xs">법령:</span>
        {BLANK_LAW_TABS.map((t) => {
          const active = t.slug === lawCode;
          return (
            <Link
              key={t.slug}
              to={`/admin/blanks/law/${t.slug}`}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs font-semibold",
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-input hover:bg-accent",
              )}
            >
              {t.name}
            </Link>
          );
        })}
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        {indexMode ? (
          <Link
            to={`/admin/blanks?law=${lawCode}`}
            viewTransition
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
          >
            <ArrowLeftIcon className="size-4" /> 빈칸 자료 목록
          </Link>
        ) : chapters.length > 0 ? (
          <button
            type="button"
            onClick={() => setChapterFilter(null)}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
          >
            <ArrowLeftIcon className="size-4" /> 모든 장
          </button>
        ) : (
          <Link
            to={`/admin/blanks?law=${lawCode}`}
            viewTransition
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
          >
            <ArrowLeftIcon className="size-4" /> 빈칸 자료 목록
          </Link>
        )}
        <div className="flex flex-col items-end gap-0.5">
          <h1 className="text-xl font-bold tracking-tight">
            {lawName}
            {articlesEmpty
              ? " — 조문 업로드 대기"
              : indexMode
                ? " — 장별 빈칸 자료"
                : isAllMode
                  ? " — 전체 조문 빈칸 자료"
                  : activeChapterId !== null
                    ? ` — ${
                        chapters.find((c) => c.chapterId === activeChapterId)
                          ?.displayLabel ?? ""
                      }`
                    : " — 모든 조문 빈칸 자료"}
          </h1>
          {!articlesEmpty ? (
            <p className="text-muted-foreground text-xs">
              {indexMode
                ? `장 ${chapters.length}개 · 조문 ${articles.length}개 · 빈칸 ${filledBlanks}/${totalBlanks}`
                : `조문 ${totalArticles}개 · 자료 보유 ${articlesWithSet}개 · 빈칸 ${filledBlanks}/${totalBlanks}`}
              {totalUnplaced > 0 ? (
                <span className="ml-2 text-amber-700 dark:text-amber-400">
                  · 미매칭 {totalUnplaced}개
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
      </div>

      {/* 편집 모드에서만 다른 그룹으로 빠르게 이동할 수 있도록 chip 행 노출. */}
      {!articlesEmpty && !indexMode && chapters.length > 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground mr-1 text-xs font-semibold">
            편집 그룹:
          </span>
          <button
            type="button"
            onClick={() => setChapterFilter(ALL_SENTINEL)}
            className={cn(
              "rounded-md border px-2 py-0.5 text-xs",
              isAllMode
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-input hover:bg-accent",
            )}
          >
            전체 ({articles.length})
          </button>
          {chapters.map((c) => {
            const active = activeChapterId === c.chapterId;
            const count = chapterCounts.get(c.chapterId) ?? 0;
            return (
              <button
                key={c.chapterId}
                type="button"
                onClick={() => setChapterFilter(c.chapterId)}
                className={cn(
                  "rounded-md border px-2 py-0.5 text-xs",
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-input hover:bg-accent",
                )}
                title={c.displayLabel}
              >
                {c.displayLabel} ({count})
              </button>
            );
          })}
        </div>
      ) : null}

      {articlesEmpty ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="bg-muted text-muted-foreground rounded-full p-3">
              <FileQuestionIcon className="size-6" />
            </div>
            <h2 className="text-base font-bold">
              {lawName} 조문이 아직 업로드되지 않았습니다
            </h2>
            <p className="text-muted-foreground max-w-md text-sm">
              조문이 업로드되면 자동으로 이 페이지에서 빈칸 자료를 만들 수
              있습니다. 다른 법령을 보려면 위 법령 탭을 선택하세요.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {!indexMode && (totalUnplaced > 0 || bulkResult) ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-300/60 bg-amber-50/60 px-3 py-2 text-xs dark:border-amber-700/60 dark:bg-amber-950/30">
          <div>
            <p className="font-semibold text-amber-900 dark:text-amber-200">
              본문에 표시되지 않은 빈칸 — 전체 {totalUnplaced}개
            </p>
            {bulkResult ? (
              <p className="text-emerald-700 dark:text-emerald-400">
                {bulkResult}
              </p>
            ) : (
              <p className="text-amber-800/80 dark:text-amber-300/80">
                컨텍스트 불일치 등의 이유로 본문 위치를 잡지 못한 빈칸입니다.
              </p>
            )}
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleDeleteAllUnmatched}
            disabled={bulkDeleting || totalUnplaced === 0}
            className="h-8 gap-1 px-2 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700"
          >
            <Trash2Icon className="size-3.5" />
            {bulkDeleting ? "삭제 중…" : "전체 미매칭 빈칸 삭제"}
          </Button>
        </div>
      ) : null}

      {articlesEmpty ? null : indexMode ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {chapters.map((c) => {
            const stats = chapterStats.get(c.chapterId);
            const articleCount = stats?.articleCount ?? 0;
            const setCount = stats?.setCount ?? 0;
            const filled = stats?.filledBlanks ?? 0;
            const totalB = stats?.totalBlanks ?? 0;
            const fillPct =
              totalB > 0 ? Math.round((filled / totalB) * 100) : 0;
            return (
              <button
                key={c.chapterId}
                type="button"
                onClick={() => setChapterFilter(c.chapterId)}
                className="group bg-card text-card-foreground hover:border-primary/60 hover:bg-accent/50 flex flex-col items-start gap-2 rounded-lg border p-4 text-left shadow-sm transition"
              >
                <p className="text-base font-bold tracking-tight">
                  {c.displayLabel}
                </p>
                <p className="text-muted-foreground text-xs">
                  조문 {articleCount}개 · 자료 보유 {setCount}개
                </p>
                <div className="bg-muted w-full overflow-hidden rounded-full">
                  <div
                    className="bg-primary h-1.5"
                    style={{ width: `${fillPct}%` }}
                  />
                </div>
                <p className="text-muted-foreground text-[11px] tabular-nums">
                  빈칸 {filled}/{totalB} ({fillPct}%)
                </p>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="space-y-8">
          {groupedArticles.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              해당 장에 조문이 없습니다.
            </p>
          ) : (
            groupedArticles.map(({ chapter, items }) => (
              <section key={chapter.chapterId} className="space-y-3">
                <div className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-10 -mx-2 flex items-center justify-between gap-2 border-b px-2 py-2 backdrop-blur">
                  <h2 className="text-base font-bold tracking-tight">
                    {chapter.displayLabel}
                  </h2>
                  <span className="text-muted-foreground text-xs">
                    조문 {items.length}개
                  </span>
                </div>
                <div className="space-y-4">
                  {items.map((a) => (
                    <ArticleEditCard
                      key={a.articleId}
                      article={a}
                      lawCode={lawCode}
                      registerRef={registerRef}
                      recentlyAddedNewIdx={
                        addBlankFetcher.state === "idle" &&
                        (addBlankFetcher.data as { ok?: boolean; newIdx?: number })?.ok &&
                        (addBlankFetcher.data as { ok?: boolean; newIdx?: number; setId?: string })
                          ? (addBlankFetcher.data as { newIdx?: number }).newIdx ?? null
                          : null
                      }
                    />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function ArticleEditCard({
  article,
  lawCode,
  registerRef,
  recentlyAddedNewIdx,
}: {
  article: ArticleData;
  lawCode: LawSubjectSlug;
  registerRef: (articleId: string, ref: HTMLDivElement | null) => void;
  recentlyAddedNewIdx: number | null;
}) {
  const { articleId, articleNumber, displayLabel, importance, bodyJson, setId, blanks, isOwner } =
    article;
  const originalBody = useMemo<ArticleBody | null>(
    () => parseArticleBody(bodyJson),
    [bodyJson],
  );

  const [drafts, setDrafts] = useState<Record<number, string>>(() => {
    const init: Record<number, string> = {};
    for (const b of blanks) init[b.idx] = b.answer;
    return init;
  });
  useEffect(() => {
    setDrafts((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const b of blanks) {
        if (next[b.idx] === undefined) {
          next[b.idx] = b.answer;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [blanks]);

  const [activeIdx, setActiveIdx] = useState<number | null>(
    blanks.find((b) => !b.answer.trim())?.idx ?? null,
  );

  // computeBlockBlankHits 결과로 placed/unplaced 분류.
  const placedIdxSet = useMemo(() => {
    if (!originalBody) return new Set<number>();
    const map = computeBlockBlankHits(originalBody, blanks);
    const s = new Set<number>();
    for (const hits of map.values()) {
      for (const h of hits) s.add(h.blank.idx);
    }
    return s;
  }, [originalBody, blanks]);
  const unplacedBlanks = useMemo(
    () => blanks.filter((b) => !placedIdxSet.has(b.idx)),
    [blanks, placedIdxSet],
  );

  const filledCount = useMemo(
    () => blanks.filter((b) => b.answer.trim().length > 0).length,
    [blanks],
  );

  const articleHeaderId = `art-${articleNumber}`;

  return (
    <Card id={articleHeaderId} className="scroll-mt-16">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              {articleDisplayPrefix(articleNumber)}
            </p>
            <h2 className="text-base font-bold tracking-tight">
              {displayLabel || articleDisplayPrefix(articleNumber)}
            </h2>
            {importance > 0 ? (
              <span className="text-amber-600 text-xs">{"★".repeat(importance)}</span>
            ) : null}
          </div>
          {setId ? (
            <Badge variant="outline" className="font-mono text-[11px]">
              {filledCount}/{blanks.length} 채움
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-[11px]">자료 없음</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div
            ref={(el) => registerRef(articleId, el)}
            className="bg-muted/30 rounded-md border p-3"
          >
            {originalBody ? (
              setId ? (
                <AdminBlanksRenderProvider
                  setId={setId}
                  blanks={blanks}
                  drafts={drafts}
                  activeIdx={activeIdx}
                  onActivate={setActiveIdx}
                  body={originalBody}
                >
                  <ArticleBodyView
                    body={originalBody}
                    titleMap={new Map()}
                    subtitlesOnly={false}
                    lawCode={lawCode}
                  />
                </AdminBlanksRenderProvider>
              ) : (
                // set 이 없어도 본문 표시 — 사용자가 드래그하면 selection 캡처돼 새 빈칸 추가 가능.
                <ArticleBodyView
                  body={originalBody}
                  titleMap={new Map()}
                  subtitlesOnly={false}
                  lawCode={lawCode}
                />
              )
            ) : (
              <p className="text-muted-foreground text-sm">
                본문이 등록되지 않았습니다.
              </p>
            )}
            {setId ? (
              <UnplacedBlanksSection
                setId={setId}
                unplaced={unplacedBlanks}
                activeIdx={activeIdx}
                onActivate={setActiveIdx}
                disabled={!isOwner}
              />
            ) : null}
          </div>

          <div className="space-y-2 self-start">
            {!setId ? (
              <p className="text-muted-foreground border-primary/40 bg-primary/5 rounded-md border border-dashed px-3 py-2 text-[11px]">
                자료 미생성. 본문에서 단어/구문 드래그 → "새 빈칸" 버튼 누르면
                자료가 자동 생성되고 빈칸이 추가됩니다.
              </p>
            ) : !isOwner ? (
              <p className="text-muted-foreground rounded-md border border-dashed bg-amber-50/40 px-3 py-2 text-[11px] dark:bg-amber-950/20">
                다른 강사 자료입니다.
              </p>
            ) : (
              <p className="text-muted-foreground border-primary/40 bg-primary/5 rounded-md border border-dashed px-3 py-2 text-[11px]">
                본문에서 단어/구문을 드래그해 "새 빈칸" 버튼으로 추가.
              </p>
            )}
            {setId && blanks.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                추가된 빈칸이 없습니다.
              </p>
            ) : (
              setId
                ? blanks.map((b) => (
                    <BlankRowEditor
                      key={b.idx}
                      setId={setId}
                      blank={b}
                      draft={drafts[b.idx] ?? ""}
                      active={activeIdx === b.idx}
                      initialFocus={recentlyAddedNewIdx === b.idx}
                      disabled={!isOwner}
                      onFocus={() => setActiveIdx(b.idx)}
                      onDraftChange={(v) =>
                        setDrafts((prev) => ({ ...prev, [b.idx]: v }))
                      }
                    />
                  ))
                : null
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
