// 가배포 테스터용 플로팅 오류 신고 위젯. 로그인 사용자에게만 노출(레이아웃에서 제어).
// 현재 URL + userAgent 자동 첨부 → /api/bug-report.
import { BugIcon } from "lucide-react";
import { useState } from "react";
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
  const [submitting, setSubmitting] = useState(false);

  // ★순수 fetch(fire-and-forget) 로 보낸다 — RR fetcher.submit 은 현재 페이지 로더 재검증을
  //   유발해, 무거운 화면(민법 조문 빈칸 뷰어 등)에서 신고 시 화면이 매우 느려진다. 신고는
  //   페이지 데이터와 무관하므로 재검증 없이 보낸다.
  async function submit() {
    if (!message.trim()) {
      toast.error("오류 내용을 입력해주세요.");
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.set("intent", "create");
      fd.set("url", window.location.href);
      fd.set("message", message.trim());
      fd.set("userAgent", navigator.userAgent);
      const res = await fetch("/api/bug-report", { method: "POST", body: fd });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (res.ok && j.ok) {
        toast.success("오류 신고가 접수됐습니다. 감사합니다!");
        setMessage("");
        setOpen(false);
      } else {
        toast.error(`신고 전송 실패: ${j.error ?? res.status}`);
      }
    } catch {
      toast.error("신고 전송에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
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
        <DialogContent
          // ★한글 IME 이월 차단: 빈칸 조합 중 이 창을 열면 자동 포커스된 textarea 로
          //   조합 마지막 음절이 이월(특히 iOS Safari). 자동 포커스를 막아 조합이 편집 가능한
          //   대상에 착지하지 못하게 한다 — 사용자가 직접 입력창을 탭할 때는 이미 조합이 끝나 있다.
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
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
