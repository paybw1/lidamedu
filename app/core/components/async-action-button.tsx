// 진행 중 표시가 있는 버튼 (feat-11-012 P5).
//
// ★결제 버튼을 누르면 결제창이 뜨기까지 몇 초 걸리는데 그동안 화면이 그대로였다 —
//   두 번 누르면 주문이 두 건 생겼다. 서버는 건드리지 않는다(고아 주문 정리는
//   feat-11-011 D3 의 attempted+TTL 이 이미 한다). 남은 구멍은 "누르고 응답 오기 전에
//   또 누름"뿐이라, 버튼이 스스로 진행 상태를 갖게 한다.
//
// ★FormButton·FetcherFormButton 은 **폼 제출 전용**이라 여기에 못 쓴다 — 결제는
//   onClick 에서 SDK 를 부르는 경로다.
import { Loader2Icon } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { Button } from "./ui/button";

export function AsyncActionButton({
  onRun,
  children,
  pendingLabel,
  disabled,
  ...props
}: {
  /** 누르면 실행할 일. 끝날 때까지 버튼이 잠긴다. */
  onRun: () => Promise<void> | void;
  children: React.ReactNode;
  /** 진행 중 문구. 없으면 원래 내용을 그대로 두고 스피너만 붙인다. */
  pendingLabel?: string;
} & Omit<React.ComponentProps<typeof Button>, "onClick">) {
  const [pending, setPending] = useState(false);
  // 언마운트 뒤 setState 방지(결제창이 뜨면서 화면이 바뀌는 경우가 있다).
  const alive = useRef(true);

  const run = useCallback(async () => {
    if (pending) return;
    setPending(true);
    try {
      await onRun();
    } finally {
      if (alive.current) setPending(false);
    }
  }, [onRun, pending]);

  return (
    <Button
      {...props}
      disabled={disabled || pending}
      onClick={() => {
        void run();
      }}
      ref={(el) => {
        alive.current = !!el;
      }}
    >
      {pending ? (
        <>
          <Loader2Icon className="size-4 animate-spin" />
          {pendingLabel ?? children}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
