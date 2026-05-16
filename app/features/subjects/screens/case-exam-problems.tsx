// 판례 화면의 기출 chip ("1차 2019" 등) 클릭 진입 — 그 판례와 매칭된 그 회차/연도 문제를 보여준다.
//
// 매칭 흐름:
// 1. problem_case_links 의 명시적 매핑 (확정 매칭)
// 2. problems 본문/choices/box_items 의 case_number 자연어 매칭 (자동 매칭 제안 — staff 만 봄)
// 3. staff 가 그 외 그 회차/연도의 past_exam 문제를 직접 골라 매핑 추가 가능 (수동)
//
// 결과 1개(확정 매칭)인 학생 진입은 자동으로 problem-viewer 로 redirect 한다.
//
// 운영자 검토 보조: 각 문제 row 를 펼치면 지문/해설을 inline 으로 본다. problem-viewer 까지
// 들어가 다시 돌아오지 않아도 매핑 적합 여부 판단 가능.

import {
  ArrowLeftIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  LinkIcon,
  PlusIcon,
} from "lucide-react";
import { useState } from "react";
import { Form, Link, data, redirect } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import makeServerClient from "~/core/lib/supa-client.server";
import { getCaseById } from "~/features/cases/queries.server";
import {
  getLawByCode,
  getStaffRole,
} from "~/features/laws/queries.server";
import {
  LAW_SUBJECTS,
  lawSubjectSlugSchema,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/case-exam-problems";

const ROUNDS = ["first", "second"] as const;
type ExamRound = (typeof ROUNDS)[number];

function isRound(s: string): s is ExamRound {
  return (ROUNDS as readonly string[]).includes(s);
}

interface ChoiceRow {
  choiceIndex: number;
  bodyMd: string;
  isCorrect: boolean;
  explanationMd: string | null;
}

interface BoxItemRow {
  marker: string;
  bodyMd: string;
  explanationMd: string | null;
}

interface ProblemRow {
  problemId: string;
  format: string;
  problemNumber: number | null;
  bodyMd: string;
  explanationMd: string | null;
  choices: ChoiceRow[];
  boxItems: BoxItemRow[];
}

export const meta: Route.MetaFunction = ({ data: ld }) => {
  if (!ld) return [{ title: "판례 기출 문제 | Lidam Patent Attorney Academy" }];
  const roundKr = ld.round === "first" ? "1차" : "2차";
  return [
    {
      title: `${ld.kase.caseNumber} · ${ld.year} ${roundKr} | Lidam Patent Attorney Academy`,
    },
  ];
};

export async function loader({ params, request }: Route.LoaderArgs) {
  const subjectParse = lawSubjectSlugSchema.safeParse(params.subject);
  if (!subjectParse.success) throw data("Unknown subject", { status: 404 });
  const lawCode = subjectParse.data;
  if (!params.caseId) throw data("Missing caseId", { status: 404 });
  if (!params.round || !isRound(params.round)) {
    throw data("Invalid round", { status: 400 });
  }
  const round = params.round;
  const year = Number(params.year);
  if (!Number.isFinite(year) || year < 1990 || year > 2099) {
    throw data("Invalid year", { status: 400 });
  }

  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const law = await getLawByCode(client, lawCode);
  if (!law) throw data("Law not seeded", { status: 404 });

  const kase = await getCaseById(client, params.caseId);
  if (!kase) throw data("Case not found", { status: 404 });

  const role = await getStaffRole(client, user.id);
  const isStaff = role === "instructor" || role === "admin";

  // 1) 명시적 매핑 — problem_case_links 의 problems (그 round/year/law 의 past_exam 만).
  const { data: linkRows } = await client
    .from("problem_case_links")
    .select(
      "problems!inner(problem_id, format, problem_number, body_md, explanation_md, origin, exam_round, year, deleted_at, law_id)",
    )
    .eq("case_id", kase.caseId);
  type RawProblem = {
    problem_id: string;
    format: string;
    problem_number: number | null;
    body_md: string | null;
    explanation_md: string | null;
  };
  const matchedRaws: RawProblem[] = [];
  const matchedIds = new Set<string>();
  for (const r of linkRows ?? []) {
    const p = r.problems;
    if (!p || p.deleted_at) continue;
    if (
      p.law_id !== law.lawId ||
      p.origin !== "past_exam" ||
      p.exam_round !== round ||
      p.year !== year
    ) {
      continue;
    }
    if (matchedIds.has(p.problem_id)) continue;
    matchedIds.add(p.problem_id);
    matchedRaws.push({
      problem_id: p.problem_id,
      format: p.format,
      problem_number: p.problem_number,
      body_md: p.body_md,
      explanation_md: p.explanation_md,
    });
  }
  matchedRaws.sort(
    (a, b) => (a.problem_number ?? 0) - (b.problem_number ?? 0),
  );

  // 학생 자동 redirect — 확정 매핑 1건이면 그 문제 viewer 로 직진.
  if (!isStaff && matchedRaws.length === 1) {
    throw redirect(
      `/subjects/${lawCode}/problems/${matchedRaws[0].problem_id}`,
    );
  }

  // 2) 자동 매칭 후보 — 본문에 case_number 포함된 problems (아직 명시적 매핑 안 됨).
  //    검색 패턴 — case_number 원문 그대로 ilike. SQL injection 차단 위해 % 만 제거.
  const safeCaseNumber = kase.caseNumber.replaceAll("%", "");
  const autoMatchRaws: RawProblem[] = [];
  const autoMatchedIds = new Set<string>();
  if (safeCaseNumber.length > 0) {
    const { data: bodyHits } = await client
      .from("problems")
      .select("problem_id, format, problem_number, body_md, explanation_md")
      .eq("law_id", law.lawId)
      .eq("origin", "past_exam")
      .eq("exam_round", round)
      .eq("year", year)
      .is("deleted_at", null)
      .ilike("body_md", `%${safeCaseNumber}%`);
    for (const p of bodyHits ?? []) {
      if (matchedIds.has(p.problem_id)) continue;
      if (autoMatchedIds.has(p.problem_id)) continue;
      autoMatchedIds.add(p.problem_id);
      autoMatchRaws.push(p);
    }
    // 보너스 — choices/box_items 본문 검색 (1단계 lookup: 어느 problem_id 인지).
    const { data: choiceHits } = await client
      .from("problem_choices")
      .select(
        "problem_id, problems!inner(problem_id, format, problem_number, body_md, explanation_md, origin, exam_round, year, deleted_at, law_id)",
      )
      .ilike("body_md", `%${safeCaseNumber}%`);
    for (const c of choiceHits ?? []) {
      const p = c.problems;
      if (
        !p ||
        p.deleted_at ||
        p.law_id !== law.lawId ||
        p.origin !== "past_exam" ||
        p.exam_round !== round ||
        p.year !== year
      ) {
        continue;
      }
      if (matchedIds.has(p.problem_id)) continue;
      if (autoMatchedIds.has(p.problem_id)) continue;
      autoMatchedIds.add(p.problem_id);
      autoMatchRaws.push({
        problem_id: p.problem_id,
        format: p.format,
        problem_number: p.problem_number,
        body_md: p.body_md,
        explanation_md: p.explanation_md,
      });
    }
    autoMatchRaws.sort(
      (a, b) => (a.problem_number ?? 0) - (b.problem_number ?? 0),
    );
  }

  // 3) 운영자 수동 매핑 후보 — 그 round/year/law 의 모든 past_exam 문제 중 위 두 그룹에 없는 것.
  //    staff 만 노출.
  let candidateRaws: RawProblem[] = [];
  if (isStaff) {
    const { data: candidates } = await client
      .from("problems")
      .select("problem_id, format, problem_number, body_md, explanation_md")
      .eq("law_id", law.lawId)
      .eq("origin", "past_exam")
      .eq("exam_round", round)
      .eq("year", year)
      .is("deleted_at", null)
      .order("problem_number", { ascending: true, nullsFirst: false })
      .limit(200);
    candidateRaws = (candidates ?? []).filter(
      (p) =>
        !matchedIds.has(p.problem_id) && !autoMatchedIds.has(p.problem_id),
    );
  }

  // 4) 모든 문제(matched + auto + candidate) 의 choices / box_items 를 한 번에 fetch.
  //    inline expand 영역에서 노출.
  const allProblemIds = [
    ...matchedRaws.map((p) => p.problem_id),
    ...autoMatchRaws.map((p) => p.problem_id),
    ...candidateRaws.map((p) => p.problem_id),
  ];
  const choicesByProblem = new Map<string, ChoiceRow[]>();
  const boxItemsByProblem = new Map<string, BoxItemRow[]>();
  if (allProblemIds.length > 0) {
    const [{ data: cRows }, { data: bRows }] = await Promise.all([
      client
        .from("problem_choices")
        .select("problem_id, choice_index, body_md, is_correct, explanation_md")
        .in("problem_id", allProblemIds)
        .order("choice_index", { ascending: true }),
      client
        .from("problem_box_items")
        .select("problem_id, position_index, marker, body_md, explanation_md")
        .in("problem_id", allProblemIds)
        .order("position_index", { ascending: true }),
    ]);
    for (const c of cRows ?? []) {
      const arr = choicesByProblem.get(c.problem_id) ?? [];
      arr.push({
        choiceIndex: c.choice_index,
        bodyMd: c.body_md ?? "",
        isCorrect: c.is_correct,
        explanationMd: c.explanation_md,
      });
      choicesByProblem.set(c.problem_id, arr);
    }
    for (const b of bRows ?? []) {
      const arr = boxItemsByProblem.get(b.problem_id) ?? [];
      arr.push({
        marker: b.marker,
        bodyMd: b.body_md ?? "",
        explanationMd: b.explanation_md,
      });
      boxItemsByProblem.set(b.problem_id, arr);
    }
  }

  function toRow(p: RawProblem): ProblemRow {
    return {
      problemId: p.problem_id,
      format: p.format,
      problemNumber: p.problem_number,
      bodyMd: p.body_md ?? "",
      explanationMd: p.explanation_md,
      choices: choicesByProblem.get(p.problem_id) ?? [],
      boxItems: boxItemsByProblem.get(p.problem_id) ?? [],
    };
  }
  const matchedProblems = matchedRaws.map(toRow);
  const autoMatchProblems = autoMatchRaws.map(toRow);
  const candidateProblems = candidateRaws.map(toRow);

  return {
    subject: LAW_SUBJECTS[lawCode],
    kase: {
      caseId: kase.caseId,
      caseNumber: kase.caseNumber,
      caseTitle: kase.caseTitle,
    },
    round,
    year,
    isStaff,
    matchedProblems,
    autoMatchProblems,
    candidateProblems,
  };
}

export async function action({ params, request }: Route.ActionArgs) {
  const subjectParse = lawSubjectSlugSchema.safeParse(params.subject);
  if (!subjectParse.success) return { ok: false, error: "Invalid subject" } as const;
  if (!params.caseId) return { ok: false, error: "Missing caseId" } as const;

  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" } as const;
  const role = await getStaffRole(client, user.id);
  if (role !== "instructor" && role !== "admin") {
    return { ok: false, error: "Forbidden" } as const;
  }

  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "");
  if (intent !== "link") return { ok: false, error: "Unknown intent" } as const;

  const problemId = String(fd.get("problemId") ?? "").trim();
  if (!problemId) return { ok: false, error: "Missing problemId" } as const;

  // 중복 INSERT 방지 — 이미 같은 (problem_id, case_id) 가 있는지 확인.
  const { data: existing } = await client
    .from("problem_case_links")
    .select("link_id")
    .eq("problem_id", problemId)
    .eq("case_id", params.caseId)
    .maybeSingle();
  if (existing) return { ok: true, linkedSame: true } as const;

  const { error } = await client.from("problem_case_links").insert({
    problem_id: problemId,
    case_id: params.caseId,
    created_by: user.id,
  });
  if (error) return { ok: false, error: error.message } as const;
  return { ok: true } as const;
}

export default function CaseExamProblems({
  loaderData,
}: Route.ComponentProps) {
  const {
    subject,
    kase,
    round,
    year,
    isStaff,
    matchedProblems,
    autoMatchProblems,
    candidateProblems,
  } = loaderData;
  const roundKr = round === "first" ? "1차" : "2차";

  return (
    <div className="mx-auto w-full max-w-screen-lg px-5 py-6 md:px-10 md:py-8">
      <Link
        to={`/subjects/${subject.slug}/cases/${kase.caseId}`}
        viewTransition
        className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeftIcon className="size-4" /> 판례로 돌아가기
      </Link>
      <header className="mb-6 space-y-2">
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          {subject.name} · {roundKr} {year}년 기출
        </p>
        <h1 className="text-2xl font-bold tracking-tight">
          이 판례를 다룬 기출 문제
        </h1>
        <p className="text-muted-foreground text-sm">
          판례 <span className="font-mono">{kase.caseNumber}</span>
          {kase.caseTitle ? ` · ${kase.caseTitle}` : ""}
        </p>
      </header>

      {/* 확정 매핑 */}
      <Section
        title={`매칭된 문제 (${matchedProblems.length})`}
        emptyText={
          matchedProblems.length === 0
            ? "아직 명시적으로 매핑된 문제가 없습니다."
            : null
        }
      >
        {matchedProblems.map((p) => (
          <ProblemListRow
            key={p.problemId}
            subjectSlug={subject.slug}
            problem={p}
            caseNumber={kase.caseNumber}
            defaultExpanded={isStaff}
          />
        ))}
      </Section>

      {/* 자동 매칭 (운영자에게만 노출). 학생도 보면 혼란스러울 수 있어 staff 한정. */}
      {isStaff && autoMatchProblems.length > 0 ? (
        <Section
          title={`자동 매칭 후보 (${autoMatchProblems.length}) — 본문에 사건번호 포함`}
        >
          {autoMatchProblems.map((p) => (
            <ProblemListRow
              key={p.problemId}
              subjectSlug={subject.slug}
              problem={p}
              caseId={kase.caseId}
              caseNumber={kase.caseNumber}
              linkable
              accent="amber"
              note="본문에 사건번호 포함 — 매핑 추가 시 학생에게 노출됩니다."
              defaultExpanded
            />
          ))}
        </Section>
      ) : null}

      {/* 운영자 수동 매핑 후보 — 그 회차/연도의 다른 past_exam 문제 list. */}
      {isStaff ? (
        <Section
          title={`수동 매핑 후보 — 같은 회차의 다른 기출 문제 (${candidateProblems.length})`}
          emptyText={
            candidateProblems.length === 0
              ? "그 회차/연도의 과거시험 문제 데이터가 없거나 모두 이미 매칭/후보로 잡혔습니다."
              : null
          }
        >
          {candidateProblems.map((p) => (
            <ProblemListRow
              key={p.problemId}
              subjectSlug={subject.slug}
              problem={p}
              caseId={kase.caseId}
              caseNumber={kase.caseNumber}
              linkable
              accent="default"
              defaultExpanded
            />
          ))}
        </Section>
      ) : null}

      {/* 학생 — 매핑 없음 안내. */}
      {!isStaff && matchedProblems.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-8 text-center text-sm">
            아직 이 판례와 매핑된 {roundKr} {year}년 기출 문제가 없습니다.
            운영자가 매핑을 추가하면 이 화면에서 바로 풀이를 시작할 수 있습니다.
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Section({
  title,
  emptyText,
  children,
}: {
  title: string;
  emptyText?: string | null;
  children: React.ReactNode;
}) {
  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          {title}
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {emptyText ? (
          <p className="text-muted-foreground text-sm">{emptyText}</p>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

function ProblemListRow({
  subjectSlug,
  problem,
  caseId,
  caseNumber,
  linkable,
  accent,
  note,
  defaultExpanded,
}: {
  subjectSlug: string;
  problem: ProblemRow;
  caseId?: string;
  caseNumber?: string;
  linkable?: boolean;
  accent?: "default" | "amber";
  note?: string;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? false);
  const [showAllChoices, setShowAllChoices] = useState(false);
  const snippet =
    problem.bodyMd.length > 120 ? `${problem.bodyMd.slice(0, 120)}…` : problem.bodyMd;

  // 판례 인용 여부 — choice/box_item 의 body_md 또는 explanation_md 에 사건번호가 포함되었는지.
  // 사건번호가 없거나 본문에 안 들어 있으면 hasCase 가 모두 false 라 자연스럽게 모두 노출.
  const containsCase = (s: string | null | undefined): boolean =>
    !!caseNumber && !!s && s.includes(caseNumber);
  const choicesWithCase = problem.choices.filter(
    (c) => containsCase(c.bodyMd) || containsCase(c.explanationMd),
  );
  const choicesWithoutCase = problem.choices.filter(
    (c) => !containsCase(c.bodyMd) && !containsCase(c.explanationMd),
  );
  const boxItemsWithCase = problem.boxItems.filter(
    (b) => containsCase(b.bodyMd) || containsCase(b.explanationMd),
  );
  const boxItemsWithoutCase = problem.boxItems.filter(
    (b) => !containsCase(b.bodyMd) && !containsCase(b.explanationMd),
  );
  const anyHasCase =
    choicesWithCase.length > 0 || boxItemsWithCase.length > 0;
  // 판례 포함 지문이 있으면 그것만 보이게 default. 없으면 모두 보임.
  const visibleChoices =
    anyHasCase && !showAllChoices ? choicesWithCase : problem.choices;
  const visibleBoxItems =
    anyHasCase && !showAllChoices ? boxItemsWithCase : problem.boxItems;
  const hiddenCount =
    anyHasCase && !showAllChoices
      ? choicesWithoutCase.length + boxItemsWithoutCase.length
      : 0;
  return (
    <div
      className={
        accent === "amber"
          ? "rounded-md border border-amber-300/60 bg-amber-50/40 p-3 dark:border-amber-700/60 dark:bg-amber-950/20"
          : "rounded-md border p-3"
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-muted-foreground hover:text-foreground mt-0.5"
            title={expanded ? "접기" : "펼치기"}
          >
            {expanded ? (
              <ChevronDownIcon className="size-4" />
            ) : (
              <ChevronRightIcon className="size-4" />
            )}
          </button>
          <Link
            to={`/subjects/${subjectSlug}/problems/${problem.problemId}`}
            viewTransition
            className="text-primary inline-flex items-center gap-1 text-sm font-semibold hover:underline"
          >
            {problem.problemNumber ? `문제 ${problem.problemNumber}` : "문제"} →
            <Badge variant="outline" className="ml-1 text-[10px]">
              {problem.format}
            </Badge>
          </Link>
        </div>
        {linkable && caseId ? (
          <Form method="post">
            <input type="hidden" name="intent" value="link" />
            <input type="hidden" name="problemId" value={problem.problemId} />
            <Button type="submit" size="sm" variant="outline" className="gap-1">
              {accent === "amber" ? (
                <CheckIcon className="size-3.5" />
              ) : (
                <PlusIcon className="size-3.5" />
              )}
              매핑 추가
            </Button>
          </Form>
        ) : null}
      </div>
      {!expanded ? (
        <p className="text-muted-foreground mt-2 ml-6 text-xs leading-relaxed">
          {snippet || "(본문 비어 있음)"}
        </p>
      ) : (
        <div className="mt-3 ml-6 space-y-3">
          {/* 본문 */}
          <div>
            <p className="text-muted-foreground mb-1 text-[10px] font-semibold tracking-wide uppercase">
              본문
            </p>
            <p className="text-foreground text-[13px] leading-relaxed whitespace-pre-line">
              {problem.bodyMd || "(본문 비어 있음)"}
            </p>
          </div>
          {/* mc_box — 박스 지문(사례). 판례 포함 지문만 default 노출. */}
          {visibleBoxItems.length > 0 ? (
            <div>
              <p className="text-muted-foreground mb-1 text-[10px] font-semibold tracking-wide uppercase">
                박스 지문
                {anyHasCase && !showAllChoices
                  ? ` — 판례 포함 ${boxItemsWithCase.length}개`
                  : ""}
              </p>
              <ul className="space-y-1">
                {visibleBoxItems.map((b, i) => {
                  const hasCase =
                    containsCase(b.bodyMd) || containsCase(b.explanationMd);
                  return (
                    <li
                      key={`box-${i}`}
                      className={
                        hasCase
                          ? "rounded-sm bg-amber-50/60 px-1 py-0.5 text-[12px] leading-relaxed dark:bg-amber-950/30"
                          : "text-[12px] leading-relaxed"
                      }
                    >
                      <span className="font-semibold">[{b.marker}]</span>{" "}
                      <span className="whitespace-pre-line">{b.bodyMd}</span>
                      {b.explanationMd ? (
                        <span className="text-muted-foreground block pl-3 text-[11px]">
                          ↳ {b.explanationMd}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
          {/* 객관식 지문. 판례 포함 지문만 default 노출. */}
          {visibleChoices.length > 0 ? (
            <div>
              <p className="text-muted-foreground mb-1 text-[10px] font-semibold tracking-wide uppercase">
                지문
                {anyHasCase && !showAllChoices
                  ? ` — 판례 포함 ${choicesWithCase.length}개`
                  : ""}
              </p>
              <ul className="space-y-1">
                {visibleChoices.map((c) => {
                  const hasCase =
                    containsCase(c.bodyMd) || containsCase(c.explanationMd);
                  const base = c.isCorrect
                    ? "text-emerald-700 dark:text-emerald-300"
                    : "";
                  return (
                    <li
                      key={`choice-${c.choiceIndex}`}
                      className={
                        hasCase
                          ? `rounded-sm bg-amber-50/60 px-1 py-0.5 text-[12px] leading-relaxed dark:bg-amber-950/30 ${base}`
                          : `text-[12px] leading-relaxed ${base}`
                      }
                    >
                      <span className="font-semibold">
                        {c.isCorrect ? "✓ " : ""}
                        {c.choiceIndex}.
                      </span>{" "}
                      <span className="whitespace-pre-line">{c.bodyMd}</span>
                      {c.explanationMd ? (
                        <span className="text-muted-foreground block pl-3 text-[11px]">
                          ↳ {c.explanationMd}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
          {hiddenCount > 0 ? (
            <button
              type="button"
              onClick={() => setShowAllChoices(true)}
              className="text-muted-foreground hover:text-foreground text-[11px] underline"
            >
              판례가 없는 다른 지문 {hiddenCount}개 보기
            </button>
          ) : null}
          {/* 종합 해설 */}
          {problem.explanationMd ? (
            <div>
              <p className="text-muted-foreground mb-1 text-[10px] font-semibold tracking-wide uppercase">
                해설
              </p>
              <p className="text-foreground text-[12px] leading-relaxed whitespace-pre-line">
                {problem.explanationMd}
              </p>
            </div>
          ) : null}
        </div>
      )}
      {note ? (
        <p className="text-amber-700 dark:text-amber-300 mt-1 ml-6 inline-flex items-center gap-1 text-[11px]">
          <LinkIcon className="size-3" /> {note}
        </p>
      ) : null}
    </div>
  );
}
