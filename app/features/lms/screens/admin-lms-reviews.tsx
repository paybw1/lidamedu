// feat-11-006 Phase 4 — 수강평/교재평 운영자 관리. staff 전용(lms_video_admin).
//   블라인드(신고 처리)·베스트 선정·운영자 답변·삭제. 필터: 전체/신고/블라인드/베스트.
import { useEffect, useState } from "react";

import { StarIcon } from "lucide-react";
import { data, useFetcher, useSearchParams } from "react-router";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip } from "~/features/admin/components/admin-ui";
import { hasDutyAccess } from "~/features/admin/lib/duties.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  listReviewsForAdmin,
  type AdminReviewRow,
} from "~/features/lms/reviews.server";

import type { Route } from "./+types/admin-lms-reviews";

export const meta: Route.MetaFunction = () => [
  { title: "수강평·교재평 관리 | 리담변리사학원" },
];

const FILTERS = [
  { value: "all", label: "전체" },
  { value: "reported", label: "신고" },
  { value: "blinded", label: "블라인드" },
  { value: "best", label: "베스트" },
] as const;
type Filter = (typeof FILTERS)[number]["value"];

async function requireStaff(request: Request) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });
  if (!(await hasDutyAccess("lms_video_admin", user.id, role)))
    throw data("Forbidden — 관리자 관리에서 접근 권한을 배정받아야 합니다.", {
      status: 403,
    });
  return { client, user, role };
}

export async function loader({ request }: Route.LoaderArgs) {
  const { client, role } = await requireStaff(request);
  const url = new URL(request.url);
  const filter = (url.searchParams.get("filter") ?? "all") as Filter;
  const reviews = await listReviewsForAdmin(
    client,
    FILTERS.some((f) => f.value === filter) ? filter : "all",
  );
  return { role, reviews, filter };
}

export async function action({ request }: Route.ActionArgs) {
  const { client } = await requireStaff(request);
  const fd = await request.formData();
  const intent = fd.get("intent");
  const reviewId = z.string().uuid().safeParse(fd.get("reviewId"));
  if (!reviewId.success)
    return data({ error: "대상을 확인해 주세요." }, { status: 400 });
  const id = reviewId.data;

  if (intent === "toggle_blind") {
    const value = fd.get("value") === "1";
    const reason = String(fd.get("reason") ?? "").trim() || null;
    const { error } = await client
      .from("course_reviews")
      .update({ is_blinded: value, blind_reason: value ? reason : null })
      .eq("review_id", id);
    if (error) return data({ error: error.message }, { status: 400 });
    return data({ ok: true as const });
  }
  if (intent === "toggle_best") {
    const value = fd.get("value") === "1";
    const { error } = await client
      .from("course_reviews")
      .update({ is_best: value })
      .eq("review_id", id);
    if (error) return data({ error: error.message }, { status: 400 });
    return data({ ok: true as const });
  }
  if (intent === "reply") {
    const reply = String(fd.get("reply") ?? "").trim();
    const { error } = await client
      .from("course_reviews")
      .update({
        admin_reply: reply || null,
        admin_reply_at: reply ? new Date().toISOString() : null,
      })
      .eq("review_id", id);
    if (error) return data({ error: error.message }, { status: 400 });
    return data({ ok: true as const });
  }
  if (intent === "delete") {
    const { error } = await client
      .from("course_reviews")
      .update({ deleted_at: new Date().toISOString() })
      .eq("review_id", id);
    if (error) return data({ error: error.message }, { status: 400 });
    return data({ ok: true as const });
  }
  return data({ error: "알 수 없는 요청" }, { status: 400 });
}

export default function AdminLmsReviews({ loaderData }: Route.ComponentProps) {
  const { role, reviews, filter } = loaderData;
  const [searchParams, setSearchParams] = useSearchParams();
  const active = searchParams.get("filter") ?? filter;

  return (
    <AdminShell
      cluster="lms"
      role={role}
      title="수강평·교재평 관리"
      desc="후기 신고 처리(블라인드)·베스트 선정·운영자 답변을 관리합니다."
      width={1200}
    >
      <div className="mb-4 flex gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              if (f.value === "all") next.delete("filter");
              else next.set("filter", f.value);
              setSearchParams(next);
            }}
            className={
              "rounded-full border px-3.5 py-1 text-xs font-semibold transition-colors " +
              (active === f.value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:text-foreground")
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {reviews.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed px-4 py-12 text-center text-sm">
          해당하는 후기가 없습니다.
        </p>
      ) : (
        <ul className="space-y-3">
          {reviews.map((r) => (
            <AdminReviewCard key={r.reviewId} review={r} />
          ))}
        </ul>
      )}
    </AdminShell>
  );
}

function AdminReviewCard({ review: r }: { review: AdminReviewRow }) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const [replying, setReplying] = useState(false);
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.error) toast.error(fetcher.data.error);
    else if (fetcher.data.ok) {
      toast.success("반영했습니다.");
      setReplying(false);
    }
  }, [fetcher.state, fetcher.data]);

  const submit = (fields: Record<string, string>) => {
    const fd = new FormData();
    fd.set("reviewId", r.reviewId);
    Object.entries(fields).forEach(([k, v]) => fd.set(k, v));
    fetcher.submit(fd, { method: "post" });
  };
  const busy = fetcher.state !== "idle";

  return (
    <li className="border-border bg-card rounded-xl border p-4">
      <div className="mb-1.5 flex flex-wrap items-center gap-2 text-sm">
        <Chip tone={r.targetType === "plan" ? "blue" : "neutral"}>
          {r.targetType === "plan" ? "강의" : "교재"}
        </Chip>
        <span className="font-semibold">{r.targetLabel}</span>
        <span className="inline-flex items-center">
          {[1, 2, 3, 4, 5].map((n) => (
            <StarIcon
              key={n}
              className={
                "size-3.5 " +
                (n <= r.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")
              }
            />
          ))}
        </span>
        {r.isBest ? <Chip tone="amber">베스트</Chip> : null}
        {r.isBlinded ? <Chip tone="coral">블라인드</Chip> : null}
        {!r.isPublic ? <Chip tone="outline">비공개</Chip> : null}
        {r.reportCount > 0 ? <Chip tone="coral">신고 {r.reportCount}</Chip> : null}
        {r.deletedAt ? <Chip tone="outline">삭제됨</Chip> : null}
        <span className="text-muted-foreground ml-auto text-xs">
          {r.authorName ?? "수험생"} · {r.createdAt.slice(0, 10)}
        </span>
      </div>
      {r.body ? (
        <p className="mb-2 text-sm whitespace-pre-wrap">{r.body}</p>
      ) : (
        <p className="text-muted-foreground mb-2 text-sm">(내용 없음)</p>
      )}
      {r.adminReply ? (
        <div className="bg-muted/40 mb-2 rounded-md px-3 py-2 text-sm">
          <span className="text-primary mr-1 font-semibold">운영자 답변</span>
          <span className="whitespace-pre-wrap">{r.adminReply}</span>
        </div>
      ) : null}

      {!r.deletedAt ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[12px]"
            disabled={busy}
            onClick={() =>
              submit({ intent: "toggle_best", value: r.isBest ? "0" : "1" })
            }
          >
            {r.isBest ? "베스트 해제" : "베스트"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[12px]"
            disabled={busy}
            onClick={() => {
              if (r.isBlinded) submit({ intent: "toggle_blind", value: "0" });
              else {
                const reason = window.prompt("블라인드 사유(선택)") ?? "";
                submit({ intent: "toggle_blind", value: "1", reason });
              }
            }}
          >
            {r.isBlinded ? "블라인드 해제" : "블라인드"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-[12px]"
            onClick={() => setReplying((v) => !v)}
          >
            {r.adminReply ? "답변 수정" : "답변"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-[12px] text-rose-600"
            disabled={busy}
            onClick={() => {
              if (window.confirm("이 후기를 삭제할까요?"))
                submit({ intent: "delete" });
            }}
          >
            삭제
          </Button>
        </div>
      ) : null}

      {replying ? (
        <div className="mt-2 flex flex-col gap-2">
          <textarea
            id={`reply-${r.reviewId}`}
            defaultValue={r.adminReply ?? ""}
            rows={2}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            placeholder="운영자 답변을 입력하세요."
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={busy}
              onClick={() => {
                const el = document.getElementById(
                  `reply-${r.reviewId}`,
                ) as HTMLTextAreaElement | null;
                submit({ intent: "reply", reply: el?.value ?? "" });
              }}
            >
              답변 저장
            </Button>
            <button
              type="button"
              onClick={() => setReplying(false)}
              className="text-muted-foreground text-xs hover:underline"
            >
              취소
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
