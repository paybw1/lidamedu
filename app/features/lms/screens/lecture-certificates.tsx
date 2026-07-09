// 증명서 발급 — /lecture/certificates. 수강증명서·영수증 발급(오픈 예정).
import { FileBadgeIcon } from "lucide-react";
import { redirect } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";

import { MyPagePlaceholder } from "../components/mypage-placeholder";

import type { Route } from "./+types/lecture-certificates";

export function meta() {
  return [{ title: "증명서 발급 | 리담변리사학원" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  return null;
}

export default function LectureCertificates() {
  return (
    <MyPagePlaceholder
      title="증명서 발급"
      desc="수강증명서·결제 영수증 등을 발급받을 수 있는 기능을 준비하고 있습니다. 급히 필요하시면 고객센터로 문의해 주세요."
      icon={<FileBadgeIcon className="size-6" />}
    />
  );
}
