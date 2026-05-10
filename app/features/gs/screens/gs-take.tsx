// 학생 GS 응시 화면 — 답안지를 페이지 슬롯에 업로드하고 페이지마다 어느 문항인지 매핑.
// 좌: 문제 목록(읽기). 우: N슬롯 페이지 그리드. 슬롯 = 빈 상태 또는 (썸네일 + 문항 매핑 + 판독 확인).

import {
  AlertCircleIcon,
  CheckIcon,
  DownloadIcon,
  FileImageIcon,
  FileTextIcon,
  TimerIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, data, redirect, useFetcher, useRevalidator } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Separator } from "~/core/components/ui/separator";
import makeServerClient from "~/core/lib/supa-client.server";
import { cn } from "~/core/lib/utils";
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
import { LAW_SUBJECTS } from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/gs-take";

export const meta: Route.MetaFunction = ({ data: loaderData }) => [
  {
    title: loaderData?.round
      ? `${loaderData.round.title} | Lidam Edu`
      : "GS 응시 | Lidam Edu",
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
    return redirect(`/gs/${roundId}`);
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
  const allReady = allQuestionsMapped && allPagesConfirmed;

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

  return (
    <div className="mx-auto w-full max-w-screen-xl px-5 py-6 md:px-10 md:py-8">
      <header className="mb-6 space-y-2">
        <Link
          to="/gs"
          className="text-muted-foreground inline-flex items-center gap-1 text-xs hover:underline"
        >
          ← 온라인 GS
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-bold tracking-tight md:text-2xl">
            {round.title}
          </h1>
          <Badge variant="secondary" className="text-[11px]">
            {LAW_SUBJECTS[round.subject]?.name ?? round.subject}
          </Badge>
        </div>
        <Countdown deadlineMs={deadline} />
        {round.descriptionMd ? (
          <Card className="bg-muted/40">
            <CardContent className="pt-4">
              <p className="text-sm whitespace-pre-line">{round.descriptionMd}</p>
            </CardContent>
          </Card>
        ) : null}
        <Card className="border-amber-300/60 bg-amber-50/40 dark:border-amber-700/40 dark:bg-amber-950/20">
          <CardContent className="text-amber-900 dark:text-amber-200 pt-4 text-xs leading-relaxed">
            오프라인 답안지에 작성한 후 페이지별로 사진(JPG/PNG/WebP) 또는 PDF 를
            업로드합니다. 각 페이지가 어느 문항에 해당하는지 칩으로 선택하고,
            페이지마다 <strong>판독 가능 확인</strong> 체크박스를 채워 주세요.
            모든 문항이 한 페이지 이상 매핑되고 모든 페이지가 판독 확인되어야
            제출할 수 있습니다.
          </CardContent>
        </Card>
        {paperUrl ? (
          <Card>
            <CardContent className="flex flex-wrap items-center gap-3 py-3">
              <FileTextIcon className="text-primary size-5" />
              <div className="flex-1">
                <p className="text-sm font-semibold">시험지 PDF</p>
                <p className="text-muted-foreground text-[11px]">
                  강사가 출제한 시험지를 다운로드해 답안지에 작성하세요.
                </p>
              </div>
              <Button asChild size="sm">
                <a href={paperUrl} target="_blank" rel="noreferrer">
                  <DownloadIcon className="size-4" /> 다운로드
                </a>
              </Button>
            </CardContent>
          </Card>
        ) : null}
      </header>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* 좌측 — 문제 목록 (읽기) */}
        <aside className="space-y-3">
          <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            문제 ({questions.length})
          </h2>
          {questions.map((q) => {
            const mapped = mappedQuestionIds.has(q.questionId);
            return (
              <Card
                key={q.questionId}
                className={cn(
                  !mapped && "border-rose-300 bg-rose-50/40 dark:border-rose-700/40 dark:bg-rose-950/20",
                )}
              >
                <CardContent className="space-y-1 py-3 text-xs">
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className="text-[10px]">
                      #{q.orderIndex + 1}
                    </Badge>
                    {q.title ? (
                      <span className="font-semibold">{q.title}</span>
                    ) : null}
                    <Badge variant="secondary" className="ml-auto text-[10px]">
                      {q.maxScore}점
                    </Badge>
                  </div>
                  <p className="text-muted-foreground line-clamp-3 font-serif leading-snug">
                    {q.bodyMd}
                  </p>
                  <p
                    className={cn(
                      "text-[10px] font-semibold",
                      mapped
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-rose-700 dark:text-rose-400",
                    )}
                  >
                    {mapped ? "✓ 페이지 매핑됨" : "⚠ 매핑된 페이지 없음"}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </aside>

        {/* 우측 — 페이지 슬롯 그리드 */}
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              답안지 페이지 ({pages.length} / {round.expectedPages})
            </h2>
            <ProgressDots
              total={round.expectedPages}
              filled={pages.map((p) => p.pageNumber)}
              confirmed={pages.filter((p) => p.legibilityConfirmed).map((p) => p.pageNumber)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {slots.map((n) => (
              <PageSlot
                key={n}
                round={round}
                pageNumber={n}
                page={pageByNum.get(n) ?? null}
                questions={questions}
                onChange={() => revalidator.revalidate()}
              />
            ))}
          </div>
        </section>
      </div>

      <Separator className="my-6" />

      <Card>
        <CardContent className="space-y-3 pt-6">
          {allReady ? (
            <p className="text-emerald-700 dark:text-emerald-400 text-sm font-semibold inline-flex items-center gap-1">
              <CheckIcon className="size-4" /> 모든 문항이 매핑되고 모든 페이지가 판독
              확인되었습니다.
            </p>
          ) : (
            <p className="text-muted-foreground text-sm inline-flex items-start gap-1">
              <AlertCircleIcon className="size-4 mt-0.5" />
              <span>
                {!allQuestionsMapped
                  ? "모든 문항에 한 페이지 이상을 매핑해 주세요. "
                  : ""}
                {!allPagesConfirmed
                  ? "모든 페이지의 판독 가능 여부를 확인해 주세요."
                  : ""}
              </span>
            </p>
          )}
          {submitFetcher.data?.error ? (
            <p className="text-rose-600 text-xs">{submitFetcher.data.error}</p>
          ) : null}
          <submitFetcher.Form
            method="post"
            action="/api/gs/take"
            onSubmit={(e) => {
              if (!allReady) {
                e.preventDefault();
                return;
              }
              if (!confirm("제출 후에는 수정할 수 없습니다. 제출할까요?"))
                e.preventDefault();
            }}
          >
            <input type="hidden" name="intent" value="submit" />
            <input type="hidden" name="roundId" value={round.roundId} />
            <Button
              type="submit"
              disabled={!allReady || submitFetcher.state !== "idle"}
              className="w-full"
              data-testid="gs-submit"
            >
              {submitFetcher.state !== "idle" ? "제출 중..." : "응시 제출"}
            </Button>
          </submitFetcher.Form>
        </CardContent>
      </Card>
    </div>
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
  const tone =
    left < 5 * 60_000
      ? "text-rose-600"
      : left < 30 * 60_000
        ? "text-amber-600"
        : "text-foreground";
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-sm font-mono",
        tone,
      )}
    >
      <TimerIcon className="size-4" />
      남은 시간 <span className="tabular-nums font-bold">{fmt}</span>
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
    <div className="flex flex-wrap gap-0.5" aria-label={`페이지 진척 ${filled.length}/${total}`}>
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
}: {
  round: GsRound;
  pageNumber: number;
  page: GsPage | null;
  questions: GsQuestion[];
  onChange: () => void;
}) {
  const uploadFetcher = useFetcher<{ ok?: true; error?: string }>();
  const removeFetcher = useFetcher<{ ok?: true; error?: string }>();
  const confirmFetcher = useFetcher<{ ok?: true; error?: string }>();
  const mapFetcher = useFetcher<{ ok?: true; error?: string }>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  // 낙관적 매핑 — fetcher 진행 중인 값 우선.
  const submittingMap = mapFetcher.formData?.get("questionIds");
  const mappedIds =
    submittingMap == null
      ? page?.questionIds ?? []
      : String(submittingMap)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
  const submittingConfirm = confirmFetcher.formData?.get("confirmed");
  const confirmed =
    submittingConfirm == null
      ? page?.legibilityConfirmed ?? false
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

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = "";
  };

  const onRemove = () => {
    if (!confirm(`페이지 ${pageNumber} 를 삭제할까요?`)) return;
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

  const isUploading = uploadFetcher.state !== "idle";
  const empty = page == null;

  return (
    <Card
      className={cn(
        "relative overflow-hidden",
        empty && "border-dashed",
        page && !confirmed && "border-amber-400/70",
        page && confirmed && "border-emerald-400/70",
      )}
    >
      <CardHeader className="flex-row items-center gap-2 space-y-0 px-4 py-2">
        <Badge variant="outline" className="text-[10px]">
          페이지 {pageNumber}
        </Badge>
        {page ? (
          confirmed ? (
            <Badge className="bg-emerald-600 text-white text-[10px] hover:bg-emerald-600">
              확인됨
            </Badge>
          ) : (
            <Badge className="bg-amber-500 text-white text-[10px] hover:bg-amber-500">
              확인 필요
            </Badge>
          )
        ) : null}
        {page ? (
          <button
            type="button"
            onClick={onRemove}
            disabled={removeFetcher.state !== "idle"}
            aria-label="페이지 삭제"
            className="text-muted-foreground hover:text-rose-600 ml-auto"
          >
            <Trash2Icon className="size-3.5" />
          </button>
        ) : null}
      </CardHeader>
      <Separator />
      <CardContent className="space-y-2 p-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={onPick}
          className="hidden"
        />
        {empty ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="w-full h-24 border-dashed text-xs"
          >
            <UploadIcon className="size-4" />
            {isUploading ? "업로드 중…" : "사진/PDF 업로드"}
          </Button>
        ) : (
          <PagePreview attachment={page.attachment} />
        )}
        {error ? <p className="text-rose-600 text-[11px]">{error}</p> : null}
        {!empty ? (
          <>
            <div>
              <p className="text-muted-foreground mb-1 text-[10px] font-semibold tracking-wide uppercase">
                이 페이지가 해당하는 문항
              </p>
              <div className="flex flex-wrap gap-1">
                {questions.map((q) => {
                  const on = mappedIds.includes(q.questionId);
                  return (
                    <button
                      key={q.questionId}
                      type="button"
                      onClick={() => onToggleQuestion(q.questionId)}
                      disabled={mapFetcher.state !== "idle"}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] transition",
                        on
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {on ? <CheckIcon className="size-3" /> : null}
                      {q.title ?? `문 ${q.orderIndex + 1}`}
                    </button>
                  );
                })}
              </div>
              {mappedIds.length === 0 ? (
                <p className="text-muted-foreground mt-1 text-[10px] italic">
                  매핑되지 않은 페이지 — 메모/여백으로 처리됩니다.
                </p>
              ) : null}
            </div>
            <label className="flex items-start gap-1.5 cursor-pointer rounded-md border bg-background p-2">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => onToggleConfirm(e.target.checked)}
                disabled={confirmFetcher.state !== "idle"}
                className="mt-0.5 size-3.5"
              />
              <span className="text-[10px] leading-snug">
                <span className="font-semibold">판독 가능 확인.</span>{" "}
                <span className="text-muted-foreground">
                  풀사이즈로 확인했고 글씨가 채점자(AI/강사)가 알아볼 수
                  있는 수준임.
                </span>
              </span>
            </label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="w-full h-7 text-[10px]"
            >
              <UploadIcon className="size-3" />
              {isUploading ? "교체 중…" : "교체"}
            </Button>
          </>
        ) : null}
      </CardContent>
    </Card>
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
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1 text-[10px]">
        {isImage ? (
          <FileImageIcon className="text-muted-foreground size-3" />
        ) : (
          <FileTextIcon className="text-muted-foreground size-3" />
        )}
        <span className="flex-1 truncate font-medium">{attachment.fileName}</span>
        <OcrBadge attachment={attachment} />
      </div>
      {signedUrl && isImage ? (
        <a href={signedUrl} target="_blank" rel="noreferrer" className="block">
          <img
            src={signedUrl}
            alt={attachment.fileName}
            loading="lazy"
            className="bg-background w-full rounded border object-contain max-h-48"
          />
        </a>
      ) : signedUrl && !isImage ? (
        <a
          href={signedUrl}
          target="_blank"
          rel="noreferrer"
          className="bg-muted/40 block rounded border p-3 text-center text-[11px] hover:bg-muted/60"
        >
          PDF 풀사이즈 열기
        </a>
      ) : loading ? (
        <div className="bg-muted h-24 w-full animate-pulse rounded" />
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
    return (
      <Badge variant="outline" className="text-[9px]">
        PDF
      </Badge>
    );
  }
  if (!attachment.ocrLevel) {
    return (
      <Badge variant="outline" className="text-[9px]">
        OCR 미검사
      </Badge>
    );
  }
  if (attachment.ocrLevel === "good") {
    return (
      <Badge className="bg-emerald-600 text-white text-[9px] hover:bg-emerald-600">
        양호
      </Badge>
    );
  }
  if (attachment.ocrLevel === "warn") {
    return (
      <Badge className="bg-amber-500 text-white text-[9px] hover:bg-amber-500">
        주의
      </Badge>
    );
  }
  return (
    <Badge className="bg-rose-600 text-white text-[9px] hover:bg-rose-600">
      부족
    </Badge>
  );
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
