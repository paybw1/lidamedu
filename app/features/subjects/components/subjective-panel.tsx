// 주관식(2차) 학습 패널 — 3단계 훈련 (feat-2-032 개편 2026-08-18).
//
// 2차는 오프라인 지필 시험이라 온라인에서 완성 답안을 타이핑하는 훈련은 효용이 낮다는
// 판단(원장). 답안 작성 대신 ① 논점 추출 ② 목차 구성 ③ 사안의 포섭·결론 3단계로 나눠
// 훈련한다. 이 3단계는 AI 채점 3축(논점 40 / 목차·구성 25 / 논증 35)과 1:1 로 대응한다.
//
// 채점은 AI 채점 초안 하나로 통일 — 자기채점(점수·메모·체크리스트)과 강사 첨삭은 폐지했다
// (GS 2차 모의고사의 강사 채점은 별개 시스템으로 유지). 채점기준·모범답안은 열람 자료로
// 남기되 노출 게이트(staff 전용, redactSubjectiveAnswer)는 그대로다.
import { ChevronDownIcon, CircleCheckIcon, TimerIcon } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import { cn } from "~/core/lib/utils";
import { MarkdownView } from "~/features/problems/components/markdown-view";
import type { AnswerCaseGroup } from "~/features/problems/labels";
import type { SubjectiveAttempt } from "~/features/study/queries.server";

import { CaseBadgeRow } from "./answer-case-badges";

// 채점기준·모범답안·해설 마크다운 — 공용 렌더러의 머리글(16/14/12px)이 본문(14px)보다
// 작아 목차 번호(1. 2. 3.)가 묻힘 → 본문보다 큰 계층으로 스코프 오버라이드.
const SUBJECTIVE_MD_CLASS =
  "leading-[1.8] tracking-[-0.005em] " +
  "[&_h1]:text-[length:calc(18px*var(--study-fs))] " +
  "[&_h2]:text-[length:calc(16.5px*var(--study-fs))] [&_h2]:mt-4 " +
  "[&_h3]:text-[length:calc(15.5px*var(--study-fs))] [&_h3]:mt-3 " +
  "[&_h4]:text-[length:calc(14.5px*var(--study-fs))] [&_h4]:mt-2";

// 3단계 정의 — AI 채점 축과의 대응이 화면에서도 보이도록 axis 를 함께 표기한다.
const STAGES = [
  {
    key: "issues",
    no: "①",
    title: "논점 추출",
    axis: "AI 채점 · 논점 40%",
    hint: "설문이 무엇을 묻는지. 사안의 어떤 사실에서 어떤 쟁점이 나오는지 짧게 나열합니다.",
    placeholder:
      "예)\n설문(1) 청구범위 해석 — 실시례 수치와 청구항 수치의 불일치\n설문(2) §42③(1)·§42④(1)의 독자성\n설문(3) 수치한정발명의 진보성 — 이질적 효과 여부",
    rows: 7,
  },
  {
    key: "outline",
    no: "②",
    title: "목차 구성",
    axis: "AI 채점 · 목차·구성 25%",
    hint: "설문별 목차와 소제목. 배점에 맞춰 어디에 지면을 쓸지까지 정합니다.",
    placeholder:
      "예)\nⅠ. 논점의 정리\nⅡ. 청구범위 해석의 법리\n  1. 원칙  2. 발명의 설명 참작\nⅢ. 사안의 검토\nⅣ. 결론",
    rows: 8,
  },
  {
    key: "analysis",
    no: "③",
    title: "사안의 포섭·결론",
    axis: "AI 채점 · 논증 35%",
    hint: "조문·판례를 사안에 적용해 결론까지. 일반론은 줄이고 포섭에 집중합니다.",
    placeholder:
      "예)\n사안에서 청구항의 수치는 …이므로 …에 해당한다. 따라서 …",
    rows: 12,
  },
] as const;

type StageKey = (typeof STAGES)[number]["key"];
/** 축별 null = 그 단계를 아직 안 써서 채점에서 뺐다는 뜻(0점과 구분). */
type AxisScores = {
  issue: number | null;
  structure: number | null;
  writing: number | null;
};
type StageValues = Record<StageKey, string>;

const emptyStages = (): StageValues => ({
  issues: "",
  outline: "",
  analysis: "",
});

const stagesOf = (a: SubjectiveAttempt | null): StageValues =>
  a
    ? { issues: a.issuesMd, outline: a.outlineMd, analysis: a.analysisMd }
    : emptyStages();

const stagesKey = (s: StageValues) =>
  JSON.stringify([s.issues, s.outline, s.analysis]);

/**
 * 펼침 기본값 — 작성한 단계는 펼치고(내용을 바로 읽게), 미작성 단계는 그 중 첫 칸만 펼친다.
 * 문제를 열자마자 세 칸이 다 열려 화면을 채우는 것을 막고, 다음에 쓸 칸으로 시선을 모은다.
 * 계산 시점은 마운트·문제 이동뿐 — 타이핑 중에 재계산하면 칸이 저절로 열리고 닫힌다.
 */
const defaultOpenStages = (s: StageValues): Record<StageKey, boolean> => {
  const filled = {
    issues: s.issues.trim().length > 0,
    outline: s.outline.trim().length > 0,
    analysis: s.analysis.trim().length > 0,
  };
  const firstEmpty = STAGES.find((st) => !filled[st.key])?.key;
  return {
    issues: filled.issues || firstEmpty === "issues",
    outline: filled.outline || firstEmpty === "outline",
    analysis: filled.analysis || firstEmpty === "analysis",
  };
};

const filledLength = (s: StageValues) =>
  (s.issues + s.outline + s.analysis).trim().length;

// 시험 모드 기본 제한시간 — 배점 기준(원장 2026-08-18): 30점 = 7분, 20점 = 5분.
// 완성 답안이 아니라 뼈대(논점·목차·포섭)를 세우는 시간이라 실전 답안 작성 시간보다 짧다.
const DEFAULT_LIMIT_BY_POINTS: Record<number, number> = { 30: 7, 20: 5 };
const FALLBACK_LIMIT_MIN = 7;
const LIMIT_MIN = 1;
const LIMIT_MAX = 180;

/** 배점 → 기본 제한시간(분). 표에 없는 배점은 30점=7분 비례로 환산(20점도 5분으로 맞는다). */
export function defaultTimedLimitMin(totalPoints: number | null): number {
  if (totalPoints == null || totalPoints <= 0) return FALLBACK_LIMIT_MIN;
  const preset = DEFAULT_LIMIT_BY_POINTS[totalPoints];
  if (preset != null) return preset;
  const scaled = Math.round((totalPoints * 7) / 30);
  return Math.max(LIMIT_MIN, Math.min(LIMIT_MAX, scaled));
}

/** 폼 필드명은 API(subjective-attempt / subjective-ai-grade)와 공유한다. */
function appendStages(fd: FormData, s: StageValues) {
  fd.set("issuesMd", s.issues);
  fd.set("outlineMd", s.outline);
  fd.set("analysisMd", s.analysis);
}

export function SubjectivePanel({
  problemId,
  modelAnswerMd,
  gradingRubricMd,
  explanationMd,
  rubricItems,
  rubricAiGenerated,
  rubricReviewedAt,
  viewerIsStaff,
  answerCaseGroups,
  initialAttempt,
  totalPoints,
}: {
  problemId: string;
  modelAnswerMd: string | null;
  gradingRubricMd: string | null;
  explanationMd: string | null;
  rubricItems: { label: string; points: number }[] | null;
  // 채점기준·모범답안이 강사 해설 없이 AI 생성됨 — 섹션 헤더에 배지 표시(비교분석용).
  rubricAiGenerated: boolean;
  // 운영자 검수완료 시각 (null=미검수) — staff 에게만 토글 버튼 노출.
  rubricReviewedAt: string | null;
  viewerIsStaff: boolean;
  // 설문별 관련 판례 배지(모범답안 인용 판례 자동 추출).
  answerCaseGroups: AnswerCaseGroup[];
  initialAttempt: SubjectiveAttempt | null;
  // 배점 — 시험 모드 기본 제한시간 산출(30점=7분·20점=5분). null=미설정.
  totalPoints: number | null;
}) {
  const [stages, setStages] = useState<StageValues>(() =>
    stagesOf(initialAttempt),
  );
  // 단계별 접힘/펼침 — 화면 상태(서버 저장 대상 아님).
  const [openStages, setOpenStages] = useState<Record<StageKey, boolean>>(() =>
    defaultOpenStages(stagesOf(initialAttempt)),
  );
  const [revealedModel, setRevealedModel] = useState(false);
  const [revealedRubric, setRevealedRubric] = useState(false);
  const [lastSaved, setLastSaved] = useState<SubjectiveAttempt | null>(
    initialAttempt,
  );
  // 시간제한 응시 모드 — 클라이언트 상태. 새로고침 시 리셋 (자기학습용).
  const [timedStartedAt, setTimedStartedAt] = useState<number | null>(null);
  const [timedLimitMin, setTimedLimitMin] = useState<number>(() =>
    defaultTimedLimitMin(totalPoints),
  );
  // 시험 모드 완료(조기 제출·시간 만료) 결과 — 완료 카드 표시용, 문제 이동 시 리셋.
  const [timedResult, setTimedResult] = useState<{
    limitMin: number;
    elapsedSec: number;
    expired: boolean;
  } | null>(null);

  const autosaveFetcher = useFetcher<{
    ok?: true;
    attempt?: SubjectiveAttempt;
    error?: string;
  }>();
  // 작성 취소 — 3단계 기록과 AI 채점 결과를 지우고 '미작성' 으로 되돌린다.
  const cancelFetcher = useFetcher<{
    ok?: true;
    canceled?: boolean;
    error?: string;
  }>();
  const aiGradeFetcher = useFetcher<{
    ok?: boolean;
    draft?: {
      overall: number;
      axisScores: AxisScores;
      feedbackMd: string;
    };
    error?: string;
  }>();
  const aiGrading = aiGradeFetcher.state !== "idle";
  const aiError =
    aiGradeFetcher.state === "idle" && aiGradeFetcher.data?.error
      ? aiGradeFetcher.data.error
      : null;

  // 모범답안 섹션 분할 — 각 설문 답이 끝난 지점에 관련 판례 인라인 배지 행 삽입.
  //   설문 라벨은 상태 추적으로 상속('# 설문 (1)' h1 제목 + '## Ⅰ.' 하위 목차 구조 대응),
  //   배지는 그 설문에 속한 마지막 섹션 뒤에 붙인다. '공통' 그룹은 문서 마지막 섹션 뒤.
  const answerSections = useMemo(() => {
    const md = modelAnswerMd ?? "";
    if (!md.trim()) return [];
    const byLabel = new Map(answerCaseGroups.map((g) => [g.label, g.cases]));
    const parts = md.split(/^(?=#{1,2}\s)/m).filter((p) => p.trim().length);
    let currentLabel: string | null = null;
    const labeled = parts.map((part) => {
      const heading = part.match(/^#{1,2}\s+([^\n]+)/)?.[1] ?? "";
      const m = heading.match(/설문\s*\(?([\d①-⑨]+)\)?/);
      if (m) currentLabel = `설문(${m[1]})`;
      // 섹션 끝의 '---' 구분선은 떼어내고 배지 행 아래에 자체 밑줄로 렌더
      // (내용 → 관련판례 → 밑줄 → 다음 설문 순서 보장).
      const body = part.replace(/\n-{3,}\s*$/, "").trimEnd();
      return { md: body, label: currentLabel };
    });
    const secs = labeled.map((sec, i) => {
      const isLastOfLabel =
        sec.label !== null &&
        (i === labeled.length - 1 || labeled[i + 1].label !== sec.label);
      return {
        md: sec.md,
        cases: isLastOfLabel ? (byLabel.get(sec.label!) ?? []) : [],
      };
    });
    const common = byLabel.get("공통") ?? [];
    if (common.length && secs.length) {
      const last = secs[secs.length - 1];
      const seen = new Set(last.cases.map((c) => c.caseId));
      secs[secs.length - 1] = {
        ...last,
        cases: [...last.cases, ...common.filter((c) => !seen.has(c.caseId))],
      };
    }
    return secs;
  }, [modelAnswerMd, answerCaseGroups]);

  // 검수완료 토글 (staff) — 모범답안 심층 리뷰 진행 표시.
  const reviewFetcher = useFetcher<{
    ok?: true;
    reviewedAt?: string | null;
    error?: string;
  }>();
  const reviewedNow = reviewFetcher.formData
    ? reviewFetcher.formData.get("reviewed") === "true"
    : reviewFetcher.data?.ok
      ? reviewFetcher.data.reviewedAt != null
      : rubricReviewedAt != null;
  const toggleReviewed = () => {
    const fd = new FormData();
    fd.set("problemId", problemId);
    fd.set("reviewed", reviewedNow ? "false" : "true");
    reviewFetcher.submit(fd, {
      method: "post",
      action: "/api/problems/rubric-review",
    });
  };

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentRef = useRef<string>(stagesKey(stagesOf(initialAttempt)));

  // problem 바뀌면 상태 리셋 (useEffect 안전).
  useEffect(() => {
    const next = stagesOf(initialAttempt);
    setStages(next);
    setOpenStages(defaultOpenStages(next));
    setLastSaved(initialAttempt);
    setTimedLimitMin(defaultTimedLimitMin(totalPoints));
    setRevealedModel(false);
    setRevealedRubric(false);
    setTimedStartedAt(null);
    setTimedResult(null);
    lastSentRef.current = stagesKey(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problemId]);

  // autosave: 디바운스 1.5초, 변경 있을 때만 전송. 세 칸을 항상 함께 보낸다.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const key = stagesKey(stages);
    if (key === lastSentRef.current) return;
    debounceRef.current = setTimeout(() => {
      const fd = new FormData();
      fd.set("intent", "autosave");
      fd.set("problemId", problemId);
      appendStages(fd, stages);
      autosaveFetcher.submit(fd, {
        method: "post",
        action: "/api/study/subjective-attempt",
      });
      lastSentRef.current = key;
    }, 1500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stages, problemId]);

  // autosave 응답 → lastSaved 갱신.
  useEffect(() => {
    if (
      autosaveFetcher.state === "idle" &&
      autosaveFetcher.data &&
      autosaveFetcher.data.ok &&
      autosaveFetcher.data.attempt
    ) {
      setLastSaved(autosaveFetcher.data.attempt);
    }
  }, [autosaveFetcher.state, autosaveFetcher.data]);

  // 취소 응답 → 로컬 상태 초기화. lastSentRef 를 먼저 비워 빈 값이 다시 autosave 되며
  // row 가 되살아나는 것을 막는다.
  useEffect(() => {
    if (cancelFetcher.state === "idle" && cancelFetcher.data?.canceled) {
      const next = emptyStages();
      lastSentRef.current = stagesKey(next);
      setStages(next);
      setOpenStages(defaultOpenStages(next));
      setLastSaved(null);
      setTimedResult(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cancelFetcher.state, cancelFetcher.data]);

  const handleCancelAttempt = () => {
    if (
      !window.confirm(
        "작성한 3단계 내용과 AI 채점 기록을 모두 지우고 처음 상태로 되돌립니다. 계속할까요?",
      )
    )
      return;
    const fd = new FormData();
    fd.set("intent", "cancel");
    fd.set("problemId", problemId);
    cancelFetcher.submit(fd, {
      method: "post",
      action: "/api/study/subjective-attempt",
    });
  };

  const hasModel = (modelAnswerMd ?? "").trim().length > 0;
  const hasRubric =
    (gradingRubricMd ?? "").trim().length > 0 ||
    (rubricItems?.length ?? 0) > 0;
  const isDirty = stagesKey(stages) !== stagesKey(stagesOf(lastSaved));
  const isSaving = autosaveFetcher.state !== "idle";

  // 시간제한 응시 — 1초마다 강제 리렌더해 카운트다운 표시. 만료 시 1회만 onTimerExpire.
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (timedStartedAt === null) return;
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [timedStartedAt]);
  // 매초 forceTick 리렌더마다 재계산해야 하므로 useMemo 금지 (deps 불변 → 카운트다운 정지).
  const timedRemainSec =
    timedStartedAt === null
      ? null
      : Math.max(
          0,
          timedLimitMin * 60 - Math.floor((Date.now() - timedStartedAt) / 1000),
        );
  // 시험 종료(조기 제출 or 만료) — 소요 시간과 함께 저장, 완료 카드로 전환.
  const finishTimedExam = (expired: boolean) => {
    if (timedStartedAt === null) return;
    const elapsedSec = expired
      ? timedLimitMin * 60
      : Math.min(
          timedLimitMin * 60,
          Math.max(0, Math.floor((Date.now() - timedStartedAt) / 1000)),
        );
    setTimedResult({ limitMin: timedLimitMin, elapsedSec, expired });
    setTimedStartedAt(null);
    const fd = new FormData();
    fd.set("intent", "timed");
    fd.set("problemId", problemId);
    appendStages(fd, stages);
    fd.set("timedLimitMin", String(timedLimitMin));
    fd.set("timedElapsedSec", String(elapsedSec));
    lastSentRef.current = stagesKey(stages);
    autosaveFetcher.submit(fd, {
      method: "post",
      action: "/api/study/subjective-attempt",
    });
  };
  useEffect(() => {
    if (timedStartedAt === null) return;
    if (timedRemainSec === 0) finishTimedExam(true);
    // finishTimedExam/autosaveFetcher 는 매 렌더 새 참조라 의존성 제외.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timedRemainSec, timedStartedAt]);
  const timedActive = timedStartedAt !== null;

  const runAiGrade = () => {
    const fd = new FormData();
    fd.set("problemId", problemId);
    appendStages(fd, stages);
    aiGradeFetcher.submit(fd, {
      method: "post",
      action: "/api/study/subjective-ai-grade",
    });
  };
  const aiGraded =
    aiGradeFetcher.data?.draft != null || lastSaved?.aiOverallScore != null;
  const aiDisabled = aiGrading || timedActive || filledLength(stages) < 50;

  return (
    <div className="space-y-5">
      {timedResult ? (
        <SubjectiveExamResultCard
          result={timedResult}
          filledLength={filledLength(stages)}
          stageDone={STAGES.filter((s) => stages[s.key].trim()).length}
          rubricAvailable={hasRubric}
          onOpenRubric={() => setRevealedRubric(true)}
          aiDone={aiGraded}
          aiGrading={aiGrading}
          aiDisabled={aiGrading || filledLength(stages) < 50}
          onRunAiGrade={runAiGrade}
          modelAvailable={hasModel}
          onOpenModel={() => setRevealedModel(true)}
        />
      ) : (
        <SubjectiveTimedBar
          // 문제가 바뀌면 입력창을 그 문제의 기본값으로 다시 채워야 한다(내부 상태라 key 로 리셋).
          key={problemId}
          defaultLimitMin={defaultTimedLimitMin(totalPoints)}
          totalPoints={totalPoints}
          timedStartedAt={timedStartedAt}
          timedLimitMin={timedLimitMin}
          timedRemainSec={timedRemainSec}
          lastRecord={
            lastSaved?.timedLimitMin != null &&
            lastSaved?.timedElapsedSec != null
              ? {
                  limitMin: lastSaved.timedLimitMin,
                  elapsedSec: lastSaved.timedElapsedSec,
                }
              : null
          }
          onStart={(min) => {
            setTimedLimitMin(min);
            setTimedStartedAt(Date.now());
            setTimedResult(null);
          }}
          onSubmit={() => {
            if (confirm("여기까지 기록하고 시험 모드를 종료할까요?")) {
              finishTimedExam(false);
            }
          }}
          onCancel={() => {
            if (
              confirm(
                "시험 모드를 취소하시겠습니까? 작성한 내용은 그대로 유지됩니다.",
              )
            ) {
              setTimedStartedAt(null);
            }
          }}
        />
      )}

      {/* 3단계 훈련 입력 */}
      <div className="border-border bg-card rounded-xl border shadow-sm">
        <div className="border-border flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
          <p className="text-muted-foreground text-[11px] font-bold tracking-widest uppercase">
            답안 훈련 (자동 저장)
          </p>
          <div className="flex items-center gap-3 text-[11px]">
            {cancelFetcher.data?.error ? (
              <span className="text-rose-600 dark:text-rose-400">
                {cancelFetcher.data.error}
              </span>
            ) : null}
            {lastSaved ? (
              <button
                type="button"
                onClick={handleCancelAttempt}
                disabled={cancelFetcher.state !== "idle"}
                className="text-muted-foreground underline underline-offset-2 hover:text-rose-600 disabled:opacity-50 dark:hover:text-rose-400"
                data-testid="subjective-cancel"
              >
                작성 취소
              </button>
            ) : null}
            <SavingStatus
              isSaving={isSaving}
              isDirty={isDirty}
              updatedAt={lastSaved?.updatedAt ?? null}
            />
          </div>
        </div>
        <p className="text-muted-foreground border-border/60 border-b px-5 py-2.5 text-[11px] leading-relaxed">
          2차는 지필 시험입니다. 답안 전문을 옮겨 적는 대신 논점 → 목차 →
          포섭·결론 순으로 뼈대를 잡는 훈련을 합니다.
        </p>
        <div className="divide-border/60 divide-y">
          {STAGES.map((s) => (
            <StageEditor
              key={s.key}
              stage={s}
              value={stages[s.key]}
              open={openStages[s.key]}
              onToggle={() =>
                setOpenStages((prev) => ({ ...prev, [s.key]: !prev[s.key] }))
              }
              onChange={(v) => setStages((prev) => ({ ...prev, [s.key]: v }))}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="default"
          size="sm"
          disabled={aiDisabled}
          onClick={runAiGrade}
          className="rounded-full"
          title={
            timedActive
              ? "시험 모드 중에는 AI 채점 잠금"
              : "작성한 3단계를 논점·구성·논증 3축으로 AI가 채점합니다 (초안)"
          }
          data-testid="subjective-ai-grade"
        >
          {aiGrading ? "AI 채점 중…" : "AI 채점"}
        </Button>
        <Button
          variant={revealedModel ? "outline" : "secondary"}
          size="sm"
          onClick={() => setRevealedModel((v) => !v)}
          disabled={!hasModel || timedActive}
          title={timedActive ? "시험 모드 중에는 모범답안 잠금" : undefined}
          className="rounded-full"
          data-testid="subjective-reveal-model"
        >
          {revealedModel ? "모범답안 숨기기" : "모범답안 보기"}
          {!hasModel ? " (미등록)" : ""}
        </Button>
        <Button
          variant={revealedRubric ? "outline" : "secondary"}
          size="sm"
          onClick={() => setRevealedRubric((v) => !v)}
          disabled={!hasRubric || timedActive}
          title={timedActive ? "시험 모드 중에는 채점기준 잠금" : undefined}
          className="rounded-full"
          data-testid="subjective-reveal-rubric"
        >
          {revealedRubric ? "채점기준 숨기기" : "채점기준 보기"}
          {!hasRubric ? " (미등록)" : ""}
        </Button>
      </div>
      {aiError ? <p className="text-destructive text-xs">{aiError}</p> : null}
      <AiGradeResult
        result={
          aiGradeFetcher.data?.draft ??
          (lastSaved?.aiOverallScore != null && lastSaved.aiAxisScores
            ? {
                overall: lastSaved.aiOverallScore,
                axisScores: lastSaved.aiAxisScores,
                feedbackMd: lastSaved.aiFeedbackMd ?? "",
              }
            : null)
        }
        gradedAt={lastSaved?.aiGradedAt ?? null}
      />

      {revealedRubric && hasRubric ? (
        <div className="border-border bg-card rounded-xl border shadow-sm">
          <div className="border-border flex items-center gap-2 border-b px-5 py-3">
            <p className="text-muted-foreground text-[11px] font-bold tracking-widest uppercase">
              채점 기준
            </p>
            {rubricAiGenerated ? <AiGeneratedBadge /> : null}
          </div>
          {rubricItems && rubricItems.length > 0 ? (
            <RubricPointTable items={rubricItems} />
          ) : null}
          {(gradingRubricMd ?? "").trim() ? (
            <div className="px-5 py-4">
              <MarkdownView
                text={gradingRubricMd ?? ""}
                breaks
                className={SUBJECTIVE_MD_CLASS}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {revealedModel && hasModel ? (
        <div className="border-border bg-card rounded-xl border shadow-sm">
          <div className="border-border flex items-center gap-2 border-b px-5 py-3">
            <p className="text-muted-foreground text-[11px] font-bold tracking-widest uppercase">
              모범답안
            </p>
            {rubricAiGenerated ? <AiGeneratedBadge /> : null}
            {viewerIsStaff ? (
              <button
                type="button"
                onClick={toggleReviewed}
                disabled={reviewFetcher.state !== "idle"}
                title={
                  reviewedNow
                    ? `검수완료됨${rubricReviewedAt ? ` (${new Date(rubricReviewedAt).toLocaleDateString("ko-KR")})` : ""} — 클릭 시 해제`
                    : "이 문제의 채점기준·모범답안을 심층 검수했음으로 표시"
                }
                className={cn(
                  "ml-auto inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-colors",
                  reviewedNow
                    ? "border-emerald-400/60 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
                data-testid="rubric-review-toggle"
              >
                {reviewedNow ? "✓ 검수완료" : "검수완료로 표시"}
              </button>
            ) : null}
          </div>
          <div className="px-5 py-4">
            {/* 설문 섹션별 렌더 — 각 설문 답이 끝난 지점에 관련 판례 인라인 배지. */}
            {answerSections.length ? (
              answerSections.map((sec, i) => (
                <Fragment key={i}>
                  <MarkdownView
                    text={sec.md}
                    breaks
                    className={SUBJECTIVE_MD_CLASS}
                  />
                  <CaseBadgeRow
                    cases={sec.cases}
                    mainControl={viewerIsStaff ? { problemId } : undefined}
                  />
                  {i < answerSections.length - 1 ? (
                    <div className="border-border/60 my-6 border-t" />
                  ) : null}
                </Fragment>
              ))
            ) : (
              <MarkdownView
                text={modelAnswerMd ?? ""}
                breaks
                className={SUBJECTIVE_MD_CLASS}
              />
            )}
          </div>
        </div>
      ) : null}

      {explanationMd ? (
        <div className="border-border bg-card rounded-xl border shadow-sm">
          <div className="border-border border-b px-5 py-3">
            <p className="text-muted-foreground text-[11px] font-bold tracking-widest uppercase">
              해설
            </p>
          </div>
          <div className="px-5 py-4">
            <MarkdownView
              text={explanationMd ?? ""}
              breaks
              className={SUBJECTIVE_MD_CLASS}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── 단계별 입력 ───────────────────────────────────────────────────────────
function StageEditor({
  stage,
  value,
  open,
  onToggle,
  onChange,
}: {
  stage: (typeof STAGES)[number];
  value: string;
  open: boolean;
  onToggle: () => void;
  onChange: (v: string) => void;
}) {
  const done = value.trim().length > 0;
  const panelId = `subjective-stage-panel-${stage.key}`;
  // 접힌 칸의 미리보기 — 줄바꿈을 공백으로 눌러 한 줄로.
  const preview = value.trim().replace(/\s+/g, " ").slice(0, 60);
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="hover:bg-muted/40 flex w-full items-center gap-x-2 gap-y-1 px-4 py-3 text-left transition-colors"
        data-testid={`subjective-stage-toggle-${stage.key}`}
      >
        <span
          className={cn(
            "inline-flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold",
            done
              ? "bg-emerald-500 text-white"
              : "bg-muted text-muted-foreground",
          )}
        >
          {done ? "✓" : stage.no}
        </span>
        <span className="text-sm font-bold">{stage.title}</span>
        <span className="text-muted-foreground hidden text-[11px] sm:inline">
          {stage.axis}
        </span>
        {/* 접혔을 때만 내용 미리보기 — 펼치지 않고도 뭘 썼는지 알 수 있게. */}
        {!open && preview ? (
          <span className="text-muted-foreground min-w-0 flex-1 truncate text-[11px]">
            {preview}
          </span>
        ) : null}
        <span
          className={cn(
            "text-muted-foreground text-[11px] tabular-nums",
            !open && preview ? "shrink-0" : "ml-auto",
          )}
        >
          {value.length}자
        </span>
        <ChevronDownIcon
          className={cn(
            "text-muted-foreground size-4 shrink-0 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? (
        <div id={panelId} className="px-4 pb-4">
          <p className="text-muted-foreground mb-2 text-[11px] leading-relaxed">
            {stage.hint}
          </p>
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={stage.rows}
            placeholder={stage.placeholder}
            className="border-input bg-background focus:ring-primary/30 w-full rounded-lg border px-4 py-3 text-sm leading-[1.8] tracking-[-0.005em] focus:ring-2 focus:outline-none"
            data-testid={`subjective-stage-${stage.key}`}
          />
        </div>
      ) : null}
    </div>
  );
}

// ── 채점기준 배점표 (읽기 전용) ────────────────────────────────────────────
// 체크박스(자기채점)는 폐지 — 배점 구조를 눈으로 확인하는 용도로만 남긴다.
function RubricPointTable({
  items,
}: {
  items: { label: string; points: number }[];
}) {
  const total = items.reduce((s, it) => s + it.points, 0);
  return (
    <div className="border-border/60 border-b px-5 py-4">
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-muted-foreground text-[11px] font-semibold">
          배점표
        </p>
        <span className="text-muted-foreground text-xs tabular-nums">
          합계 {total}점
        </span>
      </div>
      <ul className="space-y-1.5" data-testid="rubric-point-table">
        {items.map((it, i) => (
          <li
            key={i}
            className="border-border/60 flex items-start gap-2.5 rounded-lg border px-3 py-2 text-xs"
          >
            <span className="flex-1">
              {/* 라벨에 **강조** 등 마크다운이 섞여 있어 채점기준·모범답안과 같은 렌더러 사용. */}
              <MarkdownView
                text={it.label}
                className="text-xs leading-normal [&_p]:my-0"
              />
            </span>
            <span className="text-muted-foreground shrink-0 tabular-nums">
              {it.points}점
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── AI 채점 결과 ──────────────────────────────────────────────────────────
// feat-2-032 S3 — 강사 확정 전 초안임을 명시. 3축은 3단계 입력과 1:1 대응.
function AiGradeResult({
  result,
  gradedAt,
}: {
  result: {
    overall: number;
    axisScores: AxisScores;
    feedbackMd: string;
  } | null;
  gradedAt: string | null;
}) {
  if (!result) return null;
  const axes: { key: keyof AxisScores; label: string }[] = [
    { key: "issue", label: "① 논점 추출" },
    { key: "structure", label: "② 목차·구성" },
    { key: "writing", label: "③ 포섭·논증" },
  ];
  const skipped = axes.filter((a) => result.axisScores[a.key] === null);
  return (
    <div className="border-primary/30 bg-card space-y-3 rounded-xl border p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-muted-foreground text-[11px] font-bold tracking-widest uppercase">
          AI 채점{" "}
          <span className="bg-muted text-ink-faint ml-1 rounded px-1 py-0.5 text-[10px] normal-case">
            초안 · 참고용
          </span>
          {gradedAt ? (
            <span className="text-muted-foreground ml-1 text-[10px] normal-case">
              {gradedAt.slice(0, 10)}
            </span>
          ) : null}
        </p>
        <p className="text-foreground text-lg font-bold tabular-nums">
          {result.overall}
          <span className="text-muted-foreground text-xs">/100</span>
        </p>
      </div>
      <div className="space-y-1.5">
        {axes.map((a) => {
          const v = result.axisScores[a.key];
          return (
            <div key={a.key} className="flex items-center gap-2 text-xs">
              <span
                className={cn(
                  "w-24 shrink-0",
                  v === null ? "text-muted-foreground/60" : "text-muted-foreground",
                )}
              >
                {a.label}
              </span>
              <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
                {v === null ? null : (
                  <div
                    className="bg-primary h-full rounded-full"
                    style={{ width: `${Math.max(0, Math.min(100, v))}%` }}
                  />
                )}
              </div>
              <span
                className={cn(
                  "w-10 shrink-0 text-right font-semibold tabular-nums",
                  v === null ? "text-muted-foreground/60" : "text-foreground",
                )}
              >
                {v === null ? "—" : v}
              </span>
            </div>
          );
        })}
      </div>
      {skipped.length ? (
        <p className="text-muted-foreground text-[11px]">
          {skipped.map((a) => a.label).join(" · ")} 은(는) 아직 작성하지 않아
          채점에서 제외했습니다. 종합은 작성한 단계만으로 계산됩니다.
        </p>
      ) : null}
      {result.feedbackMd ? (
        <div className="border-border border-t pt-3 text-[length:calc(14px*var(--study-fs))] leading-[1.75]">
          <MarkdownView text={result.feedbackMd} trusted={false} />
        </div>
      ) : null}
    </div>
  );
}

// AI 생성 배지 — 채점기준·모범답안이 강사 해설 없이 AI 생성된 문항 표시(비교분석용).
function AiGeneratedBadge() {
  return (
    <span
      className="rounded-full border border-violet-300 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-300"
      title="이 채점기준·모범답안은 AI가 판례·교재 근거로 생성한 초안입니다"
    >
      AI 생성
    </span>
  );
}

// ── 시험 모드 ─────────────────────────────────────────────────────────────
/** mm:ss 포맷 (시험 모드 소요 시간 표기). */
function fmtMMSS(totalSec: number) {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function SubjectiveTimedBar({
  defaultLimitMin,
  totalPoints,
  timedStartedAt,
  timedLimitMin,
  timedRemainSec,
  lastRecord,
  onStart,
  onSubmit,
  onCancel,
}: {
  defaultLimitMin: number;
  totalPoints: number | null;
  timedStartedAt: number | null;
  timedLimitMin: number;
  timedRemainSec: number | null;
  lastRecord: { limitMin: number; elapsedSec: number } | null;
  onStart: (min: number) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const [minInput, setMinInput] = useState<string>(String(defaultLimitMin));
  if (timedStartedAt === null) {
    return (
      <div className="border-border bg-muted/30 flex flex-wrap items-center gap-3 rounded-xl border border-dashed px-4 py-3 text-xs">
        <span className="text-muted-foreground inline-flex items-center gap-1.5">
          <TimerIcon className="size-3.5" /> 시험 모드
        </span>
        <label className="text-muted-foreground inline-flex items-center gap-1.5">
          제한 시간
          <input
            type="number"
            min={LIMIT_MIN}
            max={LIMIT_MAX}
            value={minInput}
            onChange={(e) => setMinInput(e.target.value)}
            className="border-input bg-background focus:ring-primary/30 h-7 w-14 rounded-lg border px-2 text-xs tabular-nums focus:ring-2 focus:outline-none"
          />
          분
        </label>
        <Button
          size="sm"
          variant="default"
          className="h-7 rounded-full"
          onClick={() => {
            const m = Number(minInput);
            if (Number.isNaN(m) || m < LIMIT_MIN || m > LIMIT_MAX) {
              alert(`제한 시간은 ${LIMIT_MIN}~${LIMIT_MAX}분 사이로 입력하세요.`);
              return;
            }
            onStart(m);
          }}
          data-testid="subjective-timed-start"
        >
          시험 모드 시작
        </Button>
        <span className="text-muted-foreground ml-auto text-[11px]">
          {lastRecord
            ? `지난 응시: ${lastRecord.limitMin}분 제한 · ${fmtMMSS(lastRecord.elapsedSec)} 소요`
            : totalPoints != null
              ? `${totalPoints}점 기준 ${defaultLimitMin}분 · 시작하면 모범답안·채점기준이 잠깁니다.`
              : "시작하면 모범답안·채점기준이 잠깁니다."}
        </span>
      </div>
    );
  }
  const m = Math.floor((timedRemainSec ?? 0) / 60);
  const s = (timedRemainSec ?? 0) % 60;
  const lowTime = (timedRemainSec ?? 0) <= 60;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-xl border px-4 py-2.5 text-xs",
        lowTime
          ? "border-rose-400/60 bg-rose-50 dark:border-rose-700/40 dark:bg-rose-950/30"
          : "border-amber-400/40 bg-amber-50 dark:border-amber-700/40 dark:bg-amber-950/30",
      )}
      data-testid="subjective-timed-bar"
    >
      <span className="inline-flex items-center gap-1.5 font-semibold">
        <TimerIcon className="size-3.5" /> 시험 모드 응시 중
      </span>
      <span className="font-mono text-base font-bold tabular-nums">
        {String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
      </span>
      <span className="text-muted-foreground">/ {timedLimitMin}분</span>
      <div className="ml-auto flex items-center gap-1.5">
        <Button
          size="sm"
          variant="default"
          className="h-7 rounded-full"
          onClick={onSubmit}
          data-testid="subjective-timed-submit"
        >
          제출하기
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 rounded-full"
          onClick={onCancel}
          data-testid="subjective-timed-cancel"
        >
          취소
        </Button>
      </div>
    </div>
  );
}

// 시험 모드 완료 카드 — 결과 요약 + 다음 절차(채점 단계) 안내 (feat-2-033).
function SubjectiveExamResultCard({
  result,
  filledLength,
  stageDone,
  rubricAvailable,
  onOpenRubric,
  aiDone,
  aiGrading,
  aiDisabled,
  onRunAiGrade,
  modelAvailable,
  onOpenModel,
}: {
  result: { limitMin: number; elapsedSec: number; expired: boolean };
  filledLength: number;
  stageDone: number;
  rubricAvailable: boolean;
  onOpenRubric: () => void;
  aiDone: boolean;
  aiGrading: boolean;
  aiDisabled: boolean;
  onRunAiGrade: () => void;
  modelAvailable: boolean;
  onOpenModel: () => void;
}) {
  const steps = [
    {
      label: "AI 채점",
      desc: "논점·구성·논증 3축 초안 채점",
      done: aiDone,
      disabled: aiDisabled,
      loading: aiGrading,
      onClick: onRunAiGrade,
      testId: "subjective-exam-step-ai",
    },
    {
      label: "채점기준 확인",
      desc: "배점 구조로 내 논점을 대조",
      done: false,
      disabled: !rubricAvailable,
      loading: false,
      onClick: onOpenRubric,
      testId: "subjective-exam-step-rubric",
    },
    {
      label: "모범답안 확인",
      desc: "목차·포섭 순서를 내 것과 비교",
      done: false,
      disabled: !modelAvailable,
      loading: false,
      onClick: onOpenModel,
      testId: "subjective-exam-step-model",
    },
  ];
  return (
    <div
      className={cn(
        "rounded-xl border shadow-sm",
        result.expired
          ? "border-rose-300/60 bg-rose-50/50 dark:border-rose-700/40 dark:bg-rose-950/20"
          : "border-emerald-300/60 bg-emerald-50/50 dark:border-emerald-700/40 dark:bg-emerald-950/20",
      )}
      data-testid="subjective-exam-result"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 text-xs font-bold",
            result.expired
              ? "text-rose-700 dark:text-rose-300"
              : "text-emerald-700 dark:text-emerald-300",
          )}
        >
          <TimerIcon className="size-4" />
          {result.expired
            ? "시간 만료 — 여기까지 기록되었습니다"
            : "시험 모드 완료 — 기록되었습니다"}
        </span>
        <span className="text-muted-foreground text-[11px] tabular-nums">
          제한 {result.limitMin}분 · 소요 {fmtMMSS(result.elapsedSec)} · 3단계 중{" "}
          {stageDone}단계 · {filledLength.toLocaleString()}자
        </span>
      </div>
      <div className="border-border/60 grid gap-2 border-t px-4 py-3 sm:grid-cols-3">
        {steps.map((step, i) => (
          <button
            key={step.label}
            type="button"
            onClick={step.onClick}
            disabled={step.disabled || step.loading}
            data-testid={step.testId}
            className={cn(
              "bg-card flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors",
              step.done
                ? "border-emerald-300/60 dark:border-emerald-700/40"
                : "border-border hover:border-primary/40",
              (step.disabled || step.loading) &&
                "cursor-not-allowed opacity-50",
            )}
          >
            {step.done ? (
              <CircleCheckIcon className="mt-0.5 size-4 shrink-0 text-emerald-500" />
            ) : (
              <span className="bg-muted text-muted-foreground mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold tabular-nums">
                {i + 1}
              </span>
            )}
            <span>
              <span className="block text-xs font-semibold">
                {step.loading ? `${step.label} 중…` : step.label}
              </span>
              <span className="text-muted-foreground mt-0.5 block text-[11px] leading-snug">
                {step.desc}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SavingStatus({
  isSaving,
  isDirty,
  updatedAt,
}: {
  isSaving: boolean;
  isDirty: boolean;
  updatedAt: string | null;
}) {
  if (isSaving) {
    return <span className="text-muted-foreground tabular-nums">저장 중…</span>;
  }
  if (isDirty) {
    return (
      <span className="font-semibold text-amber-600 dark:text-amber-400">
        미저장
      </span>
    );
  }
  if (updatedAt) {
    return (
      <span className="font-semibold text-emerald-600 tabular-nums dark:text-emerald-400">
        저장됨 · {updatedAt.slice(11, 16)}
      </span>
    );
  }
  return <span className="text-muted-foreground">미저장</span>;
}
