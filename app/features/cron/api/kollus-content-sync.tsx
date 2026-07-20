// feat-11-006 Phase 1 잔여 — 콜러스 콘텐츠 라이브러리 자동 동기화 cron.
// 콜러스 미디어 API → video_contents upsert(재생시간·인코딩 상태 자동 갱신) + 결과/오류 로그.
// 호출: Vercel cron 일1회. 인증: CRON_SECRET(recheck-precedents 동일 패턴).
// KOLLUS_API_TOKEN 미설정 → skip(로그만 남기지 않고 무해 종료).

import { data } from "react-router";

import { isKollusApiConfigured } from "~/features/lms/lib/kollus-content-api.server";
import {
  recordSyncLog,
  syncKollusContents,
} from "~/features/lms/lib/kollus-sync.server";

import type { Route } from "./+types/kollus-content-sync";

function checkAuth(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const url = new URL(request.url);
  if (url.searchParams.get("secret") === expected) return true;
  return request.headers.get("authorization") === `Bearer ${expected}`;
}

async function run(request: Request) {
  if (!checkAuth(request)) return data({ error: "Forbidden" }, { status: 403 });
  if (!isKollusApiConfigured()) {
    return data({ skipped: true, reason: "KOLLUS_API_TOKEN 미설정" });
  }

  const startedAt = Date.now();
  try {
    const result = await syncKollusContents(null);
    await recordSyncLog(result, "cron", null, Date.now() - startedAt);
    return data({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await recordSyncLog(
      { fetched: 0, inserted: 0, updated: 0, skipped: 0, errors: [message] },
      "cron",
      null,
      Date.now() - startedAt,
    );
    return data({ error: message }, { status: 500 });
  }
}

export async function loader({ request }: Route.LoaderArgs) {
  return run(request);
}
export async function action({ request }: Route.ActionArgs) {
  return run(request);
}
