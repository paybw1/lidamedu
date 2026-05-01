import { CheckIcon, ClockIcon } from "lucide-react";

import { Badge } from "~/core/components/ui/badge";
import { cn } from "~/core/lib/utils";
import type { RevisionHistoryEntry } from "~/features/laws/queries.server";

const CHANGE_KIND_LABEL: Record<RevisionHistoryEntry["changeKind"], string> = {
  created: "신설",
  amended: "개정",
  deleted: "삭제",
};

const CHANGE_KIND_TONE: Record<RevisionHistoryEntry["changeKind"], string> = {
  created: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  amended: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  deleted: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200",
};

export function RevisionHistory({
  revisions,
}: {
  revisions: RevisionHistoryEntry[];
}) {
  if (revisions.length === 0) {
    return (
      <div className="bg-muted/40 rounded-md border border-dashed p-4">
        <p className="text-muted-foreground text-center text-xs">
          등록된 개정 이력이 없습니다.
        </p>
      </div>
    );
  }

  return (
    <ol className="space-y-1.5">
      {revisions.map((r) => (
        <li
          key={r.revisionId}
          className={cn(
            "rounded-md border p-2.5",
            r.isCurrent
              ? "border-primary/60 bg-primary/5"
              : "bg-background",
          )}
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                CHANGE_KIND_TONE[r.changeKind],
              )}
            >
              {CHANGE_KIND_LABEL[r.changeKind]}
            </span>
            <span className="text-sm font-medium tabular-nums">
              {r.effectiveDate}
            </span>
            {r.isCurrent ? (
              <Badge
                variant="default"
                className="h-5 gap-0.5 bg-primary px-1.5 text-[10px]"
              >
                <CheckIcon className="size-2.5" />
                현행
              </Badge>
            ) : null}
          </div>
          <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
            <ClockIcon className="size-3" />
            <span>{formatTimestamp(r.createdAt)}</span>
            {r.authorName ? (
              <>
                <span aria-hidden>·</span>
                <span>{r.authorName}</span>
              </>
            ) : null}
            {r.lawRevisionNumber ? (
              <>
                <span aria-hidden>·</span>
                <span className="font-mono text-[10px]">
                  {r.lawRevisionNumber}
                </span>
              </>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function formatTimestamp(iso: string): string {
  // ISO → "YYYY-MM-DD HH:mm" (브라우저 로케일 무관 단순 표기)
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${hh}:${mm}`;
}
