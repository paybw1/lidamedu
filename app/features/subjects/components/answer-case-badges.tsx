// 주관식 모범답안 인용 판례 배지(설문별) — 배지 클릭 → 팝오버에서
// [팝업으로 학습](요지 Dialog, 문제 화면 유지) / [학습화면 이동](판례 뷰어 — 하이라이트·메모) 선택.
import { BookOpenIcon, ExternalLinkIcon, ScaleIcon } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import { MarkdownView } from "~/features/problems/components/markdown-view";
import { Button } from "~/core/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/core/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/core/components/ui/popover";
import type { AnswerCaseGroup, AnswerCitedCase } from "~/features/problems/labels";

export function AnswerCaseBadges({ groups }: { groups: AnswerCaseGroup[] }) {
  if (!groups.length) return null;
  return (
    <div className="border-border bg-card rounded-xl border shadow-sm">
      <div className="border-border flex items-center gap-2 border-b px-5 py-3">
        <ScaleIcon className="text-muted-foreground size-3.5" />
        <p className="text-muted-foreground text-[11px] font-bold tracking-widest uppercase">
          관련 판례
        </p>
        <span className="text-muted-foreground/70 text-[11px]">
          배지를 눌러 팝업 학습 또는 학습화면으로 이동
        </span>
      </div>
      <div className="space-y-2 px-5 py-3">
        {groups.map((g, gi) => (
          <div key={`${g.label}-${gi}`} className="flex flex-wrap items-center gap-1.5">
            <span className="text-muted-foreground w-14 shrink-0 text-xs font-semibold">
              {g.label}
            </span>
            {g.cases.map((c) => (
              <CaseBadge key={`${g.label}-${c.caseId}`} c={c} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function CaseBadge({ c }: { c: AnswerCitedCase }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [popOpen, setPopOpen] = useState(false);
  const studyHref = `/subjects/${c.subjectSlug}/cases/${c.caseId}`;
  return (
    <>
      <Popover open={popOpen} onOpenChange={setPopOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="border-border bg-muted/40 text-foreground/80 hover:bg-muted inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums"
            title={c.title}
          >
            <ScaleIcon className="size-3 opacity-60" />
            {c.caseNumber}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-3">
          <p className="text-foreground mb-2 line-clamp-3 text-xs leading-relaxed font-medium">
            {c.title}
          </p>
          <div className="flex gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 flex-1 gap-1 text-xs"
              onClick={() => {
                setPopOpen(false);
                setDialogOpen(true);
              }}
            >
              <BookOpenIcon className="size-3" /> 팝업으로 학습
            </Button>
            <Button asChild size="sm" className="h-7 flex-1 gap-1 text-xs">
              <Link to={studyHref}>
                <ExternalLinkIcon className="size-3" /> 학습화면
              </Link>
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="pr-6 text-base leading-snug">
              대법원 {c.caseNumber}
            </DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground -mt-2 text-sm leading-relaxed font-medium">
            {c.title}
          </p>
          {c.summaryMd ? (
            <MarkdownView
              text={c.summaryMd}
              className="text-sm leading-[1.8]"
            />
          ) : (
            <p className="text-muted-foreground text-sm">요지가 등록되지 않은 판례입니다.</p>
          )}
          <div className="flex justify-end">
            <Button asChild size="sm" className="gap-1">
              <Link to={studyHref}>
                <ExternalLinkIcon className="size-3.5" /> 학습화면에서 하이라이트·메모하기
              </Link>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
