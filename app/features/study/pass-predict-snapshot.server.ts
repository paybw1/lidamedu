// 합격 진단 점수 오늘자 스냅샷 upsert. 크론(cron/api/pass-predict-snapshot) +
// 방문 시 lazy 기록(dashboard loader) 공용 단일 경로.
// snapshot_date 는 DB default(오늘) — onConflict(user_id,snapshot_date) 로 같은 날
// 재기록은 덮어쓰기(멱등). 호출부는 service-role 클라이언트를 넘긴다(테이블 RLS 우회).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import type { PassPrediction } from "~/features/study/lib/pass-predict";

export async function upsertPassPredictionSnapshot(
  client: SupabaseClient<Database>,
  userId: string,
  prediction: PassPrediction,
  gsAveragePct: number | null,
): Promise<void> {
  const { error } = await client.from("pass_prediction_snapshots").upsert(
    {
      user_id: userId,
      score: prediction.score,
      rating: prediction.rating,
      components: prediction.components as never,
      gs_average_pct: gsAveragePct,
    },
    { onConflict: "user_id,snapshot_date" },
  );
  if (error) throw error;
}
