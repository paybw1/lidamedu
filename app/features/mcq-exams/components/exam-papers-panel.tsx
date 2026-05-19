// 통합 모의고사 교시 구성 패널 — staff 전용 (feat-10-005).
// /admin/mcq-exams/:examId 편집 화면에 노출. 교시(공개 모의 팩) 추가 ·
// 순서/과락선 수정 · 삭제. 모든 뮤테이션은 /api/admin/mcq-exam (fetcher) —
// 성공 시 loader 재검증.

import { PlusIcon, SaveIcon, Trash2Icon } from "lucide-react";
import { useEffect } from "react";
import { useFetcher, useLocation, useNavigate } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import type { McqExamPaper } from "~/features/mcq-exams/labels";
import { MCQ_PACK_SUBJECT_LABELS } from "~/features/mcq-packs/labels";

interface AvailablePack {
  packId: string;
  title: string;
  subjectLabel: string;
}

// 액션 성공({ok:true}) 시 현재 화면 loader 재검증.
function useRevalidateOnOk(state: string, result: unknown) {
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (
      state === "idle" &&
      result &&
      typeof result === "object" &&
      "ok" in result &&
      (result as { ok?: boolean }).ok
    ) {
      navigate(location.pathname + location.search, {
        replace: true,
        preventScrollReset: true,
      });
    }
  }, [state, result, navigate, location.pathname, location.search]);
}

function fetcherError(data: { ok?: true; error?: string } | undefined) {
  return data && "error" in data && data.error ? data.error : null;
}

export function ExamPapersPanel({
  examId,
  papers,
  availablePacks,
}: {
  examId: string;
  papers: McqExamPaper[];
  availablePacks: AvailablePack[];
}) {
  return (
    <div className="border-border bg-muted/30 rounded-2xl border border-dashed p-4">
      <p className="text-sm font-bold tracking-tight">
        교시 구성
        <span className="text-muted-foreground ml-1.5 text-xs font-normal">
          · 운영자
        </span>
      </p>
      <p className="text-muted-foreground mt-0.5 mb-3 text-xs">
        교시는 공개된 모의고사 팩만 추가할 수 있습니다. 순서와 과락선(정답률 %)을
        지정하세요.
      </p>
      <div className="space-y-2">
        {papers.length === 0 ? (
          <p className="text-muted-foreground text-xs">아직 교시가 없습니다.</p>
        ) : (
          papers.map((paper, idx) => (
            <PaperAdminRow
              key={paper.packId}
              examId={examId}
              paper={paper}
              index={idx + 1}
            />
          ))
        )}
      </div>
      <AddPaperRow examId={examId} availablePacks={availablePacks} />
    </div>
  );
}

function PaperAdminRow({
  examId,
  paper,
  index,
}: {
  examId: string;
  paper: McqExamPaper;
  index: number;
}) {
  const saveFetcher = useFetcher<{ ok?: true; error?: string }>();
  const delFetcher = useFetcher<{ ok?: true; error?: string }>();
  useRevalidateOnOk(saveFetcher.state, saveFetcher.data);
  useRevalidateOnOk(delFetcher.state, delFetcher.data);
  const busy = saveFetcher.state !== "idle" || delFetcher.state !== "idle";
  const err = fetcherError(saveFetcher.data) ?? fetcherError(delFetcher.data);

  return (
    <div className="border-border bg-card flex flex-wrap items-center gap-2 rounded-xl border p-2.5">
      <span className="text-muted-foreground text-xs font-bold tabular-nums">
        {index}교시
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
        {paper.packTitle}
        <span className="text-muted-foreground ml-1.5 text-[11px]">
          {MCQ_PACK_SUBJECT_LABELS[paper.subjectScope]} · 문항{" "}
          {paper.problemCount}
        </span>
      </span>
      <saveFetcher.Form
        method="post"
        action="/api/admin/mcq-exam"
        className="flex items-center gap-1.5"
      >
        <input type="hidden" name="intent" value="update_paper" />
        <input type="hidden" name="examId" value={examId} />
        <input type="hidden" name="packId" value={paper.packId} />
        <label className="text-muted-foreground text-[11px]">순서</label>
        <Input
          name="ord"
          type="number"
          min={0}
          max={99}
          defaultValue={paper.ord}
          className="h-7 w-14 text-xs"
          aria-label="교시 순서"
        />
        <label className="text-muted-foreground text-[11px]">과락</label>
        <Input
          name="failFloor"
          type="number"
          min={0}
          max={100}
          defaultValue={paper.failFloor}
          className="h-7 w-16 text-xs"
          aria-label="과락선"
        />
        <Button
          type="submit"
          size="sm"
          variant="outline"
          className="h-7 rounded-full"
          disabled={busy}
        >
          <SaveIcon className="size-3" /> 저장
        </Button>
      </saveFetcher.Form>
      <delFetcher.Form
        method="post"
        action="/api/admin/mcq-exam"
        onSubmit={(e) => {
          if (!confirm(`"${paper.packTitle}" 교시를 시험에서 빼시겠습니까?`)) {
            e.preventDefault();
          }
        }}
      >
        <input type="hidden" name="intent" value="remove_paper" />
        <input type="hidden" name="examId" value={examId} />
        <input type="hidden" name="packId" value={paper.packId} />
        <Button
          type="submit"
          size="icon"
          variant="ghost"
          disabled={busy}
          className="size-7 rounded-full text-rose-600 hover:text-rose-700"
          aria-label="교시 삭제"
        >
          <Trash2Icon className="size-3.5" />
        </Button>
      </delFetcher.Form>
      {err ? <p className="w-full text-[11px] text-rose-600">{err}</p> : null}
    </div>
  );
}

function AddPaperRow({
  examId,
  availablePacks,
}: {
  examId: string;
  availablePacks: AvailablePack[];
}) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  useRevalidateOnOk(fetcher.state, fetcher.data);
  const busy = fetcher.state !== "idle";
  const err = fetcherError(fetcher.data);

  if (availablePacks.length === 0) {
    return (
      <p className="text-muted-foreground border-border mt-3 border-t pt-3 text-xs">
        추가할 수 있는 공개 모의고사 팩이 없습니다 — 객관식 문제 색인에서 모의
        팩을 만들고 공개하세요.
      </p>
    );
  }
  return (
    <fetcher.Form
      method="post"
      action="/api/admin/mcq-exam"
      className="border-border mt-3 flex flex-wrap items-center gap-1.5 border-t pt-3"
    >
      <input type="hidden" name="intent" value="add_paper" />
      <input type="hidden" name="examId" value={examId} />
      <select
        name="packId"
        required
        aria-label="교시로 추가할 모의 팩"
        className="border-input bg-background h-8 max-w-[280px] min-w-[180px] flex-1 rounded-md border px-2 text-xs"
      >
        <option value="">교시로 추가할 모의 팩 …</option>
        {availablePacks.map((p) => (
          <option key={p.packId} value={p.packId}>
            {p.subjectLabel} · {p.title}
          </option>
        ))}
      </select>
      <label className="text-muted-foreground text-[11px]">과락선</label>
      <Input
        name="failFloor"
        type="number"
        min={0}
        max={100}
        defaultValue={40}
        className="h-8 w-16 text-xs"
        aria-label="과락선"
      />
      <Button
        type="submit"
        size="sm"
        className="h-8 rounded-full"
        disabled={busy}
      >
        <PlusIcon className="size-3.5" /> 교시 추가
      </Button>
      {err ? <p className="w-full text-[11px] text-rose-600">{err}</p> : null}
    </fetcher.Form>
  );
}
