// feat-8-031 — 강사 본인 정산현황 조회 API (강사 이상). 팝업이 월을 바꿀 때마다 이걸 부르고,
// ?export=csv 면 같은 내용을 CSV 로 내려준다.
// ★보안: instructor_settlements 는 RLS 정책이 없어(전면 차단) adminClient 로만 읽힌다. 소유자
//   필터를 여기서 강제한다 — 강사는 자기 것만, manager+ 만 instructorId 로 남의 것을 지정할 수 있다.
import type { Route } from "./+types/lecture-settlement";

import { data } from "react-router";

import { requireStaff } from "~/core/lib/admin-guard.server";
import { csvResponse } from "~/core/lib/csv.server";
import { roleAtLeast } from "~/core/lib/roles";
import { fmtDateKst } from "~/features/subscriptions/lib/settlement-format";
import { loadSelfSettlement } from "~/features/subscriptions/self-settlement.server";

export async function loader({ request }: Route.LoaderArgs) {
  const { user, role } = await requireStaff(request, "instructor");
  const url = new URL(request.url);
  const askedFor = url.searchParams.get("instructorId");
  const instructorId =
    askedFor && roleAtLeast(role, "manager") ? askedFor : user.id;

  const panel = await loadSelfSettlement({
    instructorId,
    month: url.searchParams.get("month"),
  });

  if (url.searchParams.get("export") === "csv") {
    const t = panel.totals;
    const headers = [
      "구분",
      "일자",
      "강의·상품",
      "수강생",
      "결제액(원)",
      "수수료(원)",
      "정산금액(원)",
    ];
    const rows: unknown[][] = panel.items.map((r) => [
      r.kind === "share" ? "배분" : "환불차감",
      fmtDateKst(r.saleAt),
      r.label ?? "",
      r.studentName ?? "",
      r.baseAmountKrw,
      r.feeKrw,
      r.shareAmountKrw,
    ]);
    rows.push(
      [],
      ["합계", "", "결제", "", t.grossKrw, "", ""],
      ["합계", "", "환불", "", t.refundKrw, "", ""],
      ["합계", "", "수수료", "", "", t.feeKrw, ""],
      ["합계", "", "매출(결제−환불−수수료)", "", t.netSalesKrw, "", ""],
      [
        "합계",
        "",
        `정산금액(정산비율 ${panel.ratioLabel})`,
        "",
        "",
        "",
        t.shareKrw,
      ],
      ["합계", "", "세금액", "", "", "", -t.taxKrw],
      ["합계", "", "정산 지급액", "", "", "", t.payoutKrw],
    );
    return csvResponse(`정산현황_${panel.month}.csv`, headers, rows);
  }

  return data(panel);
}
