// 강사 — 훈련 항목 편집.
// 1) 판례 메타 + 항목 승인 토글
// 2) 사실관계 요약(누출 lint 표시 + AI 초안 + 저장)
// 3) 쟁점 목록(행 단위 편집/승인/삭제 + AI 초안 + 신규 추가)

import {
  AlertTriangleIcon,
  CheckIcon,
  PlusIcon,
  SparklesIcon,
  Trash2Icon,
  UndoIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Form, Link, data, useFetcher, useRevalidator } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { Textarea } from "~/core/components/ui/textarea";
import makeServerClient from "~/core/lib/supa-client.server";
import { Chip } from "~/features/community/components/community-ui";
import { lintFactsForLeakage } from "~/features/cases/lib/leakage-lint";
import { getCaseTrainingItemForStaff } from "~/features/cases/queries-case-training.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { LAW_SUBJECTS } from "~/features/subjects/lib/subjects";
import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-case-training-edit";

export const meta: Route.MetaFunction = ({ data: d }) => [
  {
    title: d?.item
      ? `${d.item.caseRef.caseTitle || d.item.caseRef.caseNumber} — 편집 | 리담변리사학원`
      : "훈련 항목 편집 | 리담변리사학원",
  },
];

export async function loader({ params, request }: Route.LoaderArgs) {
  const itemId = params.itemId;
  if (!itemId) throw data("Missing itemId", { status: 404 });
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });
  const item = await getCaseTrainingItemForStaff(client, itemId);
  if (!item) throw data("Not found", { status: 404 });
  // ⑤ 연결용 GS 회차 목록.
  const { data: roundsRaw } = await client
    .from("gs_rounds")
    .select("round_id, title, subject")
    .order("created_at", { ascending: false })
    .limit(50);
  const gsRounds = (roundsRaw ?? []).map((r) => ({
    roundId: r.round_id,
    title: r.title,
    subject: r.subject,
  }));
  return { item, gsRounds };
}

export default function AdminCaseTrainingEdit({
  loaderData,
}: Route.ComponentProps) {
  const { item: itemBundle, gsRounds } = loaderData;
  const { item, caseRef, caseOfficialTextMd, problemRef, issues } = itemBundle;
  const itemId = item.itemId;

  // feat-2-028 — 기출 소스: 발문이 지문이라 사실관계 요건 없음.
  const isProblemSource = !!problemRef;
  const approvedIssueCount = issues.filter(
    (i) => i.reviewStatus === "approved",
  ).length;
  const canApprove = isProblemSource
    ? approvedIssueCount >= 2
    : item.factsSummaryMd.trim().length >= 50 && approvedIssueCount >= 2;
  const subjectLabel = problemRef?.lawCode
    ? (LAW_SUBJECTS[problemRef.lawCode as LawSubjectSlug]?.name ??
      problemRef.lawCode)
    : null;

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8">
      {/* 헤더: 판례 메타 + 상태 + 승인 토글 */}
      <header className="border-border bg-card rounded-2xl border p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusChip status={item.reviewStatus} />
              {isProblemSource ? (
                <>
                  <Chip tone="primary">2차 기출</Chip>
                  <Chip tone="outline">{subjectLabel ?? "과목 미상"}</Chip>
                  <Chip tone="outline">
                    {problemRef?.year ?? "—"}년 제
                    {problemRef?.problemNumber ?? "—"}문
                  </Chip>
                </>
              ) : (
                <>
                  <Chip tone="outline">{caseRef.caseNumber}</Chip>
                  <Chip tone="outline">{caseRef.court}</Chip>
                  <Chip tone="outline">{caseRef.decidedAt}</Chip>
                </>
              )}
            </div>
            <p className="text-foreground mt-1 text-lg font-bold">
              {isProblemSource
                ? `${subjectLabel ?? ""} ${problemRef?.year ?? "?"}년 2차 제${problemRef?.problemNumber ?? "?"}문`.trim()
                : caseRef.caseTitle}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              {isProblemSource
                ? `발문 ${problemRef?.bodyMd.length ?? 0}자`
                : `사실관계 ${item.factsSummaryMd.length}자`}{" "}
              · 쟁점{" "}
              <strong className="text-foreground">{approvedIssueCount}</strong>/
              {issues.length}건 승인
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <ApproveItemToggle
              itemId={itemId}
              status={item.reviewStatus}
              canApprove={canApprove}
            />
            <DeleteItemButton itemId={itemId} />
            <Button asChild variant="ghost" size="sm" className="rounded-full">
              <Link to="/admin/case-training">목록</Link>
            </Button>
          </div>
        </div>
        {!canApprove && item.reviewStatus !== "approved" ? (
          <p className="text-muted-foreground mt-2 text-xs">
            {isProblemSource
              ? "ⓘ 항목 승인 요건: 승인된 쟁점 2건 이상."
              : "ⓘ 항목 승인 요건: 사실관계 50자 이상 + 승인된 쟁점 2건 이상."}
          </p>
        ) : null}
      </header>

      {isProblemSource ? (
        // 기출 소스 — 발문이 지문(읽기 전용). 사실관계 편집 대신 발문 미리보기.
        <section className="border-border bg-card rounded-2xl border p-4 shadow-sm">
          <p className="text-muted-foreground mb-2 text-[11px] font-bold tracking-widest uppercase">
            발문 (지문 — 학생에게 그대로 제시)
          </p>
          <div className="text-[15px] leading-relaxed whitespace-pre-line">
            {problemRef?.bodyMd || "(발문 없음)"}
          </div>
        </section>
      ) : (
        /* 사실관계 요약 */
        <FactsSection
          itemId={itemId}
          initialFacts={item.factsSummaryMd}
          factsGeneratedBy={item.factsGeneratedBy}
          hasOfficialText={!!caseOfficialTextMd}
        />
      )}

      {/* 쟁점 목록 — 기출 소스는 발문 존재가 AI 초안 가능 조건 */}
      <IssuesSection
        itemId={itemId}
        issues={issues}
        hasOfficialText={
          isProblemSource
            ? (problemRef?.bodyMd.trim().length ?? 0) >= 30
            : !!caseOfficialTextMd
        }
      />

      {/* ③④ 결론·강약 기준 + ⑤ GS 답안작성 연결 */}
      <ConclusionsSection
        itemId={itemId}
        issues={issues}
        linkedGsRoundId={item.linkedGsRoundId}
        gsRounds={gsRounds}
        hasOfficialText={
          isProblemSource
            ? (problemRef?.bodyMd.trim().length ?? 0) >= 30
            : !!caseOfficialTextMd
        }
      />
    </main>
  );
}

function StatusChip({ status }: { status: "draft" | "approved" | "rejected" }) {
  if (status === "approved") return <Chip tone="emerald">승인됨</Chip>;
  if (status === "rejected") return <Chip tone="coral">반려</Chip>;
  return <Chip tone="outline">초안</Chip>;
}

function ApproveItemToggle({
  itemId,
  status,
  canApprove,
}: {
  itemId: string;
  status: "draft" | "approved" | "rejected";
  canApprove: boolean;
}) {
  const fetcher = useFetcher();
  const revalidator = useRevalidator();
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) revalidator.revalidate();
  }, [fetcher.state, fetcher.data, revalidator]);
  if (status === "approved") {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="rounded-full"
        onClick={() => {
          if (!confirm("항목 승인을 취소합니다. 학생 노출이 차단됩니다.")) return;
          const fd = new FormData();
          fd.set("intent", "unapprove");
          fd.set("itemId", itemId);
          fetcher.submit(fd, { method: "post", action: "/api/case-training/item" });
        }}
      >
        <UndoIcon className="size-3" /> 승인 취소
      </Button>
    );
  }
  return (
    <Button
      type="button"
      size="sm"
      className="rounded-full"
      disabled={!canApprove || fetcher.state !== "idle"}
      onClick={() => {
        if (!confirm("이 훈련 항목을 승인합니다. 학생에게 노출됩니다.")) return;
        const fd = new FormData();
        fd.set("intent", "approve");
        fd.set("itemId", itemId);
        fetcher.submit(fd, { method: "post", action: "/api/case-training/item" });
      }}
    >
      <CheckIcon className="size-3" /> 항목 승인
    </Button>
  );
}

function DeleteItemButton({ itemId }: { itemId: string }) {
  return (
    <Form method="post" action="/api/case-training/item">
      <input type="hidden" name="intent" value="delete" />
      <input type="hidden" name="itemId" value={itemId} />
      <Button
        type="submit"
        size="sm"
        variant="outline"
        className="rounded-full text-rose-600 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/30"
        onClick={(e) => {
          if (!confirm("이 훈련 항목을 삭제(soft)합니다. 진행하시겠습니까?"))
            e.preventDefault();
        }}
      >
        <Trash2Icon className="size-3" /> 삭제
      </Button>
    </Form>
  );
}

/* ── 사실관계 ─────────────────────────────────────────────────────────── */

function FactsSection({
  itemId,
  initialFacts,
  factsGeneratedBy,
  hasOfficialText,
}: {
  itemId: string;
  initialFacts: string;
  factsGeneratedBy: "ai" | "staff";
  hasOfficialText: boolean;
}) {
  const [text, setText] = useState(initialFacts);
  const saveFetcher = useFetcher<{ ok?: true; error?: string }>();
  const aiFetcher = useFetcher<{
    ok?: true;
    error?: string;
    capBlocked?: boolean;
    factsMd?: string;
  }>();
  const revalidator = useRevalidator();
  const lastSavedRef = useRef(initialFacts);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // AI 초안 도착 시 textarea 갱신.
  useEffect(() => {
    if (
      aiFetcher.state === "idle" &&
      aiFetcher.data &&
      "factsMd" in aiFetcher.data &&
      aiFetcher.data.factsMd
    ) {
      setText(aiFetcher.data.factsMd);
      lastSavedRef.current = aiFetcher.data.factsMd;
      revalidator.revalidate();
    }
  }, [aiFetcher.state, aiFetcher.data, revalidator]);

  // autosave 1500ms.
  useEffect(() => {
    if (text === lastSavedRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const fd = new FormData();
      fd.set("intent", "update_facts");
      fd.set("itemId", itemId);
      fd.set("factsMd", text);
      saveFetcher.submit(fd, {
        method: "post",
        action: "/api/case-training/item",
      });
      lastSavedRef.current = text;
    }, 1500);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, itemId]);

  const lint = useMemo(() => lintFactsForLeakage(text), [text]);

  const generateAi = () => {
    if (text.trim().length > 0) {
      if (!confirm("기존 사실관계를 AI 초안으로 덮어씁니다. 진행하시겠습니까?"))
        return;
    }
    const fd = new FormData();
    fd.set("itemId", itemId);
    fd.set("mode", "facts");
    aiFetcher.submit(fd, {
      method: "post",
      action: "/api/case-training/draft-ai",
    });
  };

  const aiBusy = aiFetcher.state !== "idle";
  const aiError =
    aiFetcher.data && "error" in aiFetcher.data ? aiFetcher.data.error : null;

  return (
    <section className="border-border bg-card space-y-3 rounded-2xl border p-4 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-foreground font-bold">사실관계 요약</p>
          <p className="text-muted-foreground text-xs">
            학생에게 사례로 제시되는 텍스트.{" "}
            <strong>쟁점·판단·결론 누출 금지</strong>.{" "}
            {factsGeneratedBy === "ai" ? "(AI 초안)" : "(직접 작성)"}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={generateAi}
          disabled={aiBusy || !hasOfficialText}
          className="rounded-full"
        >
          <SparklesIcon className="size-3" />
          {aiBusy ? "생성 중…" : "AI 초안"}
        </Button>
      </div>
      {aiError ? (
        <p className="text-rose-600 dark:text-rose-300 text-xs">{aiError}</p>
      ) : null}

      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="시간순으로 사실만 기술. 법원의 판단·쟁점·결론은 제외."
        className="min-h-[180px] text-sm leading-relaxed"
      />
      <div className="flex flex-wrap items-center gap-3 text-[11px]">
        <span className="text-muted-foreground tabular-nums">
          {text.length}자
        </span>
        <span className="text-muted-foreground">
          {saveFetcher.state !== "idle"
            ? "저장 중…"
            : text === lastSavedRef.current
              ? "자동 저장됨"
              : "변경 — 곧 저장"}
        </span>
      </div>

      {lint.hasLeakage ? (
        <div className="border-amber-300/40 bg-amber-50/30 dark:border-amber-700/40 dark:bg-amber-950/30 rounded-xl border p-3">
          <div className="flex items-start gap-2">
            <AlertTriangleIcon className="text-amber-600 dark:text-amber-300 mt-0.5 size-4 shrink-0" />
            <div className="text-xs leading-relaxed">
              <p className="text-foreground font-bold">
                누출 의심 키워드 {lint.hits.length}건 — 쟁점·판단·결론이 사실관계
                안에 섞여 있을 수 있습니다
              </p>
              <ul className="text-muted-foreground mt-1 list-disc space-y-0.5 pl-4">
                {lint.hits.slice(0, 5).map((h, i) => (
                  <li key={i}>
                    <strong>{h.pattern}</strong>:{" "}
                    <span className="italic">"…{h.excerpt}…"</span>
                  </li>
                ))}
                {lint.hits.length > 5 ? (
                  <li>외 {lint.hits.length - 5}건 더…</li>
                ) : null}
              </ul>
              <p className="text-muted-foreground mt-1">
                ⚠ 경고만 표시되고 강제 차단은 아닙니다. 강사 판단으로 수정 후
                승인하세요.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

/* ── 쟁점 목록 ────────────────────────────────────────────────────────── */

function IssuesSection({
  itemId,
  issues,
  hasOfficialText,
}: {
  itemId: string;
  issues: Array<{
    issueId: string;
    label: string;
    descriptionMd: string | null;
    importance: "core" | "side";
    refHint: string | null;
    orderIndex: number;
    reviewStatus: "draft" | "approved" | "rejected";
    generatedBy: "ai" | "staff";
  }>;
  hasOfficialText: boolean;
}) {
  const aiFetcher = useFetcher<{
    ok?: true;
    error?: string;
    capBlocked?: boolean;
    inserted?: number;
  }>();
  const revalidator = useRevalidator();
  useEffect(() => {
    if (
      aiFetcher.state === "idle" &&
      aiFetcher.data &&
      "ok" in aiFetcher.data &&
      aiFetcher.data.ok
    ) {
      revalidator.revalidate();
    }
  }, [aiFetcher.state, aiFetcher.data, revalidator]);

  const aiBusy = aiFetcher.state !== "idle";
  const aiError =
    aiFetcher.data && "error" in aiFetcher.data ? aiFetcher.data.error : null;

  const generateAi = () => {
    if (issues.length > 0) {
      if (
        !confirm("기존 쟁점을 그대로 두고 AI 초안 N건을 추가합니다. 진행하시겠습니까?")
      )
        return;
    }
    const fd = new FormData();
    fd.set("itemId", itemId);
    fd.set("mode", "issues");
    aiFetcher.submit(fd, {
      method: "post",
      action: "/api/case-training/draft-ai",
    });
  };

  return (
    <section className="border-border bg-card space-y-3 rounded-2xl border p-4 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-foreground font-bold">쟁점 목록 (채점 기준)</p>
          <p className="text-muted-foreground text-xs">
            행 단위 승인. importance=core 는 합격선 결정 쟁점.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={generateAi}
          disabled={aiBusy || !hasOfficialText}
          className="rounded-full"
        >
          <SparklesIcon className="size-3" />
          {aiBusy ? "생성 중…" : "AI 초안 추가"}
        </Button>
      </div>
      {aiError ? (
        <p className="text-rose-600 dark:text-rose-300 text-xs">{aiError}</p>
      ) : null}

      {issues.length === 0 ? (
        <p className="text-muted-foreground py-4 text-center text-xs">
          아직 등록된 쟁점이 없습니다. "AI 초안 추가" 또는 아래 폼으로 직접
          추가.
        </p>
      ) : (
        <ul className="space-y-2">
          {issues.map((iss) => (
            <IssueRow key={iss.issueId} issue={iss} />
          ))}
        </ul>
      )}

      <NewIssueForm itemId={itemId} />
    </section>
  );
}

function IssueRow({
  issue,
}: {
  issue: {
    issueId: string;
    label: string;
    descriptionMd: string | null;
    importance: "core" | "side";
    refHint: string | null;
    reviewStatus: "draft" | "approved" | "rejected";
    generatedBy: "ai" | "staff";
  };
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(issue.label);
  const [desc, setDesc] = useState(issue.descriptionMd ?? "");
  const [importance, setImportance] = useState<"core" | "side">(issue.importance);
  const [refHint, setRefHint] = useState(issue.refHint ?? "");
  const fetcher = useFetcher();
  const revalidator = useRevalidator();
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      setEditing(false);
      revalidator.revalidate();
    }
  }, [fetcher.state, fetcher.data, revalidator]);

  const save = () => {
    const fd = new FormData();
    fd.set("intent", "update");
    fd.set("issueId", issue.issueId);
    fd.set("label", label);
    fd.set("descriptionMd", desc);
    fd.set("importance", importance);
    fd.set("refHint", refHint);
    fetcher.submit(fd, { method: "post", action: "/api/case-training/issue" });
  };
  const approve = () => {
    const fd = new FormData();
    fd.set("intent", issue.reviewStatus === "approved" ? "unapprove" : "approve");
    fd.set("issueId", issue.issueId);
    fetcher.submit(fd, { method: "post", action: "/api/case-training/issue" });
  };
  const remove = () => {
    if (!confirm("이 쟁점을 삭제(soft)합니다.")) return;
    const fd = new FormData();
    fd.set("intent", "delete");
    fd.set("issueId", issue.issueId);
    fetcher.submit(fd, { method: "post", action: "/api/case-training/issue" });
  };

  if (editing) {
    return (
      <li className="border-primary/40 bg-primary/[0.03] space-y-2 rounded-xl border p-3">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="쟁점 라벨"
        />
        <Textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="설명 (1~2문장)"
          className="min-h-[60px] text-sm"
        />
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={importance}
            onChange={(e) => setImportance(e.target.value as "core" | "side")}
            className="border-border bg-background rounded-full border px-3 py-1 text-xs"
          >
            <option value="core">핵심 (core)</option>
            <option value="side">부차 (side)</option>
          </select>
          <Input
            value={refHint}
            onChange={(e) => setRefHint(e.target.value)}
            placeholder="근거 (예: 특허법 제29조)"
            className="flex-1"
          />
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            onClick={save}
            className="rounded-full"
            disabled={fetcher.state !== "idle"}
          >
            저장
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setEditing(false)}
            className="rounded-full"
          >
            취소
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li
      className={
        issue.reviewStatus === "approved"
          ? "border-emerald-300/40 bg-emerald-50/30 dark:border-emerald-700/40 dark:bg-emerald-950/20 rounded-xl border p-3"
          : "border-border bg-card rounded-xl border p-3"
      }
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip tone={issue.importance === "core" ? "primary" : "outline"}>
              {issue.importance === "core" ? "핵심" : "부차"}
            </Chip>
            {issue.reviewStatus === "approved" ? (
              <Chip tone="emerald">승인</Chip>
            ) : (
              <Chip tone="outline">초안</Chip>
            )}
            {issue.generatedBy === "ai" ? (
              <Chip tone="outline">AI</Chip>
            ) : null}
            <p className="text-foreground text-sm font-bold">{issue.label}</p>
            {issue.refHint ? <Chip tone="outline">{issue.refHint}</Chip> : null}
          </div>
          {issue.descriptionMd ? (
            <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
              {issue.descriptionMd}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setEditing(true)}
            className="h-7 rounded-full"
          >
            편집
          </Button>
          <Button
            type="button"
            size="sm"
            variant={issue.reviewStatus === "approved" ? "outline" : "default"}
            onClick={approve}
            disabled={fetcher.state !== "idle"}
            className="h-7 rounded-full"
          >
            {issue.reviewStatus === "approved" ? (
              <>
                <UndoIcon className="size-3" /> 취소
              </>
            ) : (
              <>
                <CheckIcon className="size-3" /> 승인
              </>
            )}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={remove}
            disabled={fetcher.state !== "idle"}
            className="h-7 rounded-full text-rose-600 dark:text-rose-300"
          >
            <XIcon className="size-3" /> 삭제
          </Button>
        </div>
      </div>
    </li>
  );
}

/* ── ③④ 결론·강약 + ⑤ GS 연결 ─────────────────────────────────────── */

function ConclusionsSection({
  itemId,
  issues,
  linkedGsRoundId,
  gsRounds,
  hasOfficialText,
}: {
  itemId: string;
  issues: Array<{
    issueId: string;
    label: string;
    importance: "core" | "side";
    weight: number | null;
    modelConclusionDirection: string | null;
    modelConclusionMd: string | null;
    reviewStatus: "draft" | "approved" | "rejected";
  }>;
  linkedGsRoundId: string | null;
  gsRounds: Array<{ roundId: string; title: string; subject: string }>;
  hasOfficialText: boolean;
}) {
  const aiFetcher = useFetcher<{
    ok?: true;
    error?: string;
    inserted?: number;
  }>();
  const linkFetcher = useFetcher();
  const revalidator = useRevalidator();
  useEffect(() => {
    if (aiFetcher.state === "idle" && aiFetcher.data && "ok" in aiFetcher.data)
      revalidator.revalidate();
  }, [aiFetcher.state, aiFetcher.data, revalidator]);
  useEffect(() => {
    if (linkFetcher.state === "idle" && linkFetcher.data) revalidator.revalidate();
  }, [linkFetcher.state, linkFetcher.data, revalidator]);

  const aiBusy = aiFetcher.state !== "idle";
  const aiError =
    aiFetcher.data && "error" in aiFetcher.data ? aiFetcher.data.error : null;

  const liveIssues = issues.filter((i) => i.reviewStatus !== "rejected");
  const withConclusion = liveIssues.filter(
    (i) => (i.modelConclusionDirection ?? "").trim().length > 0,
  ).length;

  const generateAi = () => {
    if (withConclusion > 0) {
      if (!confirm("기존 결론을 AI 초안으로 덮어씁니다. 진행하시겠습니까?")) return;
    }
    const fd = new FormData();
    fd.set("itemId", itemId);
    fd.set("mode", "conclusions");
    aiFetcher.submit(fd, {
      method: "post",
      action: "/api/case-training/draft-ai",
    });
  };

  const setLinkedGs = (roundId: string) => {
    const fd = new FormData();
    fd.set("intent", "update_linked_gs");
    fd.set("itemId", itemId);
    fd.set("roundId", roundId);
    linkFetcher.submit(fd, {
      method: "post",
      action: "/api/case-training/item",
    });
  };

  return (
    <section className="border-border bg-card space-y-3 rounded-2xl border p-4 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-foreground font-bold">
            ③ 결론도출 + ④ 응용목차 — 채점 기준 (선택)
          </p>
          <p className="text-muted-foreground text-xs">
            각 쟁점에 모범 결론·근거·권장 비중(0~100, 선택)을 설정. 결론 정보가
            2건 이상 채워지면 학생 응시 가능.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={generateAi}
          disabled={aiBusy || !hasOfficialText || liveIssues.length < 2}
          className="rounded-full"
        >
          <SparklesIcon className="size-3" />
          {aiBusy ? "생성 중…" : "AI 결론·강약 초안"}
        </Button>
      </div>
      {aiError ? (
        <p className="text-rose-600 dark:text-rose-300 text-xs">{aiError}</p>
      ) : null}
      <p className="text-muted-foreground text-[11px]">
        결론 정보 있음:{" "}
        <strong className="text-foreground tabular-nums">
          {withConclusion}
        </strong>
        /{liveIssues.length}건
      </p>

      <ul className="space-y-2">
        {liveIssues.map((iss) => (
          <ConclusionRow key={iss.issueId} issue={iss} />
        ))}
      </ul>

      {/* ⑤ GS 연결 */}
      <div className="border-border space-y-2 rounded-xl border border-dashed p-3">
        <p className="text-muted-foreground font-mono text-[10px] font-bold tracking-[0.06em] uppercase">
          ⑤ GS 답안작성 회차 연결 (선택)
        </p>
        <p className="text-muted-foreground text-[11px]">
          결과 화면에서 학생이 "답안 작성으로 →" 진입할 수 있습니다.
        </p>
        <select
          value={linkedGsRoundId ?? ""}
          onChange={(e) => setLinkedGs(e.target.value)}
          className="border-border bg-background w-full rounded-lg border px-3 py-2 text-sm"
          disabled={linkFetcher.state !== "idle"}
        >
          <option value="">— 연결 없음 —</option>
          {gsRounds.map((r) => (
            <option key={r.roundId} value={r.roundId}>
              [{r.subject}] {r.title}
            </option>
          ))}
        </select>
      </div>
    </section>
  );
}

function ConclusionRow({
  issue,
}: {
  issue: {
    issueId: string;
    label: string;
    importance: "core" | "side";
    weight: number | null;
    modelConclusionDirection: string | null;
    modelConclusionMd: string | null;
  };
}) {
  const [direction, setDirection] = useState(
    issue.modelConclusionDirection ?? "",
  );
  const [rationale, setRationale] = useState(issue.modelConclusionMd ?? "");
  const [weight, setWeight] = useState<string>(
    issue.weight !== null ? String(issue.weight) : "",
  );
  const fetcher = useFetcher();
  const revalidator = useRevalidator();
  const lastSavedRef = useRef(
    `${issue.modelConclusionDirection ?? ""}|${issue.modelConclusionMd ?? ""}|${issue.weight ?? ""}`,
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const cur = `${direction}|${rationale}|${weight}`;
    if (cur === lastSavedRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const fd = new FormData();
      fd.set("intent", "update_conclusion");
      fd.set("issueId", issue.issueId);
      fd.set("modelConclusionDirection", direction);
      fd.set("modelConclusionMd", rationale);
      if (weight !== "") fd.set("weight", weight);
      fetcher.submit(fd, { method: "post", action: "/api/case-training/issue" });
      lastSavedRef.current = cur;
    }, 1500);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [direction, rationale, weight]);
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) revalidator.revalidate();
  }, [fetcher.state, fetcher.data, revalidator]);

  return (
    <li className="border-border bg-card space-y-2 rounded-xl border p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip tone={issue.importance === "core" ? "primary" : "outline"}>
          {issue.importance === "core" ? "핵심" : "부차"}
        </Chip>
        <p className="text-foreground text-sm font-bold">{issue.label}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_120px]">
        <Input
          value={direction}
          onChange={(e) => setDirection(e.target.value)}
          placeholder="결론 (예: 인정 / 부정)"
        />
        <Input
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          placeholder="weight 0-100"
          type="number"
          min={0}
          max={100}
        />
      </div>
      <Textarea
        value={rationale}
        onChange={(e) => setRationale(e.target.value)}
        placeholder="근거 (1~2문장)"
        className="min-h-[50px] text-xs"
      />
    </li>
  );
}

function NewIssueForm({ itemId }: { itemId: string }) {
  const fetcher = useFetcher();
  const formRef = useRef<HTMLFormElement>(null);
  const revalidator = useRevalidator();
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      formRef.current?.reset();
      revalidator.revalidate();
    }
  }, [fetcher.state, fetcher.data, revalidator]);

  return (
    <fetcher.Form
      ref={formRef}
      method="post"
      action="/api/case-training/issue"
      className="border-border space-y-2 rounded-xl border border-dashed p-3"
    >
      <input type="hidden" name="intent" value="create" />
      <input type="hidden" name="itemId" value={itemId} />
      <p className="text-muted-foreground font-mono text-[10px] font-bold tracking-[0.06em] uppercase">
        새 쟁점 추가
      </p>
      <Input name="label" placeholder="쟁점 라벨 (예: 신규성 위반 여부)" required />
      <Textarea
        name="descriptionMd"
        placeholder="설명 (선택, 1~2문장)"
        className="min-h-[50px] text-sm"
      />
      <div className="flex flex-wrap items-center gap-2">
        <select
          name="importance"
          defaultValue="core"
          className="border-border bg-background rounded-full border px-3 py-1 text-xs"
        >
          <option value="core">핵심</option>
          <option value="side">부차</option>
        </select>
        <Input
          name="refHint"
          placeholder="근거 (선택, 예: 특허법 제29조)"
          className="flex-1"
        />
        <Button
          type="submit"
          size="sm"
          className="rounded-full"
          disabled={fetcher.state !== "idle"}
        >
          <PlusIcon className="size-3" /> 추가
        </Button>
      </div>
    </fetcher.Form>
  );
}
