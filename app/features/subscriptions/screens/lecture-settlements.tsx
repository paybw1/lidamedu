// feat-8-031 — 강사 본인 정산현황 전체 화면 (/lecture/settlements, 강사 이상).
// 상단 계정 아이콘 팝업과 같은 패널을 쓴다. 알림(정산 확정·지급)의 링크 목적지이기도 하다.
import type { Route } from "./+types/lecture-settlements";

import { WalletIcon } from "lucide-react";

import { requireStaff } from "~/core/lib/admin-guard.server";
import { roleAtLeast } from "~/core/lib/roles";
import {
  SettlementPanel,
  type SettlementPanelData,
} from "~/features/subscriptions/components/settlement-panel";
import { loadSelfSettlement } from "~/features/subscriptions/self-settlement.server";

export function meta() {
  return [{ title: "정산현황 | 리담변리사학원" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { user, role } = await requireStaff(request, "instructor");
  const url = new URL(request.url);
  const askedFor = url.searchParams.get("instructorId");
  const instructorId =
    askedFor && roleAtLeast(role, "manager") ? askedFor : user.id;
  return {
    panel: await loadSelfSettlement({
      instructorId,
      month: url.searchParams.get("month"),
    }),
  };
}

export default function LectureSettlements({
  loaderData,
}: Route.ComponentProps) {
  const panel = loaderData.panel as SettlementPanelData;
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 md:px-6 md:py-10">
      <header className="mb-5">
        <p className="text-muted-foreground inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
          <WalletIcon className="size-3.5" /> 마이페이지
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">정산현황</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          월별 강사료 내역입니다. 결제일 기준으로 집계하고, 환불은 발생한 달에서
          차감합니다. 확정 전 금액은 예상치입니다.
        </p>
      </header>
      <SettlementPanel initial={panel} />
    </div>
  );
}
