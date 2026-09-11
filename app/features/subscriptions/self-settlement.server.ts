// feat-8-031 — 강사 본인 정산현황 한 달치 조회. 팝업(API)·전체 화면(loader)이 같은 함수를 쓴다.
// ★소유자 강제는 호출부 책임: instructor_settlements 는 RLS 정책이 없어 adminClient 로만 읽히므로
//   여기에 넘기는 instructorId 는 반드시 "본인 또는 manager+ 가 지정한 값"이어야 한다.
//   확정·지급된 달은 저장된 스냅샷(지급 근거), 그 밖에는 지금 값으로 계산한 예상치를 돌려준다.
import {
  type SettlementPanelData,
  maskName,
} from "~/features/subscriptions/lib/settlement-format";
import {
  ratioLabelOf,
  totalsOf,
} from "~/features/subscriptions/settlement-engine";
import {
  getSettlementParams,
  taxProfileFor,
} from "~/features/subscriptions/settlement-params.server";
import {
  type SettlementItemRow,
  computeLiveSettlement,
  getSettlementDetail,
  hasActiveShareRule,
  listSettlements,
  recentMonthsKst,
} from "~/features/subscriptions/settlements-admin.server";

/** 조회 가능한 기간 — 최근 12개월. */
export const SETTLEMENT_MONTH_WINDOW = 12;

export async function loadSelfSettlement(input: {
  instructorId: string;
  month?: string | null;
}): Promise<SettlementPanelData> {
  const months = recentMonthsKst(SETTLEMENT_MONTH_WINDOW);
  const month =
    input.month && months.includes(input.month) ? input.month : months[0];
  const { instructorId } = input;

  const [saved, params, hasRule] = await Promise.all([
    listSettlements({ month, instructorId }).then((rows) => rows[0] ?? null),
    getSettlementParams(),
    hasActiveShareRule(instructorId),
  ]);
  const tax = taxProfileFor(params, instructorId);

  let status: SettlementPanelData["status"];
  let items: SettlementItemRow[];
  let totals: SettlementPanelData["totals"];
  let confirmedAt: string | null = null;
  let paidAt: string | null = null;

  if (saved && saved.status !== "draft") {
    const detail = await getSettlementDetail(saved.settlementId, {
      instructorId,
    });
    items = detail?.items ?? [];
    status = saved.status;
    confirmedAt = saved.confirmedAt;
    paidAt = saved.paidAt;
    totals = {
      grossKrw: saved.grossKrw,
      refundKrw: saved.refundKrw,
      feeKrw: saved.feeKrw,
      netSalesKrw: saved.netSalesKrw,
      shareKrw: saved.totalShareKrw,
      feeRateBp: saved.feeRateBp,
      taxType: saved.taxType,
      taxRateBp: saved.taxRateBp,
      taxKrw: saved.taxKrw,
      payoutKrw: saved.payoutKrw,
    };
  } else {
    const live = await computeLiveSettlement(month, instructorId);
    items = live?.items ?? [];
    totals = live?.totals ?? totalsOf([], params.feeRateBp, tax);
    status = "live";
  }

  return {
    month,
    months,
    status,
    confirmedAt,
    paidAt,
    ratioLabel: ratioLabelOf(items),
    feeRateConfigured: params.feeRateBp > 0,
    hasRule,
    totals,
    items: items.map((i) => ({
      itemId: i.itemId,
      kind: i.kind,
      saleAt: i.saleAt,
      label: i.label,
      // 수강생 이름은 강사 화면에서 가린다 — 정산에 필요한 정보가 아니다(운영자 화면은 전체 표기).
      studentName: maskName(i.studentName),
      baseAmountKrw: i.baseAmountKrw,
      feeKrw: i.feeKrw,
      shareAmountKrw: i.shareAmountKrw,
    })),
  };
}
