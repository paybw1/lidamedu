// 포인트 관리 — /lecture/points. 적립·사용 내역(오픈 예정).
import { CoinsIcon } from "lucide-react";
import { redirect } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";

import { MyPagePlaceholder } from "../components/mypage-placeholder";

import type { Route } from "./+types/lecture-points";

export function meta() {
  return [{ title: "포인트 관리 | 리담변리사학원" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  return null;
}

export default function LecturePoints() {
  return (
    <MyPagePlaceholder
      title="포인트 관리"
      desc="적립 포인트 조회와 적립·사용 내역 기능을 준비하고 있습니다. 오픈 시 마이페이지에서 바로 확인하실 수 있습니다."
      icon={<CoinsIcon className="size-6" />}
    />
  );
}
