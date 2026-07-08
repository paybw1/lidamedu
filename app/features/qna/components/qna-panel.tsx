import { MessageCircleQuestionIcon, PencilLineIcon } from "lucide-react";
import { Link } from "react-router";

import { Button } from "~/core/components/ui/button";

import {
  QNA_QUALITY_LABEL,
  QNA_STATUS_LABEL,
  type QnaTargetType,
  type QnaThreadSummary,
} from "../labels";

export function QnaPanel({
  threads,
  targetType,
  targetId,
  showQuality = false,
  fromCtx,
}: {
  threads: QnaThreadSummary[];
  targetType: QnaTargetType;
  targetId: string;
  /** 질문 수준 배지 — 강사·관리자에게만 (원장 지시 2026-07-07). */
  showQuality?: boolean;
  /** prev/next 컨텍스트 — 상세에서 이 목록 기준 이웃 이동(?from=). 미전달=대상 기준. */
  fromCtx?: string;
}) {
  const newHref = `/qna/new?targetType=${targetType}&targetId=${targetId}`;
  const from = fromCtx ?? `target:${targetType}:${targetId}`;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs">
          <MessageCircleQuestionIcon className="size-3.5" />
          이 항목에 대한 질문 {threads.length > 0 ? threads.length : ""}
        </p>
        <Button asChild size="sm" variant="outline" className="h-7 gap-1 text-xs">
          <Link to={newHref} viewTransition>
            <PencilLineIcon className="size-3.5" /> 새 질문
          </Link>
        </Button>
      </div>

      {threads.length === 0 ? (
        <p className="text-muted-foreground rounded-md border border-dashed px-3 py-6 text-center text-xs">
          아직 등록된 질문이 없습니다. 첫 질문을 등록해 보세요.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {threads.map((t) => (
            <li key={t.threadId}>
              <Link
                to={`/qna/${t.threadId}?from=${encodeURIComponent(from)}`}
                viewTransition
                className="hover:bg-accent/60 block rounded-md border p-2 transition-colors"
              >
                <div className="mb-1 flex items-center gap-1.5">
                  <span
                    className={
                      t.status === "answered"
                        ? "rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                        : "bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[10px] font-medium"
                    }
                  >
                    {QNA_STATUS_LABEL[t.status]}
                  </span>
                  {showQuality && t.qualityGrade ? (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                      수준 {QNA_QUALITY_LABEL[t.qualityGrade]}
                    </span>
                  ) : null}
                </div>
                <p className="line-clamp-2 text-xs font-medium">{t.title}</p>
                <p className="text-muted-foreground mt-1 text-[10px]">
                  {t.askerName ?? "미상"} ·{" "}
                  {new Date(t.createdAt).toLocaleDateString("ko-KR")}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
