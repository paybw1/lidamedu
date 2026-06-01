// feat — §2 강사 검증·승인 화면. /admin/problems/review.
// 좌: 검증 대기 큐(필터 + 다중 선택 + bulk action 툴바).
// 우: 선택된 문제 상세(본문·선지·박스·근거 청크 패널 + approve/reject/quick-edit).

import {
  CheckIcon,
  CircleAlertIcon,
  ScrollTextIcon,
  XIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  Link,
  data,
  redirect,
  useFetcher,
  useSearchParams,
} from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent } from "~/core/components/ui/card";
import { Input } from "~/core/components/ui/input";
import { Textarea } from "~/core/components/ui/textarea";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { AdminSelect } from "~/features/admin/components/admin-ui";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  FORMAT_LABEL,
  ORIGIN_LABEL,
  type ProblemFormat,
  type ProblemOrigin,
} from "~/features/problems/labels";
import {
  getProblemForReview,
  listProblemsForReview,
} from "~/features/problems/queries.server";
import {
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
  type LawSubjectSlug,
  lawSubjectSlugSchema,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-problem-review";

export const meta: Route.MetaFunction = () => [
  { title: "문제 검증·승인 큐 | Lidam Patent Attorney Academy" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const lawCodeRaw = url.searchParams.get("lawCode") ?? "";
  const lawParse = lawSubjectSlugSchema.safeParse(lawCodeRaw);
  const lawCode = lawParse.success ? lawParse.data : undefined;

  const formatRaw = url.searchParams.get("format") ?? "";
  const allowedFormats: ProblemFormat[] = [
    "mc_short",
    "mc_box",
    "mc_case",
    "ox",
    "blank",
    "subjective",
  ];
  const format = allowedFormats.includes(formatRaw as ProblemFormat)
    ? (formatRaw as ProblemFormat)
    : undefined;

  const originRaw = url.searchParams.get("origin") ?? "";
  const allowedOrigins: ProblemOrigin[] = [
    "past_exam",
    "past_exam_variant",
    "expected",
    "mock",
    "ai_draft",
  ];
  const origin = allowedOrigins.includes(originRaw as ProblemOrigin)
    ? (originRaw as ProblemOrigin)
    : undefined;

  const statusRaw = url.searchParams.get("status") ?? "draft";
  const status: "draft" | "rejected" =
    statusRaw === "rejected" ? "rejected" : "draft";

  const focusId = url.searchParams.get("focus");

  const [items, detail] = await Promise.all([
    listProblemsForReview(client, {
      lawCode,
      format,
      origin,
      status,
      limit: 200,
    }),
    focusId ? getProblemForReview(client, focusId) : Promise.resolve(null),
  ]);

  return {
    items,
    detail,
    filters: { lawCode, format, origin, status },
    role,
  };
}

export default function AdminProblemReview({
  loaderData,
}: Route.ComponentProps) {
  const { items, detail, filters, role } = loaderData;
  const [searchParams, setSearchParams] = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const bulkFetcher = useFetcher<{ ok?: boolean; error?: string; count?: number }>();
  const bulkBusy = bulkFetcher.state !== "idle";

  const focusId = searchParams.get("focus");

  const setFilter = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value && value.length > 0) next.set(key, value);
    else next.delete(key);
    next.delete("focus");
    setSearchParams(next);
    setSelected(new Set());
  };

  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };
  const allSelected =
    items.length > 0 && items.every((it) => selected.has(it.problemId));
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(items.map((it) => it.problemId)));
  };

  const focusItem = useMemo(
    () =>
      focusId ? items.find((it) => it.problemId === focusId) ?? null : null,
    [items, focusId],
  );

  const bulkApprove = () => {
    if (selected.size === 0) return;
    if (!confirm(`선택한 ${selected.size}건을 일괄 승인합니다. 계속할까요?`))
      return;
    const fd = new FormData();
    fd.set("intent", "bulk-approve");
    fd.set("problemIds", [...selected].join(","));
    bulkFetcher.submit(fd, {
      method: "post",
      action: "/api/admin/problem-review",
    });
    setSelected(new Set());
  };
  const bulkReject = () => {
    if (selected.size === 0) return;
    const reason = prompt(`선택한 ${selected.size}건 반려 사유 (필수):`);
    if (!reason || reason.trim().length === 0) return;
    const fd = new FormData();
    fd.set("intent", "bulk-reject");
    fd.set("problemIds", [...selected].join(","));
    fd.set("reason", reason.trim());
    bulkFetcher.submit(fd, {
      method: "post",
      action: "/api/admin/problem-review",
    });
    setSelected(new Set());
  };

  return (
    <AdminShell
      cluster="problems"
      title="문제 검증·승인 큐"
      desc={
        <span>
          신규 등록·AI 초안의 강사 승인 게이트. <strong>승인</strong>되어야
          모의고사 picker·학습과목·맞춤퀴즈에 노출.
        </span>
      }
      role={role}
      width={1400}
      headerRight={
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>총 {items.length}건</span>
          <Link
            to="/admin/problems/new"
            className="text-primary hover:underline"
          >
            + 수기 신규 등록
          </Link>
        </div>
      }
    >
      {/* 필터 바 */}
      <div className="border-border bg-card mb-4 flex flex-wrap items-end gap-3 rounded-xl border p-3">
        <FilterCol label="과목">
          <AdminSelect
            value={filters.lawCode ?? ""}
            onChange={(e) => setFilter("lawCode", e.target.value || null)}
          >
            <option value="">전체</option>
            {LAW_SUBJECT_SLUGS.map((s) => (
              <option key={s} value={s}>
                {LAW_SUBJECTS[s as LawSubjectSlug].name}
              </option>
            ))}
          </AdminSelect>
        </FilterCol>
        <FilterCol label="형식">
          <AdminSelect
            value={filters.format ?? ""}
            onChange={(e) => setFilter("format", e.target.value || null)}
          >
            <option value="">전체</option>
            {(["mc_short", "mc_box", "mc_case"] as const).map((f) => (
              <option key={f} value={f}>
                {FORMAT_LABEL[f]}
              </option>
            ))}
          </AdminSelect>
        </FilterCol>
        <FilterCol label="출처">
          <AdminSelect
            value={filters.origin ?? ""}
            onChange={(e) => setFilter("origin", e.target.value || null)}
          >
            <option value="">전체</option>
            <option value="ai_draft">AI 초안</option>
            <option value="expected">예상문제</option>
            <option value="mock">모의고사</option>
            <option value="past_exam_variant">기출변형</option>
          </AdminSelect>
        </FilterCol>
        <FilterCol label="상태">
          <AdminSelect
            value={filters.status}
            onChange={(e) => setFilter("status", e.target.value)}
          >
            <option value="draft">검토 전 (draft)</option>
            <option value="rejected">반려 (rejected)</option>
          </AdminSelect>
        </FilterCol>
      </div>

      {/* bulk toolbar */}
      {selected.size > 0 ? (
        <div className="mb-3 flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm dark:border-amber-700/60 dark:bg-amber-950/30">
          <span className="font-semibold">선택 {selected.size}건</span>
          <Button
            size="sm"
            variant="default"
            disabled={bulkBusy}
            onClick={bulkApprove}
            className="h-7 gap-1"
          >
            <CheckIcon className="size-3.5" /> 일괄 승인
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={bulkBusy}
            onClick={bulkReject}
            className="h-7 gap-1"
          >
            <XIcon className="size-3.5" /> 일괄 반려
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelected(new Set())}
            className="ml-auto h-7"
          >
            선택 해제
          </Button>
        </div>
      ) : null}

      {/* 좌(목록) + 우(상세) split */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        {/* 목록 */}
        <div className="space-y-2">
          {items.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              검증 대기 문제가 없습니다.
            </div>
          ) : (
            <>
              <div className="text-muted-foreground flex items-center gap-2 px-2 py-1 text-[11px]">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="size-3.5"
                />
                <span>전체 선택</span>
              </div>
              {items.map((it) => (
                <ReviewListCard
                  key={it.problemId}
                  item={it}
                  checked={selected.has(it.problemId)}
                  onToggle={() => toggleOne(it.problemId)}
                  isFocused={focusId === it.problemId}
                />
              ))}
            </>
          )}
        </div>

        {/* 상세 */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          {focusItem && detail ? (
            <DetailPanel item={focusItem} detail={detail} />
          ) : (
            <Card className="border-dashed">
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                좌측에서 문제를 선택하면 상세·근거가 여기에 표시됩니다.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AdminShell>
  );
}

function FilterCol({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground font-mono text-[10px] font-bold tracking-wide uppercase">
        {label}
      </span>
      {children}
    </div>
  );
}

function ReviewListCard({
  item,
  checked,
  onToggle,
  isFocused,
}: {
  item: import("~/features/problems/queries.server").ReviewQueueItem;
  checked: boolean;
  onToggle: () => void;
  isFocused: boolean;
}) {
  const snippet =
    item.bodyMd.length > 140 ? `${item.bodyMd.slice(0, 140)}…` : item.bodyMd;
  return (
    <Card
      className={cn(
        "transition-colors",
        isFocused
          ? "border-primary ring-primary/30 ring-2"
          : "hover:border-primary/60",
      )}
    >
      <CardContent className="flex items-start gap-3 p-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="mt-1 size-3.5 shrink-0"
          aria-label="선택"
        />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="text-[10px]">
              {ORIGIN_LABEL[item.origin]}
            </Badge>
            <Badge variant="secondary" className="text-[10px]">
              {FORMAT_LABEL[item.format]}
            </Badge>
            {item.lawLabel ? (
              <Badge variant="outline" className="text-[10px]">
                {item.lawLabel}
              </Badge>
            ) : null}
            {item.primaryArticleLabel ? (
              <span className="text-muted-foreground text-[10px]">
                {item.primaryArticleLabel}
              </span>
            ) : null}
            {item.sourceChunkCount === 0 && item.origin === "ai_draft" ? (
              <Badge
                variant="outline"
                className="border-amber-400 text-[10px] text-amber-700"
              >
                <CircleAlertIcon className="size-2.5" /> 근거 부족
              </Badge>
            ) : null}
            <span className="ml-auto text-muted-foreground text-[10px]">
              {item.generatedBy ?? "수기"}
            </span>
          </div>
          <Link
            to={`?${new URLSearchParams({ focus: item.problemId }).toString()}`}
            preventScrollReset
            className="block"
          >
            <p className="text-sm break-words text-foreground">{snippet}</p>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function DetailPanel({
  item,
  detail,
}: {
  item: import("~/features/problems/queries.server").ReviewQueueItem;
  detail: import("~/features/problems/queries.server").ReviewDetail;
}) {
  const actionFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const editFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const [editMode, setEditMode] = useState(false);
  const [bodyMd, setBodyMd] = useState(detail.bodyMd);
  const [explanationMd, setExplanationMd] = useState(
    detail.explanationMd ?? "",
  );
  const busy = actionFetcher.state !== "idle";
  const editBusy = editFetcher.state !== "idle";

  const approve = () => {
    const fd = new FormData();
    fd.set("intent", "approve");
    fd.set("problemId", detail.problemId);
    actionFetcher.submit(fd, {
      method: "post",
      action: "/api/admin/problem-review",
    });
  };
  const reject = () => {
    const reason = prompt("반려 사유 (필수):");
    if (!reason || reason.trim().length === 0) return;
    const fd = new FormData();
    fd.set("intent", "reject");
    fd.set("problemId", detail.problemId);
    fd.set("reason", reason.trim());
    actionFetcher.submit(fd, {
      method: "post",
      action: "/api/admin/problem-review",
    });
  };
  const saveQuickEdit = () => {
    const fd = new FormData();
    fd.set("intent", "quick-edit");
    fd.set("problemId", detail.problemId);
    fd.set("bodyMd", bodyMd);
    fd.set("explanationMd", explanationMd);
    editFetcher.submit(fd, {
      method: "post",
      action: "/api/admin/problem-review",
    });
    setEditMode(false);
  };

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">{ORIGIN_LABEL[detail.origin]}</Badge>
            <Badge variant="secondary">{FORMAT_LABEL[detail.format]}</Badge>
            <Badge variant="outline" className="text-amber-700">
              {detail.reviewStatus}
            </Badge>
            {detail.primaryArticleLabel ? (
              <span className="text-muted-foreground text-xs">
                {detail.primaryArticleLabel}
              </span>
            ) : null}
            <Link
              to={`/admin/problems/${detail.problemId}`}
              className="ml-auto text-xs text-primary hover:underline"
            >
              깊은 편집 화면 →
            </Link>
          </div>

          {detail.rejectedReason ? (
            <div className="rounded-md border border-rose-300 bg-rose-50 p-2 text-xs text-rose-800 dark:border-rose-700/60 dark:bg-rose-950/30 dark:text-rose-300">
              <span className="font-semibold">이전 반려 사유: </span>
              {detail.rejectedReason}
            </div>
          ) : null}

          {/* 본문 */}
          <div>
            <label className="text-muted-foreground mb-1 block text-[10px] font-bold tracking-wide uppercase">
              문제 본문
            </label>
            {editMode ? (
              <Textarea
                value={bodyMd}
                onChange={(e) => setBodyMd(e.target.value)}
                rows={6}
                className="font-mono text-xs"
              />
            ) : (
              <p className="text-sm whitespace-pre-wrap">{detail.bodyMd}</p>
            )}
          </div>

          {/* 박스형 — 보기 (ㄱㄴㄷㄹㅁ) */}
          {detail.boxItems.length > 0 ? (
            <div>
              <label className="text-muted-foreground mb-1 block text-[10px] font-bold tracking-wide uppercase">
                보기 (박스)
              </label>
              <ul className="space-y-1">
                {detail.boxItems.map((b) => (
                  <li
                    key={b.boxItemId}
                    className="rounded border-border bg-muted/30 border px-2 py-1.5 text-sm"
                  >
                    <span className="mr-2 font-semibold">{b.marker}.</span>
                    {b.bodyMd}
                    {b.oxTruth ? (
                      <span className="ml-2 text-[10px] text-muted-foreground">
                        ({b.oxTruth})
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* 선지 */}
          {detail.choices.length > 0 ? (
            <div>
              <label className="text-muted-foreground mb-1 block text-[10px] font-bold tracking-wide uppercase">
                선지
              </label>
              <ol className="space-y-1 pl-0">
                {detail.choices.map((c) => (
                  <li
                    key={c.choiceId}
                    className={cn(
                      "rounded border px-2 py-1.5 text-sm",
                      c.isCorrect
                        ? "border-emerald-400 bg-emerald-50 dark:border-emerald-700/60 dark:bg-emerald-950/30"
                        : "border-border bg-muted/30",
                    )}
                  >
                    <span className="mr-2 font-semibold">{c.choiceIndex}.</span>
                    {c.bodyMd || (
                      <span className="text-muted-foreground italic">
                        (비어 있음)
                      </span>
                    )}
                    {c.isCorrect ? (
                      <Badge className="ml-2 bg-emerald-600 text-[9px]">
                        정답
                      </Badge>
                    ) : null}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {/* 해설 */}
          <div>
            <label className="text-muted-foreground mb-1 block text-[10px] font-bold tracking-wide uppercase">
              해설
            </label>
            {editMode ? (
              <Textarea
                value={explanationMd}
                onChange={(e) => setExplanationMd(e.target.value)}
                rows={4}
                className="font-mono text-xs"
              />
            ) : (
              <p className="text-muted-foreground text-sm whitespace-pre-wrap">
                {detail.explanationMd || "(해설 없음)"}
              </p>
            )}
          </div>

          {/* actions */}
          <div className="flex flex-wrap gap-2 pt-1">
            {editMode ? (
              <>
                <Button
                  size="sm"
                  variant="default"
                  disabled={editBusy}
                  onClick={saveQuickEdit}
                >
                  저장
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditMode(false);
                    setBodyMd(detail.bodyMd);
                    setExplanationMd(detail.explanationMd ?? "");
                  }}
                >
                  취소
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditMode(true)}
              >
                빠른 수정 (본문·해설)
              </Button>
            )}
            <div className="ml-auto flex gap-2">
              <Button
                size="sm"
                variant="default"
                disabled={busy}
                onClick={approve}
                className="gap-1"
              >
                <CheckIcon className="size-3.5" /> 승인
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={busy}
                onClick={reject}
                className="gap-1"
              >
                <XIcon className="size-3.5" /> 반려
              </Button>
            </div>
          </div>

          {actionFetcher.data?.error ? (
            <p className="text-xs text-rose-600">{actionFetcher.data.error}</p>
          ) : null}
          {editFetcher.data?.error ? (
            <p className="text-xs text-rose-600">{editFetcher.data.error}</p>
          ) : null}
        </CardContent>
      </Card>

      {/* 근거 청크 패널 */}
      <Card>
        <CardContent className="space-y-2 p-4">
          <div className="text-muted-foreground flex items-center gap-1.5 text-[10px] font-bold tracking-wide uppercase">
            <ScrollTextIcon className="size-3" /> 근거 청크 (RAG)
            <span className="ml-1 text-[10px] normal-case">
              {detail.sourceChunks.length} / {detail.sourceChunkIds.length} 조회
            </span>
          </div>
          {detail.sourceChunks.length === 0 ? (
            <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/30">
              근거 청크가 없습니다.{" "}
              {detail.origin === "ai_draft"
                ? "AI 생성 시 근거 부족 — 신중 검토 필요."
                : "수기 등록 문제는 정상."}
            </div>
          ) : (
            <ul className="space-y-1.5">
              {detail.sourceChunks.map((c) => (
                <li
                  key={c.chunkId}
                  className="border-border bg-muted/30 rounded border p-2"
                >
                  <div className="text-muted-foreground mb-1 flex items-center gap-1.5 text-[10px]">
                    <Badge variant="outline" className="text-[10px]">
                      {c.sourceType}
                    </Badge>
                    {c.headingPath ? <span>{c.headingPath}</span> : null}
                  </div>
                  <p className="text-foreground text-xs whitespace-pre-wrap">
                    {c.bodyText.length > 600
                      ? `${c.bodyText.slice(0, 600)}…`
                      : c.bodyText}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
