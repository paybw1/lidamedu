// 통합 모의고사(mcq_exams) 메타데이터 폼 — 운영자 전용 (feat-10-005).
// /admin/mcq-exams 시험 추가 · /admin/mcq-exams/:examId 시험 편집에서 공용.
// 교시(mcq_pack) 구성은 ExamPapersPanel 이 별도로 담당한다.

import {
  BookOpenCheckIcon,
  CheckCircle2Icon,
  PlusIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import type { McqExamItem } from "~/features/mcq-exams/labels";

interface ExamFormResult {
  ok?: true;
  examId?: string;
  error?: string;
}

export function ExamForm({
  mode,
  exam,
  onCancel,
  onSaved,
}: {
  mode: "create" | "update";
  exam?: McqExamItem;
  /** 취소 버튼 — 제공 시에만 노출(인라인 추가 폼). */
  onCancel?: () => void;
  /** 저장 성공 시 응답 1건당 정확히 한 번 호출. examId 는 create 시에만 채워진다. */
  onSaved?: (result: { examId: string | null }) => void;
}) {
  const fetcher = useFetcher<ExamFormResult>();
  const isSaving = fetcher.state !== "idle";
  const result = fetcher.state === "idle" ? (fetcher.data ?? null) : null;
  const error = result && "error" in result ? result.error : null;
  const saved = result?.ok === true;

  // 저장 성공을 응답 객체 1건당 한 번만 onSaved 로 전달 (재렌더 루프 방지).
  const handledRef = useRef<ExamFormResult | null>(null);
  useEffect(() => {
    if (saved && result && handledRef.current !== result) {
      handledRef.current = result;
      onSaved?.({ examId: result.examId ?? null });
    }
  }, [saved, result, onSaved]);

  return (
    <fetcher.Form
      method="post"
      action="/api/admin/mcq-exam"
      className="border-border bg-card space-y-3 rounded-2xl border p-4 shadow-sm"
    >
      <input type="hidden" name="intent" value={mode} />
      {mode === "update" ? (
        <input type="hidden" name="examId" value={exam!.examId} />
      ) : null}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[120px_1fr_120px_1fr]">
        <ExamField label="명칭 *" full>
          <Input
            name="title"
            required
            maxLength={500}
            defaultValue={exam?.title ?? ""}
            className="h-8 text-xs"
            placeholder="예: 2026년 1월 1차 통합 모의고사"
          />
        </ExamField>
        <ExamField label="년도">
          <Input
            name="year"
            type="number"
            min={2000}
            max={2099}
            defaultValue={exam?.year ?? ""}
            className="h-8 text-xs"
            placeholder="2026"
          />
        </ExamField>
        <ExamField label="회차">
          <Input
            name="examRoundNo"
            type="number"
            min={1}
            max={999}
            defaultValue={exam?.examRoundNo ?? ""}
            className="h-8 text-xs"
            placeholder="1"
          />
        </ExamField>
        <ExamField label="합격 평균 (%)">
          <Input
            name="passAverage"
            type="number"
            min={0}
            max={100}
            defaultValue={exam?.passAverage ?? 60}
            className="h-8 text-xs"
            placeholder="60"
          />
        </ExamField>
        <ExamField label="출제일">
          <Input
            name="publishedAt"
            type="date"
            defaultValue={exam?.publishedAt ?? ""}
            className="h-8 text-xs"
          />
        </ExamField>
        <ExamField label="설명" full>
          <textarea
            name="description"
            maxLength={5000}
            defaultValue={exam?.description ?? ""}
            rows={2}
            className="border-input bg-background w-full rounded-md border px-2 py-1 text-xs"
          />
        </ExamField>
        <ExamField label="공개 여부">
          <label className="border-input flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-xs">
            <input
              type="checkbox"
              name="isPublished"
              defaultChecked={exam?.isPublished ?? false}
              value="1"
              className="accent-primary size-3.5"
            />
            학생에게 공개
          </label>
        </ExamField>
      </div>
      {mode === "create" ? (
        <p className="text-muted-foreground text-[11px]">
          시험을 추가하면 편집 화면이 열립니다 — 교시(과목별 모의고사 팩)는 거기서
          구성합니다.
        </p>
      ) : null}
      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
      <div className="flex items-center justify-end gap-2">
        {saved && !error ? (
          <span className="mr-auto inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
            <CheckCircle2Icon className="size-3.5" /> 저장되었습니다
          </span>
        ) : null}
        {onCancel ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-full"
            onClick={onCancel}
            disabled={isSaving}
          >
            <XIcon className="size-3.5" /> 취소
          </Button>
        ) : null}
        <Button
          type="submit"
          size="sm"
          className="rounded-full"
          disabled={isSaving}
        >
          {mode === "create" ? (
            <>
              <PlusIcon className="size-3.5" /> 추가
            </>
          ) : (
            <>
              <BookOpenCheckIcon className="size-3.5" /> 저장
            </>
          )}
        </Button>
      </div>
    </fetcher.Form>
  );
}

function ExamField({
  label,
  full,
  children,
}: {
  label: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      <Label className="text-muted-foreground text-[11px] sm:self-center">
        {label}
      </Label>
      <div className={full ? "sm:col-span-3" : ""}>{children}</div>
    </>
  );
}
