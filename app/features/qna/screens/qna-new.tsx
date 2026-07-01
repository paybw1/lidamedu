import {
  CheckCircle2Icon,
  MessageCircleQuestionIcon,
  SearchIcon,
  SendIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, redirect, useFetcher, useNavigate } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { Textarea } from "~/core/components/ui/textarea";
import { Chip } from "~/features/community/components/community-ui";
import { CommunityShell } from "~/features/community/components/community-shell";
import makeServerClient from "~/core/lib/supa-client.server";

import {
  QNA_SUBJECTS,
  QNA_SUBJECT_LABEL,
  QNA_TARGET_LABEL,
  qnaTargetTypeSchema,
  type QnaTargetType,
} from "../labels";
import { resolveTargetDisplay } from "../lib/target-display.server";

import type { Route } from "./+types/qna-new";

export const meta: Route.MetaFunction = () => [
  { title: "새 Q&A 질문 | 리담변리사학원" },
];

// 대상 칩 색 — 조문(primary) / 판례(violet) / 문제(amber).
const TARGET_TONE: Record<
  QnaTargetType,
  "primary" | "violet" | "amber" | "emerald" | "neutral"
> = {
  article: "primary",
  case: "violet",
  problem: "amber",
  study_method: "emerald",
  general: "neutral",
};

type TargetDisplay = Awaited<ReturnType<typeof resolveTargetDisplay>>;

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    throw redirect("/login");
  }

  const targetTypeRaw = url.searchParams.get("targetType");

  // 공부방법 — 대상 콘텐츠 없이 과목만 선택해 작성(Q&A 화면에서 바로 질문).
  if (targetTypeRaw === "study_method") {
    return { mode: "study_method" as const };
  }

  const targetTypeParse = qnaTargetTypeSchema.safeParse(targetTypeRaw);
  const targetIdRaw = url.searchParams.get("targetId");
  const targetId =
    targetIdRaw && /^[0-9a-f-]{36}$/i.test(targetIdRaw) ? targetIdRaw : null;

  // 대상(조문/판례/문제) 없이 진입한 경우 — 에러 대신 안내(어떤 경로로 와도 안 깨지게).
  if (
    !targetTypeParse.success ||
    targetTypeParse.data === "study_method" ||
    !targetId
  ) {
    return { mode: "none" as const };
  }

  const target = await resolveTargetDisplay(
    client,
    targetTypeParse.data,
    targetId,
  );

  // 뷰어 '질문하기'가 넘긴 초안(옵션) — 본문에 프리필(자동 전송 X).
  const seedRaw = url.searchParams.get("seed") ?? "";
  const seed = seedRaw.slice(0, 1000);

  return {
    mode: "content" as const,
    targetType: targetTypeParse.data,
    targetId,
    target,
    seed,
  };
}

export default function QnaNew({ loaderData }: Route.ComponentProps) {
  if (loaderData.mode === "study_method") {
    return <QnaForm mode="study_method" targetType="study_method" />;
  }
  if (loaderData.mode === "none") {
    return <QnaTargetPicker />;
  }
  return (
    <QnaForm
      mode="content"
      targetType={loaderData.targetType}
      targetId={loaderData.targetId}
      target={loaderData.target}
      seed={loaderData.seed}
    />
  );
}

// 커뮤니티 진입(대상 미지정) — 대상을 식별자로 특정해 표준 질문 URL 로 이동.
//   조문=과목+조문번호 / 판례=판례번호 / 문제=과목+차수+년도+번호.
//   해석 성공 시 /qna/new?targetType&targetId 로 이동 → 기존 content 폼이 인수(상세패널과 등가).
const PICKER_KINDS = [
  { key: "article", label: "조문" },
  { key: "case", label: "판례" },
  { key: "problem", label: "문제" },
  { key: "study_method", label: "공부방법" },
] as const;
type PickerKind = (typeof PICKER_KINDS)[number]["key"];

// 조문/판례/문제 대상은 법률과목만.
const LAW_SUBJECT_OPTIONS = [
  "patent",
  "trademark",
  "design",
  "civil",
  "civil-procedure",
] as const;

// 문제 출처 — 기출/기출변형/예상.
const PROBLEM_ORIGIN_OPTIONS = [
  { key: "past_exam", label: "기출" },
  { key: "past_exam_variant", label: "기출변형" },
  { key: "expected", label: "예상" },
] as const;
type ProblemOriginKey = (typeof PROBLEM_ORIGIN_OPTIONS)[number]["key"];

interface ResolveResult {
  ok: boolean;
  targetType?: string;
  targetId?: string;
  label?: string;
  error?: string;
}

function QnaTargetPicker() {
  const navigate = useNavigate();
  const resolveFetcher = useFetcher<ResolveResult>();
  const [kind, setKind] = useState<PickerKind>("article");
  const [subject, setSubject] = useState<string>("patent");
  const [articleNumber, setArticleNumber] = useState("");
  const [caseNumber, setCaseNumber] = useState("");
  const [examRound, setExamRound] = useState<"first" | "second">("first");
  const [origin, setOrigin] = useState<ProblemOriginKey>("past_exam");
  const [year, setYear] = useState("");
  const [problemNumber, setProblemNumber] = useState("");

  const resolving = resolveFetcher.state !== "idle";
  const notFound =
    resolveFetcher.state === "idle" &&
    resolveFetcher.data != null &&
    resolveFetcher.data.ok === false;

  // 해석 성공 → 표준 content URL 로 이동(기존 폼이 대상 칩+제목+본문 인수).
  useEffect(() => {
    const d = resolveFetcher.data;
    if (d && d.ok && d.targetType && d.targetId) {
      navigate(
        `/qna/new?targetType=${d.targetType}&targetId=${d.targetId}`,
        { viewTransition: true },
      );
    }
  }, [resolveFetcher.data, navigate]);

  const canSubmit =
    kind === "article"
      ? Boolean(subject && articleNumber.trim())
      : kind === "case"
        ? Boolean(caseNumber.trim())
        : kind === "problem"
          ? Boolean(subject && year.trim() && problemNumber.trim())
          : true;

  const onSubmit = () => {
    if (kind === "study_method") {
      navigate("/qna/new?targetType=study_method", { viewTransition: true });
      return;
    }
    const p = new URLSearchParams();
    if (kind === "article") {
      p.set("type", "article");
      p.set("subject", subject);
      p.set("articleNumber", articleNumber.trim());
    } else if (kind === "case") {
      p.set("type", "case");
      p.set("caseNumber", caseNumber.trim());
    } else {
      p.set("type", "problem");
      p.set("subject", subject);
      p.set("examRound", examRound);
      p.set("origin", origin);
      p.set("year", year.trim());
      p.set("problemNumber", problemNumber.trim());
    }
    resolveFetcher.load(`/api/qna/target-resolve?${p.toString()}`);
  };

  const subjectSelect = (
    <label className="block">
      <span className="text-muted-foreground mb-1.5 block font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
        과목
      </span>
      <select
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
      >
        {LAW_SUBJECT_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {QNA_SUBJECT_LABEL[s]}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <CommunityShell
      category="qna"
      title="새 질문"
      desc="조문·판례·문제를 특정하거나, 공부방법을 골라 질문하면 AI/강사가 답변합니다."
      backLink={{ to: "/qna", label: "Q&A 목록" }}
      width="narrow"
    >
      <div className="border-border bg-card rounded-2xl border p-5 shadow-sm md:p-6">
        {/* 대상 유형 */}
        <div className="mb-5">
          <span className="text-muted-foreground mb-1.5 block font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
            질문 대상
          </span>
          <div className="flex flex-wrap gap-1.5">
            {PICKER_KINDS.map((k) => (
              <button
                key={k.key}
                type="button"
                onClick={() => setKind(k.key)}
                className={
                  kind === k.key
                    ? "bg-primary text-primary-foreground rounded-full px-3.5 py-1.5 text-sm font-semibold"
                    : "border-border text-muted-foreground hover:text-foreground rounded-full border px-3.5 py-1.5 text-sm"
                }
              >
                {k.label}
              </button>
            ))}
          </div>
        </div>

        {/* 유형별 식별자 */}
        {kind === "article" ? (
          <div className="grid grid-cols-2 gap-3">
            {subjectSelect}
            <label className="block">
              <span className="text-muted-foreground mb-1.5 block font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
                조문번호
              </span>
              <Input
                value={articleNumber}
                onChange={(e) => setArticleNumber(e.target.value)}
                placeholder="예: 29 또는 29의2"
                inputMode="numeric"
              />
            </label>
          </div>
        ) : null}

        {kind === "case" ? (
          <label className="block">
            <span className="text-muted-foreground mb-1.5 block font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
              판례번호
            </span>
            <Input
              value={caseNumber}
              onChange={(e) => setCaseNumber(e.target.value)}
              placeholder="예: 2013도10265"
            />
          </label>
        ) : null}

        {kind === "problem" ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="col-span-2 sm:col-span-1">{subjectSelect}</div>
            <label className="block">
              <span className="text-muted-foreground mb-1.5 block font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
                출처
              </span>
              <select
                value={origin}
                onChange={(e) => setOrigin(e.target.value as ProblemOriginKey)}
                className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
              >
                {PROBLEM_ORIGIN_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-muted-foreground mb-1.5 block font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
                차수
              </span>
              <select
                value={examRound}
                onChange={(e) =>
                  setExamRound(e.target.value === "second" ? "second" : "first")
                }
                className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
              >
                <option value="first">1차</option>
                <option value="second">2차</option>
              </select>
            </label>
            <label className="block">
              <span className="text-muted-foreground mb-1.5 block font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
                년도
              </span>
              <Input
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder="2020"
                inputMode="numeric"
              />
            </label>
            <label className="block">
              <span className="text-muted-foreground mb-1.5 block font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
                번호
              </span>
              <Input
                value={problemNumber}
                onChange={(e) => setProblemNumber(e.target.value)}
                placeholder="5"
                inputMode="numeric"
              />
            </label>
          </div>
        ) : null}

        {kind === "study_method" ? (
          <p className="text-muted-foreground border-border bg-muted/40 rounded-xl border p-3 text-sm leading-relaxed">
            <MessageCircleQuestionIcon className="text-link mr-1 inline size-4 align-text-bottom" />
            공부방법 질문은 대상 콘텐츠 없이 과목만 선택해 작성합니다. 아래
            버튼을 눌러 이어가세요.
          </p>
        ) : null}

        {notFound ? (
          <p className="mt-3 text-sm text-destructive">
            해당 대상을 찾을 수 없습니다. 과목·번호를 다시 확인해 주세요.
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <Button asChild variant="outline" size="sm" className="rounded-full">
            <Link to="/qna" viewTransition>
              취소
            </Link>
          </Button>
          <Button
            type="button"
            size="sm"
            className="rounded-full"
            disabled={!canSubmit || resolving}
            onClick={onSubmit}
          >
            {kind === "study_method" ? (
              <>질문 작성 이어가기</>
            ) : (
              <>
                {resolving ? "확인 중…" : "대상 확인"}{" "}
                <SearchIcon className="size-3.5" />
              </>
            )}
          </Button>
        </div>
      </div>
    </CommunityShell>
  );
}

function QnaForm({
  mode,
  targetType,
  targetId,
  target,
  seed,
}: {
  mode: "content" | "study_method";
  targetType: QnaTargetType;
  targetId?: string;
  target?: TargetDisplay;
  seed?: string;
}) {
  const fetcher = useFetcher();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState(seed ?? "");
  const [subject, setSubject] = useState("");
  const isSubmitting = fetcher.state !== "idle";
  const submitted =
    fetcher.state === "idle" &&
    fetcher.data &&
    typeof fetcher.data === "object" &&
    "ok" in fetcher.data &&
    fetcher.data.ok;
  const newThreadId =
    fetcher.data &&
    typeof fetcher.data === "object" &&
    "thread" in fetcher.data &&
    fetcher.data.thread &&
    typeof fetcher.data.thread === "object" &&
    "threadId" in fetcher.data.thread
      ? String(fetcher.data.thread.threadId)
      : null;
  const aiPending =
    fetcher.data &&
    typeof fetcher.data === "object" &&
    "aiPending" in fetcher.data &&
    fetcher.data.aiPending === true;

  if (submitted && newThreadId) {
    return (
      <CommunityShell
        category="qna"
        title="새 질문"
        backLink={{ to: "/qna", label: "Q&A 목록" }}
        width="narrow"
      >
        <div className="border-border bg-card flex flex-col items-center gap-2.5 rounded-2xl border px-8 py-14 text-center shadow-sm">
          <span className="mb-1 inline-flex size-14 items-center justify-center rounded-2xl bg-emerald-500/[0.12] text-emerald-600 dark:text-emerald-400">
            <CheckCircle2Icon className="size-7" />
          </span>
          <div className="text-base font-bold tracking-tight">
            질문이 등록되었습니다
          </div>
          <p className="text-muted-foreground max-w-md text-sm leading-relaxed">
            {aiPending
              ? "AI가 즉시 답변을 작성하고 있습니다. 잠시 후 ‘내 질문 보기’에서 확인해 주세요. 강사가 확인 후 보완합니다."
              : "답변자에게 알림 메일이 발송됩니다. 답변이 등록되면 메일로 알려드립니다."}
          </p>
          <div className="mt-3 flex justify-center gap-2">
            <Button asChild variant="outline" size="sm" className="rounded-full">
              <Link to="/qna" viewTransition>
                목록으로
              </Link>
            </Button>
            <Button asChild size="sm" className="rounded-full">
              <Link to={`/qna/${newThreadId}`} viewTransition>
                내 질문 보기
              </Link>
            </Button>
          </div>
        </div>
      </CommunityShell>
    );
  }

  return (
    <CommunityShell
      category="qna"
      title="새 질문"
      desc={
        mode === "study_method"
          ? "공부방법에 대해 질문하면 강사가 답변합니다. 과목을 선택해 주세요."
          : "조문·판례·문제 화면에서 클릭한 대상에 대해 질문할 수 있습니다."
      }
      backLink={{ to: "/qna", label: "Q&A 목록" }}
      width="narrow"
    >
      <div className="border-border bg-card rounded-2xl border p-5 shadow-sm md:p-6">
        <fetcher.Form method="post" action="/api/qna/thread">
          <input type="hidden" name="intent" value="create" />
          <input type="hidden" name="targetType" value={targetType} />
          {mode === "content" && targetId ? (
            <input type="hidden" name="targetId" value={targetId} />
          ) : null}

          {mode === "content" ? (
            <div className="border-border bg-muted/40 mb-5 flex flex-wrap items-center gap-2 rounded-xl border p-3">
              <span className="text-muted-foreground font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
                대상
              </span>
              <Chip tone={TARGET_TONE[targetType]}>
                {QNA_TARGET_LABEL[targetType]}
              </Chip>
              {target?.label ? (
                <span className="text-sm font-bold tracking-tight">
                  {target.label}
                </span>
              ) : null}
            </div>
          ) : (
            <label className="mb-5 block">
              <span className="text-muted-foreground mb-1.5 block font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
                과목
              </span>
              <select
                name="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
                className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
              >
                <option value="" disabled>
                  과목 선택
                </option>
                {QNA_SUBJECTS.map((s) => (
                  <option key={s} value={s}>
                    {QNA_SUBJECT_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="block">
            <span className="text-muted-foreground mb-1.5 block font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
              제목
            </span>
            <Input
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="질문 요지를 한 줄로 요약해 주세요"
              maxLength={200}
              required
            />
          </label>

          <label className="mt-4 block">
            <span className="text-muted-foreground mb-1.5 block font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
              내용
            </span>
            <Textarea
              name="questionMd"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="질문 배경과 본인이 어디까지 정리했는지, 막히는 부분을 구체적으로 적으면 더 좋은 답변을 받을 수 있어요."
              rows={10}
              className="text-sm leading-relaxed"
              required
            />
          </label>

          <div className="mt-5 flex justify-end gap-2">
            <Button asChild variant="outline" size="sm" type="button" className="rounded-full">
              <Link to="/qna" viewTransition>
                취소
              </Link>
            </Button>
            <Button
              type="submit"
              size="sm"
              className="rounded-full"
              disabled={
                isSubmitting ||
                !title.trim() ||
                !body.trim() ||
                (mode === "study_method" && !subject)
              }
            >
              질문 등록 <SendIcon className="size-3.5" />
            </Button>
          </div>
        </fetcher.Form>
      </div>
    </CommunityShell>
  );
}
