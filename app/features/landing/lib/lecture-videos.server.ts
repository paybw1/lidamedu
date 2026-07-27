// feat-12-002 — 강의 홈 짧은 영상 공개 페이로드 빌드(서버 전용).
//   youtube = embed URL + 자동 썸네일. kollus = 콘텐츠 라이브러리 content_key(mckey)로
//   buildKollusWebTokenUrl 서명(수강권 게이트 없이 재생). ★원본 mckey 는 클라이언트에
//   노출하지 않고 서명 URL 만 내려보낸다([[lms-commerce-m1-design]] drm_video_id 비노출).
//   ★콜러스는 반드시 별도로 잘라 올린 짧은 클립을 가리켜야 함(전체 강의 지정 금지 — 공개 재생).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import { youtubeEmbedUrl, youtubeThumbnailUrl } from "~/core/lib/youtube";
import { buildKollusWebTokenUrl } from "~/features/lms/lib/kollus-token.server";

import type {
  LectureVideoCategory,
  LectureVideoProvider,
  LectureVideoRow,
} from "../labels";

type Client = SupabaseClient<Database>;

// 서명 재생 URL 유효기간(초). 랜딩 loader 는 캐시하지 않으므로 요청마다 새로 서명된다.
const KOLLUS_EXPIRE_SECONDS = 2 * 60 * 60;

export interface LectureVideoPublic {
  videoId: string;
  title: string;
  description: string | null;
  category: LectureVideoCategory;
  provider: LectureVideoProvider;
  embedUrl: string | null; // youtube embed 또는 kollus 서명 URL(재생 불가면 null)
  thumbnailUrl: string | null;
  durationLabel: string | null;
  linkedPlan: { code: string; name: string } | null;
}

/**
 * 강의 홈 영상 행 → 공개 페이로드. adminClient 로 콜러스 content_key·연결 강의를 조회한다
 * (video_contents·subscription_plans anon SELECT 제약 대비). cuid = 로그인 user id, 없으면 anon.
 */
export async function buildLectureVideosPublic(
  adminClient: Client,
  rows: LectureVideoRow[],
  cuid: string | null,
): Promise<LectureVideoPublic[]> {
  // 콜러스 content_id → content_key(mckey) 배치 조회.
  const contentIds = Array.from(
    new Set(
      rows
        .filter((r) => r.provider === "kollus" && r.content_id)
        .map((r) => r.content_id as string),
    ),
  );
  const keyByContentId = new Map<string, string>();
  if (contentIds.length) {
    const { data } = await adminClient
      .from("video_contents")
      .select("content_id, content_key")
      .in("content_id", contentIds);
    for (const c of data ?? []) keyByContentId.set(c.content_id, c.content_key);
  }

  // 연결 강의(맛보기 CTA) 배치 조회.
  const planIds = Array.from(
    new Set(rows.map((r) => r.linked_plan_id).filter((v): v is string => !!v)),
  );
  const planById = new Map<string, { code: string; name: string }>();
  if (planIds.length) {
    const { data } = await adminClient
      .from("subscription_plans")
      .select("plan_id, code, name")
      .in("plan_id", planIds);
    for (const p of data ?? [])
      planById.set(p.plan_id, { code: p.code, name: p.name });
  }

  return rows.map((r) => {
    let embedUrl: string | null = null;
    let thumbnailUrl = r.thumbnail_url;
    if (r.provider === "youtube" && r.youtube_url) {
      embedUrl = youtubeEmbedUrl(r.youtube_url, { autoplay: true });
      if (!thumbnailUrl) thumbnailUrl = youtubeThumbnailUrl(r.youtube_url);
    } else if (r.provider === "kollus" && r.content_id) {
      const mckey = keyByContentId.get(r.content_id);
      if (mckey) {
        embedUrl = buildKollusWebTokenUrl({
          mckey,
          cuid: cuid ?? "preview-anon",
          expireSeconds: KOLLUS_EXPIRE_SECONDS,
        });
      }
    }
    return {
      videoId: r.video_id,
      title: r.title,
      description: r.description,
      category: r.category as LectureVideoCategory,
      provider: r.provider as LectureVideoProvider,
      embedUrl,
      thumbnailUrl,
      durationLabel: r.duration_label,
      linkedPlan: r.linked_plan_id
        ? (planById.get(r.linked_plan_id) ?? null)
        : null,
    };
  });
}
