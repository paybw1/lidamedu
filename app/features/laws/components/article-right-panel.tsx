import {
  CheckSquareIcon,
  GavelIcon,
  HeartIcon,
  HighlighterIcon,
  HistoryIcon,
  ListChecksIcon,
  MessageCircleQuestionIcon,
  PaperclipIcon,
  ScrollTextIcon,
  StarIcon,
  StickyNoteIcon,
} from "lucide-react";
import { type ComponentType, useEffect, useState } from "react";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "~/core/components/ui/tabs";
import { cn } from "~/core/lib/utils";
import { ImportanceRating } from "~/features/admin/components/importance-rating";
import { BookmarkStars } from "~/features/annotations/components/bookmark-stars";
import { HighlightList } from "~/features/annotations/components/highlight-list";
import { MemoList } from "~/features/annotations/components/memo-list";
import type {
  AnnotationTargetType,
  BookmarkRecord,
  HighlightRecord,
  MemoRecord,
} from "~/features/annotations/labels";
import {
  MEMO_SNIPPET_EVENT,
  type MemoSnippetEventDetail,
} from "~/features/annotations/lib/memo-selection-event";
import { CommentsPanel } from "~/features/comments/components/comments-panel";
import type { ContentComment } from "~/features/comments/queries.server";
import { RelatedCasesList } from "~/features/laws/components/related-chips";
import { RevisionHistory } from "~/features/laws/components/revision-history";
import {
  OPEN_COMMENT_TAB_EVENT,
  type OpenCommentTabEventDetail,
} from "~/features/laws/lib/comment-event";
import type { RevisionHistoryEntry } from "~/features/laws/queries.server";
import { LectureResourcesPanel } from "~/features/lectures/components/lecture-resources-panel";
import type {
  LectureResourceListItem,
  PdfLocationItem,
} from "~/features/lectures/queries.server";
import { OxQuestionsPanel } from "~/features/problems/components/ox-questions-panel";
import { RelatedProblemsList } from "~/features/problems/components/related-problems-list";
import type {
  OxQuestionItem,
  OxRefAnnotations,
} from "~/features/problems/labels";
import type { RelatedProblemItem } from "~/features/problems/queries.server";
import { QnaPanel } from "~/features/qna/components/qna-panel";
import type { QnaTargetType, QnaThreadSummary } from "~/features/qna/labels";
import type { RelatedCase } from "~/features/relations/labels";
import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";

type TabKey =
  | "bookmark"
  | "memo"
  | "highlight"
  | "cases"
  | "related-problems"
  | "qna"
  | "revisions"
  | "ox"
  | "comment"
  | "materials";

interface PanelTabMeta {
  label: string;
  Icon: ComponentType<{ className?: string }>;
}

const TAB_META: Record<TabKey, PanelTabMeta> = {
  bookmark: { label: "즐겨찾기", Icon: HeartIcon },
  memo: { label: "포스트잇", Icon: StickyNoteIcon },
  highlight: { label: "하이라이트", Icon: HighlighterIcon },
  cases: { label: "판례", Icon: GavelIcon },
  "related-problems": { label: "유사 문제", Icon: ListChecksIcon },
  qna: { label: "Q&A", Icon: MessageCircleQuestionIcon },
  revisions: { label: "개정이력", Icon: HistoryIcon },
  ox: { label: "정오문제", Icon: CheckSquareIcon },
  comment: { label: "코멘트", Icon: ScrollTextIcon },
  materials: { label: "관련자료", Icon: PaperclipIcon },
};

interface PlaceholderTab {
  value: TabKey;
  hint: string;
}

const PLACEHOLDER_TABS: PlaceholderTab[] = [
  {
    value: "ox",
    hint: "이 조문이 출제된 객관식 지문(OX)과 별도로 등록된 정오문제를 모아 보여드립니다. 답을 체크하면 정답과 해설이 바로 공개됩니다.",
  },
  {
    value: "comment",
    hint: "학생과 강사가 본문에 남기는 코멘트입니다. 강사 코멘트는 모두에게, 학생 코멘트는 본인에게만 보입니다.",
  },
];

// annotation_target_type → qna_target_type 매핑.
function toQnaTargetType(t: AnnotationTargetType): QnaTargetType | null {
  if (t === "article") return "article";
  if (t === "case") return "case";
  if (t === "problem") return "problem";
  return null;
}

// 좌측 레일 버튼 — 아이콘 only + 카운트 dot + native title tooltip.
function RailButton({
  value,
  count,
  dim,
  meta: metaOverride,
}: {
  value: TabKey;
  /** 0 또는 undefined = dot 표시 안 함, >0 = 노란 dot. bookmark 같이 카운트 의미가 없는 탭은 0/1 로 표현. */
  count?: number;
  /** 빈 상태일 때 옅게. */
  dim?: boolean;
  /** 탭 메타 오버라이드 — staff 중요도 모드의 bookmark 탭처럼 라벨/아이콘이 바뀔 때. */
  meta?: PanelTabMeta;
}) {
  const meta = metaOverride ?? TAB_META[value];
  const Icon = meta.Icon;
  const hasContent = count !== undefined && count > 0;
  const tooltip =
    count !== undefined && count > 0 ? `${meta.label} (${count})` : meta.label;
  return (
    <TabsTrigger
      value={value}
      title={tooltip}
      aria-label={tooltip}
      className={cn(
        "text-muted-foreground relative h-9 w-9 flex-none rounded-md p-0",
        "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground",
        "data-[state=active]:shadow-[0_4px_12px_rgba(45,91,168,0.24)]",
        "hover:bg-muted hover:text-foreground transition-colors",
        dim && "opacity-40",
      )}
    >
      <Icon className="size-4" />
      {hasContent ? (
        <span
          aria-hidden
          className="absolute top-1 right-1 size-1.5 rounded-full bg-amber-500 ring-1 ring-white"
        />
      ) : null}
      <span className="sr-only">{tooltip}</span>
    </TabsTrigger>
  );
}

export function ArticleRightPanel({
  target,
  bookmark,
  memos,
  highlights,
  qnaThreads = [],
  relatedCases,
  relatedProblems,
  oxQuestions,
  oxAnnotationsByRef,
  comments,
  canEditComment = false,
  currentUserId = null,
  isAdmin = false,
  subjectSlug,
  revisions,
  viewerIsStaff = false,
  importance,
  lectureResources,
  pdfLocations,
  pdfLocationsEnabled,
  className,
}: {
  target: { type: AnnotationTargetType; id: string };
  bookmark: BookmarkRecord | null;
  memos: MemoRecord[];
  highlights: HighlightRecord[];
  qnaThreads?: QnaThreadSummary[];
  relatedCases?: RelatedCase[];
  // problem-viewer 에서 같은 조문 다른 문제 노출용. undefined 면 탭 미표시.
  relatedProblems?: RelatedProblemItem[];
  // article-viewer 에서 이 조문에 연결된 OX 가능 지문 풀이용. undefined 면 placeholder 유지.
  oxQuestions?: OxQuestionItem[];
  oxAnnotationsByRef?: Record<string, OxRefAnnotations>;
  // 통합 코멘트(feat-8-021) — 다중 코멘트. undefined = 탭 자체 비활성 (placeholder 유지).
  comments?: ContentComment[];
  canEditComment?: boolean;
  currentUserId?: string | null;
  isAdmin?: boolean;
  subjectSlug?: LawSubjectSlug;
  // staff(instructor/admin) 일 때만 전달. 비어있거나 undefined 이면 탭 자체가 표시되지 않음.
  revisions?: RevisionHistoryEntry[];
  // feat-8-025 — staff 면 "즐겨찾기" 탭이 중요도 별점 에디터로 바뀐다.
  viewerIsStaff?: boolean;
  // 콘텐츠 importance — staff 중요도 모드에서 사용. case/article/problem 뷰어가 전달.
  importance?: number;
  // feat-4-A-117 — 관련자료(강의노트). undefined = 탭 자체 미표시(article/case/problem 외 타겟).
  lectureResources?: LectureResourceListItem[];
  // 통합본 PDF 위치 링크 + 학생 노출 여부(staff||플래그). 조각과 병존(fallback).
  pdfLocations?: PdfLocationItem[];
  pdfLocationsEnabled?: boolean;
  // 루트에 덧붙일 클래스 — 체계도 노드/장 뷰어처럼 카드가 늘어나는 맥락에서
  // `lg:absolute lg:inset-0` 로 본문(좌측 열) 높이에 맞춰 채우고 내부 스크롤시키기 위함.
  // (조문·판례·문제 단일 뷰어는 미전달 = 종전 sticky aside 그대로.)
  className?: string;
}) {
  const qnaTargetType = toQnaTargetType(target.type);
  const showCases = relatedCases !== undefined && subjectSlug !== undefined;
  const showRelatedProblems = relatedProblems !== undefined;
  const showOxLive = oxQuestions !== undefined && subjectSlug !== undefined;
  const commentTargetType: "article" | "case" | "problem" | null =
    target.type === "article" ||
    target.type === "case" ||
    target.type === "problem"
      ? target.type
      : null;
  const showCommentLive = comments !== undefined && commentTargetType !== null;
  const showRevisions = revisions !== undefined;
  // feat-4-A-117 — lecture_resources 의 target_type 은 article/case/problem/science_section 이지만
  // 우측 패널은 commentTargetType (article/case/problem) 만 사용. 그 외는 패널 미표시.
  // staff(원장/관리자/강사) 는 lectureResources prop 이 undefined 라도 무조건 탭 노출 —
  // 빈 상태에서 클릭해 자료를 추가/편집할 수 있어야 한다.
  const showMaterials =
    commentTargetType !== null &&
    (lectureResources !== undefined || viewerIsStaff);

  // feat-8-025 — staff 가 case/article/problem 을 볼 때 "즐겨찾기" 탭을 중요도 에디터로.
  const staffImportanceMode =
    viewerIsStaff &&
    importance !== undefined &&
    (target.type === "article" ||
      target.type === "case" ||
      target.type === "problem");
  const bookmarkMeta: PanelTabMeta = staffImportanceMode
    ? { label: "중요도", Icon: StarIcon }
    : TAB_META.bookmark;
  const bookmarkHasContent = staffImportanceMode
    ? (importance ?? 0) > 0
    : bookmark != null;

  const [activeTab, setActiveTab] = useState<TabKey>("bookmark");
  // 본문 selection → "메모" 버튼 클릭 시 자동으로 memo 탭 활성화.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<MemoSnippetEventDetail>).detail;
      if (!detail) return;
      if (detail.targetType !== target.type || detail.targetId !== target.id)
        return;
      setActiveTab("memo");
    };
    document.addEventListener(MEMO_SNIPPET_EVENT, handler);
    return () => document.removeEventListener(MEMO_SNIPPET_EVENT, handler);
  }, [target.type, target.id]);
  // "해설 보기" 클릭 (feat-4-A-112) → 코멘트 탭 활성화.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<OpenCommentTabEventDetail>).detail;
      if (!detail) return;
      if (detail.targetType !== target.type || detail.targetId !== target.id)
        return;
      setActiveTab("comment");
    };
    document.addEventListener(OPEN_COMMENT_TAB_EVENT, handler);
    return () => document.removeEventListener(OPEN_COMMENT_TAB_EVENT, handler);
  }, [target.type, target.id]);

  const placeholderTabs = PLACEHOLDER_TABS.filter(
    (t) =>
      !(t.value === "ox" && showOxLive) &&
      !(t.value === "comment" && showCommentLive),
  );

  // 활성 탭의 우측 헤더 카운트 라벨.
  const countLabel: string = (() => {
    switch (activeTab) {
      case "bookmark":
        return staffImportanceMode
          ? `★ ${importance ?? 0}`
          : bookmark
            ? "저장됨"
            : "";
      case "memo":
        return memos.length > 0 ? `${memos.length} 건` : "";
      case "highlight":
        return highlights.length > 0 ? `${highlights.length} 건` : "";
      case "cases":
        return relatedCases && relatedCases.length > 0
          ? `${relatedCases.length} 건`
          : "";
      case "related-problems":
        return relatedProblems && relatedProblems.length > 0
          ? `${relatedProblems.length} 건`
          : "";
      case "qna":
        return qnaThreads.length > 0 ? `${qnaThreads.length} 건` : "";
      case "revisions":
        return revisions && revisions.length > 0
          ? `${revisions.length} 건`
          : "";
      case "ox":
        return oxQuestions && oxQuestions.length > 0
          ? `${oxQuestions.length} 건`
          : "";
      case "comment":
        return comments && comments.length > 0 ? `${comments.length} 건` : "";
      case "materials":
        return lectureResources && lectureResources.length > 0
          ? `${lectureResources.length} 건`
          : "";
      default:
        return "";
    }
  })();

  const activeMeta =
    activeTab === "bookmark" ? bookmarkMeta : TAB_META[activeTab];
  const ActiveIcon = activeMeta.Icon;

  return (
    <div className={cn("flex h-full", className)}>
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as TabKey)}
        orientation="vertical"
        className="flex h-full w-full flex-row gap-0"
      >
        <TabsList
          className={cn(
            "flex h-auto w-11 flex-none flex-col items-stretch gap-1 rounded-md rounded-r-none p-1.5",
            "bg-muted/40 border-r",
          )}
        >
          <RailButton
            value="bookmark"
            count={bookmarkHasContent ? 1 : 0}
            meta={bookmarkMeta}
          />
          <RailButton value="memo" count={memos.length} />
          <RailButton value="highlight" count={highlights.length} />
          {showCases ? (
            <RailButton value="cases" count={relatedCases.length} />
          ) : null}
          {showRelatedProblems ? (
            <RailButton
              value="related-problems"
              count={relatedProblems.length}
            />
          ) : null}
          {qnaTargetType ? (
            <RailButton
              value="qna"
              count={qnaThreads.length}
              dim={qnaThreads.length === 0}
            />
          ) : null}
          {showRevisions ? (
            <RailButton value="revisions" count={revisions.length} />
          ) : null}
          {showOxLive ? (
            <RailButton
              value="ox"
              count={oxQuestions.length}
              dim={oxQuestions.length === 0}
            />
          ) : null}
          {showCommentLive ? (
            <RailButton
              value="comment"
              count={comments?.length ?? 0}
              dim={(comments?.length ?? 0) === 0}
            />
          ) : null}
          {showMaterials ? (
            <RailButton
              value="materials"
              count={lectureResources?.length ?? 0}
              dim={(lectureResources?.length ?? 0) === 0 && !viewerIsStaff}
            />
          ) : null}
          {placeholderTabs.map((t) => (
            <RailButton key={t.value} value={t.value} dim />
          ))}
        </TabsList>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <ActiveIcon className="text-link size-4" />
            <h3 className="text-sm font-bold tracking-tight">
              {activeMeta.label}
            </h3>
            {countLabel ? (
              <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                {countLabel}
              </span>
            ) : null}
          </div>

          <div className="flex-1 overflow-y-auto p-3 min-h-0">
            <TabsContent value="bookmark" className="mt-0">
              {staffImportanceMode ? (
                <ImportanceRating
                  targetType={
                    target.type === "case"
                      ? "case"
                      : target.type === "problem"
                        ? "problem"
                        : "article"
                  }
                  targetId={target.id}
                  importance={importance ?? 0}
                />
              ) : (
                <BookmarkStars
                  targetType={target.type}
                  targetId={target.id}
                  initial={bookmark}
                />
              )}
            </TabsContent>

            <TabsContent value="memo" className="mt-0">
              <MemoList
                targetType={target.type}
                targetId={target.id}
                initial={memos}
                viewerIsStaff={canEditComment}
              />
            </TabsContent>

            <TabsContent value="highlight" className="mt-0">
              <HighlightList
                targetType={target.type}
                targetId={target.id}
                initial={highlights}
                viewerIsStaff={canEditComment}
              />
            </TabsContent>

            {showCases ? (
              <TabsContent value="cases" className="mt-0">
                <RelatedCasesList cases={relatedCases} subject={subjectSlug} />
              </TabsContent>
            ) : null}

            {showRelatedProblems ? (
              <TabsContent value="related-problems" className="mt-0">
                <RelatedProblemsList items={relatedProblems} />
              </TabsContent>
            ) : null}

            {qnaTargetType ? (
              <TabsContent value="qna" className="mt-0">
                <QnaPanel
                  threads={qnaThreads}
                  targetType={qnaTargetType}
                  targetId={target.id}
                />
              </TabsContent>
            ) : null}

            {showRevisions ? (
              <TabsContent value="revisions" className="mt-0">
                <RevisionHistory revisions={revisions} />
              </TabsContent>
            ) : null}

            {showOxLive ? (
              <TabsContent value="ox" className="mt-0">
                <OxQuestionsPanel
                  items={oxQuestions}
                  subject={subjectSlug}
                  annotationsByRef={oxAnnotationsByRef}
                  isStaff={viewerIsStaff}
                />
              </TabsContent>
            ) : null}

            {showCommentLive && commentTargetType ? (
              <TabsContent value="comment" className="mt-0">
                <CommentsPanel
                  targetType={commentTargetType}
                  targetId={target.id}
                  comments={comments ?? []}
                  currentUserId={currentUserId}
                  isAdmin={isAdmin}
                />
              </TabsContent>
            ) : null}

            {showMaterials && commentTargetType ? (
              <TabsContent value="materials" className="mt-0">
                <LectureResourcesPanel
                  targetType={commentTargetType}
                  targetId={target.id}
                  initial={lectureResources ?? []}
                  canManage={viewerIsStaff}
                  pdfLocations={pdfLocations}
                  pdfLocationsEnabled={pdfLocationsEnabled}
                />
              </TabsContent>
            ) : null}

            {placeholderTabs.map((t) => (
              <TabsContent
                key={t.value}
                value={t.value}
                className="mt-0 space-y-2"
              >
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {t.hint}
                </p>
                <div className="bg-muted/40 rounded-md border border-dashed p-4">
                  <p className="text-muted-foreground text-center text-xs">
                    준비 중입니다.
                  </p>
                </div>
              </TabsContent>
            ))}
          </div>
        </div>
      </Tabs>
    </div>
  );
}
