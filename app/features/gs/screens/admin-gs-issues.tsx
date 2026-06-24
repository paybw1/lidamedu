// 운영자 — 회차 단위 논점 검증 화면. /admin/gs/:roundId/issues
// 좌: 문항 목록 (draft / approved / rejected 카운트).
// 우: 선택 문항의 논점 카드들 (AI 추출 / 승인 / 반려 / 빠른 수정 / 일괄).

import {
  AlertTriangleIcon,
  CheckIcon,
  PlusIcon,
  SparklesIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { data, useFetcher, useSearchParams } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { Textarea } from "~/core/components/ui/textarea";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip } from "~/features/admin/components/admin-ui";
import {
  getGsRound,
  listGsQuestions,
  type GsQuestion,
} from "~/features/gs/queries.server";
import {
  type QuestionIssue,
  listIssuesForRoundStaff,
} from "~/features/gs/queries-issues.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/admin-gs-issues";

export const meta: Route.MetaFunction = ({ data: d }) => [
  {
    title: d?.round
      ? `${d.round.title} 논점 관리 | 리담변리사학원`
      : "GS 논점 관리 | 리담변리사학원",
  },
];

export async function loader({ params, request }: Route.LoaderArgs) {
  const roundId = params.roundId;
  if (!roundId) throw data("Missing roundId", { status: 404 });
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const [round, questions, byQuestion] = await Promise.all([
    getGsRound(client, roundId),
    listGsQuestions(client, roundId),
    listIssuesForRoundStaff(client, roundId),
  ]);
  if (!round) throw data("Round not found", { status: 404 });

  return { round, questions, byQuestion, role };
}

export default function AdminGsIssues({ loaderData }: Route.ComponentProps) {
  const { round, questions, byQuestion, role } = loaderData;
  const [searchParams, setSearchParams] = useSearchParams();
  const focusedQId =
    searchParams.get("focus") ?? questions[0]?.questionId ?? null;
  const focused = useMemo(
    () => questions.find((q) => q.questionId === focusedQId) ?? null,
    [questions, focusedQId],
  );
  const focusedIssues = focused
    ? (byQuestion.byQuestion[focused.questionId] ?? [])
    : [];

  const setFocus = (qid: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("focus", qid);
    setSearchParams(next, { preventScrollReset: true });
  };

  return (
    <AdminShell
      cluster="gs"
      role={role}
      title={`${round.title} — 논점 관리`}
      desc="모범답안에서 핵심 논점을 추출(AI)·검증(강사) 합니다. 승인된 논점만 학생 훈련 화면에 노출됩니다."
      width={1280}
    >
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        {/* 좌측 — 문항 목록 */}
        <aside className="space-y-1.5">
          <p className="text-muted-foreground mb-1 font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
            문항 ({questions.length})
          </p>
          {questions.length === 0 ? (
            <p className="text-muted-foreground border-border bg-card rounded-lg border p-4 text-center text-xs">
              아직 문항이 없습니다.
            </p>
          ) : (
            questions.map((q) => (
              <QuestionRow
                key={q.questionId}
                q={q}
                active={focusedQId === q.questionId}
                draftCount={byQuestion.draftCount[q.questionId] ?? 0}
                approvedCount={byQuestion.approvedCount[q.questionId] ?? 0}
                rejectedCount={byQuestion.rejectedCount[q.questionId] ?? 0}
                onClick={() => setFocus(q.questionId)}
              />
            ))
          )}
        </aside>

        {/* 우측 — 선택 문항 상세 + 논점 */}
        <main className="space-y-3">
          {focused ? (
            <IssuesPanel question={focused} issues={focusedIssues} />
          ) : (
            <div className="border-border bg-card text-muted-foreground rounded-xl border p-8 text-center text-sm">
              왼쪽에서 문항을 선택하세요.
            </div>
          )}
        </main>
      </div>
    </AdminShell>
  );
}

function QuestionRow({
  q,
  active,
  draftCount,
  approvedCount,
  rejectedCount,
  onClick,
}: {
  q: GsQuestion;
  active: boolean;
  draftCount: number;
  approvedCount: number;
  rejectedCount: number;
  onClick: () => void;
}) {
  const total = draftCount + approvedCount + rejectedCount;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "border-border bg-card hover:border-primary block w-full rounded-lg border p-3 text-left transition-colors",
        active && "border-primary bg-primary/[0.04]",
      )}
    >
      <p className="text-muted-foreground font-mono text-[10px] font-bold">
        Q{q.orderIndex + 1}
      </p>
      <p className="text-foreground line-clamp-2 text-xs font-semibold leading-snug">
        {q.title ?? q.bodyMd.slice(0, 60)}
      </p>
      {total > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {draftCount > 0 ? (
            <Chip tone="amber">draft {draftCount}</Chip>
          ) : null}
          {approvedCount > 0 ? (
            <Chip tone="emerald">✓ {approvedCount}</Chip>
          ) : null}
          {rejectedCount > 0 ? (
            <Chip tone="coral">반려 {rejectedCount}</Chip>
          ) : null}
        </div>
      ) : (
        <Chip tone="outline">논점 없음</Chip>
      )}
    </button>
  );
}

function IssuesPanel({
  question,
  issues,
}: {
  question: GsQuestion;
  issues: QuestionIssue[];
}) {
  const extractFetcher = useFetcher<{
    ok?: boolean;
    inserted?: number;
    error?: string;
    capBlocked?: boolean;
  }>();
  const bulkFetcher = useFetcher<{ ok?: boolean; count?: number; error?: string }>();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const draftIssues = issues.filter((i) => i.reviewStatus === "draft");
  const approvedIssues = issues.filter((i) => i.reviewStatus === "approved");
  const rejectedIssues = issues.filter((i) => i.reviewStatus === "rejected");

  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const bulkApprove = () => {
    if (selected.size === 0) return;
    if (!confirm(`선택한 ${selected.size}건을 일괄 승인합니다.`)) return;
    const fd = new FormData();
    fd.set("intent", "bulk_approve");
    fd.set("issueIds", JSON.stringify([...selected]));
    bulkFetcher.submit(fd, { method: "post", action: "/api/gs/issue-review" });
    setSelected(new Set());
  };
  const bulkReject = () => {
    if (selected.size === 0) return;
    const reason = prompt("일괄 반려 사유 (모든 선택 항목에 동일 적용):");
    if (!reason || reason.trim().length === 0) return;
    const fd = new FormData();
    fd.set("intent", "bulk_reject");
    fd.set("issueIds", JSON.stringify([...selected]));
    fd.set("reason", reason);
    bulkFetcher.submit(fd, { method: "post", action: "/api/gs/issue-review" });
    setSelected(new Set());
  };

  const runExtract = () => {
    if (
      !confirm(
        "AI 로 새 논점 초안을 추출합니다 (Claude 호출, GS 비용 가드 적용). 기존 논점은 유지되고 draft 가 추가됩니다.",
      )
    )
      return;
    const fd = new FormData();
    fd.set("questionId", question.questionId);
    extractFetcher.submit(fd, { method: "post", action: "/api/gs/issue-draft" });
  };

  const busyExtract = extractFetcher.state !== "idle";
  const errMsg = extractFetcher.data?.error;

  return (
    <>
      {/* 문항 본문 미리보기 */}
      <section className="border-border bg-card rounded-xl border p-4">
        <p className="text-muted-foreground mb-1 font-mono text-[10px] font-bold tracking-[0.06em] uppercase">
          Q{question.orderIndex + 1} 문항 본문 (참고)
        </p>
        {question.title ? (
          <p className="text-foreground mb-1 font-semibold">{question.title}</p>
        ) : null}
        <p className="text-foreground whitespace-pre-line text-sm leading-relaxed">
          {question.bodyMd.slice(0, 500)}
          {question.bodyMd.length > 500 ? "…" : ""}
        </p>
        {question.modelAnswerMd && question.modelAnswerMd.trim().length > 0 ? (
          <details className="mt-2">
            <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-xs">
              모범답안 미리보기 (논점 추출 source)
            </summary>
            <p className="text-muted-foreground mt-2 whitespace-pre-line text-xs leading-relaxed">
              {question.modelAnswerMd.slice(0, 1500)}
              {question.modelAnswerMd.length > 1500 ? "…" : ""}
            </p>
          </details>
        ) : (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
            ⚠ 모범답안이 비어있어 AI 추출이 안 됩니다. 회차 편집에서 채워주세요.
          </p>
        )}
      </section>

      {/* 액션 바 */}
      <section className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={runExtract}
          disabled={
            busyExtract ||
            !question.modelAnswerMd ||
            question.modelAnswerMd.trim().length < 50
          }
          className="rounded-full"
        >
          <SparklesIcon className="size-3.5" />
          {busyExtract ? "추출 중…" : "AI 로 논점 추출"}
        </Button>
        {extractFetcher.data?.inserted ? (
          <Chip tone="emerald">+{extractFetcher.data.inserted} draft</Chip>
        ) : null}
        {errMsg ? (
          <span className="inline-flex items-center gap-1 text-xs text-rose-600">
            <AlertTriangleIcon className="size-3" /> {errMsg}
          </span>
        ) : null}
        {selected.size > 0 ? (
          <div className="ml-auto inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-100/40 px-3 py-1 dark:border-amber-600/40 dark:bg-amber-950/30">
            <span className="text-xs font-semibold">
              선택 {selected.size}건
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 rounded-full"
              onClick={bulkApprove}
            >
              <CheckIcon className="size-3" /> 일괄 승인
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 rounded-full text-rose-600"
              onClick={bulkReject}
            >
              <XIcon className="size-3" /> 일괄 반려
            </Button>
          </div>
        ) : null}
      </section>

      {/* draft */}
      <IssueSection
        title="검토 대기 (draft)"
        tone="amber"
        issues={draftIssues}
        selected={selected}
        onToggle={toggleOne}
      />

      {/* approved */}
      <IssueSection
        title="승인 (학생 노출 중)"
        tone="emerald"
        issues={approvedIssues}
        selected={selected}
        onToggle={toggleOne}
      />

      {/* rejected */}
      {rejectedIssues.length > 0 ? (
        <IssueSection
          title="반려"
          tone="coral"
          issues={rejectedIssues}
          selected={selected}
          onToggle={toggleOne}
        />
      ) : null}

      {issues.length === 0 ? (
        <div className="border-border bg-card text-muted-foreground rounded-xl border p-8 text-center text-sm">
          아직 등록된 논점이 없습니다. 상단 "AI 로 논점 추출" 버튼으로 시작하세요.
        </div>
      ) : null}
    </>
  );
}

function IssueSection({
  title,
  tone,
  issues,
  selected,
  onToggle,
}: {
  title: string;
  tone: "amber" | "emerald" | "coral";
  issues: QuestionIssue[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  if (issues.length === 0) return null;
  return (
    <section>
      <p className="text-muted-foreground mb-2 inline-flex items-center gap-1.5 font-mono text-[10px] font-bold tracking-[0.1em] uppercase">
        <Chip tone={tone}>{issues.length}</Chip>
        {title}
      </p>
      <ul className="space-y-2">
        {issues.map((iss) => (
          <IssueCard
            key={iss.issueId}
            issue={iss}
            checked={selected.has(iss.issueId)}
            onToggleSelect={() => onToggle(iss.issueId)}
          />
        ))}
      </ul>
    </section>
  );
}

function IssueCard({
  issue,
  checked,
  onToggleSelect,
}: {
  issue: QuestionIssue;
  checked: boolean;
  onToggleSelect: () => void;
}) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const [editing, setEditing] = useState(false);

  const approve = () => {
    const fd = new FormData();
    fd.set("intent", "approve");
    fd.set("issueId", issue.issueId);
    fetcher.submit(fd, { method: "post", action: "/api/gs/issue-review" });
  };
  const reject = () => {
    const reason = prompt("반려 사유:");
    if (!reason || reason.trim().length === 0) return;
    const fd = new FormData();
    fd.set("intent", "reject");
    fd.set("issueId", issue.issueId);
    fd.set("reason", reason);
    fetcher.submit(fd, { method: "post", action: "/api/gs/issue-review" });
  };
  const remove = () => {
    if (!confirm("이 논점을 삭제하시겠습니까? (soft delete)")) return;
    const fd = new FormData();
    fd.set("intent", "delete");
    fd.set("issueId", issue.issueId);
    fetcher.submit(fd, { method: "post", action: "/api/gs/issue-review" });
  };

  const toneByStatus =
    issue.reviewStatus === "approved"
      ? "border-emerald-300/40 bg-emerald-50/30 dark:border-emerald-700/40 dark:bg-emerald-950/20"
      : issue.reviewStatus === "rejected"
        ? "border-rose-300/40 bg-rose-50/30 dark:border-rose-700/40 dark:bg-rose-950/20"
        : "border-amber-300/40 bg-amber-50/30 dark:border-amber-700/40 dark:bg-amber-950/20";

  return (
    <li
      className={cn(
        "rounded-xl border p-3 transition-colors",
        toneByStatus,
      )}
    >
      <div className="flex items-start gap-2">
        <label className="mt-0.5 inline-flex shrink-0 cursor-pointer items-center">
          <input
            type="checkbox"
            checked={checked}
            onChange={onToggleSelect}
            className="size-4 accent-primary"
          />
        </label>
        <div className="min-w-0 flex-1">
          {editing ? (
            <EditForm
              issue={issue}
              onClose={() => setEditing(false)}
            />
          ) : (
            <>
              <div className="flex flex-wrap items-baseline gap-2">
                <Chip tone={issue.importance === "core" ? "blue" : "neutral"}>
                  {issue.importance === "core" ? "핵심" : "부차"}
                </Chip>
                <p className="text-foreground text-sm font-bold">{issue.label}</p>
                {issue.refHint ? (
                  <Chip tone="outline">{issue.refHint}</Chip>
                ) : null}
                <Chip tone="neutral">
                  {issue.generatedBy === "ai" ? "AI 초안" : "강사 수기"}
                </Chip>
              </div>
              {issue.descriptionMd ? (
                <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                  {issue.descriptionMd}
                </p>
              ) : null}
              {issue.reviewStatus === "rejected" && issue.rejectedReason ? (
                <p className="mt-1 text-xs text-rose-600">
                  반려 사유: {issue.rejectedReason}
                </p>
              ) : null}
            </>
          )}
        </div>
        {!editing ? (
          <div className="flex shrink-0 flex-col gap-1">
            {issue.reviewStatus !== "approved" ? (
              <Button
                size="sm"
                onClick={approve}
                className="h-7 rounded-full"
                disabled={fetcher.state !== "idle"}
              >
                <CheckIcon className="size-3" /> 승인
              </Button>
            ) : null}
            {issue.reviewStatus !== "rejected" ? (
              <Button
                size="sm"
                variant="outline"
                onClick={reject}
                className="h-7 rounded-full text-rose-600"
                disabled={fetcher.state !== "idle"}
              >
                반려
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditing(true)}
              className="h-7 rounded-full"
            >
              수정
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={remove}
              className="text-muted-foreground h-7 rounded-full"
              disabled={fetcher.state !== "idle"}
            >
              <Trash2Icon className="size-3" />
            </Button>
          </div>
        ) : null}
      </div>
    </li>
  );
}

function EditForm({
  issue,
  onClose,
}: {
  issue: QuestionIssue;
  onClose: () => void;
}) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const [label, setLabel] = useState(issue.label);
  const [descriptionMd, setDescriptionMd] = useState(issue.descriptionMd ?? "");
  const [importance, setImportance] = useState<"core" | "side">(issue.importance);
  const [refHint, setRefHint] = useState(issue.refHint ?? "");

  const save = () => {
    const fd = new FormData();
    fd.set("intent", "update");
    fd.set("issueId", issue.issueId);
    fd.set("label", label);
    fd.set("descriptionMd", descriptionMd);
    fd.set("importance", importance);
    fd.set("refHint", refHint);
    fetcher.submit(fd, {
      method: "post",
      action: "/api/gs/issue-review",
    });
    onClose();
  };

  return (
    <div className="space-y-2">
      <Input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        className="h-8 text-xs"
        placeholder="논점 라벨"
        maxLength={60}
      />
      <Textarea
        value={descriptionMd}
        onChange={(e) => setDescriptionMd(e.target.value)}
        className="min-h-[60px] text-xs"
        placeholder="설명 (1~2문장)"
        maxLength={600}
      />
      <div className="flex gap-2">
        <select
          value={importance}
          onChange={(e) =>
            setImportance(e.target.value === "core" ? "core" : "side")
          }
          className="border-input bg-background h-8 rounded-md border px-2 text-xs"
        >
          <option value="core">핵심 (core)</option>
          <option value="side">부차 (side)</option>
        </select>
        <Input
          value={refHint}
          onChange={(e) => setRefHint(e.target.value)}
          className="h-8 flex-1 text-xs"
          placeholder="조문/판례 (예: 특허법 제29조)"
          maxLength={100}
        />
      </div>
      <div className="flex gap-1">
        <Button
          size="sm"
          onClick={save}
          className="h-7 rounded-full"
          disabled={fetcher.state !== "idle" || label.trim().length < 2}
        >
          저장
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onClose}
          className="h-7 rounded-full"
        >
          취소
        </Button>
      </div>
    </div>
  );
}
