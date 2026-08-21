// feat-7-048 Stage E — 학습 타이머. 진행 중 표시 + 일시정지/종료, 과목 칩에서 시작.
//
// ★서버는 시각만 갖고 있다 — 경과는 화면에서 매초 다시 계산한다. 브라우저를 닫았다
//   열어도, 다른 기기에서 쫓겨났다 돌아와도 시작 시각만 있으면 값이 복원된다.
import { PauseIcon, PlayIcon, SquareIcon, Trash2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { cn } from "~/core/lib/utils";
import { formatMinutes } from "~/features/study-plans/labels";
import {
  SUBJECT_COLOR_CLASS,
  resolveSubjectColor,
  subjectName,
} from "~/features/study-plans/subject-axis";
import {
  TIMER_MAX_MINUTES,
  elapsedMs,
  formatElapsed,
} from "~/features/study-plans/lib/timer";

const API = "/api/study-plan";

export interface ActiveTimer {
  sessionId: string;
  startedAt: string;
  pausedMs: number;
  pausedAt: string | null;
  subjectKind: string | null;
  subjectCode: string | null;
  planItemTitle: string | null;
}

export function TimerBar({
  active,
  colorOverrides,
  onDone,
}: {
  active: ActiveTimer;
  colorOverrides: Record<string, string>;
  onDone: () => void;
}) {
  const fetcher = useFetcher<{
    ok?: true;
    error?: string;
    needsConfirm?: true;
    elapsedMinutes?: number;
  }>();
  const [now, setNow] = useState(() => Date.now());
  const [confirmMinutes, setConfirmMinutes] = useState<string>("");

  // 정지 중에는 값이 멈추므로 타이머를 돌리지 않는다.
  useEffect(() => {
    if (active.pausedAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active.pausedAt]);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && "ok" in fetcher.data && fetcher.data.ok) {
      setConfirmMinutes("");
      onDone();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);

  const ms = elapsedMs(active, now);
  const overCap = ms / 60_000 > TIMER_MAX_MINUTES;
  const needsConfirm = fetcher.data?.needsConfirm === true;
  const color = resolveSubjectColor(colorOverrides, active.subjectKind, active.subjectCode);

  const post = (fields: Record<string, string>) => {
    const fd = new FormData();
    fd.set("sessionId", active.sessionId);
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    fetcher.submit(fd, { method: "post", action: API });
  };

  return (
    <section className="bg-card mb-4 rounded-xl border p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn("size-3 shrink-0 rounded-full", SUBJECT_COLOR_CLASS[color].dot)}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold">
            {active.planItemTitle ?? subjectName(active.subjectKind, active.subjectCode)}
          </p>
          <p className="text-muted-foreground text-[11px]">
            {active.pausedAt ? "일시정지" : "기록 중"} ·{" "}
            {subjectName(active.subjectKind, active.subjectCode)}
          </p>
        </div>
        <span className="text-2xl font-semibold tabular-nums">{formatElapsed(ms)}</span>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-end gap-1.5">
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          disabled={fetcher.state !== "idle"}
          onClick={() =>
            post({ intent: active.pausedAt ? "resume_timer" : "pause_timer" })
          }
        >
          {active.pausedAt ? (
            <>
              <PlayIcon className="size-3.5" /> 재개
            </>
          ) : (
            <>
              <PauseIcon className="size-3.5" /> 일시정지
            </>
          )}
        </Button>
        <Button
          size="sm"
          className="h-8"
          disabled={fetcher.state !== "idle"}
          onClick={() => post({ intent: "stop_timer" })}
        >
          <SquareIcon className="size-3.5" /> 종료하고 기록
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 text-rose-600"
          disabled={fetcher.state !== "idle"}
          onClick={() => {
            if (confirm("기록을 남기지 않고 이 타이머를 버릴까요?")) {
              post({ intent: "discard_timer" });
            }
          }}
        >
          <Trash2Icon className="size-3.5" /> 버리기
        </Button>
      </div>

      {/* 12시간 상한 — 켜두고 잊은 타이머를 그대로 확정하지 않는다. */}
      {needsConfirm || overCap ? (
        <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2">
          <p className="text-[11px] text-amber-800 dark:text-amber-300">
            {formatMinutes(TIMER_MAX_MINUTES)}을 넘겼습니다 — 실제로 공부한 시간을
            적어 주세요.
          </p>
          <div className="mt-1.5 flex items-center gap-1.5">
            <Input
              type="number"
              min={0}
              max={TIMER_MAX_MINUTES}
              placeholder="분"
              value={confirmMinutes}
              onChange={(e) => setConfirmMinutes(e.target.value)}
              className="h-8 w-24 text-xs tabular-nums"
            />
            <Button
              size="sm"
              className="h-8"
              disabled={fetcher.state !== "idle" || confirmMinutes === ""}
              onClick={() => post({ intent: "stop_timer", minutes: confirmMinutes })}
            >
              이 시간으로 기록
            </Button>
          </div>
        </div>
      ) : null}

      {fetcher.data?.error && !needsConfirm ? (
        <p className="mt-2 text-xs text-rose-600">{fetcher.data.error}</p>
      ) : null}
    </section>
  );
}

/** 타이머 시작 버튼 — 계획 항목 카드와 과목 칩 양쪽에서 쓴다. */
export function TimerStartButton({
  planItemId,
  activityType,
  subject,
  label,
  disabled,
  onDone,
  className,
}: {
  planItemId?: string;
  activityType: string;
  /** "kind:code" — 계획 항목에서 시작하면 항목 값이 우선한다. */
  subject?: string;
  label: string;
  disabled?: boolean;
  onDone: () => void;
  className?: string;
}) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && "ok" in fetcher.data && fetcher.data.ok) {
      onDone();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className={cn("h-8", className)}
        disabled={disabled || fetcher.state !== "idle"}
        onClick={() => {
          const fd = new FormData();
          fd.set("intent", "start_timer");
          fd.set("activityType", activityType);
          if (planItemId) fd.set("planItemId", planItemId);
          if (subject) fd.set("subject", subject);
          fetcher.submit(fd, { method: "post", action: API });
        }}
      >
        <PlayIcon className="size-3.5" /> {label}
      </Button>
      {fetcher.data && "error" in fetcher.data && fetcher.data.error ? (
        <span className="text-[11px] text-rose-600">{fetcher.data.error}</span>
      ) : null}
    </>
  );
}
