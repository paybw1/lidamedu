// 운영자 화면 검색 팔레트 열기 — cross-component 이벤트(사이드바 버튼 → 팔레트).
// admin-shell ↔ admin-command-palette 순환 import 를 피하려 이벤트만 별도 모듈로.
export const ADMIN_PALETTE_OPEN_EVENT = "admin-command-palette:open";

export function openAdminCommandPalette(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(ADMIN_PALETTE_OPEN_EVENT));
  }
}
