// 본문에 표시되지 않는 (computeBlockBlankHits 가 위치를 잡지 못한) 빈칸 일람.
// 정답 입력됨 / 미입력 두 그룹으로 분리해 보여주고 일괄 삭제 버튼 제공.

import { AlertTriangleIcon, Trash2Icon } from "lucide-react";
import { useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import { cn } from "~/core/lib/utils";

import type { BlankRowData } from "./blank-row-editor";

export function UnplacedBlanksSection({
  setId,
  unplaced,
  activeIdx,
  onActivate,
  disabled,
}: {
  setId: string;
  unplaced: BlankRowData[];
  activeIdx: number | null;
  onActivate: (idx: number) => void;
  disabled?: boolean;
}) {
  const removeAllFetcher = useFetcher();
  const submitting = removeAllFetcher.state !== "idle";

  if (unplaced.length === 0) return null;

  const answeredButUnplaced = unplaced.filter((b) => b.answer.trim().length > 0);
  const unanswered = unplaced.filter((b) => b.answer.trim().length === 0);

  const handleRemoveAll = () => {
    if (
      !confirm(
        `미매칭 빈칸 ${unplaced.length}개를 모두 삭제할까요?\n` +
          `(정답 입력됨 ${answeredButUnplaced.length}개, 미입력 ${unanswered.length}개)`,
      )
    )
      return;
    const fd = new FormData();
    fd.set("setId", setId);
    fd.set("blankIdxs", unplaced.map((b) => b.idx).join(","));
    removeAllFetcher.submit(fd, {
      method: "post",
      action: "/api/blanks/admin-remove-blanks",
    });
  };

  return (
    <div className="mt-3 rounded border border-amber-300/60 bg-amber-50/60 px-3 py-2 text-xs dark:border-amber-700/60 dark:bg-amber-950/30">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1 font-semibold text-amber-900 dark:text-amber-200">
          <AlertTriangleIcon className="size-3" />
          본문에 표시되지 않은 빈칸 ({unplaced.length})
        </p>
        {!disabled ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={handleRemoveAll}
            disabled={submitting}
            className="h-6 gap-1 px-2 text-[11px] text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/40"
          >
            <Trash2Icon className="size-3" />
            {submitting ? "삭제 중…" : "전체 삭제"}
          </Button>
        ) : null}
      </div>
      {answeredButUnplaced.length > 0 ? (
        <div className="mb-1.5">
          <p className="mb-0.5 text-[10px] font-semibold tracking-wide text-rose-700 uppercase dark:text-rose-400">
            정답 입력됨이지만 위치 매칭 실패 ({answeredButUnplaced.length})
          </p>
          <div className="flex flex-wrap gap-1">
            {answeredButUnplaced.map((b) => (
              <button
                key={b.idx}
                type="button"
                onClick={() => onActivate(b.idx)}
                title={`정답: ${b.answer}`}
                className={cn(
                  "rounded border border-rose-400/60 bg-rose-50 px-1.5 py-0.5 text-[11px] text-rose-900 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-200 dark:hover:bg-rose-950/60",
                  activeIdx === b.idx && "ring-primary ring-2",
                )}
              >
                <span className="font-mono">#{b.idx}</span>
                <span className="ml-1 max-w-[12rem] truncate align-middle">
                  {b.answer}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {unanswered.length > 0 ? (
        <div>
          <p className="mb-0.5 text-[10px] font-semibold tracking-wide text-amber-700 uppercase dark:text-amber-400">
            정답 미입력 ({unanswered.length})
          </p>
          <div className="flex flex-wrap gap-1">
            {unanswered.map((b) => (
              <button
                key={b.idx}
                type="button"
                onClick={() => onActivate(b.idx)}
                className={cn(
                  "rounded border border-amber-400/60 bg-amber-100/80 px-1.5 py-0.5 font-mono text-[11px] text-amber-900 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:hover:bg-amber-900/60",
                  activeIdx === b.idx && "ring-primary ring-2",
                )}
              >
                #{b.idx}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
