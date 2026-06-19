// 학습보조 4개 화면(오답노트·즐겨찾기·메모·하이라이트) 공통 셸.
// 헤더 + 형제 화면을 잇는 탭 strip + 카운트 요약 strip.
import {
  BookmarkIcon,
  DownloadIcon,
  HighlighterIcon,
  MessageSquareTextIcon,
  NotebookPenIcon,
  SparklesIcon,
  StickyNoteIcon,
} from "lucide-react";
import { type ComponentType, type ReactNode, useRef, useState } from "react";
import { toast } from "sonner";

import { AreaTabs, type SectionTabItem } from "~/core/components/student";
import { AREA_GROUP_IDS, topbarDropdownItems } from "~/core/lib/nav-groups";
import { cn } from "~/core/lib/utils";
import type { StudyAidCounts } from "~/features/study/queries.server";

export type StudyAidTab =
  | "wrong"
  | "bookmarks"
  | "notes"
  | "highlights"
  | "comments";

// 탭 strip 의 형제 화면 건수 — 각 화면 loader 가 getStudyAidCounts 로 채운다.
export interface StudyAidTabCounts {
  wrong: number;
  bookmarks: number;
  notes: number;
  highlights: number;
  comments: number;
}

// 학습지원 탭 항목 = SSOT(AREA_GROUP_IDS.aids) 파생 — 상단바 드롭다운과 동일(AI Q&A 포함).
// 아이콘·카운트는 to 로 매핑(표시·데이터 메타). 카운트 없는 항목(AI Q&A)은 badge 생략.
const AIDS_ICON_BY_TO: Record<string, ComponentType<{ className?: string }>> = {
  "/study/wrong-note": NotebookPenIcon,
  "/study/highlights": HighlighterIcon,
  "/study/bookmarks": BookmarkIcon,
  "/study/notes": StickyNoteIcon,
  "/study/comments": MessageSquareTextIcon,
  "/ai": SparklesIcon,
};
const AIDS_COUNT_KEY_BY_TO: Record<string, StudyAidTab> = {
  "/study/wrong-note": "wrong",
  "/study/highlights": "highlights",
  "/study/bookmarks": "bookmarks",
  "/study/notes": "notes",
  "/study/comments": "comments",
};
// 헤더 아이콘 룩업 — active 탭(StudyAidTab)별. (AI Q&A 는 StudyAidsShell 미사용 화면.)
const ICON_BY_TAB: Record<
  StudyAidTab,
  ComponentType<{ className?: string }>
> = {
  wrong: NotebookPenIcon,
  highlights: HighlighterIcon,
  bookmarks: BookmarkIcon,
  notes: StickyNoteIcon,
  comments: MessageSquareTextIcon,
};

// 학습지원 탭 — 공용 `SectionTabs` 프리미티브. 학습관리/정보 3 영역과 동일 디자인 톤.
function StudyAidsTabs({
  counts,
}: {
  active?: StudyAidTab;
  counts: StudyAidTabCounts;
}) {
  const items: SectionTabItem[] = topbarDropdownItems(AREA_GROUP_IDS.aids).map(
    (link) => {
      const path = link.to.split("?")[0];
      const countKey = AIDS_COUNT_KEY_BY_TO[path];
      return {
        id: path,
        to: link.to,
        label: link.label,
        icon: AIDS_ICON_BY_TO[path],
        count: countKey ? counts[countKey] : undefined,
      };
    },
  );
  return <AreaTabs ariaLabel="학습지원" items={items} />;
}

export interface CountStat {
  label: string;
  value: number;
  /** 선택적 색 dot — Tailwind 배경 클래스 (예: "bg-primary"). */
  dotClass?: string;
}

// 카운트 요약 strip — 전체 + 분류별 건수.
function CountStrip({ stats }: { stats: CountStat[] }) {
  return (
    <div className="border-border bg-muted/40 mb-[18px] flex flex-wrap gap-x-5 gap-y-2 rounded-xl border px-[18px] py-3.5">
      {stats.map((s) => (
        <div key={s.label} className="flex items-baseline gap-2">
          {s.dotClass ? (
            <span
              aria-hidden
              className={cn("size-2 self-center rounded-full", s.dotClass)}
            />
          ) : null}
          <span className="text-muted-foreground text-xs">{s.label}</span>
          <span className="text-lg font-extrabold tracking-tight tabular-nums">
            {s.value.toLocaleString("ko-KR")}
          </span>
        </div>
      ))}
    </div>
  );
}

// 학습보조 4개 화면 공통 셸.
export function StudyAidsShell({
  active,
  tabCounts,
  title,
  desc,
  summaryStats,
  printHref,
  children,
}: {
  active: StudyAidTab;
  tabCounts: StudyAidTabCounts;
  title: string;
  desc: string;
  summaryStats?: CountStat[];
  // 제공 시: "복습 정리본" 인쇄 라우트를 새 탭으로 연다(콘텐츠 정리본 → PDF 저장).
  // 미제공 시(아직 정리본 미구현 탭): 화면 캡처(html2canvas) 폴백.
  printHref?: string;
  children: ReactNode;
}) {
  const ActiveIcon = ICON_BY_TAB[active] ?? NotebookPenIcon;
  const contentRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const handleExportPdf = async () => {
    if (!contentRef.current || exporting) return;
    setExporting(true);
    try {
      const { downloadElementAsPdf } = await import(
        "~/core/lib/pdf-export.client"
      );
      await downloadElementAsPdf(contentRef.current, `학습지원-${title}.pdf`);
    } catch (err) {
      console.error("[study-aids] PDF 내보내기 실패:", err);
      toast.error("PDF 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      {/* 토글 — 최상단 sticky(레이아웃 폭, 헤더 위). 4영역 동일: 토글 → 헤더 → 내용. */}
      <StudyAidsTabs active={active} counts={tabCounts} />
      <div className="mx-auto w-full max-w-5xl px-5 py-7 md:px-8 md:py-9">
        <div ref={contentRef}>
          <header className="mb-[18px] flex items-start justify-between gap-3">
            <div className="space-y-1.5">
              <p className="text-primary inline-flex items-center gap-1.5 font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
                <ActiveIcon className="size-3" />
                STUDY AIDS · 학습지원
              </p>
              <h1 className="text-[28px] font-extrabold tracking-tight">
                {title}
              </h1>
              <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
                {desc}
              </p>
            </div>
            {printHref ? (
              <a
                href={printHref}
                target="_blank"
                rel="noreferrer"
                data-pdf-exclude="true"
                className="border-border bg-card text-foreground hover:bg-muted inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-[13px] font-semibold whitespace-nowrap transition-colors"
              >
                <DownloadIcon className="size-3.5" />
                PDF 저장
              </a>
            ) : (
              <button
                type="button"
                onClick={handleExportPdf}
                disabled={exporting}
                data-pdf-exclude="true"
                className="border-border bg-card text-foreground hover:bg-muted inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-[13px] font-semibold whitespace-nowrap transition-colors disabled:opacity-60"
              >
                <DownloadIcon className="size-3.5" />
                {exporting ? "PDF 생성 중…" : "PDF 저장"}
              </button>
            )}
          </header>
          {summaryStats ? <CountStrip stats={summaryStats} /> : null}
          {children}
        </div>
      </div>
    </>
  );
}

// getStudyAidCounts 결과 → 탭 strip 건수.
export function toTabCounts(c: StudyAidCounts): StudyAidTabCounts {
  return {
    wrong: c.wrongMcq + c.wrongOx,
    bookmarks: c.bookmarks,
    notes: c.memos,
    highlights: c.highlights,
    comments: c.comments,
  };
}
