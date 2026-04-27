import type { Route } from "./+types/design";

import ComingSoon from "~/core/components/coming-soon";

export const meta: Route.MetaFunction = () => [
  { title: "디자인보호법 | Lidam Edu" },
];

export default function SubjectDesign() {
  return <ComingSoon title="디자인보호법" />;
}
