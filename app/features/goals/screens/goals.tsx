import type { Route } from "./+types/goals";

import ComingSoon from "~/core/components/coming-soon";

export const meta: Route.MetaFunction = () => [
  { title: "학습목표 및 과목별 진도 | Lidam Edu" },
];

export default function Goals() {
  return <ComingSoon title="학습목표 및 과목별 진도" />;
}
