// feat-9-005 — AI Q&A 운영 지표 대시보드.
// 일별: 응답 수 / 👍 / 👎 / 거절(가드레일 ③⑤) / input·output 토큰 + 추정 비용.
// 누적: 응답·사용자·토큰·피드백.
//
// 비용 추정 단가 (2026-05-21 Claude Sonnet 4.6 정책):
//   input  $3 / 1M tokens
//   output $15 / 1M tokens
// 환율 ₩1,400/$ 가정. 운영자 화면 표시용 — 정산은 ai_messages.token_usage 원본 기준.

import { redirect } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/admin-ai-qna-metrics";

const INPUT_USD_PER_1M = 3.0;
const OUTPUT_USD_PER_1M = 15.0;
const KRW_PER_USD = 1400;

export const meta: Route.MetaFunction = () => [
  { title: "AI Q&A 지표 | 운영자" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const role = await getStaffRole(client, user.id);
  if (!role) throw redirect("/admin");

  const [{ data: daily }, { data: total }] = await Promise.all([
    client.rpc("ai_qna_daily_metrics", { p_days: 30 }),
    client.rpc("ai_qna_total_metrics"),
  ]);

  return {
    daily: daily ?? [],
    total: total?.[0] ?? {
      total_responses: 0,
      total_users: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      positive_feedback: 0,
      negative_feedback: 0,
    },
  };
}

function tokensToKrw(input: number, output: number): number {
  const usd =
    (input / 1_000_000) * INPUT_USD_PER_1M +
    (output / 1_000_000) * OUTPUT_USD_PER_1M;
  return usd * KRW_PER_USD;
}

function fmtKrw(amount: number): string {
  if (amount < 1000)
    return `₩${amount.toLocaleString("ko-KR", { maximumFractionDigits: 0 })}`;
  if (amount < 10_000)
    return `₩${amount.toLocaleString("ko-KR", { maximumFractionDigits: 0 })}`;
  return `${(amount / 10_000).toLocaleString("ko-KR", {
    maximumFractionDigits: 1,
  })}만원`;
}

function fmtCount(n: number | bigint): string {
  return Number(n).toLocaleString("ko-KR");
}

export default function AdminAiQnaMetrics({ loaderData }: Route.ComponentProps) {
  const { daily, total } = loaderData;

  const totalInputTokens = Number(total.total_input_tokens);
  const totalOutputTokens = Number(total.total_output_tokens);
  const totalCostKrw = tokensToKrw(totalInputTokens, totalOutputTokens);

  const last7d = daily.slice(0, 7);
  const sum = (key: keyof (typeof daily)[0]) =>
    last7d.reduce(
      (s, r) => s + (typeof r[key] === "bigint" ? Number(r[key]) : (r[key] as number)),
      0,
    );
  const last7Responses = sum("responses");
  const last7Cost = tokensToKrw(sum("input_tokens"), sum("output_tokens"));
  const last7Negative = sum("negative_feedback");

  return (
    <AdminShell title="AI Q&A 지표" cluster="ai-qna">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="space-y-1">
          <h1 className="text-xl font-bold tracking-tight">AI Q&A 운영 지표</h1>
          <p className="text-muted-foreground text-sm">
            최근 30일 일별 + 누적 합계. 정산은{" "}
            <code className="text-foreground">ai_messages.token_usage</code>{" "}
            원본 기준.
          </p>
        </header>

        {/* 누적 카드 */}
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="누적 응답" value={fmtCount(total.total_responses)} />
          <StatCard label="누적 사용자" value={fmtCount(total.total_users)} />
          <StatCard
            label="누적 토큰 (in/out)"
            value={`${fmtCount(totalInputTokens)} / ${fmtCount(totalOutputTokens)}`}
          />
          <StatCard
            label="누적 추정 비용"
            value={fmtKrw(totalCostKrw)}
            accent={totalCostKrw > 100_0000 ? "rose" : undefined}
          />
        </section>

        {/* 최근 7일 카드 */}
        <section className="grid gap-3 sm:grid-cols-3">
          <StatCard label="최근 7일 응답" value={fmtCount(last7Responses)} />
          <StatCard
            label="최근 7일 비용"
            value={fmtKrw(last7Cost)}
            accent={last7Cost > 10_0000 ? "amber" : undefined}
          />
          <StatCard
            label="최근 7일 부정 피드백"
            value={`${last7Negative}건`}
            accent={last7Negative > 5 ? "amber" : undefined}
          />
        </section>

        {/* 일별 표 */}
        <section className="border-border bg-card overflow-hidden rounded-2xl border shadow-sm">
          <div className="border-border border-b px-4 py-3">
            <p className="text-sm font-bold tracking-tight">최근 30일 일별</p>
          </div>
          {daily.length === 0 ? (
            <p className="text-muted-foreground p-6 text-center text-sm">
              아직 데이터가 없습니다.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-sm">
                <thead className="bg-muted/40 text-muted-foreground text-xs">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">일자</th>
                    <th className="px-3 py-2 text-right font-semibold">응답</th>
                    <th className="px-3 py-2 text-right font-semibold">👍</th>
                    <th className="px-3 py-2 text-right font-semibold">👎</th>
                    <th className="px-3 py-2 text-right font-semibold">거절</th>
                    <th className="px-3 py-2 text-right font-semibold">in 토큰</th>
                    <th className="px-3 py-2 text-right font-semibold">out 토큰</th>
                    <th className="px-3 py-2 text-right font-semibold">추정 비용</th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {daily.map((row) => {
                    const cost = tokensToKrw(
                      Number(row.input_tokens),
                      Number(row.output_tokens),
                    );
                    const refusalRate =
                      row.responses > 0
                        ? Math.round((row.refusal_responses / row.responses) * 100)
                        : 0;
                    return (
                      <tr key={String(row.day)}>
                        <td className="px-3 py-2 tabular-nums">{String(row.day)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {fmtCount(row.responses)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-300">
                          {row.positive_feedback}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-rose-700 dark:text-rose-300">
                          {row.negative_feedback}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Badge
                            variant="outline"
                            className="tabular-nums"
                            title={`근거부족 ${row.refusal_insufficient} / 자연과학 ${row.refusal_science}`}
                          >
                            {row.refusal_responses}{" "}
                            <span className="text-muted-foreground">
                              ({refusalRate}%)
                            </span>
                          </Badge>
                          {(row.refusal_insufficient > 0 || row.refusal_science > 0) ? (
                            <div className="text-muted-foreground mt-1 text-[10px]">
                              근거 {row.refusal_insufficient} / 과학 {row.refusal_science}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {fmtCount(row.input_tokens)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {fmtCount(row.output_tokens)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">
                          {fmtKrw(cost)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="text-muted-foreground text-xs">
          비용 단가 (가정): input ${INPUT_USD_PER_1M}/1M, output $
          {OUTPUT_USD_PER_1M}/1M, 환율 ₩{KRW_PER_USD}/$. 실제 청구는 Anthropic
          영수증 기준.
        </p>
      </div>
    </AdminShell>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "rose" | "amber" | "emerald";
}) {
  const cls =
    accent === "rose"
      ? "text-rose-700 dark:text-rose-300"
      : accent === "amber"
        ? "text-amber-700 dark:text-amber-300"
        : accent === "emerald"
          ? "text-emerald-700 dark:text-emerald-300"
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
