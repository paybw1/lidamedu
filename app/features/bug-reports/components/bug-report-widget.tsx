// 가배포 테스터용 플로팅 오류 신고 위젯. 로그인 사용자에게만 노출(레이아웃에서 제어).
// 현재 URL + userAgent 자동 첨부 → /api/bug-report.
import { BugIcon } from "lucide-react";
import { useRef, useState } from "react";
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
import { cn } from "~/core/lib/utils";

export function BugReportWidget({
  /** 폰에서 숨길지 — 하단 탭바가 있는 표면(학습 플랫폼)만 true. 기본은 숨기지 않는다. */
  hideOnPhone = false,
}: {
  hideOnPhone?: boolean;
} = {}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // ★uncontrolled(ref) — textarea 를 controlled(value+setState) 로 두면 키 입력마다 위젯이
  //   리렌더돼, 무거운 화면(inbox·조문 빈칸 뷰어 등)에서 타이핑이 매우 느려진다. 입력 중
  //   리렌더가 없도록 ref 로만 읽고, 제출 시 .value 를 꺼낸다.
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ★순수 fetch(fire-and-forget) 로 보낸다 — RR fetcher.submit 은 현재 페이지 로더 재검증을
  //   유발해, 무거운 화면(민법 조문 빈칸 뷰어 등)에서 신고 시 화면이 매우 느려진다. 신고는
  //   페이지 데이터와 무관하므로 재검증 없이 보낸다.
  async function submit() {
    const message = textareaRef.current?.value.trim() ?? "";
    if (!message) {
      toast.error("오류 내용을 입력해주세요.");
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.set("intent", "create");
      fd.set("url", window.location.href);
      fd.set("message", message);
      fd.set("userAgent", navigator.userAgent);
      const res = await fetch("/api/bug-report", { method: "POST", body: fd });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (res.ok && j.ok) {
        toast.success("오류 신고가 접수됐습니다. 감사합니다!");
        if (textareaRef.current) textareaRef.current.value = "";
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
        // ★폰에서 숨길지는 **표면마다 다르다.**
        //   학습 플랫폼: 하단 탭바(student-bottombar)가 있어 버튼 자리가 그 안에 들어간다 → 숨긴다.
        //   강의 플랫폼: 하단 고정 요소가 없다 → 숨길 이유가 없다(종전에는 여기서도 숨겨져,
        //   폰으로 보던 사람은 오류를 신고할 방법이 아예 없었다).
        className={cn(
          "fixed right-4 bottom-4 z-50 gap-1.5 rounded-full shadow-lg print:hidden",
          hideOnPhone ? "hidden md:inline-flex" : "inline-flex",
        )}
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
            ref={textareaRef}
            defaultValue=""
            placeholder="예: 특허법 제29조 화면에서 기출 칩이 겹쳐 보입니다."
            rows={5}
            maxLength={5000}
            disabled={submitting}
            // ★입력 지연 방지 — Textarea 기본 field-sizing:content 는 글자마다 높이를
            //   재계산해 무거운 화면(inbox 등)에서 매 키 입력마다 전체 리플로우를 유발한다.
            //   고정 크기(field-sizing:fixed)로 덮고 세로 리사이즈만 허용.
            className="[field-sizing:fixed] min-h-32 resize-y"
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
