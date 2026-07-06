// 판례 본문 렌더 — 학습과목 뷰어(case-viewer)와 학습정보 뷰어(latest-case-viewer) 공용. feat-3-205.
// highlights 를 전달하면 본문에 하이라이트 오버레이 활성(학습과목), 미전달이면 read-only(학습정보).

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  FileTextIcon,
  PencilIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { Link, useFetcher, useLocation } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Separator } from "~/core/components/ui/separator";
import { cn } from "~/core/lib/utils";
import { AskAiButton } from "~/features/ai-qna/components/ask-ai-button";
import { HighlightOverlay } from "~/features/annotations/components/highlight-overlay";
import { CaseReferencesPanel } from "~/features/cases/components/case-references-panel";
import { CiteCopyButton } from "~/features/cases/components/cite-copy";
import { ReadingControls } from "~/features/study/components/study-font-control";
import {
  ExamYearChip,
  mergeFirstRoundChips,
} from "~/features/cases/components/exam-year-chip";
import {
  COURT_LABELS,
  type BookSection,
  type BookSectionCell,
  type CaseDetail,
  type CaseImage,
  type CaseImagePosition,
  type CaseReference,
} from "~/features/cases/labels";
import {
  endsWithInlineQuote,
  isMarkdownTableParagraph,
  parseImageParagraph,
  renderTableHtml,
  startsWithInlineQuote,
} from "~/features/cases/lib/case-markdown";
import {
  relativeIndentByDepth,
  splitCaseNumbering,
} from "~/features/cases/lib/case-numbering";
import type { ExamProblemRef } from "~/features/problems/labels";

type HighlightsProp = React.ComponentProps<
  typeof HighlightOverlay
>["highlights"];

// 같은 placement 형제 case 들 사이 ←/→ 이동 데이터.
// 조문 뷰어의 PrevNextButton 과 동일한 위치(헤더 카드 상단 우측) 에 노출하기 위해
// case-viewer 가 미리 계산해 CaseBody 에 전달. latest-case-viewer 처럼 형제 정보가
// 없는 read-only 진입점에서는 미전달(null) → 버튼 미노출.
export interface CasePrevNextData {
  idx: number;
  total: number;
  prevHref: string | null;
  prevLabel: string | null;
  nextHref: string | null;
  nextLabel: string | null;
}

// 본문 뷰어 헤더의 staff 전용 "삭제" 버튼 — 수정 화면에 들어가지 않고 바로 soft delete.
// /api/admin/case (intent=delete) 가 deleted_at 설정 + audit log + redirect 처리.
// returnTo 가 viewer URL 이면 API 가 placement 노드 목록으로 자동 변환(삭제된 case 404 회피).
function CaseDeleteButton({
  caseId,
  caseNumber,
  returnTo,
}: {
  caseId: string;
  caseNumber: string;
  returnTo: string;
}) {
  const fetcher = useFetcher();
  const submitting = fetcher.state !== "idle";

  function onDelete() {
    if (
      !confirm(`판례 ${caseNumber} 을(를) 삭제하시겠습니까?\n삭제 후 목록으로 이동합니다.`)
    ) {
      return;
    }
    const fd = new FormData();
    fd.set("intent", "delete");
    fd.set("caseId", caseId);
    fd.set("returnTo", returnTo);
    fetcher.submit(fd, { method: "post", action: "/api/admin/case" });
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-7 gap-1 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/20"
      onClick={onDelete}
      disabled={submitting}
    >
      <Trash2Icon className="size-3" /> {submitting ? "삭제 중…" : "삭제"}
    </Button>
  );
}

export function CaseBody({
  kase,
  examProblems,
  references,
  canEditCase = false,
  canEditReferences = false,
  highlights,
  viewerIsStaff = false,
  prevNext = null,
  officialPdfUrl = null,
  showAskAi = true,
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
  /** 형제 case ←/→ 이동. null 이면 헤더에서 prev/next 영역 미노출. */
  prevNext?: CasePrevNextData | null;
  /** 공식 전문 PDF (signed URL, 1h). null 이면 버튼 미노출. */
  officialPdfUrl?: string | null;
  /** "질문하기" 버튼 노출. 학습과목 뷰어는 우측 패널 Q&A 와 중복이라 false. 기본 true(학습정보 read-only 등). */
  showAskAi?: boolean;
}) {
  const enableHighlights = highlights !== undefined;
  // staff "수정" 버튼 — 현재 경로(학생 판례 뷰어 / 학습정보 뷰어 등)를 returnTo 로 전달해
  // 변경 저장 후 같은 페이지로 돌아오게 한다. safeReturnTo (api/admin/case.tsx) 가 화이트리스트.
  const location = useLocation();
  const editReturnTo = `${location.pathname}${location.search}`;
  // feat-3-213 — 판례집 구조화 본문(쟁점상표/사안의 쟁점/…/평석). 있으면 교재 구조로 렌더하고
  // generic 판결요지·판시이유·비고 섹션은 생략(같은 내용의 다른 포맷이라 중복).
  const bookSections = kase.bookSections;
  const bookMode = bookSections.length > 0;
  // 본문 이미지 — position 별로 그룹화. summary/reasoning/comment 섹션 뒤에 렌더.
  // pending 은 본문 끝에 별도 섹션으로 묶음.
  // 본문 markdown 안 ![](url) 인라인 이미지로 이미 박혀 있는 url 은 그리드에서 제외 —
  // 같은 이미지가 본문 + 그리드 두 곳에 중복 표시되는 것 방지.
  // book 모드에선 쟁점상표 표 셀에 박힌 이미지도 그리드에서 제외.
  const inlineImageUrls = collectInlineImageUrls(kase);
  for (const url of collectBookSectionImageUrls(bookSections)) inlineImageUrls.add(url);
  const imagesByPosition = groupImagesByPosition(
    kase.images.filter((img) => !inlineImageUrls.has(img.url)),
  );
  // summaryItems 가 있으면 우선 사용. 없으면 legacy summary_body_md 를 한 묶음으로 폴백.
  const summaryItems =
    kase.summaryItems.length > 0
      ? kase.summaryItems
      : kase.summaryBodyMd
        ? [{ title: kase.summaryTitle ?? "", body: kase.summaryBodyMd }]
        : [];

  // 비고 분리 정책 (사용자 결정):
  //   • 항목별 비고 (summary_items[i].commentMd) → SummaryBlock 안에서 본문 바로 아래
  //     "비고 [N]" 라벨로 인라인 렌더 — 수험생이 어느 요지에 대한 코멘트인지 즉시 파악.
  //   • 전체 비고 (cases.comment_body_md) → 판결문 전체에 대한 일반 비고. 별도 섹션으로
  //     아래쪽에 노출.
  // 두 종류가 동시에 존재할 수 있다(공존). 항목별 비고 자동 조립 로직은 폐기.

  return (
    <Card className="border-border rounded-xl border shadow-sm">
      <CardHeader className="px-6 pt-6 pb-4">
        {/* ←/→ 형제 case 이동 + breadcrumb eyebrow — 조문 뷰어의 prev/next 위치와 동일.
            형제가 없거나 placement 미설정 case 면 미노출. */}
        {prevNext ? (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-3">
            <p className="text-muted-foreground text-[11px] font-semibold tracking-widest uppercase">
              판례 {prevNext.idx + 1} / {prevNext.total}
            </p>
            <div className="flex items-center gap-2">
              <CasePrevNextButton
                direction="prev"
                href={prevNext.prevHref}
                label={prevNext.prevLabel}
              />
              <CasePrevNextButton
                direction="next"
                href={prevNext.nextHref}
                label={prevNext.nextLabel}
              />
            </div>
          </div>
        ) : null}
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

          <ReadingControls className="mr-1" />

          <CiteCopyButton
            court={kase.court}
            decidedAt={kase.decidedAt}
            caseNumber={kase.caseNumber}
            caseType={kase.caseType}
            isEnBanc={kase.isEnBanc}
          />

          {/* feat-9-004 — AI Q&A 진입. 이 판례가 앵커. 학습과목 뷰어는 우측 Q&A 패널과
              중복이라 미노출(showAskAi=false), 학습정보 read-only 뷰어는 유일 진입점이라 노출. */}
          {showAskAi ? (
            <AskAiButton
              anchorType="case"
              anchorId={kase.caseId}
              seed={`${kase.caseNumber} 판례의 요지와 쟁점을 정리해줘.`}
            />
          ) : null}

          {/* 공식 전문 PDF — 국가법령정보 OPEN API 자동 생성. 모든 사용자 노출. */}
          {officialPdfUrl ? (
            <Button
              asChild
              variant="outline"
              size="sm"
              className="h-9 gap-1 text-xs sm:h-7"
            >
              <a href={officialPdfUrl} target="_blank" rel="noopener noreferrer">
                <FileTextIcon className="size-3" /> 전문 PDF
              </a>
            </Button>
          ) : null}

          {/* 운영자 — 판례 수정 + 삭제 (staff 전용, feat-7-005) */}
          {canEditCase ? (
            <>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="h-9 gap-1 text-xs sm:h-7"
              >
                <Link
                  to={`/admin/cases/edit/${kase.caseId}?returnTo=${encodeURIComponent(editReturnTo)}`}
                >
                  <PencilIcon className="size-3" /> 수정
                </Link>
              </Button>
              <CaseDeleteButton
                caseId={kase.caseId}
                caseNumber={kase.caseNumber}
                returnTo={editReturnTo}
              />
            </>
          ) : null}
        </div>

        {/* 기출 표시 — 1차는 problem link + 수동 연도 통합(연도 asc), 2차는 연도 배지 */}
        {examProblems.length +
          kase.exam1stExtraYears.length +
          kase.exam2ndYears.length >
        0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {mergeFirstRoundChips(examProblems, kase.exam1stExtraYears)}
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
        {/* feat-3-213 — 판례집 구조(쟁점상표 표 → 사안의 쟁점 → … → 평석). 상표 제16판 등. */}
        {bookMode
          ? bookSections.map((sec) => (
              <BodySection
                key={sec.key}
                title={sec.label}
                meta={sec.source ?? undefined}
              >
                <MaybeHighlight
                  on={enableHighlights}
                  fieldPath={`case.book.${sec.key}`}
                  caseId={kase.caseId}
                  highlights={highlights}
                  viewerIsStaff={viewerIsStaff}
                >
                  <div className="space-y-4">
                    {sec.blocks.map((b, i) =>
                      b.type === "table" ? (
                        <BookTable key={i} rows={b.rows} />
                      ) : (
                        <Prose key={i} text={b.text} />
                      ),
                    )}
                  </div>
                </MaybeHighlight>
              </BodySection>
            ))
          : null}

        {!bookMode && summaryItems.length > 0 ? (
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
                    commentMd={it.commentMd}
                    showLabel={summaryItems.length > 1}
                    index={i}
                    caseTitle={kase.caseTitle}
                  />
                ))}
              </div>
            </MaybeHighlight>
            <CaseImagesGrid images={imagesByPosition.summary} />
          </BodySection>
        ) : null}

        {!bookMode && kase.reasoningMd ? (
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
            <CaseImagesGrid images={imagesByPosition.reasoning} />
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

        {!bookMode && kase.commentBodyMd ? (
          <BodySection title="비고 (전체 판결문)">
            <MaybeHighlight
              on={enableHighlights}
              fieldPath="case.comment"
              caseId={kase.caseId}
              highlights={highlights}
              viewerIsStaff={viewerIsStaff}
            >
              <Prose text={kase.commentBodyMd} />
            </MaybeHighlight>
            <CaseImagesGrid images={imagesByPosition.comment} />
          </BodySection>
        ) : null}

        {/* 관련자료 — 본문(텍스트) 또는 이미지(그림·표) 하나라도 있으면 표시.
            본문은 case.related fieldPath 로 하이라이트 활성, 그림은 그 아래 그리드. */}
        {kase.relatedMd || imagesByPosition.related.length > 0 ? (
          <BodySection title="관련자료">
            {kase.relatedMd ? (
              <MaybeHighlight
                on={enableHighlights}
                fieldPath="case.related"
                caseId={kase.caseId}
                highlights={highlights}
                viewerIsStaff={viewerIsStaff}
              >
                <Prose text={kase.relatedMd} />
              </MaybeHighlight>
            ) : null}
            <CaseImagesGrid images={imagesByPosition.related} />
          </BodySection>
        ) : null}

        {imagesByPosition.pending.length > 0 ? (
          <BodySection title="첨부 이미지">
            <CaseImagesGrid images={imagesByPosition.pending} />
          </BodySection>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ── ←/→ 사건번호 이동 버튼 ─────────────────────────────────────
// 조문 뷰어의 PrevNextButton 과 같은 톤 — 카드 헤더 안 우측, rounded-full border,
// 사건번호 mono, href=null → disabled "처음" / "마지막" pill.
function CasePrevNextButton({
  direction,
  href,
  label,
}: {
  direction: "prev" | "next";
  href: string | null;
  label: string | null;
}) {
  const Icon = direction === "prev" ? ChevronLeftIcon : ChevronRightIcon;
  const aria = direction === "prev" ? "이전 판례" : "다음 판례";
  if (!href || !label) {
    return (
      <button
        type="button"
        disabled
        aria-label={aria}
        className="border-border bg-background text-muted-foreground inline-flex h-8 cursor-not-allowed items-center gap-1 rounded-full border px-3 text-xs opacity-40"
      >
        {direction === "prev" ? <Icon className="size-3.5" /> : null}
        <span>{direction === "prev" ? "처음" : "마지막"}</span>
        {direction === "next" ? <Icon className="size-3.5" /> : null}
      </button>
    );
  }
  return (
    <Link
      to={href}
      viewTransition
      aria-label={`${aria}: ${label}`}
      className="border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground inline-flex h-8 items-center gap-1 rounded-full border px-3 font-mono text-[12px] font-semibold transition-colors"
    >
      {direction === "prev" ? <Icon className="size-3.5 shrink-0" /> : null}
      <span className="max-w-[120px] truncate">{label}</span>
      {direction === "next" ? <Icon className="size-3.5 shrink-0" /> : null}
    </Link>
  );
}

// ── 본문 이미지 그리드 ───────────────────────────────────────
// 자연스러운 흐름: lightbox 없이 클릭 시 새 탭으로. 객체 비율 보존(object-contain),
// 흰 배경(상표·도형 투명 PNG 대응). alt 캡션은 이미지 아래.
function CaseImagesGrid({ images }: { images: CaseImage[] }) {
  if (images.length === 0) return null;
  return (
    <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
      {images.map((img) => (
        <li
          key={img.id}
          className="border-border bg-card overflow-hidden rounded-lg border"
        >
          <a
            href={img.url}
            target="_blank"
            rel="noreferrer"
            className="block aspect-[4/3] bg-white"
          >
            <img
              src={img.url}
              alt={img.alt}
              loading="lazy"
              className="h-full w-full object-contain"
            />
          </a>
          {img.alt ? (
            <p className="text-muted-foreground border-border border-t px-3 py-2 text-xs leading-relaxed">
              {img.alt}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

// ── feat-3-213: 판례집 구조화 표 (쟁점상표 도표·사실관계 도식) ─────────────
// 첫 행 = 헤더(구분/등록상표/지정상품…), 셀에 상표 도형 이미지 포함 가능.
// 이미지 셀: 흰 배경 + object-contain (투명 GIF/도형 대응), 클릭 시 원본 새 탭.
function BookTable({ rows }: { rows: BookSectionCell[][] }) {
  if (rows.length === 0) return null;
  const [head, ...body] = rows;
  return (
    <div className="overflow-x-auto">
      <table className="border-border w-full border-collapse text-[length:calc(15px*var(--study-fs))]">
        <thead>
          <tr>
            {head.map((c, i) => (
              <th
                key={i}
                className="border-border bg-muted/60 text-foreground border px-3 py-2 text-center text-[13px] font-bold whitespace-nowrap"
              >
                <BookCell cell={c} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri}>
              {row.map((c, ci) => (
                <td
                  key={ci}
                  className={cn(
                    "border-border border px-3 py-2 align-middle leading-relaxed",
                    // 첫 열(라벨: 상표/출원일/권리자 등)은 헤더 톤
                    ci === 0 && row.length > 1
                      ? "bg-muted/40 text-center text-[13px] font-semibold whitespace-nowrap"
                      : "text-left",
                  )}
                >
                  <BookCell cell={c} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BookCell({ cell }: { cell: BookSectionCell }) {
  return (
    <div className="space-y-1.5">
      {cell.text ? <span className="whitespace-pre-wrap">{cell.text}</span> : null}
      {cell.images.map((img, i) => (
        <a
          key={i}
          href={img.url}
          target="_blank"
          rel="noreferrer"
          className="mx-auto block w-fit rounded bg-white p-1"
        >
          <img
            src={img.url}
            alt={img.alt}
            loading="lazy"
            className="max-h-[140px] w-auto object-contain"
          />
        </a>
      ))}
    </div>
  );
}

// book_sections 표 셀에 박힌 이미지 url — 하단 그리드 중복 제거에 사용.
function collectBookSectionImageUrls(sections: BookSection[]): Set<string> {
  const out = new Set<string>();
  for (const s of sections) {
    for (const b of s.blocks) {
      if (b.type !== "table") continue;
      for (const row of b.rows) for (const c of row) for (const im of c.images) out.add(im.url);
    }
  }
  return out;
}

// 본문 markdown 의 ![](url) 인라인 이미지 url 들 — 그리드 중복 제거에 사용.
// summary_items.body + summary_body_md + reasoning_md + comment_body_md + related_md 까지
// 한 case 의 모든 본문 텍스트에서 추출.
function collectInlineImageUrls(kase: CaseDetail): Set<string> {
  const re = /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  const out = new Set<string>();
  const bodies: string[] = [
    kase.summaryBodyMd ?? "",
    kase.reasoningMd ?? "",
    kase.commentBodyMd ?? "",
    kase.relatedMd ?? "",
    ...kase.summaryItems.map((it) => it.body ?? ""),
  ];
  for (const b of bodies) {
    if (!b) continue;
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(b)) !== null) out.add(m[1]);
  }
  return out;
}

// position 별 그룹화 — case-body 헤더와 각 본문 섹션에서 사용.
function groupImagesByPosition(
  images: CaseImage[],
): Record<CaseImagePosition, CaseImage[]> {
  const out: Record<CaseImagePosition, CaseImage[]> = {
    summary: [],
    reasoning: [],
    comment: [],
    related: [],
    pending: [],
  };
  for (const img of images) out[img.position].push(img);
  return out;
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
        <h2 className="text-link font-mono text-[11px] font-bold tracking-widest uppercase">
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

// ── 판결요지 단일 항목 ([N] 라벨 + 본문 + 항목별 비고) ───────
// 파서는 title 앞에 "[1] " 같은 prefix 를 이미 붙여 두지만, 여러 항목일 때 시각적 라벨 분리.
// caseTitle prop 은 호환성 위해 유지하되 사용 안 함 — 학생/공개 case header 에 case_title 이
// 표시되지 않으므로 "헤더와 중복" 휴리스틱이 오작동했음(2001후2238 처럼 case_title 과
// summary[0].title 이 동일하면 박스 안 제목이 통째로 사라지던 버그). 항상 표시한다.
//
// commentMd — 항목별 비고. 같은 인덱스의 소제목·본문에 직접 매칭되는 코멘트.
// 비고가 있으면 본문 아래에 amber 강조 카드로 인라인 렌더 ("비고 [N]" 라벨).
// 수험생이 "어느 비고가 어느 요지에 대한 것인지" 직관적으로 파악 가능.
// textContent 흐름: title + body + commentMd. 기존 case.summary 하이라이트는
// recompute-summary-highlights 스크립트로 새 offset 으로 재정렬됨.
function SummaryBlock({
  title,
  body,
  commentMd,
  showLabel,
  index,
  caseTitle: _caseTitle,
}: {
  title: string;
  body: string;
  commentMd?: string;
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
  const shownTitle = displayTitle;
  // label 의 [N] 표기에서 숫자만 추출 — 박스형 제목 배지에는 숫자만 보이게.
  const labelNumber = label ? label.replace(/[^\d]/g, "") : null;
  const hasComment = !!commentMd && commentMd.trim() !== "";
  return (
    <div className="space-y-2">
      {label || shownTitle ? (
        // 박스형 제목 — 본문과 시각 구분 + 줄간격(1.75)을 본문(1.8)과 비슷하게.
        // 옅은 outline + 거의 흰 배경 (minimal), 연한 파란 라벨 배지(blue-500).
        <div className="border-border bg-muted/40 rounded-lg border px-3.5 py-2.5 dark:bg-zinc-900/40">
          <p className="text-foreground text-[length:calc(16px*var(--study-fs))] leading-[1.75] font-bold tracking-tight">
            {labelNumber ? (
              <span className="bg-primary/85 mr-2 inline-flex items-center rounded px-1.5 align-[2px] font-mono text-[11.5px] font-extrabold text-white">
                {labelNumber}
              </span>
            ) : null}
            {renderWithUnderline(shownTitle)}
          </p>
        </div>
      ) : null}
      {body ? <Prose text={body} /> : null}
      {hasComment ? (
        // 항목별 비고 — `<details>` 펼침형 (사용자 결정: 디자인 옵션 F).
        // 기본 펼침. 헤더 좌측 chevron 이 펼침 상태에 따라 회전.
        // textContent 흐름 — `<details>` 가 닫혀도 child 텍스트는 DOM 에 그대로 있어
        // case.summary 컨테이너의 textContent 가 변하지 않음 → 하이라이트 안정.
        <details
          className="group/comment border-border bg-card mt-3 rounded-md border"
          open
        >
          <summary className="bg-muted/40 flex cursor-pointer items-center gap-2 rounded-t-md px-3.5 py-2 select-none [&::-webkit-details-marker]:hidden">
            <ChevronRightIcon className="text-muted-foreground size-3 shrink-0 transition-transform group-open/comment:rotate-90" />
            <span className="bg-primary text-primary-foreground inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wider">
              비고{labelNumber ? ` ${labelNumber}` : ""}
            </span>
            <span className="text-muted-foreground text-[11px]">
              이 요지에 대한 코멘트
            </span>
          </summary>
          <div className="border-border border-t px-4 py-3">
            <Prose text={commentMd!} />
          </div>
        </details>
      ) : null}
    </div>
  );
}

// ── 본문 텍스트 렌더러 ────────────────────────────────────────
// generous reading size (~17px / 1.8 leading) per design brief §4.2
// 원 소스(HWPX)의 underline 영역은 `<u>...</u>` 마커로 들어오며, 여기서 React `<u>`
// element 로 풀어 시각적 밑줄로 표시한다. 마커 외의 HTML 태그는 들어오지 않는다는
// 전제 — 파서가 `<u>` 만 입력한다 — 이라 dangerouslySetInnerHTML 은 쓰지 않는다.
// admin-case-edit 의 라이브 preview 에서도 사용하므로 export.
//
// 인라인 임베드 이미지 — `"…"\n\n![](url)\n\n"…"` 패턴(image-only paragraph 가
// 따옴표류로 끝나는 앞 paragraph 와 따옴표류로 시작하는 뒤 paragraph 사이에
// 끼인 경우)을 한 paragraph 로 병합해 텍스트 흐름 안에 작은 글리프로 렌더한다.
// staff highlight 의 textContent 흐름은 image 의 alt 가 "" 이면 변동 없음
// (figcaption 도 alt 빈에서는 미렌더) — offset 정합성 유지.
type ProseBlock =
  | {
      kind: "para";
      parts: (
        | { kind: "text"; text: string }
        | { kind: "inlineImg"; alt: string; url: string }
      )[];
    }
  | { kind: "blockImg"; alt: string; url: string }
  | { kind: "table"; markdown: string };

function buildProseBlocks(text: string): ProseBlock[] {
  const paras = text.split(/\n{2,}/).filter((s) => s.trim() !== "");
  const blocks: ProseBlock[] = [];
  for (let i = 0; i < paras.length; i++) {
    const p = paras[i];
    const img = parseImageParagraph(p);
    if (img) {
      // 인라인 임베드 검출 — 직전이 텍스트 paragraph 이고 따옴표로 끝나며,
      // 다음이 따옴표로 시작하는 텍스트 paragraph 일 때만 병합.
      const prev = blocks.length > 0 ? blocks[blocks.length - 1] : null;
      const next = paras[i + 1] ?? null;
      const prevLast =
        prev && prev.kind === "para"
          ? prev.parts[prev.parts.length - 1]
          : null;
      const prevText =
        prevLast && prevLast.kind === "text" ? prevLast.text : null;
      const nextIsText = next != null && parseImageParagraph(next) == null;
      if (
        prev &&
        prev.kind === "para" &&
        prevText != null &&
        endsWithInlineQuote(prevText) &&
        nextIsText &&
        next != null &&
        startsWithInlineQuote(next)
      ) {
        prev.parts.push({ kind: "inlineImg", alt: img.alt, url: img.url });
        prev.parts.push({ kind: "text", text: next });
        i += 1; // skip the next paragraph — consumed.
        continue;
      }
      blocks.push({ kind: "blockImg", alt: img.alt, url: img.url });
      continue;
    }
    if (isMarkdownTableParagraph(p)) {
      blocks.push({ kind: "table", markdown: p });
      continue;
    }
    blocks.push({ kind: "para", parts: [{ kind: "text", text: p }] });
  }
  return blocks;
}

export function Prose({ text }: { text: string }) {
  // paragraph 분리는 DB 본문의 `\n\n` 만으로 결정 — staff 가 admin-case-edit 에서 입력한 그대로.
  // 각 paragraph 의 타입을 한 번 분기:
  //   - 이미지 단독(`![alt](url)`) → 따옴표 컨텍스트면 인라인 임베드, 아니면 <img> 블록
  //   - GFM 표 → <table> 블록 (sanitized HTML). 표 cell 텍스트가 textContent 흐름에
  //     추가되므로 표 후속의 staff highlight offset 은 staff 가 새로 그을 때 정합
  //   - 그 외 → 텍스트 + `<u>` 마커 (기존 동작)
  const blocks = buildProseBlocks(text);
  return (
    <div className="case-prose text-foreground mx-auto max-w-[800px] space-y-3 text-[length:calc(17px*var(--study-fs))] leading-[1.8] tracking-[-0.005em]">
      {blocks.map((b, i) => {
        if (b.kind === "blockImg")
          return <InlineImage key={i} alt={b.alt} url={b.url} />;
        if (b.kind === "table") return <InlineTable key={i} markdown={b.markdown} />;
        return (
          // whitespace-pre-wrap — 연속 공백 + 줄넘김 모두 보존(타이핑 그대로 렌더).
          <p key={i} className="whitespace-pre-wrap">
            {b.parts.map((part, j) =>
              part.kind === "text" ? (
                <Fragment key={j}>{renderNumberedText(part.text)}</Fragment>
              ) : (
                <EmbeddedInlineImage key={j} alt={part.alt} url={part.url} />
              ),
            )}
          </p>
        );
      })}
    </div>
  );
}

// 인라인 임베드 이미지 — 따옴표 컨텍스트로 검출된 글리프성 이미지.
// figure/보더/배경 없이 텍스트 line-height 에 맞춘 작은 inline element.
// 클릭 시 원본을 새 탭에서 열어 확대 확인 가능. alt 가 있으면 title 로 노출
// (캡션 노출은 인라인 흐름을 깨므로 생략 — 그래도 a11y/툴팁은 유지).
function EmbeddedInlineImage({ alt, url }: { alt: string; url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="mx-0.5 inline-flex items-center align-middle"
      title={alt || undefined}
    >
      <img
        src={url}
        alt={alt}
        loading="lazy"
        className="inline-block max-h-[1.8em] w-auto object-contain align-middle"
      />
    </a>
  );
}

// 이미지 단독 paragraph — clickable(새 탭) + 흰 배경 + object-contain.
// CaseImagesGrid 의 단일 이미지 카드와 동일 톤이지만 본문 흐름 안에 인라인 배치.
function InlineImage({ alt, url }: { alt: string; url: string }) {
  return (
    <figure className="my-2">
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="border-border bg-white block overflow-hidden rounded-lg border"
      >
        <img
          src={url}
          alt={alt}
          loading="lazy"
          className="mx-auto block max-h-[480px] w-auto object-contain"
        />
      </a>
      {alt ? (
        <figcaption className="text-muted-foreground mt-1.5 text-center text-xs leading-relaxed">
          {alt}
        </figcaption>
      ) : null}
    </figure>
  );
}

// GFM 표 paragraph — sanitized HTML 로 변환 후 dangerouslySetInnerHTML.
// renderTableHtml 의 DOMPurify whitelist 가 table 관련 태그만 허용.
// 셀 안 <img> 는 셀 너비에 맞춰 contain, 높이 160px 상한 — 표가 거대해지지 않게.
function InlineTable({ markdown }: { markdown: string }) {
  const html = renderTableHtml(markdown);
  return (
    <div
      className="case-md-table my-3 overflow-x-auto [&_img]:mx-auto [&_img]:block [&_img]:max-h-[160px] [&_img]:w-auto [&_img]:object-contain"
      // 허용 태그 제한 + isomorphic-dompurify sanitize — 안전.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// 넘버링 자동 정렬 — 판결문 계층 마커("1." "가." "1)" "(1)" 등) 앞에서 시각적
// 줄바꿈 + 깊이별 들여쓰기. ★문자 불변: 세그먼트는 원문 부분 문자열 그대로라
// textContent 흐름이 동일 → 하이라이트(offset 기반) 정합 유지. 줄바꿈은 block
// span 렌더로만 표현하고 문자를 넣지 않는다.
function renderNumberedText(text: string): ReactNode {
  const segments = splitCaseNumbering(text);
  if (segments.length === 1 && segments[0].depth === null) {
    return renderWithUnderline(text);
  }
  // 들여쓰기 = 문단 내 상대 층위(rank) 기준 — "(1)(2)(3)" 만 있는 문단이
  // 절대 계층(depth 4)대로 4단씩 밀리지 않게 한 글자(14px) 단위로만 구분.
  const indentByDepth = relativeIndentByDepth(segments);
  return segments.map((seg, i) => {
    if (seg.depth === null) {
      // 마커 없는 선행 세그먼트 — 흐름 그대로.
      return (
        <Fragment key={`seg-${i}`}>{renderWithUnderline(seg.text)}</Fragment>
      );
    }
    return (
      <span
        key={`seg-${i}`}
        className={cn("block", i > 0 && "mt-1.5")}
        style={{ paddingLeft: indentByDepth.get(seg.depth) ?? 0 }}
      >
        {renderWithUnderline(seg.text)}
      </span>
    );
  });
}

// `<u>...</u>` 마커를 React fragment + <u> element 시퀀스로 변환.
// HighlightOverlay 는 CSS Highlight API 기반(DOM 누적 text-node offset)이라 `<u>`
// element 가 끼어들어도 textContent 시퀀스는 동일 — 하이라이트 offset 정합성 유지.
function renderWithUnderline(text: string): ReactNode {
  if (!text) return null;
  if (!text.includes("<u>")) return text;
  const parts: ReactNode[] = [];
  const re = /<u>([\s\S]*?)<\/u>/g;
  let cursor = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > cursor) parts.push(text.slice(cursor, m.index));
    parts.push(
      <u
        key={`u-${m.index}`}
        className="decoration-foreground/70 underline decoration-[1.5px] underline-offset-[3px]"
      >
        {m[1]}
      </u>,
    );
    cursor = m.index + m[0].length;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}
