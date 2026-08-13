// Phase 3 — 노드 선택기 데이터 (지연 로드). GET ?law=patent → 과목 전체 노드
// (비 case_only, 트리 표시순, depth). 전체 탐색은 2차 경로 — 추천·최근은 화면
// 로더가 공급하고, 이 라우트는 과목 선택 시에만 호출된다.

import { data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { listPlanNodes } from "~/features/study-plans/queries.server";
import {
  LAW_SUBJECTS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/plan-nodes";

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const law = url.searchParams.get("law") ?? "";
  if (!Object.prototype.hasOwnProperty.call(LAW_SUBJECTS, law)) {
    return data({ error: "과목 오류" }, { status: 400 });
  }
  const nodes = await listPlanNodes(client, law as LawSubjectSlug);
  return data({ ok: true as const, nodes });
}
