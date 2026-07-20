// feat-7-043 — 출결 대장 API. staff 전용 + 반 소유권 게이트 (assignment API 동일 원칙).
// 쓰기 = 요청 클라이언트(RLS staff 백스톱), adminClient 는 소유권 역추적 읽기만.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";
import { data } from "react-router";
import { z } from "zod";

import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { roleAtLeast } from "~/core/lib/roles";
import { ATTENDANCE_STATUSES } from "~/features/attendance/labels";
import {
  createClassSession,
  saveSessionAttendance,
  softDeleteClassSession,
  updateClassSession,
} from "~/features/attendance/queries.server";
import { getCohortById } from "~/features/cohorts/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/attendance";

async function resolveCohortId(
  admin: SupabaseClient<Database>,
  intent: string,
  fd: FormData,
): Promise<string | null> {
  if (intent === "create_session") {
    return String(fd.get("cohortId") ?? "") || null;
  }
  const sid = String(fd.get("classSessionId") ?? "");
  if (!sid) return null;
  const { data: s } = await admin
    .from("cohort_class_sessions")
    .select("cohort_id")
    .eq("class_session_id", sid)
    .maybeSingle();
  return s?.cohort_id ?? null;
}

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

  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "");

  const cohortId = await resolveCohortId(adminClient, intent, fd);
  if (!cohortId) {
    return data({ error: "대상을 찾을 수 없습니다" }, { status: 404 });
  }
  if (!roleAtLeast(role, "manager")) {
    const cohort = await getCohortById(adminClient, cohortId);
    if (!cohort || cohort.ownerId !== user.id) {
      return data({ error: "본인 소유 반만 접근 가능합니다" }, { status: 403 });
    }
  }

  if (intent === "create_session") {
    const parsed = z
      .object({
        sessionNo: z.coerce.number().int().min(1).max(999),
        heldOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        title: z.string().trim().max(200).optional(),
      })
      .safeParse({
        sessionNo: fd.get("sessionNo"),
        heldOn: fd.get("heldOn"),
        title: fd.get("title") ? String(fd.get("title")) : undefined,
      });
    if (!parsed.success) {
      return data({ error: "회차 번호·수업일을 입력하세요" }, { status: 400 });
    }
    const classSessionId = await createClassSession(client, {
      cohortId,
      sessionNo: parsed.data.sessionNo,
      heldOn: parsed.data.heldOn,
      title: parsed.data.title || null,
      createdBy: user.id,
    });
    return data({ ok: true, classSessionId });
  }

  const classSessionId = String(fd.get("classSessionId") ?? "");

  if (intent === "update_session") {
    const parsed = z
      .object({
        sessionNo: z.coerce.number().int().min(1).max(999).optional(),
        heldOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        title: z.string().trim().max(200).nullable().optional(),
      })
      .safeParse({
        sessionNo: fd.get("sessionNo") ?? undefined,
        heldOn: fd.get("heldOn") ? String(fd.get("heldOn")) : undefined,
        title: fd.get("title") !== null ? String(fd.get("title")).trim() || null : undefined,
      });
    if (!parsed.success) return data({ error: "입력 오류" }, { status: 400 });
    await updateClassSession(client, classSessionId, parsed.data);
    return data({ ok: true });
  }

  if (intent === "delete_session") {
    await softDeleteClassSession(client, classSessionId);
    return data({ ok: true });
  }

  if (intent === "save_attendance") {
    const entriesSchema = z
      .array(
        z.object({
          profileId: z.string().uuid(),
          status: z.enum(ATTENDANCE_STATUSES),
          note: z.string().trim().max(500).nullable().optional(),
        }),
      )
      .min(1)
      .max(300);
    let raw: unknown;
    try {
      raw = JSON.parse(String(fd.get("entries") ?? "[]"));
    } catch {
      return data({ error: "형식 오류" }, { status: 400 });
    }
    const parsed = entriesSchema.safeParse(raw);
    if (!parsed.success) return data({ error: "형식 오류" }, { status: 400 });

    // 대상 학생 반 멤버십 재검증 (fail-closed).
    const { data: members, error: mErr } = await adminClient
      .from("cohort_members")
      .select("profile_id")
      .eq("cohort_id", cohortId);
    if (mErr) return data({ error: "멤버 조회 실패" }, { status: 500 });
    const memberIds = new Set((members ?? []).map((m) => m.profile_id));
    if (parsed.data.some((e) => !memberIds.has(e.profileId))) {
      return data(
        { error: "이 반 학생이 아닌 대상이 포함되어 있습니다" },
        { status: 403 },
      );
    }

    const saved = await saveSessionAttendance(
      client,
      classSessionId,
      parsed.data.map((e) => ({ ...e, note: e.note ?? null })),
      user.id,
    );
    return data({ ok: true, saved });
  }

  return data({ error: `알 수 없는 intent: ${intent}` }, { status: 400 });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
