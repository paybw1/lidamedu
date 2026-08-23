// 저작물 패널 유출방지 공용 조각 — 워터마크 오버레이 + 복사 차단 핸들러.
//
// 교재를 이미지로 바꿔 내보내는 강의노트와 달리, 도해·판례 도식은 **본문이 텍스트여야 한다**
// (하이라이트·포스트잇·조문 링크가 텍스트 위에서 동작한다). 그래서 텍스트를 살린 채 막는다.
//
// ★선택(selection)은 막지 않는다 — 막으면 하이라이트를 못 긋는다.
//   "선택은 되지만 복사는 안 됨"이 목표. 브라우저 단 억제이지 DRM 이 아니다.

import type { ClipboardEvent, DragEvent, MouseEvent } from "react";

/** 본문 위에 까는 열람자 식별 워터마크. 선택·클릭을 방해하지 않는다(pointer-events:none). */
export function ViewerWatermark({ text }: { text: string }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-20 overflow-hidden select-none print:hidden"
    >
      <div className="absolute -inset-[40%] flex rotate-[-20deg] flex-wrap content-around justify-around gap-x-16 gap-y-20">
        {Array.from({ length: 24 }, (_, i) => (
          <span
            key={i}
            className="text-[13px] font-semibold whitespace-nowrap text-[rgba(51,65,85,0.10)] dark:text-[rgba(226,232,240,0.10)]"
          >
            {text}
          </span>
        ))}
      </div>
    </div>
  );
}

/** 복사 차단 핸들러 묶음 — 본문 컨테이너에 그대로 편다(`{...copyGuardProps}`). */
export const copyGuardProps = {
  onCopy: (e: ClipboardEvent) => e.preventDefault(),
  onCut: (e: ClipboardEvent) => e.preventDefault(),
  onContextMenu: (e: MouseEvent) => e.preventDefault(),
  onDragStart: (e: DragEvent) => e.preventDefault(),
} as const;
