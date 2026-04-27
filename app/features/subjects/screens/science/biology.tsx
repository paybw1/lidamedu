import type { Route } from "./+types/biology";

import ComingSoon from "~/core/components/coming-soon";

export const meta: Route.MetaFunction = () => [{ title: "생물 | Lidam Edu" }];

export default function SubjectBiology() {
  return <ComingSoon title="자연과학 — 생물" />;
}
