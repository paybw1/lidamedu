// 외부 영상 URL → embed URL 변환 (YouTube/Vimeo 지원, 그 외는 원본 그대로).
// 순수 함수 — 클라이언트·서버 공용. queries.server.ts 에서 분리 (서버 모듈이
// 클라이언트 컴포넌트에 import 되어 빌드가 깨지던 문제 수정). feat-7-029.
export function toEmbedUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "m.youtube.com") {
      const v = u.searchParams.get("v");
      if (v) return `https://www.youtube.com/embed/${v}`;
    }
    if (host === "youtu.be") {
      const id = u.pathname.replace(/^\//, "");
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (host === "vimeo.com") {
      const id = u.pathname.replace(/^\//, "").split("/")[0];
      if (id) return `https://player.vimeo.com/video/${id}`;
    }
    // 이미 embed URL 이거나 다른 호스트 → 원본
    return raw;
  } catch {
    return null;
  }
}
