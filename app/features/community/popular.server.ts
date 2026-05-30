// feat-6-003 커뮤니티 인기·BEST — RPC community_popular_posts wrapper.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import type { CommunityBoard } from "./labels";

export type { CommunityBoard };

export interface PopularPostItem {
  postId: string;
  board: CommunityBoard;
  title: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  popularity: number;
}

export async function listPopularPosts(
  client: SupabaseClient<Database>,
  opts: {
    board?: CommunityBoard | null;
    days?: number;
    limit?: number;
  } = {},
): Promise<PopularPostItem[]> {
  const { data, error } = await client.rpc("community_popular_posts", {
    p_board: opts.board ?? undefined,
    p_days: opts.days ?? 7,
    p_limit: opts.limit ?? 5,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    postId: r.post_id,
    board: r.board as CommunityBoard,
    title: r.title,
    authorId: r.author_id,
    authorName: r.author_name,
    createdAt: r.created_at,
    viewCount: r.view_count,
    likeCount: Number(r.like_count),
    commentCount: Number(r.comment_count),
    popularity: Number(r.popularity),
  }));
}

export async function incrementPostView(
  client: SupabaseClient<Database>,
  postId: string,
): Promise<void> {
  // best-effort — 실패해도 상세 진입은 진행.
  const { error } = await client.rpc("community_increment_view", {
    p_post_id: postId,
  });
  if (error) {
    console.warn("[community] increment_view failed:", error.message);
  }
}
