// 강사 — 신규 훈련 항목 생성: 판례 선택 화면.
// official_text_md 있는 판례 우선 노출 (AI 초안 생성 가능). 검색 = case_number OR case_title.

import { SearchIcon, ChevronRightIcon, AlertCircleIcon } from "lucide-react";
import { Form, data } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import makeServerClient from "~/core/lib/supa-client.server";
import { Chip } from "~/features/community/components/community-ui";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/admin-case-training-new";

export const meta: Route.MetaFunction = () => [
  { title: "판례 선택 — 판례 기반 훈련 출제 | 리담변리사학원" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";

  let query = client
    .from("cases")
    .select(
      "case_id, case_title, case_number, court, decided_at, official_text_md",
      { count: "exact" },
    )
    .is("deleted_at", null)
    .order("decided_at", { ascending: false })
    .limit(40);
  if (q) {
    query = query.or(
      `case_number.ilike.%${q}%,case_title.ilike.%${q}%`,
    );
  } else {
    // 검색어 없으면 전문 있는 판례 우선.
    query = query.not("official_text_md", "is", null);
  }
  const { data: rows, error } = await query;
  if (error) throw error;
  return {
    q,
    cases: (rows ?? []).map((r) => ({
      caseId: r.case_id,
      caseTitle: r.case_title,
      caseNumber: r.case_number,
      court: r.court,
      decidedAt: r.decided_at,
      hasOfficialText: !!r.official_text_md,
    })),
  };
}

export default function AdminCaseTrainingNew({
  loaderData,
}: Route.ComponentProps) {
  const { q, cases } = loaderData;
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight">
          판례 선택 — 훈련 항목 신규 출제
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          전문이 적재된 판례를 선택해야 AI 초안(사실관계·쟁점) 생성이 가능합니다.
        </p>
      </header>

      <Form method="get" className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <SearchIcon className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
          <Input
            name="q"
            defaultValue={q}
            placeholder="사건번호 또는 사건명 검색"
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="outline" className="rounded-full">
          검색
        </Button>
      </Form>

      {cases.length === 0 ? (
        <div className="border-border bg-card text-muted-foreground rounded-2xl border p-8 text-center text-sm">
          검색 결과 없음.
        </div>
      ) : (
        <ul className="space-y-2">
          {cases.map((c) => (
            <li
              key={c.caseId}
              className="border-border bg-card rounded-xl border p-3 shadow-sm"
            >
              <Form method="post" action="/api/case-training/item">
                <input type="hidden" name="intent" value="create" />
                <input type="hidden" name="caseId" value={c.caseId} />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Chip tone="outline">{c.caseNumber}</Chip>
                      <Chip tone="outline">{c.court}</Chip>
                      <Chip tone="outline">{c.decidedAt}</Chip>
                      {!c.hasOfficialText ? (
                        <Chip tone="coral">
                          <AlertCircleIcon className="size-3" /> 전문 없음
                        </Chip>
                      ) : null}
                    </div>
                    <p className="text-foreground mt-1 text-sm font-bold">
                      {c.caseTitle || "(제목 없음)"}
                    </p>
                  </div>
                  <Button
                    type="submit"
                    size="sm"
                    className="rounded-full"
                    disabled={!c.hasOfficialText}
                  >
                    선택 <ChevronRightIcon className="size-3" />
                  </Button>
                </div>
              </Form>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
