// 강사 — 신규 훈련 항목 생성: 소스 선택(판례 | 2차 기출 문항).
// 판례: official_text_md 있는 판례 우선 노출 (AI 초안 생성 가능). 검색 = case_number OR case_title.
// 기출(feat-2-028): exam_round=second 주관식 — 발문이 지문. 이미 출제된 문항은 비활성.

import {
  SearchIcon,
  ChevronRightIcon,
  AlertCircleIcon,
  ScaleIcon,
  FileTextIcon,
} from "lucide-react";
import { Form, Link, data } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import makeServerClient from "~/core/lib/supa-client.server";
import { cn } from "~/core/lib/utils";
import { Chip } from "~/features/community/components/community-ui";
import { getStaffRole } from "~/features/laws/queries.server";
import { LAW_SUBJECTS } from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-case-training-new";

export const meta: Route.MetaFunction = () => [
  { title: "소스 선택 — 쟁점·목차 훈련 출제 | 리담변리사학원" },
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
  const src = url.searchParams.get("src") === "problem" ? "problem" : "case";

  if (src === "problem") {
    // 이미 출제된 문항 표시용.
    const { data: existing } = await client
      .from("case_training_items")
      .select("problem_id")
      .not("problem_id", "is", null)
      .is("deleted_at", null);
    const usedIds = new Set(
      (existing ?? []).map((e) => e.problem_id).filter(Boolean),
    );

    let query = client
      .from("problems")
      .select(
        "problem_id, year, problem_number, body_md, explanation_md, laws ( law_code )",
      )
      .eq("exam_round", "second")
      .is("deleted_at", null)
      .order("year", { ascending: false })
      .order("problem_number", { ascending: true })
      .limit(40);
    if (q) {
      if (/^\d{4}$/.test(q)) query = query.eq("year", Number(q));
      else query = query.ilike("body_md", `%${q}%`);
    }
    const { data: rows, error } = await query;
    if (error) throw error;
    return {
      q,
      src,
      cases: [],
      problems: (rows ?? []).map((p) => ({
        problemId: p.problem_id,
        lawCode: (p.laws as { law_code: string } | null)?.law_code ?? null,
        year: p.year,
        problemNumber: p.problem_number,
        bodyHead: (p.body_md ?? "").replace(/\s+/g, " ").slice(0, 140),
        hasExplanation: !!(p.explanation_md ?? "").trim(),
        alreadyUsed: usedIds.has(p.problem_id),
      })),
    };
  }

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
    query = query.or(`case_number.ilike.%${q}%,case_title.ilike.%${q}%`);
  } else {
    // 검색어 없으면 전문 있는 판례 우선.
    query = query.not("official_text_md", "is", null);
  }
  const { data: rows, error } = await query;
  if (error) throw error;
  return {
    q,
    src,
    problems: [],
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
  const { q, src, cases, problems } = loaderData;
  const isProblem = src === "problem";
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <header className="mb-4">
        <h1 className="text-2xl font-extrabold tracking-tight">
          훈련 항목 신규 출제 — 소스 선택
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {isProblem
            ? "2차 기출 문항의 발문이 지문이 됩니다. 해설·채점평이 있으면 AI 쟁점 초안 품질이 좋아집니다."
            : "전문이 적재된 판례를 선택해야 AI 초안(사실관계·쟁점) 생성이 가능합니다."}
        </p>
      </header>

      {/* 소스 탭 */}
      <div className="mb-4 flex gap-1.5">
        <Button
          asChild
          size="sm"
          variant={isProblem ? "outline" : "default"}
          className="rounded-full"
        >
          <Link to="/admin/case-training/new">
            <ScaleIcon className="size-3.5" /> 판례
          </Link>
        </Button>
        <Button
          asChild
          size="sm"
          variant={isProblem ? "default" : "outline"}
          className="rounded-full"
        >
          <Link to="/admin/case-training/new?src=problem">
            <FileTextIcon className="size-3.5" /> 2차 기출 문항
          </Link>
        </Button>
      </div>

      <Form method="get" className="mb-4 flex gap-2">
        {isProblem ? <input type="hidden" name="src" value="problem" /> : null}
        <div className="relative flex-1">
          <SearchIcon className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
          <Input
            name="q"
            defaultValue={q}
            placeholder={
              isProblem ? "연도(예: 2024) 또는 발문 검색" : "사건번호 또는 사건명 검색"
            }
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="outline" className="rounded-full">
          검색
        </Button>
      </Form>

      {isProblem ? (
        problems.length === 0 ? (
          <div className="border-border bg-card text-muted-foreground rounded-2xl border p-8 text-center text-sm">
            검색 결과 없음.
          </div>
        ) : (
          <ul className="space-y-2">
            {problems.map((p) => (
              <li
                key={p.problemId}
                className={cn(
                  "border-border bg-card rounded-xl border p-3 shadow-sm",
                  p.alreadyUsed && "opacity-60",
                )}
              >
                <Form method="post" action="/api/case-training/item">
                  <input type="hidden" name="intent" value="create_problem" />
                  <input type="hidden" name="problemId" value={p.problemId} />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Chip tone="outline">
                          {p.lawCode
                            ? (LAW_SUBJECTS[
                                p.lawCode as keyof typeof LAW_SUBJECTS
                              ]?.name ?? p.lawCode)
                            : "과목 미상"}
                        </Chip>
                        <Chip tone="outline">
                          {p.year ?? "—"}년 제{p.problemNumber ?? "—"}문
                        </Chip>
                        {p.hasExplanation ? (
                          <Chip tone="emerald">해설 있음</Chip>
                        ) : (
                          <Chip tone="outline">해설 없음</Chip>
                        )}
                        {p.alreadyUsed ? (
                          <Chip tone="coral">이미 출제됨</Chip>
                        ) : null}
                      </div>
                      <p className="text-foreground mt-1 line-clamp-2 text-sm">
                        {p.bodyHead}
                      </p>
                    </div>
                    <Button
                      type="submit"
                      size="sm"
                      className="rounded-full"
                      disabled={p.alreadyUsed}
                    >
                      선택 <ChevronRightIcon className="size-3" />
                    </Button>
                  </div>
                </Form>
              </li>
            ))}
          </ul>
        )
      ) : cases.length === 0 ? (
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
