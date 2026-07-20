// feat-11-006 S2 — 콜러스 Open API(콘텐츠 라이브러리 조회). 서버 전용.
//   GET https://api.kr.kollus.com/0/media/library/media_content?access_token=…&page=&per_page=
//   응답: { error, result: { count, per_page, items: { item: [...] } } }
//   인증: access_token(=KOLLUS_API_TOKEN) 쿼리 파라미터. 재생 토큰(KOLLUS_SECURITY/CUSTOM_KEY)
//   과는 별개 키다. 참고: 비공식 SDK yupmin-ct/kollus-sdk-php ApiClient(실 API 프로브로 확정).
const API_HOST = process.env.KOLLUS_API_HOST || "https://api.kr.kollus.com";
const API_VERSION = "0";
const PER_PAGE = 100;

export interface KollusContent {
  contentKey: string; // upload_file_key = 재생 mckey(= 기존 lesson_videos.drm_video_id)
  title: string;
  originalFileName: string | null;
  durationSeconds: number | null;
  encodingStatus: "available" | "encoding" | "error" | "unknown";
  categoryName: string | null;
}

export function isKollusApiConfigured(): boolean {
  return Boolean(process.env.KOLLUS_API_TOKEN);
}

// "01:07:43" / "57:55" / "4063" → 초. 파싱 실패 시 null.
export function parseDurationToSeconds(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.round(raw);
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const parts = raw.trim().split(":").map((p) => Number(p));
  if (parts.some((n) => !Number.isFinite(n))) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return Math.round(parts[0]);
  return null;
}

function mapEncodingStatus(item: {
  transcoding_stage_name?: unknown;
  transcoding_stage?: unknown;
}): KollusContent["encodingStatus"] {
  const name = String(item.transcoding_stage_name ?? "").toLowerCase();
  if (name.includes("done") || name.includes("complete")) return "available";
  if (name.includes("error") || name.includes("fail")) return "error";
  if (name.includes("transcod") || name.includes("wait") || name.includes("progress"))
    return "encoding";
  // 이름이 비었으면 stage 번호로 폴백 — 실 프로브상 stage 21 = done.
  const stage = Number(item.transcoding_stage);
  if (stage === 21) return "available";
  return "unknown";
}

// items.item 은 0건이면 없거나, 1건이면 객체, 다건이면 배열 — 항상 배열로 정규화.
function normItems(itemsField: unknown): Record<string, unknown>[] {
  if (!itemsField || typeof itemsField !== "object") return [];
  const item = (itemsField as { item?: unknown }).item;
  if (!item) return [];
  return (Array.isArray(item) ? item : [item]) as Record<string, unknown>[];
}

/** 콜러스 라이브러리의 전체 콘텐츠를 페이지네이션으로 수집. */
export async function fetchAllKollusContents(): Promise<KollusContent[]> {
  const token = process.env.KOLLUS_API_TOKEN;
  if (!token) throw new Error("KOLLUS_API_TOKEN 미설정");
  const out: KollusContent[] = [];
  let page = 1;
  // 안전 상한(runaway 방지) — 100건×50페이지=5000.
  for (; page <= 50; page++) {
    const url = `${API_HOST}/${API_VERSION}/media/library/media_content?access_token=${encodeURIComponent(token)}&page=${page}&per_page=${PER_PAGE}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`콜러스 API HTTP ${res.status}`);
    const json = (await res.json()) as {
      error?: number;
      message?: string;
      result?: { count?: unknown; items?: unknown };
    };
    if (json.error && json.error !== 0)
      throw new Error(`콜러스 API 오류: ${json.message ?? json.error}`);
    const items = normItems(json.result?.items);
    for (const it of items) {
      const key = String(it.upload_file_key ?? it.media_content_key ?? "").trim();
      if (!key) continue;
      out.push({
        contentKey: key,
        title: String(it.title ?? key),
        originalFileName: it.original_file_name
          ? String(it.original_file_name)
          : null,
        durationSeconds: parseDurationToSeconds(it.duration),
        encodingStatus: mapEncodingStatus(it),
        categoryName: it.category_name ? String(it.category_name) : null,
      });
    }
    if (items.length < PER_PAGE) break; // 마지막 페이지
  }
  return out;
}
