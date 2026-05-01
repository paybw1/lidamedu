// 한 빈칸의 정답 입력 row. admin-blanks-edit (single article) / admin-blanks-all (multi article)
// 양쪽에서 사용. fetcher 가 컴포넌트 내부에 있어 row 별로 독립.

import { CheckIcon, Trash2Icon, XCircleIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { cn } from "~/core/lib/utils";

export interface BlankRowData {
  idx: number;
  length: number;
  answer: string;
}

export function BlankRowEditor({
  setId,
  blank,
  draft,
  active,
  initialFocus,
  disabled,
  onFocus,
  onDraftChange,
}: {
  setId: string;
  blank: BlankRowData;
  draft: string;
  active: boolean;
  initialFocus: boolean;
  disabled: boolean;
  onFocus: () => void;
  onDraftChange: (v: string) => void;
}) {
  const deleteFetcher = useFetcher();
  const deleteSubmitting = deleteFetcher.state !== "idle";
  const inputRef = useRef<HTMLInputElement>(null);
  const handleDelete = () => {
    const fd = new FormData();
    fd.set("setId", setId);
    fd.set("blankIdx", String(blank.idx));
    deleteFetcher.submit(fd, {
      method: "post",
      action: "/api/blanks/admin-remove-blank",
    });
  };
  const fetcher = useFetcher();
  const [savedFlag, setSavedFlag] = useState<"saved" | "error" | null>(null);

  useEffect(() => {
    if (!initialFocus) return;
    const el = inputRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.focus();
  }, [initialFocus]);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      const ok = (fetcher.data as { ok?: boolean }).ok;
      setSavedFlag(ok ? "saved" : "error");
      const t = setTimeout(() => setSavedFlag(null), 1500);
      return () => clearTimeout(t);
    }
  }, [fetcher.state, fetcher.data]);

  const submit = () => {
    const fd = new FormData();
    fd.set("setId", setId);
    fd.set("blankIdx", String(blank.idx));
    fd.set("answer", draft);
    fetcher.submit(fd, { method: "post", action: "/api/blanks/admin-answer" });
  };

  const dirty = draft.trim() !== blank.answer.trim();
  const empty = draft.trim().length === 0;

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md p-1 transition-colors",
        active && !disabled ? "ring-primary ring-2" : "",
      )}
    >
      <span
        className={cn(
          "inline-flex w-12 shrink-0 items-center justify-center rounded text-xs font-mono",
          empty
            ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
            : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
        )}
      >
        #{blank.idx}
      </span>
      <Input
        ref={inputRef}
        value={draft}
        onChange={(e) => onDraftChange(e.target.value)}
        onFocus={onFocus}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        disabled={disabled}
        placeholder={`정답 (${blank.length}자)`}
        className="h-8 text-sm"
      />
      <Button
        type="button"
        size="icon"
        variant="ghost"
        disabled={disabled || deleteSubmitting}
        onClick={handleDelete}
        className="h-8 w-8 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/40"
        title={`빈칸 #${blank.idx} 제거`}
      >
        <Trash2Icon className="size-3.5" />
      </Button>
      <Button
        type="button"
        size="sm"
        variant={dirty ? "default" : "outline"}
        disabled={disabled || !dirty || fetcher.state !== "idle"}
        onClick={submit}
        className="h-8 px-2 text-xs"
      >
        {savedFlag === "saved" ? (
          <CheckIcon className="size-3.5" />
        ) : savedFlag === "error" ? (
          <XCircleIcon className="size-3.5" />
        ) : (
          "저장"
        )}
      </Button>
    </div>
  );
}
