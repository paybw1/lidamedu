/**
 * 회원 탈퇴 API — 즉시 계정 삭제가 아니라 "탈퇴 처리" 흐름.
 *
 * 학생이 /account/edit 에서 탈퇴하면:
 *   1. 탈퇴 대장(user_withdrawals)에 기록 — 운영자 /admin/withdrawals 에서 관리
 *   2. 이용 승인 해제(access_approved_at=null) — 즉시 접속 차단
 *   3. 로그아웃 (단일 세션 해제 포함)
 *
 * 계정·학습 데이터(메모/진도/풀이 등)는 개인정보처리방침의 보유 기간(탈퇴 후 3년)
 * 동안 보존 — 재구독 시 학습 기록을 복원하기 위함. 완전 삭제(비가역)는 보유 기간
 * 경과 또는 본인 파기 요청 시 운영자가 /admin/withdrawals 에서 수행한다.
 */
import type { Route } from "./+types/delete-account";

import { data, redirect } from "react-router";

import { requireAuthentication, requireMethod } from "~/core/lib/guards.server";
import { releaseSession } from "~/core/lib/single-session.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { processWithdrawal } from "~/features/admin/queries/withdrawals.server";

export async function action({ request }: Route.ActionArgs) {
  requireMethod("DELETE")(request);

  const [client, headers] = makeServerClient(request);
  await requireAuthentication(client, request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "로그인이 필요합니다." }, { status: 401 });

  // 탈퇴 대장 기록 + 이용 승인 해제. (학생 계정만 — staff 는 운영자에게 문의)
  const res = await processWithdrawal(user.id, "본인 요청 (계정 화면)", user.id);
  if (!res.ok) {
    return data({ error: res.error }, { status: 400 });
  }

  // 로그아웃 — 단일 세션 해제 후 세션 종료.
  await releaseSession(client, headers);
  await client.auth.signOut();
  return redirect("/", { headers });
}
