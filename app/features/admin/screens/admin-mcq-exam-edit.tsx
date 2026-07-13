// 통합 모의고사 출제 — 시험 편집 (feat-10-005). /admin/mcq-exams/:examId.
// 시험 메타데이터 편집 + 교시(과목별 모의 팩) 구성. 뮤테이션은 /api/admin/mcq-exam.

import { ArrowLeftIcon, Trash2Icon } from "lucide-react";
import { Link, data, useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import { AdminShell } from "~/features/admin/components/admin-shell";
import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { ExamForm } from "~/features/mcq-exams/components/exam-form";
import { ExamPapersPanel } from "~/features/mcq-exams/components/exam-papers-panel";
import { getExamById, getExamPapers } from "~/features/mcq-exams/queries.server";
import {
  MCQ_PACK_SUBJECT_LABELS,
  isMockKind,
} from "~/features/mcq-packs/labels";
import { listPacks } from "~/features/mcq-packs/queries.server";

import type { Route } from "./+types/admin-mcq-exam-edit";

export const meta: Route.MetaFunction = ({ data: d }) => [
  {
    title: d?.exam
      ? `${d.exam.title} 편집 | 리담변리사학원`
      : "통합 모의고사 편집 | 리담변리사학원",
  },
];

export async function loader({ params, request }: Route.LoaderArgs) {
  if (!params.examId) throw data("Missing examId", { status: 404 });
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const exam = await getExamById(client, params.examId);
  if (!exam) throw data("Exam not found", { status: 404 });
  const papers = await getExamPapers(client, params.examId);

  // 교시로 추가 가능한 팩 — 공개된 모의 종류 팩 중 아직 이 시험에 없는 것.
  const used = new Set(papers.map((p) => p.packId));
  const allPacks = await listPacks(client, {});
  const availablePacks = allPacks
    .filter((p) => isMockKind(p.kind) && p.isPublished && !used.has(p.packId))
    .map((p) => ({
      packId: p.packId,
      title: p.title,
      subjectLabel: MCQ_PACK_SUBJECT_LABELS[p.subjectScope],
    }));

  return { exam, papers, availablePacks, role };
}

export default function AdminMcqExamEdit({ loaderData }: Route.ComponentProps) {
  const { exam, papers, availablePacks, role } = loaderData;

  return (
    <AdminShell
      cluster="problems"
      role={role}
      width={960}
      title={exam.title}
      desc="시험 메타데이터를 수정하고 교시(과목별 모의고사 문제집)를 구성합니다."
      headerRight={
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <Link to="/admin/mcq-exams">
              <ArrowLeftIcon className="size-3.5" /> 목록
            </Link>
          </Button>
          <DeleteExamButton examId={exam.examId} title={exam.title} />
        </div>
      }
    >
      <div className="space-y-6">
        <section>
          <h2 className="mb-2 text-sm font-bold tracking-tight">
            시험 메타데이터
          </h2>
          <ExamForm mode="update" exam={exam} />
        </section>
        <section>
          <h2 className="mb-2 text-sm font-bold tracking-tight">교시 구성</h2>
          <ExamPapersPanel
            examId={exam.examId}
            papers={papers}
            availablePacks={availablePacks}
          />
        </section>
      </div>
    </AdminShell>
  );
}

// 삭제 — /api/admin/mcq-exam(intent=delete)는 성공 시 /admin/mcq-exams 로
// redirect 하므로 목록으로 이동한다 (편집 중인 시험이 사라진 화면을 막는다).
function DeleteExamButton({
  examId,
  title,
}: {
  examId: string;
  title: string;
}) {
  const fetcher = useFetcher<{ error?: string }>();
  return (
    <fetcher.Form
      method="post"
      action="/api/admin/mcq-exam"
      onSubmit={(e) => {
        if (!confirm(`"${title}" 시험을 삭제하시겠습니까?`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="intent" value="delete" />
      <input type="hidden" name="examId" value={examId} />
      <Button
        type="submit"
        size="sm"
        variant="outline"
        disabled={fetcher.state !== "idle"}
        className="text-rose-600 hover:text-rose-700"
      >
        <Trash2Icon className="size-3.5" /> 삭제
      </Button>
    </fetcher.Form>
  );
}
