import type { Route } from "./+types/laws";

import ComingSoon from "~/core/components/coming-soon";

export const meta: Route.MetaFunction = () => [{ title: "법 개정 | Lidam Edu" }];

export default function LatestLaws() {
  return <ComingSoon title="최신 정보 — 법 개정" />;
}
