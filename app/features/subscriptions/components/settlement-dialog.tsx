// feat-8-031 — 상단 계정 아이콘 → 「정산현황」 팝업. 데스크톱은 가운데 Dialog, 모바일은 아래에서
// 올라오는 Sheet. 데이터는 열 때 처음 한 번만 불러온다(모든 페이지에서 미리 받지 않는다).
import { WalletIcon } from "lucide-react";
import { useEffect } from "react";
import { Link, useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/core/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "~/core/components/ui/sheet";
import { useIsMobile } from "~/core/hooks/use-mobile";
import {
  SETTLEMENT_API,
  SettlementPanel,
  type SettlementPanelData,
} from "~/features/subscriptions/components/settlement-panel";

const TITLE = "정산현황";
const DESC =
  "결제일 기준 월별 강사료입니다. 확정 전 금액은 예상치이며, 환불은 발생한 달에서 차감합니다.";

export function SettlementDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isMobile = useIsMobile();
  const fetcher = useFetcher<SettlementPanelData>();
  const shouldLoad = open && fetcher.state === "idle" && !fetcher.data;

  useEffect(() => {
    if (shouldLoad) fetcher.load(SETTLEMENT_API);
  }, [shouldLoad, fetcher]);

  const body = (
    <div className="flex min-h-0 flex-col px-4 pb-4">
      {fetcher.data ? (
        <SettlementPanel initial={fetcher.data} compact />
      ) : (
        <p className="text-muted-foreground py-10 text-center text-sm">
          불러오는 중…
        </p>
      )}
      <div className="mt-3 flex justify-end">
        <Button asChild size="sm" variant="ghost">
          <Link to="/lecture/settlements" onClick={() => onOpenChange(false)}>
            전체 화면으로 보기
          </Link>
        </Button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="flex max-h-[92vh] flex-col gap-0 p-0"
        >
          <SheetHeader className="px-4 pt-4 pb-2">
            <SheetTitle className="flex items-center gap-1.5 text-base">
              <WalletIcon className="size-4" /> {TITLE}
            </SheetTitle>
            <SheetDescription className="text-xs">{DESC}</SheetDescription>
          </SheetHeader>
          {body}
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] w-[96vw] flex-col gap-0 p-0 sm:max-w-3xl lg:max-w-4xl">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="flex items-center gap-1.5 text-base">
            <WalletIcon className="size-4" /> {TITLE}
          </DialogTitle>
          <DialogDescription className="text-xs">{DESC}</DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}
