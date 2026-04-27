import type { Route } from "./+types/cases";

import ComingSoon from "~/core/components/coming-soon";

export const meta: Route.MetaFunction = () => [
  { title: "최근 판례 | Lidam Edu" },
];

export default function LatestCases() {
  return <ComingSoon title="최신 정보 — 최근 판례" />;
}
