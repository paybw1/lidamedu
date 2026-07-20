// 강의 플레이어 화면 크기 제어(클라이언트 인터랙션 상태) — FE 소유.
//   크기 변경은 iframe 을 재마운트하지 않고 감싸는 컨테이너의 CSS 만 바꾼다(★크로스오리진
//   Kollus 플레이어는 remount 시 재생 위치·재생 상태가 초기화되므로 DOM 노드를 보존해야 함).
//   선호 크기는 localStorage 에 저장해 회차 이동(페이지 리로드) 후에도 유지.
import { useCallback, useEffect, useRef, useState } from "react";

export const PLAYER_SIZES = ["standard", "large", "max"] as const;
export type PlayerSize = (typeof PLAYER_SIZES)[number];

export const PLAYER_SIZE_LABEL: Record<PlayerSize, string> = {
  standard: "기본",
  large: "확대",
  max: "최대",
};

const STORAGE_KEY = "lidam:lecture-player-size";

function isPlayerSize(v: string | null): v is PlayerSize {
  return v !== null && (PLAYER_SIZES as readonly string[]).includes(v);
}

export function usePlayerSize() {
  const [size, setSizeState] = useState<PlayerSize>("standard");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const playerRef = useRef<HTMLDivElement | null>(null);

  // 저장된 선호 크기 복원(SSR 이후 1회). 초기값은 항상 standard 로 하이드레이션 불일치 회피.
  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (isPlayerSize(saved)) setSizeState(saved);
  }, []);

  const setSize = useCallback((next: PlayerSize) => {
    setSizeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage 불가(시크릿 모드 등) — 선호 저장만 생략, 크기 변경은 정상 동작.
    }
  }, []);

  // 네이티브 전체화면 진입/이탈을 실제 상태와 동기화(ESC·플레이어 버튼 이탈 포함).
  useEffect(() => {
    const onChange = () =>
      setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    const el = playerRef.current;
    if (el?.requestFullscreen) void el.requestFullscreen();
  }, []);

  return { size, setSize, isFullscreen, toggleFullscreen, playerRef };
}
