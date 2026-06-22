// 모의고사 팩 문제 picker — 검색 + 다중 선택 일괄 추가. feat-10-002.
// staff 전용 — mcq-pack-detail 의 운영자 영역에서 사용.
// 필터: 키워드 + 출처 + 형식 + 연도. 필터 단독 검색도 허용(키워드 0).
import { CheckIcon, EyeIcon, PlusIcon, SearchIcon, XIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useFetcher, useLocation, useNavigate } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { cn } from "~/core/lib/utils";

interface SearchResult {
  id: string;
  label: string;
  secondary?: string;
  /** 미리보기용 발문 전체 — search-content(problem) 가 채움. */
  preview?: string;
}

const ORIGIN_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "전체 출처" },
  { value: "ai_draft", label: "AI 초안" },
  { value: "past_exam", label: "기출" },
  { value: "past_exam_variant", label: "기출 변형" },
  { value: "expected", label: "예상문제" },
  { value: "mock", label: "모의고사" },
];

const FORMAT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "전체 형식" },
  { value: "mc_short", label: "단답형" },
  { value: "mc_box", label: "박스형" },
  { value: "mc_case", label: "사례형" },
];

export function MockPackProblemPicker({
  packId,
  lawCode,
  existingIds,
}: {
  packId: string;
  /** 팩 과목의 law_code — 검색 범위 좁힘. 합본/자연과학 팩은 null. */
  lawCode: string | null;
  /** 이미 이 팩에 담긴 problem_id — 중복 배지·추가 비활성용. */
  existingIds?: Set<string>;
}) {
  const searchFetcher = useFetcher<{ items: SearchResult[] }>();
  const addFetcher = useFetcher<{
    ok?: true;
    added?: number;
    skipped?: number;
    error?: string;
  }>();
  const [query, setQuery] = useState("");
  const [origin, setOrigin] = useState("");
  const [format, setFormat] = useState("");
  const [year, setYear] = useState("");
  const [selected, setSelected] = useState<Map<string, SearchResult>>(
    new Map(),
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const navigate = useNavigate();
  const location = useLocation();

  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 13 }, (_, i) => currentYear - i);
  }, []);

  const hasFilter = query.trim().length >= 2 || !!origin || !!format || !!year;

  // debounce 검색 — 키워드(≥2자) 또는 필터(출처/형식/연도) 하나라도 있으면 발동.
  useEffect(() => {
    if (!hasFilter) return;
    const handle = setTimeout(() => {
      const params = new URLSearchParams({
        kind: "problem",
        examRound: "first",
      });
      const trimmed = query.trim();
      if (trimmed.length >= 2) params.set("q", trimmed);
      if (origin) params.set("origin", origin);
      if (format) params.set("format", format);
      if (year) params.set("year", year);
      if (lawCode) params.set("lawCode", lawCode);
      searchFetcher.load(`/api/admin/search-content?${params.toString()}`);
    }, 250);
    return () => clearTimeout(handle);
    // searchFetcher 는 stable 하지 않을 수 있어 의도적으로 의존성에서 제외.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, origin, format, year, lawCode, hasFilter]);

  const resetFilters = () => {
    setQuery("");
    setOrigin("");
    setFormat("");
    setYear("");
  };

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

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const items = searchFetcher.data?.items ?? [];
  const addError =
    addFetcher.data && "error" in addFetcher.data
      ? addFetcher.data.error
      : null;

  return (
    <div className="border-border bg-muted/30 rounded-xl border p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold">문제 검색해서 추가</p>
        {hasFilter ? (
          <button
            type="button"
            onClick={resetFilters}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-[10px]"
          >
            <XIcon className="size-3" /> 필터 초기화
          </button>
        ) : null}
      </div>
      <div className="relative">
        <SearchIcon className="text-muted-foreground absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="문제 본문 검색 (2자 이상) — 비워두면 아래 필터만으로도 검색"
          className="h-8 pl-8 text-xs"
          autoComplete="off"
        />
      </div>

      <div className="mt-2 grid grid-cols-3 gap-1.5">
        <select
          value={origin}
          onChange={(e) => setOrigin(e.target.value)}
          aria-label="출처"
          className="border-input bg-background h-8 rounded-md border px-2 text-[11px]"
        >
          {ORIGIN_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value)}
          aria-label="형식"
          className="border-input bg-background h-8 rounded-md border px-2 text-[11px]"
        >
          {FORMAT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={year}
          onChange={(e) => setYear(e.target.value)}
          aria-label="연도"
          className="border-input bg-background h-8 rounded-md border px-2 text-[11px]"
        >
          <option value="">전체 연도</option>
          {yearOptions.map((y) => (
            <option key={y} value={String(y)}>
              {y}년
            </option>
          ))}
        </select>
      </div>

      {hasFilter ? (
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
              const inPack = existingIds?.has(item.id) ?? false;
              const isExpanded = expanded.has(item.id);
              return (
                <li key={item.id}>
                  <div
                    className={cn(
                      "flex items-start gap-2 px-3 py-2 text-xs transition-colors",
                      isSel
                        ? "bg-primary/10"
                        : inPack
                          ? ""
                          : "hover:bg-muted/60",
                      inPack && "opacity-60",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => !inPack && toggle(item)}
                      disabled={inPack}
                      className="flex min-w-0 flex-1 items-start gap-2 text-left disabled:cursor-default"
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border",
                          inPack
                            ? "border-muted-foreground/40 bg-muted text-muted-foreground"
                            : isSel
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-input",
                        )}
                      >
                        {inPack || isSel ? (
                          <CheckIcon className="size-3" />
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="min-w-0 truncate font-medium">
                            {item.label}
                          </span>
                          {inPack ? (
                            <span className="border-border text-muted-foreground shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold">
                              이미 포함
                            </span>
                          ) : null}
                        </span>
                        {item.secondary ? (
                          <span className="text-muted-foreground block truncate text-[10px]">
                            {item.secondary}
                          </span>
                        ) : null}
                      </span>
                    </button>
                    {item.preview ? (
                      <button
                        type="button"
                        onClick={() => toggleExpand(item.id)}
                        aria-expanded={isExpanded}
                        aria-label="미리보기"
                        title="미리보기"
                        className={cn(
                          "mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded transition-colors",
                          isExpanded
                            ? "text-foreground"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <EyeIcon className="size-3.5" />
                      </button>
                    ) : null}
                  </div>
                  {isExpanded && item.preview ? (
                    <div className="border-border bg-muted/40 text-muted-foreground border-t px-3 py-2 text-[11px] leading-relaxed whitespace-pre-line">
                      {item.preview}
                    </div>
                  ) : null}
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
