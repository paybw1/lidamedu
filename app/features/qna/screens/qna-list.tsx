import {
  MessageCircleQuestionIcon,
  PencilLineIcon,
  SearchIcon,
  SearchXIcon,
} from "lucide-react";
import { Form, Link, useSearchParams } from "react-router";

import { Button } from "~/core/components/ui/button";
import { cn } from "~/core/lib/utils";
import {
  Chip,
  EmptyState,
} from "~/features/community/components/community-ui";
import { CommunityShell } from "~/features/community/components/community-shell";
import { GuideHelpButton } from "~/features/guide/components/guide-help-button";
import makeServerClient from "~/core/lib/supa-client.server";

import {
  QNA_STATUS_LABEL,
  QNA_SUBJECTS,
  QNA_SUBJECT_LABEL,
  QNA_TARGET_LABEL,
  qnaSubjectSchema,
  qnaTargetTypeSchema,
  type QnaSubject,
  type QnaTargetType,
  subjectLabel,
} from "../labels";
import { getStaffRole } from "~/features/laws/queries.server";

import { countReviewQueue, listThreads, type ListFilter } from "../queries.server";
import {
  resolveTargetDisplay,
  type CrumbSegment,
} from "../lib/target-display.server";

import type { Route } from "./+types/qna-list";

type Scope = ListFilter["scope"];

const SCOPE_LABELS: Record<Scope, string> = {
  all: "전체",
  "asked-by-me": "내 질문",
  "answered-by-me": "내 답변",
  open: "답변 대기",
  review: "검토 필요",
};

// 공통 분류 칩(전원). review 는 강사 전용이라 별도 렌더.
const SCOPE_VALUES: Scope[] = ["all", "asked-by-me", "answered-by-me", "open"];
// URL ?scope= 검증용 — review 포함.
const VALID_SCOPES: Scope[] = [...SCOPE_VALUES, "review"];

// 대상 칩 색 — 조문(primary) / 판례(violet) / 문제(amber).
const TARGET_TONE: Record<
  QnaTargetType,
  "primary" | "violet" | "amber" | "emerald" | "neutral"
> = {
  article: "primary",
  node: "primary",
  case: "violet",
  problem: "amber",
  study_method: "emerald",
  general: "neutral",
};

// 대상 유형(② 세그먼트) pill 색 — 조문/판례/문제/쟁점.
const CRUMB_TYPE_TONE: Record<string, string> = {
  조문: "bg-primary/10 text-primary",
  판례: "bg-violet-500/10 text-violet-600 dark:text-violet-300",
  문제: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  쟁점: "bg-primary/10 text-primary",
};

// 과목 › 유형 › 식별자 › 쟁점(체계도) breadcrumb 한 줄.
function TargetCrumb({ segments }: { segments: CrumbSegment[] }) {
  return (
    <div className="mb-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px]">
      {segments.map((seg, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          {i > 0 ? (
            <span className="text-muted-foreground/50 text-[11px]">›</span>
          ) : null}
          {seg.kind === "subject" ? (
            <span className="bg-muted rounded-md px-2 py-0.5 font-bold">
              {seg.text}
            </span>
          ) : seg.kind === "type" ? (
            <span
              className={cn(
                "rounded-md px-2 py-0.5 font-bold",
                CRUMB_TYPE_TONE[seg.text] ?? "bg-muted text-muted-foreground",
              )}
            >
              {seg.text}
            </span>
          ) : seg.kind === "node" ? (
            <span className="text-link font-bold">◆ {seg.text}</span>
          ) : (
            <span className="font-bold">
              {seg.text}
              {seg.sub ? (
                <span className="text-muted-foreground ml-1 font-medium">
                  {seg.sub}
                </span>
              ) : null}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

export const meta: Route.MetaFunction = () => [{ title: "Q&A | 리담변리사학원" }];

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const rawScope = url.searchParams.get("scope") ?? "all";
  const scope: Scope = VALID_SCOPES.includes(rawScope as Scope)
    ? (rawScope as Scope)
    : "all";

  const rawTarget = url.searchParams.get("target");
  const targetParse = rawTarget ? qnaTargetTypeSchema.safeParse(rawTarget) : null;
  const targetType: QnaTargetType | undefined = targetParse?.success
    ? targetParse.data
    : undefined;

  const rawSubject = url.searchParams.get("subject");
  const subjectParse = rawSubject ? qnaSubjectSchema.safeParse(rawSubject) : null;
  const subject: QnaSubject | undefined = subjectParse?.success
    ? subjectParse.data
    : undefined;

  const query = url.searchParams.get("q") ?? "";

  const role = await getStaffRole(client, user.id);
  const isStaff = role !== null;

  const [threads, reviewCount] = await Promise.all([
    listThreads(client, user.id, { scope, targetType, subject, query }),
    isStaff ? countReviewQueue(client) : Promise.resolve(0),
  ]);

  // 대상 breadcrumb — "무엇에 대한 질문인지"를 과목 › 유형 › 식별자 › 쟁점 4단계로 표시.
  //   질문 제목만으론 대상이 안 보여서(예: "의료업") 대상 경로를 함께 노출.
  const targetCrumbs: Record<string, CrumbSegment[]> = {};
  await Promise.all(
    threads.map(async (t) => {
      if (!t.targetId) return;
      const d = await resolveTargetDisplay(
        client,
        t.targetType,
        t.targetId,
        t.nodeId,
      );
      if (d?.segments?.length) targetCrumbs[t.threadId] = d.segments;
    }),
  );

  return {
    threads,
    targetCrumbs,
    scope,
    targetType,
    subject,
    query,
    currentUserId: user.id,
    isStaff,
    reviewCount,
  };
}

export default function QnaList({ loaderData }: Route.ComponentProps) {
  const {
    threads,
    targetCrumbs,
    scope,
    targetType,
    subject,
    query,
    currentUserId,
    isStaff,
    reviewCount,
  } = loaderData;
  const [searchParams] = useSearchParams();

  const buildHref = (overrides: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(overrides)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    return `/qna?${next.toString()}`;
  };

  const waitingCount = threads.filter((t) => t.status === "open").length;
  const filterActive =
    scope !== "all" || !!targetType || !!subject || query !== "";

  const descParts = [`총 ${threads.length}건`];
  if (isStaff && reviewCount > 0) descParts.push(`검토 필요 ${reviewCount}건`);
  else if (waitingCount > 0) descParts.push(`답변 대기 ${waitingCount}건`);

  return (
    <CommunityShell
      category="qna"
      title="Q&A"
      desc={descParts.join(" · ")}
      headerRight={
        <div className="flex items-center gap-2">
          <GuideHelpButton screenKey="qna" />
          <Button asChild size="sm" className="h-9 rounded-full">
            <Link to="/qna/new" viewTransition>
              <PencilLineIcon className="size-4" /> 새 질문
            </Link>
          </Button>
        </div>
      }
    >

      <Form
        method="get"
        className="border-border bg-card mb-3.5 flex flex-wrap items-center gap-2 rounded-2xl border p-3 shadow-sm"
      >
        <div className="relative min-w-[200px] flex-1 basis-[240px] sm:max-w-[320px]">
          <SearchIcon className="text-muted-foreground absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="제목 / 질문 / 답변 검색"
            aria-label="질문 검색"
            className="bg-muted/60 focus:bg-background focus:border-primary h-9 w-full rounded-full border border-transparent pr-3 pl-9 text-[13px] outline-none"
          />
        </div>
        {scope !== "all" ? (
          <input type="hidden" name="scope" value={scope} />
        ) : null}
        {targetType ? (
          <input type="hidden" name="target" value={targetType} />
        ) : null}
        {subject ? (
          <input type="hidden" name="subject" value={subject} />
        ) : null}
        <Button type="submit" size="sm" className="h-9 rounded-full">
          검색
        </Button>
      </Form>

      <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
        <span className="text-muted-foreground mr-1 font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
          분류
        </span>
        {SCOPE_VALUES.map((s) => {
          const isActive = scope === s;
          const isWaiting = s === "open";
          return (
            <Link key={s} to={buildHref({ scope: s === "all" ? null : s })}>
              <Chip
                tone={
                  isActive
                    ? "solid"
                    : isWaiting
                      ? "coral"
                      : "neutral"
                }
                className="transition-colors hover:opacity-85"
              >
                {SCOPE_LABELS[s]}
                {isWaiting && waitingCount > 0 ? ` ${waitingCount}` : ""}
              </Chip>
            </Link>
          );
        })}
        {/* 강사 전용 검토 큐 — 미답 + AI 미검토 모아보기. */}
        {isStaff ? (
          <Link to={buildHref({ scope: "review" })}>
            <Chip
              tone={scope === "review" ? "solid" : "primary"}
              className="transition-colors hover:opacity-85"
            >
              {SCOPE_LABELS.review}
              {reviewCount > 0 ? ` ${reviewCount}` : ""}
            </Chip>
          </Link>
        ) : null}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <span className="text-muted-foreground mr-1 font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
          대상
        </span>
        <Link to={buildHref({ target: null })}>
          <Chip
            tone={!targetType ? "solid" : "neutral"}
            className="transition-colors hover:opacity-85"
          >
            전체
          </Chip>
        </Link>
        {(
          ["article", "case", "problem", "study_method"] as QnaTargetType[]
        ).map((t) => {
          const isActive = targetType === t;
          return (
            <Link key={t} to={buildHref({ target: t })}>
              <Chip
                tone={isActive ? "solid" : TARGET_TONE[t]}
                className="transition-colors hover:opacity-85"
              >
                {QNA_TARGET_LABEL[t]}
              </Chip>
            </Link>
          );
        })}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <span className="text-muted-foreground mr-1 font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
          과목
        </span>
        <Link to={buildHref({ subject: null })}>
          <Chip
            tone={!subject ? "solid" : "neutral"}
            className="transition-colors hover:opacity-85"
          >
            전체
          </Chip>
        </Link>
        {QNA_SUBJECTS.map((s) => (
          <Link key={s} to={buildHref({ subject: s })}>
            <Chip
              tone={subject === s ? "solid" : "neutral"}
              className="transition-colors hover:opacity-85"
            >
              {QNA_SUBJECT_LABEL[s]}
            </Chip>
          </Link>
        ))}
      </div>

      {threads.length === 0 ? (
        scope === "review" ? (
          <EmptyState
            icon={MessageCircleQuestionIcon}
            tone="neutral"
            title="검토할 질문이 없습니다"
            body="미답 질문과 AI 미검토 답변이 모두 처리되었습니다."
          />
        ) : (
          <EmptyState
            icon={filterActive ? SearchXIcon : MessageCircleQuestionIcon}
            tone={filterActive ? "subdued" : "neutral"}
            title={
              filterActive
                ? "조건에 맞는 질문이 없습니다"
                : "아직 등록된 질문이 없습니다"
            }
            body={
              filterActive
                ? "검색어나 분류·대상·과목 필터를 바꿔 다시 찾아보세요."
                : "조문·판례·문제 상세 화면이나 ‘공부방법 질문’으로 질문할 수 있습니다. AI와 강사가 답변해 드립니다."
            }
          />
        )
      ) : (
        <ul className="flex flex-col gap-2">
          {threads.map((t) => {
            const isMine = t.askerId === currentUserId;
            const isMyAnswer = t.answererId === currentUserId;
            const isWaiting = t.status === "open";
            return (
              <li key={t.threadId}>
                <Link
                  to={`/qna/${t.threadId}`}
                  viewTransition
                  className={cn(
                    "group block rounded-2xl border p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
                    isWaiting
                      ? "border-rose-500/30 bg-rose-500/[0.06] hover:border-rose-500/50"
                      : "border-border bg-card hover:border-primary/30",
                  )}
                >
                  {(() => {
                    const crumb = targetCrumbs[t.threadId];
                    return (
                      <>
                        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                          {/* 유형·과목은 breadcrumb 이 있으면 그쪽에서 표기 → 중복 제거. */}
                          {!crumb ? (
                            <>
                              <Chip tone={TARGET_TONE[t.targetType]}>
                                {QNA_TARGET_LABEL[t.targetType]}
                              </Chip>
                              {t.subject ? (
                                <Chip tone="neutral">
                                  {subjectLabel(t.subject)}
                                </Chip>
                              ) : null}
                            </>
                          ) : null}
                          <Chip tone={isWaiting ? "coral" : "emerald"}>
                            {QNA_STATUS_LABEL[t.status]}
                          </Chip>
                          {isMine ? <Chip tone="outline">내 질문</Chip> : null}
                          {isMyAnswer ? (
                            <Chip tone="outline">내 답변</Chip>
                          ) : null}
                          {/* 질문 날짜 — 아카이브(과거 연도) 질문이 많아 상대 시간 대신 정확한 날짜로 */}
                          <span className="text-muted-foreground ml-auto text-[11px] font-medium tabular-nums">
                            {new Date(t.createdAt).toLocaleDateString("ko-KR")}
                          </span>
                        </div>
                        {crumb ? <TargetCrumb segments={crumb} /> : null}
                      </>
                    );
                  })()}
                  <p className="text-[15px] leading-snug font-bold tracking-tight">
                    {t.title}
                  </p>
                  <p className="text-muted-foreground mt-1 text-[13px]">
                    {t.askerName ?? "알 수 없음"}
                    {t.answererName ? ` → ${t.answererName}` : ""}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </CommunityShell>
  );
}
