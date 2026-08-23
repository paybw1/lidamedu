// 열람자 식별 워터마크 문자열 — 유출물에서 누가 봤는지 특정하기 위한 것.
// 도해특허법·판례 도식 등 저작물 패널이 공유한다(문구가 화면마다 다르면 대조가 어렵다).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

/** "홍길동 · No.123 · 2026-08-23 14:05" — 회원번호가 없으면 그 칸만 빠진다. */
export async function buildViewerWatermark(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<string> {
  const { data: me } = await client
    .from("profiles")
    .select("name, member_no")
    .eq("profile_id", userId)
    .maybeSingle();

  const stampedAt = new Date().toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return [
    me?.name ?? "회원",
    me?.member_no != null ? `No.${me.member_no}` : null,
    stampedAt,
  ]
    .filter(Boolean)
    .join(" · ");
}
