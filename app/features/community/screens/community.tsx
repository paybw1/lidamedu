import type { Route } from "./+types/community";

import ComingSoon from "~/core/components/coming-soon";

export const meta: Route.MetaFunction = () => [
  { title: "커뮤니티 | Lidam Edu" },
];

export default function Community() {
  return <ComingSoon title="커뮤니티" />;
}
