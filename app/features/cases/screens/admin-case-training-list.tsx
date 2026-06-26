// 강사 — 판례 기반 쟁점추출 훈련 항목 목록.
// 승인/초안/거절 상태 + 쟁점 수. 신규 등록 버튼.

import { CheckCircle2Icon, CircleDashedIcon, PlusIcon, XCircleIcon } from "lucide-react";
import { Link, data } from "react-router";

import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";
import { Chip } from "~/features/community/components/community-ui";
import { listCaseTrainingItemsForStaff } from "~/features/cases/queries-case-training.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/admin-case-training-list";

export const meta: Route.MetaFunction = () => [
  { title: "판례 기반 쟁점추출 훈련 — 출제 관리 | 리담변리사학원" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });
  const items = await listCaseTrainingItemsForStaff(client);
  return { items };
}

export default function AdminCaseTrainingList({ loaderData }: Route.ComponentProps) {
  const { items } = loaderData;
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <header className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            판례 기반 쟁점추출 훈련
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            강사가 선별한 판례 + 사실관계 요약 + 쟁점 목록으로 학생 훈련 출제.
          </p>
        </div>
        <Button asChild className="rounded-full">
          <Link to="/admin/case-training/new">
            <PlusIcon className="size-4" /> 신규 출제
          </Link>
        </Button>
      </header>

      {items.length === 0 ? (
        <div className="border-border bg-card text-muted-foreground rounded-2xl border p-8 text-center text-sm">
          아직 등록된 훈련 항목이 없습니다. "신규 출제" 로 판례를 선택해
          시작하세요.
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((it) => (
            <li
              key={it.itemId}
              className="border-border bg-card rounded-2xl border p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusChip status={it.reviewStatus} />
                    <Chip tone="outline">{it.caseRef.caseNumber}</Chip>
                    <Chip tone="outline">{it.caseRef.court}</Chip>
                    <Chip tone="outline">{it.caseRef.decidedAt}</Chip>
                  </div>
                  <p className="text-foreground mt-1 font-bold">
                    {it.caseRef.caseTitle || "(제목 없음)"}
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    쟁점{" "}
                    <strong className="text-foreground tabular-nums">
                      {it.approvedIssueCount}
                    </strong>
                    /{it.issueCount}건 승인 · 사실관계{" "}
                    {it.factsSummaryMd.length > 0
                      ? `${it.factsSummaryMd.length}자`
                      : "없음"}{" "}
                    ({it.factsGeneratedBy === "ai" ? "AI 초안" : "직접 작성"})
                  </p>
                </div>
                <Button asChild size="sm" variant="outline" className="rounded-full">
                  <Link to={`/admin/case-training/${it.itemId}`}>편집</Link>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function StatusChip({ status }: { status: "draft" | "approved" | "rejected" }) {
  if (status === "approved")
    return (
      <Chip tone="emerald">
        <CheckCircle2Icon className="size-3" /> 승인됨
      </Chip>
    );
  if (status === "rejected")
    return (
      <Chip tone="coral">
        <XCircleIcon className="size-3" /> 반려
      </Chip>
    );
  return (
    <Chip tone="outline">
      <CircleDashedIcon className="size-3" /> 초안
    </Chip>
  );
}
