// 판례 본문 렌더 — 학습과목 뷰어(case-viewer)와 학습정보 뷰어(latest-case-viewer) 공용. feat-3-205.
// highlights 를 전달하면 본문에 하이라이트 오버레이 활성(학습과목), 미전달이면 read-only(학습정보).

import { FileTextIcon, PencilIcon, StarIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Separator } from "~/core/components/ui/separator";
import { cn } from "~/core/lib/utils";
import { AskAiButton } from "~/features/ai-qna/components/ask-ai-button";
import { HighlightOverlay } from "~/features/annotations/components/highlight-overlay";
import { CaseReferencesPanel } from "~/features/cases/components/case-references-panel";
import { CiteCopyButton } from "~/features/cases/components/cite-copy";
import {
  ExamProblemChip,
  ExamYearChip,
} from "~/features/cases/components/exam-year-chip";
import {
  COURT_LABELS,
  type CaseDetail,
  type CaseReference,
} from "~/features/cases/labels";
import { reflowNumberingSafe } from "~/features/cases/lib/reflow-numbering";
import type { ExamProblemRef } from "~/features/problems/labels";

type HighlightsProp = React.ComponentProps<
  typeof HighlightOverlay
>["highlights"];

export function CaseBody({
  kase,
  examProblems,
  references,
  canEditCase = false,
  canEditReferences = false,
  highlights,
  viewerIsStaff = false,
}: {
  kase: CaseDetail;
  examProblems: ExamProblemRef[];
  references: CaseReference[];
  /** 운영자 — 헤더에 "수정" 버튼 노출 (학습과목 뷰어). */
  canEditCase?: boolean;
  /** 운영자 — 관련문헌 인라인 편집 (학습과목 뷰어). */
  canEditReferences?: boolean;
  /** 전달 시 본문 하이라이트 오버레이 활성(학습과목). 미전달이면 read-only(학습정보). */
  highlights?: HighlightsProp;
  viewerIsStaff?: boolean;
}) {
  const enableHighlights = highlights !== undefined;
  // summaryItems 가 있으면 우선 사용. 없으면 legacy summary_body_md 를 한 묶음으로 폴백.
  const summaryItems =
    kase.summaryItems.length > 0
      ? kase.summaryItems
      : kase.summaryBodyMd
        ? [{ title: kase.summaryTitle ?? "", body: kase.summaryBodyMd }]
        : [];

  return (
    <Card className="border-border rounded-xl border shadow-sm">
      <CardHeader className="px-6 pt-6 pb-4">
        {/* 판례 닉네임 — 중요 판례의 통칭(예: 수지상 세포 사건). 선택. */}
        {kase.nickname ? (
          <p className="mb-1.5 text-[13px] font-bold tracking-tight text-amber-700 dark:text-amber-400">
            {kase.nickname}
          </p>
        ) : null}
        {/* 메타 행: 법원 · 사건번호 · 유형 · 전합 · 중요도 · 선고일 · 복사 버튼 */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 법원 — violet 톤 */}
          <span className="text-[13px] font-bold tracking-tight text-violet-600 dark:text-violet-400">
            {COURT_LABELS[kase.court]}
          </span>

          {/* 사건번호 — mono, 강조 */}
          <span className="text-foreground font-mono text-[14px] font-bold tracking-tight tabular-nums">
            {kase.caseNumber}
          </span>

          {/* 사건유형 */}
          {kase.caseType ? (
            <Badge
              variant="secondary"
              className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
            >
              {kase.caseType}
            </Badge>
          ) : null}

          {/* 전원합의체 — brand blue */}
          {kase.isEnBanc ? (
            <Badge
              variant="default"
              className="bg-primary text-primary-foreground rounded-full px-2.5 py-0.5 text-[11px] font-bold"
            >
              전합
            </Badge>
          ) : null}

          {/* 중요도 별 */}
          {kase.importance > 0 ? (
            <ImportanceStars level={kase.importance} />
          ) : null}

          {/* 선고일 */}
          <span className="text-muted-foreground ml-auto text-xs tabular-nums">
            선고일 {kase.decidedAt}
          </span>

          <CiteCopyButton
            court={kase.court}
            decidedAt={kase.decidedAt}
            caseNumber={kase.caseNumber}
            caseType={kase.caseType}
            isEnBanc={kase.isEnBanc}
          />

          {/* feat-9-004 — AI Q&A 진입. 이 판례가 앵커. */}
          <AskAiButton
            anchorType="case"
            anchorId={kase.caseId}
            seed={`${kase.caseNumber} 판례의 요지와 쟁점을 정리해줘.`}
          />

          {/* 운영자 — 판례 수정 (staff 전용, feat-7-005) */}
          {canEditCase ? (
            <Button
              asChild
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-xs"
            >
              <Link to={`/admin/cases/edit/${kase.caseId}`}>
                <PencilIcon className="size-3" /> 수정
              </Link>
            </Button>
          ) : null}
        </div>

        {/* 기출 표시 — 1차는 출제 기출문제 칩(feat-8-024), 2차는 연도 배지 */}
        {examProblems.length + kase.exam2ndYears.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {Array.from(
              new Map(examProblems.map((ep) => [ep.year, ep])).values(),
            )
              .sort((a, b) => (a.year ?? 0) - (b.year ?? 0))
              .map((ep) => (
                <ExamProblemChip
                  key={ep.problemId}
                  lawCode={ep.lawCode}
                  problemId={ep.problemId}
                  year={ep.year}
                />
              ))}
            {[...kase.exam2ndYears]
              .sort((a, b) => a - b)
              .map((y) => (
                <ExamYearChip key={`2-${y}`} round="second" year={y} />
              ))}
          </div>
        ) : null}
      </CardHeader>

      <Separator />

      {/* 본문 섹션들 */}
      <CardContent className="space-y-8 px-6 py-7">
        {summaryItems.length > 0 ? (
          <BodySection title="판결요지">
            <MaybeHighlight
              on={enableHighlights}
              fieldPath="case.summary"
              caseId={kase.caseId}
              highlights={highlights}
              viewerIsStaff={viewerIsStaff}
            >
              <div className="space-y-5">
                {summaryItems.map((it, i) => (
                  <SummaryBlock
                    key={i}
                    title={it.title}
                    body={it.body}
                    showLabel={summaryItems.length > 1}
                    index={i}
                    caseTitle={kase.caseTitle}
                  />
                ))}
              </div>
            </MaybeHighlight>
          </BodySection>
        ) : null}

        {kase.reasoningMd ? (
          <BodySection title="판시이유">
            <MaybeHighlight
              on={enableHighlights}
              fieldPath="case.reasoning"
              caseId={kase.caseId}
              highlights={highlights}
              viewerIsStaff={viewerIsStaff}
            >
              <Prose text={kase.reasoningMd} />
            </MaybeHighlight>
          </BodySection>
        ) : null}

        {kase.fullTextPdf ? (
          <BodySection title="판결전문 PDF">
            <div className="space-y-3">
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                asChild
              >
                <a href={kase.fullTextPdf} target="_blank" rel="noreferrer">
                  <FileTextIcon className="size-3.5" /> 새 탭에서 열기
                </a>
              </Button>
              {/* PDF placeholder 영역 — 점선 박스 */}
              <div className="border-border bg-muted/40 flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center">
                <FileTextIcon className="text-muted-foreground/50 size-6" />
                <p className="text-muted-foreground text-sm">판결전문 PDF</p>
              </div>
              <iframe
                title="판결전문 PDF"
                src={kase.fullTextPdf}
                className="border-border h-[80vh] w-full rounded-xl border"
                loading="lazy"
              />
            </div>
          </BodySection>
        ) : null}

        {references.length > 0 || canEditReferences ? (
          <CaseReferencesPanel
            caseId={kase.caseId}
            references={references}
            canEdit={canEditReferences}
          />
        ) : null}

        {kase.commentBodyMd ? (
          <BodySection title="비고">
            {/* 출처 박스 */}
            {kase.commentSource ? (
              <div className="border-border bg-muted/60 mb-3 rounded-lg border px-4 py-3">
                <p className="text-muted-foreground mb-0.5 font-mono text-[10px] font-bold tracking-widest uppercase">
                  출처
                </p>
                <p className="text-muted-foreground text-sm">
                  {kase.commentSource}
                </p>
              </div>
            ) : null}
            <MaybeHighlight
              on={enableHighlights}
              fieldPath="case.comment"
              caseId={kase.caseId}
              highlights={highlights}
              viewerIsStaff={viewerIsStaff}
            >
              <Prose text={kase.commentBodyMd} />
            </MaybeHighlight>
          </BodySection>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ── 하이라이트 오버레이 조건부 래퍼 ───────────────────────────
// on=false(학습정보 read-only)면 children 만, on=true(학습과목)면 HighlightOverlay 로 감싼다.
function MaybeHighlight({
  on,
  fieldPath,
  caseId,
  highlights,
  viewerIsStaff,
  children,
}: {
  on: boolean;
  fieldPath: string;
  caseId: string;
  highlights: HighlightsProp | undefined;
  viewerIsStaff: boolean;
  children: ReactNode;
}) {
  if (!on || highlights === undefined) return <>{children}</>;
  return (
    <HighlightOverlay
      fieldPath={fieldPath}
      targetType="case"
      targetId={caseId}
      highlights={highlights}
      viewerIsStaff={viewerIsStaff}
    >
      {children}
    </HighlightOverlay>
  );
}

// ── 중요도 별 인디케이터 ─────────────────────────────────────
function ImportanceStars({ level }: { level: number }) {
  return (
    <span
      className="inline-flex items-center gap-0.5"
      aria-label={`중요도 ${level}성`}
    >
      {[0, 1, 2].map((i) => (
        <StarIcon
          key={i}
          className={cn(
            "size-3",
            i < level
              ? "fill-amber-400 text-amber-400"
              : "fill-none text-amber-300",
          )}
        />
      ))}
    </span>
  );
}

// ── 본문 섹션 래퍼 — eyebrow 라벨 + 콘텐츠 슬롯 ──────────────
function BodySection({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-3">
        <h2 className="text-primary font-mono text-[11px] font-bold tracking-widest uppercase">
          {title}
        </h2>
        {meta ? (
          <span className="text-muted-foreground text-xs">출처: {meta}</span>
        ) : null}
      </div>
      <div className="border-border/60 border-t" />
      {children}
    </section>
  );
}

// ── 판결요지 단일 항목 ([N] 라벨 + 본문) ─────────────────────
// 파서는 title 앞에 "[1] " 같은 prefix 를 이미 붙여 두지만, 여러 항목일 때 시각적 라벨 분리.
// caseTitle 과 displayTitle 이 동일하면 헤더와 중복이라 제목은 숨기고 본문만 표시.
function SummaryBlock({
  title,
  body,
  showLabel,
  index,
  caseTitle,
}: {
  title: string;
  body: string;
  showLabel: boolean;
  index: number;
  caseTitle: string;
}) {
  let label: string | null = null;
  let displayTitle = title;
  const m = title.match(/^\[(\d+)\]\s*(.*)$/);
  if (m) {
    label = `[${m[1]}]`;
    displayTitle = m[2];
  }
  if (showLabel && !label) {
    label = `[${index + 1}]`;
  }
  const duplicatesHeader =
    displayTitle.trim() !== "" && displayTitle.trim() === caseTitle.trim();
  const shownTitle = duplicatesHeader ? "" : displayTitle;
  return (
    <div className="space-y-2">
      {label || shownTitle ? (
        <p className="text-[16px] leading-snug font-bold tracking-tight">
          {label ? (
            <span className="text-primary mr-1.5 font-mono">{label}</span>
          ) : null}
          {shownTitle}
        </p>
      ) : null}
      {body ? <Prose text={body} /> : null}
    </div>
  );
}

// ── 본문 텍스트 렌더러 ────────────────────────────────────────
// generous reading size (~17px / 1.8 leading) per design brief §4.2
function Prose({ text }: { text: string }) {
  const paras = reflowNumberingSafe(text)
    .split(/\n{2,}/)
    .filter((s) => s.trim() !== "");
  return (
    <div className="text-foreground/90 dark:text-foreground/85 space-y-3 text-[17px] leading-[1.8] tracking-[-0.005em]">
      {paras.map((p, i) => (
        <p key={i} className="whitespace-pre-line">
          {p}
        </p>
      ))}
    </div>
  );
}
