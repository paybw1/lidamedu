import type { Route } from "./+types/civil";

import ComingSoon from "~/core/components/coming-soon";

export const meta: Route.MetaFunction = () => [{ title: "민법 | Lidam Edu" }];

export default function SubjectCivil() {
  return <ComingSoon title="민법" />;
}
