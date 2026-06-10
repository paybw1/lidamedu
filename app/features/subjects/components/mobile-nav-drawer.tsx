// 모바일 좌/우 드로어(조문·판례·문제·체계도 뷰어 공용).
//
// 왜 modal={false} 인가 (핵심):
//   드로어가 모달 Radix Dialog 면, 열린 동안 <body> 에 pointer-events:none +
//   focus 트랩이 걸린다. 이 상태에서 트리 안 raw <Link> 로 "다른 라우트 모듈"
//   (판례→조문/체계도, 문제→조문 등)로 전환하면 모달 cleanup 이 끝나기 전에
//   화면이 바뀌며 모바일에서 전환이 먹통이 됐다(시트도 안 닫히고 도착 화면도
//   안 뜸). 조문→조문은 같은 모듈이라 무증상이었다. 상단 햄버거 메뉴는 모든
//   Link 를 <SheetClose> 로 감싸 모달을 정상 종료시켜 회피하지만, 트리 Link 는
//   재귀 생성이라 일괄로 감쌀 수 없다. → 드로어를 비모달로 만들어 트랩/잠금
//   자체를 없애면, 트리 Link 가 데스크톱(모달 밖)과 동일하게 정상 전환된다.
// 왜 링크 클릭 시 닫기도 유지하는가:
//   같은 모듈 전환(조문→조문)은 컴포넌트가 unmount 되지 않아 드로어가 열린 채로
//   남는다. 실제 이동 링크(<a href>) 클릭 시 닫아 "시트 사라지며 전환" UX 유지.
//   expand 토글(<button>)은 닫지 않아 트리 펼침은 그대로 둔다.

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
    <Sheet open={open} onOpenChange={setOpen} modal={false}>
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
