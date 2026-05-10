// 운영자 — 학생 잔액 보기 + 수동 지급/차감.

import { ArrowLeftIcon, CoinsIcon, MinusIcon, PlusIcon } from "lucide-react";
import { Form, Link, data, useFetcher } from "react-router";
import { z } from "zod";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/core/components/ui/table";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  awardPoints,
  listTopPointsBalances,
} from "~/features/gs/queries-distinctions.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/admin-gs-points";

export const meta: Route.MetaFunction = () => [
  { title: "GS 포인트 관리 | Lidam Edu" },
];

const grantSchema = z.object({
  intent: z.literal("grant"),
  userId: z.string().uuid(),
  amount: z.coerce.number().refine((v) => v !== 0, "amount required"),
  description: z.string().max(500).optional(),
});

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const balances = await listTopPointsBalances(client, 200);
  return { balances };
}

export async function action({ request }: Route.ActionArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" } as const;
  const role = await getStaffRole(client, user.id);
  if (!role) return { ok: false, error: "Forbidden" } as const;

  const fd = await request.formData();
  const parsed = grantSchema.safeParse({
    intent: fd.get("intent"),
    userId: fd.get("userId"),
    amount: fd.get("amount"),
    description: fd.get("description") ?? undefined,
  });
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;

  await awardPoints(client, user.id, {
    userId: parsed.data.userId,
    amount: parsed.data.amount,
    source: parsed.data.amount > 0 ? "manual_grant" : "manual_revoke",
    description: parsed.data.description ?? null,
  });
  return { ok: true } as const;
}

export default function AdminGsPoints({ loaderData }: Route.ComponentProps) {
  const { balances } = loaderData;

  return (
    <div className="mx-auto w-full max-w-screen-xl px-5 py-6 md:px-10 md:py-8">
      <header className="mb-6 space-y-1">
        <Link
          to="/admin"
          className="text-muted-foreground inline-flex items-center gap-1 text-xs hover:underline"
        >
          <ArrowLeftIcon className="size-3" /> 운영자
        </Link>
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
          <CoinsIcon className="size-3.5" /> 운영자 · GS 포인트
        </p>
        <h1 className="text-2xl font-bold tracking-tight">포인트 관리</h1>
        <p className="text-muted-foreground text-sm">
          우수 답안 마킹 시 자동 지급된 포인트와 수동 지급 내역을 한눈에 봅니다.
        </p>
      </header>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold tracking-tight">학생 잔액 순위</h2>
        </CardHeader>
        <CardContent className="p-0">
          {balances.length === 0 ? (
            <p className="text-muted-foreground p-6 text-center text-sm">
              아직 포인트 거래가 없습니다.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">순위</TableHead>
                  <TableHead className="min-w-[200px]">학생</TableHead>
                  <TableHead className="w-[120px]">잔액</TableHead>
                  <TableHead className="w-[100px]">거래</TableHead>
                  <TableHead className="min-w-[260px]">수동 조정</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {balances.map((b, i) => (
                  <TableRow key={b.userId}>
                    <TableCell className="font-medium tabular-nums">
                      {i + 1}
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">
                        {b.userName ?? (
                          <span className="text-muted-foreground italic">
                            미설정
                          </span>
                        )}
                      </p>
                      <p className="text-muted-foreground text-[10px] tabular-nums">
                        {b.userId.slice(0, 8)}
                      </p>
                    </TableCell>
                    <TableCell className="text-foreground font-bold tabular-nums">
                      {b.balance}
                      <span className="text-muted-foreground ml-1 text-xs font-normal">
                        P
                      </span>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      <Badge variant="outline" className="text-[10px]">
                        {b.txCount}건
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <GrantForm userId={b.userId} />
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

function GrantForm({ userId }: { userId: string }) {
  const fetcher = useFetcher<typeof action>();
  return (
    <fetcher.Form
      method="post"
      className="flex flex-wrap items-center gap-1.5"
    >
      <input type="hidden" name="intent" value="grant" />
      <input type="hidden" name="userId" value={userId} />
      <input
        type="number"
        name="amount"
        placeholder="±N"
        className="border-input bg-background h-7 w-16 rounded-md border px-2 text-xs tabular-nums"
        required
      />
      <input
        type="text"
        name="description"
        placeholder="사유 (선택)"
        className="border-input bg-background h-7 w-32 rounded-md border px-2 text-xs"
      />
      <Button
        type="submit"
        size="sm"
        variant="outline"
        className="h-7 px-2 text-[11px]"
        disabled={fetcher.state !== "idle"}
      >
        <PlusIcon className="size-3" /> 적용
      </Button>
    </fetcher.Form>
  );
}

// 미사용 — 향후 차감 분리 버튼 예정 자리.
function _Minus() {
  return <MinusIcon className="size-3" />;
}
void _Minus;
