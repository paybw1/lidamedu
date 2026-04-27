import type { Route } from "./+types/physics";

import ComingSoon from "~/core/components/coming-soon";

export const meta: Route.MetaFunction = () => [{ title: "물리 | Lidam Edu" }];

export default function SubjectPhysics() {
  return <ComingSoon title="자연과학 — 물리" />;
}
