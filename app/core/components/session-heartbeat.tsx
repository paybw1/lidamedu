/**
 * 단일 세션 하트비트(클라이언트) — feat-000-016 2단계.
 *
 * private 레이아웃에 한 번 마운트. 60초마다 + 탭 복귀 시 `/api/session/heartbeat` 를 폴해
 * 이 세션이 다른 기기 로그인에 밀려났는지 확인하고, 밀려났으면 reload 한다(→ 레이아웃 loader
 * 의 enforceSingleSession 이 이 기기를 로그아웃). 유휴(내비게이션 없는) 기기도 ~1분 내 추방.
 */
import { useEffect, useRef } from "react";

const INTERVAL_MS = 60_000;

export function SessionHeartbeat() {
  const checking = useRef(false);
  useEffect(() => {
    let alive = true;
    const check = async () => {
      if (checking.current || document.visibilityState === "hidden") return;
      checking.current = true;
      try {
        const res = await fetch("/api/session/heartbeat", {
          headers: { Accept: "application/json" },
        });
        if (!alive) return;
        if (res.ok) {
          const json = (await res.json()) as { superseded?: boolean };
          if (json.superseded) window.location.reload();
        }
      } catch {
        // 네트워크 일시 오류는 무시(다음 주기에 재시도).
      } finally {
        checking.current = false;
      }
    };
    const id = window.setInterval(check, INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return null;
}
