import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  MousePointerClickIcon,
  PlusCircleIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, data, useFetcher } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminBlanksRenderProvider } from "~/features/blanks/components/admin-blanks-render-provider";
import { BlankRowEditor } from "~/features/blanks/components/blank-row-editor";
import { UnplacedBlanksSection } from "~/features/blanks/components/unplaced-blanks-section";
import { computeBlockBlankHits } from "~/features/blanks/lib/blank-layout";
import { ArticleBodyView } from "~/features/laws/components/article-body";
import { parseArticleBody } from "~/features/laws/lib/article-body";

import type { Route } from "./+types/admin-blanks-edit";

interface BlankRow {
  idx: number;
  length: number;
  answer: string;
  beforeContext?: string;
  afterContext?: string;
}

// snake_case 와 camelCase 가 한 row 에 공존하는 데이터가 있다 — 비어있지 않은 값을 우선.
function pickContext(...candidates: unknown[]): string | undefined {
  for (const v of candidates) {
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

function parseBlankRows(value: unknown): BlankRow[] {
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

// rangeRoot 안의 모든 text node 를 document order 로 walk 해 cumulative text 를 구성.
// range 의 시작/끝 offset 을 cumulative text 좌표로 변환한 뒤 그 주변 ±contextLen 글자를 잘라 반환.
// 동일 정답이 본문에 여러 번 등장할 때 사용자가 선택한 위치를 disambiguate 하는 데 쓰인다.
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
  if (!loaderData) return [{ title: "빈칸 자료 편집 | Lidam Edu" }];
  return [
    {
      title: `${loaderData.articleLabel} 빈칸 편집 | Lidam Edu`,
    },
  ];
};

export async function loader({ params, request }: Route.LoaderArgs) {
  const setId = params.setId;
  if (!setId) throw data("Missing setId", { status: 404 });

  const [client] = makeServerClient(request);
  // private.layout 이 이미 auth.getUser 로 세션 검증 후 가드를 통과시켰으므로 여기서는
  // network round-trip 없는 getSession 으로 user.id 만 확보한다 (Supabase auth 429 방지).
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

  const { data: row, error } = await client
    .from("article_blank_sets")
    .select(
      "set_id, article_id, version, body_text, blanks, owner_id, display_name, profiles!owner_id(name), articles(article_id, article_number, display_label, current_revision_id, law_id, laws(law_code))",
    )
    .eq("set_id", setId)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw data("Set not found", { status: 404 });

  const article = row.articles;
  const lawCode = article?.laws?.law_code ?? "patent";
  const blanks = parseBlankRows(row.blanks);
  const isOwner = row.owner_id === user.id;
  const ownerName = row.profiles?.name ?? "(이름없음)";

  // 원본 본문 fetch
  let originalBodyJson: unknown = null;
  if (article?.current_revision_id) {
    const { data: rev } = await client
      .from("article_revisions")
      .select("body_json")
      .eq("revision_id", article.current_revision_id)
      .maybeSingle();
    originalBodyJson = rev?.body_json ?? null;
  }

  // 미매칭 일괄 검수 화면에서 진입 시 활성 빈칸을 지정. 존재하지 않는 idx 면 무시.
  const focusParam = new URL(request.url).searchParams.get("focus");
  const focusIdx =
    focusParam && /^\d+$/.test(focusParam) ? Number(focusParam) : null;
  const initialFocusIdx =
    focusIdx != null && blanks.some((b) => b.idx === focusIdx)
      ? focusIdx
      : null;

  return {
    setId: row.set_id,
    bodyText: row.body_text,
    blanks,
    articleNumber: article?.article_number ?? "",
    articleLabel: article?.display_label ?? "",
    lawCode,
    originalBodyJson,
    isOwner,
    ownerName,
    version: row.version,
    displayName: row.display_name,
    initialFocusIdx,
  };
}

export default function AdminBlanksEdit({ loaderData }: Route.ComponentProps) {
  const {
    setId,
    bodyText,
    blanks,
    articleNumber,
    articleLabel,
    lawCode,
    originalBodyJson,
    isOwner,
    ownerName,
    version,
    displayName,
    initialFocusIdx,
  } = loaderData;
  const [drafts, setDrafts] = useState<Record<number, string>>(() => {
    const init: Record<number, string> = {};
    for (const b of blanks) init[b.idx] = b.answer;
    return init;
  });
  // revalidation 으로 새 blank 가 들어오면 drafts 에 그 answer 를 채워 sidebar 입력칸에 즉시 표시.
  // 이미 사용자가 편집 중인 idx 는 건드리지 않는다 (drafts[idx] 가 undefined 일 때만 채움).
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
  const originalBody = useMemo(
    () => parseArticleBody(originalBodyJson),
    [originalBodyJson],
  );

  const filledCount = useMemo(
    () => Object.values(drafts).filter((v) => v.trim().length > 0).length,
    [drafts],
  );

  // 본문에 표시되지 않는 빈칸 — computeBlockBlankHits 가 위치를 잡지 못한 빈칸 모두.
  // (정답 미입력) + (정답 입력됐으나 컨텍스트가 잘못돼 매칭 실패) 두 그룹.
  const placedIdxSet = useMemo(() => {
    if (!originalBody) return new Set<number>();
    const map = computeBlockBlankHits(originalBody, blanks);
    const s = new Set<number>();
    for (const hits of map.values()) {
      for (const h of hits) s.add(h.blank.idx);
    }
    return s;
  }, [originalBody, blanks]);
  const unlocatableBlanks = useMemo(
    () => blanks.filter((b) => !placedIdxSet.has(b.idx)),
    [blanks, placedIdxSet],
  );

  // 활성 빈칸 idx — URL ?focus= 가 있으면 우선, 없으면 첫 빈 슬롯
  const firstEmpty = blanks.find((b) => !drafts[b.idx]?.trim())?.idx ?? null;
  const [activeIdx, setActiveIdx] = useState<number | null>(
    initialFocusIdx ?? firstEmpty,
  );
  const lastSavedAtRef = useRef<Map<number, string>>(new Map());
  const inlineSavedFetcher = useFetcher();

  // 원본 본문 selection — floating button 표시 + 서버에 disambiguation hint 전달
  const [selection, setSelection] = useState<{
    text: string;
    // 선택 영역 주변 본문 텍스트 (DOM 기준 ±~30 글자) — fallback context.
    beforeHint: string;
    afterHint: string;
    // 선택 영역의 가장 가까운 clause/item/sub DOM id (예: "clause-5"). 서버 occurrence 한정용.
    blockHint: string | null;
    // 정확 위치 — DOM data attribute 에서 캡처. blockIndex (walkBlocks 인덱스) +
    // cumOffset (block 내 cumulative 좌표). 두 값 다 있으면 컨텍스트 매칭 우회하고 결정적 배치.
    blockIndex: number | null;
    cumOffset: number | null;
    top: number;
    left: number;
  } | null>(null);
  const originalRef = useRef<HTMLDivElement>(null);

  const captureSelection = useCallback(() => {
    if (typeof window === "undefined") return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      setSelection(null);
      return;
    }
    const text = sel.toString().trim();
    if (!text || !originalRef.current) {
      setSelection(null);
      return;
    }
    // selection 이 originalRef 안에서 발생했는지 확인.
    // 동시에: 가장 가까운 data-cumoffset span (정확 위치 base) + data-block-index (블록 인덱스)
    // + clause/item/sub id (fallback hint) 를 walk-up 으로 추출.
    const range = sel.getRangeAt(0);
    let n: Node | null = range.startContainer;
    let inside = false;
    let blockHint: string | null = null;
    let blockIndex: number | null = null;
    let cumOffsetSpan: HTMLElement | null = null;
    while (n) {
      if (n === originalRef.current) {
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
    if (!inside) {
      setSelection(null);
      return;
    }
    // 정확 cumOffset 계산 — cumOffsetSpan 안에서 selection start 까지의 char count.
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
    // 80자 윈도우 — 정확 위치 못 잡힌 경우 fallback 으로 사용.
    const { beforeHint, afterHint } = captureRangeContext(
      originalRef.current,
      range,
      80,
    );
    const rect = range.getBoundingClientRect();
    setSelection({
      text,
      beforeHint,
      afterHint,
      blockHint,
      blockIndex,
      cumOffset,
      top: rect.bottom + 6,
      left: rect.left,
    });
  }, []);

  useEffect(() => {
    document.addEventListener("selectionchange", captureSelection);
    return () =>
      document.removeEventListener("selectionchange", captureSelection);
  }, [captureSelection]);

  const applySelectionToActive = useCallback(() => {
    if (!selection || activeIdx == null) return;
    setDrafts((prev) => ({ ...prev, [activeIdx]: selection.text }));
    // 즉시 자동 저장 — 드래그 위치를 정확 좌표 + fallback hint 형태로 같이 보내서 슬롯 위치를
    // 그 드래그 자리로 결정적으로 이동시킨다. 같은 단어가 같은 항에 여러 번 있어도 안전.
    const fd = new FormData();
    fd.set("setId", setId);
    fd.set("blankIdx", String(activeIdx));
    fd.set("answer", selection.text);
    fd.set("beforeHint", selection.beforeHint);
    fd.set("afterHint", selection.afterHint);
    if (selection.blockHint) fd.set("blockHint", selection.blockHint);
    if (selection.blockIndex !== null)
      fd.set("blockIndex", String(selection.blockIndex));
    if (selection.cumOffset !== null)
      fd.set("cumOffset", String(selection.cumOffset));
    inlineSavedFetcher.submit(fd, {
      method: "post",
      action: "/api/blanks/admin-answer",
    });
    lastSavedAtRef.current.set(activeIdx, selection.text);
    // selection 해제 + 다음 빈 슬롯으로 active 이동
    window.getSelection()?.removeAllRanges();
    setSelection(null);
    const nextEmpty = blanks.find(
      (b) => b.idx !== activeIdx && !drafts[b.idx]?.trim(),
    );
    if (nextEmpty) setActiveIdx(nextEmpty.idx);
  }, [selection, activeIdx, setId, inlineSavedFetcher, blanks, drafts]);

  const addBlankFetcher = useFetcher();
  const addNewBlankFromSelection = useCallback(() => {
    if (!selection) return;
    const fd = new FormData();
    fd.set("setId", setId);
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
  }, [selection, setId, addBlankFetcher]);

  // 새 빈칸 추가 응답이 오면 그 빈칸을 active 로 만들고 sidebar 가 그 위치로 자동 스크롤되도록 한다.
  // BlankRowEditor 의 initialFocus 로직이 active idx 변화에 반응하도록 newlyAddedIdx state 로 트리거.
  const [newlyAddedIdx, setNewlyAddedIdx] = useState<number | null>(null);
  const lastNewIdxRef = useRef<number | null>(null);
  useEffect(() => {
    if (addBlankFetcher.state !== "idle" || !addBlankFetcher.data) return;
    const d = addBlankFetcher.data as { ok: boolean; newIdx?: number };
    if (d.ok && typeof d.newIdx === "number" && d.newIdx !== lastNewIdxRef.current) {
      lastNewIdxRef.current = d.newIdx;
      setActiveIdx(d.newIdx);
      setNewlyAddedIdx(d.newIdx);
    }
  }, [addBlankFetcher.state, addBlankFetcher.data]);

  // activeIdx 가 바뀌거나 새 빈칸이 추가되면 본문에서 그 placeholder 위치로 자동 스크롤.
  // admin-blanks-render-provider 가 placeholder button 에 data-blank-idx 를 심어주므로
  // querySelector 로 element 를 찾아 viewport 중앙으로 이동시킨다.
  useEffect(() => {
    if (activeIdx == null || !originalRef.current) return;
    const el = originalRef.current.querySelector<HTMLElement>(
      `[data-blank-idx="${activeIdx}"]`,
    );
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeIdx]);

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-5 py-6 md:px-10 md:py-8">
      {selection ? (
        <div
          className="fixed z-50 flex items-center gap-1"
          style={{ top: selection.top, left: selection.left }}
        >
          {activeIdx != null ? (
            <button
              type="button"
              className="bg-primary text-primary-foreground inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs shadow-lg hover:opacity-90"
              onMouseDown={(e) => {
                e.preventDefault();
                applySelectionToActive();
              }}
              title={`활성 빈칸 #${activeIdx} 에 채우기`}
            >
              → #{activeIdx}
            </button>
          ) : null}
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-xs text-white shadow-lg hover:bg-emerald-700"
            onMouseDown={(e) => {
              e.preventDefault();
              addNewBlankFromSelection();
            }}
            title="새 빈칸 추가"
          >
            <PlusCircleIcon className="size-3" />
            새 빈칸 ({selection.text.length}자)
          </button>
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link
          to={`/admin/blanks?law=${lawCode}`}
          viewTransition
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeftIcon className="size-4" /> 빈칸 자료 목록
        </Link>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">강사</span>
          <Badge variant={isOwner ? "default" : "outline"}>
            {ownerName} · {displayName ?? version}
          </Badge>
          {!isOwner ? <ForkButton setId={setId} /> : null}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                  본문 (제{articleNumber}조)
                </p>
                <h1 className="text-xl font-bold tracking-tight">
                  {articleLabel}
                </h1>
              </div>
              <Badge variant="outline">
                완료 {filledCount} / {blanks.length}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <section className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                    빈칸 자료
                  </p>
                  {originalBody ? (
                    <p className="text-muted-foreground inline-flex items-center gap-1 text-[10px]">
                      <MousePointerClickIcon className="size-3" />
                      드래그 →{" "}
                      <span className="text-primary font-mono">
                        #{activeIdx ?? "?"}
                      </span>{" "}
                      에 채우기 또는 새 빈칸 추가
                    </p>
                  ) : null}
                </div>
                {unlocatableBlanks.length > 0 ? (
                  <p
                    className="inline-flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-400"
                    title="정답이 비어있어 본문에 위치를 표시할 수 없는 빈칸"
                  >
                    <AlertTriangleIcon className="size-3" />
                    위치 미확인 {unlocatableBlanks.length}개
                  </p>
                ) : null}
              </div>
              {originalBody ? (
                <div
                  ref={originalRef}
                  className="bg-muted/30 rounded-md border p-3"
                >
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
                      lawCode={lawCode as never}
                    />
                  </AdminBlanksRenderProvider>
                  <UnplacedBlanksSection
                    setId={setId}
                    unplaced={unlocatableBlanks}
                    activeIdx={activeIdx}
                    onActivate={setActiveIdx}
                    disabled={!isOwner}
                  />
                </div>
              ) : (
                <div className="rounded-md border p-3">
                  <BodyPreview
                    bodyText={bodyText}
                    drafts={drafts}
                    blanks={blanks}
                  />
                </div>
              )}
            </section>
          </CardContent>
        </Card>

        <Card className="self-start">
          <CardHeader>
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              빈칸 정답 입력
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {!isOwner ? (
              <p className="text-muted-foreground rounded-md border border-dashed bg-amber-50/40 px-3 py-2 text-xs dark:bg-amber-950/20">
                다른 강사({ownerName})의 자료입니다. 수정하려면 우상단의
                "내 자료로 복사" 를 사용하세요.
              </p>
            ) : (
              <p className="text-muted-foreground border-primary/40 bg-primary/5 rounded-md border border-dashed px-3 py-2 text-[11px]">
                좌측 본문에서 단어/구문을 드래그해 "새 빈칸" 버튼을 눌러
                추가하세요. 같은 단어가 여러 절에 등장해도 드래그한 자리에 정확히
                배치됩니다.
              </p>
            )}
            {blanks.map((b) => (
              <BlankRowEditor
                key={b.idx}
                setId={setId}
                blank={b}
                draft={drafts[b.idx] ?? ""}
                active={activeIdx === b.idx}
                initialFocus={
                  initialFocusIdx === b.idx || newlyAddedIdx === b.idx
                }
                disabled={!isOwner}
                onFocus={() => setActiveIdx(b.idx)}
                onDraftChange={(v) =>
                  setDrafts((prev) => ({ ...prev, [b.idx]: v }))
                }
              />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function BodyPreview({
  bodyText,
  drafts,
  blanks,
}: {
  bodyText: string;
  drafts: Record<number, string>;
  blanks: BlankRow[];
}) {
  const blankByIdx = useMemo(() => {
    const m = new Map<number, BlankRow>();
    for (const b of blanks) m.set(b.idx, b);
    return m;
  }, [blanks]);

  const re = /\[\[BLANK:(\d+)\]\]/g;
  const out: React.ReactNode[] = [];
  let last = 0;
  let m;
  let key = 0;
  while ((m = re.exec(bodyText)) !== null) {
    if (m.index > last) {
      out.push(
        <span key={key++}>{bodyText.slice(last, m.index)}</span>,
      );
    }
    const idx = Number(m[1]);
    const draft = drafts[idx] ?? "";
    const filled = draft.trim().length > 0;
    out.push(
      <span
        key={key++}
        className={cn(
          "mx-0.5 inline-block rounded border-b-2 px-1 align-baseline text-xs font-medium",
          filled
            ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300"
            : "border-amber-400 bg-amber-50/50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300",
        )}
        title={`빈칸 #${idx} (${blankByIdx.get(idx)?.length ?? 0}글자)`}
      >
        {filled ? draft : `[#${idx}]`}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < bodyText.length) {
    out.push(<span key={key++}>{bodyText.slice(last)}</span>);
  }
  return (
    <div className="text-sm leading-relaxed whitespace-pre-wrap">{out}</div>
  );
}

function ForkButton({ setId }: { setId: string }) {
  const fetcher = useFetcher();
  const submitting = fetcher.state !== "idle";
  return (
    <fetcher.Form method="post" action="/api/blanks/fork">
      <input type="hidden" name="setId" value={setId} />
      <Button
        type="submit"
        size="sm"
        disabled={submitting}
        className="h-7 gap-1 text-xs"
      >
        {submitting ? "복사 중…" : "내 자료로 복사"}
      </Button>
    </fetcher.Form>
  );
}

