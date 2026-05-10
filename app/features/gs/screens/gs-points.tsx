// 학생 — GS 포인트 잔액 + 적립/회수 이력.

import { ArrowLeftIcon, CoinsIcon } from "lucide-react";
import { Link, data } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/core/components/ui/table";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  getMyPointsBalance,
  listOwnPointsLedger,
} from "~/features/gs/queries-distinctions.server";

import type { Route } from "./+types/gs-points";

export const meta: Route.MetaFunction = () => [
  { title: "GS 포인트 | Lidam Edu" },
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
    <div className="mx-auto w-full max-w-screen-md px-5 py-6 md:px-10 md:py-8">
      <header className="mb-6 space-y-1">
        <Link
          to="/gs"
          className="text-muted-foreground inline-flex items-center gap-1 text-xs hover:underline"
        >
          <ArrowLeftIcon className="size-3" /> 온라인 GS
        </Link>
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
          <CoinsIcon className="size-3.5" /> 내 포인트
        </p>
        <h1 className="text-2xl font-bold tracking-tight">GS 포인트</h1>
      </header>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <p className="text-muted-foreground text-xs tracking-wide uppercase">
            현재 잔액
          </p>
          <p className="text-foreground mt-1 text-4xl font-bold tabular-nums">
            {balance.balance}
            <span className="text-muted-foreground ml-1 text-base font-normal">
              P
            </span>
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            누적 거래 {balance.txCount}건
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold tracking-tight">적립·차감 이력</h2>
        </CardHeader>
        <CardContent className="p-0">
          {ledger.length === 0 ? (
            <p className="text-muted-foreground p-6 text-center text-sm">
              아직 포인트 거래가 없습니다.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[160px]">시각</TableHead>
                  <TableHead className="w-[110px]">유형</TableHead>
                  <TableHead>내용</TableHead>
                  <TableHead className="w-[80px] text-right">금액</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ledger.map((row) => (
                  <TableRow key={row.ledgerId}>
                    <TableCell className="text-muted-foreground text-[11px] tabular-nums">
                      {new Date(row.createdAt).toLocaleString("ko-KR", {
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {SOURCE_LABEL[row.source] ?? row.source}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.description ?? (
                        <span className="text-muted-foreground italic">—</span>
                      )}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-semibold tabular-nums",
                        row.amount > 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-600 dark:text-rose-400",
                      )}
                    >
                      {row.amount > 0 ? "+" : ""}
                      {row.amount}P
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
