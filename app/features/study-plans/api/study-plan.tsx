// Phase 3 — 월간 계획 학생 액션 API.
// 전부 요청 클라이언트(RLS 소유권) — draft/revision_requested 에서만 쓰기가 통과하고
// (RLS 화이트리스트), 승인 후 항목은 is_locked 로 차단된다. adminClient 미사용.

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import {
  createPlanRevision,
  resolveLessonNode,
} from "~/features/study-plans/queries.server";
import { currentMonthPeriod } from "~/features/study-plans/labels";

import type { Route } from "./+types/study-plan";

const itemSchema = z.object({
  title: z.string().trim().min(1).max(200),
  activityType: z.enum([
    "lecture",
    "review",
    "problem",
    "memorize",
    "reading",
    "essay",
    "other",
  ]),
  dailyMinutes: z.coerce.number().int().min(1).max(1440), // F4 — 하루 목표 시간 필수
  dayScope: z.enum(["weekday", "weekend", "all"]),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  priority: z.coerce.number().int().min(1).max(99).optional(),
  nodeId: z.string().uuid().optional(),
  lessonId: z.string().uuid().optional(),
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

  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "");

  if (intent === "create_plan") {
    const cohortId = String(fd.get("cohortId") ?? "");
    if (!cohortId) return data({ error: "반 정보가 없습니다" }, { status: 400 });
    const { periodStart, periodEnd } = currentMonthPeriod();
    const { data: created, error } = await client
      .from("study_plans")
      .insert({
        user_id: user.id,
        cohort_id: cohortId,
        period_start: periodStart,
        period_end: periodEnd,
        status: "draft",
      })
      .select("plan_id")
      .single();
    if (error) {
      // in-flight 파셜 유니크 — 이미 작성 중 계획 존재.
      if (error.code === "23505") {
        return data({ error: "이번 달 계획이 이미 있습니다" }, { status: 409 });
      }
      // RLS(반 미소속 등) fail-closed.
      return data({ error: "계획을 만들 수 없습니다" }, { status: 403 });
    }
    return data({ ok: true, planId: created.plan_id });
  }

  if (intent === "create_revision") {
    const planId = String(fd.get("planId") ?? "");
    if (!planId) return data({ error: "planId 누락" }, { status: 400 });
    try {
      const newPlanId = await createPlanRevision(client, planId, user.id);
      return data({ ok: true, planId: newPlanId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "수정본을 만들 수 없습니다";
      return data({ error: msg }, { status: 400 });
    }
  }

  if (intent === "submit_plan") {
    const planId = String(fd.get("planId") ??"");
    // 제출 전 최소 검증 — 항목 0개 계획은 제출 불가.
    const { count } = await client
      .from("study_plan_items")
      .select("item_id", { head: true, count: "exact" })
      .eq("plan_id", planId);
    if ((count ?? 0) === 0) {
      return data({ error: "항목이 없는 계획은 제출할 수 없습니다" }, { status: 400 });
    }
    const { data: updated, error } = await client
      .from("study_plans")
      .update({ status: "submitted", submitted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("plan_id", planId)
      .eq("user_id", user.id)
      .select("plan_id");
    if (error) return data({ error: "제출 실패" }, { status: 400 });
    if (!updated?.length) {
      // RLS 화이트리스트(draft/반려에서만)에서 걸러짐.
      return data({ error: "제출할 수 없는 상태입니다" }, { status: 400 });
    }
    return data({ ok: true });
  }

  if (intent === "add_item" || intent === "update_item") {
    const planId = String(fd.get("planId") ?? "");
    const parsed = itemSchema.safeParse({
      title: fd.get("title"),
      activityType: fd.get("activityType"),
      dailyMinutes: fd.get("dailyMinutes"),
      dayScope: fd.get("dayScope"),
      startDate: fd.get("startDate"),
      endDate: fd.get("endDate"),
      priority: fd.get("priority") || undefined,
      nodeId: fd.get("nodeId") || undefined,
      lessonId: fd.get("lessonId") || undefined,
    });
    if (!parsed.success) {
      return data({ error: "입력을 확인해 주세요 (하루 시간은 필수입니다)" }, { status: 400 });
    }
    if (parsed.data.endDate < parsed.data.startDate) {
      return data({ error: "기간이 올바르지 않습니다" }, { status: 400 });
    }
    // lesson resolver — 노드 미지정 + 강의 연결 시 lesson_node_links 해석.
    // 매핑 없으면 node NULL 유지(화면 "노드 미연결" 표시 — 숨기지 않는다).
    let nodeId = parsed.data.nodeId ?? null;
    if (!nodeId && parsed.data.lessonId) {
      nodeId = await resolveLessonNode(client, parsed.data.lessonId);
    }
    const row = {
      title: parsed.data.title,
      activity_type: parsed.data.activityType,
      daily_minutes: parsed.data.dailyMinutes,
      day_scope: parsed.data.dayScope,
      start_date: parsed.data.startDate,
      end_date: parsed.data.endDate,
      priority: parsed.data.priority ?? null,
      node_id: nodeId,
      lesson_id: parsed.data.lessonId ?? null,
    };
    if (intent === "add_item") {
      const { error } = await client
        .from("study_plan_items")
        .insert({ plan_id: planId, ...row });
      if (error) return data({ error: "추가할 수 없습니다 (승인된 계획은 수정 불가)" }, { status: 400 });
    } else {
      const itemId = String(fd.get("itemId") ?? "");
      const { data: updated, error } = await client
        .from("study_plan_items")
        .update({ ...row, updated_at: new Date().toISOString() })
        .eq("item_id", itemId)
        .select("item_id");
      if (error || !updated?.length) {
        return data({ error: "수정할 수 없습니다 (승인된 계획은 수정 불가)" }, { status: 400 });
      }
    }
    return data({ ok: true });
  }

  if (intent === "delete_item") {
    const itemId = String(fd.get("itemId") ?? "");
    const { error } = await client
      .from("study_plan_items")
      .delete()
      .eq("item_id", itemId);
    if (error) return data({ error: "삭제할 수 없습니다" }, { status: 400 });
    return data({ ok: true });
  }

  return data({ error: `알 수 없는 intent: ${intent}` }, { status: 400 });
}

export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
