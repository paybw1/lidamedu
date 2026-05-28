// 판례 인용 추적 카드 — admin-case-edit 페이지에 부착.
// admin-problem-edit 의 선택지에서 "해설 종류 = 판례" (choice_type='precedent')
// 일 때 활성되는 판례번호 입력란(related_case_number)에 이 case 가 박힌 선택지
// 목록을 보여주고, 옛 → 새 case 로 그 입력란 값을 일괄 갱신한다.
// 자유 텍스트(explanation_md) 본문은 변경하지 않는다.

import { ArrowRightIcon, LinkIcon, TextSearchIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link, useFetcher, useRevalidator } from "react-router";
import { toast } from "sonner";

import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Input } from "~/core/components/ui/input";
import { cn } from "~/core/lib/utils";

import type { CaseCitationSummary } from "../queries/case-citations.server";

const FORMAT_LABEL: Record<string, string> = {
  mc_short: "객·단답",
  mc_box: "객·박스",
  mc_case: "객·사례",
  ox: "OX",
  blank: "빈칸",
  subjective: "주관식",
};
const ROUND_LABEL: Record<string, string> = {
  first: "1차",
  second: "2차",
};

export function CaseCitationsCard({
  caseId,
  caseNumber,
  summary,
}: {
  caseId: string;
  caseNumber: string;
  summary: CaseCitationSummary;
}) {
  const migrateFetcher = useFetcher<{
    ok?: boolean;
    updatedChoices?: number;
    examYearsAdded?: { first: number[]; second: number[] };
    linksTransferred?: number;
    linksDropped?: number;
    newCaseId?: string;
    newCaseNumber?: string;
    error?: string;
  }>();
  const backfillFetcher = useFetcher<{
    ok?: boolean;
    added?: number;
    error?: string;
  }>();
  const { revalidate } = useRevalidator();
  const newNumberRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (migrateFetcher.state !== "idle" || !migrateFetcher.data) return;
    const d = migrateFetcher.data;
    if (d.error) {
      toast.error(`마이그레이션 실패: ${d.error}`);
      return;
    }
    if (d.ok) {
      const yrs = d.examYearsAdded ?? { first: [], second: [] };
      const parts: string[] = [];
      parts.push(`선택지 ${d.updatedChoices ?? 0}건 갱신`);
      const linksT = d.linksTransferred ?? 0;
      const linksD = d.linksDropped ?? 0;
      if (linksT > 0 || linksD > 0) {
        parts.push(
          `link 이전 ${linksT}건` + (linksD > 0 ? ` (충돌 삭제 ${linksD})` : ""),
        );
      }
      if (yrs.first.length > 0 || yrs.second.length > 0) {
        const yrParts: string[] = [];
        if (yrs.first.length > 0) yrParts.push(`1차 ${yrs.first.join(",")}`);
        if (yrs.second.length > 0) yrParts.push(`2차 ${yrs.second.join(",")}`);
        parts.push(`기출연도 추가 ${yrParts.join(" / ")}`);
      }
      toast.success(parts.join(" · "));
      if (newNumberRef.current) newNumberRef.current.value = "";
      revalidate();
    }
  }, [migrateFetcher.state, migrateFetcher.data, revalidate]);

  useEffect(() => {
    if (backfillFetcher.state !== "idle" || !backfillFetcher.data) return;
    const d = backfillFetcher.data;
    if (d.error) toast.error(`보완 실패: ${d.error}`);
    else if (d.ok) {
      toast.success(`누락 link ${d.added ?? 0}건 보완 완료`);
      revalidate();
    }
  }, [backfillFetcher.state, backfillFetcher.data, revalidate]);

  const onSubmitMigrate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const newNumber = String(fd.get("newNumber") ?? "").trim();
    if (!newNumber) {
      toast.error("새 사건번호를 입력하세요");
      return;
    }
    if (newNumber === caseNumber) {
      toast.error("옛 사건번호와 동일합니다");
      return;
    }
    if (
      !confirm(
        `해설 종류가 "판례" 인 선택지의 판례번호 입력란 "${caseNumber}" → "${newNumber}" 로 일괄 갱신합니다.\n` +
          `자유 텍스트 본문(explanation_md)은 변경하지 않습니다.\n계속할까요?`,
      )
    )
      return;
    fd.set("intent", "migrate");
    fd.set("caseId", caseId);
    migrateFetcher.submit(fd, {
      method: "post",
      action: "/api/admin/case-citations",
    });
  };

  const onClickBackfill = () => {
    if (summary.missingLinkCount === 0) return;
    if (
      !confirm(
        `해설 종류=판례 의 입력란에 "${caseNumber}" 가 박혔지만 link 가 없는 ${summary.missingLinkCount}개 문제에 link 를 추가합니다.\n계속할까요?`,
      )
    )
      return;
    const fd = new FormData();
    fd.set("intent", "backfill_links");
    fd.set("caseId", caseId);
    fd.set("caseNumber", caseNumber);
    backfillFetcher.submit(fd, {
      method: "post",
      action: "/api/admin/case-citations",
    });
  };

  const migrateBusy = migrateFetcher.state !== "idle";
  const backfillBusy = backfillFetcher.state !== "idle";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            이 판례가 인용된 문제
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            구조 연결 <b className="text-foreground">{summary.linkedCount}</b>{" "}
            · 해설 종류=판례 입력란{" "}
            <b className="text-foreground">{summary.precedentChoiceCount}</b>
            {summary.missingLinkCount > 0 ? (
              <>
                {" "}
                <span className="text-amber-600 dark:text-amber-400">
                  · link 누락 <b>{summary.missingLinkCount}</b>
                </span>
              </>
            ) : null}
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {summary.problems.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            이 판례를 인용한 문제가 없습니다.
          </p>
        ) : (
          <div className="border-border overflow-hidden rounded-lg border">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">연도/회차</th>
                  <th className="px-3 py-2 text-left font-semibold">문항</th>
                  <th className="px-3 py-2 text-left font-semibold">형식</th>
                  <th className="px-3 py-2 text-left font-semibold">link</th>
                  <th className="px-3 py-2 text-left font-semibold">
                    선택지 (해설 종류=판례)
                  </th>
                  <th className="px-3 py-2 text-right font-semibold"></th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {summary.problems.map((p) => (
                  <tr key={p.problemId} className="align-top">
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                      {p.year ?? "—"}
                      {p.examRound ? (
                        <span className="text-muted-foreground ml-1">
                          {ROUND_LABEL[p.examRound] ?? p.examRound}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                      {p.problemNumber ?? "—"}번
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {p.format ? (FORMAT_LABEL[p.format] ?? p.format) : "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {p.hasLink ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                          <LinkIcon className="size-3" /> 연결
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                          <TextSearchIcon className="size-3" /> 누락
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {p.precedentChoices.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className="text-foreground/90 inline-flex flex-wrap gap-1">
                          {p.precedentChoices.map((h) => (
                            <span
                              key={h.choiceId}
                              className="border-border bg-card inline-flex size-5 items-center justify-center rounded border text-[10px] font-bold tabular-nums"
                            >
                              {h.choiceIndex + 1}
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <Link
                        to={`/admin/problems/${p.problemId}`}
                        className="text-primary hover:underline inline-flex items-center gap-0.5"
                      >
                        편집 <ArrowRightIcon className="size-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 일괄 작업 */}
        <div className="grid gap-3 md:grid-cols-2">
          <form
            onSubmit={onSubmitMigrate}
            className="border-border bg-muted/30 space-y-2 rounded-lg border p-3"
          >
            <p className="text-foreground text-xs font-bold">
              판례번호 입력란 일괄 변경
            </p>
            <p className="text-muted-foreground text-[11px]">
              해설 종류=판례 인 선택지의{" "}
              <span className="font-mono">related_case_number</span> 값이{" "}
              <span className="font-mono">{caseNumber}</span> 인 것을 새
              사건번호로 일괄 갱신. 자유 텍스트 본문은 손대지 않음.
            </p>
            <div className="flex items-center gap-2">
              <Input
                ref={newNumberRef}
                name="newNumber"
                placeholder="예: 2024후10436"
                maxLength={40}
                className="h-8 text-sm"
                disabled={migrateBusy}
              />
              <Button
                type="submit"
                size="sm"
                disabled={migrateBusy}
                className="shrink-0"
              >
                {migrateBusy ? "변경 중…" : "변경"}
              </Button>
            </div>
            <label className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
              <input
                type="checkbox"
                name="transferProblemLinks"
                value="on"
                defaultChecked
                className="size-3"
              />
              <span>
                1차 기출 link(
                <span className="font-mono">problem_case_links</span>)도 새
                판례로 이전 — 사건명 옆 기출 칩이 새 판례로 옮겨감
              </span>
            </label>
            <label className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
              <input
                type="checkbox"
                name="transferExamYears"
                value="on"
                defaultChecked
                className="size-3"
              />
              <span>
                2차 기출 연도(
                <span className="font-mono">exam_2nd_years</span>)도 새 판례로
                union 추가
              </span>
            </label>
          </form>

          <div
            className={cn(
              "border-border bg-muted/30 space-y-2 rounded-lg border p-3",
              summary.missingLinkCount === 0 && "opacity-60",
            )}
          >
            <p className="text-foreground text-xs font-bold">
              누락된 link 일괄 보완
            </p>
            <p className="text-muted-foreground text-[11px]">
              해설 종류=판례 의 입력란에 박혔지만{" "}
              <span className="font-mono">problem_case_links</span> 에 없는
              문제에 <span className="font-mono">relation_type=cited</span> 로
              link 추가.
            </p>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground text-[11px]">
                대상:{" "}
                <b className="text-foreground">{summary.missingLinkCount}</b>건
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={backfillBusy || summary.missingLinkCount === 0}
                onClick={onClickBackfill}
              >
                {backfillBusy ? "보완 중…" : "link 보완"}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
