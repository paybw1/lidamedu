import type { Route } from "./+types/gs";

import ComingSoon from "~/core/components/coming-soon";

export const meta: Route.MetaFunction = () => [
  { title: "온라인 GS | Lidam Edu" },
];

export default function OnlineGs() {
  return <ComingSoon title="온라인 GS" />;
}
