// 정리비교표 한 장 — 본문·워터마크·열람 로그를 **한 요청**에 묶는다(도해 /api/dohae/unit 과 같은 꼴).
//
// ★본문을 허브 로더로 미리 내려보내지 않는 이유: 14장 ≈ 190KB 가 특허법 화면마다 실리고,
//   기록 없이(view-source) 본문에 닿는 길이 생긴다. 여기서는 RLS 를 통과한 요청에만 본문을
//   주고, 그 순간 열람 로그를 남긴다(staff 제외 — 검수·편집 열람이 섞이면 대조가 흐려진다).
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { buildViewerWatermark } from "~/core/lib/viewer-watermark.server";
import { runAfterResponse } from "~/core/lib/wait-until.server";
import {
  getStaffRole,
  getSystematicDigestBody,
} from "~/features/laws/queries.server";

import { logDigestView } from "../lib/digest-views.server";
import type { Route } from "./+types/digest";

const schema = z.object({ digestId: z.string().uuid() });

// ★raw fetch 로 부르는 리소스 라우트다 — `data({...}, {status})` 는 이 경로에서 status 가 버려져
//   항상 200 으로 내려간다(react-router 7.6 queryRoute, 검토 실측). 실제 HTTP 상태와 no-store 를
//   내리려면 Response.json 을 써야 한다(선례: guide/api/help-visibility.tsx).
const NO_STORE = { "cache-control": "no-store" };
const fail = (error: string, status: number) =>
  Response.json({ error }, { status, headers: NO_STORE });

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return fail("Unauthorized", 401);

  const sp = new URL(request.url).searchParams;
  const parsed = schema.safeParse({ digestId: sp.get("digestId") });
  if (!parsed.success) return fail("Invalid input", 400);

  // 요청 클라이언트로 읽는다 — RLS 통과가 곧 읽을 권한의 증명(미통과 = 404).
  const [staffRole, body, watermark] = await Promise.all([
    getStaffRole(client, user.id),
    getSystematicDigestBody(client, parsed.data.digestId),
    // 유출방지 ① — 열람 요청마다 새로 찍는다(시각이 열람 시각이다).
    buildViewerWatermark(client, user.id),
  ]);
  if (!body) return fail("Not found", 404);

  // 유출방지 ⑤ — 열람 로그(응답 후 best-effort, staff 제외).
  if (staffRole === null) {
    runAfterResponse(logDigestView({ profileId: user.id, digestId: body.digestId }));
  }
  // 본문은 저작물 — 브라우저 디스크 캐시에 남기지 않는다.
  return Response.json({ ...body, watermark }, { headers: NO_STORE });
}
