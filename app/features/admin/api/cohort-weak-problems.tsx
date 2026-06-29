// 반 공통 약점 → 후보 문제 추천 (feat-10 고도화 단계4). staff 전용 loader.
//   getCohortWeakNodes(공통 가드) → 노드별 approved 후보 → pickProblemsFromWeakNodes(가중 배분)
//   → 검토용 후보 목록 반환. 쓰기는 안 함(picker 와 동일하게 add_problems 로 강사가 확정).
//   adminClient 우회 작업이므로 cohort 소유 게이트가 유일 방어선(profiles RLS 교차읽기 불가).
import type { Route } from "./+types/cohort-weak-problems";

import { data } from "react-router";

import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { selectCohortWeakProblems } from "~/features/admin/queries/cohort-weakness.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { lawSubjectSlugSchema } from "~/features/subjects/lib/subjects";

interface Candidate {
  id: string;
  label: string;
  secondary?: string;
  preview?: string;
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const cohortId = url.searchParams.get("cohortId")?.trim() || "";
  const lawParse = lawSubjectSlugSchema.safeParse(
    url.searchParams.get("lawCode"),
  );
  const n = Math.max(1, Math.min(50, Number(url.searchParams.get("n")) || 20));
  const packId = url.searchParams.get("packId")?.trim() || null;

  const empty = (cohortSize = 0, threshold = 0) => ({
    items: [] as Candidate[],
    cohortSize,
    threshold,
    weakNodeCount: 0,
  });
  if (!cohortId || !lawParse.success) return empty();
  const lawCode = lawParse.data;

  // 코호트 소유 게이트(adminClient 우회 → 필수 방어선).
  const { data: cohort } = await adminClient
    .from("cohorts")
    .select("owner_id, deleted_at")
    .eq("cohort_id", cohortId)
    .maybeSingle();
  if (!cohort || cohort.deleted_at) {
    throw data("Cohort not found", { status: 404 });
  }
  const owns =
    role === "admin" || role === "manager" || cohort.owner_id === user.id;
  if (!owns) throw data("Forbidden", { status: 403 });

  // 이미 팩에 든 문제 제외.
  const exclude = new Set<string>();
  if (packId) {
    const { data: existing } = await adminClient
      .from("mcq_pack_problems")
      .select("problem_id")
      .eq("pack_id", packId);
    for (const e of existing ?? []) exclude.add(e.problem_id);
  }

  // 약점 문제 선택 — 공용 seam(과제 출제와 동일 규칙).
  const sel = await selectCohortWeakProblems(adminClient, cohortId, lawCode, {
    totalN: n,
    excludeIds: exclude,
  });
  if (sel.problemIds.length === 0) return empty(sel.cohortSize, sel.threshold);

  // 픽된 문제의 표시 메타(body/year/num).
  const meta = new Map<
    string,
    { body: string; year: number | null; num: number | null }
  >();
  for (let i = 0; i < sel.problemIds.length; i += 200) {
    const { data: rows } = await adminClient
      .from("problems")
      .select("problem_id, body_md, year, problem_number")
      .in("problem_id", sel.problemIds.slice(i, i + 200));
    for (const r of rows ?? [])
      meta.set(r.problem_id, {
        body: r.body_md ?? "",
        year: r.year,
        num: r.problem_number,
      });
  }

  const items: Candidate[] = sel.problemIds.map((id) => {
    const m = meta.get(id) ?? { body: "", year: null, num: null };
    const body = m.body.slice(0, 80);
    return {
      id,
      label: `${m.year ?? "?"}${m.num ? ` ${m.num}번` : ""} — ${body}${m.body.length > 80 ? "…" : ""}`,
      secondary: `약점 단원: ${sel.nodeLabelByProblem.get(id) ?? ""}`,
      preview: m.body ? m.body.slice(0, 2000) : undefined,
    };
  });
  return {
    items,
    cohortSize: sel.cohortSize,
    threshold: sel.threshold,
    weakNodeCount: sel.weakNodeCount,
  };
}
