// 예상문제 연결 도구 — 강사 승인 적용 endpoint.
// intents:
//   apply    → JSON targets[] 를 받아 applyLinkApprovals 실행
//   dry-run  → targets[] 를 받아 어떤 변경이 일어날지 미리 시뮬레이션 (DB 변경 없음, 충돌·기존값 표시)

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  applyLinkApprovals,
  type ApplyTarget,
} from "~/features/problems/queries-link-suggest.server";

import type { Route } from "./+types/problem-link-approve";

const choiceTypeSchema = z.enum(["statute", "precedent", "theory"]).nullable().optional();

const targetSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("choice"),
    choiceId: z.string().uuid(),
    articleId: z.string().uuid().nullable(),
    caseId: z.string().uuid().nullable(),
    choiceType: choiceTypeSchema,
  }),
  z.object({
    kind: z.literal("box"),
    boxItemId: z.string().uuid(),
    articleId: z.string().uuid().nullable(),
    caseId: z.string().uuid().nullable(),
    choiceType: choiceTypeSchema,
  }),
  z.object({
    kind: z.literal("primary"),
    problemId: z.string().uuid(),
    articleId: z.string().uuid(),
  }),
  z.object({
    kind: z.literal("problem-case"),
    problemId: z.string().uuid(),
    caseId: z.string().uuid(),
  }),
]);

const bodySchema = z.object({
  intent: z.enum(["apply", "dry-run"]),
  targets: z.array(targetSchema).min(1).max(500),
});

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) return data({ error: "Forbidden" }, { status: 403 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return data({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return data(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const { intent, targets } = parsed.data;

  if (intent === "dry-run") {
    // 기존 값 + 충돌 미리보기 — 적용하면 무엇이 어떻게 바뀔지.
    const preview = await dryRunPreview(client, targets);
    return data({ ok: true, preview });
  }

  const result = await applyLinkApprovals(client, user.id, targets as ApplyTarget[]);
  return data({ ok: true, ...result });
}

interface DryRunRow {
  target: ApplyTarget;
  /** 현재 DB 값. 적용 후 바뀔 컬럼만 표시. */
  before: Record<string, string | null>;
  /** 적용 후 값. */
  after: Record<string, string | null>;
  /** 동일 (no-op) — 적용해도 변화 없음. */
  noChange: boolean;
}

async function dryRunPreview(
  client: ReturnType<typeof makeServerClient>[0],
  targets: ApplyTarget[],
): Promise<DryRunRow[]> {
  const rows: DryRunRow[] = [];
  for (const t of targets) {
    if (t.kind === "choice") {
      const { data: cur } = await client
        .from("problem_choices")
        .select("related_article_id, related_case_id")
        .eq("choice_id", t.choiceId)
        .maybeSingle();
      const before: Record<string, string | null> = {};
      const after: Record<string, string | null> = {};
      if (t.articleId !== null) {
        before.related_article_id = cur?.related_article_id ?? null;
        after.related_article_id = t.articleId;
      }
      if (t.caseId !== null) {
        before.related_case_id = cur?.related_case_id ?? null;
        after.related_case_id = t.caseId;
      }
      rows.push({
        target: t,
        before,
        after,
        noChange:
          Object.keys(after).every((k) => before[k] === after[k]),
      });
    } else if (t.kind === "box") {
      const { data: cur } = await client
        .from("problem_box_items")
        .select("related_article_id, related_case_id")
        .eq("box_item_id", t.boxItemId)
        .maybeSingle();
      const before: Record<string, string | null> = {};
      const after: Record<string, string | null> = {};
      if (t.articleId !== null) {
        before.related_article_id = cur?.related_article_id ?? null;
        after.related_article_id = t.articleId;
      }
      if (t.caseId !== null) {
        before.related_case_id = cur?.related_case_id ?? null;
        after.related_case_id = t.caseId;
      }
      rows.push({
        target: t,
        before,
        after,
        noChange:
          Object.keys(after).every((k) => before[k] === after[k]),
      });
    } else if (t.kind === "primary") {
      const { data: cur } = await client
        .from("problems")
        .select("primary_article_id")
        .eq("problem_id", t.problemId)
        .maybeSingle();
      rows.push({
        target: t,
        before: { primary_article_id: cur?.primary_article_id ?? null },
        after: { primary_article_id: t.articleId },
        noChange: cur?.primary_article_id === t.articleId,
      });
    } else if (t.kind === "problem-case") {
      const { data: existing } = await client
        .from("problem_case_links")
        .select("link_id")
        .eq("problem_id", t.problemId)
        .eq("case_id", t.caseId)
        .limit(1);
      const exists = !!existing && existing.length > 0;
      rows.push({
        target: t,
        before: { problem_case_link: exists ? "exists" : null },
        after: { problem_case_link: "exists" },
        noChange: exists,
      });
    }
  }
  return rows;
}
