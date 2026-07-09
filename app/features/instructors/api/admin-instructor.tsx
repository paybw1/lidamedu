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
    return redirect("/admin/instructors");
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
    return redirect("/admin/instructors");
  }

  return data({ error: "잘못된 요청" }, { status: 400 });
}
