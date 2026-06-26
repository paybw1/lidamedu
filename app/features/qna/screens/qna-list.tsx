import {
  InfoIcon,
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
  relativeKo,
} from "~/features/community/components/community-ui";
import { CommunityShell } from "~/features/community/components/community-shell";
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
  case: "violet",
  problem: "amber",
  study_method: "emerald",
  general: "neutral",
};

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

  return {
    threads,
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
        <Button asChild size="sm" className="h-9 rounded-full">
          <Link to="/qna/new?targetType=study_method" viewTransition>
            <PencilLineIcon className="size-4" /> 공부방법 질문
          </Link>
        </Button>
      }
    >
      {/* 안내 — 학습과목(조문·판례·문제) 질문은 해당 상세 화면에서 대상에 연결해 작성. */}
      <div className="border-primary/20 bg-primary/[0.04] mb-3.5 flex items-start gap-2.5 rounded-2xl border p-3.5">
        <InfoIcon className="text-link mt-0.5 size-4 shrink-0" />
        <p className="text-muted-foreground text-[13px] leading-relaxed">
          <strong className="text-foreground">조문·판례·문제</strong>에 대한 질문은
          해당 <strong className="text-foreground">상세 화면의 ‘Q&amp;A’ 패널</strong>
          에서 남겨 주세요. 질문이 그 내용에 자동으로 연결돼 더 정확한 답변을 받을 수
          있어요. <strong className="text-foreground">공부방법</strong> 등 일반 질문은
          여기서 <strong className="text-foreground">‘공부방법 질문’</strong> 으로
          작성하시면 됩니다.
        </p>
      </div>

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
                : "조문·판례·문제 상세 화면, 또는 ‘공부방법 질문’ 으로 질문할 수 있습니다. AI/강사가 답변을 합니다."
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
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                    <Chip tone={TARGET_TONE[t.targetType]}>
                      {QNA_TARGET_LABEL[t.targetType]}
                    </Chip>
                    {t.subject ? (
                      <Chip tone="neutral">{subjectLabel(t.subject)}</Chip>
                    ) : null}
                    <Chip tone={isWaiting ? "coral" : "emerald"}>
                      {QNA_STATUS_LABEL[t.status]}
                    </Chip>
                    {isMine ? <Chip tone="outline">내 질문</Chip> : null}
                    {isMyAnswer ? <Chip tone="outline">내 답변</Chip> : null}
                    <span className="text-muted-foreground ml-auto text-[11px] font-medium tabular-nums">
                      {relativeKo(t.createdAt)}
                    </span>
                  </div>
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
