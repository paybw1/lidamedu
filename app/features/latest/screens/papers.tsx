import type { Route } from "./+types/papers";

import ComingSoon from "~/core/components/coming-soon";

export const meta: Route.MetaFunction = () => [{ title: "논문 | Lidam Edu" }];

export default function LatestPapers() {
  return <ComingSoon title="최신 정보 — 논문" />;
}
