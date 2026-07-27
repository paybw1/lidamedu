// 유튜브 URL → 영상 ID / embed URL / 썸네일 공용 헬퍼(클라·서버 공용, 무의존성).
//   watch?v= / youtu.be/ / shorts/ / embed/ 형식 수용.
//   ※기존 팝업공지·가이드 등에 같은 정규식이 중복 존재 — 신규 코드는 이 모듈을 사용한다.

/** 유튜브 URL 에서 영상 ID 추출(없으면 null). */
export function extractYoutubeId(url: string): string | null {
  const m =
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,20})/.exec(
      url,
    );
  return m?.[1] ?? null;
}

/** 임베드 재생 URL(유효하지 않은 URL 이면 null). */
export function youtubeEmbedUrl(
  url: string,
  opts: { autoplay?: boolean } = {},
): string | null {
  const id = extractYoutubeId(url);
  if (!id) return null;
  const qs = opts.autoplay ? "?autoplay=1" : "";
  return `https://www.youtube.com/embed/${id}${qs}`;
}

/** 썸네일 URL(hqdefault, 유효하지 않으면 null). */
export function youtubeThumbnailUrl(url: string): string | null {
  const id = extractYoutubeId(url);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}
