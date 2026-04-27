import type { Route } from "./+types/earth-science";

import ComingSoon from "~/core/components/coming-soon";

export const meta: Route.MetaFunction = () => [
  { title: "지구과학 | Lidam Edu" },
];

export default function SubjectEarthScience() {
  return <ComingSoon title="자연과학 — 지구과학" />;
}
