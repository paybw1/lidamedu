// Phase 3 — 계획 항목 노드 선택기.
// 기본 진입점 = 약점 추천 + 최근 사용 (과목당 노드 109~175개 — 전체 트리 탐색만
// 제공하면 실패한다). 전체 탐색(계층 들여쓰기 + 검색)은 2차 경로로 지연 로드.

import { SearchIcon, XIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { cn } from "~/core/lib/utils";
import {
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

export interface NodeSuggestion {
  nodeId: string;
  displayLabel: string;
  sub?: string | null;
}

interface PlanNodeRow {
  nodeId: string;
  displayLabel: string;
  depth: number;
}

export function NodePicker({
  weakNodes,
  recentNodes,
  value,
  valueLabel,
  onChange,
}: {
  weakNodes: NodeSuggestion[];
  recentNodes: NodeSuggestion[];
  value: string | null;
  valueLabel: string | null;
  onChange: (nodeId: string | null, label: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [law, setLaw] = useState<LawSubjectSlug | "">("");
  const [query, setQuery] = useState("");
  const fetcher = useFetcher<{ ok?: true; nodes?: PlanNodeRow[]; error?: string }>();

  useEffect(() => {
    if (law) fetcher.load(`/api/study-plan/nodes?law=${law}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [law]);

  const allNodes = fetcher.data?.nodes ?? [];
  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return allNodes;
    return allNodes.filter((n) => n.displayLabel.includes(q));
  }, [allNodes, query]);

  const pick = (nodeId: string, label: string) => {
    onChange(nodeId, label);
    setOpen(false);
  };

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {value ? (
          <span className="bg-primary/10 text-link inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold">
            {valueLabel ?? "노드"}
            <button
              type="button"
              onClick={() => onChange(null, null)}
              title="노드 해제"
            >
              <XIcon className="size-3" />
            </button>
          </span>
        ) : (
          <span className="text-muted-foreground text-[11px]">
            노드 미연결
          </span>
        )}
        <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => setOpen(true)}>
          단원 선택
        </Button>
      </div>
    );
  }

  return (
    <div className="bg-muted/30 space-y-2 rounded-lg border p-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold">단원(체계도) 선택</p>
        <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => setOpen(false)}>
          닫기
        </Button>
      </div>

      {weakNodes.length > 0 ? (
        <div>
          <p className="text-muted-foreground mb-1 text-[10px] font-semibold tracking-wide uppercase">
            약점 추천
          </p>
          <div className="flex flex-wrap gap-1">
            {weakNodes.map((n) => (
              <button
                key={n.nodeId}
                type="button"
                onClick={() => pick(n.nodeId, n.displayLabel)}
                className="rounded-full border border-rose-300 bg-rose-50 px-2 py-0.5 text-[11px] text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300"
              >
                {n.displayLabel}
                {n.sub ? <span className="opacity-70"> · {n.sub}</span> : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {recentNodes.length > 0 ? (
        <div>
          <p className="text-muted-foreground mb-1 text-[10px] font-semibold tracking-wide uppercase">
            최근 사용
          </p>
          <div className="flex flex-wrap gap-1">
            {recentNodes.map((n) => (
              <button
                key={n.nodeId}
                type="button"
                onClick={() => pick(n.nodeId, n.displayLabel)}
                className="border-border bg-card rounded-full border px-2 py-0.5 text-[11px] hover:border-primary/50"
              >
                {n.displayLabel}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* 2차 경로 — 전체 탐색 (과목 → 계층 + 검색) */}
      <div>
        <p className="text-muted-foreground mb-1 text-[10px] font-semibold tracking-wide uppercase">
          전체 탐색
        </p>
        <div className="flex items-center gap-1.5">
          <select
            value={law}
            onChange={(e) => {
              setLaw(e.target.value as LawSubjectSlug | "");
              setQuery("");
            }}
            className="border-input bg-background h-7 rounded-md border px-1.5 text-[11px]"
          >
            <option value="">과목 선택</option>
            {LAW_SUBJECT_SLUGS.map((s) => (
              <option key={s} value={s}>
                {LAW_SUBJECTS[s].name}
              </option>
            ))}
          </select>
          {law ? (
            <div className="relative flex-1">
              <SearchIcon className="text-muted-foreground absolute top-1.5 left-1.5 size-3.5" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="단원 검색"
                className="h-7 pl-6 text-[11px]"
              />
            </div>
          ) : null}
        </div>
        {law ? (
          fetcher.state !== "idle" && allNodes.length === 0 ? (
            <p className="text-muted-foreground mt-1 text-[11px]">불러오는 중…</p>
          ) : (
            <ul className="bg-card mt-1 max-h-48 overflow-y-auto rounded-md border">
              {filtered.map((n) => (
                <li key={n.nodeId}>
                  <button
                    type="button"
                    onClick={() => pick(n.nodeId, n.displayLabel)}
                    className={cn(
                      "hover:bg-muted/60 w-full truncate px-2 py-1 text-left text-[11px]",
                    )}
                    style={{ paddingLeft: `${8 + n.depth * 12}px` }}
                  >
                    {n.displayLabel}
                  </button>
                </li>
              ))}
              {filtered.length === 0 ? (
                <li className="text-muted-foreground px-2 py-2 text-[11px]">
                  검색 결과가 없습니다
                </li>
              ) : null}
            </ul>
          )
        ) : null}
      </div>
    </div>
  );
}
