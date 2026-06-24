// 학생 — GS 포인트 잔액 + 적립/회수 이력.

import { CoinsIcon } from "lucide-react";
import { data } from "react-router";

import { Card, CardContent } from "~/core/components/ui/card";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { MockExamShell } from "~/features/mcq-exams/components/mock-exam-shell";
import {
  Chip,
  EmptyState,
  Section,
} from "~/features/community/components/community-ui";
import {
  getMyPointsBalance,
  listOwnPointsLedger,
} from "~/features/gs/queries-distinctions.server";

import type { Route } from "./+types/gs-points";

export const meta: Route.MetaFunction = () => [
  { title: "GS 포인트 | 리담변리사학원" },
];

const SOURCE_LABEL: Record<string, string> = {
  distinguished_round: "회차 종합 우수",
  distinguished_question: "문항 우수",
  distinction_revoked: "마킹 해제",
  manual_grant: "수동 지급",
  manual_revoke: "수동 차감",
};

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const [balance, ledger] = await Promise.all([
    getMyPointsBalance(client),
    listOwnPointsLedger(client, user.id),
  ]);

  return { balance, ledger };
}

export default function GsPoints({ loaderData }: Route.ComponentProps) {
  const { balance, ledger } = loaderData;

  return (
    <MockExamShell
      category="gs"
      width="narrow"
      backLink={{ to: "/gs", label: "온라인 GS" }}
      title="GS 포인트"
      desc="응시·동료 채점으로 적립하고 우수 답안 열람·자료 구입으로 차감됩니다."
    >
      <Card className="border-transparent bg-amber-500/[0.12] dark:bg-amber-500/[0.1]">
        <CardContent className="flex items-center gap-4 py-6">
          <span className="inline-flex size-14 shrink-0 items-center justify-center rounded-[18px] bg-amber-500 text-white">
            <CoinsIcon className="size-7" />
          </span>
          <div>
            <p className="font-mono text-[11px] font-bold tracking-[0.1em] uppercase text-amber-700 dark:text-amber-400">
              잔액
            </p>
            <p className="text-foreground mt-1 text-4xl font-extrabold tracking-tight tabular-nums">
              {balance.balance.toLocaleString("ko-KR")}
              <span className="text-muted-foreground ml-1.5 text-lg font-semibold">
                P
              </span>
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              누적 거래 {balance.txCount}건
            </p>
          </div>
        </CardContent>
      </Card>

      <Section eyebrow="적립·차감 이력">
        {ledger.length === 0 ? (
          <EmptyState
            icon={CoinsIcon}
            tone="subdued"
            title="아직 포인트 거래가 없습니다"
            body="응시와 동료 채점을 완료하면 포인트가 적립됩니다."
          />
        ) : (
          <div className="bg-card overflow-hidden rounded-2xl border">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-sm">
                <thead>
                  <tr className="bg-muted/60 border-b">
                    {[
                      ["시각", "left"],
                      ["유형", "left"],
                      ["내용", "left"],
                      ["금액", "right"],
                    ].map(([label, align]) => (
                      <th
                        key={label}
                        className={cn(
                          "text-muted-foreground px-3.5 py-2.5 font-mono text-[11px] font-bold tracking-[0.06em] whitespace-nowrap uppercase",
                          align === "right" ? "text-right" : "text-left",
                        )}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((row) => {
                    const positive = row.amount > 0;
                    return (
                      <tr
                        key={row.ledgerId}
                        className="border-border/60 hover:bg-muted/40 border-b transition-colors"
                      >
                        <td className="text-muted-foreground px-3.5 py-3 text-[11px] whitespace-nowrap tabular-nums">
                          {new Date(row.createdAt).toLocaleString("ko-KR", {
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="px-3.5 py-3">
                          <Chip tone={positive ? "emerald" : "coral"}>
                            {SOURCE_LABEL[row.source] ?? row.source}
                          </Chip>
                        </td>
                        <td className="px-3.5 py-3">
                          {row.description ?? (
                            <span className="text-muted-foreground italic">
                              —
                            </span>
                          )}
                        </td>
                        <td
                          className={cn(
                            "px-3.5 py-3 text-right font-mono font-extrabold tabular-nums",
                            positive
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-rose-600 dark:text-rose-400",
                          )}
                        >
                          {positive ? "+" : ""}
                          {row.amount.toLocaleString("ko-KR")}P
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Section>
    </MockExamShell>
  );
}
