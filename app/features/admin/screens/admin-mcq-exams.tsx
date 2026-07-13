// 통합 모의고사 출제 — 목록 (feat-10-005). /admin/mcq-exams.
// 전체 시험(공개·비공개) 목록 + 시험 추가. 명칭 클릭 → 시험별 편집(교시 구성).

import { PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { Link, data, useFetcher, useNavigate } from "react-router";

import { Button } from "~/core/components/ui/button";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip, IndexTable, TD, TR } from "~/features/admin/components/admin-ui";
import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { ExamForm } from "~/features/mcq-exams/components/exam-form";
import type { McqExamItem } from "~/features/mcq-exams/labels";
import { listExams } from "~/features/mcq-exams/queries.server";

import type { Route } from "./+types/admin-mcq-exams";

export const meta: Route.MetaFunction = () => [
  { title: "통합 모의고사 출제 | 리담변리사학원" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });
  const exams = await listExams(client);
  return { exams, role };
}

export default function AdminMcqExams({ loaderData }: Route.ComponentProps) {
  const { exams, role } = loaderData;
  const [showAdd, setShowAdd] = useState(false);
  const navigate = useNavigate();

  return (
    <AdminShell
      cluster="problems"
      role={role}
      title="통합 모의고사 출제"
      desc="여러 교시(과목별 모의고사 문제집)를 한 시험으로 묶어 운영합니다. 시험을 추가한 뒤 편집 화면에서 교시를 구성하세요."
      headerRight={
        !showAdd ? (
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <PlusIcon className="size-3.5" /> 시험 추가
          </Button>
        ) : undefined
      }
    >
      {showAdd ? (
        <div className="mb-4">
          <ExamForm
            mode="create"
            onCancel={() => setShowAdd(false)}
            onSaved={({ examId }) => {
              setShowAdd(false);
              if (examId) navigate(`/admin/mcq-exams/${examId}`);
            }}
          />
        </div>
      ) : null}

      {exams.length === 0 ? (
        <div className="border-border bg-card text-muted-foreground rounded-xl border py-16 text-center text-sm shadow-sm">
          아직 등록된 통합 모의고사가 없습니다. 우측 상단 ‘시험 추가’로
          시작하세요.
        </div>
      ) : (
        <IndexTable
          minWidth={760}
          headers={[
            { label: "명칭" },
            { label: "교시", align: "center", width: "6rem" },
            { label: "합격 평균", align: "center", width: "7rem" },
            { label: "연도/회차", width: "8rem" },
            { label: "공개", align: "center", width: "6rem" },
            { label: "", align: "right", width: "4rem" },
          ]}
          footer={
            <div className="border-border/60 text-muted-foreground border-t px-3 py-2 text-[11px] font-medium tabular-nums">
              총 {exams.length}건
            </div>
          }
        >
          {exams.map((e) => (
            <ExamRow key={e.examId} exam={e} />
          ))}
        </IndexTable>
      )}
    </AdminShell>
  );
}

function ExamRow({ exam }: { exam: McqExamItem }) {
  return (
    <TR>
      <TD>
        <Link
          to={`/admin/mcq-exams/${exam.examId}`}
          className="text-link font-semibold hover:underline"
        >
          {exam.title}
        </Link>
        {exam.description ? (
          <p className="text-muted-foreground mt-0.5 line-clamp-1 text-xs font-normal">
            {exam.description}
          </p>
        ) : null}
      </TD>
      <TD align="center">
        {exam.paperCount === 0 ? (
          <Chip tone="coral">미구성</Chip>
        ) : (
          `${exam.paperCount}교시`
        )}
      </TD>
      <TD align="center" soft>
        {exam.passAverage}점
      </TD>
      <TD mono soft>
        {exam.year
          ? `${exam.year}${exam.examRoundNo ? `-${exam.examRoundNo}` : ""}`
          : "—"}
      </TD>
      <TD align="center">
        {exam.isPublished ? (
          <Chip tone="emerald">공개</Chip>
        ) : (
          <Chip tone="amber">비공개</Chip>
        )}
      </TD>
      <TD align="right">
        <DeleteExamButton examId={exam.examId} title={exam.title} />
      </TD>
    </TR>
  );
}

// 삭제 — /api/admin/mcq-exam(intent=delete)는 성공 시 /admin/mcq-exams 로
// redirect 하므로 목록이 자동 갱신된다.
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
        size="icon"
        variant="ghost"
        aria-label="시험 삭제"
        disabled={fetcher.state !== "idle"}
        className="size-8 rounded-full text-rose-600 hover:text-rose-700"
      >
        <Trash2Icon className="size-3.5" />
      </Button>
    </fetcher.Form>
  );
}
