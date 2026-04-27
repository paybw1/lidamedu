import type { Route } from "./+types/civil-procedure";

import ComingSoon from "~/core/components/coming-soon";

export const meta: Route.MetaFunction = () => [
  { title: "민사소송법 | Lidam Edu" },
];

export default function SubjectCivilProcedure() {
  return <ComingSoon title="민사소송법" />;
}
