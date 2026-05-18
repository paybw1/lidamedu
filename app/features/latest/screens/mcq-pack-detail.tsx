// MCQ 팩 상세 (feat-3-302). 기출/모의 공통 페이지.
// 헤더 + 응시 시작 / 참고 자료 2카드 + 문제 목록.
// 키트 lidam-latest/McqPackDetailScreen 디자인.

import {
  ChevronRightIcon,
  ClockIcon,
  FileTextIcon,
  PlayIcon,
  PlusIcon,
  Trash2Icon,
  VideoIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  Form,
  Link,
  data,
  useFetcher,
  useLocation,
  useNavigate,
} from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { Pill } from "~/features/latest/components/latest-list";
import { LatestShell } from "~/features/latest/components/latest-shell";
import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  MCQ_PACK_KIND_LABELS,
  MCQ_PACK_SUBJECT_LABELS,
  isMockKind,
  type McqPackProblemItem,
} from "~/features/mcq-packs/labels";
import {
  getPackById,
  listPackProblems,
} from "~/features/mcq-packs/queries.server";

import type { Route } from "./+types/mcq-pack-detail";

export const meta: Route.MetaFunction = ({ data: d }) => {
  if (!d || !d.pack) return [{ title: "문제집 | Lidam Patent Attorney Academy" }];
  return [{ title: `${d.pack.title} | Lidam Patent Attorney Academy` }];
};

export async function loader({ params, request }: Route.LoaderArgs) {
  if (!params.packId) throw data("Missing packId", { status: 404 });
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);

  const pack = await getPackById(client, params.packId);
  if (!pack) throw data("Pack not found", { status: 404 });
  // 비공개 pack 은 staff 만 접근.
  if (!pack.isPublished && !role) {
    throw data("Forbidden", { status: 403 });
  }
  const problems = await listPackProblems(client, params.packId);
  return { pack, problems, canEdit: role !== null };
}

export default function McqPackDetail({ loaderData }: Route.ComponentProps) {
  const { pack, problems, canEdit } = loaderData;
  const mockPack = isMockKind(pack.kind);

  const metaParts: string[] = [];
  metaParts.push(pack.publishedAt ? `출제일 ${pack.publishedAt}` : "출제일 미지정");
  if (pack.year) metaParts.push(`${pack.year}년`);
  if (pack.examRoundNo) metaParts.push(`${pack.examRoundNo}회`);
  metaParts.push(`문항 ${pack.problemCount}`);
  if (pack.durationMin) metaParts.push(`제한 ${pack.durationMin}분`);

  return (
    <LatestShell
      category="mcq"
      width="feed"
      backLink={{ to: "/latest/mcq", label: "객관식 문제로" }}
      title={pack.title}
      desc={metaParts.join(" · ")}
    >
      <div className="mb-3.5 flex flex-wrap items-center gap-1.5">
        <Pill tone="outline">
          {MCQ_PACK_SUBJECT_LABELS[pack.subjectScope]}
        </Pill>
        <Pill tone={mockPack ? "amber" : "primary"}>
          {MCQ_PACK_KIND_LABELS[pack.kind]}
        </Pill>
        {!pack.isPublished ? <Pill tone="rose">비공개</Pill> : null}
      </div>

      {pack.description ? (
        <p className="text-muted-foreground mb-4 text-sm leading-relaxed whitespace-pre-line">
          {pack.description}
        </p>
      ) : null}

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <div className="border-border bg-card rounded-2xl border p-4 shadow-sm">
          <p className="inline-flex items-center gap-1.5 text-sm font-bold tracking-tight">
            <PlayIcon className="text-primary size-4" /> 응시 시작
          </p>
          <p className="text-muted-foreground mt-1.5 text-xs leading-relaxed">
            {mockPack
              ? "모의고사 모드는 타이머 기반 응시 후 결과 통계를 제공합니다."
              : "기출/학습 모드는 즉시 해설을 확인하며 푸는 방식입니다."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Form method="post" action="/api/mcq-pack/start">
              <input type="hidden" name="packId" value={pack.packId} />
              <input type="hidden" name="mode" value="study" />
              <Button
                type="submit"
                size="sm"
                variant={mockPack ? "outline" : "default"}
                className="h-9 rounded-full"
                disabled={problems.length === 0}
              >
                <PlayIcon className="size-3.5" /> 학습 시작
              </Button>
            </Form>
            {mockPack ? (
              <Form method="post" action="/api/mcq-pack/start">
                <input type="hidden" name="packId" value={pack.packId} />
                <input type="hidden" name="mode" value="exam" />
                <Button
                  type="submit"
                  size="sm"
                  className="h-9 rounded-full"
                  disabled={problems.length === 0}
                >
                  <ClockIcon className="size-3.5" /> 모의고사 시작
                  {pack.durationMin ? ` (${pack.durationMin}분)` : ""}
                </Button>
              </Form>
            ) : null}
          </div>
        </div>

        <div className="border-border bg-card rounded-2xl border p-4 shadow-sm">
          <p className="text-sm font-bold tracking-tight">참고 자료</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {pack.videoUrl ? (
              <Button
                asChild
                size="sm"
                variant="outline"
                className="h-9 rounded-full"
              >
                <a href={pack.videoUrl} target="_blank" rel="noreferrer">
                  <VideoIcon className="size-3.5" /> 풀이 동영상
                </a>
              </Button>
            ) : null}
            {pack.resultDocUrl ? (
              <Button
                asChild
                size="sm"
                variant="outline"
                className="h-9 rounded-full"
              >
                <a href={pack.resultDocUrl} target="_blank" rel="noreferrer">
                  <FileTextIcon className="size-3.5" /> 시험 결과 자료
                </a>
              </Button>
            ) : null}
            {!pack.videoUrl && !pack.resultDocUrl ? (
              <p className="text-muted-foreground text-xs">
                등록된 참고 자료가 없습니다.
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="border-border bg-card overflow-hidden rounded-2xl border shadow-sm">
        <div className="border-border flex items-center justify-between gap-2 border-b px-4 py-3">
          <p className="text-sm font-bold tracking-tight">
            문제 목록{" "}
            <span className="text-muted-foreground tabular-nums">
              {problems.length}
            </span>
          </p>
          {canEdit ? <AddProblemForm packId={pack.packId} /> : null}
        </div>
        {problems.length === 0 ? (
          <p className="text-muted-foreground p-6 text-center text-sm">
            {canEdit
              ? "문제가 비어 있습니다. 우측 입력란에 problem_id 를 붙여넣어 추가하세요."
              : "문제가 비어 있습니다."}
          </p>
        ) : (
          <ol className="divide-border divide-y">
            {problems.map((p, i) => (
              <ProblemRow
                key={p.problemId}
                pack={pack.packId}
                problem={p}
                index={i + 1}
                canEdit={canEdit}
              />
            ))}
          </ol>
        )}
      </div>
    </LatestShell>
  );
}

function ProblemRow({
  pack,
  problem,
  index,
  canEdit,
}: {
  pack: string;
  problem: McqPackProblemItem;
  index: number;
  canEdit: boolean;
}) {
  const delFetcher = useFetcher<{ ok?: true; error?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (
      delFetcher.state === "idle" &&
      delFetcher.data &&
      "ok" in delFetcher.data &&
      delFetcher.data.ok
    ) {
      navigate(location.pathname + location.search, {
        replace: true,
        preventScrollReset: true,
      });
    }
  }, [delFetcher.state, delFetcher.data, navigate, location.pathname, location.search]);

  return (
    <li className="hover:bg-muted/40 flex items-start gap-3 px-4 py-3 transition-colors">
      <span className="text-muted-foreground w-6 shrink-0 text-right text-xs tabular-nums">
        {index}
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {problem.problemNumber ? (
            <Pill tone="outline" className="font-mono">
              {problem.year ? `${problem.year}년 ` : ""}
              {problem.problemNumber}번
            </Pill>
          ) : null}
          <Pill>{problem.format}</Pill>
          <Pill tone="outline">{problem.origin}</Pill>
        </div>
        {/* 문제 클릭 = 학습 모드 세션 시작 + 이 문제부터. */}
        <Form method="post" action="/api/mcq-pack/start" className="w-full">
          <input type="hidden" name="packId" value={pack} />
          <input type="hidden" name="mode" value="study" />
          <input type="hidden" name="startAt" value={problem.problemId} />
          <button
            type="submit"
            className="hover:text-primary inline-flex w-full items-start gap-1 text-left text-[13px] leading-snug"
          >
            <span className="line-clamp-2">{problem.bodySnippet}</span>
            <ChevronRightIcon className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
          </button>
        </Form>
      </div>
      {canEdit ? (
        <delFetcher.Form
          method="post"
          action="/api/admin/mcq-pack"
          className="shrink-0"
        >
          <input type="hidden" name="intent" value="remove_problem" />
          <input type="hidden" name="packId" value={pack} />
          <input type="hidden" name="problemId" value={problem.problemId} />
          <Button
            type="submit"
            size="icon"
            variant="ghost"
            aria-label="삭제"
            className="size-8 rounded-full text-rose-600 hover:text-rose-700"
            disabled={delFetcher.state !== "idle"}
            onClick={(e) => {
              if (!confirm("이 문제를 팩에서 제거하시겠습니까?")) {
                e.preventDefault();
              }
            }}
          >
            <Trash2Icon className="size-3.5" />
          </Button>
        </delFetcher.Form>
      ) : null}
    </li>
  );
}

function AddProblemForm({ packId }: { packId: string }) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const [draft, setDraft] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data &&
      "ok" in fetcher.data &&
      fetcher.data.ok
    ) {
      setDraft("");
      navigate(location.pathname + location.search, {
        replace: true,
        preventScrollReset: true,
      });
    }
  }, [fetcher.state, fetcher.data, navigate, location.pathname, location.search]);
  const err =
    fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;
  return (
    <fetcher.Form
      method="post"
      action="/api/admin/mcq-pack"
      className="inline-flex items-center gap-1.5"
    >
      <input type="hidden" name="intent" value="add_problem" />
      <input type="hidden" name="packId" value={packId} />
      <Input
        name="problemId"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="problem_id (UUID)"
        className="h-8 w-64 font-mono text-[11px]"
      />
      <Button
        type="submit"
        size="sm"
        className="h-8 rounded-full"
        disabled={fetcher.state !== "idle" || !draft.trim()}
      >
        <PlusIcon className="size-3" /> 추가
      </Button>
      {err ? <span className="text-xs text-rose-600">{err}</span> : null}
    </fetcher.Form>
  );
}
