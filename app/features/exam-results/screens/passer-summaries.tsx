// 합격자 학습 후기 모음 (anonymized).
// /study/passer-summaries — 학생 누구나 접근 가능 (인증된 사용자).
// 표시 정보: 연도·차수·점수 버킷·인증 여부·자가 학습 요약 markdown.

import { GraduationCapIcon, ShieldCheckIcon, SparklesIcon } from "lucide-react";
import { Form, Link, data, redirect } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { listPasserSummaries } from "~/features/exam-results/analytics.server";
import { EXAM_ROUND_LABEL, type ExamRound } from "~/features/exam-results/labels";

import type { Route } from "./+types/passer-summaries";

export const meta: Route.MetaFunction = () => [
  { title: "합격자 학습 후기 | Lidam Patent Attorney Academy" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");

  const url = new URL(request.url);
  const yearStr = url.searchParams.get("year");
  const filter = {
    year: yearStr ? Number(yearStr) : null,
    round: (url.searchParams.get("round") as ExamRound | null) || null,
    limit: 100,
    // 학생 화면 — 합성 후기 노출 금지.
    excludeSynthetic: true as const,
  };
  const summaries = await listPasserSummaries(filter);
  return { summaries, filter };
}

export default function PasserSummaries({ loaderData }: Route.ComponentProps) {
  const { summaries, filter } = loaderData;
  const filtersActive = filter.year !== null || filter.round !== null;

  return (
    <div className="mx-auto w-full max-w-screen-lg px-5 py-6 md:px-10 md:py-8">
      <header className="mb-6 space-y-1">
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
          <GraduationCapIcon className="size-3.5" /> 합격자 후기
        </p>
        <h1 className="text-2xl font-bold tracking-tight">
          합격자 학습 후기 (익명)
        </h1>
        <p className="text-muted-foreground text-sm">
          분석 활용에 동의한 합격자들이 직접 작성한 학습 후기입니다. 이름·이메일
          등 식별 정보는 표시되지 않습니다. 본인도 합격 후{" "}
          <Link to="/me/exam-results" className="text-link underline">
            결과 입력
          </Link>{" "}
          + 동의 시 후배에게 공유할 수 있습니다.
        </p>
      </header>

      <nav className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium">
        <Link
          to="/study/passer-trend"
          className="text-link inline-flex items-center gap-1 hover:underline"
        >
          합격자 추이 →
        </Link>
        <Link
          to="/study/electives-guide"
          className="text-link inline-flex items-center gap-1 hover:underline"
        >
          선택과목 가이드 →
        </Link>
      </nav>

      <Card className="mb-4">
        <CardContent className="px-4 py-3">
          <Form method="get" className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <div>
              <Label className="text-[11px]">연도</Label>
              <Input
                type="number"
                name="year"
                defaultValue={filter.year ?? ""}
                placeholder="2026"
                className="h-8 text-xs"
              />
            </div>
            <div>
              <Label className="text-[11px]">차수</Label>
              <select
                name="round"
                defaultValue={filter.round ?? ""}
                className="border-input bg-background h-8 w-full rounded border px-2 text-xs"
              >
                <option value="">전체</option>
                <option value="first">1차</option>
                <option value="second">2차</option>
              </select>
            </div>
            <div className="col-span-2 flex items-end justify-end gap-1">
              <Button size="sm" type="submit">
                필터
              </Button>
              {filtersActive ? (
                <Link
                  to="/study/passer-summaries"
                  className="text-muted-foreground text-xs underline"
                >
                  초기화
                </Link>
              ) : null}
            </div>
          </Form>
        </CardContent>
      </Card>

      {summaries.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="px-4 py-8 text-center">
            <SparklesIcon className="text-muted-foreground mx-auto mb-2 size-6" />
            <p className="text-muted-foreground text-sm">
              {filtersActive
                ? "필터 조건에 맞는 후기가 없습니다."
                : "아직 등록된 합격자 후기가 없습니다. 가장 먼저 합격 후 후기를 남겨 보세요."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {summaries.map((s) => (
            <Card key={s.resultId} className={cn(s.verified && "border-emerald-200")}>
              <CardHeader className="px-4 pb-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold tabular-nums">
                    {s.examYear} {EXAM_ROUND_LABEL[s.examRound]} 합격
                  </p>
                  {s.scoreBucket ? (
                    <Badge variant="secondary" className="text-[10px]">
                      {s.scoreBucket}
                    </Badge>
                  ) : null}
                  {s.verified ? (
                    <Badge
                      variant="default"
                      className="bg-emerald-100 text-emerald-800 text-[10px] hover:bg-emerald-100"
                    >
                      <ShieldCheckIcon className="mr-1 size-3" />
                      인증
                    </Badge>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className="text-sm leading-relaxed whitespace-pre-line">
                  {s.summaryMd}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
