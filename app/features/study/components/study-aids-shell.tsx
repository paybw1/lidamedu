// 학습보조 4개 화면(오답노트·즐겨찾기·메모·하이라이트) 공통 셸.
// 헤더 + 형제 화면을 잇는 탭 strip + 카운트 요약 strip.
import { useRef, useState, type ComponentType, type ReactNode } from "react";

import {
  BookmarkIcon,
  DownloadIcon,
  HighlighterIcon,
  MessageSquareTextIcon,
  NotebookPenIcon,
  StickyNoteIcon,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "~/core/lib/utils";
import { SectionTabs } from "~/core/components/student";
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

interface TabDef {
  id: StudyAidTab;
  to: string;
  label: string;
  Icon: ComponentType<{ className?: string }>;
}

const TABS: TabDef[] = [
  {
    id: "wrong",
    to: "/study/wrong-note",
    label: "오답노트",
    Icon: NotebookPenIcon,
  },
  {
    id: "highlights",
    to: "/study/highlights",
    label: "하이라이트",
    Icon: HighlighterIcon,
  },
  {
    id: "bookmarks",
    to: "/study/bookmarks",
    label: "즐겨찾기",
    Icon: BookmarkIcon,
  },
  { id: "notes", to: "/study/notes", label: "포스트잇", Icon: StickyNoteIcon },
  {
    id: "comments",
    to: "/study/comments",
    label: "메모",
    Icon: MessageSquareTextIcon,
  },
];

// 학습지원 탭 — 공용 `SectionTabs` 프리미티브 사용.
// 학습관리/정보 3 영역과 동일 디자인 톤. 카운트 badge 는 SectionTabs 의 count prop 으로.
// `active` prop 은 호출처 호환성 유지(SectionTabs 가 path 기반 자동 매칭).
function StudyAidsTabs({
  counts,
}: {
  active?: StudyAidTab;
  counts: StudyAidTabCounts;
}) {
  return (
    <SectionTabs
      ariaLabel="학습지원"
      sticky={false}
      items={TABS.map((t) => ({
        id: t.id,
        to: t.to,
        label: t.label,
        icon: t.Icon,
        count: counts[t.id],
      }))}
    />
  );
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
  const ActiveIcon = (TABS.find((t) => t.id === active) ?? TABS[0]).Icon;
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
        <div className="mb-[18px]" data-pdf-exclude="true">
          <StudyAidsTabs active={active} counts={tabCounts} />
        </div>
        {summaryStats ? <CountStrip stats={summaryStats} /> : null}
        {children}
      </div>
    </div>
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
