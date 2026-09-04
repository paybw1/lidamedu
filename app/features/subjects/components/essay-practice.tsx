// feat-2-036 — 모범답안 연습. 두 연습은 **거울 관계**라 화면도 한 벌이다(원장 2026-09-04).
//
//   목차 연습 — 본문을 보여 주고 **제목**이 빈칸. "이 글에 붙일 이름은 무엇인가"
//   내용 연습 — 목차를 보여 주고 **본문**이 빈칸. "이 자리에 무슨 법리를 쓰는가"
//
// ★칸이 제자리에 있으므로 순서를 묻지 않는다. 목차를 한 칸에 통째로 받던 방식에서는
//   순서 신호가 필요했지만, 빈칸 방식에서는 물을 일이 없다.
// ★비워 둔 칸은 채점에서 뺀다 — 0점으로 깔면 한두 칸만 연습한 학생이 크게 손해다
//   (3단계 훈련의 AI 채점이 같은 이유로 미작성 축을 제외한다).
//
// 입력 칸은 **비제어(uncontrolled)** 다. value 를 state 로 되쓰면 iPad 한글 입력에서
// 조합 중인 글자가 밀린다(암기 탭·도식 연습에서 이미 겪었다). 저장해 둔 초안도 state 가
// 아니라 ref 로 채운다 — SSR 결과와도 어긋나지 않는다.
import { CheckIcon, EraserIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Textarea } from "~/core/components/ui/textarea";
import { Input } from "~/core/components/ui/input";
import { cn } from "~/core/lib/utils";
import { VERDICT_LABEL, type Verdict } from "~/features/cases/lib/answer-match";
import { MarkdownView } from "~/features/problems/components/markdown-view";
import {
  type OutlineBlock,
  type OutlineNode,
  blockLabel,
  walk,
} from "~/features/subjects/lib/essay-outline";
import {
  type BlankScore,
  type PracticeMode,
  type PracticeScore,
  blanksOf,
  scorePractice,
} from "~/features/subjects/lib/essay-practice-score";

const DRAFT_PREFIX = "subjectivePractice";

const VERDICT_TONE: Record<Verdict, string> = {
  accepted:
    "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  partial:
    "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  weak: "border-border bg-muted text-muted-foreground",
};

const INDENT: Record<number, string> = { 2: "", 3: "pl-4", 4: "pl-9" };

export function EssayPractice({
  problemId,
  block,
  mode,
}: {
  problemId: string;
  block: OutlineBlock;
  mode: PracticeMode;
}) {
  const refs = useRef<Record<string, HTMLTextAreaElement | HTMLInputElement | null>>({});
  const [score, setScore] = useState<PracticeScore | null>(null);
  const key = `${DRAFT_PREFIX}.${mode}.${problemId}.b${block.index}`;
  const { label, points } = blockLabel(block);
  const blankIds = new Set(blanksOf(block, mode).map((n) => n.id));

  // 초안 복원 — 렌더 결과에 넣지 않고 mount 뒤 ref 로 채운다.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return;
      const saved: unknown = JSON.parse(raw);
      if (!saved || typeof saved !== "object") return;
      for (const [id, v] of Object.entries(saved as Record<string, unknown>)) {
        const el = refs.current[id];
        if (el && typeof v === "string" && !el.value) el.value = v;
      }
    } catch {
      // 저장값이 깨졌거나 저장소를 못 쓰는 환경 — 연습을 막을 이유가 없다.
    }
  }, [key]);

  const collect = (): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const [id, el] of Object.entries(refs.current)) if (el) out[id] = el.value;
    return out;
  };

  const saveDraft = () => {
    try {
      window.localStorage.setItem(key, JSON.stringify(collect()));
    } catch {
      // 초안 보존은 곁다리다 — 실패해도 연습을 막지 않는다.
    }
  };

  const check = () => {
    saveDraft();
    setScore(scorePractice(block, mode, collect()));
  };

  const reset = () => {
    for (const el of Object.values(refs.current)) if (el) el.value = "";
    setScore(null);
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* 위와 같다 */
    }
  };

  const byId = new Map((score?.blanks ?? []).map((b) => [b.nodeId, b]));
  const rows: OutlineNode[] = [];
  walk(block.nodes, (n) => rows.push(n));

  return (
    <section className="border-border bg-card rounded-xl border p-4">
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">
          {label} — {mode === "outline" ? "목차 세우기" : "내용 쓰기"}
        </span>
        {points !== null ? (
          <Badge variant="outline" className="tabular-nums">
            {points}점
          </Badge>
        ) : null}
        {score ? (
          <span
            className={cn(
              "ml-auto rounded-full border px-2.5 py-0.5 text-xs font-semibold",
              VERDICT_TONE[score.verdict],
            )}
          >
            {VERDICT_LABEL[score.verdict]} · 인정 {score.acceptedCount}/{score.writtenCount}
            {score.writtenCount < score.totalCount
              ? ` (안 쓴 칸 ${score.totalCount - score.writtenCount})`
              : ""}
          </span>
        ) : null}
      </header>

      <div className="mb-3 space-y-1">
        <p className="text-muted-foreground text-xs">
          {mode === "outline"
            ? "본문을 읽고 그 글에 붙일 소제목을 써 보세요. 비워 둔 칸은 채점에서 뺍니다."
            : "목차를 보고 그 자리에 들어갈 내용을 써 보세요. 비워 둔 칸은 채점에서 뺍니다."}
        </p>
        {/* ★채점은 모범답안의 낱말이 답에 담겼는지를 센다. 뜻이 맞아도 법률용어를 피해
            풀어 쓰면 낮게 나온다(실측 0.33) — 그걸 모르면 왜 미흡인지 알 수 없다.
            임계값을 낮추는 대신 성질을 알려 주기로 했다(원장 2026-09-04). */}
        <p className="text-muted-foreground text-xs">
          채점은 <strong className="font-semibold">법령·판례가 쓰는 말</strong>이 답에
          담겼는지로 봅니다. 뜻이 맞아도 그 말을 피해 풀어 쓰면 낮게 나옵니다 — 2차 답안에서
          용어를 그대로 쓰는 것이 곧 점수입니다.
        </p>
      </div>

      <ol className="space-y-3">
        {rows.map((n) => (
          <li key={n.id} className={INDENT[n.level] ?? ""}>
            <PracticeRow
              node={n}
              mode={mode}
              isBlank={blankIds.has(n.id)}
              result={byId.get(n.id) ?? null}
              onBlur={saveDraft}
              bind={(el) => {
                refs.current[n.id] = el;
              }}
            />
          </li>
        ))}
      </ol>

      <div className="mt-4 flex items-center gap-2">
        <Button type="button" size="sm" onClick={check}>
          맞춰보기
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={reset}>
          <EraserIcon className="size-3.5" /> 지우기
        </Button>
      </div>
    </section>
  );
}

function PracticeRow({
  node,
  mode,
  isBlank,
  result,
  onBlur,
  bind,
}: {
  node: OutlineNode;
  mode: PracticeMode;
  isBlank: boolean;
  result: BlankScore | null;
  onBlur: () => void;
  bind: (el: HTMLTextAreaElement | HTMLInputElement | null) => void;
}) {
  return (
    <div className="space-y-1.5">
      {/* 보여 주는 쪽 — 목차 연습은 본문, 내용 연습은 제목.
          ★본문 없이 하위를 묶기만 하는 자리는 목차 연습에서도 **제목을 그냥 보여 준다**
          (원장 2026-09-04). 단서가 없어 물어도 맞힐 근거가 없고, 트리 모양을 보여 주는
          역할은 그대로 해야 한다. */}
      {mode === "content" || !isBlank ? (
        <p className="text-sm font-semibold">{node.title}</p>
      ) : (
        <div className="border-border/70 bg-muted/40 rounded-lg border px-3 py-2">
          <MarkdownView
            text={node.bodyMd}
            breaks
            className="prose-sm max-w-none text-sm"
          />
        </div>
      )}

      {isBlank ? (
        <>
          {mode === "outline" ? (
            <Input
              ref={bind}
              onBlur={onBlur}
              placeholder="이 글의 소제목"
              className="h-8 text-sm"
            />
          ) : (
            <Textarea
              ref={bind}
              rows={4}
              onBlur={onBlur}
              placeholder="이 자리에 들어갈 내용"
              className="text-sm leading-relaxed"
            />
          )}
          {result && !result.blank ? <RowResult result={result} /> : null}
        </>
      ) : null}
    </div>
  );
}

function RowResult({ result }: { result: BlankScore }) {
  return (
    <div className="space-y-1 pt-0.5">
      <p className="flex items-start gap-1.5 text-sm">
        {result.verdict === "accepted" ? (
          <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <XIcon className="text-muted-foreground/60 mt-0.5 size-3.5 shrink-0" />
        )}
        <span className="text-muted-foreground">
          <span className="text-foreground font-medium">{result.model}</span>
          <span className="ml-1.5 text-xs">({VERDICT_LABEL[result.verdict]})</span>
        </span>
      </p>
      {result.match.missed.length ? (
        <div className="flex flex-wrap gap-1 pl-5">
          {result.match.missed.map((t) => (
            <Badge key={t} variant="secondary" className="font-normal">
              {t}
            </Badge>
          ))}
          {result.match.missedCount > result.match.missed.length ? (
            <span className="text-muted-foreground self-center text-xs">
              외 {result.match.missedCount - result.match.missed.length}개
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
