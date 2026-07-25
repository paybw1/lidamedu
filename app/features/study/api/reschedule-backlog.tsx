// feat-2-031 — 밀린 문제 복습(v1) 재조정. 누적 overdue 를 하루 상한(오래된 것 우선)씩
//   앞으로 며칠에 걸쳐 재배치해 "산더미 → 며칠 계획"으로 바꾼다. 학생이 압박에 포기하지
//   않도록 하는 opt-in 액션. next_due_at 만 갱신(정답/이력·간격 계산은 건드리지 않음).
import { data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { DAILY_REVIEW_BUDGET } from "~/features/study/lib/srs";

// overdue 를 최대 이만큼만 재배치(안전 상한). 그 이상이면 앞부분만 스프레드.
const MAX_RESCHEDULE = 1000;

/** 오늘(KST) 자정 기준 daysAhead 일 뒤의 시각을 UTC ISO 로. d=0 이면 오늘 00:00 KST(=이미 due). */
function startOfKstDayUtc(daysAhead: number): string {
  const KST = 9 * 60 * 60 * 1000;
  const nowKst = Date.now() + KST;
  const dayStartKst =
    Math.floor(nowKst / 86_400_000) * 86_400_000 + daysAhead * 86_400_000;
  return new Date(dayStartKst - KST).toISOString();
}

export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") {
    return data({ ok: false, error: "Method not allowed" }, { status: 405 });
  }
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ ok: false, error: "Unauthorized" }, { status: 401 });

  // 누적 overdue(오래된 것 우선). RLS 로 본인 것만.
  const nowIso = new Date().toISOString();
  const { data: rows, error } = await client
    .from("user_problem_srs")
    .select("problem_id")
    .eq("user_id", user.id)
    .lte("next_due_at", nowIso)
    .order("next_due_at", { ascending: true })
    .limit(MAX_RESCHEDULE);
  if (error) return data({ ok: false, error: error.message }, { status: 500 });

  const ids = (rows ?? []).map((r) => r.problem_id);
  // 하루치 이하면 나눌 게 없음.
  if (ids.length <= DAILY_REVIEW_BUDGET) {
    return data({ ok: true, moved: 0, spreadDays: ids.length > 0 ? 1 : 0 });
  }

  // 상한씩 버킷팅 → 버킷 d 는 오늘+d 일차에 due. 오늘 버킷은 그대로 due 유지.
  const spreadDays = Math.ceil(ids.length / DAILY_REVIEW_BUDGET);
  let moved = 0;
  for (let d = 0; d < spreadDays; d++) {
    const bucket = ids.slice(d * DAILY_REVIEW_BUDGET, (d + 1) * DAILY_REVIEW_BUDGET);
    if (bucket.length === 0) break;
    const dueIso = startOfKstDayUtc(d);
    const { error: upErr } = await client
      .from("user_problem_srs")
      .update({ next_due_at: dueIso })
      .eq("user_id", user.id)
      .in("problem_id", bucket);
    if (upErr) return data({ ok: false, error: upErr.message }, { status: 500 });
    if (d > 0) moved += bucket.length; // 오늘 버킷(d=0)은 '미룬' 게 아님
  }

  return data({ ok: true, moved, spreadDays, total: ids.length });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
