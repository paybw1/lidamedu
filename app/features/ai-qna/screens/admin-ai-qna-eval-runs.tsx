// feat-9-005 v1.2 — eval 항목의 모든 평가 run 시간순.
// URL: /admin/ai-qna/eval/:evalItemId/runs

import { ArrowLeftIcon, ClipboardListIcon } from "lucide-react";
import { Link, data, redirect } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  getEvalItem,
  listEvalRuns,
} from "~/features/ai-qna/queries.staff.server";

import type { Route } from "./+types/admin-ai-qna-eval-runs";

export const meta: Route.MetaFunction = () => [
  { title: "AI Q&A 평가 이력 | 운영자" },
];

export async function loader({ params, request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const role = await getStaffRole(client, user.id);
  if (!role) throw redirect("/admin");
  if (!params.evalItemId)
    throw data("Missing evalItemId", { status: 404 });
  const item = await getEvalItem(params.evalItemId);
  if (!item) throw data("Not found", { status: 404 });
  const runs = await listEvalRuns(params.evalItemId, 100);
  return { item, runs };
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function verdictColor(v: "pass" | "partial" | "fail"): string {
  if (v === "pass")
    return "border-emerald-500/40 text-emerald-700 dark:text-emerald-300";
  if (v === "partial")
    return "border-amber-500/40 text-amber-700 dark:text-amber-300";
  return "border-rose-500/40 text-rose-700 dark:text-rose-300";
}

export default function AdminAiQnaEvalRuns({ loaderData }: Route.ComponentProps) {
  const { item, runs } = loaderData;

  const summary =
    runs.length === 0
      ? null
      : {
          avg:
            Math.round(
              (runs.reduce((s, r) => s + r.judgeScore, 0) / runs.length) * 10,
            ) / 10,
          passRate: Math.round(
            (runs.filter((r) => r.judgeVerdict === "pass").length /
              runs.length) *
              100,
          ),
        };

  return (
    <AdminShell title="eval 평가 이력" cluster="comms">
      <div className="mx-auto max-w-4xl space-y-4">
        <header className="space-y-2">
          <Button
            asChild
            size="sm"
            variant="ghost"
            className="text-muted-foreground -ml-2 h-7 rounded-full"
          >
            <Link to="/admin/ai-qna/eval">
              <ArrowLeftIcon className="size-3.5" /> 목록
            </Link>
          </Button>
          <h1 className="inline-flex items-center gap-2 text-xl font-bold tracking-tight">
            <ClipboardListIcon className="text-link size-5" /> eval 평가 이력
          </h1>
          <div className="border-border bg-muted/30 rounded-2xl border p-3 text-sm">
            <p className="text-foreground font-semibold leading-snug">
              Q. {item.question.length > 240 ? item.question.slice(0, 240) + "…" : item.question}
            </p>
            <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
              참고 답변 ({item.referenceAnswer.length}자):{" "}
              {item.referenceAnswer.slice(0, 180)}
              {item.referenceAnswer.length > 180 ? "…" : ""}
            </p>
          </div>
        </header>

        {summary ? (
          <section className="grid gap-3 sm:grid-cols-3">
            <Stat label="평가 횟수" value={`${runs.length}회`} />
            <Stat label="평균 점수" value={`${summary.avg}/5`} />
            <Stat
              label="pass 비율"
              value={`${summary.passRate}%`}
              accent={summary.passRate >= 80 ? "emerald" : summary.passRate >= 50 ? "amber" : "rose"}
            />
          </section>
        ) : (
          <div className="rounded-2xl border border-dashed py-12 text-center">
            <ClipboardListIcon className="text-muted-foreground mx-auto size-10" />
            <p className="text-muted-foreground mt-3 text-sm">
              아직 평가 이력이 없습니다.
              <br />
              목록의 "지금 평가" 버튼으로 시작하거나, cron 이 자동 실행할 때까지 기다리세요.
            </p>
          </div>
        )}

        <ul className="space-y-3">
          {runs.map((r) => (
            <li
              key={r.runId}
              className="border-border bg-card rounded-2xl border p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <Badge variant="outline" className={cn("tabular-nums", verdictColor(r.judgeVerdict))}>
                  {r.judgeScore}/5 · {r.judgeVerdict}
                </Badge>
                <span className="text-muted-foreground tabular-nums">{fmtTime(r.createdAt)}</span>
                <Badge variant="outline" className="text-[10px]">
                  {r.triggeredBy ? "수동" : "cron"}
                </Badge>
                {r.aiCitations.length > 0 ? (
                  <Badge variant="outline" className="text-[10px]">
                    출처 {r.aiCitations.length}
                  </Badge>
                ) : null}
              </div>
              <p className="text-foreground mt-3 text-sm leading-relaxed whitespace-pre-wrap">
                <strong>judge:</strong> {r.judgeRationale}
              </p>
              <details className="text-muted-foreground mt-3 text-xs">
                <summary className="cursor-pointer font-semibold">AI 답변 보기</summary>
                <pre className="text-foreground/80 mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-[12px] leading-relaxed">
                  {r.aiAnswer}
                </pre>
              </details>
            </li>
          ))}
        </ul>
      </div>
    </AdminShell>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "emerald" | "amber" | "rose";
}) {
  const cls =
    accent === "emerald"
      ? "text-emerald-700 dark:text-emerald-300"
      : accent === "amber"
        ? "text-amber-700 dark:text-amber-300"
        : accent === "rose"
          ? "text-rose-700 dark:text-rose-300"
          : "text-foreground";
  return (
    <div className="border-border bg-card rounded-2xl border p-4 shadow-sm">
      <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
        {label}
      </p>
      <p className={`mt-2 text-xl font-bold tabular-nums ${cls}`}>{value}</p>
    </div>
  );
}
