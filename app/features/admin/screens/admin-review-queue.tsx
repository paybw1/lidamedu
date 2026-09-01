// feat-14-N1-b — 통합 검수 큐 `/admin/review`.
//
// 검수 화면이 9개인데 무엇이 얼마나 밀렸는지 한 곳에서 안 보여, 학생에게 안 보이는
// draft 콘텐츠가 271건까지 쌓였다(2026-09-01). 한 화면에서 한 줄씩 훑으며 판정한다.
//
// ★승인/반려는 종류별 **기존 엔드포인트**를 그대로 부른다 — 뮤테이션 경로를 새로 만들지
//   않는다(review-queue.server 주석 참조). 이 화면은 읽기 + 기존 액션 호출뿐이다.
// ★감사 결과(content_audit_findings)가 배지로 붙고 정렬 키가 된다 — 경고 있는 것부터
//   위로 올라와, 무경고 항목은 빠르게 넘기고 경고 항목만 정독하게 한다.
import type { Route } from "./+types/admin-review-queue";

import {
  AlertTriangleIcon,
  CheckIcon,
  ExternalLinkIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, data, redirect, useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";
import { cn } from "~/core/lib/utils";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip } from "~/features/community/components/community-ui";
import {
  BULK_APPROVE,
  REVIEW_KINDS,
  REVIEW_KIND_LABEL,
  type ReviewKind,
  type ReviewRow,
  parseReviewKind,
} from "~/features/admin/lib/review-queue";
import { getReviewQueue } from "~/features/admin/queries/review-queue.server";
import { getStaffRole } from "~/features/laws/queries.server";

export const meta: Route.MetaFunction = () => [
  { title: "콘텐츠 검수 | 리담변리사학원" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login?next=/admin/review");
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const kind = parseReviewKind(new URL(request.url).searchParams.get("kind"));
  const queue = await getReviewQueue(kind);
  return { role, kind, ...queue };
}

export default function AdminReviewQueue({ loaderData }: Route.ComponentProps) {
  const { role, kind, counts, rows } = loaderData;
  const total = REVIEW_KINDS.reduce((sum, k) => sum + counts[k], 0);

  return (
    <AdminShell
      cluster="checks"
      title="콘텐츠 검수"
      desc="학생에게 아직 안 보이는(검수 대기) 콘텐츠를 한 곳에서 판정합니다."
      role={role}
    >
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {REVIEW_KINDS.map((k) => (
          <Link
            key={k}
            to={`/admin/review?kind=${k}`}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              k === kind
                ? "border-primary bg-primary/10 text-link"
                : "border-border hover:bg-accent",
            )}
          >
            {REVIEW_KIND_LABEL[k]}
            <span className="tabular-nums opacity-70">{counts[k]}</span>
          </Link>
        ))}
        <span className="text-muted-foreground ml-auto text-xs tabular-nums">
          검수 대기 합계 {total}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
          검수 대기가 없습니다.
        </p>
      ) : (
        <ReviewList rows={rows} kind={kind} />
      )}
    </AdminShell>
  );
}

/**
 * ★판정한 행은 목록에서 즉시 걷는다(낙관적) — 서버 재조회를 기다리면 방금 승인한 행이
 *   남아 있어 두 번 누르게 된다. 실패하면 되돌리고 사유를 보여 준다.
 */
function ReviewList({ rows, kind }: { rows: ReviewRow[]; kind: ReviewKind }) {
  const [done, setDone] = useState<ReadonlySet<string>>(new Set());
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const visible = rows.filter((r) => !done.has(r.id));
  const bulk = BULK_APPROVE[kind];
  return (
    <div className="divide-border divide-y rounded-lg border">
      {bulk ? (
        <BulkBar
          rows={visible}
          picked={picked}
          setPicked={setPicked}
          cfg={bulk}
          onDone={(ids) =>
            setDone((prev) => {
              const next = new Set(prev);
              for (const id of ids) next.add(id);
              return next;
            })
          }
        />
      ) : null}
      {visible.map((r) => (
        <ReviewItem
          key={r.id}
          row={r}
          picked={bulk ? picked.has(r.id) : null}
          onPick={
            bulk
              ? () =>
                  setPicked((prev) => {
                    const next = new Set(prev);
                    if (!next.delete(r.id)) next.add(r.id);
                    return next;
                  })
              : undefined
          }
          onSettled={(ok) =>
            setDone((prev) => {
              if (!ok) return prev;
              const next = new Set(prev);
              next.add(r.id);
              return next;
            })
          }
        />
      ))}
      {visible.length === 0 ? (
        <p className="text-muted-foreground p-6 text-center text-sm">
          이 화면의 대기 항목을 모두 처리했습니다. 새로고침하면 다음 묶음이 옵니다.
        </p>
      ) : null}
    </div>
  );
}

/**
 * 일괄 승인 바 — 화면에 뜬 것만 대상. "이미 통째로 검토를 마친 묶음"을 넣는 도구다.
 * ★건당 요청을 보내면 수백 회 왕복이라 실패 지점이 흩어진다 — 기존 API 의 일괄
 *   인텐트로 한 번에 보낸다(도식·훈련 항목은 일괄을 안 붙였다 — 한 건씩 봐야 한다).
 */
function BulkBar({
  rows,
  picked,
  setPicked,
  cfg,
  onDone,
}: {
  rows: ReviewRow[];
  picked: ReadonlySet<string>;
  setPicked: (fn: (prev: ReadonlySet<string>) => ReadonlySet<string>) => void;
  cfg: { path: string; intent: string; field: string; format: "csv" | "json" };
  onDone: (ids: string[]) => void;
}) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const handled = useRef<unknown>(null);
  const ids = rows.filter((r) => picked.has(r.id)).map((r) => r.id);
  const allPicked = rows.length > 0 && ids.length === rows.length;

  useEffect(() => {
    const d = fetcher.data;
    if (!d || d === handled.current) return;
    handled.current = d;
    if (!d.error) {
      onDone(ids);
      setPicked(() => new Set());
    }
    // ids 는 제출 시점 값 — 응답 처리에만 쓴다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.data]);

  const run = () => {
    if (ids.length === 0) return;
    if (!window.confirm(`선택한 ${ids.length}건을 승인합니다. 계속할까요?`)) return;
    const fd = new FormData();
    fd.set("intent", cfg.intent);
    fd.set(cfg.field, cfg.format === "json" ? JSON.stringify(ids) : ids.join(","));
    fetcher.submit(fd, { method: "post", action: cfg.path });
  };

  return (
    <div className="bg-muted/40 flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
      <button
        type="button"
        className="text-link font-semibold"
        onClick={() =>
          setPicked(() =>
            allPicked ? new Set() : new Set(rows.map((r) => r.id)),
          )
        }
      >
        {allPicked ? "전체 해제" : "전체 선택"}
      </button>
      <span className="text-muted-foreground tabular-nums">
        {ids.length}건 선택 · 화면 {rows.length}건
      </span>
      <Button
        size="sm"
        className="ml-auto h-7 text-[11px]"
        disabled={ids.length === 0 || fetcher.state !== "idle"}
        onClick={run}
      >
        <CheckIcon className="size-3" /> 선택 승인
      </Button>
      {fetcher.data?.error ? (
        <span className="text-rose-600 dark:text-rose-400">
          {fetcher.data.error}
        </span>
      ) : null}
    </div>
  );
}

function ReviewItem({
  row,
  onSettled,
  picked,
  onPick,
}: {
  row: ReviewRow;
  onSettled: (ok: boolean) => void;
  picked: boolean | null;
  onPick?: () => void;
}) {
  const fetcher = useFetcher<{ ok?: boolean | string; error?: string }>();
  const handled = useRef<unknown>(null);
  const busy = fetcher.state !== "idle";

  useEffect(() => {
    const d = fetcher.data;
    if (!d || d === handled.current) return;
    handled.current = d;
    onSettled(!d.error);
  }, [fetcher.data, onSettled]);

  const submit = (intent: "approve" | "reject") => {
    const fd = new FormData();
    fd.set("intent", intent);
    if (row.idField) fd.set(row.idField, row.id);
    if (intent === "reject") {
      const reason = window.prompt("반려 사유를 적어 주세요.");
      if (reason == null) return;
      fd.set("reason", reason);
      fd.set("rejectedReason", reason);
    }
    fetcher.submit(fd, { method: "post", action: row.actionPath });
  };

  const fails = row.audits.filter((a) => a.severity === "fail");
  const warns = row.audits.filter((a) => a.severity === "warn");

  return (
    <div className={cn("p-3", busy && "opacity-50")}>
      <div className="flex items-start gap-3">
        {picked !== null ? (
          <input
            type="checkbox"
            checked={picked}
            onChange={onPick}
            aria-label="일괄 승인 선택"
            className="accent-primary mt-1 size-3.5 shrink-0"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-semibold">{row.title}</span>
            {fails.length > 0 ? (
              <Chip tone="coral">
                <AlertTriangleIcon className="mr-0.5 inline size-3" />
                오류 {fails.length}
              </Chip>
            ) : null}
            {warns.length > 0 ? (
              <Chip tone="amber">확인 {warns.length}</Chip>
            ) : null}
          </div>
          {row.subtitle ? (
            <p className="text-muted-foreground mt-0.5 text-[11px]">
              {row.subtitle}
            </p>
          ) : null}
          {row.preview ? (
            <p className="text-muted-foreground mt-1 line-clamp-2 text-xs leading-relaxed">
              {row.preview}
            </p>
          ) : null}
          {row.audits.length > 0 ? (
            <ul className="mt-1.5 space-y-0.5">
              {row.audits.slice(0, 4).map((a, i) => (
                <li
                  key={i}
                  className={cn(
                    "text-[11px]",
                    a.severity === "fail"
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-amber-700 dark:text-amber-400",
                  )}
                >
                  {a.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Link
            to={row.editHref}
            className="text-muted-foreground hover:text-link inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px]"
          >
            <ExternalLinkIcon className="size-3" /> 열기
          </Link>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px]"
            disabled={busy}
            onClick={() => submit("reject")}
          >
            <XIcon className="size-3" /> 반려
          </Button>
          <Button
            size="sm"
            className="h-7 text-[11px]"
            disabled={busy}
            onClick={() => submit("approve")}
          >
            <CheckIcon className="size-3" /> 승인
          </Button>
        </div>
      </div>
      {fetcher.data?.error ? (
        <p className="mt-1.5 text-[11px] text-rose-600 dark:text-rose-400">
          {fetcher.data.error}
        </p>
      ) : null}
    </div>
  );
}
