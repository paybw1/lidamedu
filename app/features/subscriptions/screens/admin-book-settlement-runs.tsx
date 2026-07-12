// feat-8-029 P6 — 도서 정산 목록·생성 (manager+).
// 월 선택 → 정산 생성(초안 재생성) → payee(저자/출판사)별 확정 → 지급완료.

import { CalculatorIcon } from "lucide-react";
import { Form, Link } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { requireManager } from "~/core/lib/admin-guard.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip, IndexTable, TD, TR } from "~/features/admin/components/admin-ui";
import {
  listBookSettlements,
  type SettlementStatus,
} from "~/features/subscriptions/book-settlements-admin.server";

import type { Route } from "./+types/admin-book-settlement-runs";

export const meta: Route.MetaFunction = () => [{ title: "도서 정산 | 운영자" }];

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function prevMonthKst(): string {
  const now = new Date(Date.now() + KST_OFFSET_MS);
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  return m === 0 ? `${y - 1}-12` : `${y}-${String(m).padStart(2, "0")}`;
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireManager(request);

  const url = new URL(request.url);
  const month = url.searchParams.get("month") ?? prevMonthKst();
  const msg = url.searchParams.get("msg") ?? null;
  const all = url.searchParams.get("all") === "1";
  const settlements = await listBookSettlements(all ? {} : { month });
  return { settlements, month, msg, all };
}

function fmtKrw(n: number): string {
  const sign = n < 0 ? "−" : "";
  return `${sign}₩${Math.abs(n).toLocaleString("ko-KR")}`;
}

const STATUS_META: Record<SettlementStatus, { label: string; tone: "amber" | "blue" | "emerald" }> = {
  draft: { label: "초안", tone: "amber" },
  confirmed: { label: "확정", tone: "blue" },
  paid: { label: "지급완료", tone: "emerald" },
};

export default function AdminBookSettlementRuns({ loaderData }: Route.ComponentProps) {
  const { settlements, month, msg, all } = loaderData;
  const totalKrw = settlements.reduce((a, s) => a + s.totalShareKrw, 0);

  return (
    <AdminShell
      cluster="sales"
      title="도서 정산"
      desc="도서 배분 기준을 적용해 월 단위 도서정산을 생성합니다. 초안은 재생성할 수 있고, 확정 후에는 재생성에서 제외됩니다. 확정 후 발생한 환불은 다음 달 정산에서 음수 항목으로 차감됩니다. (배분규칙은 '도서 배분 기준'에서 등록)"
    >
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Form method="get" className="flex items-end gap-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-[11px] font-semibold">정산 월</span>
            <Input type="month" name="month" defaultValue={month} className="h-9 w-40" />
          </label>
          <Button type="submit" size="sm" variant="outline">
            조회
          </Button>
          <Link
            to="/admin/settlements/book-runs?all=1"
            className={
              "px-1 pb-2 text-xs font-semibold " +
              (all ? "text-foreground" : "text-link hover:underline")
            }
          >
            전체 보기
          </Link>
        </Form>
        <Form
          method="post"
          action="/api/admin/book-settlement"
          className="ml-auto"
          onSubmit={(e) => {
            if (!confirm(`${month} 도서정산을 생성(초안 재생성)하시겠습니까?`)) e.preventDefault();
          }}
        >
          <input type="hidden" name="intent" value="generate" />
          <input type="hidden" name="month" value={month} />
          <Button type="submit" size="sm">
            <CalculatorIcon className="size-3.5" /> {month} 정산 생성
          </Button>
        </Form>
      </div>

      {msg ? (
        <div className="border-border bg-primary/[0.05] text-foreground mb-4 rounded-lg border px-4 py-2.5 text-sm">
          {msg}
        </div>
      ) : null}

      {settlements.length === 0 ? (
        <div className="border-border bg-card text-muted-foreground rounded-xl border py-14 text-center text-sm shadow-sm">
          {all ? "정산 내역이 없습니다." : `${month} 도서정산이 없습니다 — "정산 생성"으로 초안을 만드세요.`}
        </div>
      ) : (
        <IndexTable
          minWidth={820}
          headers={[
            { label: "정산 월", width: "7rem" },
            { label: "정산 대상(저자/출판사)" },
            { label: "항목", align: "right", width: "5rem" },
            { label: "정산액", align: "right", width: "9rem" },
            { label: "상태", align: "center", width: "6rem" },
            { label: "확정/지급", width: "12rem" },
            { label: "", align: "right", width: "10rem" },
          ]}
          footer={
            <div className="border-border/60 text-muted-foreground border-t px-3 py-2 text-[11px] font-medium tabular-nums">
              {settlements.length}건 · 합계 {fmtKrw(totalKrw)}
            </div>
          }
        >
          {settlements.map((s) => {
            const m = STATUS_META[s.status];
            return (
              <TR key={s.settlementId}>
                <TD mono>{s.periodStart.slice(0, 7)}</TD>
                <TD>
                  <Link
                    to={`/admin/settlements/book-runs/${s.settlementId}`}
                    className="text-link font-semibold hover:underline"
                  >
                    {s.payeeName}
                  </Link>
                </TD>
                <TD align="right" mono soft>
                  {s.itemCount}
                </TD>
                <TD align="right" mono>
                  {fmtKrw(s.totalShareKrw)}
                </TD>
                <TD align="center">
                  <Chip tone={m.tone}>{m.label}</Chip>
                </TD>
                <TD mono soft className="text-[11px]">
                  {s.confirmedAt ? `확정 ${s.confirmedAt.slice(0, 10)}` : "—"}
                  {s.paidAt ? ` · 지급 ${s.paidAt.slice(0, 10)}` : ""}
                </TD>
                <TD align="right">
                  <BookSettlementActions
                    settlementId={s.settlementId}
                    status={s.status}
                    backTo={`/admin/settlements/book-runs?month=${s.periodStart.slice(0, 7)}`}
                  />
                </TD>
              </TR>
            );
          })}
        </IndexTable>
      )}
    </AdminShell>
  );
}

export function BookSettlementActions({
  settlementId,
  status,
  backTo,
}: {
  settlementId: string;
  status: SettlementStatus;
  backTo: string;
}) {
  const btn = "text-link text-xs font-semibold hover:underline";
  return (
    <div className="inline-flex items-center gap-2.5">
      {status === "draft" ? (
        <Form
          method="post"
          action="/api/admin/book-settlement"
          onSubmit={(e) => {
            if (!confirm("정산을 확정하시겠습니까? 확정하면 재생성에서 제외됩니다.")) e.preventDefault();
          }}
        >
          <input type="hidden" name="intent" value="confirm" />
          <input type="hidden" name="settlementId" value={settlementId} />
          <input type="hidden" name="backTo" value={backTo} />
          <button type="submit" className={btn}>
            확정
          </button>
        </Form>
      ) : null}
      {status === "confirmed" ? (
        <>
          <Form
            method="post"
            action="/api/admin/book-settlement"
            onSubmit={(e) => {
              if (!confirm("지급완료로 표시하시겠습니까? 되돌릴 수 없습니다.")) e.preventDefault();
            }}
          >
            <input type="hidden" name="intent" value="mark_paid" />
            <input type="hidden" name="settlementId" value={settlementId} />
            <input type="hidden" name="backTo" value={backTo} />
            <button type="submit" className={btn}>
              지급완료
            </button>
          </Form>
          <Form
            method="post"
            action="/api/admin/book-settlement"
            onSubmit={(e) => {
              if (!confirm("확정을 취소하고 초안으로 되돌리시겠습니까?")) e.preventDefault();
            }}
          >
            <input type="hidden" name="intent" value="revert_draft" />
            <input type="hidden" name="settlementId" value={settlementId} />
            <input type="hidden" name="backTo" value={backTo} />
            <button
              type="submit"
              className="text-muted-foreground text-xs font-semibold hover:underline"
            >
              확정 취소
            </button>
          </Form>
        </>
      ) : null}
    </div>
  );
}
