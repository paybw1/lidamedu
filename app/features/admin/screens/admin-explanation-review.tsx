// feat-3-305 기출 해설 검수 화면. /admin/problems/explanations.
// 대기(pending) AI 해설 초안을 문제 이미지와 나란히 보여주고 승인/반려.
// 승인 시 RPC approve_explanation_draft 가 content_md 를 problems.explanation_md 로 복사 → 학생 노출.

import { CheckIcon, TriangleAlertIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { data, redirect, useFetcher, useSearchParams } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent } from "~/core/components/ui/card";
import makeServerClient from "~/core/lib/supa-client.server";
import { cn } from "~/core/lib/utils";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { AdminSelect } from "~/features/admin/components/admin-ui";
import {
  type ExplanationDraftItem,
  type ScienceSubject,
  listExplanationDrafts,
} from "~/features/admin/queries/explanation-drafts.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { MarkdownView } from "~/features/problems/components/markdown-view";

import type { Route } from "./+types/admin-explanation-review";

export const meta: Route.MetaFunction = () => [
  { title: "기출 해설 검수 | 리담변리사학원" },
];

const SUBJECTS: { value: ScienceSubject; label: string }[] = [
  { value: "physics", label: "물리" },
  { value: "chemistry", label: "화학" },
  { value: "biology", label: "생물" },
  { value: "earth_science", label: "지구과학" },
];
const YEARS = Array.from({ length: 2026 - 2010 + 1 }, (_, i) => 2026 - i);

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const subject = SUBJECTS.find(
    (s) => s.value === url.searchParams.get("subject"),
  )?.value;
  const yearRaw = Number(url.searchParams.get("year"));
  const year = YEARS.includes(yearRaw) ? yearRaw : undefined;
  const mismatchOnly = url.searchParams.get("mismatch") === "1";
  const pageRaw = Number(url.searchParams.get("page"));
  const page = Number.isInteger(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  const result = await listExplanationDrafts({
    subject,
    year,
    mismatchOnly,
    page,
    pageSize: 20,
  });
  return {
    ...result,
    filters: { subject, year, mismatchOnly },
    role,
  };
}

export default function AdminExplanationReview({
  loaderData,
}: Route.ComponentProps) {
  const {
    items,
    filteredTotal,
    page,
    pageSize,
    pendingTotal,
    mismatchTotal,
    approvedTotal,
    rejectedTotal,
    filters,
    role,
  } = loaderData;
  const [searchParams, setSearchParams] = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const bulkFetcher = useFetcher<{ ok?: boolean; error?: string; count?: number }>();

  const grandTotal = pendingTotal + approvedTotal + rejectedTotal;
  const reviewed = approvedTotal + rejectedTotal;
  const pct = grandTotal > 0 ? Math.round((reviewed / grandTotal) * 100) : 0;
  const totalPages = Math.max(1, Math.ceil(filteredTotal / pageSize));

  const setFilter = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page"); // 필터 변경 시 1페이지로 리셋
    setSearchParams(next);
  };
  const goToPage = (p: number) => {
    const next = new URLSearchParams(searchParams);
    next.set("page", String(p));
    setSearchParams(next);
  };
  const toggle = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <AdminShell
      cluster="problems"
      title="기출 해설 검수"
      desc={
        <span>
          AI가 생성한 자연과학 기출 해설 초안입니다. 승인하면 학생에게 노출됩니다.{" "}
          <b>정답키 불일치</b> 항목을 우선 검토하세요.
        </span>
      }
      role={role}
      width={1200}
    >
      <div className="bg-card border-border mb-4 rounded-xl border p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold">검수 진행률</span>
          <span className="text-muted-foreground text-sm">
            완료 {reviewed} / {grandTotal} ({pct}%)
          </span>
        </div>
        <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
          <div
            className="bg-primary h-full rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <span>승인 {approvedTotal}</span>
          <span>반려 {rejectedTotal}</span>
          <span>대기 {pendingTotal}</span>
          <span className={mismatchTotal > 0 ? "font-medium text-rose-600" : ""}>
            불일치 대기 {mismatchTotal}
          </span>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <AdminSelect
          value={filters.subject ?? ""}
          onChange={(e) => setFilter("subject", e.target.value || null)}
        >
          <option value="">전체 과목</option>
          {SUBJECTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </AdminSelect>
        <AdminSelect
          value={filters.year ? String(filters.year) : ""}
          onChange={(e) => setFilter("year", e.target.value || null)}
        >
          <option value="">전체 연도</option>
          {YEARS.map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </AdminSelect>
        <Button
          variant={filters.mismatchOnly ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("mismatch", filters.mismatchOnly ? null : "1")}
        >
          불일치만
        </Button>
      </div>

      {selected.size > 0 ? (
        <div className="bg-card border-border mb-3 flex items-center gap-2 rounded-xl border p-2 text-sm">
          <span>{selected.size}건 선택됨</span>
          <bulkFetcher.Form
            method="post"
            action="/api/admin/explanation-review"
            onSubmit={() => setSelected(new Set())}
          >
            <input type="hidden" name="intent" value="bulk-approve" />
            <input type="hidden" name="draftIds" value={[...selected].join(",")} />
            <Button type="submit" size="sm">
              <CheckIcon className="size-3.5" /> 선택 승인
            </Button>
          </bulkFetcher.Form>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            해제
          </Button>
        </div>
      ) : null}

      {items.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground p-8 text-center text-sm">
            검수할 해설 초안이 없습니다.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {items.map((it) => (
            <DraftCard
              key={it.draftId}
              item={it}
              selected={selected.has(it.draftId)}
              onToggle={() => toggle(it.draftId)}
            />
          ))}
        </div>
      )}

      {totalPages > 1 ? (
        <div className="mt-6 flex items-center justify-center gap-3 text-sm">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => goToPage(page - 1)}
          >
            이전
          </Button>
          <span className="text-muted-foreground">
            {page} / {totalPages} 페이지 · 총 {filteredTotal}건
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => goToPage(page + 1)}
          >
            다음
          </Button>
        </div>
      ) : null}
    </AdminShell>
  );
}

function DraftCard({
  item,
  selected,
  onToggle,
}: {
  item: ExplanationDraftItem;
  selected: boolean;
  onToggle: () => void;
}) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const busy = fetcher.state !== "idle";
  const [rejecting, setRejecting] = useState(false);
  const flagged = item.answerMatch !== true;

  return (
    <Card className={cn(selected && "ring-primary ring-2")}>
      <CardContent className="p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            className="size-4"
            aria-label="선택"
          />
          <span className="font-bold">
            {item.year}년 {item.scienceSubjectKo} {item.problemNumber}번
          </span>
          <Badge variant="outline">정답키 {item.officialAnswer || "?"}</Badge>
          <Badge variant="outline">AI {item.aiAnswer ?? "?"}</Badge>
          {item.answerMatch === true ? (
            <Badge variant="secondary" className="text-emerald-700">
              <CheckIcon className="size-3" /> 일치
            </Badge>
          ) : (
            <Badge variant="destructive">
              <TriangleAlertIcon className="size-3" />{" "}
              {item.answerMatch === false ? "불일치" : "미확인"}
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="border-border rounded-lg border p-2">
            <MarkdownView text={item.bodyMd} className="text-sm" />
          </div>
          <div
            className={cn(
              "rounded-lg border p-3",
              flagged ? "border-rose-300 bg-rose-50/40" : "border-border",
            )}
          >
            <MarkdownView text={item.contentMd} className="text-[15px]" />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <fetcher.Form method="post" action="/api/admin/explanation-review">
            <input type="hidden" name="intent" value="approve" />
            <input type="hidden" name="draftId" value={item.draftId} />
            <Button type="submit" size="sm" disabled={busy}>
              <CheckIcon className="size-3.5" /> 승인
            </Button>
          </fetcher.Form>
          {rejecting ? (
            <fetcher.Form
              method="post"
              action="/api/admin/explanation-review"
              className="flex grow items-center gap-2"
            >
              <input type="hidden" name="intent" value="reject" />
              <input type="hidden" name="draftId" value={item.draftId} />
              <input
                name="reason"
                placeholder="반려 사유(선택)"
                className="border-input h-8 grow rounded-md border px-2 text-sm"
              />
              <Button type="submit" size="sm" variant="destructive" disabled={busy}>
                반려 확정
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setRejecting(false)}
              >
                취소
              </Button>
            </fetcher.Form>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setRejecting(true)}
            >
              <XIcon className="size-3.5" /> 반려
            </Button>
          )}
          {fetcher.data?.error ? (
            <span className="text-destructive text-xs">{fetcher.data.error}</span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
