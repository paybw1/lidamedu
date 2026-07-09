// 가배포 테스터용 플로팅 오류 신고 위젯. 로그인 사용자에게만 노출(레이아웃에서 제어).
// 현재 URL + userAgent 자동 첨부 → /api/bug-report.
import { BugIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { toast } from "sonner";

import { Button } from "~/core/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/core/components/ui/dialog";
import { Textarea } from "~/core/components/ui/textarea";

export function BugReportWidget() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const submitting = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.ok) {
      toast.success("오류 신고가 접수됐습니다. 감사합니다!");
      setMessage("");
      setOpen(false);
    } else if (fetcher.data.error) {
      toast.error(`신고 전송 실패: ${fetcher.data.error}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);

  function submit() {
    if (!message.trim()) {
      toast.error("오류 내용을 입력해주세요.");
      return;
    }
    const fd = new FormData();
    fd.set("intent", "create");
    fd.set("url", window.location.href);
    fd.set("message", message.trim());
    fd.set("userAgent", navigator.userAgent);
    fetcher.submit(fd, { method: "post", action: "/api/bug-report" });
  }

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        size="sm"
        // 모바일에선 하단 탭바와 겹쳐 숨김 — 데스크톱(md+)에서만 노출.
        className="fixed right-4 bottom-4 z-50 hidden gap-1.5 rounded-full shadow-lg md:inline-flex print:hidden"
      >
        <BugIcon className="size-4" /> 오류 신고
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>오류 신고</DialogTitle>
            <DialogDescription>
              불편하거나 잘못 동작하는 부분을 알려주세요. 현재 페이지 주소와
              브라우저 정보가 자동으로 첨부됩니다.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.currentTarget.value)}
            placeholder="예: 특허법 제29조 화면에서 기출 칩이 겹쳐 보입니다."
            rows={5}
            maxLength={5000}
            disabled={submitting}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              취소
            </Button>
            <Button type="button" onClick={submit} disabled={submitting}>
              {submitting ? "전송 중…" : "신고 보내기"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
