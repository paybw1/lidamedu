// feat-9-005 v1.3 — 사용자별 월별 사용량.
// ai_qna_monthly_usage(p_months) RPC 호출. ?download=csv 로 CSV 다운로드.

import { DownloadIcon, UsersIcon } from "lucide-react";
import { Link, redirect } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/admin-ai-qna-usage";

const INPUT_USD_PER_1M = 3.0;
const OUTPUT_USD_PER_1M = 15.0;
const KRW_PER_USD = 1400;

export const meta: Route.MetaFunction = () => [
  { title: "AI Q&A 월별 사용량 | 운영자" },
];

interface UsageRow {
  month: string;
  user_id: string;
  message_count: number;
  input_tokens: number;
  output_tokens: number;
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const role = await getStaffRole(client, user.id);
  if (!role) throw redirect("/admin");

  const url = new URL(request.url);
  const months = Math.max(
    1,
    Math.min(24, Number(url.searchParams.get("months") ?? 6)),
  );

  const { data: rpc, error } = await client.rpc("ai_qna_monthly_usage", {
    p_months: months,
  });
  if (error) throw error;
  const rows = (rpc ?? []).map((r) => ({
    month: r.month,
    user_id: r.user_id,
    message_count: r.message_count,
    input_tokens: Number(r.input_tokens),
    output_tokens: Number(r.output_tokens),
  })) as UsageRow[];

  // ?download=csv
  if (url.searchParams.get("download") === "csv") {
    const header = [
      "month",
      "user_id",
      "message_count",
      "input_tokens",
      "output_tokens",
      "estimated_krw",
    ].join(",");
    const lines = rows.map((r) => {
      const cost = tokensToKrw(r.input_tokens, r.output_tokens);
      return [
        r.month,
        r.user_id,
        r.message_count,
        r.input_tokens,
        r.output_tokens,
        Math.round(cost),
      ].join(",");
    });
    const csv = [header, ...lines].join("\n");
    // BOM 으로 Excel 한국어 호환.
    return new Response(`﻿${csv}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="ai-qna-usage-${months}m.csv"`,
      },
    });
  }

  return { rows, months };
}

function tokensToKrw(input: number, output: number): number {
  const usd =
    (input / 1_000_000) * INPUT_USD_PER_1M +
    (output / 1_000_000) * OUTPUT_USD_PER_1M;
  return usd * KRW_PER_USD;
}

function fmtKrw(amount: number): string {
  return `₩${Math.round(amount).toLocaleString("ko-KR")}`;
}

export default function AdminAiQnaUsage({ loaderData }: Route.ComponentProps) {
  // download=csv 면 Response 가 직접 반환되어 여기 안 옴.
  if (loaderData instanceof Response) return null;
  const { rows, months } = loaderData;

  // 월별 합계.
  const monthly = new Map<string, { messages: number; input: number; output: number; users: Set<string> }>();
  for (const r of rows) {
    const m = monthly.get(r.month) ?? {
      messages: 0,
      input: 0,
      output: 0,
      users: new Set<string>(),
    };
    m.messages += r.message_count;
    m.input += r.input_tokens;
    m.output += r.output_tokens;
    m.users.add(r.user_id);
    monthly.set(r.month, m);
  }
  const monthlyArr = [...monthly.entries()].sort((a, b) =>
    b[0].localeCompare(a[0]),
  );

  return (
    <AdminShell title="AI Q&A 월별 사용량" cluster="comms">
      <div className="mx-auto max-w-5xl space-y-4">
        <header className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="inline-flex items-center gap-2 text-xl font-bold tracking-tight">
              <UsersIcon className="text-primary size-5" /> 사용자별 월별 사용량
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              `ai_messages.token_usage` 원본 기준. 향후 사용량 기반 청구에 그대로 활용.
            </p>
          </div>
          <form className="flex items-center gap-2" method="get">
            <label className="text-muted-foreground text-xs">최근</label>
            <Input
              name="months"
              type="number"
              min={1}
              max={24}
              defaultValue={months}
              className="h-8 w-20 text-xs"
            />
            <span className="text-muted-foreground text-xs">개월</span>
            <Button type="submit" size="sm" variant="outline" className="h-8 rounded-full text-xs">
              조회
            </Button>
            <Button
              asChild
              size="sm"
              className="h-8 rounded-full text-xs"
              title="현재 조회 결과를 CSV 로 다운로드"
            >
              <Link to={`/admin/ai-qna/usage?months=${months}&download=csv`} reloadDocument>
                <DownloadIcon className="size-3.5" /> CSV
              </Link>
            </Button>
          </form>
        </header>

        {/* 월별 합계 카드 */}
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {monthlyArr.slice(0, 3).map(([month, m]) => {
            const cost = tokensToKrw(m.input, m.output);
            return (
              <div
                key={month}
                className="border-border bg-card rounded-2xl border p-4 shadow-sm"
              >
                <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
                  {month}
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <span>응답</span>
                  <span className="text-right tabular-nums">{m.messages.toLocaleString("ko-KR")}</span>
                  <span>사용자</span>
                  <span className="text-right tabular-nums">{m.users.size}</span>
                  <span>in 토큰</span>
                  <span className="text-right tabular-nums">{m.input.toLocaleString("ko-KR")}</span>
                  <span>out 토큰</span>
                  <span className="text-right tabular-nums">{m.output.toLocaleString("ko-KR")}</span>
                </div>
                <p className="mt-3 text-lg font-bold tabular-nums">{fmtKrw(cost)}</p>
              </div>
            );
          })}
        </section>

        {/* 사용자별 표 */}
        <section className="border-border bg-card overflow-hidden rounded-2xl border shadow-sm">
          <div className="border-border border-b px-4 py-3">
            <p className="text-sm font-bold tracking-tight">사용자 ✕ 월별 ({rows.length} 행)</p>
          </div>
          {rows.length === 0 ? (
            <p className="text-muted-foreground p-6 text-center text-sm">
              아직 사용량 데이터가 없습니다.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead className="bg-muted/40 text-muted-foreground text-xs">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">월</th>
                    <th className="px-3 py-2 text-left font-semibold">user_id</th>
                    <th className="px-3 py-2 text-right font-semibold">응답</th>
                    <th className="px-3 py-2 text-right font-semibold">in 토큰</th>
                    <th className="px-3 py-2 text-right font-semibold">out 토큰</th>
                    <th className="px-3 py-2 text-right font-semibold">추정 비용</th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {rows.map((r) => {
                    const cost = tokensToKrw(r.input_tokens, r.output_tokens);
                    return (
                      <tr key={`${r.month}-${r.user_id}`}>
                        <td className="px-3 py-2 tabular-nums">
                          <Badge variant="outline">{r.month}</Badge>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {r.user_id.slice(0, 8)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {r.message_count.toLocaleString("ko-KR")}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {r.input_tokens.toLocaleString("ko-KR")}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {r.output_tokens.toLocaleString("ko-KR")}
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
          비용 단가 가정: input ${INPUT_USD_PER_1M}/1M, output ${OUTPUT_USD_PER_1M}/1M, 환율 ₩{KRW_PER_USD}/$.
          정산은 Anthropic 영수증 기준. CSV 는 BOM UTF-8 (Excel 한국어 호환).
        </p>
      </div>
    </AdminShell>
  );
}
