import {
  CheckSquareIcon,
  GavelIcon,
  HeartIcon,
  HighlighterIcon,
  HistoryIcon,
  MessageCircleQuestionIcon,
  NotebookPenIcon,
  PaperclipIcon,
  ScrollTextIcon,
} from "lucide-react";
import { type ComponentType, useEffect, useState } from "react";

import {
  MEMO_SNIPPET_EVENT,
  type MemoSnippetEventDetail,
} from "~/features/annotations/lib/memo-selection-event";

import { Badge } from "~/core/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "~/core/components/ui/tabs";
import { BookmarkStars } from "~/features/annotations/components/bookmark-stars";
import { HighlightList } from "~/features/annotations/components/highlight-list";
import { MemoList } from "~/features/annotations/components/memo-list";
import type {
  AnnotationTargetType,
  BookmarkRecord,
  HighlightRecord,
  MemoRecord,
} from "~/features/annotations/labels";
import { RelatedCasesList } from "~/features/laws/components/related-chips";
import { RevisionHistory } from "~/features/laws/components/revision-history";
import type { RevisionHistoryEntry } from "~/features/laws/queries.server";
import { QnaPanel } from "~/features/qna/components/qna-panel";
import type {
  QnaTargetType,
  QnaThreadSummary,
} from "~/features/qna/labels";
import type { RelatedCase } from "~/features/relations/labels";
import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";

interface PanelTab {
  value: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  featId: string;
  hint: string;
}

const PLACEHOLDER_TABS: PanelTab[] = [
  {
    value: "ox",
    label: "정오문제",
    icon: CheckSquareIcon,
    featId: "feat-4-A-114",
    hint: "이 조문이 출제된 객관식 지문(O/X) 자동 연동 + 별도 업로드 정오문제. 답 체크 시 정답·해설 즉시 공개.",
  },
  {
    value: "materials",
    label: "관련자료",
    icon: PaperclipIcon,
    featId: "feat-4-A-107",
    hint: "강의노트(PDF/MD) · 강의영상(외부 임베드).",
  },
  {
    value: "comment",
    label: "코멘트",
    icon: ScrollTextIcon,
    featId: "feat-4-A-115",
    hint: "강사·운영자가 작성한 평석/학습자료. 마크다운 + 하이라이트.",
  },
];

// annotation_target_type → qna_target_type 매핑. problem_choice 는 부모 problem 으로.
function toQnaTargetType(t: AnnotationTargetType): QnaTargetType | null {
  if (t === "article") return "article";
  if (t === "case") return "case";
  if (t === "problem") return "problem";
  return null; // problem_choice 등은 Q&A 미지원
}

export function ArticleRightPanel({
  target,
  bookmark,
  memos,
  highlights,
  qnaThreads = [],
  relatedCases,
  subjectSlug,
  revisions,
}: {
  target: { type: AnnotationTargetType; id: string };
  bookmark: BookmarkRecord | null;
  memos: MemoRecord[];
  highlights: HighlightRecord[];
  qnaThreads?: QnaThreadSummary[];
  relatedCases?: RelatedCase[];
  subjectSlug?: LawSubjectSlug;
  // staff(instructor/admin) 일 때만 전달. 비어있거나 undefined 이면 탭 자체가 표시되지 않음.
  revisions?: RevisionHistoryEntry[];
}) {
  const qnaTargetType = toQnaTargetType(target.type);
  const showCases = relatedCases !== undefined && subjectSlug !== undefined;
  const showRevisions = revisions !== undefined;
  // 본문 selection → "메모" 버튼 클릭 시 자동으로 memo 탭 활성화. (snippet 자동 fill 은 MemoList 가 처리)
  const [activeTab, setActiveTab] = useState("bookmark");
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
  return (
    <div className="flex h-full flex-col">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full gap-3">
        <TabsList className="h-auto flex-wrap gap-1">
          <TabsTrigger value="bookmark" className="h-7 flex-none px-2.5 text-xs">
            <HeartIcon /> 즐겨찾기
          </TabsTrigger>
          <TabsTrigger value="memo" className="h-7 flex-none px-2.5 text-xs">
            <NotebookPenIcon /> 메모
            {memos.length > 0 ? (
              <span className="text-muted-foreground ml-1 tabular-nums">
                {memos.length}
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger
            value="highlight"
            className="h-7 flex-none px-2.5 text-xs"
          >
            <HighlighterIcon /> 하이라이트
            {highlights.length > 0 ? (
              <span className="text-muted-foreground ml-1 tabular-nums">
                {highlights.length}
              </span>
            ) : null}
          </TabsTrigger>
          {showCases ? (
            <TabsTrigger value="cases" className="h-7 flex-none px-2.5 text-xs">
              <GavelIcon /> 판례
              {relatedCases.length > 0 ? (
                <span className="text-muted-foreground ml-1 tabular-nums">
                  {relatedCases.length}
                </span>
              ) : null}
            </TabsTrigger>
          ) : null}
          {qnaTargetType ? (
            <TabsTrigger value="qna" className="h-7 flex-none px-2.5 text-xs">
              <MessageCircleQuestionIcon /> Q&A
              {qnaThreads.length > 0 ? (
                <span className="text-muted-foreground ml-1 tabular-nums">
                  {qnaThreads.length}
                </span>
              ) : null}
            </TabsTrigger>
          ) : null}
          {showRevisions ? (
            <TabsTrigger
              value="revisions"
              className="h-7 flex-none px-2.5 text-xs"
            >
              <HistoryIcon /> 개정이력
              {revisions.length > 0 ? (
                <span className="text-muted-foreground ml-1 tabular-nums">
                  {revisions.length}
                </span>
              ) : null}
            </TabsTrigger>
          ) : null}
          {PLACEHOLDER_TABS.map((t) => {
            const Icon = t.icon;
            return (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className="h-7 flex-none px-2.5 text-xs"
              >
                <Icon /> {t.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value="bookmark">
          <BookmarkStars
            targetType={target.type}
            targetId={target.id}
            initial={bookmark}
          />
        </TabsContent>

        <TabsContent value="memo">
          <MemoList
            targetType={target.type}
            targetId={target.id}
            initial={memos}
          />
        </TabsContent>

        <TabsContent value="highlight">
          <HighlightList
            targetType={target.type}
            targetId={target.id}
            initial={highlights}
          />
        </TabsContent>

        {showCases ? (
          <TabsContent value="cases">
            <RelatedCasesList cases={relatedCases} subject={subjectSlug} />
          </TabsContent>
        ) : null}

        {qnaTargetType ? (
          <TabsContent value="qna">
            <QnaPanel
              threads={qnaThreads}
              targetType={qnaTargetType}
              targetId={target.id}
            />
          </TabsContent>
        ) : null}

        {showRevisions ? (
          <TabsContent value="revisions">
            <RevisionHistory revisions={revisions} />
          </TabsContent>
        ) : null}

        {PLACEHOLDER_TABS.map((t) => (
          <TabsContent key={t.value} value={t.value} className="space-y-2">
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
      </Tabs>
    </div>
  );
}
