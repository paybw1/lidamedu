import {
  ArrowLeftIcon,
  FileTextIcon,
  NetworkIcon,
  StarIcon,
} from "lucide-react";
import { Link, data } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Separator } from "~/core/components/ui/separator";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  getBookmark,
  listHighlights,
  listMemos,
} from "~/features/annotations/queries.server";
import { recordStudySession } from "~/features/study/queries.server";
import {
  COURT_LABELS,
  getCaseById,
} from "~/features/cases/queries.server";
import { ArticleRightPanel } from "~/features/laws/components/article-right-panel";
import {
  RelatedArticlesChips,
  RelatedSection,
} from "~/features/laws/components/related-chips";
import {
  getArticleSkeleton,
  getLawByCode,
} from "~/features/laws/queries.server";
import { getRelatedArticlesByCase } from "~/features/relations/queries.server";
import { ArticleTree } from "~/features/subjects/components/article-tree";
import {
  EXAM_LABEL,
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
    throw data("Case not found", { status: 404 });
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

  const [relatedArticles, bookmark, memos, highlights] = await Promise.all([
    getRelatedArticlesByCase(client, kase.caseId),
    getBookmark(client, user.id, "case", kase.caseId),
    listMemos(client, user.id, "case", kase.caseId),
    listHighlights(client, user.id, "case", kase.caseId),
  ]);

  recordStudySession(client, user.id, {
    subject: lawCode,
    target_type: "case",
    target_id: kase.caseId,
    tab: "cases",
  }).catch(() => {});

  return {
    subject: LAW_SUBJECTS[lawCode],
    kase,
    articles,
    relatedArticles,
    bookmark,
    memos,
    highlights,
  };
}

export default function CaseViewer({ loaderData }: Route.ComponentProps) {
  const {
    subject,
    kase,
    articles,
    relatedArticles,
    bookmark,
    memos,
    highlights,
  } = loaderData;

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-5 py-6 md:px-10 md:py-8">
      <Link
        to={`/subjects/${subject.slug}?tab=cases`}
        viewTransition
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeftIcon className="size-4" /> {subject.name} 판례 색인
      </Link>

      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)_320px]">
        <aside className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-auto">
          <Card className="py-4">
            <CardHeader className="px-4 pb-2">
              <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                {subject.name} 조문 트리
              </p>
            </CardHeader>
            <CardContent className="px-2 pb-2">
              <ArticleTree nodes={articles} lawCode={subject.slug} />
            </CardContent>
          </Card>
        </aside>

        <main className="space-y-4">
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
                <Badge variant="secondary">{EXAM_LABEL[subject.exam]}</Badge>
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
              </div>
              <h1 className="text-2xl font-bold tracking-tight">
                {kase.caseTitle}
              </h1>
              {kase.summaryTitle ? (
                <p className="text-muted-foreground text-sm">
                  {kase.summaryTitle}
                </p>
              ) : null}
            </CardHeader>
            <Separator />
            <CardContent className="space-y-6 pt-6">
              {kase.summaryBodyMd ? (
                <div data-highlight-field="case.summary">
                  <Section title="판결요지">
                    <Prose text={kase.summaryBodyMd} />
                  </Section>
                </div>
              ) : null}
              {kase.reasoningMd ? (
                <div data-highlight-field="case.reasoning">
                  <Section title="판시이유">
                    <Prose text={kase.reasoningMd} />
                  </Section>
                </div>
              ) : null}
              {kase.fullTextPdf ? (
                <Button variant="outline" size="sm" asChild>
                  <a href={kase.fullTextPdf} target="_blank" rel="noreferrer">
                    <FileTextIcon /> 판결전문 PDF
                  </a>
                </Button>
              ) : (
                <p className="text-muted-foreground text-xs">
                  판결전문 PDF 미첨부 (feat-4-A-211)
                </p>
              )}
              {kase.commentBodyMd ? (
                <div data-highlight-field="case.comment">
                  <Section
                    title="코멘트"
                    meta={kase.commentSource ?? undefined}
                  >
                    <Prose text={kase.commentBodyMd} />
                  </Section>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </main>

        <aside className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-auto">
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

function Prose({ text }: { text: string }) {
  return (
    <div className="space-y-3 text-[15px] leading-relaxed whitespace-pre-line">
      {text}
    </div>
  );
}
