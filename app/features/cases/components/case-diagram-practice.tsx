// feat-2-035 S6-c — 도식 연습 모드: 법리·포섭을 비워 두고 학생이 쓴다.
//
// ★법리는 **한 칸**이다. 축별로 나눠 받으면 "축이 어긋나도 인정"(원장 지정 2026-08-27)이
//   성립하지 않고, 실제 답안도 축을 나눠 쓰지 않는다. 축은 채점할 때 모범답안 쪽에서만 쓴다.
// ★결론·강사 코멘트는 맞춰보기 전까지 가린다 — 먼저 보이면 법리를 쓰기 전에 답을 읽는다.
//
// 입력 칸은 **비제어(uncontrolled)** 다. value 를 state 로 되쓰면 iPad 한글 입력에서
// 조합 중인 글자가 밀리거나 앞 글자가 따라온다(암기 탭에서 겪은 문제).
// 저장해 둔 초안도 state 가 아니라 ref 로 채워 넣는다 — SSR 결과와도 어긋나지 않는다.
import { EraserIcon, PencilLineIcon } from "lucide-react";
import { type RefObject, useEffect, useRef, useState } from "react";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Textarea } from "~/core/components/ui/textarea";
import { cn } from "~/core/lib/utils";
import {
  type BlockScore,
  VERDICT_LABEL,
  type Verdict,
  scoreBlock,
} from "~/features/cases/lib/answer-match";

import { type CaseDiagramBlock, filledAxes } from "../lib/case-diagram";

const DRAFT_PREFIX = "caseDiagram.practice";

interface Draft {
  doctrine: string;
  application: string;
}

function readDraft(key: string): Draft | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const d = parsed as Partial<Draft>;
    return {
      doctrine: typeof d.doctrine === "string" ? d.doctrine : "",
      application: typeof d.application === "string" ? d.application : "",
    };
  } catch {
    // 저장값이 깨졌으면 없는 것으로 — 연습을 막을 이유가 없다.
    return null;
  }
}

const VERDICT_TONE: Record<Verdict, string> = {
  accepted:
    "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  partial:
    "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  weak: "border-border bg-muted text-muted-foreground",
};

export function BlockPractice({
  caseId,
  blockIndex,
  block,
  comment,
}: {
  caseId: string;
  blockIndex: number;
  block: CaseDiagramBlock;
  /** 강사 코멘트 — 답을 담고 있을 수 있어 맞춰본 뒤에만 보여 준다. */
  comment: string;
}) {
  const doctrineRef = useRef<HTMLTextAreaElement>(null);
  const applicationRef = useRef<HTMLTextAreaElement>(null);
  const [score, setScore] = useState<BlockScore | null>(null);

  const axes = filledAxes(block);
  const hasDoctrine = axes.length > 0;
  const hasApplication = block.application.trim().length > 0;
  const key = `${DRAFT_PREFIX}.${caseId}.${blockIndex}`;

  // 저장해 둔 초안 채우기 — state 가 아니라 DOM 에 직접 넣는다(위 주석 참조).
  useEffect(() => {
    const saved = readDraft(key);
    if (!saved) return;
    if (doctrineRef.current) doctrineRef.current.value = saved.doctrine;
    if (applicationRef.current) applicationRef.current.value = saved.application;
  }, [key]);

  const current = (): Draft => ({
    doctrine: doctrineRef.current?.value ?? "",
    application: applicationRef.current?.value ?? "",
  });

  const saveDraft = () => {
    try {
      window.localStorage.setItem(key, JSON.stringify(current()));
    } catch {
      // 저장 용량 초과 등 — 연습 자체는 계속할 수 있어야 한다.
    }
  };

  const check = () => {
    saveDraft();
    setScore(scoreBlock(block, current()));
  };

  const rewrite = () => {
    setScore(null);
    doctrineRef.current?.focus();
  };

  if (!hasDoctrine && !hasApplication) {
    return (
      <p className="text-muted-foreground mt-2 text-[12px]">
        이 쟁점은 아직 법리·포섭이 정리되지 않아 연습할 수 없습니다.
      </p>
    );
  }

  return (
    <div className="mt-3 space-y-3">
      {hasDoctrine ? (
        <Field
          no="2."
          label="법리"
          hint={`판결이 든 근거를 이어서 쓰세요 — 축을 나눠 쓰지 않아도 됩니다(모범답안은 ${axes.length}갈래).`}
          textareaRef={doctrineRef}
          onCommit={saveDraft}
          rows={6}
        />
      ) : null}

      {hasApplication ? (
        <Field
          no="3."
          label="사안의 포섭"
          hint="위 법리에 이 사건 사실을 대입해 쓰세요."
          textareaRef={applicationRef}
          onCommit={saveDraft}
          rows={5}
        />
      ) : null}

      {score ? (
        <ScoreReport
          score={score}
          conclusion={block.conclusion}
          comment={comment}
          onRewrite={rewrite}
        />
      ) : (
        <Button type="button" size="sm" onClick={check} className="w-full">
          <PencilLineIcon className="size-3.5" />
          맞춰보기
        </Button>
      )}
    </div>
  );
}

function Field({
  no,
  label,
  hint,
  textareaRef,
  onCommit,
  rows,
}: {
  no: string;
  label: string;
  hint: string;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onCommit: () => void;
  rows: number;
}) {
  return (
    <div>
      <p className="text-muted-foreground mb-1 flex items-center gap-1 text-[12px] font-semibold tracking-wide">
        <span className="text-link text-[14px]">{no}</span>
        {label}
      </p>
      <p className="text-muted-foreground mb-1 text-[11px]">{hint}</p>
      {/* ★비제어 — defaultValue 도 두지 않는다(초안은 ref 로 넣는다). 자동교정·맞춤법은
          모두 끈다: 법률 용어를 제멋대로 고쳐 학생이 쓴 말이 바뀐다. */}
      <Textarea
        ref={textareaRef}
        rows={rows}
        onBlur={onCommit}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        autoComplete="off"
        className="text-[15px] leading-[1.7]"
        placeholder={`${label} 부분을 직접 써 보세요`}
      />
    </div>
  );
}

function ScoreReport({
  score,
  conclusion,
  comment,
  onRewrite,
}: {
  score: BlockScore;
  conclusion: string;
  comment: string;
  onRewrite: () => void;
}) {
  return (
    <div className="border-border bg-muted/30 space-y-3 rounded-lg border p-3">
      {score.axes.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[12px] font-semibold">
            법리 — {score.axes.length}갈래 중{" "}
            <span className="text-link">{score.acceptedAxes}갈래</span> 인정
          </p>
          {/* ★어느 축에 썼는지는 묻지 않는다 — 갈래마다 학생 답 **전체**를 훑는다. */}
          {score.axes.map((ax) => (
            <Result
              key={ax.key}
              title={ax.label}
              verdict={ax.verdict}
              ratio={ax.match.ratio}
              missed={ax.match.missed}
              missedCount={ax.match.missedCount}
              model={ax.model}
            />
          ))}
        </div>
      ) : null}

      {score.application ? (
        <div className="space-y-2">
          <p className="text-[12px] font-semibold">사안의 포섭</p>
          <Result
            title="포섭"
            verdict={score.application.verdict}
            ratio={score.application.match.ratio}
            missed={score.application.match.missed}
            missedCount={score.application.match.missedCount}
            model={score.application.model}
          />
        </div>
      ) : null}

      {conclusion ? (
        <div>
          <p className="text-muted-foreground mb-1 text-[12px] font-semibold">
            <span className="text-link text-[14px]">4.</span> 결론
          </p>
          <p className="text-[15px] leading-[1.7] font-medium whitespace-pre-line">
            {conclusion}
          </p>
        </div>
      ) : null}

      {comment.trim() ? (
        <div className="border-border border-t pt-2">
          <p className="text-muted-foreground mb-1 text-[12px] font-semibold">
            강사 코멘트
          </p>
          <p className="text-[14px] leading-[1.7] whitespace-pre-line">
            {comment}
          </p>
        </div>
      ) : null}

      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={onRewrite}
        className="w-full"
      >
        <EraserIcon className="size-3.5" />
        다시 쓰기
      </Button>
    </div>
  );
}

function Result({
  title,
  verdict,
  ratio,
  missed,
  missedCount,
  model,
}: {
  title: string;
  verdict: Verdict;
  ratio: number;
  missed: string[];
  missedCount: number;
  model: string;
}) {
  return (
    <div className="bg-background border-border rounded-md border p-2.5">
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <Badge
          variant="secondary"
          className="rounded-sm px-1.5 py-0 text-[11px]"
        >
          {title}
        </Badge>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[11px] font-semibold",
            VERDICT_TONE[verdict],
          )}
        >
          {VERDICT_LABEL[verdict]} · {Math.round(ratio * 100)}%
        </span>
      </div>
      {missed.length > 0 ? (
        <p className="text-muted-foreground mb-1.5 text-[12px]">
          놓친 말 {missed.map((t) => `「${t}」`).join(" ")}
          {missedCount > missed.length
            ? ` 외 ${missedCount - missed.length}개`
            : ""}
        </p>
      ) : null}
      <p className="text-[14px] leading-[1.7] whitespace-pre-line">{model}</p>
    </div>
  );
}
