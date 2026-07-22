// 운영관리 — Q&A 답변 현황(SLA). 대기 큐(오래된 순) + 최근 30일 지표 +
// 주별 추이 + 응답자별 현황. manager+ 전용.

import { ArrowUpRightIcon } from "lucide-react";
import { Link, redirect } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Card, CardContent } from "~/core/components/ui/card";
import makeServerClient from "~/core/lib/supa-client.server";
import { cn } from "~/core/lib/utils";
import { MemberLink } from "~/features/admin/components/admin-ui";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { getStaffRole } from "~/features/laws/queries.server";

import {
  QNA_SLA_BREACH_HOURS,
  QNA_SLA_TARGET_HOURS,
  QNA_STATUS_LABEL,
  QNA_TARGET_LABEL,
  subjectLabel,
} from "../labels";
import { getQnaSlaDashboard } from "../sla.server";

import type { Route } from "./+types/admin-qna-sla";

export const meta: Route.MetaFunction = () => [
  { title: "Q&A 답변 현황 | 운영자" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const role = await getStaffRole(client, user.id);
  if (role !== "manager" && role !== "admin") throw redirect("/admin");

  const dashboard = await getQnaSlaDashboard();
  return { dashboard };
}

/** 경과·응답 시간 표기 — 1시간 미만은 분, 48시간부터는 일 단위 병기. */
function fmtHours(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 1) return `${Math.round(hours * 60)}분`;
  if (hours < QNA_SLA_BREACH_HOURS) return `${hours.toFixed(1)}시간`;
  const days = Math.floor(hours / 24);
  const rest = Math.round(hours - days * 24);
  return rest > 0 ? `${days}일 ${rest}시간` : `${days}일`;
}

function ageTone(hours: number): string {
  if (hours > QNA_SLA_BREACH_HOURS) return "text-rose-600 dark:text-rose-400";
  if (hours > QNA_SLA_TARGET_HOURS)
    return "text-amber-600 dark:text-amber-400";
  return "text-emerald-600 dark:text-emerald-400";
}

export default function AdminQnaSla({ loaderData }: Route.ComponentProps) {
  const { pending, pendingCounts, window30, weekly, answerers } =
    loaderData.dashboard;

  return (
    <AdminShell title="Q&A 답변 현황" cluster="ai-qna">
      <div className="mx-auto max-w-5xl space-y-8">
        <header>
          <h1 className="text-xl font-bold tracking-tight">Q&A 답변 현황</h1>
          <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
            목표 응답 시간은 <b>{QNA_SLA_TARGET_HOURS}시간</b>입니다. 정식 답변
            · AI 답변 &ldquo;정확&rdquo; 확인 · 강사 메시지 중 가장 빠른 것을
            응답으로 집계하며, AI 즉답만 있는 질문은 대기로 봅니다.
          </p>
        </header>

        {/* 핵심 지표 */}
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard
            label="답변 대기"
            value={String(pendingCounts.total)}
            sub={
              pendingCounts.overTarget > 0
                ? `${QNA_SLA_TARGET_HOURS}시간 초과 ${pendingCounts.overTarget}건${
                    pendingCounts.overBreach > 0
                      ? ` · ${QNA_SLA_BREACH_HOURS}시간 초과 ${pendingCounts.overBreach}건`
                      : ""
                  }`
                : "전부 목표 시간 이내"
            }
            tone={
              pendingCounts.overBreach > 0
                ? "text-rose-600 dark:text-rose-400"
                : pendingCounts.overTarget > 0
                  ? "text-amber-600 dark:text-amber-400"
                  : undefined
            }
          />
          <StatCard
            label="30일 목표 내 응답"
            value={
              window30.withinTargetPct !== null
                ? `${window30.withinTargetPct}%`
                : "—"
            }
            sub={`${QNA_SLA_TARGET_HOURS}시간 이내 응답 비율`}
          />
          <StatCard
            label="30일 중앙값 응답 시간"
            value={fmtHours(window30.medianHours)}
            sub={
              window30.avgHours !== null
                ? `평균 ${fmtHours(window30.avgHours)}`
                : "응답 없음"
            }
          />
          <StatCard
            label="30일 질문·응답"
            value={`${window30.asked} / ${window30.responded}`}
            sub={
              window30.responseRatePct !== null
                ? `응답률 ${window30.responseRatePct}%`
                : "질문 없음"
            }
          />
        </section>

        {/* 대기 큐 */}
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">
            답변 대기 큐 ({pendingCounts.total})
          </h2>
          {pending.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              대기 중인 질문이 없습니다.
            </p>
          ) : (
            <div className="border-border overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-border text-muted-foreground border-b text-left text-xs">
                    <th className="px-3 py-2 font-medium">경과</th>
                    <th className="px-3 py-2 font-medium">상태</th>
                    <th className="px-3 py-2 font-medium">과목</th>
                    <th className="px-3 py-2 font-medium">질문</th>
                    <th className="px-3 py-2 font-medium">질문자</th>
                    <th className="px-3 py-2 font-medium">등록</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map((p) => (
                    <tr
                      key={p.threadId}
                      className="border-border/60 border-b last:border-0"
                    >
                      <td
                        className={cn(
                          "px-3 py-2 font-semibold whitespace-nowrap tabular-nums",
                          ageTone(p.ageHours),
                        )}
                      >
                        {fmtHours(p.ageHours)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <Badge
                          variant={
                            p.status === "ai_answered" ? "secondary" : "outline"
                          }
                          className="text-[10px]"
                        >
                          {p.status === "ai_answered"
                            ? "AI 즉답 · 확인 대기"
                            : QNA_STATUS_LABEL[p.status]}
                        </Badge>
                      </td>
                      <td className="text-muted-foreground px-3 py-2 whitespace-nowrap">
                        {subjectLabel(p.subject) ?? "—"}
                        <span className="text-muted-foreground/60 ml-1 text-[10px]">
                          {QNA_TARGET_LABEL[p.targetType]}
                        </span>
                      </td>
                      <td className="max-w-[22rem] px-3 py-2">
                        <Link
                          to={`/qna/${p.threadId}`}
                          className="text-link inline-flex max-w-full items-center gap-1 hover:underline"
                        >
                          <span className="truncate">{p.title}</span>
                          <ArrowUpRightIcon className="size-3 shrink-0" />
                        </Link>
                      </td>
                      <td className="text-muted-foreground px-3 py-2 whitespace-nowrap">
                        <MemberLink profileId={p.askerId} name={p.askerName} />
                      </td>
                      <td className="text-muted-foreground px-3 py-2 whitespace-nowrap tabular-nums">
                        {p.createdAt.slice(0, 16).replace("T", " ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* 주별 추이 */}
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">주별 추이 (최근 8주)</h2>
          {weekly.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              최근 8주 질문이 없습니다.
            </p>
          ) : (
            <div className="border-border overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-border text-muted-foreground border-b text-left text-xs">
                    <th className="px-3 py-2 font-medium">주 (월요일 시작)</th>
                    <th className="px-3 py-2 text-right font-medium">질문</th>
                    <th className="px-3 py-2 text-right font-medium">응답</th>
                    <th className="px-3 py-2 text-right font-medium">
                      {QNA_SLA_TARGET_HOURS}시간 내
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      중앙값 응답 시간
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {weekly.map((w) => (
                    <tr
                      key={w.weekStart}
                      className="border-border/60 border-b last:border-0"
                    >
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                        {w.weekStart}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {w.asked}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {w.responded}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {w.responded > 0
                          ? `${w.withinTarget} (${Math.round((w.withinTarget / w.responded) * 100)}%)`
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                        {fmtHours(w.medianHours)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* 응답자별 현황 */}
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">응답자별 현황 (최근 30일)</h2>
          {answerers.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              최근 30일 응답 기록이 없습니다.
            </p>
          ) : (
            <div className="border-border overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-border text-muted-foreground border-b text-left text-xs">
                    <th className="px-3 py-2 font-medium">응답자</th>
                    <th className="px-3 py-2 text-right font-medium">응답</th>
                    <th className="px-3 py-2 text-right font-medium">
                      중앙값 응답 시간
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {answerers.map((a) => (
                    <tr
                      key={a.profileId}
                      className="border-border/60 border-b last:border-0"
                    >
                      <td className="px-3 py-2">{a.name ?? "이름 미설정"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {a.responded}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                        {fmtHours(a.medianHours)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AdminShell>
  );
}

function StatCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: string;
}) {
  return (
    <Card>
      <CardContent className="px-4 py-3">
        <p className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
          {label}
        </p>
        <p className={cn("mt-0.5 text-xl font-bold tabular-nums", tone)}>
          {value}
        </p>
        <p className="text-muted-foreground mt-0.5 text-xs">{sub}</p>
      </CardContent>
    </Card>
  );
}
