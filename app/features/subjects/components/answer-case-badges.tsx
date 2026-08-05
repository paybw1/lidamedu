// 주관식 모범답안 인용 판례 배지(설문별) — 배지 클릭 → 요지 팝업(문제 화면 유지),
// 팝업의 [공부하러 가기] → 판례 학습화면(하이라이트·메모).
// 메인 판례(problems.main_case_number): 그룹 내 맨 앞 정렬(서버) + ★ 강조.
//   staff 는 팝업 하단에서 지정/해제(POST /api/problems/main-case).
import { ArrowRightIcon, ScaleIcon, StarIcon } from "lucide-react";
import { useState } from "react";
import { Link, useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/core/components/ui/dialog";
import type { AnswerCaseGroup, AnswerCitedCase } from "~/features/problems/labels";
import { MarkdownView } from "~/features/problems/components/markdown-view";
import { cn } from "~/core/lib/utils";

// staff 메인 판례 지정 컨텍스트 — problemId 가 있으면 팝업에 지정 버튼 노출.
export interface MainCaseControl {
  problemId: string;
}

export function AnswerCaseBadges({
  groups,
  mainControl,
}: {
  groups: AnswerCaseGroup[];
  mainControl?: MainCaseControl;
}) {
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
              <CaseBadge key={`${g.label}-${c.caseId}`} c={c} mainControl={mainControl} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// 모범답안 설문 섹션 끝에 붙는 인라인 배지 행.
export function CaseBadgeRow({
  cases,
  mainControl,
}: {
  cases: AnswerCitedCase[];
  mainControl?: MainCaseControl;
}) {
  if (!cases.length) return null;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-1.5 rounded-lg bg-violet-50/70 px-3 py-2 dark:bg-violet-950/25">
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-700 dark:text-violet-300">
        <ScaleIcon className="size-3 opacity-70" /> 관련 판례
      </span>
      {cases.map((c) => (
        <CaseBadge key={c.caseId} c={c} mainControl={mainControl} />
      ))}
    </div>
  );
}

export function CaseBadge({
  c,
  mainControl,
}: {
  c: AnswerCitedCase;
  mainControl?: MainCaseControl;
}) {
  const [open, setOpen] = useState(false);
  const fetcher = useFetcher<{ ok?: true; mainCaseNumber?: string | null; error?: string }>();
  const studyHref = `/subjects/${c.subjectSlug}/cases/${c.caseId}`;
  // 낙관적 표시 — 제출 중이면 폼 값 기준.
  const submitted = fetcher.formData?.get("caseNumber");
  const isMain =
    submitted !== undefined && submitted !== null
      ? String(submitted) === c.caseNumber
      : (c.isMain ?? false);
  const toggleMain = () => {
    if (!mainControl) return;
    const fd = new FormData();
    fd.set("problemId", mainControl.problemId);
    fd.set("caseNumber", isMain ? "" : c.caseNumber);
    fetcher.submit(fd, { method: "post", action: "/api/problems/main-case" });
  };
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] tabular-nums",
          isMain
            ? "border-amber-400 bg-amber-50 font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-600/60 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-900/40"
            : "bg-card text-foreground/85 border-violet-300/60 font-medium hover:bg-violet-100 dark:border-violet-700/50 dark:hover:bg-violet-900/40",
        )}
        title={isMain ? `메인 판례 — ${c.items[0]?.title ?? ""}` : c.items[0]?.title}
      >
        {isMain ? (
          <StarIcon className="size-3 fill-amber-500 text-amber-500" />
        ) : (
          <ScaleIcon className="size-3 opacity-60" />
        )}
        {c.caseNumber}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        {/* 헤더(사건번호·X)·하단 버튼 고정, 본문만 스크롤 */}
        <DialogContent className="flex max-h-[80vh] max-w-2xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-1.5 pr-6 text-base leading-snug">
              {isMain ? (
                <StarIcon className="size-4 shrink-0 fill-amber-500 text-amber-500" />
              ) : null}
              대법원 {c.caseNumber}
            </DialogTitle>
          </DialogHeader>
          <div className="-mr-2 flex-1 overflow-y-auto pr-2">
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
          </div>
          <div className="flex items-center justify-between gap-2 pt-1">
            {mainControl ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={fetcher.state !== "idle"}
                onClick={toggleMain}
                className="gap-1"
              >
                <StarIcon
                  className={cn("size-3.5", isMain && "fill-amber-500 text-amber-500")}
                />
                {isMain ? "메인 판례 해제" : "메인 판례로 지정"}
              </Button>
            ) : (
              <span />
            )}
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
