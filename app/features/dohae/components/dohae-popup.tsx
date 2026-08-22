// 도해특허법 팝업 — 조문 뷰어 "도해" 칩에서 열림. ★staff 전용(진입 칩 자체가 RLS 로 숨음).
// 표=HTML(선택 가능 — 하이라이트·포스트잇 작동), 다이어그램=서명 URL 이미지(편집 불가).
// 학습 툴: HighlightOverlay(dohae_unit)+MemoMarksOverlay+우측 MemoList. 선택 툴바는
// 조문 뷰어의 prop-less HighlightToolbar 가 컨테이너 dataset 으로 대상 판별.

import {
  BookOpenIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Loader2Icon,
  NotebookPenIcon,
  PanelRightIcon,
  PencilLineIcon,
  SquareIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useFetcher, useFetchers } from "react-router";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/core/components/ui/dialog";
import { Sheet, SheetContent } from "~/core/components/ui/sheet";
import { cn } from "~/core/lib/utils";
import { HighlightList } from "~/features/annotations/components/highlight-list";
import { HighlightOverlay } from "~/features/annotations/components/highlight-overlay";
import { MemoList } from "~/features/annotations/components/memo-list";
import { MemoMarksOverlay } from "~/features/annotations/components/memo-marks-overlay";
import {
  MEMO_SNIPPET_EVENT,
  type MemoSnippetEventDetail,
} from "~/features/annotations/lib/memo-selection-event";
import { ArticleBodyView } from "~/features/laws/components/article-body";
import { parseArticleBody } from "~/features/laws/lib/article-body";

import {
  dohaeUnitLabel,
  type DohaeBlock,
  type DohaeCell,
  type DohaeUnitSummary,
} from "../labels";
import type { loader as unitLoader } from "../api/unit";

type UnitPayload = Awaited<ReturnType<typeof unitLoader>>;

type DohaeView = "dialog" | "sheet";
const DOHAE_VIEW_KEY = "lidam:dohaeView";
// 도해특허법 = 특허법 단행본. 다른 과목 도해가 생기면 유닛의 book_code 로 갈라야 한다.
const DOHAE_LAW_SLUG = "patent" as const;
// 접힘 상태 맵에서 "도해 해설" 축을 가리키는 키(조문 id 와 섞이지 않게 uuid 형태를 피한다).
const DOHAE_AXIS_KEY = "dohae";

/**
 * 각 셀이 실제로 놓이는 격자 열 번호. rowspan 이 걸린 앞 행의 칸이 자리를 차지하므로
 * 배열 인덱스(ci)와 열 번호가 어긋난다 — 라벨 판정은 반드시 이 값으로 해야 한다.
 */
function gridStartCols(cells: DohaeCell[][]): number[][] {
  const pending: number[] = [];
  const out = cells.map((row) => {
    let cur = 0;
    const starts = row.map((c) => {
      while ((pending[cur] ?? 0) > 0) cur++;
      const start = cur;
      for (let k = start; k < start + c.colSpan; k++) pending[k] = c.rowSpan;
      cur = start + c.colSpan;
      return start;
    });
    for (let k = 0; k < pending.length; k++) if (pending[k] > 0) pending[k]--;
    return starts;
  });
  return out;
}

/**
 * 원본 칸 너비(hp:cellSz)로 열 비율을 낸다.
 *  · 한 칸짜리 셀은 그 열의 너비를 그대로 알려준다.
 *  · 병합 셀밖에 없는 열은 병합 폭에서 이미 아는 열을 뺀 나머지를 균등 배분.
 * 모든 열의 너비를 알아내지 못하면 null — 브라우저 자동 배분에 맡긴다.
 */
function columnPercents(
  cells: DohaeCell[][],
  startCols: number[][],
): number[] | null {
  let colCount = 0;
  cells.forEach((row, ri) =>
    row.forEach((c, ci) => {
      colCount = Math.max(colCount, startCols[ri][ci] + c.colSpan);
    }),
  );
  if (colCount < 2) return null;
  const w = new Array<number>(colCount).fill(0);
  cells.forEach((row, ri) =>
    row.forEach((c, ci) => {
      if (c.colSpan === 1 && (c.width ?? 0) > 0)
        w[startCols[ri][ci]] = Math.max(w[startCols[ri][ci]], c.width!);
    }),
  );
  cells.forEach((row, ri) =>
    row.forEach((c, ci) => {
      if (c.colSpan <= 1 || !(c.width ?? 0)) return;
      const start = startCols[ri][ci];
      const unknown: number[] = [];
      let known = 0;
      for (let k = start; k < Math.min(colCount, start + c.colSpan); k++) {
        if (w[k] > 0) known += w[k];
        else unknown.push(k);
      }
      if (unknown.length > 0 && c.width! > known)
        for (const k of unknown) w[k] = (c.width! - known) / unknown.length;
    }),
  );
  if (w.some((x) => x <= 0)) return null;
  const total = w.reduce((a, b) => a + b, 0);
  return w.map((x) => Math.round((x / total) * 1000) / 10);
}

// ★칸 서식(음영·가운데·굵게)은 **원본 값 그대로** 쓴다. 글자수·열 위치로 짐작하던
//   규칙은 전부 걷어냈다 — 머리행 없이 이어지는 표(참고1.2 분류)의 데이터 행이
//   머리글로 칠해지고, 같은 열인데 긴 칸만 라벨에서 빠지는 문제의 뿌리였다
//   (원장 지시 2026-08-17 "원본 형식에 맞춰줘").
/**
 * 칸 내용 — 굵게 구간(boldRanges)과 칸 그림(diagram)을 원본 순서대로 그린다.
 * ★텍스트 노드를 쪼개도 컨테이너의 textContent 는 그대로라 하이라이트 오프셋은 보존된다
 *   (공백을 새로 넣지 않는 것이 조건).
 */
function BoldSpans({ text, ranges }: { text: string; ranges?: [number, number][] }) {
  if (!ranges?.length) return <>{text}</>;
  const out: ReactNode[] = [];
  let at = 0;
  ranges
    .slice()
    .sort((a, b) => a[0] - b[0])
    .forEach(([s, e], i) => {
      const from = Math.max(at, s);
      const to = Math.min(text.length, e);
      if (to <= from) return;
      if (from > at) out.push(text.slice(at, from));
      out.push(
        <strong key={i} className="font-semibold">
          {text.slice(from, to)}
        </strong>,
      );
      at = to;
    });
  if (at < text.length) out.push(text.slice(at));
  return <>{out}</>;
}

/**
 * 칸 내용을 **원본 순서대로** — 글 / 칸 그림 / 속표를 글자 오프셋에 맞춰 끼워 넣는다.
 * (t22 「다항제 기재방법…」은 【예】 상자가 【해설】 위, t79 「국내단계에서의 보정」은
 *  글 → 도해 → 글 순서다. 뒤에 몰아 그리면 책과 순서가 달라진다.)
 */
function CellContent({ cell }: { cell: DohaeCell }) {
  const nested = cell.tables ?? [];
  const marks: Array<{ at: number; node: ReactNode }> = [];
  if (cell.diagram)
    marks.push({
      at: cell.diagramAt ?? 0,
      node: cell.signedUrl ? (
        <img
          src={cell.signedUrl}
          alt="도해 다이어그램"
          className="my-1 w-full max-w-full dark:brightness-[.92]"
          loading="lazy"
        />
      ) : (
        <span className="text-muted-foreground text-xs">
          [다이어그램 이미지를 불러오지 못했습니다]
        </span>
      ),
    });
  nested.forEach((t, i) => {
    marks.push({ at: cell.tablesAt?.[i] ?? cell.text.length, node: <DohaeTable cells={t} /> });
  });
  if (marks.length === 0) return <BoldSpans text={cell.text} ranges={cell.boldRanges} />;

  marks.sort((a, b) => a.at - b.at);
  const shift = (lo: number, hi: number) =>
    (cell.boldRanges ?? [])
      .map(([s, e]) => [Math.max(s, lo) - lo, Math.min(e, hi) - lo] as [number, number])
      .filter(([s, e]) => e > s);
  const out: ReactNode[] = [];
  let at = 0;
  marks.forEach((m, i) => {
    const to = Math.min(Math.max(m.at, at), cell.text.length);
    if (to > at) out.push(<BoldSpans key={`t${i}`} text={cell.text.slice(at, to)} ranges={shift(at, to)} />);
    out.push(<span key={`m${i}`}>{m.node}</span>);
    at = to;
  });
  if (at < cell.text.length)
    out.push(<BoldSpans key="tail" text={cell.text.slice(at)} ranges={shift(at, cell.text.length)} />);
  return <>{out}</>;
}

function DohaeTable({ cells }: { cells: DohaeCell[][] }) {
  if (cells.length === 0) return null;
  const startCols = gridStartCols(cells);
  // 열 비율 — 원본 그대로. ★table-layout:fixed 를 함께 걸어야 비율이 선다
  // (auto 면 브라우저가 내용 길이로 다시 나눠 버린다).
  const colPct = columnPercents(cells, startCols);
  return (
    <div className="overflow-x-auto">
      <table
        className="border-border w-full border-collapse text-[length:calc(13.5px*var(--study-fs,1))]"
        style={colPct ? { tableLayout: "fixed" } : undefined}
      >
        {colPct ? (
          <colgroup>
            {colPct.map((p, i) => (
              <col key={i} style={{ width: `${p}%` }} />
            ))}
          </colgroup>
        ) : null}
        <tbody>
          {cells.map((row, ri) => (
            <tr key={ri}>
              {row.map((c, ci) => {
                // 첫 행의 음영 칸만 머리글로 — 그 밖은 전부 본문 칸(서식은 아래 클래스로).
                const Tag = ri === 0 && c.shade ? "th" : "td";
                return (
                  <Tag
                    key={ci}
                    colSpan={c.colSpan > 1 ? c.colSpan : undefined}
                    rowSpan={c.rowSpan > 1 ? c.rowSpan : undefined}
                    className={cn(
                      "border-border border px-2.5 py-1.5 text-left leading-[1.65] font-normal whitespace-pre-wrap",
                      // ★내용 칸은 위 맞춤 — 가운데 맞춤이면 조문 비교표의 좌우가 서로
                      //   밀려 같은 조문끼리 줄이 안 맞는다(원장 지시 2026-08-22).
                      //   라벨 칸(음영)은 종전대로 가운데 — 여러 행을 세로 병합하기 때문.
                      c.shade ? "align-middle" : "align-top",
                      // 라벨은 단어 단위로 접는다(제목이 글자 단위로 끊기면 읽기 나쁘다).
                      c.shade && "break-keep",
                      c.shade && "bg-muted/50",
                      c.align === "center" && "text-center",
                      c.bold && "font-semibold",
                    )}
                  >
                    <CellContent cell={c} />
                  </Tag>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * 교재의 조문 원문 박스 자리에 들어가는 **플랫폼 조문**.
 * ★메인 화면(조문 뷰어·노드 뷰어)과 동일한 컴포넌트·동일한 앵커
 * (fieldPath="article.body", targetType="article")를 그대로 쓴다 —
 * 마크업이 조금이라도 다르면 하이라이트 오프셋이 어긋나 양쪽이 같은 자리를 못 가리킨다.
 */
function UnitArticles({
  articles,
  highlightsByArticle,
  memosByArticle,
  titleMap,
  viewerIsStaff,
}: {
  articles: UnitPayload["articles"];
  highlightsByArticle: UnitPayload["articleHighlights"];
  memosByArticle: UnitPayload["articleMemos"];
  titleMap: Map<string, string>;
  viewerIsStaff: boolean;
}) {
  return (
    <div className="space-y-3">
      {articles.map((a) => {
        const body = parseArticleBody(a.bodyJson);
        const memos = memosByArticle[a.articleId] ?? [];
        const importance = Math.max(0, Math.min(3, a.importance));
        return (
          <div
            key={a.articleId}
            className="border-primary/50 bg-primary/[0.04] rounded-lg border px-4 py-3"
          >
            <p className="mb-1.5 flex items-center gap-2 text-[16px] font-bold">
              {a.displayLabel}
              {/* 중요도 — 메인 뷰어와 같은 표기(빈 별까지 3개, 본문보다 큰 글자). */}
              {importance > 0 ? (
                <span
                  className="inline-flex items-center gap-0.5 text-base leading-none"
                  aria-label={`중요도 ${importance}성급`}
                >
                  {Array.from({ length: 3 }, (_, i) => (
                    <span
                      key={i}
                      className={
                        i < importance
                          ? "text-amber-500 dark:text-amber-400"
                          : "text-muted-foreground/30"
                      }
                    >
                      ★
                    </span>
                  ))}
                </span>
              ) : null}
            </p>
            {body ? (
              <MemoMarksOverlay memos={memos}>
                <HighlightOverlay
                  fieldPath="article.body"
                  targetType="article"
                  targetId={a.articleId}
                  highlights={highlightsByArticle[a.articleId] ?? []}
                  viewerIsStaff={viewerIsStaff}
                >
                  <div className="text-foreground text-[length:calc(14px*var(--study-fs,1))] leading-[1.75]">
                    <ArticleBodyView
                      body={body}
                      titleMap={titleMap}
                      lawCode={DOHAE_LAW_SLUG}
                      memos={memos}
                    />
                  </div>
                </HighlightOverlay>
              </MemoMarksOverlay>
            ) : (
              <p className="text-muted-foreground text-xs">[본문을 불러오지 못했습니다]</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DohaeBlocks({
  blocks,
  articles,
  articleHighlights,
  articleMemos,
  titleMap,
  viewerIsStaff,
}: {
  blocks: DohaeBlock[];
  articles: UnitPayload["articles"];
  articleHighlights: UnitPayload["articleHighlights"];
  articleMemos: UnitPayload["articleMemos"];
  titleMap: Map<string, string>;
  viewerIsStaff: boolean;
}) {
  // 조문 원문 박스는 유닛당 정확히 1개(93유닛 중 76개 보유, 나머지는 아예 없음).
  // 그 자리에서만 플랫폼 조문으로 갈아끼운다.
  let articleBoxUsed = false;
  return (
    <div className="space-y-3">
      {blocks.map((b, i) => {
        if (b.type === "h")
          return (
            <h3 key={i} className="mt-5 flex items-center gap-2 text-[15px] font-bold first:mt-0">
              <span className="bg-primary text-primary-foreground inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[11px]">
                {b.numeral}
              </span>
              {b.text}
            </h3>
          );
        if (b.type === "p")
          return (
            <p key={i} className="text-[length:calc(14px*var(--study-fs,1))] leading-[1.75] whitespace-pre-wrap">
              {b.text}
            </p>
          );
        if (b.type === "table") {
          // 1셀 박스 표 + 조문 원문 → 조문 박스.
          const single = b.cells.length === 1 && b.cells[0]?.length === 1;
          if (single && /^제\d+조/.test(b.cells[0][0].text)) {
            // 연결 조문이 있으면 교재 텍스트 대신 플랫폼 조문(개정 반영 + 주석 공유).
            // 없으면(「조약의 효력」— 조약은 articles 미수록) 교재 텍스트 그대로.
            if (!articleBoxUsed && articles.length > 0) {
              articleBoxUsed = true;
              return (
                <UnitArticles
                  key={i}
                  articles={articles}
                  highlightsByArticle={articleHighlights}
                  memosByArticle={articleMemos}
                  titleMap={titleMap}
                  viewerIsStaff={viewerIsStaff}
                />
              );
            }
            return (
              <div
                key={i}
                className="border-primary/50 bg-primary/[0.04] rounded-lg border px-4 py-3 text-[length:calc(14px*var(--study-fs,1))] leading-[1.75] whitespace-pre-wrap"
              >
                {b.cells[0][0].text}
              </div>
            );
          }
          return <DohaeTable key={i} cells={b.cells} />;
        }
        if (b.type === "diagram")
          return b.signedUrl ? (
            <img
              key={i}
              src={b.signedUrl}
              alt="도해 다이어그램"
              className="border-border/60 w-full rounded-lg border dark:brightness-[.92]"
              loading="lazy"
            />
          ) : (
            <p key={i} className="text-muted-foreground text-xs">
              [다이어그램 이미지를 불러오지 못했습니다]
            </p>
          );
        return null;
      })}
    </div>
  );
}

export function DohaePopup({
  units,
  open,
  onOpenChange,
  viewerIsStaff,
}: {
  units: DohaeUnitSummary[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  viewerIsStaff: boolean;
}) {
  const [activeUnitId, setActiveUnitId] = useState<string | null>(null);
  // 표시 방식 — 팝업(가운데) vs 시트(오른쪽). 비교해 보려고 남긴 전환이라 브라우저에 기억한다.
  const [view, setViewState] = useState<DohaeView>("dialog");
  useEffect(() => {
    const saved = window.localStorage.getItem(DOHAE_VIEW_KEY);
    if (saved === "sheet" || saved === "dialog") setViewState(saved);
  }, []);
  const setView = (v: DohaeView) => {
    setViewState(v);
    try {
      window.localStorage.setItem(DOHAE_VIEW_KEY, v);
    } catch {
      /* private mode 등 — 기억만 포기 */
    }
  };
  // 조문별 주석 섹션 펼침 상태. 내용이 있으면 기본 펼침, 사용자가 접으면 그 뜻을 따른다.
  const [expandedArticle, setExpandedArticle] = useState<Record<string, boolean>>({});
  // 본문에서 "포스트잇 추가"를 누르면 그 조문 섹션을 펼쳐 준다 — 접혀 있으면 입력칸이
  // 화면에 없어 아무 일도 안 일어난 것처럼 보인다. (MemoList 자체는 접혀도 mount 상태라
  // 이벤트는 정상 수신한다.)
  const [snippetArticleId, setSnippetArticleId] = useState<string | null>(null);
  useEffect(() => {
    const onSnippet = (e: Event) => {
      const detail = (e as CustomEvent<MemoSnippetEventDetail>).detail;
      if (!detail) return;
      // 입력칸이 화면에 없으면 아무 일도 안 일어난 것처럼 보인다 — 패널을 펴고,
      // 해당 조문 섹션을 열고, 거기로 스크롤해 준다.
      setToolsOpen(true);
      if (detail.targetType !== "article") return;
      setSnippetArticleId(detail.targetId);
      setExpandedArticle((prev) => ({ ...prev, [detail.targetId]: true }));
      requestAnimationFrame(() => {
        document
          .getElementById(`dohae-annot-${detail.targetId}`)
          ?.scrollIntoView({ block: "nearest" });
      });
    };
    document.addEventListener(MEMO_SNIPPET_EVENT, onSnippet);
    return () => document.removeEventListener(MEMO_SNIPPET_EVENT, onSnippet);
  }, []);

  // 우측 학습 툴(포스트잇·하이라이트) 접기 — 시트는 폭이 좁아 기본 접힘, 팝업은 펼침.
  // null = 아직 손대지 않음 → 표시 방식의 기본값을 따른다.
  const [toolsOpenRaw, setToolsOpen] = useState<boolean | null>(null);
  const toolsOpen = toolsOpenRaw ?? view === "dialog";
  const fetcher = useFetcher<UnitPayload>();
  const fetchers = useFetchers();

  // 열릴 때 유닛 1개면 자동 선택.
  useEffect(() => {
    if (open && activeUnitId === null && units.length === 1) {
      setActiveUnitId(units[0].unitId);
    }
    if (!open) setActiveUnitId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (activeUnitId) fetcher.load(`/api/dohae/unit?unitId=${activeUnitId}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeUnitId]);

  // 하이라이트/포스트잇 저장 완료 감지 → 유닛 데이터 재조회(마킹 즉시 반영).
  const annotationBusy = fetchers.some(
    (f) =>
      f.state !== "idle" &&
      typeof f.formAction === "string" &&
      /\/api\/annotations\/(highlight|memo)/.test(f.formAction),
  );
  useEffect(() => {
    if (!annotationBusy && activeUnitId && fetcher.state === "idle" && fetcher.data) {
      // busy → idle 전환 직후 1회 재조회. (busy 동안은 스킵)
      fetcher.load(`/api/dohae/unit?unitId=${activeUnitId}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotationBusy]);

  const payload = fetcher.data;
  const unit = activeUnitId && payload?.unit.unitId === activeUnitId ? payload.unit : null;
  // 관련조문 표기용 조문 제목표 — ArticleBodyView 가 Map 을 받는다.
  const titleMap = useMemo(() => {
    const src: Record<string, string> = payload?.titleMap ?? {};
    return new Map(Object.entries(src));
  }, [payload?.titleMap]);
  // 하이라이트 총계(도해 해설 + 조문 전부) — 접어 둔 "하이라이트 정리" 요약에 표시.
  const highlightTotal =
    (payload?.highlights ?? []).length +
    Object.values(payload?.articleHighlights ?? {}).reduce((a, v) => a + v.length, 0);
  const activeIndex = units.findIndex((u) => u.unitId === activeUnitId);
  const activeSummary = activeIndex >= 0 ? units[activeIndex] : null;
  const prevUnit = activeIndex > 0 ? units[activeIndex - 1] : null;
  const nextUnit =
    activeIndex >= 0 && activeIndex < units.length - 1 ? units[activeIndex + 1] : null;

  // 하이라이트 툴바는 이 창 **밖**(앱 루트)에 mount 돼 있어(fixed 좌표계 때문에 안으로
  // 옮길 수 없다) Radix 가 색상 클릭을 '바깥 클릭'으로 보고 창을 닫아버린다.
  // 툴바 안에서 시작된 상호작용은 닫힘에서 제외한다(원장 신고 2026-08-17).
  const keepOpenOnToolbar = (e: { target: EventTarget | null; preventDefault: () => void }) => {
    const el = e.target as HTMLElement | null;
    if (el?.closest?.("[data-testid='highlight-toolbar']")) e.preventDefault();
  };

  const body = (
      <>
        <DialogHeader className="border-border shrink-0 border-b px-5 py-3.5 pr-12">
          <DialogTitle className="flex flex-wrap items-center gap-2 text-[15px]">
            <BookOpenIcon className="text-primary size-4" />
            도해특허법 <span className="text-muted-foreground text-xs font-normal">제20판 · 강사 전용</span>
            {activeSummary ? (
              <span className="text-muted-foreground min-w-0 flex-1 truncate text-[13px] font-medium">
                — 제{activeSummary.chapterNo}장 {activeSummary.chapterTitle} ·{" "}
                {dohaeUnitLabel(activeSummary)} {activeSummary.title}
              </span>
            ) : null}
          </DialogTitle>
          {/* 같은 노드에 묶인 주제 사이 이동 + 표시 방식(팝업/시트) 전환 */}
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {activeSummary && units.length > 1 ? (
              <>
                <UnitStepButton
                  dir="prev"
                  unit={prevUnit}
                  onGo={setActiveUnitId}
                />
                <span className="text-muted-foreground text-[11px] tabular-nums">
                  {activeIndex + 1} / {units.length}
                </span>
                <UnitStepButton
                  dir="next"
                  unit={nextUnit}
                  onGo={setActiveUnitId}
                />
                <button
                  type="button"
                  onClick={() => setActiveUnitId(null)}
                  className="text-muted-foreground hover:text-foreground ml-1 text-[11px] underline underline-offset-2"
                >
                  목록
                </button>
              </>
            ) : null}
            <div className="ml-auto flex items-center gap-1.5">
            {activeSummary && viewerIsStaff ? (
              // 지금 보고 있는 유닛의 편집 화면으로. ★새 탭 — 팝업을 닫지 않아야
              // 원문과 나란히 놓고 고칠 수 있다.
              <a
                href={`/admin/dohae/${activeSummary.unitKey}`}
                target="_blank"
                rel="noreferrer"
                title="이 주제의 텍스트 편집 (새 탭)"
                className="border-border text-muted-foreground hover:bg-muted inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]"
              >
                <PencilLineIcon className="size-3" /> 편집
              </a>
            ) : null}
            {activeSummary ? (
              <button
                type="button"
                onClick={() => setToolsOpen(!toolsOpen)}
                aria-pressed={toolsOpen}
                title="포스트잇·하이라이트 목록 접기/펴기"
                className={cn(
                  "border-border hover:bg-muted hidden items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] lg:inline-flex",
                  toolsOpen ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <NotebookPenIcon className="size-3" />
                학습 툴
                {toolsOpen ? (
                  <ChevronRightIcon className="size-3" />
                ) : (
                  <ChevronLeftIcon className="size-3" />
                )}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setView(view === "sheet" ? "dialog" : "sheet")}
              title="표시 방식 비교용 — 선택은 이 브라우저에 기억됩니다."
              className="border-border text-muted-foreground hover:bg-muted inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]"
            >
              {view === "sheet" ? (
                <>
                  <SquareIcon className="size-3" /> 팝업으로 보기
                </>
              ) : (
                <>
                  <PanelRightIcon className="size-3" /> 시트로 보기
                </>
              )}
            </button>
            </div>
          </div>
        </DialogHeader>

        {activeUnitId === null ? (
          // 유닛 선택 목록 (한 조문에 여러 주제가 연결된 경우)
          <ul className="divide-border divide-y overflow-y-auto px-2 py-1">
            {units.map((u) => (
              <li key={u.unitId}>
                <button
                  type="button"
                  onClick={() => setActiveUnitId(u.unitId)}
                  className="hover:bg-muted/60 flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left"
                >
                  <span className="bg-primary/10 text-link inline-flex h-6 min-w-9 items-center justify-center rounded-md px-1.5 text-xs font-bold tabular-nums">
                    {dohaeUnitLabel(u)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{u.title}</span>
                    <span className="text-muted-foreground text-[11px]">
                      제{u.chapterNo}장 {u.chapterTitle}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div
            className={cn(
              "grid min-h-0 flex-1 grid-cols-1",
              toolsOpen && "lg:grid-cols-[1fr_300px]",
            )}
          >
            <div className="min-h-0 overflow-y-auto px-5 py-4">
              {!unit ? (
                <p className="text-muted-foreground flex items-center gap-2 py-16 text-center text-sm">
                  <Loader2Icon className="mx-auto size-4 animate-spin" /> 불러오는 중…
                </p>
              ) : (
                <MemoMarksOverlay memos={payload?.memos ?? []}>
                  <HighlightOverlay
                    fieldPath={`dohae.${unit.unitKey}`}
                    targetType="dohae_unit"
                    targetId={unit.unitId}
                    highlights={payload?.highlights ?? []}
                    viewerIsStaff={viewerIsStaff}
                  >
                    <DohaeBlocks
                      blocks={unit.blocks}
                      articles={payload?.articles ?? []}
                      articleHighlights={payload?.articleHighlights ?? {}}
                      articleMemos={payload?.articleMemos ?? {}}
                      titleMap={titleMap}
                      viewerIsStaff={viewerIsStaff}
                    />
                  </HighlightOverlay>
                </MemoMarksOverlay>
              )}
            </div>
            {/* ── 오른쪽 학습 툴 — 포스트잇이 주(主), 하이라이트는 접어 둔다.
                하이라이트는 본문에 색으로 이미 보이니 목록은 고치거나 지울 때만 필요하다
                (원장 판단 2026-08-17). 좌우 2단은 집중이 흩어져 되돌렸다.
                ★조문별 MemoList 는 접어도 mount 유지 — 포스트잇 작성 이벤트가
                  targetType+targetId 로 필터링돼 그 대상이 떠 있어야 도달한다. */}
            <aside
              className={cn(
                "border-border bg-muted/20 hidden min-h-0 overflow-y-auto border-l px-3 py-4",
                toolsOpen && "lg:block",
              )}
            >
              <p className="text-foreground mb-2 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide uppercase">
                <NotebookPenIcon className="size-3.5" /> 포스트잇
              </p>

              {unit ? (
                <div className="space-y-1.5">
                  {/* 조문 먼저, 도해 해설은 뒤로(원장 지시 2026-08-17). */}
                  {(payload?.articles ?? []).map((a) => {
                    const ms = payload?.articleMemos?.[a.articleId] ?? [];
                    return (
                      <details
                        key={a.articleId}
                        id={`dohae-annot-${a.articleId}`}
                        open={
                          expandedArticle[a.articleId] ??
                          (ms.length > 0 || snippetArticleId === a.articleId)
                        }
                        onToggle={(e) =>
                          setExpandedArticle((prev) => ({
                            ...prev,
                            [a.articleId]: e.currentTarget.open,
                          }))
                        }
                        className="border-border bg-background/60 rounded-md border px-2 py-1.5"
                      >
                        <summary className="cursor-pointer text-[11px] font-medium">
                          {a.displayLabel}
                          <span className="text-link ml-1 text-[10px] font-normal">
                            메인 공유
                          </span>
                          {ms.length > 0 ? (
                            <span className="text-muted-foreground ml-1 tabular-nums">
                              {ms.length}
                            </span>
                          ) : null}
                        </summary>
                        <div className="mt-2">
                          <MemoList
                            targetType="article"
                            targetId={a.articleId}
                            initial={ms}
                            viewerIsStaff={viewerIsStaff}
                          />
                        </div>
                      </details>
                    );
                  })}

                  <details
                    open={expandedArticle[DOHAE_AXIS_KEY] ?? true}
                    onToggle={(e) =>
                      setExpandedArticle((prev) => ({
                        ...prev,
                        [DOHAE_AXIS_KEY]: e.currentTarget.open,
                      }))
                    }
                    className="border-border bg-background/60 rounded-md border px-2 py-1.5"
                  >
                    <summary className="cursor-pointer text-[11px] font-medium">
                      도해 해설
                      <span className="text-muted-foreground ml-1 text-[10px] font-normal">
                        이 팝업 전용
                      </span>
                      {(payload?.memos ?? []).length > 0 ? (
                        <span className="text-muted-foreground ml-1 tabular-nums">
                          {(payload?.memos ?? []).length}
                        </span>
                      ) : null}
                    </summary>
                    <div className="mt-2">
                      <MemoList
                        targetType="dohae_unit"
                        targetId={unit.unitId}
                        initial={payload?.memos ?? []}
                        viewerIsStaff={viewerIsStaff}
                      />
                    </div>
                  </details>
                </div>
              ) : null}

              {/* 하이라이트 — 본문에 이미 보이므로 기본 접힘. 고치거나 지울 때만 편다. */}
              {unit ? (
                <details className="border-border mt-4 rounded-md border px-2 py-1.5">
                  <summary className="text-muted-foreground cursor-pointer text-[11px] font-semibold tracking-wide uppercase">
                    하이라이트 정리
                    {highlightTotal > 0 ? (
                      <span className="ml-1 tabular-nums">{highlightTotal}</span>
                    ) : null}
                  </summary>
                  <div className="mt-2 space-y-3">
                    <div>
                      <p className="text-muted-foreground mb-1 text-[10px] font-medium">
                        도해 해설
                      </p>
                      <HighlightList
                        targetType="dohae_unit"
                        targetId={unit.unitId}
                        initial={payload?.highlights ?? []}
                        viewerIsStaff={viewerIsStaff}
                        compact
                      />
                    </div>
                    {(payload?.articles ?? []).map((a) => (
                      <div key={a.articleId}>
                        <p className="text-muted-foreground mb-1 text-[10px] font-medium">
                          {a.displayLabel}
                        </p>
                        <HighlightList
                          targetType="article"
                          targetId={a.articleId}
                          initial={payload?.articleHighlights?.[a.articleId] ?? []}
                          viewerIsStaff={viewerIsStaff}
                          compact
                        />
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}

              <p className="text-muted-foreground mt-4 text-[11px] leading-relaxed">
                다이어그램(이미지) 안 문구는 드래그 대상이 아닙니다.
              </p>
            </aside>
          </div>
        )}
      </>
  );

  // 표시 방식 두 가지를 나란히 비교하려고 남겨둔 전환(원장 요청 2026-08-17).
  //  · 팝업(Dialog) — 화면 가운데, 넓게 펼쳐 표를 통째로 본다.
  //  · 시트(Sheet)  — 오른쪽에서 밀려나와 왼쪽 체계도·조문을 보면서 대조한다.
  // 어느 쪽이든 툴바 예외 처리(keepOpenOnToolbar)는 똑같이 필요하다.
  if (view === "sheet") {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="flex w-[94vw] gap-0 overflow-hidden p-0 sm:max-w-3xl lg:max-w-4xl"
          onInteractOutside={keepOpenOnToolbar}
        >
          {body}
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[88vh] w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl lg:max-w-5xl"
        onInteractOutside={keepOpenOnToolbar}
      >
        {body}
      </DialogContent>
    </Dialog>
  );
}

/** 같은 노드에 묶인 주제 사이 이동 버튼. 끝이면 비활성. */
function UnitStepButton({
  dir,
  unit,
  onGo,
}: {
  dir: "prev" | "next";
  unit: DohaeUnitSummary | null;
  onGo: (id: string) => void;
}) {
  const Icon = dir === "prev" ? ChevronLeftIcon : ChevronRightIcon;
  return (
    <button
      type="button"
      disabled={!unit}
      onClick={() => unit && onGo(unit.unitId)}
      title={unit ? `${dohaeUnitLabel(unit)} ${unit.title}` : undefined}
      className="border-border text-muted-foreground hover:bg-muted inline-flex max-w-[13rem] items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] disabled:opacity-40"
    >
      {dir === "prev" ? <Icon className="size-3 shrink-0" /> : null}
      <span className="truncate">
        {unit ? `${dohaeUnitLabel(unit)} ${unit.title}` : dir === "prev" ? "처음" : "마지막"}
      </span>
      {dir === "next" ? <Icon className="size-3 shrink-0" /> : null}
    </button>
  );
}
