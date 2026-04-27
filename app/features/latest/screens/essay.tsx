import type { Route } from "./+types/essay";

import ComingSoon from "~/core/components/coming-soon";

export const meta: Route.MetaFunction = () => [
  { title: "주관식 문제 | Lidam Edu" },
];

export default function LatestEssay() {
  return <ComingSoon title="최신 정보 — 주관식 문제" />;
}
