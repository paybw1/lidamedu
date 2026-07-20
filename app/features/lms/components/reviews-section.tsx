// feat-11-006 Phase 4 — 수강평/교재평 표시 + 작성 섹션(학생용). /api/lms/review 로 제출.
import { useEffect, useState } from "react";

import { FlagIcon, StarIcon } from "lucide-react";
import { useFetcher } from "react-router";
import { toast } from "sonner";

import { Button } from "~/core/components/ui/button";
import { cn } from "~/core/lib/utils";
import type {
  ReviewRow,
  ReviewSummary,
  ReviewTargetType,
} from "~/features/lms/reviews.server";

export interface ReviewsSectionProps {
  targetType: ReviewTargetType;
  targetId: string;
  reviews: ReviewRow[];
  summary: ReviewSummary;
  myReview: ReviewRow | null;
  /** 구매(수강)한 회원인지 — 작성 가능 여부. */
  canWrite: boolean;
  isLoggedIn: boolean;
  title?: string;
}

function Stars({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex" aria-label={`별점 ${value}점`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <StarIcon
          key={n}
          className={cn(
            n <= Math.round(value) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40",
          )}
          style={{ width: size, height: size }}
        />
      ))}
    </span>
  );
}

export function ReviewsSection({
  targetType,
  targetId,
  reviews,
  summary,
  myReview,
  canWrite,
  isLoggedIn,
  title = "수강평",
}: ReviewsSectionProps) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const [writing, setWriting] = useState(false);
  const [rating, setRating] = useState(myReview?.rating ?? 5);
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.error) toast.error(fetcher.data.error);
    else if (fetcher.data.ok) {
      toast.success("등록했습니다.");
      setWriting(false);
    }
  }, [fetcher.state, fetcher.data]);

  const report = (reviewId: string) => {
    if (!isLoggedIn) return toast.error("로그인이 필요합니다.");
    const reason = window.prompt("신고 사유(선택)를 입력하세요");
    if (reason === null) return;
    const fd = new FormData();
    fd.set("intent", "report");
    fd.set("reviewId", reviewId);
    fd.set("reason", reason);
    fetcher.submit(fd, { method: "post", action: "/api/lms/review" });
  };
  const del = () => {
    if (!myReview || !window.confirm("내 후기를 삭제할까요?")) return;
    const fd = new FormData();
    fd.set("intent", "delete");
    fd.set("reviewId", myReview.reviewId);
    fetcher.submit(fd, { method: "post", action: "/api/lms/review" });
  };

  return (
    <section className="mt-10">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold">
          {title}
          <span className="text-muted-foreground ml-2 text-sm font-normal">
            {summary.count}개
          </span>
        </h2>
        {summary.count > 0 ? (
          <div className="flex items-center gap-2">
            <Stars value={summary.average} />
            <span className="text-sm font-semibold">{summary.average.toFixed(1)}</span>
          </div>
        ) : null}
      </div>

      {/* 작성 영역 */}
      {canWrite ? (
        writing || myReview ? (
          <fetcher.Form
            method="post"
            action="/api/lms/review"
            className="border-border bg-card mb-5 space-y-2.5 rounded-lg border p-4"
          >
            <input type="hidden" name="intent" value="submit" />
            <input type="hidden" name="targetType" value={targetType} />
            <input type="hidden" name="targetId" value={targetId} />
            <input type="hidden" name="rating" value={rating} />
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">별점</span>
              <span className="inline-flex">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(n)}
                    className="p-0.5"
                    aria-label={`${n}점`}
                  >
                    <StarIcon
                      className={cn(
                        "size-6",
                        n <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40",
                      )}
                    />
                  </button>
                ))}
              </span>
            </div>
            <textarea
              name="body"
              rows={3}
              maxLength={2000}
              defaultValue={myReview?.body ?? ""}
              placeholder="강의에 대한 솔직한 후기를 남겨 주세요."
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            />
            <label className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                name="isPublic"
                value="1"
                defaultChecked={myReview?.isPublic ?? true}
                className="size-3.5"
              />
              공개(다른 수험생에게 보임)
            </label>
            <input type="hidden" name="isPublic" value="0" />
            <div className="flex items-center gap-2">
              <Button type="submit" size="sm" disabled={fetcher.state !== "idle"}>
                {myReview ? "후기 수정" : "후기 등록"}
              </Button>
              {myReview ? (
                <button type="button" onClick={del} className="text-muted-foreground text-xs hover:text-rose-600">
                  삭제
                </button>
              ) : (
                <button type="button" onClick={() => setWriting(false)} className="text-muted-foreground text-xs hover:underline">
                  취소
                </button>
              )}
            </div>
          </fetcher.Form>
        ) : (
          <Button size="sm" variant="outline" className="mb-5" onClick={() => setWriting(true)}>
            후기 작성
          </Button>
        )
      ) : isLoggedIn ? (
        <p className="text-muted-foreground mb-5 text-sm">
          구매(수강)한 회원만 후기를 작성할 수 있습니다.
        </p>
      ) : null}

      {/* 목록 */}
      {reviews.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-8 text-center text-sm">
          아직 등록된 후기가 없습니다.
        </p>
      ) : (
        <ul className="space-y-3">
          {reviews.map((r) => (
            <li key={r.reviewId} className="border-border bg-card rounded-lg border p-4">
              <div className="mb-1 flex items-center gap-2">
                <Stars value={r.rating} size={14} />
                {r.isBest ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                    BEST
                  </span>
                ) : null}
                <span className="text-muted-foreground text-xs">{r.authorName ?? "수험생"}</span>
                <span className="text-muted-foreground/70 text-xs">
                  {r.createdAt.slice(0, 10)}
                </span>
                {r.authorId !== myReview?.authorId ? (
                  <button
                    type="button"
                    onClick={() => report(r.reviewId)}
                    className="text-muted-foreground/60 hover:text-rose-600 ml-auto inline-flex items-center gap-0.5 text-[11px]"
                    title="신고"
                  >
                    <FlagIcon className="size-3" /> 신고
                  </button>
                ) : null}
              </div>
              {r.body ? <p className="text-sm whitespace-pre-wrap">{r.body}</p> : null}
              {r.adminReply ? (
                <div className="bg-muted/40 mt-2 rounded-md px-3 py-2 text-sm">
                  <span className="mr-1 font-semibold text-primary">운영자 답변</span>
                  <span className="whitespace-pre-wrap">{r.adminReply}</span>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
