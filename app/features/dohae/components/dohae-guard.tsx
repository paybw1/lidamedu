// 도해 유출방지 — 워터마크 · 복사 차단 · 저작권 고지 · 대량 열람 경고.
//
// 강의노트(lecture-note-viewer)는 본문을 **이미지**로 바꿔 내보내지만, 도해는 그럴 수 없다.
// 표·본문이 텍스트여야 하이라이트·포스트잇을 붙일 수 있고, 그게 도해를 플랫폼에 얹은
// 이유이기 때문이다. 그래서 텍스트를 유지한 채 다음 네 겹으로 막는다:
//
//   ① 워터마크  — 열람자 실명·회원번호·시각을 본문 위에 깔아 캡처물에 신원이 남게 한다
//   ② 복사 차단 — copy/cut/드래그·우클릭 차단. ★선택(selection)은 막지 않는다 —
//                 막으면 하이라이트를 못 긋는다. "선택은 되지만 복사는 안 됨"이 목표.
//   ③ 인쇄 차단 — print 매체에서 본문을 숨긴다
//   ④ 고지·경고 — 첫 열람 시 저작권 고지, 단시간 대량 열람 시 감지 안내

import { AlertTriangleIcon, ShieldAlertIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { Button } from "~/core/components/ui/button";

/** 고지 문구를 고치면 키 버전을 올린다(다시 한 번 받는다). */
const NOTICE_KEY = "dohae-copyright-notice-v1";

/** 본문 위에 까는 열람자 식별 워터마크. 선택·클릭을 방해하지 않는다. */
export function DohaeWatermark({ text }: { text: string }) {
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
 * 복사 차단 핸들러 묶음 — 본문 컨테이너에 그대로 편다.
 * ★선택은 허용한다(하이라이트 기능). 복사·잘라내기·드래그·우클릭만 막는다.
 */
export const copyGuardProps = {
  onCopy: (e: React.ClipboardEvent) => e.preventDefault(),
  onCut: (e: React.ClipboardEvent) => e.preventDefault(),
  onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  onDragStart: (e: React.DragEvent) => e.preventDefault(),
} as const;

/** 상시 경고 띠 — 본문 맨 위. */
export function DohaeCopyrightBand() {
  return (
    <p className="border-amber-300 bg-amber-50 text-[11px] font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300 mb-3 flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 print:hidden">
      <ShieldAlertIcon className="size-3.5 shrink-0" />
      『도해특허법』 저작물입니다. 열람 기록이 남으며 무단 복제·배포·전송은 금지됩니다.
    </p>
  );
}

/** 첫 열람 1회 고지 모달(기기당). 확인 전에는 본문을 가린다. */
export function DohaeCopyrightGate({ children }: { children: ReactNode }) {
  // null = 아직 localStorage 를 못 읽음(SSR·첫 페인트) → 게이트를 그리지 않는다.
  const [agreed, setAgreed] = useState<boolean | null>(null);
  useEffect(() => {
    setAgreed(window.localStorage.getItem(NOTICE_KEY) === "1");
  }, []);

  if (agreed === false) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
        <ShieldAlertIcon className="size-7 text-amber-500" />
        <h3 className="text-base font-bold">『도해특허법』 열람 안내</h3>
        <p className="text-muted-foreground max-w-md text-[13px] leading-relaxed">
          이 자료는 리담변리사학원이 저작권을 가진 교재입니다. 학습 목적의 열람만
          허용되며, <b className="text-foreground">복제·촬영·배포·전송은 금지</b>
          됩니다. 화면에는 열람자 정보가 표시되고 열람 기록이 서버에 남습니다.
        </p>
        <Button
          size="sm"
          onClick={() => {
            window.localStorage.setItem(NOTICE_KEY, "1");
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

/** 단시간 대량 열람 감지 안내 — 세션 1회. */
export function DohaeAbnormalNotice({ abnormal }: { abnormal: boolean }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!abnormal) return;
    if (window.sessionStorage.getItem("dohae-abnormal-warned") === "1") return;
    window.sessionStorage.setItem("dohae-abnormal-warned", "1");
    setShown(true);
  }, [abnormal]);
  if (!shown) return null;
  return (
    <p className="border-rose-300 bg-rose-50 text-[11px] font-semibold text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300 mb-3 flex items-start gap-1.5 rounded-lg border px-2.5 py-1.5 print:hidden">
      <AlertTriangleIcon className="mt-px size-3.5 shrink-0" />
      <span>
        짧은 시간에 많은 단원을 열었습니다. 대량 열람은 자동으로 기록·확인됩니다.
      </span>
    </p>
  );
}
