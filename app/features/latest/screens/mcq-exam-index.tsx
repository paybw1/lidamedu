// 통합 1차 모의고사 색인 (feat-10-005) — /latest/mcq/exams.
// 시험 = 여러 교시(mcq_packs) 묶음. 명칭 클릭 → 시험 러너.
// 출제·편집은 운영자 화면(/admin/mcq-exams) 으로 분리됨.

import { LayersIcon, PencilIcon } from "lucide-react";
import { Link, data } from "react-router";

import { cn } from "~/core/lib/utils";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  IndexCard,
  LatestEmpty,
  Pill,
} from "~/features/latest/components/latest-list";
import { MockExamShell } from "~/features/mcq-exams/components/mock-exam-shell";
import makeServerClient from "~/core/lib/supa-client.server";
import type { McqExamItem } from "~/features/mcq-exams/labels";
import { listExams } from "~/features/mcq-exams/queries.server";

import type { Route } from "./+types/mcq-exam-index";

export const meta: Route.MetaFunction = () => [
  { title: "1차 통합 모의고사 | 리담변리사학원" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const exams = await listExams(client);
  const role = await getStaffRole(client, user.id);
  return { exams, isStaff: role !== null };
}

const COLUMNS = ["No", "명칭", "교시", "합격 평균", "연도"];

export default function McqExamIndex({ loaderData }: Route.ComponentProps) {
  const { exams, isStaff } = loaderData;

  return (
    <MockExamShell
      category="full"
      width="index"
      title="1차 통합 모의고사"
      desc={`${exams.length.toLocaleString("ko-KR")}건 — 산업재산권법·민법·자연과학을 한 시험으로 묶어 과목별 과락과 전 과목 평균으로 합격을 판정합니다.`}
    >
      {exams.length === 0 ? (
        <LatestEmpty
          icon={LayersIcon}
          tone="neutral"
          title="아직 등록된 통합 모의고사가 없습니다"
          body="통합 모의고사가 등록되면 이곳에 모입니다."
        />
      ) : (
        <IndexCard>
          <table className="w-full min-w-[680px] border-collapse">
            <thead>
              <tr className="border-border bg-muted/60 border-b">
                {COLUMNS.map((label, i) => (
                  <th
                    key={label}
                    className={cn(
                      "text-muted-foreground px-3 py-3 font-mono text-[11px] font-semibold tracking-[0.04em] whitespace-nowrap uppercase",
                      i === 0 || i === 2 || i === 3
                        ? "text-center"
                        : "text-left",
                    )}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {exams.map((e, i) => (
                <ExamRow
                  key={e.examId}
                  exam={e}
                  index={i + 1}
                  isStaff={isStaff}
                />
              ))}
            </tbody>
          </table>
        </IndexCard>
      )}
    </MockExamShell>
  );
}

function ExamRow({
  exam,
  index,
  isStaff,
}: {
  exam: McqExamItem;
  index: number;
  isStaff: boolean;
}) {
  return (
    <tr className="border-border/60 hover:bg-muted/40 border-b transition-colors">
      <td className="text-muted-foreground px-3 py-3 text-center text-[13px] tabular-nums">
        {index}
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={`/latest/mcq/exam/${exam.examId}`}
            viewTransition
            className="hover:text-link text-[13px] font-semibold"
          >
            {exam.title}
          </Link>
          {exam.paperCount === 0 ? (
            <Pill tone="rose">교시 미구성</Pill>
          ) : null}
          {isStaff ? (
            <Link
              to={`/admin/mcq-exams/${exam.examId}`}
              viewTransition
              className="text-muted-foreground hover:text-link ml-auto inline-flex items-center gap-1 text-[11px] font-semibold"
            >
              <PencilIcon className="size-3" /> 수정
            </Link>
          ) : null}
        </div>
        {exam.description ? (
          <p className="text-muted-foreground mt-0.5 line-clamp-1 text-xs">
            {exam.description}
          </p>
        ) : null}
      </td>
      <td className="px-3 py-3 text-center text-[13px] tabular-nums">
        {exam.paperCount}교시
      </td>
      <td className="px-3 py-3 text-center text-[13px] tabular-nums">
        {exam.passAverage}점
      </td>
      <td className="text-muted-foreground px-3 py-3 text-[13px] tabular-nums">
        {exam.year
          ? `${exam.year}년${exam.examRoundNo ? ` ${exam.examRoundNo}회` : ""}`
          : "—"}
      </td>
    </tr>
  );
}
