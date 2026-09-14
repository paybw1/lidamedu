// 강의 자료 다운로드 — 서버 권한 판정 후 signed URL 리다이렉트(storage_path 비노출).
//   staff: 무조건 허용. 학생: 해당 회차 강의에 유효 수강권 + 자료 공개(is_published) 일 때만.
//
// ★feat-11-013 P9 — 여기서 **이용이력을 남긴다.** 종전에는 권한만 보고 보내 주고 아무 기록도
//   하지 않았다. 환불 계산(요청서 §11-4)은 「유료 자료를 이용한 고유 회차 수」를 공제의
//   근거로 쓰는데, 그 근거가 통째로 없었다.
// ★★이 기록은 **소급이 불가능하다** — 지금 넣어도 그 이전 이용은 영원히 알 수 없다.
//   그래서 다른 작업보다 먼저 넣었다(원장 승인 2026-09-14).
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
    .select(
      "storage_path, title, is_published, lesson_id, lesson:course_lessons!inner(course_id)",
    )
    .eq("material_id", materialId)
    .maybeSingle();
  if (!mat) throw data("Not found", { status: 404 });

  const role = await getStaffRole(client, user.id);
  // ★어느 수강권으로 이용했는지 — 환불 계산이 「이 주문항목의 이용 회차」를 묻기 때문에
  //   enrollment 까지 박아 둔다(enrollments.order_item_id 로 주문항목까지 이어진다).
  let enrollmentId: string | null = null;
  if (!role) {
    // 학생 — 자료 공개 + 해당 강의 유효 수강권 보유 확인.
    if (!mat.is_published) throw data("Forbidden", { status: 403 });
    const courseId = (mat.lesson as { course_id: string }).course_id;
    const { data: enr } = await adminClient
      .from("enrollments")
      .select("enrollment_id")
      .eq("user_id", user.id)
      .eq("course_id", courseId)
      .in("status", ["active", "paused"])
      .order("expires_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!enr) throw data("Forbidden", { status: 403 });
    enrollmentId = enr.enrollment_id;
  }

  const { data: signed, error } = await adminClient.storage
    .from(BUCKET)
    .createSignedUrl(mat.storage_path, SIGNED_TTL, {
      download: mat.title || true,
    });
  if (error || !signed) throw data("서명 URL 생성 실패", { status: 500 });

  // ★기록은 서명 URL 을 만든 **뒤**, 보내기 **전**에 남긴다 — 실패한 다운로드를 이용으로
  //   세지 않기 위해서다. 기록이 실패해도 다운로드는 막지 않는다(학생 잘못이 아니다).
  //   ★staff 는 enrollment 가 없어 enrollment_id 가 null 이고, 환불 계산은 그 칸으로
  //   거르므로 운영자 열람이 학생의 이용 회차에 섞이지 않는다.
  try {
    await adminClient.from("material_access_logs").insert({
      material_id: materialId,
      lesson_id: mat.lesson_id,
      user_id: user.id,
      enrollment_id: enrollmentId,
      action: "download",
    });
  } catch (e) {
    console.error("[lms] material access log failed:", e);
  }

  return redirect(signed.signedUrl);
}
