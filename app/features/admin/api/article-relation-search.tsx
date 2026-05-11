// 조문 관계 편집 페이지 — 판례 검색 API.

import { data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { searchCasesForLink } from "~/features/admin/queries/article-relations.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  LAW_SUBJECT_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/article-relation-search";

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const law = url.searchParams.get("law") ?? "";
  const q = url.searchParams.get("q") ?? "";
  if (!(LAW_SUBJECT_SLUGS as readonly string[]).includes(law)) {
    return { results: [] };
  }
  const results = await searchCasesForLink(
    client,
    law as LawSubjectSlug,
    q,
    20,
  );
  return { results };
}
