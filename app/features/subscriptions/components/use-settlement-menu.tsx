// feat-8-031 — 계정 드롭다운의 「정산현황」 항목 + 팝업을 한 쌍으로 묶어 준다.
// 두 플랫폼(강의·학습)의 계정 메뉴가 같은 항목을 쓰도록 하기 위한 공용 훅.
//
// ★팝업을 드롭다운 안에 렌더하면 메뉴가 닫힐 때 같이 언마운트돼 죽는다.
//   그래서 item 과 dialog 를 나눠 돌려주고, 호출부가 dialog 를 메뉴 **바깥**에 놓는다.
// ★항목 선택 시 preventDefault 로 메뉴를 열어둔 채 Dialog 를 띄우면, 닫은 뒤 body 에
//   pointer-events:none 가 남아 화면 전체가 죽는다(E2E 재현). 메뉴를 정상 종료시키고
//   다음 tick 에 연다.
import { WalletIcon } from "lucide-react";
import { type ReactNode, useState } from "react";

import { DropdownMenuItem } from "~/core/components/ui/dropdown-menu";

import { SettlementDialog } from "./settlement-dialog";

export function useSettlementMenu(enabled: boolean): {
  item: ReactNode;
  dialog: ReactNode;
} {
  const [open, setOpen] = useState(false);
  if (!enabled) return { item: null, dialog: null };
  return {
    item: (
      <DropdownMenuItem
        onSelect={() => {
          setTimeout(() => setOpen(true), 0);
        }}
      >
        <WalletIcon className="size-4" />
        정산현황
      </DropdownMenuItem>
    ),
    dialog: <SettlementDialog open={open} onOpenChange={setOpen} />,
  };
}
