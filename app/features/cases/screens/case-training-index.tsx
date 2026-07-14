// 학생 — 목차잡기 목록 (승인된 항목만). 소스 = 판례 사실관계 | 2차 기출 발문.

import { Link, data } from "react-router";

import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";
import { GuideHelpButton } from "~/features/guide/components/guide-help-button";
import { Chip } from "~/features/community/components/community-ui";
import { listApprovedCaseTrainingItems } from "~/features/cases/queries-case-training.server";
import { LAW_SUBJECTS } from "~/features/subjects/lib/subjects";
import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/case-training-index";

export const meta: Route.MetaFunction = () => [
  { title: "목차잡기 | 리담변리사학원" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const items = await listApprovedCaseTrainingItems(client);
  return { items };
}

function subjectName(lawCode: string | null): string | null {
  if (!lawCode) return null;
  return LAW_SUBJECTS[lawCode as LawSubjectSlug]?.name ?? lawCode;
}

export default function CaseTrainingIndex({ loaderData }: Route.ComponentProps) {
  const { items } = loaderData;
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight">
            목차잡기
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            판례 사실관계 또는 2차 기출 발문을 읽고 백지에서 쟁점을 추출한 뒤,
            결론과 목차·강약까지 정리해 보세요. 채점 후에 기준이 공개됩니다.
          </p>
        </div>
        <GuideHelpButton screenKey="case-training" />
      </header>

      {items.length === 0 ? (
        <div className="border-border bg-card text-muted-foreground rounded-2xl border p-8 text-center text-sm">
          아직 공개된 훈련 항목이 없습니다.
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((it) => {
            const conclusionReady = it.conclusionReadyCount >= 2;
            const p = it.problemRef;
            return (
              <li
                key={it.itemId}
                className="border-border bg-card rounded-2xl border p-4 shadow-sm"
              >
                <Link
                  to={`/case-training/${it.itemId}`}
                  prefetch="intent"
                  className="block"
                >
                  <div className="flex flex-wrap items-baseline gap-1.5">
                    {p ? (
                      <>
                        <Chip tone="primary">2차 기출</Chip>
                        <Chip tone="outline">
                          {subjectName(p.lawCode) ?? "과목 미상"}
                        </Chip>
                        <Chip tone="outline">
                          {p.year ?? "—"}년 제{p.problemNumber ?? "—"}문
                        </Chip>
                      </>
                    ) : (
                      <>
                        <Chip tone="outline">판례</Chip>
                        <Chip tone="outline">{it.caseRef.court}</Chip>
                        <Chip tone="outline">{it.caseRef.decidedAt}</Chip>
                      </>
                    )}
                    {conclusionReady ? (
                      <Chip tone="primary">③④ 결론·강약 가능</Chip>
                    ) : null}
                  </div>
                  <p className="text-foreground mt-1 text-base font-bold">
                    {p
                      ? p.bodyMd.replace(/\s+/g, " ").slice(0, 80) ||
                        "(발문 없음)"
                      : it.caseRef.caseTitle}
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {p
                      ? "실제 2차 기출 발문 — 답안에서 다뤄야 할 쟁점을 떠올려 보세요."
                      : `사실관계 약 ${it.factsSummaryMd.length}자 — 1~2분 안에 읽고 쟁점을 떠올려 보세요.`}
                  </p>
                </Link>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button asChild size="sm" className="rounded-full">
                    <Link to={`/case-training/${it.itemId}`} prefetch="intent">
                      ② 쟁점추출 →
                    </Link>
                  </Button>
                  {conclusionReady ? (
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      className="rounded-full"
                    >
                      <Link
                        to={`/case-training/${it.itemId}/conclusion`}
                        prefetch="intent"
                      >
                        ③④ 결론·강약 →
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
