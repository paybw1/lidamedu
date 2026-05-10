// 학생 GS 응시 화면 — 오프라인에 답안지를 작성하고, 사진/PDF 업로드 후 판독 자가확인 → 제출.

import {
  AlertCircleIcon,
  CheckIcon,
  ClockIcon,
  EyeIcon,
  FileImageIcon,
  FileTextIcon,
  TimerIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Form,
  Link,
  data,
  redirect,
  useFetcher,
  useNavigate,
  useRevalidator,
} from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Separator } from "~/core/components/ui/separator";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  type GsAnswerRecord,
  type GsAttachment,
  type GsQuestion,
  type GsRound,
  getGsRound,
  getOrCreateOwnSubmission,
  getOwnSubmission,
  listAnswersForSubmission,
  listGsQuestions,
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

  // 응시 가능 시간 검증.
  const now = Date.now();
  const start = new Date(round.startAt).getTime();
  const end = new Date(round.endAt).getTime();
  if (round.status !== "published" && round.status !== "closed") {
    throw data("이 회차는 아직 공개되지 않았습니다.", { status: 403 });
  }
  if (now < start) {
    throw data("아직 응시 시작 시각이 아닙니다.", { status: 403 });
  }
  // 종료/closed 라도 이미 응시 시작한 경우 답안 수정 가능 — 단, submitted_at 없을 때.

  // 이미 제출된 응시는 결과 페이지 (구현 예정) 로 redirect — 우선은 응시 화면 read-only 표기.
  const existing = await getOwnSubmission(client, user.id, roundId);
  if (existing?.submittedAt) {
    return redirect(`/gs/${roundId}`);
  }
  if (now > end && !existing) {
    throw data("응시 종료 시각이 지났습니다.", { status: 403 });
  }

  const submission = await getOrCreateOwnSubmission(client, user.id, roundId);
  const [questions, answers] = await Promise.all([
    listGsQuestions(client, roundId),
    listAnswersForSubmission(client, submission.submissionId),
  ]);

  return { round, submission, questions, answers };
}

export default function GsTake({ loaderData }: Route.ComponentProps) {
  const { round, submission, questions, answers } = loaderData;
  const submitFetcher = useFetcher<{ error?: string; ok?: true }>();
  const revalidator = useRevalidator();

  // 답안을 questionId 키로 매핑.
  const answerByQ = useMemo(
    () => new Map(answers.map((a) => [a.questionId, a])),
    [answers],
  );

  const allReady = useMemo(() => {
    return questions.every((q) => {
      const a = answerByQ.get(q.questionId);
      return a && a.attachments.length > 0 && a.legibilityConfirmed;
    });
  }, [questions, answerByQ]);

  // 응시 종료 카운트다운 — round.endAt 또는 (started_at + duration_min) 중 빠른 것.
  const deadline = useMemo(() => {
    const endByRound = new Date(round.endAt).getTime();
    const endByDuration =
      new Date(submission.startedAt).getTime() + round.durationMin * 60_000;
    return Math.min(endByRound, endByDuration);
  }, [round.endAt, submission.startedAt, round.durationMin]);

  return (
    <div className="mx-auto w-full max-w-screen-md px-5 py-6 md:px-10 md:py-8">
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
            오프라인 답안지에 작성한 후 사진(JPG/PNG/WebP) 또는 PDF 로 업로드합니다.
            업로드 후 <strong>풀사이즈 미리보기</strong> 로 본인의 글씨가 또렷하게
            판독 가능한지 확인하고, 각 문항의 <strong>"판독 가능 확인"</strong>{" "}
            체크박스를 모두 체크해야 제출할 수 있습니다.
          </CardContent>
        </Card>
      </header>

      <div className="space-y-4">
        {questions.map((q) => (
          <QuestionCard
            key={q.questionId}
            round={round}
            question={q}
            answer={answerByQ.get(q.questionId) ?? null}
            onChange={() => revalidator.revalidate()}
          />
        ))}
      </div>

      {questions.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          등록된 문항이 없습니다.
        </p>
      ) : null}

      <Separator className="my-6" />

      <Card>
        <CardContent className="space-y-3 pt-6">
          {allReady ? (
            <p className="text-emerald-700 dark:text-emerald-400 text-sm font-semibold inline-flex items-center gap-1">
              <CheckIcon className="size-4" /> 모든 문항이 준비되었습니다.
            </p>
          ) : (
            <p className="text-muted-foreground text-sm inline-flex items-center gap-1">
              <AlertCircleIcon className="size-4" /> 모든 문항에 파일을 올리고
              판독 확인을 해 주세요.
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
  const tone = left < 5 * 60_000 ? "text-rose-600" : left < 30 * 60_000 ? "text-amber-600" : "text-foreground";
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

function QuestionCard({
  round,
  question,
  answer,
  onChange,
}: {
  round: GsRound;
  question: GsQuestion;
  answer: GsAnswerRecord | null;
  onChange: () => void;
}) {
  const uploadFetcher = useFetcher<{ ok?: true; error?: string }>();
  const removeFetcher = useFetcher<{ ok?: true; error?: string }>();
  const confirmFetcher = useFetcher<{ ok?: true; error?: string }>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 답안이 바뀌면 (revalidate 후) 자가확인 fetcher 의 낙관 값 표시 우선.
  const submittingConfirm = confirmFetcher.formData?.get("confirmed");
  const confirmed =
    submittingConfirm == null
      ? (answer?.legibilityConfirmed ?? false)
      : submittingConfirm === "true";

  // 업로드 fetcher 완료 시 revalidate.
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

  const handleFile = async (file: File) => {
    setError(null);
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      setError("JPG/PNG/WebP/PDF 만 업로드할 수 있습니다.");
      return;
    }

    // 이미지면 클라이언트 해상도 추출.
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
    fd.set("intent", "upload");
    fd.set("roundId", round.roundId);
    fd.set("questionId", question.questionId);
    if (width != null) fd.set("width", String(width));
    if (height != null) fd.set("height", String(height));
    fd.set("file", file);
    setUploading(true);
    uploadFetcher.submit(fd, {
      method: "post",
      action: "/api/gs/take",
      encType: "multipart/form-data",
    });
    setUploading(false);
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = "";
  };

  const onRemove = (path: string) => {
    if (!confirm("이 파일을 삭제할까요?")) return;
    const fd = new FormData();
    fd.set("intent", "remove");
    fd.set("roundId", round.roundId);
    fd.set("questionId", question.questionId);
    fd.set("path", path);
    removeFetcher.submit(fd, {
      method: "post",
      action: "/api/gs/take",
    });
  };

  const onToggleConfirm = (next: boolean) => {
    const fd = new FormData();
    fd.set("intent", "confirm");
    fd.set("roundId", round.roundId);
    fd.set("questionId", question.questionId);
    fd.set("confirmed", next ? "true" : "false");
    confirmFetcher.submit(fd, {
      method: "post",
      action: "/api/gs/take",
    });
  };

  const attachments = answer?.attachments ?? [];
  const hasFiles = attachments.length > 0;
  const ocrSummary = useMemo(() => {
    const imgAtts = attachments.filter((a) => a.mime.startsWith("image/"));
    if (imgAtts.length === 0) return null;
    const checked = imgAtts.filter((a) => a.ocrLevel != null);
    if (checked.length === 0) return { state: "unchecked" as const };
    const bad = checked.filter((a) => a.ocrLevel === "bad").length;
    const warn = checked.filter((a) => a.ocrLevel === "warn").length;
    if (bad > 0) return { state: "bad" as const, bad };
    if (warn > 0) return { state: "warn" as const, warn };
    return { state: "good" as const };
  }, [attachments]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-[10px]">
            #{question.orderIndex + 1}
          </Badge>
          {question.title ? (
            <h2 className="font-semibold">{question.title}</h2>
          ) : null}
          <Badge variant="secondary" className="ml-auto text-[10px]">
            {question.maxScore}점
          </Badge>
        </div>
      </CardHeader>
      <Separator />
      <CardContent className="space-y-4 pt-4">
        <div className="rounded-md border bg-muted/30 p-3">
          <p className="font-serif text-sm leading-relaxed whitespace-pre-line">
            {question.bodyMd}
          </p>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              답안 첨부
            </p>
            <span className="text-muted-foreground text-[11px]">
              {attachments.length} / 6 · JPG·PNG·WebP·PDF · 10MB 이하
            </span>
          </div>
          <div className="space-y-2">
            {attachments.map((att) => (
              <AttachmentPreview
                key={att.path}
                attachment={att}
                onRemove={() => onRemove(att.path)}
                disabled={removeFetcher.state !== "idle"}
              />
            ))}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={onPick}
              className="hidden"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={
                uploading ||
                uploadFetcher.state !== "idle" ||
                attachments.length >= 6
              }
              className="w-full"
            >
              <UploadIcon className="size-4" />
              {uploadFetcher.state !== "idle" ? "업로드 중…" : "파일 선택"}
            </Button>
            {error ? (
              <p className="text-rose-600 text-xs">{error}</p>
            ) : null}
          </div>
        </div>

        {hasFiles ? (
          <div className="space-y-2">
            {ocrSummary?.state === "bad" ? (
              <div className="border-rose-300 bg-rose-50 dark:border-rose-700/40 dark:bg-rose-950/20 rounded-md border p-3">
                <p className="text-rose-800 dark:text-rose-200 text-xs font-semibold">
                  ⚠️ AI/강사가 판독하기 어려운 파일이 포함되어 있습니다.
                </p>
                <p className="text-rose-700 dark:text-rose-300 mt-1 text-[11px]">
                  채점은 손글씨를 인식한 텍스트 기준으로 일부 자동화될 예정입니다.
                  판독률이 낮으면 점수에 불이익이 있을 수 있으니 가급적 다시 촬영/스캔해
                  올려 주세요. 그래도 진행하시려면 아래 체크박스를 직접 확인해 주세요.
                </p>
              </div>
            ) : ocrSummary?.state === "warn" ? (
              <div className="border-amber-300 bg-amber-50 dark:border-amber-700/40 dark:bg-amber-950/20 rounded-md border p-3 text-[11px] text-amber-800 dark:text-amber-200">
                일부 첨부의 판독이 흐릿합니다. 가능하면 더 밝은 곳에서 다시 촬영해
                보세요.
              </div>
            ) : ocrSummary?.state === "good" ? (
              <div className="border-emerald-300 bg-emerald-50 dark:border-emerald-700/40 dark:bg-emerald-950/20 rounded-md border p-2 text-[11px] text-emerald-800 dark:text-emerald-300">
                ✓ 모든 첨부의 판독률이 양호합니다.
              </div>
            ) : ocrSummary?.state === "unchecked" ? (
              <div className="bg-muted/40 rounded-md border p-2 text-[11px] text-muted-foreground">
                자동 판독 검사가 실행되지 않았습니다 (서버 OCR 미설정). 풀사이즈
                미리보기로 본인이 직접 확인해 주세요.
              </div>
            ) : null}
            <div className="rounded-md border bg-background p-3">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => onToggleConfirm(e.target.checked)}
                  disabled={confirmFetcher.state !== "idle"}
                  className="mt-0.5 size-4"
                />
                <span className="text-sm leading-snug">
                  <span className="font-semibold">판독 가능 확인.</span>{" "}
                  <span className="text-muted-foreground text-xs">
                    업로드한 파일을 모두 풀사이즈로 미리보기하여 확인했고, 본인의
                    글씨가 채점자(AI/강사) 가 알아볼 수 있는 수준임을 확인합니다.
                  </span>
                </span>
              </label>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function AttachmentPreview({
  attachment,
  onRemove,
  disabled,
}: {
  attachment: GsAttachment;
  onRemove: () => void;
  disabled: boolean;
}) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const isImage = attachment.mime.startsWith("image/");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(
      `/api/gs/take?path=${encodeURIComponent(attachment.path)}`,
    )
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
    <div className="rounded-md border bg-muted/20 p-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {isImage ? (
          <FileImageIcon className="text-muted-foreground size-3.5" />
        ) : (
          <FileTextIcon className="text-muted-foreground size-3.5" />
        )}
        <span className="flex-1 truncate font-medium">{attachment.fileName}</span>
        <OcrBadge attachment={attachment} />
        <span className="text-muted-foreground tabular-nums">
          {Math.round(attachment.size / 1024)}KB
          {attachment.width && attachment.height
            ? ` · ${attachment.width}x${attachment.height}`
            : ""}
        </span>
        {signedUrl ? (
          <a
            href={signedUrl}
            target="_blank"
            rel="noreferrer"
            className="text-primary inline-flex items-center gap-0.5 hover:underline"
          >
            <EyeIcon className="size-3" /> 풀사이즈
          </a>
        ) : null}
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          aria-label="파일 삭제"
          className="text-muted-foreground hover:text-rose-600 disabled:opacity-50"
        >
          <Trash2Icon className="size-3.5" />
        </button>
      </div>
      {attachment.ocrLevel ? (
        <p
          className={cn(
            "mt-1 text-[11px]",
            attachment.ocrLevel === "good"
              ? "text-emerald-700 dark:text-emerald-400"
              : attachment.ocrLevel === "warn"
                ? "text-amber-700 dark:text-amber-400"
                : "text-rose-700 dark:text-rose-400",
          )}
        >
          OCR 인식: 한글 {attachment.ocrKoreanCharCount ?? 0}자 · 신뢰도{" "}
          {Math.round((attachment.ocrConfidence ?? 0) * 100)}%
          {attachment.ocrLevel === "bad"
            ? " — 판독률이 낮습니다. 더 밝은 곳에서 정자로 또렷하게 다시 촬영하시거나 스캔본 사용을 권합니다. 채점 시 AI/강사가 알아보기 어려울 수 있습니다."
            : attachment.ocrLevel === "warn"
              ? " — 판독은 가능하나 일부 글자가 흐릿합니다."
              : " — 양호합니다."}
        </p>
      ) : null}
      {isImage && signedUrl ? (
        <img
          src={signedUrl}
          alt={attachment.fileName}
          loading="lazy"
          className="mt-2 max-h-[480px] w-full rounded border object-contain bg-background"
        />
      ) : isImage && loading ? (
        <div className="bg-muted mt-2 h-32 w-full animate-pulse rounded" />
      ) : null}
    </div>
  );
}

function OcrBadge({ attachment }: { attachment: GsAttachment }) {
  if (!attachment.mime.startsWith("image/")) {
    return (
      <Badge variant="outline" className="text-[10px]">
        PDF
      </Badge>
    );
  }
  if (!attachment.ocrLevel) {
    return (
      <Badge variant="outline" className="text-[10px]">
        OCR 미검사
      </Badge>
    );
  }
  if (attachment.ocrLevel === "good") {
    return (
      <Badge className="bg-emerald-600 text-white text-[10px] hover:bg-emerald-600">
        판독 양호
      </Badge>
    );
  }
  if (attachment.ocrLevel === "warn") {
    return (
      <Badge className="bg-amber-500 text-white text-[10px] hover:bg-amber-500">
        판독 주의
      </Badge>
    );
  }
  return (
    <Badge className="bg-rose-600 text-white text-[10px] hover:bg-rose-600">
      판독 부족
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
