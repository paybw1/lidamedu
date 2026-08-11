// 학습정보 2차문제 뷰어 (feat-3-205) — /latest/essay/:problemId.
// 학습정보 피드(2차 기출문제)에서 진입하는 경량 read-only 뷰어.
// 학습과목 problem-viewer 와 달리 답안 작성·첨삭·진도 없음 — 본문 + 모범답안/채점기준 열람만.

import { ArrowLeftIcon, PencilIcon } from "lucide-react";
import { Link, data, useSearchParams } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { Pill } from "~/features/latest/components/latest-list";
import { MarkdownView } from "~/features/problems/components/markdown-view";
import { SUBJECTIVE_KIND_LABEL } from "~/features/problems/labels";
import { getProblemById } from "~/features/problems/queries.server";

import type { Route } from "./+types/latest-essay-viewer";

export const meta: Route.MetaFunction = ({ data: d }) => [
  {
    title: d?.problem
      ? `2차 기출문제 ${d.problem.year ?? ""} | 리담변리사학원`
      : "2차 기출문제 | 리담변리사학원",
  },
];

export async function loader({ params, request }: Route.LoaderArgs) {
  if (!params.problemId) throw data("Missing problem id", { status: 404 });
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const problem = await getProblemById(client, params.problemId);
  if (!problem) throw data("문제를 찾을 수 없습니다.", { status: 404 });

  const role = await getStaffRole(client, user.id);
  const isStaff = role !== null;

  // 해설·모범답안·채점기준은 staff 전용 — 수험생에게는 서버에서 아예 실어 보내지 않는다.
  // JSX 조건부 렌더만으로 가리면 loader 응답(SSR 페이로드·.data 요청)에 원문이 그대로
  // 남아 네트워크 탭에서 읽힌다.
  return {
    problem: isStaff
      ? problem
      : {
          ...problem,
          explanationMd: null,
          modelAnswerMd: null,
          gradingRubricMd: null,
          rubricItems: null,
        },
    isStaff,
  };
}

export default function LatestEssayViewer({
  loaderData,
}: Route.ComponentProps) {
  const { problem, isStaff } = loaderData;
  // 목록에서 넘어온 필터(?back=<검색쿼리>)로 복귀 — 없으면 전체 목록.
  const [searchParams] = useSearchParams();
  const back = searchParams.get("back");
  const backTo = back ? `/latest/essay${back}` : "/latest/essay";
  const hasReveal =
    problem.explanationMd != null ||
    problem.modelAnswerMd != null ||
    problem.gradingRubricMd != null ||
    (problem.rubricItems != null && problem.rubricItems.length > 0);

  return (
    <div className="bg-background min-h-[calc(100vh-56px)]">
      <div className="mx-auto w-full max-w-screen-md px-5 py-6 md:px-8 md:py-8">
        <div className="mb-4 flex items-center justify-between gap-2">
          <Link
            to={backTo}
            viewTransition
            className="text-link hover:text-link/80 inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
          >
            <ArrowLeftIcon className="size-3.5" />
            2차 기출문제 목록으로
          </Link>
          {isStaff ? (
            <Link
              to={`/admin/problems/${problem.problemId}`}
              viewTransition
              className="text-muted-foreground hover:text-link inline-flex items-center gap-1 text-xs font-semibold"
            >
              <PencilIcon className="size-3.5" /> 수정
            </Link>
          ) : null}
        </div>

        <article className="border-border bg-card overflow-hidden rounded-xl border shadow-sm">
          {/* 헤더 — 연도·유형·주제 */}
          <header className="border-border border-b px-6 pt-6 pb-4">
            <div className="flex flex-wrap items-center gap-1.5">
              {problem.year != null ? (
                <Pill tone="outline" className="font-mono">
                  {problem.year}년
                  {problem.examRoundNo != null
                    ? ` ${problem.examRoundNo}회`
                    : ""}
                </Pill>
              ) : null}
              {problem.problemNumber != null ? (
                <Pill tone="outline" className="font-mono">
                  {problem.problemNumber}번
                </Pill>
              ) : null}
              {problem.subjectiveKind ? (
                <Pill tone="violet">
                  {SUBJECTIVE_KIND_LABEL[problem.subjectiveKind]}
                </Pill>
              ) : null}
            </div>
            {problem.subjectiveTopic ? (
              <p className="mt-2 text-[15px] font-bold tracking-tight">
                {problem.subjectiveTopic}
              </p>
            ) : null}
            {problem.subjectiveKeywords &&
            problem.subjectiveKeywords.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {problem.subjectiveKeywords.map((k) => (
                  <Pill key={k} tone="neutral">
                    {k}
                  </Pill>
                ))}
              </div>
            ) : null}
          </header>

          {/* 본문 + 모범답안/채점기준 */}
          <div className="space-y-6 px-6 py-6">
            <section className="space-y-2">
              <h2 className="text-link font-mono text-[11px] font-bold tracking-widest uppercase">
                문제
              </h2>
              <div className="border-border/60 border-t" />
              <MarkdownView
                text={problem.bodyMd}
                className="text-[15px] leading-[1.8]"
              />
            </section>

            {hasReveal ? (
              <details className="border-border bg-muted/30 rounded-xl border">
                <summary className="cursor-pointer px-4 py-3 text-sm font-bold tracking-tight">
                  해설 · 모범답안 · 채점기준 보기
                </summary>
                <div className="space-y-5 border-t border-border/60 px-4 py-4">
                  {problem.explanationMd ? (
                    <section className="space-y-2">
                      <h3 className="text-link font-mono text-[11px] font-bold tracking-widest uppercase">
                        해설
                      </h3>
                      <MarkdownView
                        text={problem.explanationMd}
                        className="text-[14px] leading-[1.8]"
                      />
                    </section>
                  ) : null}
                  {problem.modelAnswerMd ? (
                    <section className="space-y-2">
                      <h3 className="text-link font-mono text-[11px] font-bold tracking-widest uppercase">
                        모범답안
                      </h3>
                      <MarkdownView
                        text={problem.modelAnswerMd}
                        className="text-[14px] leading-[1.8]"
                      />
                    </section>
                  ) : null}
                  {problem.gradingRubricMd ? (
                    <section className="space-y-2">
                      <h3 className="text-link font-mono text-[11px] font-bold tracking-widest uppercase">
                        채점기준
                      </h3>
                      <MarkdownView
                        text={problem.gradingRubricMd}
                        className="text-[14px] leading-[1.8]"
                      />
                    </section>
                  ) : null}
                  {problem.rubricItems && problem.rubricItems.length > 0 ? (
                    <section className="space-y-1.5">
                      <h3 className="text-link font-mono text-[11px] font-bold tracking-widest uppercase">
                        배점
                      </h3>
                      <ul className="space-y-1">
                        {problem.rubricItems.map((it, i) => (
                          <li
                            key={i}
                            className="flex items-center justify-between gap-3 text-[13px]"
                          >
                            <span>{it.label}</span>
                            <span className="text-muted-foreground font-mono tabular-nums">
                              {it.points}점
                            </span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}
                </div>
              </details>
            ) : null}
          </div>
        </article>
      </div>
    </div>
  );
}
