import type { Route } from "./+types/admin";

import ComingSoon from "~/core/components/coming-soon";

export const meta: Route.MetaFunction = () => [{ title: "운영자 | Lidam Edu" }];

export default function Admin() {
  return <ComingSoon title="운영자" />;
}
