// feat-8-031 — 정산 표시 공통(운영자 화면 · 강사 본인 팝업이 같은 표기를 쓴다). 서버 의존 없음.
import {
  TAX_TYPE_LABEL,
  type TaxType,
  bpToPercentText,
} from "~/features/subscriptions/settlement-engine";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export { TAX_TYPE_LABEL, bpToPercentText };
export type { TaxType };

export function fmtKrw(n: number): string {
  const sign = n < 0 ? "−" : "";
  return `${sign}₩${Math.abs(n).toLocaleString("ko-KR")}`;
}

export function fmtDateKst(iso: string | null): string {
  if (!iso) return "—";
  return new Date(new Date(iso).getTime() + KST_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

/** 강사에게 보여줄 때 수강생 이름을 가린다 — 홍길동 → 홍*동, 김철 → 김*. */
export function maskName(name: string | null): string {
  if (!name) return "—";
  const t = name.trim();
  if (t.length <= 1) return t;
  if (t.length === 2) return `${t[0]}*`;
  return `${t[0]}${"*".repeat(t.length - 2)}${t[t.length - 1]}`;
}

export const SETTLEMENT_STATUS_META: Record<
  "draft" | "confirmed" | "paid",
  { label: string; tone: "amber" | "blue" | "emerald" }
> = {
  draft: { label: "초안", tone: "amber" },
  confirmed: { label: "확정", tone: "blue" },
  paid: { label: "지급완료", tone: "emerald" },
};

/** 강사 화면 문구 — 저장된 정산서가 없는 달은 "집계 중(예상)". */
export const LIVE_STATUS_LABEL = "집계 중";

/** 강사 본인 정산현황 한 달치 — 서버(self-settlement.server)와 화면(settlement-panel)이 공유. */
export interface SettlementPanelItem {
  itemId: string;
  kind: "share" | "refund_adjustment";
  saleAt: string | null;
  label: string | null;
  studentName: string | null;
  baseAmountKrw: number;
  feeKrw: number;
  shareAmountKrw: number;
}

export interface SettlementPanelTotals {
  grossKrw: number;
  refundKrw: number;
  feeKrw: number;
  netSalesKrw: number;
  shareKrw: number;
  feeRateBp: number;
  taxType: TaxType;
  taxRateBp: number;
  taxKrw: number;
  payoutKrw: number;
}

export interface SettlementPanelData {
  month: string;
  months: string[];
  /** live = 저장된 정산서가 아직 없는 달(예상치). */
  status: "live" | "draft" | "confirmed" | "paid";
  confirmedAt: string | null;
  paidAt: string | null;
  ratioLabel: string;
  feeRateConfigured: boolean;
  hasRule: boolean;
  totals: SettlementPanelTotals;
  items: SettlementPanelItem[];
}

/** 요약 9칸의 순서·라벨·설명 — 원장이 요청한 항목 그대로. */
export interface SummaryCell {
  key: string;
  label: string;
  value: number;
  hint?: string;
  tone?: "plain" | "minus" | "strong";
}

export function summaryCells(t: {
  grossKrw: number;
  refundKrw: number;
  feeKrw: number;
  netSalesKrw: number;
  shareKrw: number;
  feeRateBp: number;
  taxType: TaxType;
  taxRateBp: number;
  taxKrw: number;
  payoutKrw: number;
  ratioLabel: string;
}): SummaryCell[] {
  return [
    { key: "gross", label: "결제", value: t.grossKrw },
    { key: "refund", label: "환불", value: t.refundKrw, tone: "minus" },
    {
      key: "fee",
      label: "수수료",
      value: t.feeKrw,
      hint: t.feeRateBp > 0 ? bpToPercentText(t.feeRateBp) : "미설정",
      tone: "minus",
    },
    {
      key: "net",
      label: "매출",
      value: t.netSalesKrw,
      hint: "결제 − 환불 − 수수료",
    },
    {
      key: "share",
      label: "정산금액",
      value: t.shareKrw,
      hint: `정산비율 ${t.ratioLabel}`,
    },
    {
      key: "tax",
      label: "세금액",
      value: t.taxKrw,
      hint: `${TAX_TYPE_LABEL[t.taxType]} ${bpToPercentText(t.taxRateBp)}`,
      tone: "minus",
    },
    {
      key: "payout",
      label: "정산 지급액",
      value: t.payoutKrw,
      hint: "정산금액 − 세금액",
      tone: "strong",
    },
  ];
}
