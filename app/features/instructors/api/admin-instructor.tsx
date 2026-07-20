// feat-6-012 강사소개 — 운영자 저장/삭제 액션. staff 게이트, 쓰기는 요청 클라이언트(RLS staff 백스톱).
import type { Database } from "database.types";
import { data, redirect } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  parseInstructorForm,
  uploadInstructorPhoto,
} from "../lib/instructor-fields.server";
import { softDeleteInstructor } from "../queries.server";

import type { Route } from "./+types/admin-instructor";

export async function action({ request }: Route.ActionArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });
  if (!(await getStaffRole(client, user.id)))
    return data({ error: "Forbidden" }, { status: 403 });

  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "");
  const instructorId = String(fd.get("instructorId") ?? "");

  if (intent === "delete") {
    if (!instructorId) return data({ error: "id 누락" }, { status: 400 });
    await softDeleteInstructor(client, instructorId);
    return redirect("/admin/instructor-profiles");
  }

  // 목록에서 ↑/↓ 배치 순서 변경 — 인접 강사와 display_order 교환.
  if (intent === "reorder") {
    const direction = String(fd.get("direction") ?? "");
    if (!instructorId || (direction !== "up" && direction !== "down"))
      return data({ error: "잘못된 요청" }, { status: 400 });
    const { data: rows, error: e1 } = await client
      .from("instructors")
      .select("instructor_id, display_order")
      .is("deleted_at", null)
      .order("display_order", { ascending: true })
      .order("instructor_id", { ascending: true });
    if (e1) return data({ error: e1.message }, { status: 400 });
    const list = rows ?? [];
    const idx = list.findIndex((r) => r.instructor_id === instructorId);
    if (idx === -1) return data({ error: "not found" }, { status: 404 });
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= list.length)
      return data({ ok: true }); // 경계 — 무변화
    const a = list[idx];
    const b = list[swapIdx];
    // display_order 교환. 동률이면 인덱스 기반으로 강제 분리.
    let aOrder = b.display_order;
    let bOrder = a.display_order;
    if (aOrder === bOrder) {
      aOrder = swapIdx;
      bOrder = idx;
    }
    const [{ error: e2 }, { error: e3 }] = await Promise.all([
      client
        .from("instructors")
        .update({ display_order: aOrder })
        .eq("instructor_id", a.instructor_id),
      client
        .from("instructors")
        .update({ display_order: bOrder })
        .eq("instructor_id", b.instructor_id),
    ]);
    if (e2 || e3)
      return data({ error: (e2 ?? e3)?.message }, { status: 400 });
    return data({ ok: true });
  }

  if (intent === "save") {
    const photoUrl = await uploadInstructorPhoto(fd);
    const parsed = parseInstructorForm(fd, photoUrl);
    if (!parsed.ok) return data({ error: parsed.error }, { status: 400 });

    if (instructorId) {
      const { error } = await client
        .from("instructors")
        .update(parsed.row as Database["public"]["Tables"]["instructors"]["Update"])
        .eq("instructor_id", instructorId);
      if (error) return data({ error: error.message }, { status: 400 });
    } else {
      const { error } = await client
        .from("instructors")
        .insert(parsed.row as Database["public"]["Tables"]["instructors"]["Insert"]);
      if (error) return data({ error: error.message }, { status: 400 });
    }
    return redirect("/admin/instructor-profiles");
  }

  return data({ error: "잘못된 요청" }, { status: 400 });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
