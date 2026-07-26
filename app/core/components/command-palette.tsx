// 전역 검색 (⌘K / Ctrl+K) — Command Palette 모달.
// 디바운스 fetch /api/search?q=...  → 도메인별 그룹 결과 → 클릭/엔터 시 navigate.

import {
  BookmarkIcon,
  BookOpenIcon,
  ClockIcon,
  FileTextIcon,
  GavelIcon,
  ListChecksIcon,
  MessageCircleQuestionIcon,
  SearchIcon,
  StickyNoteIcon,
  Trash2Icon,
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
  group: "article" | "case" | "problem" | "qna" | "memo" | "bookmark";
  id: string;
  primaryLabel: string;
  secondaryLabel: string | null;
  bodySnippet: string | null;
  href: string;
  lawCode: string | null;
}

interface RecentSearch {
  query: string;
  searchCount: number;
  lastSearchedAt: string;
}

interface SearchResults {
  query: string;
  articles: SearchHit[];
  cases: SearchHit[];
  problems: SearchHit[];
  qna: SearchHit[];
  memos: SearchHit[];
  bookmarks: SearchHit[];
  recentSearches: RecentSearch[];
  // 제목 검색이 0건이라 본문 전체로 자동 재검색된 경우 true.
  autoFull?: boolean;
}

const GROUP_META: Record<
  SearchHit["group"],
  { label: string; icon: typeof SearchIcon }
> = {
  article: { label: "조문", icon: BookOpenIcon },
  case: { label: "판례", icon: GavelIcon },
  problem: { label: "객관식 문제", icon: ListChecksIcon },
  qna: { label: "질의응답", icon: MessageCircleQuestionIcon },
  memo: { label: "메모", icon: StickyNoteIcon },
  bookmark: { label: "즐겨찾기", icon: BookmarkIcon },
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
  // 검색 범위 — 제목(title) / 본문 전체(full). 세션 내 마지막 선택 유지.
  const [scope, setScope] = useState<"title" | "full">("title");
  const fetcher = useFetcher<SearchResults>();
  const navigate = useNavigate();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ⌘K / Ctrl+K 토글 + 외부에서 window dispatchEvent('command-palette:open') 으로도 열 수 있게.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        // /admin 에선 운영자 화면 검색(AdminCommandPalette)이 ⌘K 를 가진다 — 양보.
        if (window.location.pathname.startsWith("/admin")) return;
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
  // 빈 입력 + 모달 open 상태에서는 recentSearches 만 받아오기 위해 q="" 로 호출.
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    debounceRef.current = setTimeout(
      () => {
        fetcher.load(
          `/api/search?q=${encodeURIComponent(trimmed)}&scope=${scope}`,
        );
      },
      trimmed.length === 0 ? 0 : 180,
    );
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // fetcher 객체는 매 렌더마다 새 참조 — 의존성에서 제외.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query, scope]);

  // 모달 닫힐 때 입력 리셋.
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const clearHistoryFetcher = useFetcher<{ ok?: true; error?: string }>();
  const clearHistory = () => {
    if (!confirm("최근 검색 기록을 모두 지우시겠습니까?")) return;
    const fd = new FormData();
    clearHistoryFetcher.submit(fd, {
      method: "post",
      action: "/api/search/clear-history",
    });
    // 화면에서 즉시 사라지도록 results 새로고침.
    fetcher.load(`/api/search?q=`);
  };

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
        results.qna.length +
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
      description="조문 · 판례 · 객관식 · 메모 · 즐겨찾기 통합 검색"
    >
      <CommandInput
        placeholder="검색어를 입력하세요 (조문 / 판례 / 문제 / 메모)"
        value={query}
        onValueChange={setQuery}
      />
      {/* 검색 범위 — 제목(빠름·정확) vs 본문 전체(요지·판시이유·평석·선지·해설까지) */}
      <div
        className="flex items-center gap-1.5 border-b px-3 py-1.5"
        data-testid="search-scope-toggle"
      >
        <span className="text-muted-foreground text-[10.5px] font-medium">
          검색 대상
        </span>
        {(
          [
            ["title", "제목"],
            ["full", "본문 전체"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={scope === value}
            onClick={() => setScope(value)}
            className={
              scope === value
                ? "bg-primary text-primary-foreground rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                : "text-muted-foreground hover:bg-accent rounded-full border px-2.5 py-0.5 text-[11px]"
            }
          >
            {label}
          </button>
        ))}
        {scope === "full" ? (
          <span className="text-muted-foreground ml-auto hidden text-[10px] sm:inline">
            요지·판시이유·평석·선지·해설까지 검색
          </span>
        ) : null}
      </div>
      <CommandList>
        {query.trim().length === 0 ? (
          <EmptyState
            recents={results?.recentSearches ?? []}
            onPick={setQuery}
            onClear={clearHistory}
          />
        ) : isLoading && !hasAnyResult ? (
          <div className="text-muted-foreground px-4 py-6 text-center text-xs">
            검색 중…
          </div>
        ) : results && !hasAnyResult ? (
          <CommandEmpty>일치하는 결과가 없습니다.</CommandEmpty>
        ) : results ? (
          <>
            {results.autoFull && scope === "title" ? (
              <div className="text-muted-foreground bg-muted/40 border-b px-3 py-1.5 text-[11px]">
                제목에서 결과가 없어 <b className="text-foreground">본문 전체</b>
                (요지·판시이유·평석 등)에서 찾았습니다.
              </div>
            ) : null}
            <Groups results={results} onSelect={go} />
          </>
        ) : null}
      </CommandList>
      <div className="text-muted-foreground border-t px-3 py-2 text-[10.5px]">
        결과 클릭 또는 ↵ 로 이동 · Esc 로 닫기
      </div>
    </CommandDialog>
  );
}

function EmptyState({
  recents,
  onPick,
  onClear,
}: {
  recents: RecentSearch[];
  onPick: (q: string) => void;
  onClear: () => void;
}) {
  if (recents.length === 0) {
    return (
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
    );
  }
  return (
    <div className="px-3 py-3" data-testid="recent-searches">
      <div className="flex items-center justify-between pb-2 text-[11px]">
        <p className="text-muted-foreground inline-flex items-center gap-1 font-semibold tracking-wide uppercase">
          <ClockIcon className="size-3" /> 최근 검색
        </p>
        <button
          type="button"
          onClick={onClear}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          data-testid="clear-search-history"
        >
          <Trash2Icon className="size-3" /> 모두 지우기
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {recents.map((r) => (
          <button
            key={r.query}
            type="button"
            onClick={() => onPick(r.query)}
            className="hover:bg-accent inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs"
            title={`${r.searchCount}회 검색 · ${new Date(r.lastSearchedAt).toLocaleString("ko-KR")}`}
          >
            {r.query}
            {r.searchCount > 1 ? (
              <span className="text-muted-foreground tabular-nums">
                ×{r.searchCount}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
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
    { key: "qna", items: results.qna },
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
