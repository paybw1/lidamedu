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
//
// ★상시 경고 띠는 두지 않는다(원장 지시 2026-08-23) — 매번 보는 학습 화면이라
//   본문을 밀어내고 눈에 거슬린다. 고지는 첫 열람 1회 게이트가 맡는다.

import { AlertTriangleIcon, ShieldAlertIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { Button } from "~/core/components/ui/button";

// 워터마크·복사차단은 판례 도식과 공유한다(core/components/leak-guard).
export { ViewerWatermark as DohaeWatermark, copyGuardProps } from "~/core/components/leak-guard";

/** 고지 문구를 고치면 키 버전을 올린다(다시 한 번 받는다). */
const NOTICE_KEY = "dohae-copyright-notice-v1";

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
