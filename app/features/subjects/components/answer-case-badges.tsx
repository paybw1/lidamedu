// 주관식 모범답안 인용 판례 배지(설문별) — 배지 클릭 → 요지 팝업(문제 화면 유지),
// 팝업의 [공부하러 가기] → 판례 학습화면(하이라이트·메모).
import { ArrowRightIcon, ScaleIcon } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import { Button } from "~/core/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/core/components/ui/dialog";
import type { AnswerCaseGroup, AnswerCitedCase } from "~/features/problems/labels";
import { MarkdownView } from "~/features/problems/components/markdown-view";

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
          배지를 누르면 요지를 팝업으로 볼 수 있습니다
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
  const [open, setOpen] = useState(false);
  const studyHref = `/subjects/${c.subjectSlug}/cases/${c.caseId}`;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border-border bg-muted/40 text-foreground/80 hover:bg-muted inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums"
        title={c.items[0]?.title}
      >
        <ScaleIcon className="size-3 opacity-60" />
        {c.caseNumber}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="pr-6 text-base leading-snug">
              대법원 {c.caseNumber}
            </DialogTitle>
          </DialogHeader>
          {/* 판결요지 — 쟁점 제목(박스) + 내용 */}
          {c.items.length ? (
            <div className="space-y-4">
              {c.items.map((it, i) => (
                <div key={i} className="space-y-2">
                  {it.title ? (
                    <div className="border-border bg-muted/30 rounded-lg border px-4 py-3">
                      <p className="text-foreground text-sm leading-relaxed font-medium">
                        {it.title}
                      </p>
                    </div>
                  ) : null}
                  {it.body ? (
                    <MarkdownView text={it.body} className="text-sm leading-[1.8]" />
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              요지가 등록되지 않은 판례입니다.
            </p>
          )}
          <div className="flex justify-end">
            <Button asChild size="sm" className="gap-1">
              <Link to={studyHref}>
                공부하러 가기 <ArrowRightIcon className="size-3.5" />
              </Link>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
