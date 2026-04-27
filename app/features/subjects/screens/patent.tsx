import type { Route } from "./+types/patent";

import ComingSoon from "~/core/components/coming-soon";

export const meta: Route.MetaFunction = () => [{ title: "특허법 | Lidam Edu" }];

export default function SubjectPatent() {
  return <ComingSoon title="특허법" />;
}
