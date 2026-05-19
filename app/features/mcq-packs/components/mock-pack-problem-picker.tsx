// 모의고사 팩 문제 picker — 검색 + 다중 선택 일괄 추가. feat-10-002.
// staff 전용 — mcq-pack-detail 의 운영자 영역에서 사용.
import { CheckIcon, PlusIcon, SearchIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useFetcher, useLocation, useNavigate } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { cn } from "~/core/lib/utils";

interface SearchResult {
  id: string;
  label: string;
  secondary?: string;
}

export function MockPackProblemPicker({
  packId,
  lawCode,
}: {
  packId: string;
  /** 팩 과목의 law_code — 검색 범위 좁힘. 합본/자연과학 팩은 null. */
  lawCode: string | null;
}) {
  const searchFetcher = useFetcher<{ items: SearchResult[] }>();
  const addFetcher = useFetcher<{
    ok?: true;
    added?: number;
    skipped?: number;
    error?: string;
  }>();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Map<string, SearchResult>>(
    new Map(),
  );
  const navigate = useNavigate();
  const location = useLocation();

  // debounce 검색.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const handle = setTimeout(() => {
      const params = new URLSearchParams({
        kind: "problem",
        q,
        examRound: "first",
      });
      if (lawCode) params.set("lawCode", lawCode);
      searchFetcher.load(`/api/admin/search-content?${params.toString()}`);
    }, 250);
    return () => clearTimeout(handle);
    // searchFetcher 는 stable 하지 않을 수 있어 의도적으로 의존성에서 제외.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, lawCode]);

  // 추가 성공 → 선택 비우고 목록 새로고침.
  useEffect(() => {
    const d = addFetcher.data;
    if (addFetcher.state === "idle" && d && "ok" in d && d.ok) {
      setSelected(new Map());
      navigate(location.pathname + location.search, {
        replace: true,
        preventScrollReset: true,
      });
    }
  }, [
    addFetcher.state,
    addFetcher.data,
    navigate,
    location.pathname,
    location.search,
  ]);

  const toggle = (item: SearchResult) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.set(item.id, item);
      return next;
    });
  };

  const items = searchFetcher.data?.items ?? [];
  const addError =
    addFetcher.data && "error" in addFetcher.data ? addFetcher.data.error : null;

  return (
    <div className="border-border bg-muted/30 rounded-xl border p-3">
      <p className="mb-2 text-xs font-semibold">문제 검색해서 추가</p>
      <div className="relative">
        <SearchIcon className="text-muted-foreground absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="문제 본문 검색 (2자 이상)"
          className="h-8 pl-8 text-xs"
          autoComplete="off"
        />
      </div>

      {query.trim().length >= 2 ? (
        <ul className="border-border bg-background mt-2 max-h-64 divide-y overflow-auto rounded-md border">
          {searchFetcher.state === "loading" && items.length === 0 ? (
            <li className="text-muted-foreground p-3 text-center text-xs">
              검색 중…
            </li>
          ) : items.length === 0 ? (
            <li className="text-muted-foreground p-3 text-center text-xs">
              결과 없음
            </li>
          ) : (
            items.map((item) => {
              const isSel = selected.has(item.id);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => toggle(item)}
                    className={cn(
                      "flex w-full items-start gap-2 px-3 py-2 text-left text-xs transition-colors",
                      isSel ? "bg-primary/10" : "hover:bg-muted/60",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border",
                        isSel
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input",
                      )}
                    >
                      {isSel ? <CheckIcon className="size-3" /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {item.label}
                      </span>
                      {item.secondary ? (
                        <span className="text-muted-foreground block truncate text-[10px]">
                          {item.secondary}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      ) : null}

      <div className="mt-2 flex items-center gap-2">
        <addFetcher.Form method="post" action="/api/admin/mcq-pack">
          <input type="hidden" name="intent" value="add_problems" />
          <input type="hidden" name="packId" value={packId} />
          <input
            type="hidden"
            name="problemIds"
            value={JSON.stringify([...selected.keys()])}
          />
          <Button
            type="submit"
            size="sm"
            className="h-8 rounded-full"
            disabled={addFetcher.state !== "idle" || selected.size === 0}
          >
            <PlusIcon className="size-3" /> 선택한 {selected.size}개 추가
          </Button>
        </addFetcher.Form>
        {addError ? (
          <span className="text-xs text-rose-600">{addError}</span>
        ) : null}
      </div>
    </div>
  );
}
