// 한 법(예: 특허법) 의 모든 조문 빈칸 자료를 한 화면에서 편집.
//
// 각 조문 카드 (ArticleEditCard):
//   좌: 빈칸 자료 본문 (AdminBlanksRenderProvider 로 빈칸을 placeholder 버튼으로 시각화)
//   우: BlankRowEditor 목록 + 미매칭 빈칸 섹션 (정답 입력됨 / 미입력 분리, 일괄 삭제 버튼)
//
// 본문에서 텍스트를 드래그하면 해당 카드 위에 floating "새 빈칸" 버튼 표시 — top-level 에서
// selection 을 추적해 어느 카드 영역에서 발생했는지 식별 후 적절한 set 에 빈칸 추가.

import { ArrowLeftIcon, PlusCircleIcon, Trash2Icon } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, data, useFetcher, useRevalidator } from "react-router";

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
import { computeBlockBlankHits } from "~/features/blanks/lib/blank-layout";
import { ArticleBodyView } from "~/features/laws/components/article-body";
import {
  parseArticleBody,
  type ArticleBody,
} from "~/features/laws/lib/article-body";
import {
  lawSubjectSlugSchema,
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
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const lawCodeParsed = lawSubjectSlugSchema.safeParse(params.lawCode);
  if (!lawCodeParsed.success) throw data("Invalid lawCode", { status: 400 });
  const lawCode = lawCodeParsed.data;

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
  if (!law) throw data("Law not found", { status: 404 });

  const { data: articles } = await client
    .from("articles")
    .select(
      "article_id, article_number, display_label, importance, current_revision_id",
    )
    .eq("law_id", law.law_id)
    .eq("level", "article")
    .is("deleted_at", null);

  // article_number "29의2" 같은 형식을 [major, minor] 로 파싱해 정렬.
  function articleSortKey(num: string | null): [number, number] {
    if (!num) return [0, 0];
    const m = num.match(/^(\d+)(?:의(\d+))?/);
    if (!m) return [0, 0];
    return [Number(m[1]), m[2] ? Number(m[2]) : 0];
  }
  const articleRows = (articles ?? [])
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
    return {
      articleId: a.article_id,
      articleNumber: a.article_number ?? "",
      displayLabel: a.display_label ?? "",
      importance: a.importance ?? 0,
      bodyJson: rev ?? null,
      setId: set?.set_id ?? null,
      blanks: set ? parseBlanks(set.blanks) : [],
      isOwner: !!set,
    };
  });

  return { lawCode, articles: articlesData };
}

export default function AdminBlanksAll({ loaderData }: Route.ComponentProps) {
  const { lawCode, articles } = loaderData;

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

  // 모든 조문에 대해 미매칭 빈칸 사전 계산. articleId → unplaced blanks.
  // 카드별로 같은 계산을 다시 하지 않도록 props 로 내려보내고, 전체 일괄 삭제 버튼이 사용.
  const unplacedByArticle = useMemo(() => {
    const out = new Map<string, BlankRow[]>();
    for (const a of articles) {
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
  }, [articles]);

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
  }, [articles, unplacedByArticle, totalUnplaced]);

  // 통계
  const totalArticles = articles.length;
  const articlesWithSet = articles.filter((a) => a.setId).length;
  const totalBlanks = articles.reduce((s, a) => s + a.blanks.length, 0);
  const filledBlanks = articles.reduce(
    (s, a) => s + a.blanks.filter((b) => b.answer.trim().length > 0).length,
    0,
  );

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-5 py-6 md:px-10 md:py-8">
      {selection ? (
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

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link
          to={`/admin/blanks?law=${lawCode}`}
          viewTransition
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeftIcon className="size-4" /> 빈칸 자료 목록
        </Link>
        <div className="flex flex-col items-end gap-0.5">
          <h1 className="text-xl font-bold tracking-tight">
            {lawCode} — 모든 조문 빈칸 자료
          </h1>
          <p className="text-muted-foreground text-xs">
            조문 {totalArticles}개 · 자료 보유 {articlesWithSet}개 · 빈칸{" "}
            {filledBlanks}/{totalBlanks}
            {totalUnplaced > 0 ? (
              <span className="ml-2 text-amber-700 dark:text-amber-400">
                · 미매칭 {totalUnplaced}개
              </span>
            ) : null}
          </p>
        </div>
      </div>

      {totalUnplaced > 0 || bulkResult ? (
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

      <div className="space-y-4">
        {articles.map((a) => (
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
              제{articleNumber}조
            </p>
            <h2 className="text-base font-bold tracking-tight">
              {displayLabel || `제${articleNumber}조`}
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
