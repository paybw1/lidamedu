// MCQ 팩 상세 (feat-3-302). 기출/모의 공통 페이지.
// 헤더 + 응시 시작 / 참고 자료 2카드 + 문제 목록.
// 키트 lidam-latest/McqPackDetailScreen 디자인.
import type { Route } from "./+types/mcq-pack-detail";

import {
  CheckCircle2Icon,
  ChevronRightIcon,
  ClockIcon,
  FileTextIcon,
  PlayIcon,
  Trash2Icon,
  VideoIcon,
} from "lucide-react";
import { useEffect } from "react";
import {
  Form,
  Link,
  data,
  redirect,
  useFetcher,
  useLocation,
  useNavigate,
} from "react-router";

import { Button } from "~/core/components/ui/button";
import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { listCohorts } from "~/features/cohorts/queries.server";
import { Pill } from "~/features/latest/components/latest-list";
import { FORMAT_LABEL, ORIGIN_LABEL } from "~/features/problems/labels";
import {
  getStaffRole,
  getSystematicSkeleton,
} from "~/features/laws/queries.server";
import { CohortWeaknessSource } from "~/features/mcq-packs/components/cohort-weakness-source";
import { McqAreaShell } from "~/features/mcq-packs/components/mcq-area-shell";
import { MockPackProblemPicker } from "~/features/mcq-packs/components/mock-pack-problem-picker";
import {
  MCQ_PACK_KIND_LABELS,
  MCQ_PACK_SUBJECT_LABELS,
  type McqPackProblemItem,
  type McqPackSubjectScope,
  isMockKind,
} from "~/features/mcq-packs/labels";
import {
  type OxSessionRow,
  getPackById,
  listMyOxSessions,
  listPackProblems,
} from "~/features/mcq-packs/queries.server";
import { lawSubjectSlugSchema } from "~/features/subjects/lib/subjects";
import { isCohortAccess } from "~/features/subscriptions/membership.server";
import { requireFeature } from "~/features/subscriptions/queries.server";

export const meta: Route.MetaFunction = ({ data: d }) => {
  if (!d || !d.pack)
    return [{ title: "문제집 | 리담변리사학원" }];
  return [{ title: `${d.pack.title} | 리담변리사학원` }];
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
  // feat-8-008: 모의고사 종류 팩은 area_mock_exams 게이트 (회원3 / staff 면제).
  if (isMockKind(pack.kind)) {
    const access = await requireFeature(client, user.id, "area_mock_exams");
    // 진도별 모의고사 = 종합반 전용(feat-2-031). 비종합반은 통합 모의 목록으로 안내(막다른 403 회피).
    if (pack.kind === "mock_progressive" && !isCohortAccess(access)) {
      throw redirect("/latest/mcq?kind=mock");
    }
  }
  const problems = await listPackProblems(client, params.packId);
  const oxSessions = await listMyOxSessions(client, user.id, {
    limit: 5,
    packId: params.packId,
  });
  // 단원 필터용 체계도 노드 — staff(picker 전용) + 단일 법 과목(특허/상표/디자인/민법) 팩만.
  //   합본(산업재산권)·자연과학·민소법은 단일 체계도가 없어 노드 필터 미제공.
  const nodeSlug = lawSubjectSlugSchema.safeParse(
    SCOPE_LAW_CODE[pack.subjectScope],
  );
  const systematicNodes =
    role !== null && nodeSlug.success
      ? (await getSystematicSkeleton(client, nodeSlug.data))
          .filter((n) => !n.caseOnly)
          .map((n) => ({
            nodeId: n.nodeId,
            label: n.displayLabel,
            depth: Math.max(0, String(n.path).split(".").length - 1),
          }))
      : [];
  // 반 공통 약점 출제용 반 목록 — 강사=본인 소유, 매니저/원장=전체. adminClient:
  //   멤버 수 집계가 profiles/cohort_members RLS 우회 필요(메모 profiles-rls-staff-cross-read).
  const cohorts =
    role !== null
      ? await listCohorts(
          adminClient,
          role === "instructor" ? { ownerId: user.id } : {},
        )
      : [];
  return {
    pack,
    problems,
    canEdit: role !== null,
    oxSessions,
    systematicNodes,
    cohorts: cohorts.map((c) => ({
      cohortId: c.cohortId,
      name: c.name,
      memberCount: c.memberCount,
    })),
    cohortLawCode: nodeSlug.success ? nodeSlug.data : null,
  };
}

export default function McqPackDetail({ loaderData }: Route.ComponentProps) {
  const {
    pack,
    problems,
    canEdit,
    oxSessions,
    systematicNodes,
    cohorts,
    cohortLawCode,
  } = loaderData;
  const mockPack = isMockKind(pack.kind);

  const metaParts: string[] = [];
  metaParts.push(
    pack.publishedAt ? `출제일 ${pack.publishedAt}` : "출제일 미지정",
  );
  if (pack.year) metaParts.push(`${pack.year}년`);
  if (pack.examRoundNo) metaParts.push(`${pack.examRoundNo}회`);
  metaParts.push(`문항 ${pack.problemCount}`);
  if (pack.durationMin) metaParts.push(`제한 ${pack.durationMin}분`);

  return (
    <McqAreaShell
      isMock={isMockKind(pack.kind)}
      width="feed"
      backLink={{ to: "/latest/mcq?kind=past_exam", label: "1차 기출문제로" }}
      title={pack.title}
      desc={metaParts.join(" · ")}
    >
      <div className="mb-3.5 flex flex-wrap items-center gap-1.5">
        <Pill tone="outline">{MCQ_PACK_SUBJECT_LABELS[pack.subjectScope]}</Pill>
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
            <PlayIcon className="text-link size-4" /> 응시 시작
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
            {/* 객관식 팩(mock_*, past_exam) 모두에서 OX 시험 가능 — 보기·박스 항목의 OX 지문 활용.
                시험 모드는 이력 저장, 학습 모드는 즉시 정답 표시 + 이력 미저장. */}
            <Button
              asChild
              size="sm"
              variant="outline"
              className="h-9 rounded-full"
              disabled={problems.length === 0}
            >
              <Link to={`/latest/mcq/${pack.packId}/ox-exam`}>
                <CheckCircle2Icon className="size-3.5" /> 정오문제 시험
              </Link>
            </Button>
            <Button
              asChild
              size="sm"
              variant="outline"
              className="h-9 rounded-full"
              disabled={problems.length === 0}
            >
              <Link to={`/latest/mcq/${pack.packId}/ox-exam?mode=study`}>
                <PlayIcon className="size-3.5" /> 정오문제 학습
              </Link>
            </Button>
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
        </div>
        {canEdit ? (
          <div className="border-border border-b p-3">
            <MockPackProblemPicker
              packId={pack.packId}
              lawCode={SCOPE_LAW_CODE[pack.subjectScope] ?? null}
              existingIds={new Set(problems.map((p) => p.problemId))}
              nodeOptions={systematicNodes}
            />
          </div>
        ) : null}
        {canEdit && cohortLawCode && cohorts.length > 0 ? (
          <div className="border-border border-b p-3">
            <CohortWeaknessSource
              packId={pack.packId}
              lawCode={cohortLawCode}
              cohorts={cohorts}
            />
          </div>
        ) : null}
        {problems.length === 0 ? (
          <p className="text-muted-foreground p-6 text-center text-sm">
            {canEdit
              ? "문제가 비어 있습니다. 위 검색으로 문제를 추가하세요."
              : "아직 등록된 문제가 없습니다."}
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

      {oxSessions.length > 0 ? <OxSessionsPanel sessions={oxSessions} /> : null}

      {canEdit && mockPack ? (
        <ReleasePanel packId={pack.packId} problems={problems} />
      ) : null}
    </McqAreaShell>
  );
}

function OxSessionsPanel({ sessions }: { sessions: OxSessionRow[] }) {
  return (
    <div className="border-border bg-card mt-4 overflow-hidden rounded-2xl border shadow-sm">
      <div className="border-border flex items-center justify-between border-b px-4 py-3">
        <p className="text-sm font-bold tracking-tight">
          <CheckCircle2Icon className="text-link mr-1.5 inline size-4" />내
          정오문제 응시 이력{" "}
          <span className="text-muted-foreground tabular-nums">
            {sessions.length}
          </span>
        </p>
        <Link
          to="/me/ox-sessions"
          className="text-link text-xs underline-offset-4 hover:underline"
        >
          전체 보기 →
        </Link>
      </div>
      <ul className="divide-border divide-y">
        {sessions.map((s) => {
          const answered = s.correct + s.wrong;
          const rate =
            answered > 0 ? Math.round((s.correct / answered) * 100) : 0;
          const when = (s.completedAt ?? s.startedAt)
            .slice(0, 16)
            .replace("T", " ");
          return (
            <li
              key={s.sessionId}
              className="hover:bg-muted/40 flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm transition-colors"
            >
              <span className="text-muted-foreground tabular-nums">{when}</span>
              <Pill
                tone={rate >= 80 ? "primary" : rate >= 60 ? "amber" : "outline"}
              >
                정답률 {rate}%
              </Pill>
              <Pill tone="outline">
                {s.correct}/{answered}
                {s.blank > 0 ? ` · 미응답 ${s.blank}` : ""}
              </Pill>
            </li>
          );
        })}
      </ul>
    </div>
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
  }, [
    delFetcher.state,
    delFetcher.data,
    navigate,
    location.pathname,
    location.search,
  ]);

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
          <Pill>{FORMAT_LABEL[problem.format as keyof typeof FORMAT_LABEL] ?? problem.format}</Pill>
          <Pill tone="outline">{ORIGIN_LABEL[problem.origin as keyof typeof ORIGIN_LABEL] ?? problem.origin}</Pill>
        </div>
        {/* 문제 클릭 = 학습 모드 세션 시작 + 이 문제부터. */}
        <Form method="post" action="/api/mcq-pack/start" className="w-full">
          <input type="hidden" name="packId" value={pack} />
          <input type="hidden" name="mode" value="study" />
          <input type="hidden" name="startAt" value={problem.problemId} />
          <button
            type="submit"
            className="hover:text-link inline-flex w-full items-start gap-1 text-left text-[13px] leading-snug"
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
              if (!confirm("이 문제를 문제집에서 제거하시겠습니까?")) {
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

// 팩 subject_scope → law_code (단일 법 과목만; 합본/자연과학은 검색 시 전체 과목).
const SCOPE_LAW_CODE: Partial<Record<McqPackSubjectScope, string>> = {
  patent: "patent",
  trademark: "trademark",
  design: "design",
  civil: "civil",
  civil_procedure: "civil-procedure",
};

// feat-10-002 — 모의고사 종료 후 mock 문제를 학습과목 문제은행에 공개.
function ReleasePanel({
  packId,
  problems,
}: {
  packId: string;
  problems: McqPackProblemItem[];
}) {
  const fetcher = useFetcher<{
    ok?: true;
    released?: number;
    error?: string;
  }>();
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    const d = fetcher.data;
    if (fetcher.state === "idle" && d && "ok" in d && d.ok) {
      navigate(location.pathname + location.search, {
        replace: true,
        preventScrollReset: true,
      });
    }
  }, [
    fetcher.state,
    fetcher.data,
    navigate,
    location.pathname,
    location.search,
  ]);

  const mockProblems = problems.filter((p) => p.origin === "mock");
  const releasedCount = mockProblems.filter((p) => p.releasedAt).length;
  const pending = mockProblems.length - releasedCount;
  const err =
    fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;

  return (
    <div className="border-border bg-card mt-4 rounded-2xl border p-4 shadow-sm">
      <p className="text-sm font-bold tracking-tight">학습과목 공개</p>
      <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
        모의고사가 끝나면 이 문제집의 문제를 학습과목 문제은행에 공개합니다. 공개
        전까지 mock 문제는 학습과목 색인·맞춤 퀴즈에 노출되지 않습니다.
      </p>
      {mockProblems.length === 0 ? (
        <p className="text-muted-foreground mt-3 text-xs">
          이 문제집에 모의고사(origin=mock) 문제가 없습니다.
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Pill tone="outline">mock 문항 {mockProblems.length}</Pill>
          <Pill tone={releasedCount > 0 ? "primary" : "outline"}>
            공개됨 {releasedCount}
          </Pill>
          {pending > 0 ? (
            <fetcher.Form method="post" action="/api/admin/mcq-pack">
              <input type="hidden" name="intent" value="release_to_subjects" />
              <input type="hidden" name="packId" value={packId} />
              <Button
                type="submit"
                size="sm"
                className="h-8 rounded-full"
                disabled={fetcher.state !== "idle"}
              >
                미공개 {pending}개 학습과목에 공개
              </Button>
            </fetcher.Form>
          ) : (
            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
              모두 공개됨
            </span>
          )}
          {err ? <span className="text-xs text-rose-600">{err}</span> : null}
        </div>
      )}
    </div>
  );
}
