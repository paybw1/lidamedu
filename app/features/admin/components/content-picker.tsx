// 운영자 검색 picker — article / case / problem / blank_set 의 UUID 를 직접 입력하는
// 대신 라벨로 검색해서 선택. curriculum_items / assignment_items 추가 폼에서 공용 사용.

import { CheckIcon, SearchIcon, XIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { cn } from "~/core/lib/utils";

export type ContentPickerKind = "article" | "case" | "problem" | "blank_set";

interface SearchResult {
  id: string;
  label: string;
  secondary?: string;
}

const PLACEHOLDER: Record<ContentPickerKind, string> = {
  article: "조문 검색 (예: 제29조, 발명)",
  case: "판례 검색 (사건번호 또는 사건명)",
  problem: "문제 본문 검색",
  blank_set: "빈칸 세트 이름 검색",
};

export function ContentPicker({
  kind,
  name,
  required,
  defaultValue,
  defaultLabel,
}: {
  kind: ContentPickerKind;
  name: string;
  required?: boolean;
  defaultValue?: string;
  defaultLabel?: string;
}) {
  const inputId = useId();
  const fetcher = useFetcher<{ items: SearchResult[] }>();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<SearchResult | null>(
    defaultValue && defaultLabel
      ? { id: defaultValue, label: defaultLabel }
      : null,
  );
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // debounce 검색
  useEffect(() => {
    if (selected) return;
    if (query.length < 2) return;
    const handle = setTimeout(() => {
      fetcher.load(
        `/api/admin/search-content?kind=${kind}&q=${encodeURIComponent(query)}`,
      );
      setOpen(true);
    }, 250);
    return () => clearTimeout(handle);
    // fetcher 는 stable 하지 않을 수 있어 의도적으로 의존성에서 제외
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, kind, selected]);

  // 바깥 클릭 닫기
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (selected) {
    return (
      <div className="flex items-center gap-2">
        <input type="hidden" name={name} value={selected.id} required={required} />
        <div className="bg-muted/40 border-input flex flex-1 items-center gap-2 truncate rounded-md border px-2 py-1.5 text-xs">
          <CheckIcon className="text-emerald-600 size-3.5 shrink-0" />
          <span className="truncate font-medium">{selected.label}</span>
          {selected.secondary ? (
            <span className="text-muted-foreground truncate">
              · {selected.secondary}
            </span>
          ) : null}
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-7"
          onClick={() => {
            setSelected(null);
            setQuery("");
          }}
          aria-label="변경"
        >
          <XIcon className="size-3.5" />
        </Button>
      </div>
    );
  }

  const items = fetcher.data?.items ?? [];
  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <SearchIcon className="text-muted-foreground absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
        <Input
          id={inputId}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={PLACEHOLDER[kind]}
          className="h-8 pl-8 text-xs"
          autoComplete="off"
          onFocus={() => {
            if (items.length > 0) setOpen(true);
          }}
        />
      </div>
      {/* hidden input 은 selected 없을 때 비어있음 — required 시 form submit 차단됨 */}
      {required ? (
        <input
          type="hidden"
          name={name}
          value=""
          required
        />
      ) : null}
      {open && (items.length > 0 || fetcher.state === "loading") ? (
        <div className="bg-popover absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border shadow-md">
          {fetcher.state === "loading" && items.length === 0 ? (
            <div className="text-muted-foreground p-3 text-center text-xs">
              검색 중...
            </div>
          ) : items.length === 0 ? (
            <div className="text-muted-foreground p-3 text-center text-xs">
              결과 없음
            </div>
          ) : (
            <ul className="divide-y">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(item);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={cn(
                      "hover:bg-muted/60 flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-xs",
                    )}
                  >
                    <span className="truncate font-medium">{item.label}</span>
                    {item.secondary ? (
                      <span className="text-muted-foreground truncate text-[10px]">
                        {item.secondary}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
