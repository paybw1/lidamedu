/**
 * Internationalization (i18n) Configuration
 * 
 * This file defines the core configuration for the application's
 * internationalization using i18next. It specifies supported languages,
 * fallback language, and the default namespace for translations.
 */

/**
 * List of supported languages in the application
 * Currently supports English (en), Spanish (es), and Korean (ko)
 * Using 'as const' to create a readonly tuple type for type safety
 */
export const supportedLngs = ["en", "es", "ko"] as const;

/**
 * Default i18next configuration
 * This is used by both client and server rendering to ensure consistent
 * translation behavior throughout the application.
 */
export default {
  // List of languages the application supports
  supportedLngs,
  
  // ★기본 언어는 한국어다(feat-11-012 P1).
  //   종전 기본값이 "en" 이라, locale 쿠키가 없는 요청 — 즉 **모든 검색엔진 크롤러** —
  //   은 영어 번역을 받았다. 실제로 첫 화면 제목이 "Lidam Patent Attorney Academy",
  //   설명이 "Integrated study platform for the Korean Patent Bar exam" 로 나가고 있었다.
  //   이 서비스는 한국어 단일이다(CLAUDE.md) — 번역 리소스는 껍데기만 남아 있다.
  fallbackLng: "ko",
  
  // The default namespace for translations
  // All general translations are stored in the 'common' namespace
  defaultNS: "common",
};
