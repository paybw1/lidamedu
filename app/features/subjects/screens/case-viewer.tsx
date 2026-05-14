import {
  ArrowLeftIcon,
  FileTextIcon,
  ListTreeIcon,
  NetworkIcon,
  PanelRightIcon,
  StarIcon,
} from "lucide-react";
import { Link, data, redirect, useSearchParams } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Separator } from "~/core/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "~/core/components/ui/sheet";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  getBookmark,
  listHighlights,
  listMemos,
} from "~/features/annotations/queries.server";
import { HighlightOverlay } from "~/features/annotations/components/highlight-overlay";
import { HighlightToolbar } from "~/features/annotations/components/highlight-toolbar";
import { FlowNav } from "~/features/study/components/flow-nav";
import { recordStudySession } from "~/features/study/queries.server";
import { COURT_LABELS } from "~/features/cases/labels";
import { reflowNumberingSafe } from "~/features/cases/lib/reflow-numbering";
import {
  findActiveCaseByDeletedId,
  getCaseById,
  listCaseReferences,
} from "~/features/cases/queries.server";
import { ExamYearChip } from "~/features/cases/components/exam-year-chip";
import { CiteCopyButton } from "~/features/cases/components/cite-copy";
import { CaseReferencesPanel } from "~/features/cases/components/case-references-panel";
import { listComments } from "~/features/comments/queries.server";
import { ArticleRightPanel } from "~/features/laws/components/article-right-panel";
import {
  RelatedArticlesChips,
  RelatedSection,
} from "~/features/laws/components/related-chips";
import {
  getArticleSkeleton,
  getLawByCode,
  getStaffRole,
} from "~/features/laws/queries.server";
import { listThreadsForTarget } from "~/features/qna/queries.server";
import { getRelatedProblemsByCase } from "~/features/problems/queries.server";
import { getRelatedArticlesByCase } from "~/features/relations/queries.server";
import { ArticleTree } from "~/features/subjects/components/article-tree";
import {
  LAW_SUBJECTS,
  lawSubjectSlugSchema,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/case-viewer";

export const meta: Route.MetaFunction = ({ data: loaderData }) => {
  if (!loaderData) return [{ title: "판례 | Lidam Edu" }];
  const c = loaderData.kase;
  return [
    {
      title: `${loaderData.subject.name} ${c.caseNumber} | Lidam Edu`,
    },
  ];
};

export async function loader({ params, request }: Route.LoaderArgs) {
  const subjectParse = lawSubjectSlugSchema.safeParse(params.subject);
  if (!subjectParse.success) {
    throw data("Unknown subject", { status: 404 });
  }
  const lawCode = subjectParse.data;

  if (!params.caseId) {
    throw data("Missing case id", { status: 404 });
  }

  const [client] = makeServerClient(request);
  const law = await getLawByCode(client, lawCode);
  if (!law) {
    throw data("Law not seeded", { status: 404 });
  }

  const [kase, articles] = await Promise.all([
    getCaseById(client, params.caseId),
    getArticleSkeleton(client, law.lawId),
  ]);

  if (!kase) {
    // soft-deleted case 진입 — 같은 사건번호의 활성 row 가 있으면 그쪽으로 redirect.
    // (운영자가 case 를 삭제 후 같은 사건번호로 재등록한 경우 대비. dangling link 는
    // cleanup_case_links_on_soft_delete 트리거가 정리하지만, 기존 즐겨찾기/공유 URL
    // 같은 외부 진입은 여전히 deleted case_id 를 가리킬 수 있어 이 fallback 이 필요.)
    const { replacementCaseId, deletedCaseNumber } =
      await findActiveCaseByDeletedId(client, params.caseId);
    if (replacementCaseId) {
      throw redirect(
        `/subjects/${lawCode}/cases/${replacementCaseId}?from=replaced`,
      );
    }
    throw data(
      deletedCaseNumber
        ? `삭제된 판례입니다 (${deletedCaseNumber}). 같은 사건번호의 활성 판례가 없습니다.`
        : "판례를 찾을 수 없습니다.",
      { status: 404 },
    );
  }

  if (!kase.subjectLaws.includes(lawCode)) {
    throw data("Case does not belong to this subject", { status: 404 });
  }

  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    throw data("Unauthorized", { status: 401 });
  }

  const [
    relatedArticles,
    relatedProblems,
    bookmark,
    memos,
    highlights,
    qnaThreads,
    references,
    staffRole,
    caseComments,
  ] = await Promise.all([
    getRelatedArticlesByCase(client, kase.caseId),
    getRelatedProblemsByCase(client, kase.caseId, 12),
    getBookmark(client, user.id, "case", kase.caseId),
    listMemos(client, user.id, "case", kase.caseId),
    listHighlights(client, user.id, "case", kase.caseId),
    listThreadsForTarget(client, "case", kase.caseId, 20),
    listCaseReferences(client, kase.caseId),
    getStaffRole(client, user.id),
    listComments(client, "case", kase.caseId),
  ]);

  recordStudySession(client, user.id, {
    subject: lawCode,
    target_type: "case",
    target_id: kase.caseId,
    tab: "cases",
  }).catch(() => {});

  return {
    subject: LAW_SUBJECTS[lawCode],
    lawId: law.lawId,
    kase,
    articles,
    relatedArticles,
    relatedProblems,
    bookmark,
    memos,
    highlights,
    qnaThreads,
    references,
    canEditReferences: staffRole !== null,
    caseComments,
    canEditComment: staffRole !== null,
    isAdmin: staffRole === "admin",
    currentUserId: user.id,
  };
}

export default function CaseViewer({ loaderData }: Route.ComponentProps) {
  const {
    subject,
    lawId,
    kase,
    articles,
    relatedArticles,
    relatedProblems,
    bookmark,
    memos,
    highlights,
    qnaThreads,
    references,
    canEditReferences,
    caseComments,
    canEditComment,
    isAdmin,
    currentUserId,
  } = loaderData;

  // summaryItems 가 있으면 우선 사용. 없으면 legacy summary_body_md 를 한 묶음으로 폴백.
  const summaryItems =
    kase.summaryItems.length > 0
      ? kase.summaryItems
      : kase.summaryBodyMd
        ? [{ title: kase.summaryTitle ?? "", body: kase.summaryBodyMd }]
        : [];

  // soft-deleted 진입 fallback redirect 로 도착한 경우 — 한 번만 안내 배너.
  const [searchParams] = useSearchParams();
  const replacedNotice = searchParams.get("from") === "replaced";

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-5 py-6 md:px-10 md:py-8">
      <FlowNav
        subjectSlug={subject.slug}
        currentType="case"
        currentId={kase.caseId}
      />
      <HighlightToolbar targetType="case" targetId={kase.caseId} />
      {replacedNotice ? (
        <div className="mb-3 rounded-md border border-amber-300/60 bg-amber-50/60 px-3 py-2 text-xs text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200">
          이전에 같은 사건번호({kase.caseNumber})로 등록된 판례가 삭제되어, 새로 등록된 활성 판례로 이동했습니다.
        </div>
      ) : null}
      <Link
        to={`/subjects/${subject.slug}?tab=cases`}
        viewTransition
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeftIcon className="size-4" /> {subject.name} 판례 색인
      </Link>

      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)_320px]">
        <aside className="hidden lg:block lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-auto">
          <Card className="py-4">
            <CardHeader className="px-4 pb-2">
              <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                {subject.name} 조문 트리
              </p>
            </CardHeader>
            <CardContent className="px-2 pb-2">
              <ArticleTree
                nodes={articles}
                lawCode={subject.slug}
                lazyExpand={
                  subject.slug === "civil" ? { lawId } : undefined
                }
              />
            </CardContent>
          </Card>
        </aside>

        <main className="space-y-4">
          {/* 모바일 드로어 트리거. */}
          <div className="flex flex-wrap gap-2 lg:hidden">
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  data-testid="open-tree-drawer"
                >
                  <ListTreeIcon className="size-3.5" /> 조문 트리
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[320px] overflow-y-auto p-0 sm:max-w-[360px]">
                <SheetHeader>
                  <SheetTitle>{subject.name} 조문 트리</SheetTitle>
                </SheetHeader>
                <div className="px-3 pb-4">
                  <ArticleTree
                    nodes={articles}
                    lawCode={subject.slug}
                    lazyExpand={
                      subject.slug === "civil" ? { lawId } : undefined
                    }
                  />
                </div>
              </SheetContent>
            </Sheet>
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  data-testid="open-right-drawer"
                >
                  <PanelRightIcon className="size-3.5" /> 학습 보조
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[340px] overflow-y-auto p-0 sm:max-w-[380px]">
                <SheetHeader>
                  <SheetTitle>학습 보조</SheetTitle>
                </SheetHeader>
                <div className="px-3 pb-4">
                  <ArticleRightPanel
                    target={{ type: "case", id: kase.caseId }}
                    bookmark={bookmark}
                    memos={memos}
                    highlights={highlights}
                    qnaThreads={qnaThreads}
                    relatedProblems={relatedProblems}
                    comments={caseComments}
                    canEditComment={canEditComment}
                    currentUserId={currentUserId}
                    isAdmin={isAdmin}
                  />
                </div>
              </SheetContent>
            </Sheet>
          </div>
          <Card>
            <CardHeader className="pb-2">
              <RelatedSection
                title="관련 조문"
                icon={NetworkIcon}
                count={relatedArticles.length}
              >
                <RelatedArticlesChips
                  articles={relatedArticles}
                  subject={subject.slug}
                  emptyHint="이 판례에 연결된 조문이 아직 없습니다."
                />
              </RelatedSection>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="font-normal">
                  {COURT_LABELS[kase.court]}
                </Badge>
                <span className="font-mono text-sm">{kase.caseNumber}</span>
                {kase.caseType ? (
                  <Badge variant="secondary">{kase.caseType}</Badge>
                ) : null}
                {kase.isEnBanc ? (
                  <Badge variant="default">전원합의체</Badge>
                ) : null}
                {kase.importance >= 3 ? (
                  <Badge variant="default" className="gap-1">
                    <StarIcon className="size-3" /> ★{kase.importance}
                  </Badge>
                ) : null}
                <span className="text-muted-foreground text-xs tabular-nums">
                  {kase.decidedAt} 선고
                </span>
                <CiteCopyButton
                  court={kase.court}
                  decidedAt={kase.decidedAt}
                  caseNumber={kase.caseNumber}
                  caseType={kase.caseType}
                  isEnBanc={kase.isEnBanc}
                />
              </div>
              {/* case_title 은 case_type Badge 와 사실상 같은 의미로 중복되어 헤더 h1 노출 제거.
                  사건 식별은 위 caseNumber + caseType + court 묶음으로 충분. 학습 의미 있는
                  요지 [1] 제목은 본문 "판결요지" 영역에서 노출된다. */}
              {kase.exam1stYears.length + kase.exam2ndYears.length > 0 ? (
                <div className="flex flex-wrap gap-1 pt-1">
                  {/* 1차/2차 구분, 각 그룹 안에서 연도 오름차순. */}
                  {[...kase.exam1stYears]
                    .sort((a, b) => a - b)
                    .map((y) => (
                      <ExamYearChip
                        key={`1-${y}`}
                        subjectSlug={subject.slug}
                        round="first"
                        year={y}
                        caseId={kase.caseId}
                      />
                    ))}
                  {[...kase.exam2ndYears]
                    .sort((a, b) => a - b)
                    .map((y) => (
                      <ExamYearChip
                        key={`2-${y}`}
                        subjectSlug={subject.slug}
                        round="second"
                        year={y}
                        caseId={kase.caseId}
                      />
                    ))}
                </div>
              ) : null}
            </CardHeader>
            <Separator />
            <CardContent className="space-y-6 pt-6">
              {summaryItems.length > 0 ? (
                <Section title="판결요지">
                  <HighlightOverlay
                    fieldPath="case.summary"
                    targetType="case"
                    targetId={kase.caseId}
                    highlights={highlights}
                  >
                    <div className="space-y-4">
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
                  </HighlightOverlay>
                </Section>
              ) : null}
              {kase.reasoningMd ? (
                <Section title="판시이유">
                  <HighlightOverlay
                    fieldPath="case.reasoning"
                    targetType="case"
                    targetId={kase.caseId}
                    highlights={highlights}
                  >
                    <Prose text={kase.reasoningMd} />
                  </HighlightOverlay>
                </Section>
              ) : null}
              {kase.fullTextPdf ? (
                <Section title="판결전문 PDF">
                  <div className="space-y-2">
                    <Button variant="outline" size="sm" asChild>
                      <a
                        href={kase.fullTextPdf}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <FileTextIcon className="size-4" /> 새 탭에서 열기
                      </a>
                    </Button>
                    <iframe
                      title="판결전문 PDF"
                      src={kase.fullTextPdf}
                      className="h-[80vh] w-full rounded-md border"
                      loading="lazy"
                    />
                  </div>
                </Section>
              ) : null}
              {(references.length > 0 || canEditReferences) ? (
                <CaseReferencesPanel
                  caseId={kase.caseId}
                  references={references}
                  canEdit={canEditReferences}
                />
              ) : null}
              {kase.commentBodyMd ? (
                <Section title="비고">
                  {kase.commentSource ? (
                    <div className="border-muted-foreground/30 mb-2 border-l-2 pl-2">
                      <p className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
                        출처
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {kase.commentSource}
                      </p>
                    </div>
                  ) : null}
                  <HighlightOverlay
                    fieldPath="case.comment"
                    targetType="case"
                    targetId={kase.caseId}
                    highlights={highlights}
                  >
                    <Prose text={kase.commentBodyMd} />
                  </HighlightOverlay>
                </Section>
              ) : null}
            </CardContent>
          </Card>
        </main>

        <aside className="hidden lg:block lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-auto">
          <Card className="h-full">
            <CardHeader>
              <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                우측 패널
              </p>
            </CardHeader>
            <CardContent>
              <ArticleRightPanel
                target={{ type: "case", id: kase.caseId }}
                bookmark={bookmark}
                memos={memos}
                highlights={highlights}
                qnaThreads={qnaThreads}
                relatedProblems={relatedProblems}
                comments={caseComments}
                canEditComment={canEditComment}
                currentUserId={currentUserId}
                isAdmin={isAdmin}
              />
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Section({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        {meta ? (
          <span className="text-muted-foreground text-xs">출처: {meta}</span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

// 복수 요지 한 항목 — [N] 라벨이 있는 제목과 내용을 함께 표시.
// 파서는 title 앞에 "[1] " 같은 prefix 를 이미 붙여 두지만, 여러 항목일 때 시각적 라벨 분리.
// caseTitle 과 displayTitle 이 동일하면 헤더와 중복이라 제목은 숨기고 본문만 표시.
// (다항목일 땐 [N] 라벨만 남겨 항목 구분).
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
  // [N] 으로 시작하는 prefix 추출. 단일 요지면 prefix 가 없으니 그대로.
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
    displayTitle.trim() !== "" &&
    displayTitle.trim() === caseTitle.trim();
  const shownTitle = duplicatesHeader ? "" : displayTitle;
  return (
    <div className="space-y-2">
      {(label || shownTitle) ? (
        <p className="text-[16px] font-bold leading-snug tracking-tight">
          {label ? (
            <span className="text-primary mr-1.5">{label}</span>
          ) : null}
          {shownTitle}
        </p>
      ) : null}
      {body ? <Prose text={body} /> : null}
    </div>
  );
}

function Prose({ text }: { text: string }) {
  // safe reflow — 패턴 앞이 한국어 글자(또는 한국어+종결 마침표/닫는 괄호)인 경우에만 단락 분리.
  // 숫자 다음의 `12.` `1.` 같은 날짜·사건번호 마침표는 lookbehind 가 보호한다.
  // 그 결과를 빈 줄 2개 단위로 단락 분리.
  const paras = reflowNumberingSafe(text)
    .split(/\n{2,}/)
    .filter((s) => s.trim() !== "");
  return (
    <div className="space-y-3 text-[14px] leading-relaxed">
      {paras.map((p, i) => (
        <p key={i} className="whitespace-pre-line">
          {p}
        </p>
      ))}
    </div>
  );
}
