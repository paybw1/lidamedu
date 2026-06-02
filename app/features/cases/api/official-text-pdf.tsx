// 판례 공식 전문 PDF — 매 클릭마다 fresh signed URL 발급 후 302 redirect.
//
// 의도: 클라이언트엔 정적 URL 만 노출(만료 무관). 서버 라우트가 호출 시점에
// fresh signed URL(1h TTL) 을 발급해 즉시 redirect. 학생이 PDF 탭을 열어두면
// 1시간까지 그 탭에서 다운로드 진행 가능, 만료 후엔 페이지 reload 없이도
// 다시 클릭만 하면 새 URL 받아 즉시 열림.
//
// 권한:
//   - 인증 사용자(학생/staff) 만 진입
//   - 그 외엔 401
//   - PDF 미적재 case → 404
// Storage RLS 가 anon 직접 다운로드는 차단 — service_role(admin-client) 만 signed URL 발급 가능.

import { data, redirect } from "react-router";

import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";

import type { Route } from "./+types/official-text-pdf";

const SIGNED_TTL_SEC = 3600; // 1시간 — 새 탭 안에서 다운로드 진행 충분.

export async function loader({ params, request }: Route.LoaderArgs) {
  const caseId = params.caseId;
  if (!caseId) throw data("Missing caseId", { status: 404 });

  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  // cases 자체는 학생에게 공개 콘텐츠 — 권한 게이트는 인증만 검사.
  const { data: row } = await client
    .from("cases")
    .select("official_text_pdf_path")
    .eq("case_id", caseId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!row?.official_text_pdf_path) {
    throw data("PDF not available for this case", { status: 404 });
  }

  // service_role 로 fresh signed URL 발급. anon 우회 차단 (RLS).
  const { data: signed, error } = await adminClient.storage
    .from("case-fulltext")
    .createSignedUrl(row.official_text_pdf_path, SIGNED_TTL_SEC);
  if (error || !signed?.signedUrl) {
    throw data(`Signed URL 발급 실패${error ? `: ${error.message}` : ""}`, {
      status: 500,
    });
  }

  return redirect(signed.signedUrl);
}
