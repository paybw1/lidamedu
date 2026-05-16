// 라운드 단위 동료 채점 — 한 reviewer 가 배정된 N개 답안을 한 화면에서 매트릭스 형식으로 채점.
// PPT 6페이지 ("한 채점자에 5개 답안 배정") 와 동일 레이아웃: 답안을 컬럼, 문제·criterion 을 행으로.
// 점수/정성평가는 cell 단위 디바운스 자동 저장. 총계·순위는 실시간 클라이언트 계산.

import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  EyeIcon,
  FileTextIcon,
  SendIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, data, useFetcher } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Separator } from "~/core/components/ui/separator";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import type { GsPage, GsQuestion } from "~/features/gs/queries.server";
import { getGsRound } from "~/features/gs/queries.server";
import {
  type PeerRoundAnswerColumn,
  getPeerRoundMatrix,
} from "~/features/gs/queries-peer.server";
import { LAW_SUBJECTS } from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/gs-peer-review-round";

export const meta: Route.MetaFunction = ({ data: loaderData }) => [
  {
    title: loaderData?.round
      ? `${loaderData.round.title} 동료 채점 (매트릭스) | Lidam Patent Attorney Academy`
      : "동료 채점 | Lidam Patent Attorney Academy",
  },
];

export async function loader({ params, request }: Route.LoaderArgs) {
  const roundId = params.roundId;
  if (!roundId) throw data("Missing roundId", { status: 404 });
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const round = await getGsRound(client, roundId);
  if (!round) throw data("Round not found", { status: 404 });

  const matrix = await getPeerRoundMatrix(client, roundId, user.id);
  return {
    round,
    questions: matrix.questions,
    columns: matrix.columns,
  };
}

export default function GsPeerReviewRound({
  loaderData,
}: Route.ComponentProps) {
  const { round, questions, columns } = loaderData;
  const subjectLabel = LAW_SUBJECTS[round.subject]?.name ?? round.subject;

  if (columns.length === 0) {
    return (
      <div className="mx-auto w-full max-w-screen-md px-5 py-6 md:px-10 md:py-8">
        <Link
          to="/gs"
          className="text-muted-foreground mb-3 inline-flex items-center gap-1 text-xs hover:underline"
        >
          <ArrowLeftIcon className="size-3" /> 온라인 GS
        </Link>
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center text-sm">
            이 회차에 배정된 동료 채점이 없습니다.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-3 py-5 md:px-6 md:py-7">
      <header className="mb-5 space-y-2">
        <Link
          to="/gs"
          className="text-muted-foreground inline-flex items-center gap-1 text-xs hover:underline"
        >
          <ArrowLeftIcon className="size-3" /> 온라인 GS
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
              동료 채점 · 매트릭스 모드
            </p>
            <h1 className="text-xl font-bold tracking-tight md:text-2xl">
              {round.title}
            </h1>
            <p className="text-muted-foreground mt-1 text-xs">
              {subjectLabel} · 배정 답안 {columns.length}개
            </p>
          </div>
        </div>
        <Card className="bg-amber-50/40 border-amber-300/60 dark:border-amber-700/40 dark:bg-amber-950/20">
          <CardContent className="text-amber-900 dark:text-amber-200 pt-4 text-xs leading-relaxed">
            <strong>익명 동료 채점입니다.</strong> 답안 작성자 정보는 노출되지
            않습니다. 문제별 소문제 점수를 입력하면 소계·총계·순위가 자동 갱신
            됩니다. 입력은 자동 저장됩니다.
          </CardContent>
        </Card>
      </header>

      <PeerMatrix questions={questions} columns={columns} />
    </div>
  );
}

// ── 클라이언트 상태 ──────────────────────────────────────────────
// cellKey = `${assignmentId}:${questionId}`
type CellState = {
  rubricScores: Record<string, { score: number; note?: string }>;
  feedbackMd: string;
};
type DirtyMap = Record<string, "idle" | "saving" | "saved">;

function initialCells(columns: PeerRoundAnswerColumn[]): Record<string, CellState> {
  const out: Record<string, CellState> = {};
  for (const col of columns) {
    for (const [qid, ans] of Object.entries(col.reviewAnswers)) {
      out[`${col.assignmentId}:${qid}`] = {
        rubricScores: { ...ans.rubricScores },
        feedbackMd: ans.feedbackMd ?? "",
      };
    }
  }
  return out;
}

function PeerMatrix({
  questions,
  columns,
}: {
  questions: GsQuestion[];
  columns: PeerRoundAnswerColumn[];
}) {
  const [cells, setCells] = useState<Record<string, CellState>>(() =>
    initialCells(columns),
  );
  const [dirty, setDirty] = useState<DirtyMap>({});
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const saveFetcher = useFetcher();

  const getCell = (assignmentId: string, questionId: string): CellState => {
    const key = `${assignmentId}:${questionId}`;
    return cells[key] ?? { rubricScores: {}, feedbackMd: "" };
  };

  const scheduleSave = (
    assignmentId: string,
    questionId: string,
    next: CellState,
  ) => {
    const key = `${assignmentId}:${questionId}`;
    const timers = timersRef.current;
    if (timers.has(key)) clearTimeout(timers.get(key));
    setDirty((d) => ({ ...d, [key]: "saving" }));
    const t = setTimeout(() => {
      const fd = new FormData();
      fd.set("intent", "save");
      fd.set("assignmentId", assignmentId);
      fd.set("questionId", questionId);
      fd.set("rubricScoresJson", JSON.stringify(next.rubricScores));
      fd.set("feedbackMd", next.feedbackMd);
      saveFetcher.submit(fd, { method: "post", action: "/api/gs/peer" });
      setDirty((d) => ({ ...d, [key]: "saved" }));
      timers.delete(key);
    }, 700);
    timers.set(key, t);
  };

  const setCriterionScore = (
    assignmentId: string,
    questionId: string,
    criterionId: string,
    raw: string,
  ) => {
    const key = `${assignmentId}:${questionId}`;
    setCells((prev) => {
      const cur = prev[key] ?? { rubricScores: {}, feedbackMd: "" };
      const trimmed = raw.trim();
      const nextRubric = { ...cur.rubricScores };
      if (trimmed === "") {
        delete nextRubric[criterionId];
      } else {
        const num = Number(trimmed);
        if (!Number.isFinite(num)) return prev;
        nextRubric[criterionId] = { score: num };
      }
      const next: CellState = { ...cur, rubricScores: nextRubric };
      scheduleSave(assignmentId, questionId, next);
      return { ...prev, [key]: next };
    });
  };

  const setFeedback = (
    assignmentId: string,
    questionId: string,
    value: string,
  ) => {
    const key = `${assignmentId}:${questionId}`;
    setCells((prev) => {
      const cur = prev[key] ?? { rubricScores: {}, feedbackMd: "" };
      const next: CellState = { ...cur, feedbackMd: value };
      scheduleSave(assignmentId, questionId, next);
      return { ...prev, [key]: next };
    });
  };

  // 답안 컬럼별 소계·총계 계산.
  const subtotalsByCol = useMemo(() => {
    // [assignmentId][questionId] = number
    const out: Record<string, Record<string, number>> = {};
    for (const col of columns) {
      const inner: Record<string, number> = {};
      for (const q of questions) {
        const cell = cells[`${col.assignmentId}:${q.questionId}`];
        if (!cell) {
          inner[q.questionId] = 0;
          continue;
        }
        let sum = 0;
        for (const v of Object.values(cell.rubricScores)) sum += v.score;
        inner[q.questionId] = sum;
      }
      out[col.assignmentId] = inner;
    }
    return out;
  }, [cells, columns, questions]);

  const totalsByCol = useMemo(() => {
    const out: Record<string, number> = {};
    for (const col of columns) {
      let t = 0;
      for (const q of questions) {
        t += subtotalsByCol[col.assignmentId]?.[q.questionId] ?? 0;
      }
      out[col.assignmentId] = Math.round(t * 100) / 100;
    }
    return out;
  }, [subtotalsByCol, columns, questions]);

  // 순위 — 동점은 같은 순위(공동).
  const ranksByCol = useMemo(() => {
    const sorted = [...columns].sort(
      (a, b) => totalsByCol[b.assignmentId] - totalsByCol[a.assignmentId],
    );
    const out: Record<string, number> = {};
    let lastTotal = Number.POSITIVE_INFINITY;
    let lastRank = 0;
    sorted.forEach((c, idx) => {
      const t = totalsByCol[c.assignmentId];
      if (t < lastTotal) {
        lastRank = idx + 1;
        lastTotal = t;
      }
      out[c.assignmentId] = lastRank;
    });
    return out;
  }, [columns, totalsByCol]);

  // 평균 (참고용).
  const avgByQuestion = useMemo(() => {
    const out: Record<string, number> = {};
    for (const q of questions) {
      let sum = 0;
      let n = 0;
      for (const col of columns) {
        const v = subtotalsByCol[col.assignmentId]?.[q.questionId];
        if (typeof v === "number") {
          sum += v;
          n += 1;
        }
      }
      out[q.questionId] = n === 0 ? 0 : Math.round((sum / n) * 100) / 100;
    }
    return out;
  }, [columns, questions, subtotalsByCol]);
  const totalAvg = useMemo(() => {
    if (columns.length === 0) return 0;
    let sum = 0;
    for (const c of columns) sum += totalsByCol[c.assignmentId] ?? 0;
    return Math.round((sum / columns.length) * 100) / 100;
  }, [columns, totalsByCol]);

  // 컬럼 라벨 — 익명. 답안 1 / 답안 2 ... (배정 순)
  const colLabels = useMemo(
    () => columns.map((_, i) => `답안 ${i + 1}`),
    [columns],
  );

  return (
    <div className="space-y-6">
      {questions.map((q, qIdx) => (
        <QuestionMatrixCard
          key={q.questionId}
          question={q}
          questionLabel={`문제 ${qIdx + 1}`}
          columns={columns}
          colLabels={colLabels}
          getCell={getCell}
          dirty={dirty}
          subtotalsByCol={subtotalsByCol}
          avg={avgByQuestion[q.questionId]}
          onScoreChange={setCriterionScore}
          onFeedbackChange={setFeedback}
        />
      ))}

      <Card>
        <CardHeader>
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            총계 · 순위 (입력값 기준 실시간)
          </p>
        </CardHeader>
        <CardContent className="overflow-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b">
                <th className="sticky left-0 z-10 bg-background px-3 py-2 text-left">
                  항목
                </th>
                {columns.map((c, i) => (
                  <th
                    key={c.assignmentId}
                    className="border-l px-3 py-2 text-right whitespace-nowrap"
                  >
                    {colLabels[i]}
                  </th>
                ))}
                <th className="border-l px-3 py-2 text-right whitespace-nowrap">
                  평균
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b font-semibold">
                <td className="sticky left-0 z-10 bg-background px-3 py-2">
                  총계
                </td>
                {columns.map((c) => (
                  <td
                    key={c.assignmentId}
                    className="border-l px-3 py-2 text-right tabular-nums"
                  >
                    {totalsByCol[c.assignmentId]}
                  </td>
                ))}
                <td className="border-l px-3 py-2 text-right tabular-nums">
                  {totalAvg}
                </td>
              </tr>
              <tr>
                <td className="sticky left-0 z-10 bg-background px-3 py-2 font-semibold">
                  순위
                </td>
                {columns.map((c) => (
                  <td
                    key={c.assignmentId}
                    className="border-l px-3 py-2 text-right tabular-nums"
                  >
                    {ranksByCol[c.assignmentId]}
                  </td>
                ))}
                <td className="border-l px-3 py-2 text-right tabular-nums">
                  —
                </td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Separator />

      <PerAssignmentSubmit columns={columns} colLabels={colLabels} />
    </div>
  );
}

function QuestionMatrixCard({
  question,
  questionLabel,
  columns,
  colLabels,
  getCell,
  dirty,
  subtotalsByCol,
  avg,
  onScoreChange,
  onFeedbackChange,
}: {
  question: GsQuestion;
  questionLabel: string;
  columns: PeerRoundAnswerColumn[];
  colLabels: string[];
  getCell: (a: string, q: string) => CellState;
  dirty: DirtyMap;
  subtotalsByCol: Record<string, Record<string, number>>;
  avg: number;
  onScoreChange: (a: string, q: string, c: string, raw: string) => void;
  onFeedbackChange: (a: string, q: string, value: string) => void;
}) {
  const criteria = question.rubric;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-[10px]">
            {questionLabel}
          </Badge>
          {question.title ? (
            <h2 className="font-semibold">{question.title}</h2>
          ) : null}
          <Badge variant="secondary" className="ml-auto text-[10px]">
            {question.maxScore}점 만점
          </Badge>
        </div>
      </CardHeader>
      <Separator />
      <CardContent className="space-y-3 pt-4">
        <section>
          <p className="text-muted-foreground mb-1 text-[10px] font-semibold tracking-wide uppercase">
            문제
          </p>
          <div className="bg-muted/30 max-h-40 overflow-auto rounded-md border p-3">
            <p className="font-serif text-sm leading-relaxed whitespace-pre-line">
              {question.bodyMd}
            </p>
          </div>
        </section>
        {question.modelAnswerMd ? (
          <section>
            <p className="text-muted-foreground mb-1 text-[10px] font-semibold tracking-wide uppercase">
              모범답안 / 채점 기준
            </p>
            <div className="bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200/60 dark:border-emerald-700/40 max-h-44 overflow-auto rounded-md border p-3">
              <p className="font-serif text-sm leading-relaxed whitespace-pre-line">
                {question.modelAnswerMd}
              </p>
            </div>
          </section>
        ) : null}

        <div className="overflow-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b">
                <th className="sticky left-0 z-10 bg-background px-3 py-2 text-left w-44">
                  소문제 / 배점
                </th>
                {columns.map((c, i) => (
                  <th
                    key={c.assignmentId}
                    className="border-l px-2 py-2 text-center whitespace-nowrap"
                  >
                    {colLabels[i]}
                  </th>
                ))}
                <th className="border-l px-2 py-2 text-center whitespace-nowrap text-muted-foreground">
                  평균
                </th>
              </tr>
            </thead>
            <tbody>
              {/* 답안 페이지 미리보기 (한 번에 한 줄) */}
              <tr className="border-b">
                <td className="sticky left-0 z-10 bg-background px-3 py-2 align-top text-[11px] text-muted-foreground">
                  답안 페이지
                </td>
                {columns.map((c) => (
                  <td key={c.assignmentId} className="border-l p-2 align-top">
                    <AnswerPagesPreview
                      pages={c.pagesByQuestion[question.questionId] ?? []}
                      ocrText={c.ocrTextByQuestion[question.questionId] ?? ""}
                      assignmentId={c.assignmentId}
                    />
                  </td>
                ))}
                <td className="border-l" />
              </tr>

              {/* criterion 별 점수 입력 */}
              {criteria.length === 0 ? (
                <tr className="border-b">
                  <td className="sticky left-0 z-10 bg-background px-3 py-3 text-[11px] text-muted-foreground">
                    채점기준 미설정 — 운영자에게 문의
                  </td>
                  <td
                    colSpan={columns.length + 1}
                    className="border-l px-3 py-3 text-center text-xs text-muted-foreground"
                  >
                    rubric 이 설정되지 않은 문제는 매트릭스 채점을 사용할 수 없습니다.
                  </td>
                </tr>
              ) : (
                criteria.map((cr) => (
                  <tr key={cr.criterionId} className="border-b">
                    <td className="sticky left-0 z-10 bg-background px-3 py-2 align-top">
                      <p className="text-sm font-medium">{cr.label}</p>
                      <p className="text-muted-foreground text-[10px]">
                        ({cr.maxPoints}점)
                      </p>
                    </td>
                    {columns.map((c) => {
                      const cell = getCell(c.assignmentId, question.questionId);
                      const val = cell.rubricScores[cr.criterionId]?.score;
                      const key = `${c.assignmentId}:${question.questionId}`;
                      const state = dirty[key];
                      return (
                        <td
                          key={c.assignmentId}
                          className="border-l p-1 text-center align-middle"
                        >
                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.5"
                            min={0}
                            max={cr.maxPoints}
                            value={val == null ? "" : String(val)}
                            onChange={(e) =>
                              onScoreChange(
                                c.assignmentId,
                                question.questionId,
                                cr.criterionId,
                                e.target.value,
                              )
                            }
                            disabled={c.submittedAt != null}
                            className={cn(
                              "border-input bg-background h-8 w-16 rounded-md border px-1 text-center text-sm tabular-nums",
                              state === "saving" && "ring-amber-300 ring-1",
                            )}
                          />
                        </td>
                      );
                    })}
                    <td className="border-l px-2 py-2 text-center text-xs text-muted-foreground tabular-nums">
                      {(() => {
                        const vs: number[] = [];
                        for (const c of columns) {
                          const v = getCell(c.assignmentId, question.questionId)
                            .rubricScores[cr.criterionId]?.score;
                          if (typeof v === "number") vs.push(v);
                        }
                        if (vs.length === 0) return "—";
                        return Math.round(
                          (vs.reduce((a, b) => a + b, 0) / vs.length) * 100,
                        ) / 100;
                      })()}
                    </td>
                  </tr>
                ))
              )}

              {/* 소계 */}
              <tr className="border-b bg-muted/30 font-semibold">
                <td className="sticky left-0 z-10 bg-muted/30 px-3 py-2">
                  소계
                </td>
                {columns.map((c) => (
                  <td
                    key={c.assignmentId}
                    className="border-l px-2 py-2 text-center tabular-nums"
                  >
                    {subtotalsByCol[c.assignmentId]?.[question.questionId] ?? 0}
                  </td>
                ))}
                <td className="border-l px-2 py-2 text-center tabular-nums">
                  {avg}
                </td>
              </tr>

              {/* 정성평가 */}
              <tr>
                <td className="sticky left-0 z-10 bg-background px-3 py-2 align-top">
                  <p className="text-sm font-medium">정성평가</p>
                  <p className="text-muted-foreground text-[10px]">
                    답안 작성자에게 익명 전달
                  </p>
                </td>
                {columns.map((c) => {
                  const cell = getCell(c.assignmentId, question.questionId);
                  return (
                    <td
                      key={c.assignmentId}
                      className="border-l p-1 align-top"
                    >
                      <textarea
                        rows={3}
                        value={cell.feedbackMd}
                        onChange={(e) =>
                          onFeedbackChange(
                            c.assignmentId,
                            question.questionId,
                            e.target.value,
                          )
                        }
                        disabled={c.submittedAt != null}
                        className="border-input bg-background min-h-[64px] w-full rounded-md border p-1.5 text-xs"
                        placeholder="피드백 (선택)"
                      />
                    </td>
                  );
                })}
                <td className="border-l" />
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// 답안 페이지 미리보기 — 페이지 카운트만 보여주고 클릭 시 펼쳐서 이미지 표시.
function AnswerPagesPreview({
  pages,
  ocrText,
  assignmentId,
}: {
  pages: GsPage[];
  ocrText: string;
  assignmentId: string;
}) {
  const [open, setOpen] = useState(false);
  if (pages.length === 0) {
    return (
      <p className="text-muted-foreground py-2 text-center text-[11px] italic">
        매핑 없음
      </p>
    );
  }
  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-primary hover:text-primary/80 inline-flex items-center gap-1 text-[11px]"
      >
        <EyeIcon className="size-3" />
        페이지 {pages.length}개 {open ? "접기" : "펼치기"}
      </button>
      {open ? (
        <div className="space-y-1">
          {pages.map((p) => (
            <PeerPageView
              key={p.pageId}
              page={p}
              assignmentId={assignmentId}
            />
          ))}
          {ocrText ? (
            <details className="mt-1">
              <summary className="cursor-pointer text-[10px] text-muted-foreground hover:underline">
                OCR 텍스트 보기
              </summary>
              <pre className="mt-1 max-h-40 overflow-auto rounded border bg-background p-2 text-[10px] whitespace-pre-line">
                {ocrText}
              </pre>
            </details>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function PeerPageView({
  page,
  assignmentId,
}: {
  page: GsPage;
  assignmentId: string;
}) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const isImage = page.attachment.mime.startsWith("image/");

  useEffect(() => {
    let cancelled = false;
    fetch(
      `/api/gs/peer?assignmentId=${encodeURIComponent(assignmentId)}&path=${encodeURIComponent(page.attachment.path)}`,
    )
      .then((r) => r.json())
      .then((j: { url?: string }) => {
        if (!cancelled) setSignedUrl(j.url ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [assignmentId, page.attachment.path]);

  return (
    <div className="rounded border bg-muted/20 p-1.5">
      <div className="flex items-center gap-1 text-[10px]">
        <Badge variant="outline" className="text-[9px]">
          p{page.pageNumber}
        </Badge>
        <FileTextIcon className="text-muted-foreground size-3" />
        <span className="text-muted-foreground flex-1 truncate">
          {page.attachment.mime.split("/")[1]?.toUpperCase() ?? "FILE"}
        </span>
        {signedUrl ? (
          <a
            href={signedUrl}
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
          >
            풀
          </a>
        ) : null}
      </div>
      {isImage && signedUrl ? (
        <img
          src={signedUrl}
          alt={`p${page.pageNumber}`}
          loading="lazy"
          className="mt-1 max-h-60 w-full rounded border object-contain bg-background"
        />
      ) : !isImage && signedUrl ? (
        <a
          href={signedUrl}
          target="_blank"
          rel="noreferrer"
          className="bg-background hover:bg-muted mt-1 block rounded border p-2 text-center text-[10px]"
        >
          PDF 열기
        </a>
      ) : null}
    </div>
  );
}

// 답안 단위 "채점 제출" 버튼들. 제출은 assignment 단위.
function PerAssignmentSubmit({
  columns,
  colLabels,
}: {
  columns: PeerRoundAnswerColumn[];
  colLabels: string[];
}) {
  return (
    <Card>
      <CardHeader>
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          답안별 채점 제출
        </p>
        <p className="text-muted-foreground mt-1 text-xs">
          답안 컬럼별로 모든 입력이 완료되면 "제출" 을 누르세요. 제출 후에는 수정할 수 없습니다.
        </p>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {columns.map((c, i) => (
          <SubmitColumnButton
            key={c.assignmentId}
            assignmentId={c.assignmentId}
            label={colLabels[i]}
            submittedAt={c.submittedAt}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function SubmitColumnButton({
  assignmentId,
  label,
  submittedAt,
}: {
  assignmentId: string;
  label: string;
  submittedAt: string | null;
}) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const submitted = submittedAt != null || fetcher.data?.ok === true;
  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold">{label}</span>
        {submitted ? (
          <Badge className="bg-emerald-600 text-white">
            <CheckCircle2Icon className="size-3" /> 제출됨
          </Badge>
        ) : (
          <Badge variant="outline">진행 중</Badge>
        )}
      </div>
      {submitted ? null : (
        <fetcher.Form
          method="post"
          action="/api/gs/peer"
          onSubmit={(e) => {
            if (!confirm(`${label} 채점을 제출합니다. 진행할까요?`))
              e.preventDefault();
          }}
        >
          <input type="hidden" name="intent" value="submit" />
          <input type="hidden" name="assignmentId" value={assignmentId} />
          <Button
            type="submit"
            size="sm"
            disabled={fetcher.state !== "idle"}
            className="w-full"
          >
            <SendIcon className="size-3.5" />
            {fetcher.state !== "idle" ? "제출 중..." : "채점 제출"}
          </Button>
        </fetcher.Form>
      )}
      {fetcher.data?.error ? (
        <p className="text-rose-600 mt-1 text-[11px]">{fetcher.data.error}</p>
      ) : null}
    </div>
  );
}
