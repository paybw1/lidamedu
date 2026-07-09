// feat-12 운영자 목록 행 컨트롤 — ↑/↓ 순서변경 + 삭제. 일정·소식·배너 공용.
import { ChevronDownIcon, ChevronUpIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { useFetcher } from "react-router";

import { cn } from "~/core/lib/utils";

export function AdminRowControls({
  entity,
  id,
  isFirst,
  isLast,
}: {
  entity: "schedule" | "news" | "banner";
  id: string;
  isFirst: boolean;
  isLast: boolean;
}) {
  const reorder = useFetcher();
  const del = useFetcher();
  const [confirm, setConfirm] = useState(false);
  const busy = reorder.state !== "idle";
  const arrow =
    "inline-flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent";

  const move = (direction: "up" | "down") => {
    const fd = new FormData();
    fd.set("entity", entity);
    fd.set("intent", "reorder");
    fd.set("id", id);
    fd.set("direction", direction);
    reorder.submit(fd, { method: "post", action: "/api/admin/landing" });
  };

  return (
    <div className="flex items-center gap-1">
      <div className="flex flex-col">
        <button
          type="button"
          aria-label="위로"
          disabled={isFirst || busy}
          onClick={() => move("up")}
          className={arrow}
        >
          <ChevronUpIcon className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label="아래로"
          disabled={isLast || busy}
          onClick={() => move("down")}
          className={arrow}
        >
          <ChevronDownIcon className="size-3.5" />
        </button>
      </div>
      {confirm ? (
        <del.Form method="post" action="/api/admin/landing" className="flex items-center gap-1">
          <input type="hidden" name="entity" value={entity} />
          <input type="hidden" name="intent" value="delete" />
          <input type="hidden" name="id" value={id} />
          <button
            type="submit"
            className="rounded-md bg-rose-600 px-2 py-1 text-[11px] font-semibold text-white"
            disabled={del.state !== "idle"}
          >
            삭제
          </button>
          <button
            type="button"
            onClick={() => setConfirm(false)}
            className="text-muted-foreground px-1 text-[11px]"
          >
            취소
          </button>
        </del.Form>
      ) : (
        <button
          type="button"
          onClick={() => setConfirm(true)}
          aria-label="삭제"
          className={cn(
            "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30",
          )}
        >
          <Trash2Icon className="size-3.5" />
        </button>
      )}
    </div>
  );
}
