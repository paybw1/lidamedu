// feat-8-031 — 강사 본인 정산현황 패널. 상단 계정 아이콘 팝업과 /lecture/settlements 전체 화면이
// 같은 컴포넌트를 쓴다(표기 한 벌). 월을 바꾸면 /api/lecture/settlement 를 다시 불러온다.
//   · 확정·지급된 달  → 저장된 정산서(확정 시점 스냅샷).
//   · 그 밖의 달      → 지금 값으로 계산한 "집계 중" 예상치(정산 생성은 운영자가 월 단위로 수동 실행).
import { AlertTriangleIcon, DownloadIcon, Loader2Icon } from "lucide-react";
import { useFetcher } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import {
  SETTLEMENT_STATUS_META,
  fmtDateKst,
  fmtKrw,
  summaryCells,
} from "~/features/subscriptions/lib/settlement-format";
import type { SettlementPanelData } from "~/features/subscriptions/lib/settlement-format";

export type {
  SettlementPanelData,
  SettlementPanelItem,
} from "~/features/subscriptions/lib/settlement-format";

export const SETTLEMENT_API = "/api/lecture/settlement";

function StatusBadge({ data }: { data: SettlementPanelData }) {
  if (data.status === "live")
    return (
      <Badge variant="secondary" className="text-[11px]">
        집계 중 · 예상
      </Badge>
    );
  const meta = SETTLEMENT_STATUS_META[data.status];
  return (
    <Badge
      variant={data.status === "paid" ? "default" : "secondary"}
      className="text-[11px]"
    >
      {meta.label}
    </Badge>
  );
}

export function SettlementPanel({
  initial,
  compact = false,
}: {
  initial: SettlementPanelData;
  /** 팝업에서는 표 열을 줄이고 높이를 제한한다. */
  compact?: boolean;
}) {
  const fetcher = useFetcher<SettlementPanelData>();
  const data = fetcher.data ?? initial;
  const loading = fetcher.state !== "idle";

  // 월을 바꿔도 팝업이 닫히지 않도록 navigation 이 아니라 fetcher 로 다시 불러온다.
  const cells = summaryCells({ ...data.totals, ratioLabel: data.ratioLabel });
  const load = (month: string) =>
    fetcher.load(`${SETTLEMENT_API}?month=${encodeURIComponent(month)}`);

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 px-1 pb-3">
        <label className="sr-only" htmlFor="settlement-month">
          정산 월
        </label>
        <select
          id="settlement-month"
          className="border-border bg-background h-8 rounded-lg border px-2 text-sm font-semibold tabular-nums"
          value={data.month}
          onChange={(e) => load(e.target.value)}
        >
          {data.months.map((m) => (
            <option key={m} value={m}>
              {m.replace("-", "년 ")}월
            </option>
          ))}
        </select>
        <StatusBadge data={data} />
        {loading ? (
          <Loader2Icon className="text-muted-foreground size-4 animate-spin" />
        ) : null}
        <span className="text-muted-foreground text-xs">
          {data.status === "paid"
            ? `지급 ${fmtDateKst(data.paidAt)}`
            : data.status === "confirmed"
              ? `확정 ${fmtDateKst(data.confirmedAt)}`
              : "결제일 기준 집계 · 환불은 발생한 달에서 차감"}
        </span>
        <Button asChild size="sm" variant="outline" className="ml-auto">
          <a href={`${SETTLEMENT_API}?month=${data.month}&export=csv`} download>
            <DownloadIcon className="size-3.5" /> CSV
          </a>
        </Button>
      </div>

      {!data.hasRule ? (
        <Notice>
          배분 규칙이 등록되지 않아 정산금액이 0으로 표시됩니다. 원장에게 배분
          기준 등록을 요청해 주세요.
        </Notice>
      ) : null}
      {!data.feeRateConfigured ? (
        <Notice>
          결제 수수료율이 아직 설정되지 않아 수수료를 0원으로 계산했습니다.
        </Notice>
      ) : null}

      <div className="grid grid-cols-2 gap-2 px-1 sm:grid-cols-4">
        {cells.map((c) => (
          <div
            key={c.key}
            className={
              "border-border rounded-xl border p-3 " +
              (c.tone === "strong" ? "bg-primary/[0.06]" : "bg-card")
            }
          >
            <p className="text-muted-foreground text-[11px] font-semibold">
              {c.label}
            </p>
            <p
              className={
                "mt-0.5 font-bold tabular-nums " +
                (compact ? "text-base" : "text-lg") +
                (c.tone === "minus" && c.value !== 0
                  ? " text-rose-600 dark:text-rose-400"
                  : c.tone === "strong"
                    ? " text-emerald-700 dark:text-emerald-300"
                    : "")
              }
            >
              {c.tone === "minus" && c.value > 0
                ? `−${fmtKrw(c.value)}`
                : fmtKrw(c.value)}
            </p>
            {c.hint ? (
              <p className="text-muted-foreground mt-0.5 text-[11px]">
                {c.hint}
              </p>
            ) : null}
          </div>
        ))}
      </div>

      <div
        className={
          "mt-3 min-h-0 overflow-auto px-1 " + (compact ? "max-h-[38vh]" : "")
        }
      >
        {data.items.length === 0 ? (
          <p className="text-muted-foreground border-border bg-card rounded-xl border py-10 text-center text-sm">
            이 달에 정산 대상 결제가 없습니다.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-muted-foreground sticky top-0 bg-white text-[11px] font-semibold dark:bg-neutral-950">
              <tr className="border-border border-b">
                <th className="px-2 py-2 text-left">구분</th>
                <th className="px-2 py-2 text-left">일자</th>
                <th className="px-2 py-2 text-left">강의·상품</th>
                {compact ? null : (
                  <th className="px-2 py-2 text-left">수강생</th>
                )}
                <th className="px-2 py-2 text-right">결제액</th>
                {compact ? null : (
                  <th className="px-2 py-2 text-right">수수료</th>
                )}
                <th className="px-2 py-2 text-right">정산금액</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((i) => (
                <tr key={i.itemId} className="border-border/60 border-b">
                  <td className="px-2 py-2">
                    <Badge
                      variant="secondary"
                      className="text-[10px] font-semibold"
                    >
                      {i.kind === "share" ? "배분" : "환불차감"}
                    </Badge>
                  </td>
                  <td className="text-muted-foreground px-2 py-2 tabular-nums">
                    {fmtDateKst(i.saleAt)}
                  </td>
                  <td className="max-w-[14rem] truncate px-2 py-2">
                    {i.label ?? "—"}
                  </td>
                  {compact ? null : (
                    <td className="text-muted-foreground px-2 py-2">
                      {i.studentName ?? "—"}
                    </td>
                  )}
                  <td className="px-2 py-2 text-right tabular-nums">
                    {fmtKrw(i.baseAmountKrw)}
                  </td>
                  {compact ? null : (
                    <td className="text-muted-foreground px-2 py-2 text-right tabular-nums">
                      {i.feeKrw === 0 ? "—" : fmtKrw(-Math.abs(i.feeKrw))}
                    </td>
                  )}
                  <td
                    className={
                      "px-2 py-2 text-right font-semibold tabular-nums " +
                      (i.shareAmountKrw < 0
                        ? "text-rose-600 dark:text-rose-400"
                        : "")
                    }
                  >
                    {fmtKrw(i.shareAmountKrw)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-border text-foreground mx-1 mb-2 flex items-start gap-1.5 rounded-lg border bg-amber-500/[0.08] px-3 py-2 text-xs">
      <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
      <span>{children}</span>
    </p>
  );
}
