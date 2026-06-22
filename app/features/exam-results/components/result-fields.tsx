// 시험 결과 입력 필드 — /me/exam-results 신규 폼 + 대시보드 입력 허브 공용(드리프트 0).
// 폼(fetcher.Form action="/me/exam-results", intent=upsert)은 호출처가 소유; 여기는 필드만.
import { useState } from "react";

import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import { Textarea } from "~/core/components/ui/textarea";
import { cn } from "~/core/lib/utils";
import {
  EXAM_RESULT_STATUSES,
  EXAM_RESULT_STATUS_LABEL,
  type ExamRound,
} from "~/features/exam-results/labels";
import {
  FIRST_ROUND_SUBJECTS,
  SECOND_ROUND_REQUIRED_SUBJECTS,
  judgeFirstRoundResult,
} from "~/features/exam-results/pass-criteria";

// 1차 과목별 점수 입력(차수 first 일 때만). 신규·수정·허브 폼 공용.
export function SubjectScoreFields({
  round,
  initial,
}: {
  round: ExamRound;
  initial?: Record<string, number> | null;
}) {
  if (round !== "first") return null;
  return (
    <div className="space-y-1">
      <Label className="text-[11px]">
        1차 과목별 점수 (선택 · 과락/합격 추정용)
      </Label>
      <div className="grid grid-cols-3 gap-2">
        {FIRST_ROUND_SUBJECTS.map((subj, i) => (
          <div key={subj}>
            <Label className="text-muted-foreground text-[10px]">{subj}</Label>
            <Input
              type="number"
              step={0.01}
              min={0}
              max={100}
              name={`subjectScore${i}`}
              defaultValue={initial?.[subj] ?? ""}
              placeholder="0~100"
              className="h-8 text-xs"
            />
          </div>
        ))}
      </div>
      <p className="text-muted-foreground text-[10px]">
        과목 40점 미만 = 과락(불합격 확정). 합격은 상대선발이라 커트라인 사후
        추정.
      </p>
    </div>
  );
}

// 1차 과목별 점수 → 판정 한 줄(과락/평균미달=확정, 합격=추정, 대기).
export function FirstRoundVerdict({
  scores,
}: {
  scores: Record<string, number>;
}) {
  const j = judgeFirstRoundResult(scores);
  const tone =
    j.verdict === "floor_fail" || j.verdict === "average_fail"
      ? "text-rose-600 dark:text-rose-400"
      : j.verdict === "estimated_pass"
        ? "text-emerald-600 dark:text-emerald-400"
        : j.verdict === "estimated_below"
          ? "text-amber-600 dark:text-amber-400"
          : "text-muted-foreground";
  return <p className={cn("text-xs font-medium", tone)}>· {j.label}</p>;
}

// 2차 과목별 점수 입력(차수 second 일 때만). 필수 3과목(특허법·상표법·민사소송법)은
// 점수만, 선택과목은 과목명+점수. 신규·수정 폼 공용.
// subjectScore0/1/2 = SECOND_ROUND_REQUIRED_SUBJECTS 순서(1차와 동일 필드명, 차수로 매핑 분기).
// 선택과목은 응시자가 고른 과목명이 self_reported_subject_scores 의 키가 됨(필수 3과목 외 키).
export function SecondRoundSubjectFields({
  initial,
}: {
  initial?: Record<string, number> | null;
}) {
  const electiveEntry = initial
    ? Object.entries(initial).find(
        ([k]) => !SECOND_ROUND_REQUIRED_SUBJECTS.includes(k),
      )
    : undefined;
  // 이름 없이 저장된 경우 "선택과목" 키를 placeholder 로 되돌림.
  const electiveName =
    electiveEntry && electiveEntry[0] !== "선택과목" ? electiveEntry[0] : "";
  const electiveScore = electiveEntry ? electiveEntry[1] : "";
  return (
    <div className="space-y-2">
      <Label className="text-[11px]">2차 과목별 점수 (선택)</Label>
      <div className="grid grid-cols-3 gap-2">
        {SECOND_ROUND_REQUIRED_SUBJECTS.map((subj, i) => (
          <div key={subj}>
            <Label className="text-muted-foreground text-[10px]">{subj}</Label>
            <Input
              type="number"
              step={0.01}
              min={0}
              max={100}
              name={`subjectScore${i}`}
              defaultValue={initial?.[subj] ?? ""}
              placeholder="0~100"
              className="h-8 text-xs"
            />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-muted-foreground text-[10px]">
            선택과목 명
          </Label>
          <Input
            type="text"
            name="electiveSubjectName"
            defaultValue={electiveName}
            maxLength={40}
            placeholder="예: 디자인보호법"
            className="h-8 text-xs"
          />
        </div>
        <div>
          <Label className="text-muted-foreground text-[10px]">
            선택과목 점수
          </Label>
          <Input
            type="number"
            step={0.01}
            min={0}
            max={100}
            name="electiveSubjectScore"
            defaultValue={electiveScore}
            placeholder="0~100"
            className="h-8 text-xs"
          />
        </div>
      </div>
      <p className="text-muted-foreground text-[10px]">
        필수 3과목(특허법·상표법·민사소송법) 각 40점 미만 = 과락. 선택과목은
        P/F(50점)이며 평균에 미산입.
      </p>
    </div>
  );
}

// 차수별 과목 입력 분기 — 1차/2차. 신규·수정 폼 공용(분기 단일 진입점).
export function SubjectScoreFieldsByRound({
  round,
  initial,
}: {
  round: ExamRound;
  initial?: Record<string, number> | null;
}) {
  return round === "first" ? (
    <SubjectScoreFields round="first" initial={initial} />
  ) : (
    <SecondRoundSubjectFields initial={initial} />
  );
}

// 2차 과목별 점수 표시(읽기). 필수 3과목 + 선택과목(있는 것만).
export function SecondRoundScores({
  scores,
}: {
  scores: Record<string, number>;
}) {
  const required = SECOND_ROUND_REQUIRED_SUBJECTS.filter(
    (s) => typeof scores[s] === "number",
  );
  const elective = Object.entries(scores).find(
    ([k]) => !SECOND_ROUND_REQUIRED_SUBJECTS.includes(k),
  );
  if (required.length === 0 && !elective) return null;
  const parts = [
    ...required.map((s) => `${s} ${scores[s]}`),
    ...(elective ? [`${elective[0]} ${elective[1]}`] : []),
  ];
  return (
    <p className="text-muted-foreground text-xs">
      과목별 <span className="tabular-nums">{parts.join(" · ")}</span>
    </p>
  );
}

// 시험 결과 신규 입력 필드 묶음(연도·차수·상태·점수·과목별·요약). 폼은 호출처 소유.
// 차수 select 는 controlled — 1차 선택 시 SubjectScoreFields 노출.
export function ResultFields({
  currentYear,
  defaultRound = "first",
}: {
  currentYear: number;
  defaultRound?: ExamRound;
}) {
  const [round, setRound] = useState<ExamRound>(defaultRound);
  return (
    <>
      <input type="hidden" name="intent" value="upsert" />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[11px]">연도</Label>
          <Input
            type="number"
            name="examYear"
            min={2000}
            max={currentYear + 1}
            defaultValue={currentYear}
            className="h-8 text-xs"
          />
        </div>
        <div>
          <Label className="text-[11px]">차수</Label>
          <select
            name="examRound"
            value={round}
            onChange={(e) => setRound(e.target.value as ExamRound)}
            className="border-input bg-background h-8 w-full rounded border px-2 text-xs"
          >
            <option value="first">1차</option>
            <option value="second">2차</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[11px]">상태</Label>
          <select
            name="status"
            defaultValue="pending"
            className="border-input bg-background h-8 w-full rounded border px-2 text-xs"
          >
            {EXAM_RESULT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {EXAM_RESULT_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-[11px]">자가 신고 점수 (선택)</Label>
          <Input
            type="number"
            step={0.01}
            name="selfReportedTotalScore"
            placeholder="예: 85"
            className="h-8 text-xs"
          />
        </div>
      </div>
      <SubjectScoreFieldsByRound round={round} />
      <div>
        <Label className="text-[11px]">학습 요약 (선택)</Label>
        <Textarea
          name="studySummaryMd"
          rows={3}
          className="text-xs"
          placeholder="이번 차수를 준비하면서 가장 중요했던 학습 방법·시간 배분 등"
        />
      </div>
    </>
  );
}
