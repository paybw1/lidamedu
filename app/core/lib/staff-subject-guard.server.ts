// feat-7-041 강사 담당 과목 게이트 — instructor 는 instructor_subjects 에 지정된
// 과목만 콘텐츠 쓰기 가능. admin/manager 는 전 과목. 미지정 강사 = 전 과목 불가.
// 읽기는 제한하지 않는다(쓰기 액션에서만 호출).

import { data } from "react-router";

import adminClient from "~/core/lib/supa-admin-client.server";
import type { UserRole } from "~/core/lib/roles";

/** 강사 담당 과목 목록 (law_code slug 배열). */
export async function getInstructorSubjects(
  instructorId: string,
): Promise<string[]> {
  const { data: rows, error } = await adminClient
    .from("instructor_subjects")
    .select("subject_code")
    .eq("instructor_id", instructorId);
  if (error) throw error;
  return (rows ?? []).map((r) => r.subject_code);
}

/**
 * 쓰기 대상 과목 검증 — instructor 인데 담당 과목이 아니면 403.
 * subjectCodes: 대상 콘텐츠가 속한 과목(들). 하나라도 담당이면 허용
 * (판례처럼 복수 과목에 걸친 콘텐츠 대응).
 */
export async function assertSubjectWritable(
  role: UserRole | null | undefined,
  userId: string,
  subjectCodes: string | string[],
): Promise<void> {
  if (role === "admin" || role === "manager") return;
  if (role !== "instructor")
    throw data("Forbidden", { status: 403 });
  const targets = (Array.isArray(subjectCodes) ? subjectCodes : [subjectCodes])
    .filter(Boolean);
  if (targets.length === 0) {
    // 과목 미상 콘텐츠 — 강사에게는 보수적으로 차단(운영자만).
    throw data("과목을 확인할 수 없는 콘텐츠는 운영자만 수정할 수 있습니다.", {
      status: 403,
    });
  }
  const mine = await getInstructorSubjects(userId);
  if (!targets.some((t) => mine.includes(t))) {
    throw data(
      `담당 과목이 아니라 수정할 수 없습니다 (대상: ${targets.join(", ")}). 담당 과목 지정은 운영자에게 요청하세요.`,
      { status: 403 },
    );
  }
}
