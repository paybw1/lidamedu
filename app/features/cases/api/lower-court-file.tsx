// feat-2-035 — 하급심 판결문 **원본 파일 다운로드**(staff). `/admin/cases/lower-court/:caseId/file?i=0`
//
// 버킷이 private 이라 URL 을 그대로 노출할 수 없다(저작물 전문). 운영자 확인을 통과한 요청에만
// 짧은 수명의 서명 URL 을 발급해 그리로 넘긴다 — 링크가 새어 나가도 곧 죽는다.
import type { Route } from "./+types/lower-court-file";

import { data, redirect } from "react-router";

import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { parseLowerCourtFiles } from "~/features/cases/lib/lower-court";
import { LOWER_COURT_BUCKET } from "~/features/cases/queries-lower-court.server";
import { getStaffRole } from "~/features/laws/queries.server";

/** 내려받는 데 필요한 만큼만. 링크를 복사해 두고 나중에 열어도 소용없게 한다. */
const SIGNED_URL_TTL_SEC = 60;

export async function loader({ request, params }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  // ★RLS(case_lower_courts staff 전용)가 1차 방어지만, 서명 URL 은 RLS 밖으로 나가는
  //   경로라 여기서 역할을 반드시 다시 확인한다.
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });
  if (!params.caseId) throw data("Not found", { status: 404 });

  const { data: row, error } = await client
    .from("case_lower_courts")
    .select("files")
    .eq("case_id", params.caseId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw data(error.message, { status: 500 });

  const files = parseLowerCourtFiles(row?.files);
  const index = Number(new URL(request.url).searchParams.get("i") ?? "0");
  const file = Number.isInteger(index) ? files[index] : undefined;
  if (!file) throw data("Not found", { status: 404 });

  // download 옵션이 Content-Disposition 을 붙여 준다 — 한글 파일명 인코딩까지 여기서 처리된다.
  const { data: signed, error: sErr } = await adminClient.storage
    .from(LOWER_COURT_BUCKET)
    .createSignedUrl(file.path, SIGNED_URL_TTL_SEC, { download: file.name });
  if (sErr || !signed)
    throw data(sErr?.message ?? "sign failed", { status: 500 });

  return redirect(signed.signedUrl);
}
