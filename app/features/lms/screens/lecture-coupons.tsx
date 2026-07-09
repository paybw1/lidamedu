// 쿠폰 관리 — /lecture/coupons. 보유 쿠폰·등록(오픈 예정).
import { TicketPercentIcon } from "lucide-react";
import { redirect } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";

import { MyPagePlaceholder } from "../components/mypage-placeholder";

import type { Route } from "./+types/lecture-coupons";

export function meta() {
  return [{ title: "쿠폰 관리 | 리담변리사학원" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  return null;
}

export default function LectureCoupons() {
  return (
    <MyPagePlaceholder
      title="쿠폰 관리"
      desc="보유 쿠폰 확인과 쿠폰 등록·사용 기능을 준비하고 있습니다. 진행 중인 할인은 수강신청 페이지에서 확인하실 수 있습니다."
      icon={<TicketPercentIcon className="size-6" />}
    />
  );
}
