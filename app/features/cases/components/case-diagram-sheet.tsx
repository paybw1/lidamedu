// feat-2-035 S4 — 판례 도식 배지 + 열람 패널(우측 시트 / 가운데 팝업 선택).
//
// 표시 방식은 원장 요청(2026-08-20)으로 **사용자가 고른다** — 본문과 대조하며 읽으려면 시트가,
// 도식만 크게 보려면 팝업이 낫다. 선택은 localStorage 에 남아 다음 판례에서도 유지된다.
//
// ★법리 4축은 "있는 축만" 렌더한다. 빈 축의 자리를 만들어 두면 "비어 있음"이 정보처럼 읽혀,
//   근거 없는 축을 채우지 않기로 한 설계가 화면에서 무너진다.

import { useEffect, useState } from "react";

import {
  GitBranchIcon,
  PanelRightIcon,
  ScaleIcon,
  SquareIcon,
} from "lucide-react";

import { Badge } from "~/core/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/core/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "~/core/components/ui/sheet";
import { cn } from "~/core/lib/utils";
import { MarkdownView } from "~/features/problems/components/markdown-view";
import {
  isOldLawLabel,
  type StatuteRef,
} from "~/features/cases/lib/statute-label";

import { RefPreviewBadge } from "~/features/subjects/components/ref-preview-badge";

import {
  TIMELINE_KIND_LABEL,
  filledAxes,
  isLowerCourtSource,
  type CaseDiagramBlock,
  type FactsSourceKind,
  type TimelineEvent,
} from "../lib/case-diagram";

export interface CaseDiagramView {
  factsMd: string;
  factsSourceKind: FactsSourceKind;
  factsSourceRef: string | null;
  blocks: CaseDiagramBlock[];
  timeline: TimelineEvent[];
  reviewStatus: "draft" | "approved" | "rejected";
}

type ViewMode = "sheet" | "dialog";
const VIEW_MODE_KEY = "caseDiagram.viewMode";

// 쟁점 안쪽 4단은 답안 작성 순서 그대로 번호를 매긴다.
// ★원문자(①②③④)가 아니라 "1." 형식 — 답안지에 쓰는 표기와 맞춘다(원장 요청 2026-08-21).
const STEP_MARK = ["1.", "2.", "3.", "4."] as const;

/**
 * 사실관계 본문의 맨 앞 "# 사실관계" 머리글을 떼어낸다.
 * 패널이 이미 "사실관계" 배지를 달고 있어 제목이 두 번 나온다(원장 지적 2026-08-20).
 * 생성 프롬프트도 함께 고쳤지만, 이미 저장된 도식을 다시 만들지 않아도 되도록 렌더에서 막는다.
 */
function stripFactsHeading(md: string): string {
  return md.replace(/^\s*#{1,3}\s*사실\s*관계\s*\n+/, "");
}

/** 사실관계 출처 캡션 — 사실관계가 얇은 이유를 학생이 알 수 있게 밝힌다. */
function factsSourceCaption(d: CaseDiagramView): string | null {
  if (isLowerCourtSource(d.factsSourceKind)) {
    return d.factsSourceRef ? `출처 ${d.factsSourceRef}` : "출처 하급심 판결문";
  }
  if (d.factsSourceKind === "supreme_only") {
    return "출처 대법원 판결문 기재 범위";
  }
  return null;
}

export function CaseDiagramSheet({
  diagram,
  caseNumber,
  subjectSlug,
  statuteArticleIds,
  className,
}: {
  diagram: CaseDiagramView;
  caseNumber: string;
  /** 조문 학습화면 링크용 과목 slug. */
  subjectSlug?: string;
  /** 법조문 표기 → 조문 참조. 해석 실패분은 텍스트 칩으로 남는다. */
  statuteArticleIds?: Record<string, StatuteRef>;
  className?: string;
}) {
  const draft = diagram.reviewStatus !== "approved";
  // localStorage 는 마운트 후에 읽는다 — SSR 결과와 어긋나면 hydration 경고.
  const [mode, setMode] = useState<ViewMode>("sheet");
  useEffect(() => {
    const saved = window.localStorage.getItem(VIEW_MODE_KEY);
    if (saved === "dialog" || saved === "sheet") setMode(saved);
  }, []);
  const switchMode = (next: ViewMode) => {
    setMode(next);
    window.localStorage.setItem(VIEW_MODE_KEY, next);
  };

  const trigger = (
    <button
      type="button"
      title="2차 답안 순서로 정리한 도식 보기"
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors",
        draft
          ? "border-amber-500/40 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400"
          : "border-primary/40 text-link hover:bg-primary/10",
        className,
      )}
    >
      <GitBranchIcon className="size-3.5" />
      도식
      {draft ? <span className="font-semibold">· 검수중</span> : null}
    </button>
  );

  const title = (
    <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
      <ScaleIcon className="text-link size-4" />
      판례 도식
      <span className="text-muted-foreground font-mono text-xs font-normal">
        {caseNumber}
      </span>
      <ModeToggle mode={mode} onChange={switchMode} />
    </span>
  );

  const body = (
    <DiagramBody
      diagram={diagram}
      draft={draft}
      subjectSlug={subjectSlug}
      statuteArticleIds={statuteArticleIds}
    />
  );

  if (mode === "dialog") {
    return (
      <Dialog>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        <DialogContent className="max-h-[88vh] w-[min(96vw,900px)] max-w-none overflow-y-auto p-0 sm:max-w-none">
          <DialogHeader className="border-border bg-background sticky top-0 z-10 border-b px-4 py-3">
            <DialogTitle asChild>{title}</DialogTitle>
            <HeaderHint />
          </DialogHeader>
          <div className="px-4 pb-4">{body}</div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto p-0 sm:max-w-[620px]"
      >
        <SheetHeader className="border-border bg-background sticky top-0 z-10 border-b px-4 py-3">
          <SheetTitle asChild>{title}</SheetTitle>
          <HeaderHint />
        </SheetHeader>
        <div className="px-4 pb-4">{body}</div>
      </SheetContent>
    </Sheet>
  );
}

function HeaderHint() {
  return (
    <p className="text-muted-foreground text-[11px]">
      2차 답안 작성 순서 — 사실관계 → 쟁점 → 1. 법조문 → 2. 법리 → 3. 사안의 포섭 →
      4. 결론
    </p>
  );
}

function ModeToggle({
  mode,
  onChange,
}: {
  mode: ViewMode;
  onChange: (m: ViewMode) => void;
}) {
  return (
    <span className="border-border ml-auto inline-flex overflow-hidden rounded-full border">
      {(
        [
          ["sheet", "시트", PanelRightIcon],
          ["dialog", "팝업", SquareIcon],
        ] as const
      ).map(([val, label, Icon]) => (
        <button
          key={val}
          type="button"
          onClick={() => onChange(val)}
          aria-pressed={mode === val}
          title={val === "sheet" ? "우측 시트로 보기" : "가운데 팝업으로 보기"}
          className={cn(
            "inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold transition-colors",
            mode === val
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted",
          )}
        >
          <Icon className="size-3" />
          {label}
        </button>
      ))}
    </span>
  );
}

function DiagramBody({
  diagram,
  draft,
  subjectSlug,
  statuteArticleIds,
}: {
  diagram: CaseDiagramView;
  draft: boolean;
  subjectSlug?: string;
  statuteArticleIds?: Record<string, StatuteRef>;
}) {
  const caption = factsSourceCaption(diagram);
  return (
    <div className="space-y-4 py-4">
      {/* 사실관계 — 판례당 1개. 2차는 이 부분을 각색해 출제된다. */}
      <section>
        <h3 className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs font-bold">
          <Badge variant="secondary" className="rounded-sm px-1.5 py-0">
            사실관계
          </Badge>
          {caption ? (
            <span className="text-muted-foreground text-[11px] font-normal">
              {caption}
            </span>
          ) : null}
        </h3>
        {diagram.factsMd.trim() ? (
          <div className="border-border bg-muted/30 diagram-facts rounded-lg border p-3">
            {/* ★markdown 으로 저장된다 — 그대로 텍스트로 뿌리면 ##·**·- 가 노출된다.
                trusted=false: 원시 HTML 을 파싱하지 않는다(도식에 HTML 은 불필요). */}
            {/* ★literalNumbering — 사실관계는 "- 2022. 1. 18. 피고, …" 처럼 날짜로
                시작하는 줄이 대부분인데, markdown 은 그 "2022." 를 번호 목록 마커로
                읽어 날짜를 통째로 빼앗아 간다(원장 지적 2026-08-20). 손으로 친 번호는
                친 그대로 표시한다. */}
            <MarkdownView
              text={stripFactsHeading(diagram.factsMd)}
              trusted={false}
              literalNumbering
              className="text-[15px] leading-[1.75]"
            />
          </div>
        ) : (
          <p className="border-border text-muted-foreground rounded-lg border border-dashed p-3 text-xs">
            이 판례는 사실관계가 아직 정리되지 않았습니다. 쟁점부터 확인하세요.
          </p>
        )}
      </section>

      {/* 경과 타임라인 — 같은 사실을 시간축으로. 2차는 출원·공지·심판의 선후가
          결론을 가르는 문항이 많아 산문만으로는 흐름이 안 잡힌다. */}
      {diagram.timeline.length > 0 ? (
        <section>
          <h3 className="mb-1.5 text-xs font-bold">
            <Badge variant="secondary" className="rounded-sm px-1.5 py-0">
              경과
            </Badge>
          </h3>
          <ol className="border-border relative ml-2 space-y-2.5 border-l pl-4">
            {diagram.timeline.map((ev, i) => (
              <li key={i} className="relative">
                <span className="bg-primary absolute top-[0.45rem] -left-[1.31rem] size-2 rounded-full ring-2 ring-[var(--background)]" />
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-link text-[13px] font-semibold tabular-nums">
                    {ev.when}
                  </span>
                  <span className="border-border text-muted-foreground rounded border px-1.5 text-[11px]">
                    {TIMELINE_KIND_LABEL[ev.kind]}
                  </span>
                </div>
                <p className="text-[15px] leading-[1.6]">{ev.what}</p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {/* 쟁점 단위 블록 — 쟁점마다 1.법조문 2.법리 3.포섭 4.결론 1세트. */}
      {diagram.blocks.map((b, i) => {
        const axes = filledAxes(b);
        return (
          <section
            key={i}
            className="border-border bg-card rounded-xl border p-3 shadow-sm"
          >
            <h3 className="mb-2 flex items-start gap-1.5 text-[15px] font-bold">
              <Badge className="mt-0.5 shrink-0 rounded-sm px-1.5 py-0">
                쟁점 {i + 1}
              </Badge>
              <span className="leading-snug">{b.issue}</span>
            </h3>

            {b.statutes.length > 0 ? (
              <Step no={0} label="법조문">
                {/* ★구법 표기는 현행 조문으로 이어진다 — 판결 당시 조문과 내용이 다를 수
                    있어 밝혀 둔다(원장 지적 2026-08-21). */}
                {b.statutes.some((s) => isOldLawLabel(s) && statuteArticleIds?.[s]) ? (
                  <p className="text-muted-foreground mb-1 text-[11px]">
                    구법 표기를 누르면 현행 조문이 열립니다
                  </p>
                ) : null}
                {/* 표기만으로는 무슨 규정인지 떠올려야 한다 — 해석된 조문은 그 자리에서
                    본문을 펼쳐 볼 수 있게 한다(원장 요청 2026-08-20). */}
                <div className="flex flex-wrap gap-1">
                  {b.statutes.map((s) => {
                    const ref = statuteArticleIds?.[s];
                    // 참조 법령(실용신안법·공정거래법 등)은 학습화면이 없어 팝업만 연다.
                    const canLink =
                      ref && (ref.kind === "reference" || Boolean(subjectSlug));
                    return canLink && ref ? (
                      <RefPreviewBadge
                        key={s}
                        kind={ref.kind}
                        refId={ref.id}
                        label={s}
                        studyHref={
                          ref.kind === "article"
                            ? `/subjects/${subjectSlug}/articles/${ref.id}`
                            : undefined
                        }
                      />
                    ) : (
                      <span
                        key={s}
                        className="border-border text-muted-foreground rounded border px-2 py-0.5 text-[13px]"
                      >
                        {s}
                      </span>
                    );
                  })}
                </div>
              </Step>
            ) : null}

            {axes.length > 0 ? (
              <Step no={1} label="법리">
                <div className="space-y-2">
                  {axes.map((ax) => (
                    <div key={ax.key}>
                      <span className="bg-primary/10 text-link rounded px-2 py-0.5 text-[12px] font-semibold">
                        {ax.label}
                      </span>
                      <p className="mt-1 text-[15px] leading-[1.75]">
                        {ax.body}
                      </p>
                    </div>
                  ))}
                </div>
              </Step>
            ) : null}

            {b.application ? (
              <Step no={2} label="사안의 포섭">
                <p className="text-[15px] leading-[1.75]">{b.application}</p>
              </Step>
            ) : null}

            {b.conclusion ? (
              <Step no={3} label="결론">
                <p className="text-[15px] leading-[1.75] font-medium">
                  {b.conclusion}
                </p>
              </Step>
            ) : null}
          </section>
        );
      })}

      {diagram.blocks.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          아직 쟁점이 정리되지 않았습니다.
        </p>
      ) : null}

      {draft ? (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400">
          검수 전 초안입니다 — 운영자에게만 보입니다.
        </p>
      ) : null}
    </div>
  );
}

/** 답안 작성 순서 단계 — 원문자는 순서가 곧 의미라 고정 인덱스로 매긴다(빈 단계도 번호 유지). */
function Step({
  no,
  label,
  children,
}: {
  no: 0 | 1 | 2 | 3;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-2">
      <p className="text-muted-foreground mb-1 flex items-center gap-1 text-[12px] font-semibold tracking-wide">
        <span className="text-link text-[14px]">{STEP_MARK[no]}</span>
        {label}
      </p>
      {children}
    </div>
  );
}
