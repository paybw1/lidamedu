// feat-8-029 P3 — 학생 환불요청 접수 API.
//
// ★feat-11-013 D10 — **더 이상 접수하지 않는다**(요청서 PART B §1 「수강생 직접 환불신청 기능 제외」).
//   환불 문의는 고객센터로 받고, 상담 내용을 확인한 관리자가 /admin/refunds 에 등록한다.
//   ★화면에서 버튼만 지우면 안 된다 — 열어 둔 탭과 직접 POST 가 그대로 통과한다.
//     라우트를 지우지 않고 남겨 **어디로 가야 하는지 말해 주는** 응답을 돌려준다
//     (404 는 학생에게 「고장」으로 읽힌다).

import { data, redirect } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";

import type { Route } from "./+types/refund-request";

export async function action({ request }: Route.ActionArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");

  return data(
    {
      error:
        "환불 신청은 고객센터로 접수해 주세요. 상담 내용을 확인한 담당자가 환불을 처리합니다.",
    },
    { status: 410 },
  );
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
