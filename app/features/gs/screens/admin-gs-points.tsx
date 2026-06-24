// 운영자 — 학생 잔액 보기 + 수동 지급/차감.
// 패턴 P2 LIST/TABLE. AdminShell cluster="gs".

import { CoinsIcon, PlusIcon } from "lucide-react";
import { data, useFetcher } from "react-router";
import { z } from "zod";

import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip, IndexTable, TD, TR, type TableHeaderDef } from "~/features/admin/components/admin-ui";
import {
  awardPoints,
  listTopPointsBalances,
} from "~/features/gs/queries-distinctions.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/admin-gs-points";

export const meta: Route.MetaFunction = () => [
  { title: "GS 포인트 관리 | 리담변리사학원" },
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
  return { balances, role };
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

const TABLE_HEADERS: TableHeaderDef[] = [
  { label: "순위", width: "3.5rem" },
  { label: "학생" },
  { label: "잔액", width: "7rem", align: "right" },
  { label: "거래", width: "5.5rem", align: "right" },
  { label: "수동 조정", width: "22rem" },
];

export default function AdminGsPoints({ loaderData }: Route.ComponentProps) {
  const { balances, role } = loaderData;

  return (
    <AdminShell
      cluster="gs"
      role={role}
      title="포인트 관리"
      desc="우수 답안 마킹 시 자동 지급된 포인트와 수동 지급 내역을 한눈에 봅니다."
      headerRight={
        <div className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-semibold">
          <CoinsIcon className="text-amber-500 size-3.5" />
          <span className="text-muted-foreground">잔액 기준 최대 200명</span>
        </div>
      }
    >
      {balances.length === 0 ? (
        <div className="border-border bg-card text-muted-foreground rounded-xl border py-16 text-center text-sm shadow-sm">
          아직 포인트 거래가 없습니다.
        </div>
      ) : (
        <IndexTable
          minWidth={800}
          headers={TABLE_HEADERS}
          footer={
            <div className="border-border/60 text-muted-foreground border-t px-3 py-2 text-[11px] font-medium tabular-nums">
              총 {balances.length}명
            </div>
          }
        >
          {balances.map((b, i) => (
            <TR key={b.userId}>
              <TD mono soft>
                {i + 1}
              </TD>
              <TD>
                <p className="font-medium">
                  {b.userName ?? (
                    <span className="text-muted-foreground italic">미설정</span>
                  )}
                </p>
                <p className="text-muted-foreground text-[10px] tabular-nums">
                  {b.userId.slice(0, 8)}
                </p>
              </TD>
              <TD align="right" mono>
                <span className="font-bold">{b.balance}</span>
                <span className="text-muted-foreground ml-1 text-xs font-normal">P</span>
              </TD>
              <TD align="right">
                <Chip tone="neutral">{b.txCount}건</Chip>
              </TD>
              <TD>
                <GrantForm userId={b.userId} />
              </TD>
            </TR>
          ))}
        </IndexTable>
      )}
    </AdminShell>
  );
}

/* ── 수동 조정 폼 ───────────────────────────────────────────────────────── */

function GrantForm({ userId }: { userId: string }) {
  const fetcher = useFetcher<typeof action>();
  const saved = fetcher.data && "ok" in fetcher.data && fetcher.data.ok;
  return (
    <fetcher.Form method="post" className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="intent" value="grant" />
      <input type="hidden" name="userId" value={userId} />
      <input
        type="number"
        name="amount"
        placeholder="±N"
        required
        className="border-input bg-background focus:border-primary h-7 w-16 rounded-md border px-2 text-xs tabular-nums outline-none"
      />
      <input
        type="text"
        name="description"
        placeholder="사유 (선택)"
        className="border-input bg-background focus:border-primary h-7 w-32 rounded-md border px-2 text-xs outline-none"
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
      {saved ? (
        <span className="text-emerald-600 dark:text-emerald-400 text-[11px]">완료</span>
      ) : null}
      {fetcher.data && "error" in fetcher.data && fetcher.data.error ? (
        <span className="text-rose-600 text-[11px]">{fetcher.data.error}</span>
      ) : null}
    </fetcher.Form>
  );
}
