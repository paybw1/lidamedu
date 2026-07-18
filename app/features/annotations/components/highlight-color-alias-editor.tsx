// feat-3-208 — 사용자별 5색 닉네임 편집 UI.
// `/study/highlights` 페이지 상단에 inline 으로 노출. 저장 즉시 alias 가 적용된다.

import { CheckIcon, Loader2Icon, PaletteIcon, PencilIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { cn } from "~/core/lib/utils";

import {
  HIGHLIGHT_ALIAS_MAX_LEN,
  HIGHLIGHT_COLORS,
  HIGHLIGHT_COLOR_DEFAULT_LABEL,
  type HighlightColor,
  type HighlightColorAliases,
} from "../labels";
import { publishHighlightAliases } from "../lib/use-highlight-aliases";

// swatch dot 클래스 — 색상 시각 cue. 밑줄 계열은 색 동일·굵기만 다르니 같은 dot.
const DOT_CLASS: Record<HighlightColor, string> = {
  yellow: "bg-amber-400",
  green: "bg-emerald-500",
  red: "bg-rose-400",
  blue: "bg-sky-400",
  underline: "bg-foreground/60",
  underline_thick: "bg-foreground/60",
  underline_red: "bg-rose-500",
  underline_red_thick: "bg-rose-500",
  underline_blue: "bg-sky-500",
  underline_blue_thick: "bg-sky-500",
};

export function HighlightColorAliasEditor({
  initial,
}: {
  initial: HighlightColorAliases;
}) {
  // 낙관적 갱신용 로컬 상태 — 저장 응답 후 보정.
  const [draft, setDraft] = useState<HighlightColorAliases>(initial);
  const [open, setOpen] = useState(false);

  // initial 이 외부 갱신(loader revalidate) 시 동기화 + sessionStorage publish.
  useEffect(() => {
    setDraft(initial);
    publishHighlightAliases(initial);
  }, [initial]);

  return (
    <section className="border-border bg-card rounded-2xl border p-4">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <PaletteIcon className="text-muted-foreground size-4" aria-hidden />
          <h2 className="text-sm font-semibold">색상 닉네임</h2>
          <p className="text-muted-foreground hidden text-xs sm:block">
            색마다 어떤 목적으로 쓰는지 라벨링하면 툴바·목록에 그 라벨이 보입니다.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen((v) => !v)}
          className="h-7 gap-1 rounded-full text-xs"
        >
          <PencilIcon className="size-3" />
          {open ? "접기" : "편집"}
        </Button>
      </header>

      {open ? (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {HIGHLIGHT_COLORS.map((c) => (
            <AliasRow
              key={c}
              color={c}
              value={draft[c] ?? ""}
              onCommit={(v) => setDraft((prev) => ({ ...prev, [c]: v }))}
            />
          ))}
        </div>
      ) : (
        // 접힌 상태 — 한 줄 칩으로 현재 alias 요약.
        <div className="mt-3 flex flex-wrap gap-1.5">
          {HIGHLIGHT_COLORS.map((c) => {
            const v = draft[c]?.trim();
            return (
              <span
                key={c}
                className={cn(
                  "border-border inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                  v ? "" : "text-muted-foreground",
                )}
              >
                <span aria-hidden className={cn("size-2 rounded-full", DOT_CLASS[c])} />
                {v || HIGHLIGHT_COLOR_DEFAULT_LABEL[c]}
              </span>
            );
          })}
        </div>
      )}
    </section>
  );
}

function AliasRow({
  color,
  value,
  onCommit,
}: {
  color: HighlightColor;
  value: string;
  onCommit: (next: string) => void;
}) {
  const fetcher = useFetcher();
  const [local, setLocal] = useState(value);

  // 외부에서 value 가 바뀌면 동기화 (저장 응답 후 등).
  useEffect(() => setLocal(value), [value]);

  const submitting = fetcher.state !== "idle";
  // 저장 완료 시 상위 draft 보정 + 글로벌 cache(sessionStorage) 갱신.
  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data &&
      typeof fetcher.data === "object" &&
      "ok" in fetcher.data &&
      (fetcher.data as { ok: boolean }).ok
    ) {
      onCommit(local);
      const d = fetcher.data as { aliases?: unknown };
      if (d.aliases && typeof d.aliases === "object") {
        publishHighlightAliases(d.aliases as HighlightColorAliases);
      }
    }
    // local/onCommit 변경에는 반응 X — 응답 도착에만 동기화.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);

  const placeholder = `예: ${HIGHLIGHT_COLOR_DEFAULT_LABEL[color]} 의 의미`;
  const dirty = local.trim() !== value.trim();

  return (
    <fetcher.Form
      method="post"
      action="/api/annotations/highlight-alias"
      className="border-border bg-background flex items-center gap-2 rounded-lg border px-3 py-2"
    >
      <input type="hidden" name="intent" value="set" />
      <input type="hidden" name="color" value={color} />
      <span
        aria-hidden
        className={cn("size-2.5 shrink-0 rounded-full", DOT_CLASS[color])}
      />
      <span className="text-muted-foreground shrink-0 text-[11px] font-semibold tracking-wide uppercase">
        {HIGHLIGHT_COLOR_DEFAULT_LABEL[color]}
      </span>
      <Input
        name="alias"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        maxLength={HIGHLIGHT_ALIAS_MAX_LEN}
        placeholder={placeholder}
        aria-label={`${HIGHLIGHT_COLOR_DEFAULT_LABEL[color]} 색상 닉네임`}
        className="h-7 flex-1 text-xs"
      />
      <Button
        type="submit"
        size="sm"
        variant={dirty ? "default" : "outline"}
        disabled={submitting || !dirty}
        aria-label={`${HIGHLIGHT_COLOR_DEFAULT_LABEL[color]} 닉네임 저장`}
        className="h-7 w-7 shrink-0 rounded-md p-0"
      >
        {submitting ? (
          <Loader2Icon className="size-3.5 animate-spin" />
        ) : (
          <CheckIcon className="size-3.5" />
        )}
      </Button>
    </fetcher.Form>
  );
}
