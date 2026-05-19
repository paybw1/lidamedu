// 학습정보 판례 뷰어 (feat-3-205) — /latest/cases/:caseId.
// 학습정보 피드(최근 판례)에서 진입하는 경량 read-only 뷰어. CaseBody 공용 컴포넌트 재사용.
// 학습과목 뷰어(/subjects/.../cases/:id)와 달리 주석·트리·진도·Q&A 없음.

import { ArrowLeftIcon } from "lucide-react";
import { Link, data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { CaseBody } from "~/features/cases/components/case-body";
import {
  getCaseById,
  listCaseReferences,
} from "~/features/cases/queries.server";
import { getExamProblemsForCase } from "~/features/problems/queries.server";

import type { Route } from "./+types/latest-case-viewer";

export const meta: Route.MetaFunction = ({ data: d }) => [
  {
    title: d?.kase
      ? `${d.kase.caseNumber} | Lidam Patent Attorney Academy`
      : "판례 | Lidam Patent Attorney Academy",
  },
];

export async function loader({ params, request }: Route.LoaderArgs) {
  if (!params.caseId) throw data("Missing case id", { status: 404 });
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const kase = await getCaseById(client, params.caseId);
  if (!kase) throw data("판례를 찾을 수 없습니다.", { status: 404 });

  const [examProblems, references] = await Promise.all([
    getExamProblemsForCase(client, kase.caseId),
    listCaseReferences(client, kase.caseId),
  ]);

  return { kase, examProblems, references };
}

export default function LatestCaseViewer({
  loaderData,
}: Route.ComponentProps) {
  const { kase, examProblems, references } = loaderData;
  return (
    <div className="bg-background min-h-[calc(100vh-56px)]">
      <div className="mx-auto w-full max-w-screen-md px-5 py-6 md:px-8 md:py-8">
        <div className="mb-4">
          <Link
            to="/latest/cases"
            viewTransition
            className="text-primary hover:text-primary/80 inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
          >
            <ArrowLeftIcon className="size-3.5" />
            최근 판례 목록으로
          </Link>
        </div>
        <CaseBody
          kase={kase}
          examProblems={examProblems}
          references={references}
        />
      </div>
    </div>
  );
}
