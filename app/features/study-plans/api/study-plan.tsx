// Phase 3 — 월간 계획 학생 액션 API.
// 전부 요청 클라이언트(RLS 소유권) — draft/revision_requested 에서만 쓰기가 통과하고
// (RLS 화이트리스트), 승인 후 항목은 is_locked 로 차단된다. adminClient 미사용.

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import {
  createPlanRevision,
  resolveLessonNode,
  discardTimerSession,
  resolveSubjectInput,
  setRecordMode,
  startTimerSession,
  stopTimerSession,
  subjectFromNode,
  toggleTimerPause,
  upsertSubjectColor,
} from "~/features/study-plans/queries.server";
import {
  SUBJECT_COLOR_KEYS,
  isValidSubject,
} from "~/features/study-plans/subject-axis";
import {
  currentMonthPeriod,
  isFutureDate,
  kstDateTimeToISO,
} from "~/features/study-plans/labels";

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
  subject: z.string().max(60).optional(), // "kind:code" — 자연과학·기타는 직접 고른다
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

  // Stage 3 — 제출 회수 (submitted → draft, reviewed_at IS NULL 한정).
  // 상담자가 먼저 처리했으면 0행 — "이미 검토되었습니다".
  if (intent === "withdraw_plan") {
    const planId = String(fd.get("planId") ?? "");
    const { data: updated, error } = await client
      .from("study_plans")
      .update({ status: "draft", submitted_at: null, updated_at: new Date().toISOString() })
      .eq("plan_id", planId)
      .eq("user_id", user.id)
      .eq("status", "submitted")
      .is("reviewed_at", null)
      .select("plan_id");
    if (error) return data({ error: "회수 실패" }, { status: 400 });
    if (!updated?.length) {
      return data({ error: "이미 검토가 시작되어 회수할 수 없습니다" }, { status: 400 });
    }
    return data({ ok: true });
  }

  // Stage 3 — 일일 기록 (append-only). 계획 항목 체크 or 계획 외 학습.
  if (intent === "add_log") {
    const logSchema = z.object({
      logDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      minutes: z.coerce.number().int().min(1).max(1440),
      completion: z.enum(["full", "partial", "none"]).default("full"),
      activityType: z.enum([
        "lecture",
        "review",
        "problem",
        "memorize",
        "reading",
        "essay",
        "other",
      ]),
      planItemId: z.string().uuid().optional(),
      nodeId: z.string().uuid().optional(), // 계획 외 학습만 — 미분류 허용(E1)
      lessonId: z.string().uuid().optional(),
      selfDifficulty: z.coerce.number().int().min(1).max(5).optional(),
      subject: z.string().max(60).optional(), // "kind:code" — 계획 외 학습에서만
      // ★역슬래시가 빠져 있어 리터럴 "dd:dd" 만 통과했다 — 시각을 적으면 검증에서
      //   걸려 기록 저장 자체가 실패했다(신고 52b84f30). started_at 이 들어간 기록이
      //   지금까지 0건인 이유.
      startTime: z
        .string()
        .regex(/^\d{2}:\d{2}$/)
        .optional(), // 시각 미지정 허용
    });
    const parsed = logSchema.safeParse({
      logDate: fd.get("logDate"),
      minutes: fd.get("minutes"),
      completion: fd.get("completion") || "full",
      activityType: fd.get("activityType"),
      planItemId: fd.get("planItemId") || undefined,
      nodeId: fd.get("nodeId") || undefined,
      lessonId: fd.get("lessonId") || undefined,
      selfDifficulty: fd.get("selfDifficulty") || undefined,
      subject: fd.get("subject") || undefined,
      startTime: fd.get("startTime") || undefined,
    });
    if (!parsed.success) return data({ error: "입력을 확인해 주세요" }, { status: 400 });

    // ★미래 날짜는 미리 완료 처리할 수 없다(feat-7-048 D12). 열람은 허용한다.
    if (isFutureDate(parsed.data.logDate)) {
      return data(
        { error: "아직 오지 않은 날은 기록할 수 없습니다" },
        { status: 400 },
      );
    }

    // 과목 귀속(feat-7-048) — 계획 항목 상속 → 사용자 선택 → 노드 파생 → 미분류.
    // ★원장은 append-only 라 INSERT 시점에만 채운다.
    let subject: { kind: string; code: string } | null = null;
    const rawSubject = parsed.data.subject;
    if (rawSubject) {
      const [k, c] = rawSubject.split(":");
      if (k && c && isValidSubject(k, c)) subject = { kind: k, code: c };
    }

    // 노드 귀속 — 계획 항목이면 항목의 노드 상속, 아니면 직접/강의 resolver.
    let nodeId = parsed.data.nodeId ?? null;
    let resolvedFrom: "direct" | "lesson" | null = nodeId ? "direct" : null;
    let lessonId = parsed.data.lessonId ?? null;
    if (parsed.data.planItemId) {
      const { data: item } = await client
        .from("study_plan_items")
        .select("node_id, lesson_id, activity_type, subject_kind, subject_code")
        .eq("item_id", parsed.data.planItemId)
        .maybeSingle();
      if (!item) return data({ error: "계획 항목을 찾을 수 없습니다" }, { status: 404 });
      nodeId = item.node_id;
      lessonId = item.lesson_id;
      resolvedFrom = item.node_id ? "direct" : null;
      if (item.subject_kind && item.subject_code) {
        subject = { kind: item.subject_kind, code: item.subject_code };
      }
    }
    if (!nodeId && lessonId) {
      nodeId = await resolveLessonNode(client, lessonId);
      if (nodeId) resolvedFrom = "lesson";
    }

    if (!subject) subject = await subjectFromNode(client, nodeId);

    const { error } = await client.from("study_logs").insert({
      user_id: user.id,
      log_date: parsed.data.logDate,
      plan_item_id: parsed.data.planItemId ?? null,
      node_id: nodeId,
      lesson_id: lessonId,
      activity_type: parsed.data.activityType,
      minutes: parsed.data.minutes,
      source: parsed.data.planItemId ? "plan_check" : "manual",
      completion: parsed.data.completion,
      node_resolved_from: resolvedFrom,
      self_difficulty: parsed.data.selfDifficulty ?? null,
      subject_kind: subject?.kind ?? null,
      subject_code: subject?.code ?? null,
      // 시각을 적었으면 시간표 타일에 놓인다 — 비우면 "시각 미지정" 띠로 간다.
      started_at: parsed.data.startTime
        ? kstDateTimeToISO(parsed.data.logDate, parsed.data.startTime)
        : null,
    });
    if (error) return data({ error: "기록에 실패했습니다" }, { status: 400 });
    return data({ ok: true });
  }

  // Stage 3 — 기록 취소 = 역방향 레코드 (UPDATE/DELETE 없음, append-only).
  if (intent === "reverse_log") {
    const logId = String(fd.get("logId") ?? "");
    const { data: orig, error: oErr } = await client
      .from("study_logs")
      .select(
        "log_id, user_id, log_date, plan_item_id, node_id, lesson_id, activity_type, minutes, source, completion",
      )
      .eq("log_id", logId)
      .maybeSingle();
    if (oErr || !orig || orig.user_id !== user.id) {
      return data({ error: "기록을 찾을 수 없습니다" }, { status: 404 });
    }
    if (orig.minutes <= 0) {
      return data({ error: "취소 레코드는 다시 취소할 수 없습니다" }, { status: 400 });
    }
    const { error } = await client.from("study_logs").insert({
      user_id: user.id,
      log_date: orig.log_date,
      plan_item_id: orig.plan_item_id,
      node_id: orig.node_id,
      lesson_id: orig.lesson_id,
      activity_type: orig.activity_type,
      minutes: -orig.minutes,
      source: orig.source,
      completion: "none",
      reverses_log_id: orig.log_id,
    });
    if (error) {
      // reversal_uniq — 이미 취소된 기록.
      if (error.code === "23505") {
        return data({ error: "이미 취소된 기록입니다" }, { status: 409 });
      }
      return data({ error: "취소에 실패했습니다" }, { status: 400 });
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
      subject: fd.get("subject") || undefined,
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
    const subject = await resolveSubjectInput(client, parsed.data.subject, nodeId);
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
      subject_kind: subject?.kind ?? null,
      subject_code: subject?.code ?? null,
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

  // ── feat-7-048 Stage E — 학습 타이머 ──────────────────────────────────────
  // 서버는 시각만 기록한다(서버리스라 타이머를 돌릴 수 없다). 경과는 lib/timer 로 재계산.

  if (intent === "start_timer") {
    const startSchema = z.object({
      activityType: z.enum([
        "lecture",
        "review",
        "problem",
        "memorize",
        "reading",
        "essay",
        "other",
      ]),
      planItemId: z.string().uuid().optional(),
      subject: z.string().max(60).optional(),
    });
    const parsed = startSchema.safeParse({
      activityType: fd.get("activityType") || "review",
      planItemId: fd.get("planItemId") || undefined,
      subject: fd.get("subject") || undefined,
    });
    if (!parsed.success) return data({ error: "입력을 확인해 주세요" }, { status: 400 });

    // 계획 항목에서 시작하면 항목의 노드·과목을 상속한다(기록 규칙과 동일).
    let nodeId: string | null = null;
    let subject: { kind: string; code: string } | null = null;
    if (parsed.data.planItemId) {
      const { data: item } = await client
        .from("study_plan_items")
        .select("node_id, subject_kind, subject_code, activity_type")
        .eq("item_id", parsed.data.planItemId)
        .maybeSingle();
      if (!item) return data({ error: "계획 항목을 찾을 수 없습니다" }, { status: 404 });
      nodeId = item.node_id;
      if (item.subject_kind && item.subject_code) {
        subject = { kind: item.subject_kind, code: item.subject_code };
      }
    }
    if (!subject) {
      subject = await resolveSubjectInput(client, parsed.data.subject, nodeId);
    }
    const res = await startTimerSession(client, {
      userId: user.id,
      planItemId: parsed.data.planItemId ?? null,
      nodeId,
      subjectKind: subject?.kind ?? null,
      subjectCode: subject?.code ?? null,
      activityType: parsed.data.activityType,
    });
    if (!res.ok) return data({ error: res.error }, { status: 409 });
    return data({ ok: true, sessionId: res.sessionId });
  }

  if (intent === "pause_timer" || intent === "resume_timer") {
    const sessionId = String(fd.get("sessionId") ?? "");
    const ok = await toggleTimerPause(
      client,
      user.id,
      sessionId,
      intent === "pause_timer",
    );
    if (!ok) return data({ error: "진행 중인 타이머가 없습니다" }, { status: 400 });
    return data({ ok: true });
  }

  if (intent === "stop_timer") {
    const sessionId = String(fd.get("sessionId") ?? "");
    const raw = fd.get("minutes");
    const override = raw ? Number(raw) : null;
    if (override !== null && (!Number.isInteger(override) || override < 0)) {
      return data({ error: "시간을 확인해 주세요" }, { status: 400 });
    }
    const res = await stopTimerSession(client, user.id, sessionId, override);
    if (res.needsConfirm) {
      return data(
        {
          needsConfirm: true as const,
          elapsedMinutes: res.elapsedMinutes,
          error: "12시간을 넘겼습니다 — 실제 공부한 시간을 확인해 주세요",
        },
        { status: 400 },
      );
    }
    if (!res.ok) return data({ error: res.error ?? "종료할 수 없습니다" }, { status: 400 });
    return data({ ok: true, minutes: res.minutes });
  }

  if (intent === "discard_timer") {
    const sessionId = String(fd.get("sessionId") ?? "");
    const ok = await discardTimerSession(client, user.id, sessionId);
    if (!ok) return data({ error: "진행 중인 타이머가 없습니다" }, { status: 400 });
    return data({ ok: true });
  }

  if (intent === "set_record_mode") {
    const mode = String(fd.get("recordMode") ?? "");
    if (mode !== "timer" && mode !== "total") {
      return data({ error: "기록 방식을 확인해 주세요" }, { status: 400 });
    }
    await setRecordMode(client, user.id, mode);
    return data({ ok: true });
  }

  // feat-7-048 — 과목 색 오버라이드(팔레트 키만 저장, hex 금지).
  if (intent === "set_subject_color") {
    const raw = String(fd.get("subject") ?? "");
    const colorKey = String(fd.get("colorKey") ?? "");
    const [kind, code] = raw.split(":");
    if (!kind || !code || !isValidSubject(kind, code)) {
      return data({ error: "과목을 확인해 주세요" }, { status: 400 });
    }
    if (!(SUBJECT_COLOR_KEYS as readonly string[]).includes(colorKey)) {
      return data({ error: "색을 확인해 주세요" }, { status: 400 });
    }
    await upsertSubjectColor(client, {
      userId: user.id,
      subjectKind: kind,
      subjectCode: code,
      colorKey,
    });
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
