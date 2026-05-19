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
import { Link } from "react-router";

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

// 학습보조 탭 strip — 4개 화면을 잇는 연결 조직 (brief §5.2).
function StudyAidsTabs({
  active,
  counts,
}: {
  active: StudyAidTab;
  counts: StudyAidTabCounts;
}) {
  return (
    <nav
      aria-label="학습보조"
      className="border-border bg-muted/50 flex w-max max-w-full gap-1 overflow-x-auto rounded-full border p-1"
    >
      {TABS.map((t) => {
        const isActive = t.id === active;
        return (
          <Link
            key={t.id}
            to={t.to}
            viewTransition
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] whitespace-nowrap transition-colors",
              isActive
                ? "bg-background text-primary font-bold shadow-sm"
                : "text-foreground/70 hover:text-foreground font-medium",
            )}
          >
            <t.Icon className="size-3.5" />
            <span>{t.label}</span>
            <span
              className={cn(
                "inline-block min-w-[22px] rounded-full px-1.5 text-center text-[10px] font-bold tabular-nums",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {counts[t.id].toLocaleString("ko-KR")}
            </span>
          </Link>
        );
      })}
    </nav>
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
  children,
}: {
  active: StudyAidTab;
  tabCounts: StudyAidTabCounts;
  title: string;
  desc: string;
  summaryStats?: CountStat[];
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
      await downloadElementAsPdf(contentRef.current, `학습보조-${title}.pdf`);
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
              STUDY AIDS · 학습보조
            </p>
            <h1 className="text-[28px] font-extrabold tracking-tight">
              {title}
            </h1>
            <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
              {desc}
            </p>
          </div>
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
