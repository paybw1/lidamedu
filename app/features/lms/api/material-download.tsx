// 강의 자료 다운로드 — 서버 권한 판정 후 signed URL 리다이렉트(storage_path 비노출).
//   staff: 무조건 허용. 학생: 해당 회차 강의에 유효 수강권 + 자료 공개(is_published) 일 때만.
import { data, redirect } from "react-router";

import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/material-download";

const BUCKET = "lesson-materials";
const SIGNED_TTL = 120; // 초 — 짧게(핫링크 공유 방지)

export async function loader({ request, params }: Route.LoaderArgs) {
  const materialId = params.materialId!;
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  // 자료 + 소속 회차·강의 조회(service_role — storage_path 는 서버만).
  const { data: mat } = await adminClient
    .from("lesson_materials")
    .select("storage_path, title, is_published, lesson:course_lessons!inner(course_id)")
    .eq("material_id", materialId)
    .maybeSingle();
  if (!mat) throw data("Not found", { status: 404 });

  const role = await getStaffRole(client, user.id);
  if (!role) {
    // 학생 — 자료 공개 + 해당 강의 유효 수강권 보유 확인.
    if (!mat.is_published) throw data("Forbidden", { status: 403 });
    const courseId = (mat.lesson as { course_id: string }).course_id;
    const { count } = await adminClient
      .from("enrollments")
      .select("enrollment_id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("course_id", courseId)
      .in("status", ["active", "paused"]);
    if ((count ?? 0) === 0) throw data("Forbidden", { status: 403 });
  }

  const { data: signed, error } = await adminClient.storage
    .from(BUCKET)
    .createSignedUrl(mat.storage_path, SIGNED_TTL, {
      download: mat.title || true,
    });
  if (error || !signed) throw data("서명 URL 생성 실패", { status: 500 });
  return redirect(signed.signedUrl);
}
