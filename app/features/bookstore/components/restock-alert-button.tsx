// 재입고 알림 신청 버튼 (feat-11 B2-4) — 품절 도서 상세에 노출. fetcher 토글.
import { BellIcon, BellRingIcon } from "lucide-react";
import { useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";

export function RestockAlertButton({
  bookId,
  requested,
}: {
  bookId: string;
  requested: boolean;
}) {
  const fetcher = useFetcher<{ requested?: boolean; error?: string }>();
  const active = fetcher.formData
    ? fetcher.formData.get("requested") === "0"
    : (fetcher.data?.requested ?? requested);

  const toggle = () => {
    const fd = new FormData();
    fd.set("bookId", bookId);
    fd.set("requested", active ? "1" : "0");
    fetcher.submit(fd, { method: "post", action: "/api/lecture/restock-alert" });
  };

  return (
    <Button
      type="button"
      variant={active ? "secondary" : "outline"}
      onClick={toggle}
      className="gap-1.5"
    >
      {active ? (
        <>
          <BellRingIcon className="size-4" /> 알림 신청됨
        </>
      ) : (
        <>
          <BellIcon className="size-4" /> 재입고 알림 신청
        </>
      )}
    </Button>
  );
}
