// 판례 본문 렌더 — 학습과목 뷰어(case-viewer)와 학습정보 뷰어(latest-case-viewer) 공용. feat-3-205.
// highlights 를 전달하면 본문에 하이라이트 오버레이 활성(학습과목), 미전달이면 read-only(학습정보).

import { FileTextIcon, PencilIcon, StarIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router";

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
  type CaseImage,
  type CaseImagePosition,
  type CaseReference,
} from "~/features/cases/labels";
import {
  isMarkdownTableParagraph,
  parseImageParagraph,
  renderTableHtml,
} from "~/features/cases/lib/case-markdown";
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
  // staff "수정" 버튼 — 현재 경로(학생 판례 뷰어 / 학습정보 뷰어 등)를 returnTo 로 전달해
  // 변경 저장 후 같은 페이지로 돌아오게 한다. safeReturnTo (api/admin/case.tsx) 가 화이트리스트.
  const location = useLocation();
  const editReturnTo = `${location.pathname}${location.search}`;
  // 본문 이미지 — position 별로 그룹화. summary/reasoning/comment 섹션 뒤에 렌더.
  // pending 은 본문 끝에 별도 섹션으로 묶음.
  // 본문 markdown 안 ![](url) 인라인 이미지로 이미 박혀 있는 url 은 그리드에서 제외 —
  // 같은 이미지가 본문 + 그리드 두 곳에 중복 표시되는 것 방지.
  const inlineImageUrls = collectInlineImageUrls(kase);
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
              <Link
                to={`/admin/cases/edit/${kase.caseId}?returnTo=${encodeURIComponent(editReturnTo)}`}
              >
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
            <CaseImagesGrid images={imagesByPosition.summary} />
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

        {kase.commentBodyMd ? (
          <BodySection title="비고">
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
  // 제목 중복 비교는 underline 마커를 무시한 plain 텍스트 기준.
  const titleStripped = displayTitle.replace(/<\/?u>/g, "").trim();
  const duplicatesHeader =
    titleStripped !== "" && titleStripped === caseTitle.trim();
  const shownTitle = duplicatesHeader ? "" : displayTitle;
  // label 의 [N] 표기에서 숫자만 추출 — 박스형 제목 배지에는 숫자만 보이게.
  const labelNumber = label ? label.replace(/[^\d]/g, "") : null;
  return (
    <div className="space-y-2">
      {label || shownTitle ? (
        // 박스형 제목 — 본문과 시각 구분 + 줄간격(1.75)을 본문(1.8)과 비슷하게.
        // 옅은 outline + 거의 흰 배경 (minimal), 연한 파란 라벨 배지(blue-500).
        <div className="border-border bg-muted/40 rounded-lg border px-3.5 py-2.5 dark:bg-zinc-900/40">
          <p className="text-foreground text-[16px] leading-[1.75] font-bold tracking-tight">
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
    </div>
  );
}

// ── 본문 텍스트 렌더러 ────────────────────────────────────────
// generous reading size (~17px / 1.8 leading) per design brief §4.2
// 원 소스(HWPX)의 underline 영역은 `<u>...</u>` 마커로 들어오며, 여기서 React `<u>`
// element 로 풀어 시각적 밑줄로 표시한다. 마커 외의 HTML 태그는 들어오지 않는다는
// 전제 — 파서가 `<u>` 만 입력한다 — 이라 dangerouslySetInnerHTML 은 쓰지 않는다.
// admin-case-edit 의 라이브 preview 에서도 사용하므로 export.
export function Prose({ text }: { text: string }) {
  // paragraph 분리는 DB 본문의 `\n\n` 만으로 결정 — staff 가 admin-case-edit 에서 입력한 그대로.
  // 각 paragraph 의 타입을 한 번 분기:
  //   - 이미지 단독(`![alt](url)`) → <img> 블록 (staff highlight 의 textContent 흐름에
  //     "" 만 기여하므로 기존 offset 영향 없음)
  //   - GFM 표 → <table> 블록 (sanitized HTML). 표 cell 텍스트가 textContent 흐름에
  //     추가되므로 표 후속의 staff highlight offset 은 staff 가 새로 그을 때 정합
  //   - 그 외 → 텍스트 + `<u>` 마커 (기존 동작)
  const paras = text.split(/\n{2,}/).filter((s) => s.trim() !== "");
  return (
    <div className="text-foreground/90 dark:text-foreground/85 space-y-3 text-[17px] leading-[1.8] tracking-[-0.005em]">
      {paras.map((p, i) => {
        const img = parseImageParagraph(p);
        if (img) return <InlineImage key={i} alt={img.alt} url={img.url} />;
        if (isMarkdownTableParagraph(p))
          return <InlineTable key={i} markdown={p} />;
        return (
          // whitespace-pre-wrap — 연속 공백 + 줄넘김 모두 보존(타이핑 그대로 렌더).
          <p key={i} className="whitespace-pre-wrap">
            {renderWithUnderline(p)}
          </p>
        );
      })}
    </div>
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
function InlineTable({ markdown }: { markdown: string }) {
  const html = renderTableHtml(markdown);
  return (
    <div
      className="case-md-table my-3 overflow-x-auto"
      // 허용 태그 제한 + isomorphic-dompurify sanitize — 안전.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
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
