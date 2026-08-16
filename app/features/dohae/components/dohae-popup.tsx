// 도해특허법 팝업 — 조문 뷰어 "도해" 칩에서 열림. ★staff 전용(진입 칩 자체가 RLS 로 숨음).
// 표=HTML(선택 가능 — 하이라이트·포스트잇 작동), 다이어그램=서명 URL 이미지(편집 불가).
// 학습 툴: HighlightOverlay(dohae_unit)+MemoMarksOverlay+우측 MemoList. 선택 툴바는
// 조문 뷰어의 prop-less HighlightToolbar 가 컨테이너 dataset 으로 대상 판별.

import { BookOpenIcon, ChevronLeftIcon, Loader2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { useFetcher, useFetchers } from "react-router";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/core/components/ui/dialog";
import { cn } from "~/core/lib/utils";
import { HighlightOverlay } from "~/features/annotations/components/highlight-overlay";
import { MemoList } from "~/features/annotations/components/memo-list";
import { MemoMarksOverlay } from "~/features/annotations/components/memo-marks-overlay";

import {
  dohaeUnitLabel,
  type DohaeBlock,
  type DohaeCell,
  type DohaeUnitSummary,
} from "../labels";
import type { loader as unitLoader } from "../api/unit";

type UnitPayload = Awaited<ReturnType<typeof unitLoader>>;

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

function DohaeTable({ cells }: { cells: DohaeCell[][] }) {
  if (cells.length === 0) return null;
  const hasHeader = cells.length > 1;
  // 라벨 열 수 — 도해 표는 머리글 첫 칸이 라벨 묶음을 덮는다("요 건" 3열 / "구 분" 2열).
  // 종전엔 ci===0 만 라벨로 봐서, rowspan 때문에 2·3열로 밀린 라벨(정의·자연법칙을 이용·
  // 주체적 기준 등)이 본문처럼 왼쪽 정렬·보통 굵기로 나왔다(원장 신고 2026-08-17).
  const labelCols = hasHeader ? (cells[0]?.[0]?.colSpan ?? 1) : 1;
  const startCols = gridStartCols(cells);
  // 라벨 열이 1개("구 분")인 표는 첫 열이 정말 라벨 열인지 **표 단위로** 한 번에 정한다.
  // 칸마다 글자수로 재면 같은 열인데 어떤 칸만 굵게 나오는 들쭉날쭉이 생긴다
  // ("새로운 발명 수용(구체적 타당성)" 14자만 빠지던 문제 — 원장 신고 2026-08-17).
  // 첫 열이 긴 예시 블록인 표(보정 t25 138자·법정실시권 t49 170자)를 걸러내는 게 목적이라
  // 실측 분포상 가장 긴 진짜 라벨(42자)과 여유 있게 갈리는 45자를 경계로 둔다.
  const LABEL_COL_MAX = 45;
  const col0IsLabel =
    labelCols > 1 ||
    cells.every((row, ri) =>
      ri === 0 && hasHeader
        ? true
        : row.every(
            (c, ci) =>
              row.length < 2 ||
              startCols[ri][ci] !== 0 ||
              c.text.replace(/\s/g, "").length <= LABEL_COL_MAX,
          ),
    );
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
                const isHead = hasHeader && ri === 0;
                const Tag = isHead ? "th" : "td";
                // 라벨 셀 — 헤더 톤(가운데·굵게·연한 음영). 라벨 열 안에 놓인 칸만.
                const isLabel =
                  !isHead &&
                  row.length > 1 &&
                  startCols[ri][ci] < labelCols &&
                  col0IsLabel;
                return (
                  <Tag
                    key={ci}
                    colSpan={c.colSpan > 1 ? c.colSpan : undefined}
                    rowSpan={c.rowSpan > 1 ? c.rowSpan : undefined}
                    className={cn(
                      "border-border border px-2.5 py-1.5 text-left align-middle leading-[1.65] whitespace-pre-wrap",
                      isHead && "bg-muted/60 text-center font-bold",
                      isLabel && "bg-muted/40 text-center font-semibold",
                      // 줄바꿈이 든 라벨(세로쓰기 "내\n용")은 원본 줄나눔을 살린다.
                      isLabel && !c.text.includes("\n") && "whitespace-nowrap",
                    )}
                  >
                    {c.text}
                    {(c.tables ?? []).map((t, ti) => (
                      <DohaeTable key={ti} cells={t} />
                    ))}
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

function DohaeBlocks({ blocks }: { blocks: DohaeBlock[] }) {
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
          // 1셀 박스 표 + 조문 원문 → 조문 박스 스타일.
          const single = b.cells.length === 1 && b.cells[0]?.length === 1;
          if (single && /^제\d+조/.test(b.cells[0][0].text)) {
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
  const activeSummary = units.find((u) => u.unitId === activeUnitId) ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[88vh] w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl lg:max-w-5xl"
        // 하이라이트 툴바는 팝업 **밖**(앱 루트)에 mount 돼 있어(fixed 좌표계 때문에 안으로
        // 옮길 수 없다) Radix 가 색상 클릭을 '바깥 클릭'으로 보고 팝업을 닫아버린다.
        // 툴바 안에서 시작된 상호작용은 닫힘에서 제외한다(원장 신고 2026-08-17).
        onInteractOutside={(e) => {
          const el = e.target as HTMLElement | null;
          if (el?.closest?.("[data-testid='highlight-toolbar']")) e.preventDefault();
        }}
      >
        <DialogHeader className="border-border shrink-0 border-b px-5 py-3.5">
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
          <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_280px]">
            <div className="min-h-0 overflow-y-auto px-5 py-4">
              {units.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setActiveUnitId(null)}
                  className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-xs"
                >
                  <ChevronLeftIcon className="size-3.5" /> 목록으로
                </button>
              ) : null}
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
                    <DohaeBlocks blocks={unit.blocks} />
                  </HighlightOverlay>
                </MemoMarksOverlay>
              )}
            </div>
            {/* 우측 학습 툴 — 포스트잇/메모. 하이라이트는 본문 드래그 → 색상 툴바. */}
            <aside className="border-border bg-muted/20 hidden min-h-0 overflow-y-auto border-l px-3 py-4 lg:block">
              <p className="text-muted-foreground mb-2 text-[11px] font-semibold tracking-wide uppercase">
                포스트잇 · 메모
              </p>
              {unit ? (
                <MemoList
                  targetType="dohae_unit"
                  targetId={unit.unitId}
                  initial={payload?.memos ?? []}
                  viewerIsStaff={viewerIsStaff}
                />
              ) : null}
              <p className="text-muted-foreground mt-4 text-[11px] leading-relaxed">
                본문 문구를 드래그하면 하이라이트·포스트잇 툴바가 뜹니다. 표 텍스트에도
                동일하게 작동합니다. 다이어그램(이미지) 안 문구는 대상이 아닙니다.
              </p>
            </aside>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
