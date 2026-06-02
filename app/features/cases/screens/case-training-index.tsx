// 학생 — 판례 기반 쟁점추출 훈련 목록 (승인된 항목만).

import { Link, data } from "react-router";

import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";
import { Chip } from "~/features/community/components/community-ui";
import { listApprovedCaseTrainingItems } from "~/features/cases/queries-case-training.server";

import type { Route } from "./+types/case-training-index";

export const meta: Route.MetaFunction = () => [
  { title: "판례 기반 쟁점추출 훈련 | Lidam" },
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

export default function CaseTrainingIndex({ loaderData }: Route.ComponentProps) {
  const { items } = loaderData;
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight">
          판례 기반 쟁점추출 훈련
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          강사가 선별한 판례의 사실관계를 읽고 백지에서 쟁점을 추출해보세요.
          채점 후에 판례 전문이 공개됩니다.
        </p>
      </header>

      {items.length === 0 ? (
        <div className="border-border bg-card text-muted-foreground rounded-2xl border p-8 text-center text-sm">
          아직 공개된 훈련 항목이 없습니다.
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((it) => {
            const conclusionReady = it.conclusionReadyCount >= 2;
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
                    <Chip tone="outline">{it.caseRef.court}</Chip>
                    <Chip tone="outline">{it.caseRef.decidedAt}</Chip>
                    {conclusionReady ? (
                      <Chip tone="primary">③④ 결론·강약 가능</Chip>
                    ) : null}
                  </div>
                  <p className="text-foreground mt-1 text-base font-bold">
                    {it.caseRef.caseTitle}
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    사실관계 약 {it.factsSummaryMd.length}자 — 1~2분 안에 읽고
                    쟁점을 떠올려보세요.
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
