// feat-11-006 S2 · feat-11-007 #4 — 콜러스 Open API(채널 미디어콘텐츠 조회). 서버 전용.
//   ★재생 mckey = media_content_key. 이는 **채널** 엔드포인트에만 있고, 라이브러리
//   (media/library/media_content) 엔드포인트엔 upload_file_key 만 있다(실 프로브 확정).
//   그래서 채널 엔드포인트를 소스로 사용한다:
//     GET {host}/0/media/channel                                → 채널 목록(channel_key 해석)
//     GET {host}/0/media/channel/media_content.json?channel_key=…&page=&per_page=
//        → 각 item 에 media_content_key + upload_file_key 동시 포함(title·duration·transcoding 도).
//   인증: access_token(=KOLLUS_API_TOKEN). 재생 토큰(KOLLUS_SECURITY/CUSTOM_KEY)과는 별개 키.
//   참고: 비공식 SDK yupmin-ct/kollus-sdk-php ApiClient::getChannelMediaContents(실 API 프로브 확정).
const API_HOST = process.env.KOLLUS_API_HOST || "https://api.kr.kollus.com";
const API_VERSION = "0";
const PER_PAGE = 100;

export interface KollusContent {
  contentKey: string; // media_content_key = 재생 mckey(web token mc.mckey)
  uploadFileKey: string | null; // 업로드 파일키(참조·백필 매핑용)
  title: string;
  originalFileName: string | null;
  durationSeconds: number | null;
  encodingStatus: "available" | "encoding" | "error" | "unknown";
  categoryName: string | null;
}

export function isKollusApiConfigured(): boolean {
  return Boolean(process.env.KOLLUS_API_TOKEN);
}

// 채널 key 해석 — KOLLUS_CHANNEL_KEY 우선, 없으면 채널 목록의 첫 채널(운영상 단일 채널).
export async function resolveKollusChannelKey(token: string): Promise<string> {
  const envKey = process.env.KOLLUS_CHANNEL_KEY;
  if (envKey) return envKey;
  const url = `${API_HOST}/${API_VERSION}/media/channel?access_token=${encodeURIComponent(token)}&page=1&per_page=50`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`콜러스 채널 API HTTP ${res.status}`);
  const json = (await res.json()) as { error?: number; result?: { items?: unknown } };
  if (json.error && json.error !== 0) throw new Error(`콜러스 채널 API 오류: ${json.error}`);
  const channels = normItems(json.result?.items);
  const key = channels[0]?.key ? String(channels[0].key) : "";
  if (!key) throw new Error("콜러스 채널을 찾을 수 없습니다(KOLLUS_CHANNEL_KEY 설정 필요).");
  return key;
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

/** 콜러스 채널의 전체 미디어콘텐츠를 페이지네이션으로 수집(media_content_key 포함). */
export async function fetchAllKollusContents(): Promise<KollusContent[]> {
  const token = process.env.KOLLUS_API_TOKEN;
  if (!token) throw new Error("KOLLUS_API_TOKEN 미설정");
  const channelKey = await resolveKollusChannelKey(token);
  const out: KollusContent[] = [];
  // 안전 상한(runaway 방지) — 100건×50페이지=5000.
  for (let page = 1; page <= 50; page++) {
    const url = `${API_HOST}/${API_VERSION}/media/channel/media_content.json?access_token=${encodeURIComponent(token)}&channel_key=${encodeURIComponent(channelKey)}&page=${page}&per_page=${PER_PAGE}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`콜러스 채널 콘텐츠 API HTTP ${res.status}`);
    const json = (await res.json()) as {
      error?: number;
      message?: string;
      result?: { count?: unknown; items?: unknown };
    };
    if (json.error && json.error !== 0)
      throw new Error(`콜러스 API 오류: ${json.message ?? json.error}`);
    const items = normItems(json.result?.items);
    for (const it of items) {
      // ★재생 키 = media_content_key. upload_file_key 는 참조·백필 매핑용으로 보존.
      const mck = String(it.media_content_key ?? "").trim();
      if (!mck) continue;
      const ufk = it.upload_file_key ? String(it.upload_file_key).trim() : null;
      out.push({
        contentKey: mck,
        uploadFileKey: ufk,
        title: String(it.title ?? mck),
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
