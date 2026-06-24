// 자과 지문 텍스트 전사 검수 화면. /admin/problems/text-conversion.
// 대기 초안: 원본 이미지 ↔ 전사(발문+선지). 도표 문제는 재크롭 이미지 미리보기.
// 승인 시 RPC approve_text_draft 가 body_md/선지를 운영 반영 → 학생에게 텍스트로 노출.

import { CheckIcon, ImageIcon, TypeIcon, XIcon } from "lucide-react";
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
  type ScienceSubject,
  type TextDraftItem,
  listTextDrafts,
} from "~/features/admin/queries/text-drafts.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { MarkdownView } from "~/features/problems/components/markdown-view";

import type { Route } from "./+types/admin-text-review";

export const meta: Route.MetaFunction = () => [
  { title: "지문 텍스트 검수 | 리담변리사학원" },
];

const SUBJECTS: { value: ScienceSubject; label: string }[] = [
  { value: "physics", label: "물리" },
  { value: "chemistry", label: "화학" },
  { value: "biology", label: "생물" },
  { value: "earth_science", label: "지구과학" },
];
const YEARS = Array.from({ length: 2026 - 2010 + 1 }, (_, i) => 2026 - i);
const CIRCLED = ["①", "②", "③", "④", "⑤"];

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
  const figureOnly = url.searchParams.get("figure") === "1";
  const pageRaw = Number(url.searchParams.get("page"));
  const page = Number.isInteger(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  const result = await listTextDrafts({
    subject,
    year,
    figureOnly,
    page,
    pageSize: 20,
  });
  return {
    ...result,
    filters: { subject, year, figureOnly },
    role,
  };
}

export default function AdminTextReview({ loaderData }: Route.ComponentProps) {
  const {
    items,
    filteredTotal,
    page,
    pageSize,
    pendingTotal,
    figureTotal,
    approvedTotal,
    filters,
    role,
  } = loaderData;
  const [searchParams, setSearchParams] = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const bulkFetcher = useFetcher();

  const grandTotal = pendingTotal + approvedTotal;
  const pct = grandTotal > 0 ? Math.round((approvedTotal / grandTotal) * 100) : 0;
  const totalPages = Math.max(1, Math.ceil(filteredTotal / pageSize));

  const setFilter = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
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
      title="지문 텍스트 검수"
      desc={
        <span>
          AI가 자연과학 기출 이미지 지문을 텍스트로 전사한 초안입니다. 원본과
          대조해 승인하면 학생에게 <b>텍스트</b>로 노출됩니다. 도표 문제는 선지를
          제거한 <b>재크롭 이미지</b>가 본문이 됩니다.
        </span>
      }
      role={role}
      width={1280}
    >
      <div className="bg-card border-border mb-4 rounded-xl border p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold">검수 진행률</span>
          <span className="text-muted-foreground text-sm">
            승인 {approvedTotal} / {grandTotal} ({pct}%)
          </span>
        </div>
        <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
          <div
            className="bg-primary h-full rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <span>대기 {pendingTotal}</span>
          <span>도표 대기 {figureTotal}</span>
          <span>승인 {approvedTotal}</span>
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
          variant={filters.figureOnly ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("figure", filters.figureOnly ? null : "1")}
        >
          도표만
        </Button>
      </div>

      {selected.size > 0 ? (
        <div className="bg-card border-border mb-3 flex items-center gap-2 rounded-xl border p-2 text-sm">
          <span>{selected.size}건 선택됨</span>
          <bulkFetcher.Form
            method="post"
            action="/api/admin/text-review"
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
            검수할 전사 초안이 없습니다.
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
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
            이전
          </Button>
          <span className="text-muted-foreground">
            {page} / {totalPages} 페이지 · 총 {filteredTotal}건
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => goToPage(page + 1)}>
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
  item: TextDraftItem;
  selected: boolean;
  onToggle: () => void;
}) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const busy = fetcher.state !== "idle";
  const [rejecting, setRejecting] = useState(false);

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
          {item.hasFigure ? (
            <Badge variant="secondary" className="text-amber-700">
              <ImageIcon className="size-3" /> 도표(재크롭)
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-emerald-700">
              <TypeIcon className="size-3" /> 순수 텍스트
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* 원본 이미지 */}
          <div className="border-border rounded-lg border p-2">
            <p className="text-muted-foreground mb-1 text-[11px] font-semibold">
              원본 이미지
            </p>
            <MarkdownView text={item.originalBodyMd} className="text-sm" />
          </div>

          {/* 전사 결과 */}
          <div className="border-border rounded-lg border p-3">
            <p className="text-muted-foreground mb-1 text-[11px] font-semibold">
              전사 결과 (발문 + 선지)
            </p>
            {item.hasFigure && item.recropPath ? (
              <div className="mb-2 rounded border border-amber-200 bg-amber-50/40 p-1.5">
                <p className="text-[10px] text-amber-700">재크롭 도표(본문으로 사용)</p>
                <MarkdownView text={`![](${item.recropPath})`} className="text-sm" />
              </div>
            ) : null}
            <div className="text-[15px] leading-relaxed">
              <MarkdownView text={item.stemMd} className="text-[15px]" />
            </div>
            <ol className="mt-2 space-y-1">
              {item.choices.map((c, i) => (
                <li key={i} className="flex gap-1.5 text-sm">
                  <span className="text-link shrink-0 font-semibold">
                    {CIRCLED[i] ?? `${i + 1}.`}
                  </span>
                  <span>{c}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <fetcher.Form method="post" action="/api/admin/text-review">
            <input type="hidden" name="intent" value="approve" />
            <input type="hidden" name="draftId" value={item.draftId} />
            <Button type="submit" size="sm" disabled={busy}>
              <CheckIcon className="size-3.5" /> 승인
            </Button>
          </fetcher.Form>
          {rejecting ? (
            <fetcher.Form
              method="post"
              action="/api/admin/text-review"
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
              <Button type="button" size="sm" variant="ghost" onClick={() => setRejecting(false)}>
                취소
              </Button>
            </fetcher.Form>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setRejecting(true)}>
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
