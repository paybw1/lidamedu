// 결제내역 조회 — /lecture/payments. 결제·환불 이력(오픈 예정).
import { ReceiptTextIcon } from "lucide-react";
import { redirect } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";

import { MyPagePlaceholder } from "../components/mypage-placeholder";

import type { Route } from "./+types/lecture-payments";

export function meta() {
  return [{ title: "결제내역 조회 | 리담변리사학원" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  return null;
}

export default function LecturePayments() {
  return (
    <MyPagePlaceholder
      title="결제내역 조회"
      desc="강의·도서 결제와 환불 이력을 한눈에 확인하는 기능을 준비하고 있습니다. 주문·배송 현황은 마이페이지 › 주문·배송에서 확인하실 수 있습니다."
      icon={<ReceiptTextIcon className="size-6" />}
    />
  );
}
