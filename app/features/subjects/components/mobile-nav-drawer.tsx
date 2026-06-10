// 모바일 좌/우 드로어(조문·판례·문제·체계도 뷰어 공용).
//
// 왜 controlled + 링크 클릭 시 닫기인가:
//   드로어는 모달 Radix Dialog(Sheet)다. 모달이 열린 채 내부 트리 링크로 "다른
//   라우트 모듈"(판례→조문/체계도, 문제→조문 등)로 전환하면, 모달의 cleanup
//   (focus 복원·body pointer-events·scroll 잠금 해제)이 끝나기 전에 화면이
//   바뀌면서 모바일에서 전환이 먹통이 됐다(시트도 안 닫히고 도착 화면도 안 뜸).
//   조문→조문은 같은 모듈이라 증상이 없어 발견이 늦었다.
//   → 링크를 누르는 즉시 open=false 로 모달을 먼저 정상 종료시키고, 그 다음
//     네비게이션이 깨끗한 문서 위에서 진행되게 한다. expand 토글은 <button> 이라
//     닫히지 않고(트리 펼침 유지), 실제 이동 링크(<a href>)만 드로어를 닫는다.

import type { ReactNode } from "react";
import { useState } from "react";

import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "~/core/components/ui/sheet";

export function MobileNavDrawer({
  trigger,
  side,
  contentClassName,
  children,
}: {
  trigger: ReactNode;
  side: "left" | "right";
  contentClassName?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent
        side={side}
        className={contentClassName}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a[href]")) setOpen(false);
        }}
      >
        {children}
      </SheetContent>
    </Sheet>
  );
}
