// 예상문제 해설 → 조문/판례 연결 도구. /admin/problems/link-suggest.
// 좌: 미연결 잔여 문제 목록 (origin 멀티 선택, 잔여수 큰 순).
// 우: 선택된 문제의 후보 카드 — 선지/박스/문제 전체 단위. 강사가 후보 선택 + 직접 추가 + 승인.

import { Link, data, redirect, useFetcher, useSearchParams } from "react-router";
import { useMemo, useState } from "react";
import { CheckIcon, SearchIcon, SparklesIcon } from "lucide-react";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent } from "~/core/components/ui/card";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { getStaffRole } from "~/features/laws/queries.server";
import { ORIGIN_LABEL, type ProblemOrigin } from "~/features/problems/labels";
import {
  type ArticleCandidate,
  type CaseCandidate,
  type LinkSuggestions,
  suggestLinksForProblem,
} from "~/features/problems/lib/link-suggest.server";
import {
  type MissingLinkItem,
  listProblemsWithMissingLinks,
} from "~/features/problems/queries-link-suggest.server";

import type { Route } from "./+types/admin-problem-link-suggest";

export const meta: Route.MetaFunction = () => [
  { title: "예상문제 연결 도구 | Lidam Patent Attorney Academy" },
];

const DEFAULT_ORIGINS: ProblemOrigin[] = ["expected", "ai_draft", "past_exam_variant"];
const ALL_ORIGINS: ProblemOrigin[] = ["past_exam", "past_exam_variant", "expected", "mock", "ai_draft"];

// 과목 chip — 표시 라벨은 LAW_LABEL 와 일치 (link-suggest.server.ts 내부 정의와 동일).
const ALL_LAWS: Array<{ code: string; label: string }> = [
  { code: "patent", label: "특허법" },
  { code: "trademark", label: "상표법" },
  { code: "design", label: "디자인" },
  { code: "civil", label: "민법" },
  { code: "civil-procedure", label: "민소법" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const originsRaw = url.searchParams.getAll("origin");
  const origins =
    originsRaw.length > 0
      ? (originsRaw.filter((o) => ALL_ORIGINS.includes(o as ProblemOrigin)) as ProblemOrigin[])
      : DEFAULT_ORIGINS;
  const lawsRaw = url.searchParams.getAll("law");
  const lawCodes = lawsRaw.filter((l) => ALL_LAWS.some((al) => al.code === l));
  const focusId = url.searchParams.get("focus");
  const useRag = url.searchParams.get("rag") !== "off";

  const items = await listProblemsWithMissingLinks(client, {
    origins,
    lawCodes,
    limit: 1500,
  });

  let suggestions: LinkSuggestions | null = null;
  if (focusId) {
    try {
      suggestions = await suggestLinksForProblem(client, focusId, { useRag, userId: user.id });
    } catch {
      suggestions = null;
    }
  }

  return {
    items,
    suggestions,
    filters: { origins, lawCodes, useRag },
    role,
  };
}

export default function AdminProblemLinkSuggest({ loaderData }: Route.ComponentProps) {
  const { items, suggestions, filters, role } = loaderData;
  const [searchParams, setSearchParams] = useSearchParams();
  const focusId = searchParams.get("focus");
  const focusItem = useMemo(
    () => (focusId ? items.find((it) => it.problemId === focusId) ?? null : null),
    [items, focusId],
  );

  const toggleOrigin = (o: ProblemOrigin) => {
    const next = new URLSearchParams(searchParams);
    const cur = next.getAll("origin");
    next.delete("origin");
    const active = cur.length > 0 ? cur : DEFAULT_ORIGINS;
    const newSet = active.includes(o) ? active.filter((x) => x !== o) : [...active, o];
    for (const v of newSet) next.append("origin", v);
    next.delete("focus");
    setSearchParams(next);
  };

  const toggleLaw = (code: string) => {
    const next = new URLSearchParams(searchParams);
    const cur = next.getAll("law");
    next.delete("law");
    const newSet = cur.includes(code) ? cur.filter((x) => x !== code) : [...cur, code];
    for (const v of newSet) next.append("law", v);
    next.delete("focus");
    setSearchParams(next);
  };

  const toggleRag = () => {
    const next = new URLSearchParams(searchParams);
    if (filters.useRag) next.set("rag", "off");
    else next.delete("rag");
    setSearchParams(next);
  };

  return (
    <AdminShell
      cluster="problems"
      title="예상문제 연결 도구"
      desc={
        <span>
          미연결 문제의 해설을 분석해 조문·판례 <strong>후보</strong>를 제시합니다.
          최종 연결은 <strong>강사 승인</strong>으로만 확정됩니다 (자동 적용 없음).
          출처: <Badge variant="outline">chunk</Badge> 생성근거 ·{" "}
          <Badge variant="outline">explicit</Badge> 명시 인용 ·{" "}
          <Badge variant="outline">rag</Badge> 의미검색.
        </span>
      }
      role={role}
      width={1400}
      headerRight={
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{items.length}건 잔여</span>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
        {/* ── 좌: 필터 + 목록 ─────────────────────────── */}
        <div className="space-y-3">
          <Card>
            <CardContent className="space-y-3 py-3">
              <div>
                <div className="mb-2 text-xs font-medium">출처(origin)</div>
                <div className="flex flex-wrap gap-1">
                  {ALL_ORIGINS.map((o) => {
                    const active = filters.origins.includes(o);
                    return (
                      <button
                        key={o}
                        onClick={() => toggleOrigin(o)}
                        className={cn(
                          "rounded-md border px-2 py-1 text-xs",
                          active
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:bg-muted/70",
                        )}
                      >
                        {ORIGIN_LABEL[o]}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <div className="mb-2 text-xs font-medium">
                  과목(law) {filters.lawCodes.length === 0 && <span className="text-muted-foreground">— 전체</span>}
                </div>
                <div className="flex flex-wrap gap-1">
                  {ALL_LAWS.map((l) => {
                    const active = filters.lawCodes.includes(l.code);
                    return (
                      <button
                        key={l.code}
                        onClick={() => toggleLaw(l.code)}
                        className={cn(
                          "rounded-md border px-2 py-1 text-xs",
                          active
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:bg-muted/70",
                        )}
                      >
                        {l.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={filters.useRag}
                  onChange={toggleRag}
                  className="h-3 w-3"
                />
                <SparklesIcon className="size-3" />
                RAG 보완 검색 사용 (cap 도달 시 자동 skip)
              </label>
            </CardContent>
          </Card>

          <div className="max-h-[calc(100vh-280px)] overflow-y-auto rounded border">
            {items.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                선택 origin 에서 미연결 문제 없음.
              </div>
            ) : (
              <ul className="divide-y">
                {items.map((it) => {
                  const active = focusId === it.problemId;
                  return (
                    <li key={it.problemId}>
                      <Link
                        to={(() => {
                          const next = new URLSearchParams(searchParams);
                          next.set("focus", it.problemId);
                          return `?${next}`;
                        })()}
                        className={cn(
                          "block px-3 py-2 text-xs",
                          active ? "bg-primary/10" : "hover:bg-muted/40",
                        )}
                      >
                        <div className="mb-1 flex items-center gap-1">
                          <Badge variant="outline" className="text-[10px]">
                            {ORIGIN_LABEL[it.origin]}
                          </Badge>
                          {it.lawCode && (
                            <Badge variant="secondary" className="text-[10px]">
                              {it.lawCode}
                            </Badge>
                          )}
                          <span className="ml-auto text-[10px] font-medium text-amber-700">
                            잔 {it.totalMissing}
                          </span>
                        </div>
                        <div className="line-clamp-2 text-foreground">
                          {it.bodyPreview || "(본문 없음)"}
                        </div>
                        <div className="mt-1 flex gap-2 text-[10px] text-muted-foreground">
                          {it.missingPrimary && <span>primary</span>}
                          {it.choicesMissing > 0 && <span>선지 {it.choicesMissing}</span>}
                          {it.boxMissing > 0 && <span>박스 {it.boxMissing}</span>}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* ── 우: 후보 패널 ─────────────────────────── */}
        <div>
          {!focusItem || !suggestions ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                <SearchIcon className="mx-auto mb-2 size-6 opacity-50" />
                좌측에서 문제를 선택하면 후보가 표시됩니다.
              </CardContent>
            </Card>
          ) : (
            <SuggestionPanel item={focusItem} suggestions={suggestions} />
          )}
        </div>
      </div>
    </AdminShell>
  );
}

// ── 후보 패널 ───────────────────────────────────────────────────────────

interface PanelProps {
  item: MissingLinkItem;
  suggestions: LinkSuggestions;
}

function SuggestionPanel({ item, suggestions }: PanelProps) {
  const approveFetcher = useFetcher<{ ok?: boolean; applied?: number; errors?: string[]; preview?: unknown[]; error?: string }>();
  const busy = approveFetcher.state !== "idle";
  const [selected, setSelected] = useState<Map<string, { kind: "choice" | "box" | "primary" | "problem-case"; segmentId: string; articleId?: string | null; caseId?: string | null }>>(new Map());
  // 분류 변경 — choice/box 별로 user 가 선택한 type (DB 값과 별개).
  const [typeChanges, setTypeChanges] = useState<Map<string, ChoiceTypeVal>>(new Map());
  const setChoiceType = (segmentKind: "choice" | "box", segmentId: string, t: ChoiceTypeVal) => {
    setTypeChanges((cur) => {
      const next = new Map(cur);
      next.set(`${segmentKind}:${segmentId}`, t);
      return next;
    });
  };

  const toggleArticleForSegment = (segmentKind: "choice" | "box", segmentId: string, articleId: string) => {
    const key = `${segmentKind}:${segmentId}:art`;
    const next = new Map(selected);
    if (next.get(key)?.articleId === articleId) {
      next.delete(key);
    } else {
      next.set(key, { kind: segmentKind, segmentId, articleId, caseId: null });
    }
    setSelected(next);
  };
  const toggleCaseForSegment = (segmentKind: "choice" | "box", segmentId: string, caseId: string) => {
    const key = `${segmentKind}:${segmentId}:case`;
    const next = new Map(selected);
    if (next.get(key)?.caseId === caseId) {
      next.delete(key);
    } else {
      next.set(key, { kind: segmentKind, segmentId, articleId: null, caseId });
    }
    setSelected(next);
  };
  const togglePrimary = (articleId: string) => {
    const key = `primary:${suggestions.problemId}`;
    const next = new Map(selected);
    if (next.get(key)?.articleId === articleId) {
      next.delete(key);
    } else {
      next.set(key, { kind: "primary", segmentId: suggestions.problemId, articleId });
    }
    setSelected(next);
  };
  const toggleProblemCase = (caseId: string) => {
    const key = `pcase:${caseId}`;
    const next = new Map(selected);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.set(key, { kind: "problem-case", segmentId: suggestions.problemId, caseId });
    }
    setSelected(next);
  };

  const buildTargets = () => {
    const out: unknown[] = [];
    // 후보 선택 targets.
    for (const v of selected.values()) {
      if (v.kind === "choice") {
        const t = typeChanges.get(`choice:${v.segmentId}`);
        out.push({
          kind: "choice" as const,
          choiceId: v.segmentId,
          articleId: v.articleId ?? null,
          caseId: v.caseId ?? null,
          choiceType: t === undefined ? undefined : t,
        });
      } else if (v.kind === "box") {
        const t = typeChanges.get(`box:${v.segmentId}`);
        out.push({
          kind: "box" as const,
          boxItemId: v.segmentId,
          articleId: v.articleId ?? null,
          caseId: v.caseId ?? null,
          choiceType: t === undefined ? undefined : t,
        });
      } else if (v.kind === "primary") {
        out.push({ kind: "primary" as const, problemId: v.segmentId, articleId: v.articleId! });
      } else {
        out.push({ kind: "problem-case" as const, problemId: v.segmentId, caseId: v.caseId! });
      }
    }
    // 분류만 바뀌었고 chip 선택이 없는 segment 도 target 추가.
    const selectedKeys = new Set<string>();
    for (const v of selected.values()) {
      if (v.kind === "choice") selectedKeys.add(`choice:${v.segmentId}`);
      else if (v.kind === "box") selectedKeys.add(`box:${v.segmentId}`);
    }
    for (const [k, t] of typeChanges) {
      if (selectedKeys.has(k)) continue;
      const [kind, id] = k.split(":");
      if (kind === "choice") {
        out.push({ kind: "choice" as const, choiceId: id, articleId: null, caseId: null, choiceType: t });
      } else if (kind === "box") {
        out.push({ kind: "box" as const, boxItemId: id, articleId: null, caseId: null, choiceType: t });
      }
    }
    return out;
  };

  const submit = (intent: "dry-run" | "apply") => {
    const targets = buildTargets();
    if (targets.length === 0) return;
    if (intent === "apply" && !confirm(`선택한 ${targets.length}건을 적용합니다. 계속할까요?`)) return;
    approveFetcher.submit(JSON.stringify({ intent, targets }), {
      method: "post",
      action: "/api/admin/problem-link-approve",
      encType: "application/json",
    });
    if (intent === "apply") {
      setSelected(new Map());
      setTypeChanges(new Map());
    }
  };

  return (
    <div className="space-y-4">
      {/* 상태 바 */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 py-2 text-xs">
          <Badge variant="outline">{ORIGIN_LABEL[item.origin]}</Badge>
          {item.lawCode && <Badge variant="secondary">{item.lawCode}</Badge>}
          <span className="ml-auto text-muted-foreground">
            선택 {selected.size}건 / 분류 변경 {typeChanges.size}건
          </span>
          <Button size="sm" variant="outline" disabled={busy || (selected.size === 0 && typeChanges.size === 0)} onClick={() => submit("dry-run")}>
            미리보기
          </Button>
          <Button size="sm" disabled={busy || (selected.size === 0 && typeChanges.size === 0)} onClick={() => submit("apply")}>
            {busy ? "적용 중…" : "승인 적용"}
          </Button>
        </CardContent>
      </Card>

      {/* dry-run 미리보기 */}
      {approveFetcher.data?.preview && (
        <Card>
          <CardContent className="space-y-1 py-3 text-xs">
            <div className="mb-1 font-medium">변경 미리보기 ({(approveFetcher.data.preview as unknown[]).length}건)</div>
            <pre className="max-h-48 overflow-y-auto rounded bg-muted p-2 text-[10px]">
              {JSON.stringify(approveFetcher.data.preview, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
      {approveFetcher.data?.applied !== undefined && (
        <Card>
          <CardContent className="py-2 text-xs">
            <div className="flex items-center gap-2">
              <CheckIcon className="size-4 text-green-600" />
              <span>적용 완료 — {approveFetcher.data.applied}건</span>
            </div>
            {(approveFetcher.data.errors?.length ?? 0) > 0 && (
              <ul className="mt-1 text-red-600">
                {approveFetcher.data.errors!.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* RAG 상태 */}
      {suggestions.ragSkipped && (
        <Card>
          <CardContent className="py-2 text-xs text-muted-foreground">
            RAG 보완 검색 skip: <code>{suggestions.ragSkipped}</code>
          </CardContent>
        </Card>
      )}

      {/* 문제 전체 단위 — primary_article + problem_case_links */}
      <SectionCard
        title={`문제 전체 ${item.missingPrimary ? "(primary 미연결)" : ""}`}
        articles={suggestions.perProblem.articles}
        cases={suggestions.perProblem.cases}
        selectedArticleId={[...selected.values()].find((v) => v.kind === "primary")?.articleId ?? null}
        selectedCaseIds={[...selected.values()].filter((v) => v.kind === "problem-case").map((v) => v.caseId!)}
        onPickArticle={togglePrimary}
        onPickCase={toggleProblemCase}
        showArticle={item.missingPrimary}
      />

      {/* 선지별 */}
      {suggestions.perChoice.length > 0 && (
        <Card>
          <CardContent className="space-y-3 py-3">
            <div className="text-sm font-medium">
              선지별 후보 — 조문·판례 <span className="text-muted-foreground">동시 선택 가능</span>
            </div>
            {suggestions.perChoice.map((c) => {
              const selArt = selected.get(`choice:${c.choiceId}:art`)?.articleId ?? null;
              const selCase = selected.get(`choice:${c.choiceId}:case`)?.caseId ?? null;
              return (
                <SegmentBlock
                  key={c.choiceId}
                  label={`선지 ${c.choiceIndex}`}
                  bodyMd={c.bodyMd}
                  explanationMd={c.explanationMd}
                  isCorrect={c.isCorrect}
                  oxTruth={c.oxTruth}
                  oxIneligible={c.oxIneligible}
                  choiceType={c.choiceType as ChoiceTypeVal}
                  selectedType={
                    typeChanges.has(`choice:${c.choiceId}`)
                      ? typeChanges.get(`choice:${c.choiceId}`)!
                      : (c.choiceType as ChoiceTypeVal)
                  }
                  onChangeType={(t) => setChoiceType("choice", c.choiceId, t)}
                  lawCode={item.lawCode}
                  current={{ articleId: c.currentArticleId, caseId: c.currentCaseId }}
                  articles={c.articles}
                  cases={c.cases}
                  fallbackArticles={suggestions.perProblem.articles}
                  fallbackCases={suggestions.perProblem.cases}
                  selectedArticleId={selArt}
                  selectedCaseId={selCase}
                  onPickArticle={(id) => toggleArticleForSegment("choice", c.choiceId, id)}
                  onPickCase={(id) => toggleCaseForSegment("choice", c.choiceId, id)}
                />
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* 박스별 */}
      {suggestions.perBoxItem.length > 0 && (
        <Card>
          <CardContent className="space-y-3 py-3">
            <div className="text-sm font-medium">
              박스별 후보 — 조문·판례 <span className="text-muted-foreground">동시 선택 가능</span>
            </div>
            {suggestions.perBoxItem.map((b) => {
              const selArt = selected.get(`box:${b.boxItemId}:art`)?.articleId ?? null;
              const selCase = selected.get(`box:${b.boxItemId}:case`)?.caseId ?? null;
              return (
                <SegmentBlock
                  key={b.boxItemId}
                  label={`박스 ${b.marker}`}
                  bodyMd={b.bodyMd}
                  explanationMd={b.explanationMd}
                  isCorrect={false}
                  oxTruth={b.oxTruth}
                  oxIneligible={b.oxIneligible}
                  choiceType={b.choiceType as ChoiceTypeVal}
                  selectedType={
                    typeChanges.has(`box:${b.boxItemId}`)
                      ? typeChanges.get(`box:${b.boxItemId}`)!
                      : (b.choiceType as ChoiceTypeVal)
                  }
                  onChangeType={(t) => setChoiceType("box", b.boxItemId, t)}
                  lawCode={item.lawCode}
                  current={{ articleId: b.currentArticleId, caseId: b.currentCaseId }}
                  articles={b.articles}
                  cases={b.cases}
                  fallbackArticles={suggestions.perProblem.articles}
                  fallbackCases={suggestions.perProblem.cases}
                  selectedArticleId={selArt}
                  selectedCaseId={selCase}
                  onPickArticle={(id) => toggleArticleForSegment("box", b.boxItemId, id)}
                  onPickCase={(id) => toggleCaseForSegment("box", b.boxItemId, id)}
                />
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── 후보 표시 — 단위(선지/박스) ─────────────────────────────────────────

type ChoiceTypeVal = "statute" | "precedent" | "theory" | null;

interface SegmentBlockProps {
  label: string;
  bodyMd: string;
  explanationMd: string | null;
  /** 정답 여부 (선지만 의미. 박스는 false 고정). */
  isCorrect: boolean;
  /** OX 진리값 — 'true' | 'false' | null. */
  oxTruth: string | null;
  oxIneligible: boolean;
  /** 분류 — 현재 DB 값. 강사가 셀렉트로 변경 가능. */
  choiceType: ChoiceTypeVal;
  /** 분류 변경 시 호출 (apply 시 함께 전송). */
  onChangeType: (next: ChoiceTypeVal) => void;
  selectedType: ChoiceTypeVal;
  /** 직접 추가용 — 검색 시 lawCode 필터. */
  lawCode: string | null;
  current: { articleId: string | null; caseId: string | null };
  articles: ArticleCandidate[];
  cases: CaseCandidate[];
  fallbackArticles: ArticleCandidate[];
  fallbackCases: CaseCandidate[];
  selectedArticleId: string | null;
  selectedCaseId: string | null;
  onPickArticle: (id: string) => void;
  onPickCase: (id: string) => void;
}

function SegmentBlock(p: SegmentBlockProps) {
  // 선지별 명시 후보 + 문제 전체 fallback + 직접 추가 한 항목을 합쳐 중복 제거.
  const [manualArticles, setManualArticles] = useState<ArticleCandidate[]>([]);
  const [manualCases, setManualCases] = useState<CaseCandidate[]>([]);

  const articleMerged = mergeCandidates<ArticleCandidate>(
    [...manualArticles, ...p.articles],
    p.fallbackArticles,
    (a) => a.articleId,
  );
  const caseMerged = mergeCandidates<CaseCandidate>(
    [...manualCases, ...p.cases],
    p.fallbackCases,
    (c) => c.caseId,
  );

  const oxBadge =
    p.oxTruth === "true" ? (
      <Badge className="bg-blue-600 text-[10px]">O</Badge>
    ) : p.oxTruth === "false" ? (
      <Badge className="bg-red-600 text-[10px]">X</Badge>
    ) : null;

  // 분류 effective — selectedType 가 있으면 그것, 없으면 DB 값.
  const effectiveType: ChoiceTypeVal = p.selectedType ?? p.choiceType;
  // 입력 영역 분기:
  //   precedent → 조문(부) + 판례(주) 둘 다
  //   statute / theory → 조문만
  //   null (미분류) → 둘 다 (현행 디폴트 유지)
  const showArticle = effectiveType !== "precedent" || true; // 판례여도 관련 조문 노출 OK
  const showCase = effectiveType === "precedent" || effectiveType === null;
  const isCase = effectiveType === "precedent";

  return (
    <div className="rounded border p-2">
      <div className="mb-1 flex flex-wrap items-center gap-1 text-xs">
        <Badge variant="outline">{p.label}</Badge>
        {p.isCorrect && <Badge className="bg-amber-500 text-[10px]">정답</Badge>}
        {oxBadge}
        {p.oxIneligible && <Badge variant="outline" className="text-[10px] text-muted-foreground">OX 불가</Badge>}
        {p.current.articleId && <Badge className="bg-emerald-600 text-[10px]">조문 기연결</Badge>}
        {p.current.caseId && <Badge className="bg-violet-600 text-[10px]">판례 기연결</Badge>}
        <select
          value={effectiveType ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            p.onChangeType(v === "" ? null : (v as ChoiceTypeVal));
          }}
          className="ml-auto rounded border bg-background px-1 py-0.5 text-[10px]"
        >
          <option value="">미분류</option>
          <option value="statute">조문</option>
          <option value="precedent">판례</option>
          <option value="theory">이론</option>
        </select>
      </div>
      <div className="mb-1 text-xs text-foreground">{p.bodyMd}</div>
      {p.explanationMd && (
        <div className="mb-2 line-clamp-3 text-[11px] text-muted-foreground">
          해설: {p.explanationMd}
        </div>
      )}
      <div className={cn("grid grid-cols-1 gap-2", showArticle && showCase && "md:grid-cols-2")}>
        {/* ── 판례 (분류=판례일 때 주, 미분류일 때 보조) ── */}
        {showCase && (
          <div className={cn(isCase && "order-first")}>
            <div className="mb-1 flex items-center gap-1 text-[10px] font-medium uppercase text-muted-foreground">
              <span>판례{isCase && " (주)"}</span>
              {p.selectedCaseId && <Badge className="h-3 bg-primary/80 px-1 text-[9px]">선택됨</Badge>}
            </div>
            {caseMerged.length === 0 ? (
              <div className="text-[10px] text-muted-foreground">후보 없음 — 아래 직접 추가</div>
            ) : (
              <div className="flex flex-wrap gap-1">
                {caseMerged.map((c) => {
                  const active = p.selectedCaseId === c.caseId;
                  return (
                    <button
                      key={c.caseId}
                      onClick={() => p.onPickCase(c.caseId)}
                      className={cn(
                        "rounded border px-2 py-1 text-[11px]",
                        active ? "border-primary bg-primary/10" : "bg-muted hover:bg-muted/70",
                      )}
                    >
                      {c.caseNumber}
                      {c.caseTitle && <span className="ml-1 text-muted-foreground">— {c.caseTitle.slice(0, 30)}</span>}
                      <span className="ml-1 text-[9px] text-muted-foreground">
                        [{c.sources.join("·")}]
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {/* ── 조문 (모든 분류에서 노출. 판례 분류에선 '관련 조문(부)') ── */}
        {showArticle && (
          <div>
            <div className="mb-1 flex items-center gap-1 text-[10px] font-medium uppercase text-muted-foreground">
              <span>조문{isCase ? " (부)" : effectiveType === "statute" || effectiveType === "theory" ? " (주)" : ""}</span>
              {p.selectedArticleId && <Badge className="h-3 bg-primary/80 px-1 text-[9px]">선택됨</Badge>}
            </div>
            {articleMerged.length === 0 ? (
              <div className="text-[10px] text-muted-foreground">후보 없음 — 아래 직접 추가</div>
            ) : (
              <div className="flex flex-wrap gap-1">
                {articleMerged.map((a) => {
                  const active = p.selectedArticleId === a.articleId;
                  return (
                    <button
                      key={a.articleId}
                      onClick={() => p.onPickArticle(a.articleId)}
                      className={cn(
                        "rounded border px-2 py-1 text-[11px]",
                        active ? "border-primary bg-primary/10" : "bg-muted hover:bg-muted/70",
                      )}
                    >
                      {a.displayLabel}
                      <span className="ml-1 text-[9px] text-muted-foreground">
                        [{a.sources.join("·")}]
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
      {/* 직접 추가 — 후보에 없는 조문·판례 검색 */}
      <ManualAddPanel
        lawCode={p.lawCode}
        onAddArticle={(a) => {
          setManualArticles((cur) => (cur.find((x) => x.articleId === a.articleId) ? cur : [...cur, a]));
          p.onPickArticle(a.articleId);
        }}
        onAddCase={(c) => {
          setManualCases((cur) => (cur.find((x) => x.caseId === c.caseId) ? cur : [...cur, c]));
          p.onPickCase(c.caseId);
        }}
      />
    </div>
  );
}

interface ManualAddPanelProps {
  lawCode: string | null;
  onAddArticle: (a: ArticleCandidate) => void;
  onAddCase: (c: CaseCandidate) => void;
}

function ManualAddPanel(p: ManualAddPanelProps) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"article" | "case">("article");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<
    | { kind: "article"; items: Array<{ articleId: string; lawCode: string; articleNumber: string; displayLabel: string }> }
    | { kind: "case"; items: Array<{ caseId: string; caseNumber: string; caseTitle: string }> }
    | null
  >(null);
  const [busy, setBusy] = useState(false);

  const search = async () => {
    if (!q.trim()) return;
    setBusy(true);
    try {
      const params = new URLSearchParams({ kind, q: q.trim() });
      if (kind === "article" && p.lawCode) params.set("lawCode", p.lawCode);
      const resp = await fetch(`/api/admin/problem-link-search?${params}`);
      const json = await resp.json();
      if (kind === "article") setResults({ kind, items: json.items ?? [] });
      else setResults({ kind, items: json.items ?? [] });
    } catch {
      setResults(null);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-2 text-[10px] text-primary underline hover:no-underline"
      >
        + 직접 추가 (조문·판례 검색)
      </button>
    );
  }

  return (
    <div className="mt-2 rounded border border-dashed p-2 text-[11px]">
      <div className="mb-1 flex items-center gap-1">
        <select
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as "article" | "case");
            setResults(null);
          }}
          className="rounded border bg-background px-1 py-0.5 text-[10px]"
        >
          <option value="article">조문</option>
          <option value="case">판례</option>
        </select>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              search();
            }
          }}
          placeholder={kind === "article" ? '조 번호 (예: 29, 28의2)' : '사건번호 (예: 2018후10844)'}
          className="flex-1 rounded border bg-background px-1 py-0.5 text-[10px]"
        />
        <button
          onClick={search}
          disabled={busy || !q.trim()}
          className="rounded bg-primary px-2 py-0.5 text-[10px] text-primary-foreground disabled:opacity-50"
        >
          {busy ? "..." : "검색"}
        </button>
        <button
          onClick={() => {
            setOpen(false);
            setResults(null);
            setQ("");
          }}
          className="text-[10px] text-muted-foreground"
        >
          닫기
        </button>
      </div>
      {kind === "article" && !p.lawCode && (
        <div className="text-[10px] text-amber-700">문제에 law_code 가 없어 조문 검색 결과가 비어 있을 수 있습니다.</div>
      )}
      {results && results.items.length === 0 && (
        <div className="text-[10px] text-muted-foreground">검색 결과 없음</div>
      )}
      {results && results.items.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {results.kind === "article"
            ? results.items.map((a) => (
                <button
                  key={a.articleId}
                  onClick={() => {
                    p.onAddArticle({
                      articleId: a.articleId,
                      lawCode: a.lawCode,
                      articleNumber: a.articleNumber,
                      displayLabel: a.displayLabel,
                      sources: ["manual"],
                    });
                  }}
                  className="rounded border bg-muted px-2 py-0.5 text-[10px] hover:bg-muted/70"
                >
                  {a.displayLabel} <span className="text-[9px] text-muted-foreground">[manual]</span>
                </button>
              ))
            : results.items.map((c) => (
                <button
                  key={c.caseId}
                  onClick={() => {
                    p.onAddCase({
                      caseId: c.caseId,
                      caseNumber: c.caseNumber,
                      caseTitle: c.caseTitle,
                      sources: ["manual"],
                    });
                  }}
                  className="rounded border bg-muted px-2 py-0.5 text-[10px] hover:bg-muted/70"
                >
                  {c.caseNumber}
                  {c.caseTitle && <span className="ml-1 text-muted-foreground">— {c.caseTitle.slice(0, 30)}</span>}{" "}
                  <span className="text-[9px] text-muted-foreground">[manual]</span>
                </button>
              ))}
        </div>
      )}
    </div>
  );
}

function mergeCandidates<T extends { sources: string[] }>(
  primary: T[],
  fallback: T[],
  keyOf: (x: T) => string,
): T[] {
  const out: T[] = [...primary];
  const seen = new Set(primary.map(keyOf));
  for (const f of fallback) {
    if (seen.has(keyOf(f))) continue;
    out.push(f);
    seen.add(keyOf(f));
  }
  return out;
}

interface SectionCardProps {
  title: string;
  articles: ArticleCandidate[];
  cases: CaseCandidate[];
  selectedArticleId: string | null;
  selectedCaseIds: string[];
  onPickArticle: (id: string) => void;
  onPickCase: (id: string) => void;
  /** primary article 후보 표시 여부 — primary 이미 채워진 문제는 false. */
  showArticle: boolean;
}

function SectionCard(p: SectionCardProps) {
  return (
    <Card>
      <CardContent className="space-y-2 py-3">
        <div className="text-sm font-medium">{p.title}</div>
        {p.showArticle && p.articles.length > 0 && (
          <div>
            <div className="mb-1 text-[10px] font-medium uppercase text-muted-foreground">primary 조문 후보</div>
            <div className="flex flex-wrap gap-1">
              {p.articles.map((a) => {
                const active = p.selectedArticleId === a.articleId;
                return (
                  <button
                    key={a.articleId}
                    onClick={() => p.onPickArticle(a.articleId)}
                    className={cn(
                      "rounded border px-2 py-1 text-[11px]",
                      active ? "border-primary bg-primary/10" : "bg-muted hover:bg-muted/70",
                    )}
                  >
                    {a.displayLabel}
                    <span className="ml-1 text-[9px] text-muted-foreground">[{a.sources.join("·")}]</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {p.cases.length > 0 && (
          <div>
            <div className="mb-1 text-[10px] font-medium uppercase text-muted-foreground">관련 판례 후보 (problem_case_links 추가)</div>
            <div className="flex flex-wrap gap-1">
              {p.cases.map((c) => {
                const active = p.selectedCaseIds.includes(c.caseId);
                return (
                  <button
                    key={c.caseId}
                    onClick={() => p.onPickCase(c.caseId)}
                    className={cn(
                      "rounded border px-2 py-1 text-[11px]",
                      active ? "border-primary bg-primary/10" : "bg-muted hover:bg-muted/70",
                    )}
                  >
                    {c.caseNumber}
                    <span className="ml-1 text-[9px] text-muted-foreground">[{c.sources.join("·")}]</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {!p.showArticle && p.cases.length === 0 && (
          <div className="text-[11px] text-muted-foreground">문제 전체 단위 후보 없음.</div>
        )}
      </CardContent>
    </Card>
  );
}
