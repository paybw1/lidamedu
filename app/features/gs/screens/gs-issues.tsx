// 학생 — 논점 추출 훈련 색인. /gs/issues
// 승인된 논점 ≥1 인 GS 문항만 노출. 본인 attempt 상태 chip + 진입 link.

import {
  ArrowRightIcon,
  BookOpenIcon,
  CheckCircle2Icon,
  PencilLineIcon,
  TargetIcon,
} from "lucide-react";
import { Link, data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { cn } from "~/core/lib/utils";
import { MockExamShell } from "~/features/mcq-exams/components/mock-exam-shell";
import { Chip } from "~/features/community/components/community-ui";
import {
  type IssueIndexItem,
  listIssueQuestionsForStudent,
} from "~/features/gs/queries-issue-attempts.server";
import {
  LAW_SUBJECTS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/gs-issues";

export const meta: Route.MetaFunction = () => [
  { title: "논점 추출 훈련 | Lidam Patent Attorney Academy" },
];

const SUBJECT_OPTIONS: Array<{ value: LawSubjectSlug | "all"; label: string }> = [
  { value: "all", label: "전체 과목" },
  { value: "patent", label: "특허법" },
  { value: "trademark", label: "상표법" },
  { value: "design", label: "디자인보호법" },
  { value: "civil", label: "민법" },
  { value: "civil-procedure", label: "민사소송법" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const subjectRaw = url.searchParams.get("subject");
  const subject: LawSubjectSlug | undefined =
    subjectRaw === "patent" ||
    subjectRaw === "trademark" ||
    subjectRaw === "design" ||
    subjectRaw === "civil" ||
    subjectRaw === "civil-procedure"
      ? subjectRaw
      : undefined;

  const items = await listIssueQuestionsForStudent(client, user.id, { subject });
  return { items, subject: subject ?? "all" };
}

export default function GsIssuesIndex({ loaderData }: Route.ComponentProps) {
  const { items, subject } = loaderData;

  const todo = items.filter((it) => !it.myAttempt);
  const inProgress = items.filter(
    (it) => it.myAttempt && !it.myAttempt.submittedAt,
  );
  const submitted = items.filter(
    (it) => it.myAttempt?.submittedAt && !it.myAttempt.selfCheckedAt,
  );
  const done = items.filter((it) => it.myAttempt?.selfCheckedAt);

  return (
    <MockExamShell
      category="gs"
      width="feed"
      title="논점 추출 훈련"
      desc="사례를 보고 핵심 논점을 백지에서 직접 적은 뒤 모범 논점과 대조합니다. 답안 전체를 쓰는 게 아니라 빠르게 반복하세요."
      backLink={{ to: "/gs", label: "온라인 GS" }}
    >
      {/* 과목 필터 */}
      <nav className="mb-4 flex flex-wrap gap-1.5">
        {SUBJECT_OPTIONS.map((o) => (
          <Link
            key={o.value}
            to={o.value === "all" ? "/gs/issues" : `/gs/issues?subject=${o.value}`}
            className={cn(
              "rounded-full px-3 py-1 text-xs transition-colors",
              subject === o.value || (subject === "all" && o.value === "all")
                ? "bg-primary text-primary-foreground font-bold"
                : "border-border bg-card text-muted-foreground hover:border-primary",
            )}
          >
            {o.label}
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <EmptyMsg />
      ) : (
        <>
          {todo.length > 0 ? (
            <Section title="아직 안 풀어본 문항" count={todo.length} tone="primary">
              {todo.map((it) => (
                <QuestionCard key={it.gsQuestionId} item={it} />
              ))}
            </Section>
          ) : null}

          {inProgress.length > 0 ? (
            <Section title="진행 중 (저장됨)" count={inProgress.length} tone="amber">
              {inProgress.map((it) => (
                <QuestionCard key={it.gsQuestionId} item={it} />
              ))}
            </Section>
          ) : null}

          {submitted.length > 0 ? (
            <Section
              title="제출 — 자기채점 대기"
              count={submitted.length}
              tone="amber"
            >
              {submitted.map((it) => (
                <QuestionCard key={it.gsQuestionId} item={it} />
              ))}
            </Section>
          ) : null}

          {done.length > 0 ? (
            <Section title="자기채점 완료" count={done.length} tone="emerald">
              {done.map((it) => (
                <QuestionCard key={it.gsQuestionId} item={it} />
              ))}
            </Section>
          ) : null}
        </>
      )}
    </MockExamShell>
  );
}

function Section({
  title,
  count,
  tone,
  children,
}: {
  title: string;
  count: number;
  tone: "primary" | "amber" | "emerald";
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5">
      <p
        className={cn(
          "text-muted-foreground mb-2 inline-flex items-center gap-2 font-mono text-[11px] font-bold tracking-[0.1em] uppercase",
        )}
      >
        {tone === "primary" ? (
          <TargetIcon className="size-3" />
        ) : tone === "amber" ? (
          <PencilLineIcon className="size-3" />
        ) : (
          <CheckCircle2Icon className="size-3" />
        )}
        {title} · {count}
      </p>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function QuestionCard({ item }: { item: IssueIndexItem }) {
  const statusChip = item.myAttempt?.selfCheckedAt ? (
    <Chip tone="emerald">자기채점 완료</Chip>
  ) : item.myAttempt?.submittedAt ? (
    <Chip tone="amber">제출 — 자기채점 대기</Chip>
  ) : item.myAttempt ? (
    <Chip tone="amber">저장됨</Chip>
  ) : (
    <Chip tone="primary">미응시</Chip>
  );
  const lawLabel = LAW_SUBJECTS[item.subject]?.name ?? item.subject;
  return (
    <Link
      to={`/gs/issues/${item.gsQuestionId}`}
      viewTransition
      className="border-border bg-card hover:border-primary block rounded-2xl border p-4 shadow-sm transition-colors"
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <Chip tone="outline">{lawLabel}</Chip>
        <span className="text-muted-foreground text-[11px]">
          {item.roundTitle}
        </span>
        <span className="text-muted-foreground text-[11px]">
          · Q{item.orderIndex + 1}
        </span>
        <span className="ml-auto inline-flex items-center gap-1">
          <BookOpenIcon className="text-muted-foreground size-3" />
          <span className="text-muted-foreground text-[11px]">
            모범 논점 {item.approvedIssueCount}개
          </span>
        </span>
      </div>
      {item.questionTitle ? (
        <p className="text-foreground mb-1 font-bold tracking-tight">
          {item.questionTitle}
        </p>
      ) : null}
      <p className="text-muted-foreground line-clamp-2 text-sm leading-relaxed">
        {item.bodyPreview}
        {item.bodyPreview.length === 160 ? "…" : ""}
      </p>
      <div className="mt-2 flex items-center justify-between">
        {statusChip}
        <span className="text-link inline-flex items-center gap-1 text-xs font-semibold">
          시작 <ArrowRightIcon className="size-3" />
        </span>
      </div>
    </Link>
  );
}

function EmptyMsg() {
  return (
    <div className="border-border bg-card rounded-2xl border p-10 text-center">
      <p className="text-foreground mb-1 text-base font-bold">
        아직 훈련 가능한 문항이 없습니다
      </p>
      <p className="text-muted-foreground text-sm">
        강사가 모범 논점을 승인하면 이곳에 등장합니다. 잠시 후 다시 확인해 주세요.
      </p>
    </div>
  );
}
