// 학생 GS 응시 화면 — 답안지를 페이지 슬롯에 업로드하고 페이지마다 어느 문항인지 매핑.
// 좌: 문제 목록(읽기). 우: N슬롯 페이지 그리드. 슬롯 = 빈 상태 또는 (썸네일 + 문항 매핑 + 판독 확인).
// 커뮤니티 셸 reskin — 키트 lidam-community/GsTakeScreen 디자인.
import type { Route } from "./+types/gs-take";

import {
  AlertCircleIcon,
  CheckIcon,
  CornerDownRightIcon,
  DownloadIcon,
  FileImageIcon,
  FileTextIcon,
  GripVerticalIcon,
  SendIcon,
  TimerIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { data, redirect, useFetcher, useRevalidator } from "react-router";

import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";
import { cn } from "~/core/lib/utils";
import { Chip } from "~/features/community/components/community-ui";
import {
  type GsPage,
  type GsQuestion,
  type GsRound,
  getGsPaperSignedUrl,
  getGsRound,
  getOrCreateOwnSubmission,
  getOwnSubmission,
  listGsQuestions,
  listSubmissionPages,
} from "~/features/gs/queries.server";
import { MockExamShell } from "~/features/mcq-exams/components/mock-exam-shell";
import { LAW_SUBJECTS } from "~/features/subjects/lib/subjects";

export const meta: Route.MetaFunction = ({ data: loaderData }) => [
  {
    title: loaderData?.round
      ? `${loaderData.round.title} | 리담변리사학원`
      : "GS 응시 | 리담변리사학원",
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

  const now = Date.now();
  const start = new Date(round.startAt).getTime();
  const end = new Date(round.endAt).getTime();
  if (round.status !== "published" && round.status !== "closed") {
    throw data("이 회차는 아직 공개되지 않았습니다.", { status: 403 });
  }
  if (now < start) {
    throw data("아직 응시 시작 시각이 아닙니다.", { status: 403 });
  }

  const existing = await getOwnSubmission(client, user.id, roundId);
  if (existing?.submittedAt) {
    return redirect(`/gs/${roundId}/result`);
  }
  if (now > end && !existing) {
    throw data("응시 종료 시각이 지났습니다.", { status: 403 });
  }

  const submission = await getOrCreateOwnSubmission(client, user.id, roundId);
  const [questions, pages, paperUrl] = await Promise.all([
    listGsQuestions(client, roundId),
    listSubmissionPages(client, submission.submissionId),
    round.paperPdfPath ? getGsPaperSignedUrl(client, round.paperPdfPath) : null,
  ]);

  return { round, submission, questions, pages, paperUrl };
}

export default function GsTake({ loaderData }: Route.ComponentProps) {
  const { round, submission, questions, pages, paperUrl } = loaderData;
  const submitFetcher = useFetcher<{ error?: string; ok?: true }>();
  const revalidator = useRevalidator();
  // 안정적인 onChange — 슬롯에 인라인 () => revalidator.revalidate() 를 넘기면
  // 매 렌더 새 함수가 되어, 업로드 후 자식 effect(uploadFetcher.data 잔존)가
  // 무한히 revalidate 를 호출해 화면이 멈췄다(특히 '교체' 시 슬롯이 remount 안 됨).
  // ref 로 최신 revalidator 를 가리키되 콜백 자체는 불변으로 고정해 루프 차단.
  const revalidatorRef = useRef(revalidator);
  revalidatorRef.current = revalidator;
  const handlePageChange = useCallback(() => {
    revalidatorRef.current.revalidate();
  }, []);

  const pageByNum = useMemo(() => {
    const m = new Map<number, GsPage>();
    for (const p of pages) m.set(p.pageNumber, p);
    return m;
  }, [pages]);

  // 매핑된 문항 집합 — 모든 문항이 ≥1 페이지 매핑되어야 제출 가능.
  const mappedQuestionIds = useMemo(() => {
    const s = new Set<string>();
    for (const p of pages) for (const qid of p.questionIds) s.add(qid);
    return s;
  }, [pages]);

  const allQuestionsMapped = questions.every((q) =>
    mappedQuestionIds.has(q.questionId),
  );
  const allPagesConfirmed =
    pages.length > 0 && pages.every((p) => p.legibilityConfirmed);
  // 제출 활성화: 1페이지 이상 업로드 + expected_pages 이내 + 모든 업로드 페이지 판독 확인.
  // 미매핑 문항은 차단하지 않음(자동 채점에서 0점 처리 — 학생이 일부만 풀고 제출 가능).
  const withinPageLimit = pages.length <= round.expectedPages;
  const allReady = pages.length > 0 && allPagesConfirmed && withinPageLimit;
  const unmappedCount = questions.filter(
    (q) => !mappedQuestionIds.has(q.questionId),
  ).length;

  const deadline = useMemo(() => {
    const endByRound = new Date(round.endAt).getTime();
    const endByDuration =
      new Date(submission.startedAt).getTime() + round.durationMin * 60_000;
    return Math.min(endByRound, endByDuration);
  }, [round.endAt, submission.startedAt, round.durationMin]);

  const slots = useMemo(
    () => Array.from({ length: round.expectedPages }, (_, i) => i + 1),
    [round.expectedPages],
  );

  // 페이지 swap (드래그&드롭) — 부모에서 fetch 로 처리, useFetcher 는 슬롯별로 묶여 있어 부적합.
  const onSwap = async (fromPage: number, toPage: number) => {
    if (fromPage === toPage) return;
    const fd = new FormData();
    fd.set("intent", "swap-pages");
    fd.set("roundId", round.roundId);
    fd.set("pageNumberA", String(fromPage));
    fd.set("pageNumberB", String(toPage));
    try {
      const res = await fetch("/api/gs/take", { method: "POST", body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(`페이지 교환 실패: ${j.error ?? `HTTP ${res.status}`}`);
        return;
      }
    } catch (e) {
      alert(`네트워크 오류: ${(e as Error).message}`);
      return;
    }
    revalidator.revalidate();
  };

  // 페이지 N 자리에 빈 슬롯 끼워넣기 — N 이상 모두 +1.
  const onInsertBefore = async (pageNumber: number) => {
    const maxFilled = pages.reduce((m, p) => Math.max(m, p.pageNumber), 0);
    if (maxFilled >= round.expectedPages) {
      alert(
        `마지막 페이지(${round.expectedPages})가 이미 채워져 있어 끼워넣기 시 페이지가 잘립니다. 먼저 마지막 페이지를 비워 주세요.`,
      );
      return;
    }
    if (
      !confirm(
        `페이지 ${pageNumber} 자리에 빈 슬롯을 추가합니다. 페이지 ${pageNumber} 부터 끝까지 한 칸씩 뒤로 밀립니다. 진행하시겠습니까?`,
      )
    )
      return;
    const fd = new FormData();
    fd.set("intent", "shift-pages-down");
    fd.set("roundId", round.roundId);
    fd.set("fromPage", String(pageNumber));
    try {
      const res = await fetch("/api/gs/take", { method: "POST", body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(`끼워넣기 실패: ${j.error ?? `HTTP ${res.status}`}`);
        return;
      }
    } catch (e) {
      alert(`네트워크 오류: ${(e as Error).message}`);
      return;
    }
    revalidator.revalidate();
  };

  const submitting = submitFetcher.state !== "idle";

  return (
    <MockExamShell
      category="gs"
      width="wide"
      title={round.title}
      desc="종이 답안지를 페이지별로 사진(또는 PDF)으로 업로드하고, 각 페이지가 어느 문항에 해당하는지 매핑하세요."
      backLink={{ to: "/gs", label: "온라인 GS" }}
      headerRight={
        <div className="flex items-center gap-2.5">
          <Chip tone="primary">
            {LAW_SUBJECTS[round.subject]?.name ?? round.subject}
          </Chip>
          <Countdown deadlineMs={deadline} />
        </div>
      }
    >
      {round.descriptionMd ? (
        <div className="border-border bg-muted/40 mb-3 rounded-2xl border p-4">
          <p className="text-sm leading-relaxed whitespace-pre-line">
            {round.descriptionMd}
          </p>
        </div>
      ) : null}

      {/* 안내 배너 */}
      <div className="border-primary/15 bg-primary/[0.05] mb-3 flex flex-col gap-2.5 rounded-2xl border p-4 sm:flex-row sm:items-center">
        <FileTextIcon className="text-link size-5 shrink-0" />
        <p className="text-foreground min-w-0 flex-1 text-[13px] leading-relaxed">
          오프라인 답안지에 작성한 후 페이지별로 사진(JPG/PNG/WebP) 또는 PDF 를
          업로드합니다. 각 페이지를 칩으로 문항에 매핑하고 페이지마다{" "}
          <strong>판독 가능 확인</strong>을 채워야 제출할 수 있습니다.
        </p>
        {paperUrl ? (
          <Button
            asChild
            size="sm"
            variant="outline"
            className="shrink-0 rounded-full"
          >
            <a href={paperUrl} target="_blank" rel="noreferrer">
              <DownloadIcon className="size-3.5" /> 시험지 PDF
            </a>
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        {/* 좌측 — 문제 목록 (읽기) */}
        <aside>
          <div className="border-border bg-card sticky top-4 rounded-2xl border p-4">
            <p className="text-muted-foreground mb-2.5 font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
              문항 · {questions.length}개
            </p>
            <ul className="space-y-1.5">
              {questions.map((q) => {
                const mapped = mappedQuestionIds.has(q.questionId);
                return (
                  <li
                    key={q.questionId}
                    className={cn(
                      "rounded-xl border p-2.5",
                      mapped
                        ? "border-border bg-muted/40"
                        : "border-transparent bg-rose-500/[0.08]",
                    )}
                  >
                    <div className="mb-1 flex items-center gap-1.5">
                      <span
                        className={cn(
                          "text-xs font-extrabold",
                          mapped
                            ? "text-foreground"
                            : "text-rose-600 dark:text-rose-400",
                        )}
                      >
                        {q.title ?? `문 ${q.orderIndex + 1}`}
                      </span>
                      <span className="text-muted-foreground ml-auto font-mono text-[10px] font-bold tabular-nums">
                        {q.maxScore}점
                      </span>
                    </div>
                    <p className="text-muted-foreground line-clamp-3 font-serif text-xs leading-snug">
                      {q.bodyMd}
                    </p>
                    <p
                      className={cn(
                        "mt-1 text-[11px] font-bold",
                        mapped
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-600 dark:text-rose-400",
                      )}
                    >
                      {mapped ? "✓ 페이지 매핑됨" : "⚠ 아직 매핑 안 됨"}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>

        {/* 우측 — 페이지 슬롯 그리드 */}
        <section>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-muted-foreground font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
              답안지 페이지 · {pages.length}/{round.expectedPages}
            </p>
            <ProgressDots
              total={round.expectedPages}
              filled={pages.map((p) => p.pageNumber)}
              confirmed={pages
                .filter((p) => p.legibilityConfirmed)
                .map((p) => p.pageNumber)}
            />
          </div>
          <p className="text-muted-foreground mb-2.5 text-[11px] leading-relaxed">
            슬롯 좌상단 손잡이를 드래그해 다른 슬롯에 놓으면 페이지가 교환됩니다
            (빈 슬롯이면 이동). 슬롯 헤더의 ↳ 버튼으로 그 자리에 빈 페이지를
            끼워넣습니다 (이후 페이지가 한 칸씩 밀림).
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {slots.map((n) => (
              <PageSlot
                key={n}
                round={round}
                pageNumber={n}
                page={pageByNum.get(n) ?? null}
                questions={questions}
                onChange={handlePageChange}
                onSwap={onSwap}
                onInsertBefore={onInsertBefore}
              />
            ))}
          </div>
        </section>
      </div>

      {/* 제출 바 — sticky */}
      <submitFetcher.Form
        method="post"
        action="/api/gs/take"
        onSubmit={(e) => {
          if (!allReady) {
            e.preventDefault();
            return;
          }
          const warn =
            unmappedCount > 0
              ? `미매핑 문항 ${unmappedCount}건은 자동 채점에서 0점 처리됩니다.\n`
              : "";
          if (!confirm(`${warn}제출 후에는 수정할 수 없습니다. 제출하시겠습니까?`))
            e.preventDefault();
        }}
        // 모바일은 하단 탭바(~3.5rem) 위로 띄움 — 데스크톱은 bottom-4.
        className="sticky bottom-[calc(3.5rem+1rem+env(safe-area-inset-bottom))] mt-4 md:bottom-4"
      >
        <input type="hidden" name="intent" value="submit" />
        <input type="hidden" name="roundId" value={round.roundId} />
        <div
          data-testid="gs-submit"
          className="border-border bg-card/95 flex flex-col gap-3 rounded-2xl border p-4 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:gap-4"
        >
          <span
            className={cn(
              "inline-flex size-10 shrink-0 items-center justify-center rounded-xl",
              allReady
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : "bg-rose-500/15 text-rose-600 dark:text-rose-400",
            )}
          >
            {allReady ? (
              <CheckIcon className="size-5" />
            ) : (
              <AlertCircleIcon className="size-5" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-foreground font-semibold tracking-tight">
              {allReady
                ? unmappedCount > 0
                  ? `제출 가능 (미매핑 문항 ${unmappedCount}건은 0점 처리)`
                  : "제출 가능 — 모든 페이지 판독 확인 완료."
                : "제출 조건을 채워 주세요."}
            </p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {allReady
                ? `${pages.length}/${round.expectedPages} 페이지 업로드. 제출 후에는 답안 변경이 불가합니다.`
                : [
                    pages.length === 0 ? "답안 1페이지 이상 업로드" : "",
                    !withinPageLimit
                      ? `페이지 수 ${pages.length} > 최대 ${round.expectedPages}`
                      : "",
                    !allPagesConfirmed ? "모든 페이지 판독 가능 확인" : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
            </p>
            {submitFetcher.data?.error ? (
              <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">
                {submitFetcher.data.error}
              </p>
            ) : null}
          </div>
          <Button
            type="submit"
            disabled={!allReady || submitting}
            className="shrink-0 rounded-full bg-emerald-600 text-white hover:bg-emerald-600/90 disabled:bg-emerald-600/40"
          >
            <SendIcon className="size-4" />
            {submitting ? "제출 중..." : "응시 제출"}
          </Button>
        </div>
      </submitFetcher.Form>
    </MockExamShell>
  );
}

function Countdown({ deadlineMs }: { deadlineMs: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, deadlineMs - now);
  const hh = Math.floor(left / 3_600_000);
  const mm = Math.floor((left % 3_600_000) / 60_000);
  const ss = Math.floor((left % 60_000) / 1000);
  const fmt = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  const low = left < 5 * 60_000;
  const warn = left < 30 * 60_000;
  return (
    <div
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 font-mono text-sm font-bold tabular-nums",
        low
          ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
          : warn
            ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
            : "bg-primary/10 text-link",
      )}
    >
      <TimerIcon className="size-3.5" />
      {fmt}
    </div>
  );
}

function ProgressDots({
  total,
  filled,
  confirmed,
}: {
  total: number;
  filled: number[];
  confirmed: number[];
}) {
  const filledSet = new Set(filled);
  const confirmedSet = new Set(confirmed);
  return (
    <div
      className="flex flex-wrap gap-0.5"
      aria-label={`페이지 진척 ${filled.length}/${total}`}
    >
      {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
        <span
          key={n}
          title={`페이지 ${n}${confirmedSet.has(n) ? " (확인됨)" : filledSet.has(n) ? " (확인 필요)" : " (미업로드)"}`}
          className={cn(
            "size-2 rounded-full",
            confirmedSet.has(n)
              ? "bg-emerald-500"
              : filledSet.has(n)
                ? "bg-amber-500"
                : "bg-muted",
          )}
        />
      ))}
    </div>
  );
}

function PageSlot({
  round,
  pageNumber,
  page,
  questions,
  onChange,
  onSwap,
  onInsertBefore,
}: {
  round: GsRound;
  pageNumber: number;
  page: GsPage | null;
  questions: GsQuestion[];
  onChange: () => void;
  onSwap: (fromPage: number, toPage: number) => void | Promise<void>;
  onInsertBefore: (pageNumber: number) => void | Promise<void>;
}) {
  const [dragOver, setDragOver] = useState(false);
  const uploadFetcher = useFetcher<{ ok?: true; error?: string }>();
  const removeFetcher = useFetcher<{ ok?: true; error?: string }>();
  const confirmFetcher = useFetcher<{ ok?: true; error?: string }>();
  const mapFetcher = useFetcher<{ ok?: true; error?: string }>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  // PDF 다페이지 분할 상태 — 분할 중에는 progress 표시.
  const [splitProgress, setSplitProgress] = useState<{
    phase: "split" | "upload";
    cur: number;
    total: number;
  } | null>(null);

  // 낙관적 매핑 — fetcher 진행 중인 값 우선.
  const submittingMap = mapFetcher.formData?.get("questionIds");
  const mappedIds =
    submittingMap == null
      ? (page?.questionIds ?? [])
      : String(submittingMap)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
  const submittingConfirm = confirmFetcher.formData?.get("confirmed");
  const confirmed =
    submittingConfirm == null
      ? (page?.legibilityConfirmed ?? false)
      : submittingConfirm === "true";

  useEffect(() => {
    if (uploadFetcher.state === "idle" && uploadFetcher.data) {
      if (uploadFetcher.data.error) setError(uploadFetcher.data.error);
      else {
        setError(null);
        onChange();
      }
    }
  }, [uploadFetcher.state, uploadFetcher.data, onChange]);
  useEffect(() => {
    if (removeFetcher.state === "idle" && removeFetcher.data?.ok) onChange();
  }, [removeFetcher.state, removeFetcher.data, onChange]);
  useEffect(() => {
    if (confirmFetcher.state === "idle" && confirmFetcher.data?.ok) onChange();
  }, [confirmFetcher.state, confirmFetcher.data, onChange]);
  useEffect(() => {
    if (mapFetcher.state === "idle" && mapFetcher.data?.ok) onChange();
  }, [mapFetcher.state, mapFetcher.data, onChange]);

  const handleFile = async (file: File) => {
    setError(null);
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      setError("JPG/PNG/WebP/PDF 만 업로드할 수 있습니다.");
      return;
    }

    // PDF 다페이지 분할 — 페이지 수 > 1 이면 사용자에게 자동 분배 여부 확인.
    if (file.type === "application/pdf") {
      try {
        const { getPdfPageCount, splitPdfToJpegs } = await import(
          "~/features/gs/lib/pdf-split.client"
        );
        const numPages = await getPdfPageCount(file);
        if (numPages > 1) {
          const start = pageNumber;
          const end = start + numPages - 1;
          if (end > round.expectedPages) {
            setError(
              `이 PDF 는 ${numPages}페이지인데 슬롯 ${start}~${end} 가 필요합니다 ` +
                `(회차 최대 ${round.expectedPages}페이지). 시작 슬롯을 앞쪽으로 옮기거나 ` +
                `회차의 답안지 페이지 수를 늘려 주세요.`,
            );
            return;
          }
          const yes = window.confirm(
            `이 PDF 는 ${numPages}페이지입니다.\n\n` +
              `[확인] 슬롯 ${start}~${end} 에 페이지별 이미지로 자동 분배 (각 페이지 OCR 가능).\n` +
              `[취소] 슬롯 ${start} 에 PDF 그대로 첨부 (다페이지 PDF 1개로 1슬롯).`,
          );
          if (yes) {
            setSplitProgress({ phase: "split", cur: 0, total: numPages });
            const baseName = file.name.replace(/\.pdf$/i, "");
            let images: File[];
            try {
              images = await splitPdfToJpegs(file, baseName, 2, (cur, total) =>
                setSplitProgress({ phase: "split", cur, total }),
              );
            } catch (e) {
              setSplitProgress(null);
              setError(`PDF 분할 실패: ${(e as Error).message}`);
              return;
            }
            // 분할된 페이지를 순차 업로드.
            for (let i = 0; i < images.length; i++) {
              setSplitProgress({
                phase: "upload",
                cur: i + 1,
                total: images.length,
              });
              const result = await uploadOneRaw(start + i, images[i]);
              if (!result.ok) {
                setSplitProgress(null);
                setError(`페이지 ${start + i} 업로드 실패: ${result.error}`);
                onChange();
                return;
              }
            }
            setSplitProgress(null);
            onChange();
            return;
          }
          // confirm 거부 → fallthrough: PDF 그대로 단일 업로드.
        }
      } catch (e) {
        setError(`PDF 분석 실패: ${(e as Error).message}`);
        return;
      }
    }

    // 단일 파일 (이미지 또는 1페이지 PDF 또는 사용자가 PDF 그대로 선택).
    let width: number | undefined;
    let height: number | undefined;
    if (file.type.startsWith("image/")) {
      try {
        const dim = await readImageDimensions(file);
        width = dim.width;
        height = dim.height;
        if (width < 600 || height < 600) {
          setError(
            `이미지 해상도가 너무 낮습니다 (${width}x${height}). 1200x1600 이상 권장.`,
          );
          return;
        }
      } catch {
        setError("이미지를 읽을 수 없습니다.");
        return;
      }
    }

    const fd = new FormData();
    fd.set("intent", "upload-page");
    fd.set("roundId", round.roundId);
    fd.set("pageNumber", String(pageNumber));
    if (width != null) fd.set("width", String(width));
    if (height != null) fd.set("height", String(height));
    fd.set("file", file);
    uploadFetcher.submit(fd, {
      method: "post",
      action: "/api/gs/take",
      encType: "multipart/form-data",
    });
  };

  // 분할-분배용 단일 페이지 업로드 (plain fetch — useFetcher 가 슬롯 1개에 묶여 있어서 사용 불가).
  const uploadOneRaw = async (
    targetPage: number,
    file: File,
  ): Promise<{ ok: true } | { ok: false; error: string }> => {
    let width: number | undefined;
    let height: number | undefined;
    if (file.type.startsWith("image/")) {
      try {
        const dim = await readImageDimensions(file);
        width = dim.width;
        height = dim.height;
      } catch {
        return { ok: false, error: "이미지 메타 추출 실패" };
      }
    }
    const fd = new FormData();
    fd.set("intent", "upload-page");
    fd.set("roundId", round.roundId);
    fd.set("pageNumber", String(targetPage));
    if (width != null) fd.set("width", String(width));
    if (height != null) fd.set("height", String(height));
    fd.set("file", file);
    let res: Response;
    try {
      res = await fetch("/api/gs/take", { method: "POST", body: fd });
    } catch (e) {
      return { ok: false, error: `네트워크 오류: ${(e as Error).message}` };
    }
    let json: { error?: string; ok?: boolean } = {};
    try {
      json = await res.json();
    } catch {
      // ignore
    }
    if (!res.ok || json.error) {
      return { ok: false, error: json.error ?? `HTTP ${res.status}` };
    }
    return { ok: true };
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = "";
  };

  const onRemove = () => {
    if (!confirm(`페이지 ${pageNumber} 를 삭제하시겠습니까?`)) return;
    const fd = new FormData();
    fd.set("intent", "remove-page");
    fd.set("roundId", round.roundId);
    fd.set("pageNumber", String(pageNumber));
    removeFetcher.submit(fd, { method: "post", action: "/api/gs/take" });
  };

  const onToggleConfirm = (next: boolean) => {
    const fd = new FormData();
    fd.set("intent", "confirm-page");
    fd.set("roundId", round.roundId);
    fd.set("pageNumber", String(pageNumber));
    fd.set("confirmed", next ? "true" : "false");
    confirmFetcher.submit(fd, { method: "post", action: "/api/gs/take" });
  };

  const onToggleQuestion = (qid: string) => {
    const next = mappedIds.includes(qid)
      ? mappedIds.filter((x) => x !== qid)
      : [...mappedIds, qid];
    const fd = new FormData();
    fd.set("intent", "set-page-questions");
    fd.set("roundId", round.roundId);
    fd.set("pageNumber", String(pageNumber));
    fd.set("questionIds", next.join(","));
    mapFetcher.submit(fd, { method: "post", action: "/api/gs/take" });
  };

  const isSplitting = splitProgress != null;
  const isUploading = uploadFetcher.state !== "idle" || isSplitting;
  const empty = page == null;

  // 드래그 핸들러 — 채워진 슬롯에서 시작 가능, 빈 슬롯에도 drop 가능 (편도 이동).
  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("text/plain", String(pageNumber));
    e.dataTransfer.effectAllowed = "move";
  };
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (!dragOver) setDragOver(true);
  };
  const onDragLeave = () => {
    if (dragOver) setDragOver(false);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const raw = e.dataTransfer.getData("text/plain");
    const fromPage = Number(raw);
    if (!Number.isFinite(fromPage) || fromPage < 1 || fromPage === pageNumber)
      return;
    void onSwap(fromPage, pageNumber);
  };

  return (
    <div
      data-testid={`gs-page-slot-${pageNumber}`}
      data-empty={empty ? "true" : "false"}
      data-confirmed={confirmed ? "true" : "false"}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "bg-card flex min-h-[220px] flex-col overflow-hidden rounded-2xl border transition-colors",
        empty && "border-border bg-muted/30 border-2 border-dashed",
        page && !confirmed && "border-amber-400/70",
        page && confirmed && "border-emerald-400/70",
        dragOver && "ring-primary ring-2 ring-offset-1",
      )}
    >
      {/* 슬롯 헤더 */}
      <div
        className={cn(
          "flex items-center gap-1.5 px-3 py-2.5",
          !empty && "border-border/60 border-b",
        )}
      >
        {page ? (
          <button
            type="button"
            draggable
            data-testid={`gs-page-grip-${pageNumber}`}
            onDragStart={onDragStart}
            aria-label={`페이지 ${pageNumber} 드래그`}
            title="다른 슬롯으로 드래그해 페이지 교환"
            className="text-muted-foreground hover:text-foreground -ml-0.5 cursor-grab active:cursor-grabbing"
          >
            <GripVerticalIcon className="size-4" />
          </button>
        ) : null}
        <span className="text-foreground text-xs font-bold">
          페이지 {pageNumber}
        </span>
        {page ? (
          <Chip tone={confirmed ? "emerald" : "amber"}>
            {confirmed ? "판독 확인" : "확인 필요"}
          </Chip>
        ) : null}
        <button
          type="button"
          data-testid={`gs-page-insert-${pageNumber}`}
          onClick={() => onInsertBefore(pageNumber)}
          aria-label={`페이지 ${pageNumber} 자리에 빈 페이지 끼워넣기`}
          title={`페이지 ${pageNumber} 자리에 빈 페이지 끼워넣기 (이후 한 칸 밀림)`}
          className={cn(
            "text-muted-foreground hover:text-foreground",
            page ? "" : "ml-auto",
          )}
        >
          <CornerDownRightIcon className="size-3.5" />
        </button>
        {page ? (
          <button
            type="button"
            onClick={onRemove}
            disabled={removeFetcher.state !== "idle"}
            aria-label="페이지 삭제"
            className="text-muted-foreground ml-auto hover:text-rose-600 dark:hover:text-rose-400"
          >
            <Trash2Icon className="size-3.5" />
          </button>
        ) : null}
      </div>

      {/* 슬롯 본문 */}
      <div className="flex flex-1 flex-col">
        <input
          ref={fileInputRef}
          data-testid={`gs-page-file-input-${pageNumber}`}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={onPick}
          className="hidden"
        />
        {empty ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-6 text-center">
            <UploadIcon className="text-muted-foreground size-7" />
            <p className="text-muted-foreground text-xs font-semibold">
              {isSplitting
                ? splitProgress.phase === "split"
                  ? `분할 중… ${splitProgress.cur}/${splitProgress.total}`
                  : `업로드 중… ${splitProgress.cur}/${splitProgress.total}`
                : isUploading
                  ? "업로드 중…"
                  : "사진 또는 PDF"}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="rounded-full text-xs"
            >
              <UploadIcon className="size-3" /> 파일 선택
            </Button>
            {error ? (
              <p className="text-[11px] text-rose-600 dark:text-rose-400">
                {error}
              </p>
            ) : null}
          </div>
        ) : (
          <>
            <PagePreview attachment={page.attachment} />
            {isSplitting ? (
              <p className="text-muted-foreground px-3 text-[10px]">
                다페이지 PDF 를 슬롯 {pageNumber}부터{" "}
                {pageNumber + splitProgress.total - 1} 까지 분배 중…
              </p>
            ) : null}
            {error ? (
              <p className="px-3 text-[11px] text-rose-600 dark:text-rose-400">
                {error}
              </p>
            ) : null}
            {/* 문항 매핑 */}
            <div className="border-border/60 flex flex-wrap items-center gap-1 border-t px-3 py-2">
              <span className="text-muted-foreground text-[11px] font-medium">
                매핑:
              </span>
              {questions.map((q) => {
                const on = mappedIds.includes(q.questionId);
                return (
                  <button
                    key={q.questionId}
                    type="button"
                    data-testid={`gs-page-${pageNumber}-question-${q.orderIndex + 1}`}
                    data-on={on ? "true" : "false"}
                    onClick={() => onToggleQuestion(q.questionId)}
                    disabled={mapFetcher.state !== "idle"}
                    className={cn(
                      "inline-flex h-[22px] items-center gap-1 rounded-full px-2 text-[11px] font-semibold transition-colors",
                      on
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/70",
                    )}
                  >
                    {on ? <CheckIcon className="size-3" /> : null}
                    {q.title ?? `문 ${q.orderIndex + 1}`}
                  </button>
                );
              })}
              {mappedIds.length === 0 ? <Chip tone="coral">미매핑</Chip> : null}
            </div>
            {/* 판독 확인 체크박스 */}
            <label
              className={cn(
                "border-border/60 flex cursor-pointer items-start gap-1.5 border-t px-3 py-2.5",
                confirmed && "bg-emerald-500/[0.08]",
              )}
            >
              <input
                type="checkbox"
                data-testid={`gs-page-confirm-${pageNumber}`}
                checked={confirmed}
                onChange={(e) => onToggleConfirm(e.target.checked)}
                disabled={confirmFetcher.state !== "idle"}
                className="mt-0.5 size-3.5 accent-emerald-600"
              />
              <span className="text-[11px] leading-snug">
                <span
                  className={cn(
                    "font-semibold",
                    confirmed
                      ? "text-emerald-700 dark:text-emerald-400"
                      : "text-foreground",
                  )}
                >
                  {confirmed ? "판독 확인 완료." : "판독 가능 확인."}
                </span>{" "}
                <span className="text-muted-foreground">
                  풀사이즈로 확인했고 채점자(AI/강사)가 알아볼 수 있는 수준임.
                </span>
              </span>
            </label>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="text-muted-foreground hover:text-foreground border-border/60 inline-flex h-7 items-center justify-center gap-1 border-t text-[11px] font-medium transition-colors disabled:opacity-50"
            >
              <UploadIcon className="size-3" />
              {isUploading ? "교체 중…" : "교체"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function PagePreview({ attachment }: { attachment: GsPage["attachment"] }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const isImage = attachment.mime.startsWith("image/");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/gs/take?path=${encodeURIComponent(attachment.path)}`)
      .then((r) => r.json())
      .then((j: { url?: string }) => {
        if (!cancelled) setSignedUrl(j.url ?? null);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attachment.path]);

  return (
    <div className="space-y-1.5 p-3">
      <div className="flex flex-wrap items-center gap-1 text-[10px]">
        {isImage ? (
          <FileImageIcon className="text-muted-foreground size-3" />
        ) : (
          <FileTextIcon className="text-muted-foreground size-3" />
        )}
        <span className="flex-1 truncate font-medium">
          {attachment.fileName}
        </span>
        <OcrBadge attachment={attachment} />
      </div>
      {signedUrl && isImage ? (
        <a href={signedUrl} target="_blank" rel="noreferrer" className="block">
          <img
            src={signedUrl}
            alt={attachment.fileName}
            loading="lazy"
            className="bg-background border-border max-h-48 w-full rounded-lg border object-contain"
          />
        </a>
      ) : signedUrl && !isImage ? (
        <a
          href={signedUrl}
          target="_blank"
          rel="noreferrer"
          className="bg-muted/40 hover:bg-muted/60 border-border block rounded-lg border p-3 text-center text-[11px]"
        >
          PDF 풀사이즈 열기
        </a>
      ) : loading ? (
        <div className="bg-muted h-24 w-full animate-pulse rounded-lg" />
      ) : null}
      {attachment.ocrLevel ? (
        <p
          className={cn(
            "text-[10px]",
            attachment.ocrLevel === "good"
              ? "text-emerald-700 dark:text-emerald-400"
              : attachment.ocrLevel === "warn"
                ? "text-amber-700 dark:text-amber-400"
                : "text-rose-700 dark:text-rose-400",
          )}
        >
          OCR 한글 {attachment.ocrKoreanCharCount ?? 0}자 · 신뢰도{" "}
          {Math.round((attachment.ocrConfidence ?? 0) * 100)}%
        </p>
      ) : null}
    </div>
  );
}

function OcrBadge({ attachment }: { attachment: GsPage["attachment"] }) {
  if (!attachment.mime.startsWith("image/")) {
    return <Chip tone="outline">PDF</Chip>;
  }
  if (!attachment.ocrLevel) {
    return <Chip tone="outline">OCR 미검사</Chip>;
  }
  if (attachment.ocrLevel === "good") {
    return <Chip tone="emerald">판독 양호</Chip>;
  }
  if (attachment.ocrLevel === "warn") {
    return <Chip tone="amber">판독 경고</Chip>;
  }
  return <Chip tone="coral">판독 불가</Chip>;
}

async function readImageDimensions(
  file: File,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      URL.revokeObjectURL(url);
      resolve({ width: w, height: h });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image load failed"));
    };
    img.src = url;
  });
}
