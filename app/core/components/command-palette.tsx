// 전역 검색 (⌘K / Ctrl+K) — Command Palette 모달.
// 디바운스 fetch /api/search?q=...  → 도메인별 그룹 결과 → 클릭/엔터 시 navigate.

import {
  BookmarkIcon,
  BookOpenIcon,
  FileTextIcon,
  GavelIcon,
  ListChecksIcon,
  SearchIcon,
  StickyNoteIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFetcher, useNavigate } from "react-router";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "~/core/components/ui/command";

interface SearchHit {
  group: "article" | "case" | "problem" | "memo" | "bookmark";
  id: string;
  primaryLabel: string;
  secondaryLabel: string | null;
  bodySnippet: string | null;
  href: string;
  lawCode: string | null;
}

interface SearchResults {
  query: string;
  articles: SearchHit[];
  cases: SearchHit[];
  problems: SearchHit[];
  memos: SearchHit[];
  bookmarks: SearchHit[];
}

const GROUP_META: Record<
  SearchHit["group"],
  { label: string; icon: typeof SearchIcon }
> = {
  article: { label: "조문", icon: BookOpenIcon },
  case: { label: "판례", icon: GavelIcon },
  problem: { label: "객관식 문제", icon: ListChecksIcon },
  memo: { label: "내 메모", icon: StickyNoteIcon },
  bookmark: { label: "내 즐겨찾기", icon: BookmarkIcon },
};

export const COMMAND_PALETTE_OPEN_EVENT = "command-palette:open";

export function openCommandPalette() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(COMMAND_PALETTE_OPEN_EVENT));
  }
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const fetcher = useFetcher<SearchResults>();
  const navigate = useNavigate();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ⌘K / Ctrl+K 토글 + 외부에서 window dispatchEvent('command-palette:open') 으로도 열 수 있게.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    function onOpenEvent() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener(COMMAND_PALETTE_OPEN_EVENT, onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(COMMAND_PALETTE_OPEN_EVENT, onOpenEvent);
    };
  }, []);

  // 검색어 변경 → 디바운스 후 fetcher.load.
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    if (trimmed.length === 0) return;
    debounceRef.current = setTimeout(() => {
      fetcher.load(`/api/search?q=${encodeURIComponent(trimmed)}`);
    }, 180);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // fetcher 객체는 매 렌더마다 새 참조 — 의존성에서 제외.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query]);

  // 모달 닫힐 때 입력 리셋.
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      navigate(href);
    },
    [navigate],
  );

  const results = fetcher.data;
  const isLoading = fetcher.state !== "idle";
  const hasAnyResult = useMemo(() => {
    if (!results) return false;
    return (
      results.articles.length +
        results.cases.length +
        results.problems.length +
        results.memos.length +
        results.bookmarks.length >
      0
    );
  }, [results]);

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="전역 검색"
      description="조문 · 판례 · 객관식 · 내 메모 · 즐겨찾기 통합 검색"
    >
      <CommandInput
        placeholder="검색어를 입력하세요 (조문 / 판례 / 문제 / 메모)"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {query.trim().length === 0 ? (
          <div className="text-muted-foreground px-4 py-6 text-center text-xs">
            <p>
              검색어를 입력하세요. 단축키{" "}
              <kbd className="bg-muted rounded border px-1.5 py-0.5 font-mono text-[10px]">
                ⌘K
              </kbd>{" "}
              /{" "}
              <kbd className="bg-muted rounded border px-1.5 py-0.5 font-mono text-[10px]">
                Ctrl K
              </kbd>{" "}
              로 언제든 열 수 있습니다.
            </p>
          </div>
        ) : isLoading && !hasAnyResult ? (
          <div className="text-muted-foreground px-4 py-6 text-center text-xs">
            검색 중…
          </div>
        ) : results && !hasAnyResult ? (
          <CommandEmpty>일치하는 결과가 없습니다.</CommandEmpty>
        ) : results ? (
          <Groups results={results} onSelect={go} />
        ) : null}
      </CommandList>
      <div className="text-muted-foreground border-t px-3 py-2 text-[10.5px]">
        결과 클릭 또는 ↵ 로 이동 · Esc 로 닫기
      </div>
    </CommandDialog>
  );
}

function Groups({
  results,
  onSelect,
}: {
  results: SearchResults;
  onSelect: (href: string) => void;
}) {
  const groups: Array<{
    key: SearchHit["group"];
    items: SearchHit[];
  }> = [
    { key: "article", items: results.articles },
    { key: "case", items: results.cases },
    { key: "problem", items: results.problems },
    { key: "memo", items: results.memos },
    { key: "bookmark", items: results.bookmarks },
  ];
  const nonEmpty = groups.filter((g) => g.items.length > 0);
  return (
    <>
      {nonEmpty.map((g, i) => {
        const meta = GROUP_META[g.key];
        const Icon = meta.icon;
        return (
          <div key={g.key}>
            {i > 0 ? <CommandSeparator /> : null}
            <CommandGroup heading={meta.label}>
              {g.items.map((it) => (
                <CommandItem
                  key={`${g.key}:${it.id}`}
                  value={`${g.key}:${it.id}:${it.primaryLabel}`}
                  onSelect={() => onSelect(it.href)}
                  className="cursor-pointer"
                >
                  <Icon className="text-muted-foreground size-4 shrink-0" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm">{it.primaryLabel}</span>
                    {it.secondaryLabel || it.bodySnippet ? (
                      <span className="text-muted-foreground truncate text-[11px]">
                        {it.secondaryLabel
                          ? it.secondaryLabel
                          : null}
                        {it.secondaryLabel && it.bodySnippet ? " · " : ""}
                        {it.bodySnippet}
                      </span>
                    ) : null}
                  </div>
                  {it.lawCode ? (
                    <CommandShortcut className="text-[10px]">
                      {it.lawCode}
                    </CommandShortcut>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </div>
        );
      })}
    </>
  );
}
