import type { Route } from "./+types/chemistry";

import ComingSoon from "~/core/components/coming-soon";

export const meta: Route.MetaFunction = () => [{ title: "화학 | Lidam Edu" }];

export default function SubjectChemistry() {
  return <ComingSoon title="자연과학 — 화학" />;
}
