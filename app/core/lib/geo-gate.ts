// 국가 접근 게이트 공용 상수 — 서버(geo-gate.server.ts)와 클라이언트(root ErrorBoundary)
// 양쪽에서 쓰이므로 .server 밖에 둔다.

export const GEO_BLOCKED_CODE = "geo-blocked" as const;
