// 반 공통 약점 → 문제 추천 패널 (feat-10 고도화 단계4). staff 전용, 단일 법 과목 팩만.
//   반 선택 → "약점 추천" → /api/admin/cohort-weak-problems(getCohortWeakNodes + 가중 배분)
//   → 후보 사전선택 → 강사 검토·가감 → add_problems(picker 와 동일 통로, 멱등·approved).
//   empty-state: 약점 노드 0(학기 초·시도 누적 전)이면 안내(에러/빈화면 아님).
import { CheckIcon, PlusIcon, UsersIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useFetcher, useLocation, useNavigate } from "react-router";

import { Button } from "~/core/components/ui/button";
import { cn } from "~/core/lib/utils";

interface Candidate {
  id: string;
  label: string;
  secondary?: string;
  preview?: string;
}
interface WeakData {
  items: Candidate[];
  cohortSize: number;
  threshold: number;
  weakNodeCount: number;
}

export function CohortWeaknessSource({
  packId,
  lawCode,
  cohorts,
}: {
  packId: string;
  lawCode: string;
  cohorts: Array<{ cohortId: string; name: string; memberCount: number }>;
}) {
  const loadFetcher = useFetcher<WeakData>();
  const addFetcher = useFetcher<{
    ok?: true;
    added?: number;
    skipped?: number;
    error?: string;
  }>();
  const [cohortId, setCohortId] = useState(cohorts[0]?.cohortId ?? "");
  const [n, setN] = useState(20);
  const [selected, setSelected] = useState<Map<string, Candidate>>(new Map());
  const navigate = useNavigate();
  const location = useLocation();

  const load = () => {
    if (!cohortId) return;
    const params = new URLSearchParams({
      cohortId,
      lawCode,
      n: String(n),
      packId,
    });
    loadFetcher.load(`/api/admin/cohort-weak-problems?${params.toString()}`);
  };

  // 추천 결과 도착 → 후보 전체 사전 선택(검토 후 가감).
  useEffect(() => {
    const d = loadFetcher.data;
    if (loadFetcher.state === "idle" && d) {
      setSelected(new Map(d.items.map((it) => [it.id, it])));
    }
  }, [loadFetcher.state, loadFetcher.data]);

  // 추가 성공 → 비우고 목록 새로고침(추가분 반영 + 다음 추천에서 제외).
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

  const toggle = (it: Candidate) =>
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(it.id)) next.delete(it.id);
      else next.set(it.id, it);
      return next;
    });

  const data = loadFetcher.data;
  const loading = loadFetcher.state !== "idle";
  const addError =
    addFetcher.data && "error" in addFetcher.data
      ? addFetcher.data.error
      : null;

  if (cohorts.length === 0) return null;

  return (
    <div className="border-border bg-muted/30 rounded-xl border p-3">
      <p className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold">
        <UsersIcon className="size-3.5" /> 반 공통 약점에서 추가
      </p>
      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-1.5">
        <select
          value={cohortId}
          onChange={(e) => setCohortId(e.target.value)}
          aria-label="반(코호트)"
          className="border-input bg-background h-8 rounded-md border px-2 text-[11px]"
        >
          {cohorts.map((c) => (
            <option key={c.cohortId} value={c.cohortId}>
              {c.name} ({c.memberCount}명)
            </option>
          ))}
        </select>
        <input
          type="number"
          min={1}
          max={50}
          value={n}
          onChange={(e) =>
            setN(Math.max(1, Math.min(50, Number(e.target.value) || 1)))
          }
          aria-label="추천 문항 수"
          className="border-input bg-background h-8 w-14 rounded-md border px-2 text-[11px]"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={load}
          disabled={loading || !cohortId}
          className="h-8 rounded-full text-[11px]"
        >
          {loading ? "분석 중…" : "약점 추천"}
        </Button>
      </div>

      {data && data.weakNodeCount === 0 ? (
        <div className="border-border text-muted-foreground mt-2 rounded-md border border-dashed p-3 text-[11px] leading-relaxed">
          아직 <b>반 공통 약점</b>이 잡히지 않았습니다. 학생들의 문제 풀이가 더
          쌓이면 약점 단원 기반으로 자동 추천합니다.
          <br />
          (기준: 한 단원을 서로 다른 학생 <b>{data.threshold}명</b> 이상이 풀고
          충분히 틀렸을 때 · 현재 반 {data.cohortSize}명)
        </div>
      ) : data && data.items.length > 0 ? (
        <>
          <p className="text-muted-foreground mt-2 text-[10px]">
            약점 단원 {data.weakNodeCount}개에서 {data.items.length}문항 추천 —
            검토 후 추가하세요.
          </p>
          <ul className="border-border bg-background mt-1 max-h-64 divide-y overflow-auto rounded-md border">
            {data.items.map((it) => {
              const isSel = selected.has(it.id);
              return (
                <li key={it.id}>
                  <button
                    type="button"
                    onClick={() => toggle(it)}
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
                        {it.label}
                      </span>
                      {it.secondary ? (
                        <span className="text-muted-foreground block truncate text-[10px]">
                          {it.secondary}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
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
              <span className="text-xs text-rose-600 dark:text-rose-400">
                {addError}
              </span>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
