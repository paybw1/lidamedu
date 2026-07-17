// feat-2-029 후속 — 조문 빈칸 후보 승인 큐(admin-case-blanks 미러, 법령 탭 추가).
// OX 거짓(X) 지문에서 AI가 도출한 조문 함정 키워드 후보 → 승인 시 승인자 '내 세트'에 기록.

import { CheckCircle2Icon, ExternalLinkIcon } from "lucide-react";
import { useState } from "react";
import { Link, data, useFetcher, useSearchParams } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { cn } from "~/core/lib/utils";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip, IndexTable, TD, TR } from "~/features/admin/components/admin-ui";
import {
  countArticleBlankCandidates,
  listArticleBlankCandidates,
  type ArticleBlankCandidateRow,
  type ArticleCandidateStatus,
} from "~/features/blanks/article-candidates.server";
import {
  BLANK_LAW_TABS,
  isBlankLawSlug,
  type BlankLawSlug,
} from "~/features/blanks/lib/blank-law-slugs";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/admin-article-blank-candidates";

export const meta: Route.MetaFunction = () => [
  { title: "조문 빈칸 승인 | 리담변리사학원" },
];

const STATUS_OPTIONS: {
  value: ArticleCandidateStatus;
  label: string;
  hint: string;
}[] = [
  { value: "pending", label: "대기", hint: "AI 후보 — 승인 전 학생 미노출" },
  { value: "approved", label: "승인됨", hint: "내 세트에 기록된 빈칸" },
  { value: "rejected", label: "거절됨", hint: "부적합 판정 후보" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const lawParam = url.searchParams.get("law");
  const lawCode: BlankLawSlug =
    lawParam && isBlankLawSlug(lawParam) ? lawParam : "trademark";
  const statusParam = url.searchParams.get("status");
  const status: ArticleCandidateStatus =
    statusParam === "approved" || statusParam === "rejected"
      ? statusParam
      : "pending";

  const [items, counts] = await Promise.all([
    listArticleBlankCandidates(client, lawCode, status),
    countArticleBlankCandidates(client, lawCode),
  ]);
  return { lawCode, status, items, counts, role };
}

export default function AdminArticleBlankCandidates({
  loaderData,
}: Route.ComponentProps) {
  const { lawCode, status, items, counts, role } = loaderData;
  const [searchParams] = useSearchParams();

  type RowSentinel =
    | { kind: "group"; item: ArticleBlankCandidateRow; count: number }
    | { kind: "row"; item: ArticleBlankCandidateRow };
  const renderRows: RowSentinel[] = [];
  let lastArticleId: string | null = null;
  for (const it of items) {
    if (it.articleId !== lastArticleId) {
      renderRows.push({
        kind: "group",
        item: it,
        count: items.filter((x) => x.articleId === it.articleId).length,
      });
      lastArticleId = it.articleId;
    }
    renderRows.push({ kind: "row", item: it });
  }

  return (
    <AdminShell
      cluster="blanks"
      role={role}
      width={1280}
      title="조문 빈칸 승인"
      desc={
        <>
          조문에 매핑된 기출의 <span className="font-semibold">거짓(X) 지문</span>
          에서 AI가 도출한 함정 핵심어 후보입니다. 승인하면{" "}
          <span className="font-semibold">내 빈칸 자료</span>(없으면 자동
          생성)에 기록되고, 뷰어의 “빈칸 편집”에서 이어서 다듬을 수 있습니다.
        </>
      }
    >
      {/* 법령 탭 */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="text-muted-foreground mr-1 text-[11px] font-semibold">
          법령
        </span>
        {BLANK_LAW_TABS.map((t) => {
          const active = t.slug === lawCode;
          const sp = new URLSearchParams(searchParams);
          sp.set("law", t.slug);
          return (
            <Link
              key={t.slug}
              to={`?${sp.toString()}`}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:bg-muted",
              )}
            >
              {t.name}
            </Link>
          );
        })}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {STATUS_OPTIONS.map((opt) => {
          const isActive = status === opt.value;
          const sp = new URLSearchParams(searchParams);
          sp.set("status", opt.value);
          return (
            <Link
              key={opt.value}
              to={`?${sp.toString()}`}
              title={opt.hint}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-[11px] font-semibold whitespace-nowrap transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:bg-muted/60",
              )}
            >
              {opt.label}
              <span className="tabular-nums">{counts[opt.value]}</span>
            </Link>
          );
        })}
        <span className="text-muted-foreground ml-auto text-xs">
          결과{" "}
          <span className="text-foreground font-bold tabular-nums">
            {items.length}
          </span>
          건{items.length >= 600 ? " (상한 600)" : ""}
        </span>
      </div>

      {items.length === 0 ? (
        <div className="border-border bg-card rounded-xl border py-16 text-center shadow-sm">
          <CheckCircle2Icon className="text-muted-foreground mx-auto mb-3 size-8" />
          <p className="text-muted-foreground text-sm">
            {status === "pending"
              ? "대기 중인 후보가 없습니다. 후보 생성은 scripts/laws/gen-article-blank-candidates.mjs 로 합니다."
              : "해당 상태의 후보가 없습니다."}
          </p>
        </div>
      ) : (
        <IndexTable
          minWidth={860}
          headers={[
            { label: "빈칸 (정답은 수정 가능)" },
            { label: "근거 기출", width: "22rem" },
            { label: "처리", width: "10rem" },
          ]}
        >
          {renderRows.map((r) =>
            r.kind === "group" ? (
              <tr key={`g-${r.item.articleId}`} className="bg-muted/40">
                <td colSpan={3} className="px-3 py-1.5">
                  <span className="text-foreground text-[12px] font-bold">
                    {r.item.articleLabel ??
                      (r.item.articleNumber ? `제${r.item.articleNumber}조` : "조문")}
                  </span>
                  <span className="text-muted-foreground ml-2 text-[11px] tabular-nums">
                    후보 {r.count}건
                  </span>
                  {r.item.articleNumber ? (
                    <Link
                      to={`/subjects/${r.item.lawCode}/articles/${r.item.articleNumber}?blankMode=1&blankEdit=1`}
                      viewTransition
                      className="text-link ml-2 inline-flex items-center gap-0.5 text-[11px] hover:underline"
                    >
                      뷰어에서 편집
                      <ExternalLinkIcon className="size-3" />
                    </Link>
                  ) : null}
                </td>
              </tr>
            ) : (
              <CandidateRow key={r.item.candidateId} item={r.item} />
            ),
          )}
        </IndexTable>
      )}
    </AdminShell>
  );
}

function CandidateRow({ item }: { item: ArticleBlankCandidateRow }) {
  const fetcher = useFetcher<{ ok: boolean; error?: string }>();
  const isSubmitting = fetcher.state !== "idle";
  const [answer, setAnswer] = useState(item.answer);
  const error = fetcher.data && !fetcher.data.ok ? fetcher.data.error : null;

  const submit = (op: "approve" | "reject" | "revert") => {
    const fd = new FormData();
    fd.set("candidateId", item.candidateId);
    fd.set("op", op);
    if (op === "approve") fd.set("answer", answer.trim());
    fetcher.submit(fd, {
      method: "post",
      action: "/api/blanks/article-candidate-review",
    });
  };

  return (
    <TR>
      <TD>
        <p className="font-serif text-sm leading-relaxed">
          <span className="text-muted-foreground">
            …{(item.beforeContext ?? "").slice(-40)}
          </span>
          <input
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            disabled={isSubmitting || item.status !== "pending"}
            aria-label="빈칸 정답"
            size={Math.max(4, answer.length + 1)}
            className={cn(
              "border-primary/50 bg-primary/5 text-foreground mx-0.5 inline-block rounded border-b-2 px-1 text-center text-sm font-bold disabled:opacity-70",
              answer.trim() !== item.answer && "border-amber-500 bg-amber-500/10",
            )}
          />
          <span className="text-muted-foreground">
            {(item.afterContext ?? "").slice(0, 40)}…
          </span>
        </p>
        {answer.trim() !== item.answer ? (
          <p className="text-muted-foreground mt-0.5 text-[10px]">
            원안 "{item.answer}" 에서 수정됨 — 조문 원문에 그대로 있는
            표현이어야 승인됩니다.
          </p>
        ) : null}
        {error ? (
          <p className="text-destructive mt-1 text-[11px] font-semibold">
            {error}
          </p>
        ) : null}
      </TD>
      <TD>
        <div className="space-y-1">
          {item.sourceDisplayNo != null ? (
            item.sourceProblemId ? (
              <Link
                to={`/admin/problems/${item.sourceProblemId}`}
                viewTransition
                className="text-link text-[11px] font-semibold hover:underline"
              >
                P-{item.sourceDisplayNo}
              </Link>
            ) : (
              <span className="text-[11px] font-semibold">
                P-{item.sourceDisplayNo}
              </span>
            )
          ) : null}
          {item.falseStatement ? (
            <p className="text-muted-foreground line-clamp-2 text-[11px] leading-snug">
              <span className="font-semibold text-rose-600 dark:text-rose-400">
                X
              </span>{" "}
              {item.falseStatement}
            </p>
          ) : null}
          {item.rationale ? (
            <p
              className="text-muted-foreground line-clamp-2 text-[11px] italic leading-snug"
              title={item.rationale}
            >
              {item.rationale}
            </p>
          ) : null}
        </div>
      </TD>
      <TD>
        {item.status === "pending" ? (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={isSubmitting || !answer.trim()}
              onClick={() => submit("approve")}
              className="border-primary text-primary hover:bg-primary hover:text-primary-foreground h-7 rounded border px-2.5 text-[11px] font-bold transition-colors disabled:opacity-50"
            >
              승인
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => submit("reject")}
              className="border-border text-muted-foreground hover:bg-muted h-7 rounded border px-2.5 text-[11px] font-semibold transition-colors disabled:opacity-50"
            >
              거절
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <Chip tone={item.status === "approved" ? "emerald" : "coral"}>
              {item.status === "approved" ? "승인됨" : "거절됨"}
            </Chip>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => submit("revert")}
              title={
                item.status === "approved"
                  ? "내 세트에서 이 빈칸을 제거하고 대기로 되돌립니다"
                  : "대기로 되돌립니다"
              }
              className="border-border text-muted-foreground hover:bg-muted h-7 rounded border px-2 text-[11px] transition-colors disabled:opacity-50"
            >
              되돌리기
            </button>
          </div>
        )}
      </TD>
    </TR>
  );
}
