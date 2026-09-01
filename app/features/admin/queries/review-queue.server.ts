// feat-14-N1-b — 통합 검수 큐 쿼리.
//
// 검수 성격의 화면이 이미 9개인데(문제 검수·해설·텍스트 변환·OX·도식·2차 훈련·
// case-study·LMS 후기·시드 미리보기) **무엇이 얼마나 밀렸는지 한 곳에서 안 보인다.**
// 그래서 학생에게 안 보이는(draft) 콘텐츠가 271건까지 쌓였다(2026-09-01 실측).
//
// ★이 모듈은 **읽기 전용**이다. 승인/반려는 각 종류의 **기존 엔드포인트**를 그대로 부른다
//   (뮤테이션 경로 동결 — 같은 관심사에 임시 경로를 새로 만들지 않는다):
//     문제        → POST /api/admin/problem-review        intent=approve|reject
//     판례 도식   → POST /admin/case-diagrams/:caseId      intent=approve|reject
//     2차 훈련 항목 → POST /api/case-training/item          intent=approve
//     2차 훈련 논점 → POST /api/case-training/issue         intent=approve
// ★staff 전원이 읽는다(검수는 강사도 한다). adminClient 를 쓰는 이유는 RLS 가
//   draft 를 가리는 테이블이 섞여 있어 0건으로 보이는 것을 피하기 위함이다.

import adminClient from "~/core/lib/supa-admin-client.server";

import {
  type AuditBadge,
  type ReviewKind,
  type ReviewQueue,
  type ReviewRow,
} from "~/features/admin/lib/review-queue";

/** 승인/반려를 보낼 곳 — 종류별 기존 엔드포인트. */
const REVIEW_ACTION_PATH: Record<ReviewKind, string> = {
  problem: "/api/admin/problem-review",
  case_diagram: "", // caseId 가 경로에 들어간다 — 행마다 actionPath 로 내려준다.
  case_training_item: "/api/case-training/item",
  case_training_issue: "/api/case-training/issue",
};

const PREVIEW_CHARS = 220;
const clip = (s: string | null | undefined): string =>
  (s ?? "").replace(/\s+/g, " ").trim().slice(0, PREVIEW_CHARS);

/** 감사 결과를 entity_id 로 묶어 배지로 쓴다. */
async function loadAudits(
  kind: ReviewKind,
  ids: string[],
): Promise<Map<string, AuditBadge[]>> {
  const out = new Map<string, AuditBadge[]>();
  if (ids.length === 0) return out;
  // 대량 .in() 은 배치로 — 150개씩(운영 경험치).
  const CHUNK = 150;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data } = await adminClient
      .from("content_audit_findings")
      .select("entity_id, rule_key, severity, message")
      .eq("entity_type", kind)
      .in("entity_id", ids.slice(i, i + CHUNK));
    for (const r of data ?? []) {
      const list = out.get(r.entity_id) ?? [];
      list.push({
        ruleKey: r.rule_key,
        severity: r.severity as AuditBadge["severity"],
        message: r.message,
      });
      out.set(r.entity_id, list);
    }
  }
  return out;
}

/** 심각한 것부터 — fail > warn > 무경고. 같은 등급이면 오래된 것부터(밀린 순). */
function sortRows(rows: ReviewRow[]): ReviewRow[] {
  const rank = (r: ReviewRow): number => {
    if (r.audits.some((a) => a.severity === "fail")) return 0;
    if (r.audits.some((a) => a.severity === "warn")) return 1;
    return 2;
  };
  return rows.sort(
    (a, b) =>
      rank(a) - rank(b) || (a.createdAt ?? "").localeCompare(b.createdAt ?? ""),
  );
}

const LIMIT = 200;

async function loadProblems(): Promise<ReviewRow[]> {
  const { data } = await adminClient
    .from("problems")
    .select("problem_id, body_md, year, problem_number, display_no, format, created_at")
    .eq("review_status", "draft")
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(LIMIT);
  const rows = data ?? [];
  const audits = await loadAudits(
    "problem",
    rows.map((r) => r.problem_id),
  );
  return rows.map((r) => ({
    kind: "problem" as const,
    id: r.problem_id,
    title: clip(r.body_md) || "(발문 없음)",
    subtitle: [
      r.display_no ? `P-${r.display_no}` : null,
      r.year ? `${r.year}년` : null,
      r.problem_number ? `${r.problem_number}번` : null,
      r.format,
    ]
      .filter(Boolean)
      .join(" · "),
    preview: "",
    editHref: `/admin/problems/${r.problem_id}`,
    actionPath: REVIEW_ACTION_PATH.problem,
    idField: "problemId",
    createdAt: r.created_at,
    audits: audits.get(r.problem_id) ?? [],
  }));
}

async function loadDiagrams(): Promise<ReviewRow[]> {
  const { data } = await adminClient
    .from("case_diagrams")
    .select(
      "diagram_id, case_id, facts_md, blocks, created_at, cases:case_id ( case_number, case_title, decided_at )",
    )
    .eq("review_status", "draft")
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(LIMIT);
  const rows = data ?? [];
  const audits = await loadAudits(
    "case_diagram",
    rows.map((r) => r.diagram_id),
  );
  return rows.map((r) => {
    const c = r.cases as {
      case_number: string;
      case_title: string;
      decided_at: string;
    } | null;
    const blocks = Array.isArray(r.blocks) ? r.blocks : [];
    return {
      kind: "case_diagram" as const,
      id: r.diagram_id,
      title: c?.case_number ?? "(사건번호 없음)",
      subtitle: [c?.decided_at, `쟁점 ${blocks.length}개`, clip(c?.case_title).slice(0, 60)]
        .filter(Boolean)
        .join(" · "),
      preview: clip(r.facts_md),
      editHref: `/admin/case-diagrams/${r.case_id}`,
      // ★도식만 caseId 가 경로에 들어간다(판례당 1건이라 키가 caseId).
      actionPath: `/admin/case-diagrams/${r.case_id}`,
      idField: null,
      createdAt: r.created_at,
      audits: audits.get(r.diagram_id) ?? [],
    };
  });
}

async function loadTrainingItems(): Promise<ReviewRow[]> {
  const { data } = await adminClient
    .from("case_training_items")
    .select(
      "item_id, facts_summary_md, created_at, cases:case_id ( case_number, case_title )",
    )
    .eq("review_status", "draft")
    // ★검수 요청된 것만 — null 은 아직 만드는 중이다(위 워크큐와 같은 규칙).
    .not("review_requested_at", "is", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(LIMIT);
  const rows = data ?? [];
  const audits = await loadAudits(
    "case_training_item",
    rows.map((r) => r.item_id),
  );
  return rows.map((r) => {
    const c = r.cases as { case_number: string; case_title: string } | null;
    return {
      kind: "case_training_item" as const,
      id: r.item_id,
      title: c?.case_number ?? "(사건번호 없음)",
      subtitle: clip(c?.case_title).slice(0, 80),
      preview: clip(r.facts_summary_md),
      editHref: `/admin/case-training/${r.item_id}`,
      actionPath: REVIEW_ACTION_PATH.case_training_item,
      idField: "itemId",
      createdAt: r.created_at,
      audits: audits.get(r.item_id) ?? [],
    };
  });
}

async function loadTrainingIssues(): Promise<ReviewRow[]> {
  const { data } = await adminClient
    .from("case_training_issues")
    .select(
      "issue_id, item_id, label, description_md, model_conclusion_md, created_at, case_training_items:item_id ( item_id, cases:case_id ( case_number ) )",
    )
    .eq("review_status", "draft")
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(LIMIT);
  const rows = data ?? [];
  const audits = await loadAudits(
    "case_training_issue",
    rows.map((r) => r.issue_id),
  );
  return rows.map((r) => {
    const item = r.case_training_items as {
      item_id: string;
      cases: { case_number: string } | null;
    } | null;
    return {
      kind: "case_training_issue" as const,
      id: r.issue_id,
      title: clip(r.label) || "(논점 제목 없음)",
      subtitle: item?.cases?.case_number ?? "",
      preview: clip(r.description_md) || clip(r.model_conclusion_md),
      // 논점은 단독 화면이 없다 — 소속 항목 편집 화면으로 보낸다.
      editHref: `/admin/case-training/${r.item_id}`,
      actionPath: REVIEW_ACTION_PATH.case_training_issue,
      idField: "issueId",
      createdAt: r.created_at,
      audits: audits.get(r.issue_id) ?? [],
    };
  });
}

/**
 * 통합 검수 큐. `kind` 를 주면 그 종류만 싣고, 없으면 개수만 센다.
 * 개수는 항상 4종 전부 — 탭에 밀린 양이 보여야 무엇부터 손댈지 정할 수 있다.
 */
export async function getReviewQueue(kind: ReviewKind): Promise<ReviewQueue> {
  const [problems, diagrams, items, issues] = await Promise.all([
    adminClient
      .from("problems")
      .select("problem_id", { count: "exact", head: true })
      .eq("review_status", "draft")
      .is("deleted_at", null),
    adminClient
      .from("case_diagrams")
      .select("diagram_id", { count: "exact", head: true })
      .eq("review_status", "draft")
      .is("deleted_at", null),
    adminClient
      .from("case_training_items")
      .select("item_id", { count: "exact", head: true })
      .eq("review_status", "draft")
      .not("review_requested_at", "is", null)
      .is("deleted_at", null),
    adminClient
      .from("case_training_issues")
      .select("issue_id", { count: "exact", head: true })
      .eq("review_status", "draft")
      .is("deleted_at", null),
  ]);

  const loaders: Record<ReviewKind, () => Promise<ReviewRow[]>> = {
    problem: loadProblems,
    case_diagram: loadDiagrams,
    case_training_item: loadTrainingItems,
    case_training_issue: loadTrainingIssues,
  };
  const rows = sortRows(await loaders[kind]());

  return {
    counts: {
      problem: problems.count ?? 0,
      case_diagram: diagrams.count ?? 0,
      case_training_item: items.count ?? 0,
      case_training_issue: issues.count ?? 0,
    },
    rows,
  };
}
