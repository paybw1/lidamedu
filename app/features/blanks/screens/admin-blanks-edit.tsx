import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  CheckIcon,
  MousePointerClickIcon,
  PlusCircleIcon,
  Trash2Icon,
  XCircleIcon,
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
import { Input } from "~/core/components/ui/input";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminBlanksRenderProvider } from "~/features/blanks/components/admin-blanks-render-provider";
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
      beforeContext:
        typeof o.before_context === "string"
          ? o.before_context
          : typeof o.beforeContext === "string"
            ? o.beforeContext
            : undefined,
      afterContext:
        typeof o.after_context === "string"
          ? o.after_context
          : typeof o.afterContext === "string"
            ? o.afterContext
            : undefined,
    });
  }
  return out.sort((a, b) => a.idx - b.idx);
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
  const {
    data: { user },
  } = await client.auth.getUser();
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
  const originalBody = useMemo(
    () => parseArticleBody(originalBodyJson),
    [originalBodyJson],
  );

  const filledCount = useMemo(
    () => Object.values(drafts).filter((v) => v.trim().length > 0).length,
    [drafts],
  );

  // 본문에 표시되지 않는 빈칸 — 정답이 비어있거나(저장 전 신규) 컨텍스트가 부재해 위치를 매칭할 수 없는 경우.
  // 정답이 채워지면 서버에서 컨텍스트가 자동 추출되므로, draft 상태로 판단하지 않고 saved answer 기준으로만 표시.
  const unlocatableBlanks = useMemo(
    () => blanks.filter((b) => !b.answer.trim()),
    [blanks],
  );

  // 활성 빈칸 idx — URL ?focus= 가 있으면 우선, 없으면 첫 빈 슬롯
  const firstEmpty = blanks.find((b) => !drafts[b.idx]?.trim())?.idx ?? null;
  const [activeIdx, setActiveIdx] = useState<number | null>(
    initialFocusIdx ?? firstEmpty,
  );
  const lastSavedAtRef = useRef<Map<number, string>>(new Map());
  const inlineSavedFetcher = useFetcher();

  // 원본 본문 selection — floating button 표시
  const [selection, setSelection] = useState<{
    text: string;
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
    // selection 이 originalRef 안에서 발생했는지 확인
    const range = sel.getRangeAt(0);
    let n: Node | null = range.startContainer;
    let inside = false;
    while (n) {
      if (n === originalRef.current) {
        inside = true;
        break;
      }
      n = n.parentNode;
    }
    if (!inside) {
      setSelection(null);
      return;
    }
    const rect = range.getBoundingClientRect();
    setSelection({
      text,
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
    // 즉시 자동 저장
    const fd = new FormData();
    fd.set("setId", setId);
    fd.set("blankIdx", String(activeIdx));
    fd.set("answer", selection.text);
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
    addBlankFetcher.submit(fd, {
      method: "post",
      action: "/api/blanks/admin-add-blank",
    });
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  }, [selection, setId, addBlankFetcher]);

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
            <div className="grid gap-4 lg:grid-cols-2">
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                    원본 조문
                  </p>
                  {originalBody ? (
                    <p className="text-muted-foreground inline-flex items-center gap-1 text-[10px]">
                      <MousePointerClickIcon className="size-3" />
                      드래그 →{" "}
                      <span className="text-primary font-mono">
                        #{activeIdx ?? "?"}
                      </span>
                    </p>
                  ) : null}
                </div>
                {originalBody ? (
                  <div
                    ref={originalRef}
                    className="bg-muted/30 rounded-md border p-3"
                  >
                    <ArticleBodyView
                      body={originalBody}
                      titleMap={new Map()}
                      subtitlesOnly={false}
                      lawCode={lawCode as never}
                    />
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    원본 본문이 등록되지 않았습니다.
                  </p>
                )}
              </section>

              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                    빈칸 자료
                  </p>
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
                  <div className="bg-muted/30 rounded-md border p-3">
                    <AdminBlanksRenderProvider
                      setId={setId}
                      blanks={blanks}
                      drafts={drafts}
                      activeIdx={activeIdx}
                      onActivate={setActiveIdx}
                    >
                      <ArticleBodyView
                        body={originalBody}
                        titleMap={new Map()}
                        subtitlesOnly={false}
                        lawCode={lawCode as never}
                      />
                    </AdminBlanksRenderProvider>
                    {unlocatableBlanks.length > 0 ? (
                      <div className="mt-3 rounded border border-amber-300/60 bg-amber-50/60 px-3 py-2 text-xs dark:border-amber-700/60 dark:bg-amber-950/30">
                        <p className="mb-1 font-semibold text-amber-900 dark:text-amber-200">
                          본문에 표시되지 않은 빈칸
                        </p>
                        <p className="text-amber-800/80 dark:text-amber-300/80">
                          정답이 비어있거나 원본 본문에서 위치를 찾지 못한 빈칸입니다. 우측 입력란에 정답을 채우면 본문에 자동으로 표시됩니다.
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {unlocatableBlanks.map((b) => (
                            <button
                              key={b.idx}
                              type="button"
                              onClick={() => setActiveIdx(b.idx)}
                              className={cn(
                                "rounded border border-amber-400/60 bg-amber-100/80 px-1.5 py-0.5 font-mono text-[11px] text-amber-900 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:hover:bg-amber-900/60",
                                activeIdx === b.idx && "ring-primary ring-2",
                              )}
                            >
                              #{b.idx}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
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
            </div>
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
              <PasteNewBlankInput setId={setId} />
            )}
            {blanks.map((b) => (
              <BlankRowEditor
                key={b.idx}
                setId={setId}
                blank={b}
                draft={drafts[b.idx] ?? ""}
                active={activeIdx === b.idx}
                initialFocus={initialFocusIdx === b.idx}
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

function PasteNewBlankInput({ setId }: { setId: string }) {
  const fetcher = useFetcher();
  const [value, setValue] = useState("");
  const [feedback, setFeedback] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);
  const submitting = fetcher.state !== "idle";

  const submit = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const fd = new FormData();
      fd.set("setId", setId);
      fd.set("selectionText", trimmed);
      fetcher.submit(fd, {
        method: "post",
        action: "/api/blanks/admin-add-blank",
      });
    },
    [setId, fetcher],
  );

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    const d = fetcher.data as {
      ok: boolean;
      newIdx?: number;
      error?: string;
    };
    if (d.ok) {
      setValue("");
      setFeedback({
        kind: "success",
        text: `빈칸 #${d.newIdx} 추가됨`,
      });
    } else {
      setFeedback({ kind: "error", text: d.error ?? "추가 실패" });
    }
    const t = setTimeout(() => setFeedback(null), 2500);
    return () => clearTimeout(t);
  }, [fetcher.state, fetcher.data]);

  return (
    <div className="border-primary/40 bg-primary/5 rounded-md border border-dashed p-2">
      <div className="flex items-center gap-2">
        <Input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onPaste={(e) => {
            const txt = e.clipboardData.getData("text/plain");
            if (txt && txt.trim()) {
              e.preventDefault();
              submit(txt);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit(value);
            }
          }}
          disabled={submitting}
          placeholder="텍스트 붙여넣기 (또는 입력 + Enter)"
          className="h-8 flex-1 text-sm"
        />
        <Button
          type="button"
          size="sm"
          disabled={submitting || !value.trim()}
          onClick={() => submit(value)}
          className="h-8 gap-1 text-xs"
        >
          <PlusCircleIcon className="size-3.5" />
          {submitting ? "추가 중…" : "추가"}
        </Button>
      </div>
      {feedback ? (
        <p
          className={cn(
            "mt-1 text-[11px]",
            feedback.kind === "success"
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-rose-600 dark:text-rose-400",
          )}
        >
          {feedback.text}
        </p>
      ) : (
        <p className="text-muted-foreground mt-1 text-[11px]">
          본문에 등장하는 단어/구문 — 첫 등장 위치가 빈칸으로 변환됩니다.
        </p>
      )}
    </div>
  );
}

function BlankRowEditor({
  setId,
  blank,
  draft,
  active,
  initialFocus,
  disabled,
  onFocus,
  onDraftChange,
}: {
  setId: string;
  blank: BlankRow;
  draft: string;
  active: boolean;
  initialFocus: boolean;
  disabled: boolean;
  onFocus: () => void;
  onDraftChange: (v: string) => void;
}) {
  const deleteFetcher = useFetcher();
  const deleteSubmitting = deleteFetcher.state !== "idle";
  const inputRef = useRef<HTMLInputElement>(null);
  const handleDelete = () => {
    if (!confirm(`빈칸 #${blank.idx} 을(를) 제거할까요? 본문에서 정답 텍스트로 복원됩니다.`)) return;
    const fd = new FormData();
    fd.set("setId", setId);
    fd.set("blankIdx", String(blank.idx));
    deleteFetcher.submit(fd, {
      method: "post",
      action: "/api/blanks/admin-remove-blank",
    });
  };
  const fetcher = useFetcher();
  const [savedFlag, setSavedFlag] = useState<"saved" | "error" | null>(null);

  useEffect(() => {
    if (!initialFocus) return;
    const el = inputRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.focus();
  }, [initialFocus]);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      const ok = (fetcher.data as { ok?: boolean }).ok;
      setSavedFlag(ok ? "saved" : "error");
      const t = setTimeout(() => setSavedFlag(null), 1500);
      return () => clearTimeout(t);
    }
  }, [fetcher.state, fetcher.data]);

  const submit = () => {
    const fd = new FormData();
    fd.set("setId", setId);
    fd.set("blankIdx", String(blank.idx));
    fd.set("answer", draft);
    fetcher.submit(fd, { method: "post", action: "/api/blanks/admin-answer" });
  };

  const dirty = draft.trim() !== blank.answer.trim();
  const empty = draft.trim().length === 0;

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md p-1 transition-colors",
        active && !disabled ? "ring-primary ring-2" : "",
      )}
    >
      <span
        className={cn(
          "inline-flex w-12 shrink-0 items-center justify-center rounded text-xs font-mono",
          empty
            ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
            : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
        )}
      >
        #{blank.idx}
      </span>
      <Input
        ref={inputRef}
        value={draft}
        onChange={(e) => onDraftChange(e.target.value)}
        onFocus={onFocus}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        disabled={disabled}
        placeholder={`정답 (${blank.length}자)`}
        className="h-8 text-sm"
      />
      <Button
        type="button"
        size="icon"
        variant="ghost"
        disabled={disabled || deleteSubmitting}
        onClick={handleDelete}
        className="h-8 w-8 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/40"
        title={`빈칸 #${blank.idx} 제거`}
      >
        <Trash2Icon className="size-3.5" />
      </Button>
      <Button
        type="button"
        size="sm"
        variant={dirty ? "default" : "outline"}
        disabled={disabled || !dirty || fetcher.state !== "idle"}
        onClick={submit}
        className="h-8 px-2 text-xs"
      >
        {savedFlag === "saved" ? (
          <CheckIcon className="size-3.5" />
        ) : savedFlag === "error" ? (
          <XCircleIcon className="size-3.5" />
        ) : (
          "저장"
        )}
      </Button>
    </div>
  );
}
