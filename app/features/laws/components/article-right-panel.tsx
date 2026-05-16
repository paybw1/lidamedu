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
  StickyNoteIcon,
} from "lucide-react";
import { type ComponentType, useEffect, useState } from "react";

import { Badge } from "~/core/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "~/core/components/ui/tabs";
import { cn } from "~/core/lib/utils";
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
  comment: { label: "메모", Icon: ScrollTextIcon },
  materials: { label: "관련자료", Icon: PaperclipIcon },
};

interface PlaceholderTab {
  value: TabKey;
  featId: string;
  hint: string;
}

const PLACEHOLDER_TABS: PlaceholderTab[] = [
  {
    value: "ox",
    featId: "feat-4-A-114",
    hint: "이 조문이 출제된 객관식 지문(O/X) 자동 연동 + 별도 업로드 정오문제. 답 체크 시 정답·해설 즉시 공개.",
  },
  {
    value: "materials",
    featId: "feat-4-A-107",
    hint: "강의노트(PDF/MD) · 강의영상(외부 임베드).",
  },
  {
    value: "comment",
    featId: "feat-4-A-115",
    hint: "수험생·강사가 본문에 남기는 메모. 강사 메모는 모두에게, 수험생 메모는 본인에게만 보입니다.",
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
}: {
  value: TabKey;
  /** 0 또는 undefined = dot 표시 안 함, >0 = 노란 dot. bookmark 같이 카운트 의미가 없는 탭은 0/1 로 표현. */
  count?: number;
  /** 빈 상태일 때 옅게. */
  dim?: boolean;
}) {
  const meta = TAB_META[value];
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
        return bookmark ? "저장됨" : "";
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
      default:
        return "";
    }
  })();

  const activeMeta = TAB_META[activeTab];
  const ActiveIcon = activeMeta.Icon;

  return (
    <div className="flex h-full">
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
          <RailButton value="bookmark" count={bookmark ? 1 : 0} />
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
          {placeholderTabs.map((t) => (
            <RailButton key={t.value} value={t.value} dim />
          ))}
        </TabsList>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <ActiveIcon className="text-primary size-4" />
            <h3 className="text-sm font-bold tracking-tight">
              {activeMeta.label}
            </h3>
            {countLabel ? (
              <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                {countLabel}
              </span>
            ) : null}
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            <TabsContent value="bookmark" className="mt-0">
              <BookmarkStars
                targetType={target.type}
                targetId={target.id}
                initial={bookmark}
              />
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

            {placeholderTabs.map((t) => (
              <TabsContent
                key={t.value}
                value={t.value}
                className="mt-0 space-y-2"
              >
                <Badge variant="outline" className="font-normal">
                  {t.featId}
                </Badge>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {t.hint}
                </p>
                <div className="bg-muted/40 rounded-md border border-dashed p-4">
                  <p className="text-muted-foreground text-center text-xs">
                    구현 대기
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
