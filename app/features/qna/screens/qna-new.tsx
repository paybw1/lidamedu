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
import { parseProblemCode } from "~/features/problems/lib/problem-code";
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
  node: "primary",
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
  // 쟁점(단원) 분류 — 조문 대상일 때만 의미. 대상은 조문 유지, node_id 로만 저장.
  const nodeIdRaw = url.searchParams.get("nodeId");
  const nodeId =
    nodeIdRaw && /^[0-9a-f-]{36}$/i.test(nodeIdRaw) ? nodeIdRaw : null;

  // 대상(조문/판례/문제) 없이 진입한 경우 — 에러 대신 안내(어떤 경로로 와도 안 깨지게).
  if (
    !targetTypeParse.success ||
    targetTypeParse.data === "study_method" ||
    !targetId
  ) {
    return { mode: "none" as const };
  }

  // 단원(node) 대상 진입 — 질문의 대상을 단원으로 앵커하지 않고(조문 뷰어 미노출 문제)
  // 그 단원에 속한 조문 중 하나를 고르게 한다. 대상=조문 + 분류=단원.
  if (targetTypeParse.data === "node") {
    const { data: node } = await client
      .from("systematic_nodes")
      .select("node_id, display_label")
      .eq("node_id", targetId)
      .maybeSingle();
    if (node) {
      const { data: links } = await client
        .from("article_systematic_links")
        .select("articles!inner(article_id, article_number, display_label)")
        .eq("node_id", targetId);
      const sortKey = (num: string | null) => {
        const m = /^(\d+)(?:의(\d+))?/.exec(num ?? "");
        return m ? Number(m[1]) * 1000 + Number(m[2] ?? 0) : Number.MAX_SAFE_INTEGER;
      };
      const articles = (links ?? [])
        .map((l) => l.articles)
        .filter((a) => a && a.article_number)
        .map((a) => ({
          articleId: a.article_id,
          label: a.display_label,
          key: sortKey(a.article_number),
        }))
        .sort((a, b) => a.key - b.key)
        .map(({ articleId, label }) => ({ articleId, label }));
      if (articles.length > 0) {
        return {
          mode: "node_articles" as const,
          node: { nodeId: node.node_id, label: node.display_label },
          articles,
        };
      }
    }
    // 연결 조문이 없는 단원(드묾) — 기존대로 단원 대상 폼으로 진행.
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
    nodeId: targetTypeParse.data === "article" ? nodeId : null,
  };
}

export default function QnaNew({ loaderData }: Route.ComponentProps) {
  if (loaderData.mode === "study_method") {
    return <QnaForm mode="study_method" targetType="study_method" />;
  }
  if (loaderData.mode === "none") {
    return <QnaTargetPicker />;
  }
  if (loaderData.mode === "node_articles") {
    return (
      <NodeArticlePicker node={loaderData.node} articles={loaderData.articles} />
    );
  }
  return (
    <QnaForm
      mode="content"
      targetType={loaderData.targetType}
      targetId={loaderData.targetId}
      target={loaderData.target}
      seed={loaderData.seed}
      nodeId={loaderData.nodeId ?? undefined}
    />
  );
}

// 단원에서 진입한 질문 — 그 단원의 조문 중 하나를 대상으로 특정(단원은 분류로만 저장).
function NodeArticlePicker({
  node,
  articles,
}: {
  node: { nodeId: string; label: string };
  articles: Array<{ articleId: string; label: string }>;
}) {
  const navigate = useNavigate();
  return (
    <CommunityShell
      category="qna"
      title="새 질문"
      desc="이 단원의 어느 조문에 대한 질문인가요? 질문은 선택한 조문에 연결되고, 단원 분류가 함께 저장됩니다."
      backLink={{ to: "/qna", label: "Q&A 목록" }}
      width="narrow"
    >
      <div className="border-border bg-card rounded-2xl border p-5 shadow-sm md:p-6">
        <div className="border-border bg-muted/40 mb-4 flex flex-wrap items-center gap-2 rounded-xl border p-3">
          <Chip tone="primary">단원</Chip>
          <span className="text-sm font-bold tracking-tight">{node.label}</span>
        </div>
        <div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
          {articles.map((a) => (
            <button
              key={a.articleId}
              type="button"
              onClick={() =>
                navigate(
                  `/qna/new?targetType=article&targetId=${a.articleId}&nodeId=${node.nodeId}`,
                  { viewTransition: true },
                )
              }
              className="border-border hover:border-primary hover:bg-primary/5 rounded-xl border px-4 py-2.5 text-left text-sm font-medium"
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </CommunityShell>
  );
}

// 커뮤니티 진입(대상 미지정) — 대상을 식별자로 특정해 표준 질문 URL 로 이동.
//   조문=과목+조문번호 / 판례=판례번호 / 문제=과목+차수+년도+번호.
//   해석 성공 시 /qna/new?targetType&targetId 로 이동 → 기존 content 폼이 인수(상세패널과 등가).
const PICKER_KINDS = [
  { key: "article", label: "조문" },
  { key: "case", label: "판례" },
  { key: "problem_code", label: "문제번호" },
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

interface NodeOpt {
  nodeId: string;
  label: string;
}
interface ResolveResult {
  ok: boolean;
  targetType?: string;
  targetId?: string;
  label?: string;
  error?: string;
  nodes?: NodeOpt[] | null;
}
interface NodesResult {
  ok: boolean;
  nodes: Array<{ nodeId: string; label: string; depth: number }>;
}

// 체계도(단원) 노드 검색형 콤보박스 — 타이핑으로 필터, 클릭 선택.
function NodeCombobox({
  nodes,
  value,
  onChange,
  loading,
}: {
  nodes: Array<{ nodeId: string; label: string; depth: number }>;
  value: string;
  onChange: (nodeId: string) => void;
  loading: boolean;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const selected = nodes.find((n) => n.nodeId === value);
  const needle = q.trim().toLowerCase();
  const filtered = needle
    ? nodes.filter((n) => n.label.toLowerCase().includes(needle))
    : nodes;

  return (
    <div className="relative">
      <Input
        value={open ? q : (selected?.label ?? "")}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setQ("");
          setOpen(true);
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        placeholder={loading ? "불러오는 중…" : "단원 검색"}
      />
      {open && filtered.length > 0 ? (
        <ul className="border-border bg-popover absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border shadow-md">
          {filtered.slice(0, 60).map((n) => (
            <li key={n.nodeId}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(n.nodeId);
                  setOpen(false);
                }}
                className="hover:bg-accent block w-full py-1.5 pr-3 text-left text-sm"
                style={{ paddingLeft: `${12 + n.depth * 12}px` }}
              >
                {n.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function QnaTargetPicker() {
  const navigate = useNavigate();
  const resolveFetcher = useFetcher<ResolveResult>();
  const nodesFetcher = useFetcher<NodesResult>();
  const [kind, setKind] = useState<PickerKind>("article");
  const [subject, setSubject] = useState<string>("patent");
  const [articleNumber, setArticleNumber] = useState("");
  const [caseNumber, setCaseNumber] = useState("");
  const [origin, setOrigin] = useState<ProblemOriginKey>("past_exam");
  const [year, setYear] = useState("");
  const [problemNumber, setProblemNumber] = useState("");
  const [problemCode, setProblemCode] = useState("");
  const [primaryNodeId, setPrimaryNodeId] = useState("");
  // 조문이 여러 쟁점에 걸릴 때 — 해석 후 쟁점 선택 단계.
  const [articleChoice, setArticleChoice] = useState<{
    targetId: string;
    label: string;
    nodes: NodeOpt[];
  } | null>(null);

  const resolving = resolveFetcher.state !== "idle";
  const isExpected = kind === "problem" && origin === "expected";
  const notFound =
    resolveFetcher.state === "idle" && resolveFetcher.data?.ok === false;

  const goTo = (targetType: string, targetId: string, nodeId?: string) =>
    navigate(
      `/qna/new?targetType=${targetType}&targetId=${targetId}${nodeId ? `&nodeId=${nodeId}` : ""}`,
      { viewTransition: true },
    );

  // 예상 문제 선택 시 과목의 체계도 노드 로드.
  useEffect(() => {
    if (isExpected && subject) {
      nodesFetcher.load(`/api/qna/nodes?subject=${subject}`);
      setPrimaryNodeId("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpected, subject]);

  // 해석 결과 → 조문이 여러 쟁점에 걸리면 쟁점 선택 단계, 아니면 바로 이동.
  useEffect(() => {
    const d = resolveFetcher.data;
    if (!d || !d.ok || !d.targetType || !d.targetId) return;
    if (d.targetType === "article" && d.nodes && d.nodes.length >= 2) {
      setArticleChoice({
        targetId: d.targetId,
        label: d.label ?? "",
        nodes: d.nodes,
      });
      return;
    }
    goTo(d.targetType, d.targetId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolveFetcher.data]);

  const canSubmit =
    kind === "article"
      ? Boolean(subject && articleNumber.trim())
      : kind === "case"
        ? Boolean(caseNumber.trim())
        : kind === "problem_code"
          ? parseProblemCode(problemCode) !== null
          : kind === "problem"
            ? isExpected
              ? Boolean(subject && primaryNodeId && problemNumber.trim())
              : Boolean(subject && year.trim() && problemNumber.trim())
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
    } else if (kind === "problem_code") {
      const n = parseProblemCode(problemCode);
      if (!n) return;
      p.set("type", "problem_code");
      p.set("displayNo", String(n));
    } else {
      p.set("type", "problem");
      p.set("subject", subject);
      p.set("origin", origin);
      p.set("problemNumber", problemNumber.trim());
      if (isExpected) p.set("primaryNodeId", primaryNodeId);
      else p.set("year", year.trim());
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

  // ── 쟁점 선택 단계 (조문이 여러 쟁점에 걸림) ──
  if (articleChoice) {
    return (
      <CommunityShell
        category="qna"
        title="새 질문"
        desc="이 조문은 여러 쟁점에 걸쳐 있습니다. 어느 쟁점에 대한 질문인가요?"
        backLink={{ to: "/qna", label: "Q&A 목록" }}
        width="narrow"
      >
        <div className="border-border bg-card rounded-2xl border p-5 shadow-sm md:p-6">
          <div className="border-border bg-muted/40 mb-4 flex flex-wrap items-center gap-2 rounded-xl border p-3">
            <Chip tone="primary">조문</Chip>
            <span className="text-sm font-bold tracking-tight">
              {articleChoice.label}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => goTo("article", articleChoice.targetId)}
              className="border-border hover:border-primary hover:bg-primary/5 rounded-xl border px-4 py-2.5 text-left text-sm font-medium"
            >
              조문 전체에 대해 질문
            </button>
            {/* 쟁점 선택 — 대상은 조문 유지, 쟁점은 분류(node_id)로만 저장.
                (질문 대상을 단원으로 바꾸면 조문 뷰어 Q&A 탭에 안 보이는 문제) */}
            {articleChoice.nodes.map((n) => (
              <button
                key={n.nodeId}
                type="button"
                onClick={() => goTo("article", articleChoice.targetId, n.nodeId)}
                className="border-border hover:border-primary hover:bg-primary/5 flex items-center gap-2 rounded-xl border px-4 py-2.5 text-left text-sm font-medium"
              >
                <Chip tone="primary">쟁점</Chip>
                {n.label}
              </button>
            ))}
          </div>
          <div className="mt-4 flex justify-end">
            <Button
              variant="outline"
              size="sm"
              type="button"
              className="rounded-full"
              onClick={() => setArticleChoice(null)}
            >
              다시 선택
            </Button>
          </div>
        </div>
      </CommunityShell>
    );
  }

  const subjectNodes = nodesFetcher.data?.nodes ?? [];

  return (
    <CommunityShell
      category="qna"
      title="새 질문"
      desc="조문·판례·문제를 특정하거나, 공부방법을 골라 질문하면 AI와 강사가 답변해 드립니다."
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

        {kind === "problem_code" ? (
          <label className="block">
            <span className="text-muted-foreground mb-1.5 block font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
              문제번호
            </span>
            <Input
              value={problemCode}
              onChange={(e) => setProblemCode(e.target.value)}
              placeholder="예: P-10342 (문제 화면의 번호)"
            />
            <span className="text-muted-foreground mt-1 block text-[11px]">
              문제 화면 상단의 <strong>P-번호</strong>를 입력하면 그 문제로 바로
              특정됩니다.
            </span>
          </label>
        ) : null}

        {kind === "problem" ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {subjectSelect}
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
            </div>
            {/* 객관식은 모두 1차라 차수 없음. 기출/변형=년도+번호, 예상=체계도+번호. */}
            {isExpected ? (
              <div className="grid grid-cols-3 gap-3">
                <label className="col-span-2 block">
                  <span className="text-muted-foreground mb-1.5 block font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
                    체계도(단원)
                  </span>
                  <NodeCombobox
                    nodes={subjectNodes}
                    value={primaryNodeId}
                    onChange={setPrimaryNodeId}
                    loading={nodesFetcher.state !== "idle"}
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
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-muted-foreground mb-1.5 block font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
                    연도
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
            )}
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
          <p className="text-destructive mt-3 text-sm">
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
  nodeId,
}: {
  mode: "content" | "study_method";
  targetType: QnaTargetType;
  targetId?: string;
  target?: TargetDisplay;
  seed?: string;
  /** 사용자가 고른 쟁점(단원) 분류 — 조문 대상일 때만. */
  nodeId?: string;
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
          ? "공부방법에 대해 질문하면 강사가 답변해 드립니다. 과목을 선택해 주세요."
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
          {mode === "content" && nodeId ? (
            <input type="hidden" name="nodeId" value={nodeId} />
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
              placeholder="질문 배경과 본인이 어디까지 정리했는지, 막히는 부분을 구체적으로 적으면 더 좋은 답변을 받을 수 있습니다."
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
