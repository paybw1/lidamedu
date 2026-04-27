import type { Route } from "./+types/mcq";

import ComingSoon from "~/core/components/coming-soon";

export const meta: Route.MetaFunction = () => [
  { title: "객관식 문제 | Lidam Edu" },
];

export default function LatestMcq() {
  return <ComingSoon title="최신 정보 — 객관식 문제" />;
}
