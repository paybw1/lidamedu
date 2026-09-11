// 저작물 패널 유출방지 공용 조각 — 워터마크 오버레이 + 복사 차단 핸들러.
//
// 교재를 이미지로 바꿔 내보내는 강의노트와 달리, 도해·판례 도식은 **본문이 텍스트여야 한다**
// (하이라이트·포스트잇·조문 링크가 텍스트 위에서 동작한다). 그래서 텍스트를 살린 채 막는다.
//
// ★선택(selection)은 막지 않는다 — 막으면 하이라이트를 못 긋는다.
//   "선택은 되지만 복사는 안 됨"이 목표. 브라우저 단 억제이지 DRM 이 아니다.
import { ShieldAlertIcon } from "lucide-react";
import {
  type ClipboardEvent,
  type DragEvent,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useState,
} from "react";

import { Button } from "~/core/components/ui/button";

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

/**
 * 복사 차단 핸들러 묶음 — 본문 컨테이너에 그대로 편다(`{...copyGuardProps}`).
 *
 * ★**운영자에게는 걸지 않는다** — 검수·출제 과정에서 본문을 그대로 옮겨 써야 한다.
 *   호출부에서 `viewerIsStaff ? {} : copyGuardProps` 로 가른다(판례 도식 패널이 그 예).
 *   워터마크는 역할과 무관하게 깐다 — 누가 열었는지는 계속 남아야 한다.
 */
export const copyGuardProps = {
  onCopy: (e: ClipboardEvent) => e.preventDefault(),
  onCut: (e: ClipboardEvent) => e.preventDefault(),
  onContextMenu: (e: MouseEvent) => e.preventDefault(),
  onDragStart: (e: DragEvent) => e.preventDefault(),
} as const;

function readAgreed(storageKey: string): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(storageKey) === "1";
  } catch {
    return true; // 사생활 보호 모드 등 — 저장을 못 하면 매번 물을 수 없으니 통과
  }
}

/**
 * 첫 열람 1회 저작권 고지(기기당). 확인 전에는 본문을 그리지 않는다.
 * 고지 문구를 고치면 호출부의 storageKey 버전을 올린다(다시 한 번 받는다).
 * ★첫 커밋부터 판정한다 — effect 로 미루면 한 프레임 동안 본문이 먼저 그려진다(검토 지적).
 *   SSR 에서는 null → 아무것도 그리지 않고, 클라이언트 effect 가 판정한다.
 */
export function CopyrightGate({
  storageKey,
  title,
  children,
}: {
  /** 기기당 1회 확인을 기억하는 localStorage 키 — 자료마다 다르게 준다. */
  storageKey: string;
  /** 예: 『도해특허법』 열람 안내 */
  title: string;
  children: ReactNode;
}) {
  const [agreed, setAgreed] = useState<boolean | null>(() => readAgreed(storageKey));
  useEffect(() => {
    if (agreed === null) setAgreed(readAgreed(storageKey));
  }, [agreed, storageKey]);

  if (agreed === null) return null;
  if (agreed === false) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
        <ShieldAlertIcon className="size-7 text-amber-500" />
        <h3 className="text-base font-bold">{title}</h3>
        <p className="text-muted-foreground max-w-md text-[13px] leading-relaxed">
          이 자료는 리담변리사학원이 저작권을 가진 교재입니다. 학습 목적의 열람만
          허용되며, <b className="text-foreground">복제·촬영·배포·전송은 금지</b>
          됩니다. 화면에는 열람자 정보가 표시되고 열람 기록이 서버에 남습니다.
        </p>
        <Button
          size="sm"
          onClick={() => {
            try {
              window.localStorage.setItem(storageKey, "1");
            } catch {
              /* 용량 초과·사생활 보호 모드 — 기억만 포기하고 통과 */
            }
            setAgreed(true);
          }}
        >
          확인했습니다
        </Button>
      </div>
    );
  }
  return <>{children}</>;
}
