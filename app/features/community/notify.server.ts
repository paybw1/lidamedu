// feat-6-004 커뮤니티 알림 — 좋아요·멘션 fanout.
// 댓글 알림은 community/api/comment.tsx 에서 이미 직접 처리 (community_post_comment kind).

import adminClient from "~/core/lib/supa-admin-client.server";

const LIKE_DEDUP_DAYS = 7;

/**
 * 좋아요 알림 — 본인이 자기 글을 좋아요 하면 skip.
 * 같은 user × 같은 post 의 좋아요 알림이 N일 내에 있으면 dedup (좋아요/취소 반복 방지).
 */
export async function notifyPostLiked(input: {
  postId: string;
  postTitle: string;
  postBoard: string;
  postAuthorId: string;
  likerId: string;
  likerName: string;
}): Promise<void> {
  if (input.postAuthorId === input.likerId) return;
  try {
    const sinceIso = new Date(
      Date.now() - LIKE_DEDUP_DAYS * 86_400_000,
    ).toISOString();
    // payload.liker_id 로 같은 사람 dedup.
    const { data: recent } = await adminClient
      .from("user_notifications")
      .select("notification_id, payload")
      .eq("recipient_id", input.postAuthorId)
      .eq("kind", "community_post_like")
      .eq("entity_id", input.postId)
      .gte("created_at", sinceIso)
      .limit(50);
    const dedup = (recent ?? []).some((r) => {
      const p = r.payload as { liker_id?: string } | null;
      return p?.liker_id === input.likerId;
    });
    if (dedup) return;

    await adminClient.from("user_notifications").insert({
      recipient_id: input.postAuthorId,
      kind: "community_post_like",
      entity_type: "community_post",
      entity_id: input.postId,
      title: `${input.likerName}님이 좋아요`,
      body: input.postTitle.slice(0, 100),
      href: `/community/${input.postBoard}/${input.postId}`,
      payload: { liker_id: input.likerId },
    });
  } catch (err) {
    console.warn("[community like notify] failed:", err);
  }
}

/**
 * 멘션 파서 + 알림 fanout.
 * body 에서 `@닉네임` 토큰 추출 → profiles.name lookup → 알림 생성.
 * 작성자 본인 멘션, 게시글 본문은 mention 알림 안 보냄(댓글만).
 *
 * 매칭 룰: `@` 뒤 공백·줄바꿈·구두점 전까지 최대 30자 한글/영문/숫자/_-.
 * 한 body 당 같은 대상은 1회만.
 */
const MENTION_RE = /@([\p{L}\p{N}_.\-]{2,30})/gu;

export function parseMentions(body: string): string[] {
  const out = new Set<string>();
  for (const m of body.matchAll(MENTION_RE)) {
    out.add(m[1]);
  }
  return [...out];
}

export async function notifyMentions(input: {
  body: string;
  postId: string;
  postTitle: string;
  postBoard: string;
  authorId: string;
  authorName: string;
  /** "post" 또는 "comment" — body 와 title 컨텍스트. */
  kind: "post" | "comment";
}): Promise<void> {
  const names = parseMentions(input.body);
  if (names.length === 0) return;
  try {
    const { data: profiles } = await adminClient
      .from("profiles")
      .select("profile_id, name")
      .in("name", names);
    const recipients = (profiles ?? [])
      .filter((p) => p.profile_id !== input.authorId)
      .map((p) => p.profile_id);
    if (recipients.length === 0) return;
    const titlePrefix = input.kind === "comment" ? "댓글에서 언급" : "게시글에서 언급";
    const preview = input.body.length > 80 ? input.body.slice(0, 80) + "…" : input.body;
    await adminClient.from("user_notifications").insert(
      recipients.map((rid) => ({
        recipient_id: rid,
        kind: "community_post_mention" as const,
        entity_type: "community_post",
        entity_id: input.postId,
        title: `${titlePrefix}: ${input.postTitle}`,
        body: `${input.authorName}: ${preview}`,
        href: `/community/${input.postBoard}/${input.postId}`,
        payload: { mention_by: input.authorId, kind: input.kind },
      })),
    );
  } catch (err) {
    console.warn("[community mention notify] failed:", err);
  }
}
