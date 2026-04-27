import type { Route } from "./+types/trademark";

import ComingSoon from "~/core/components/coming-soon";

export const meta: Route.MetaFunction = () => [{ title: "상표법 | Lidam Edu" }];

export default function SubjectTrademark() {
  return <ComingSoon title="상표법" />;
}
