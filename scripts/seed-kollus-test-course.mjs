// Kollus 재생 테스트용 강좌 시드 — 시리즈·강의(에디션)·회차·영상·수강권을 멱등 생성.
//   실행: npx dotenv -e .env -- node scripts/seed-kollus-test-course.mjs
//   옵션(환경변수):
//     TEST_EMAIL   수강권 부여 대상 이메일 (기본 paybw1@gmail.com)
//     MCKEY        Kollus 미디어 콘텐츠 키 (영상 업로드 후 지정 — 미지정 시 placeholder)
//     DURATION     영상 길이(초, 기본 600) — 배수 모수·하트비트 상한
//
// 영상을 아직 안 올렸다면 placeholder 로 깔아두고, 내일 업로드 후 MCKEY 만 넣어 재실행하거나
// /admin/lms 회차 편집에서 drm_video_id 를 채우면 됩니다.
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요");
  process.exit(1);
}
const admin = createClient(url, key);

const EMAIL = (process.env.TEST_EMAIL || "paybw1@gmail.com").toLowerCase();
const MCKEY = process.env.MCKEY || "REPLACE_WITH_KOLLUS_MCKEY";
const DURATION = Math.max(1, Number(process.env.DURATION || 600));
const SERIES_TITLE = "리담 테스트 강의 (Kollus 연동 확인)";

// 0) 대상 사용자 찾기(auth) ------------------------------------------------
async function findUserByEmail(email) {
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    const found = data.users.find((u) => (u.email || "").toLowerCase() === email);
    if (found) return found;
    if (data.users.length < 200) break;
  }
  return null;
}

const user = await findUserByEmail(EMAIL);
if (!user) {
  console.error(`대상 사용자(${EMAIL})를 찾지 못했습니다.`);
  process.exit(1);
}

// 1) 시리즈 ---------------------------------------------------------------
let { data: series } = await admin
  .from("course_series")
  .select("series_id")
  .eq("title", SERIES_TITLE)
  .maybeSingle();
if (!series) {
  const ins = await admin
    .from("course_series")
    .insert({ title: SERIES_TITLE, subject_code: "patent" })
    .select("series_id")
    .single();
  if (ins.error) throw ins.error;
  series = ins.data;
}

// 2) 강의(에디션) --------------------------------------------------------
let { data: course } = await admin
  .from("courses")
  .select("course_id")
  .eq("series_id", series.series_id)
  .is("deleted_at", null)
  .maybeSingle();
if (!course) {
  const ins = await admin
    .from("courses")
    .insert({
      series_id: series.series_id,
      edition_label: "테스트판",
      edition_year: 2026,
      is_current: true,
      status: "published",
      description: "Kollus 재생 연동 확인용 테스트 강의입니다.",
    })
    .select("course_id")
    .single();
  if (ins.error) throw ins.error;
  course = ins.data;
}

// 3) 회차 -----------------------------------------------------------------
let { data: lesson } = await admin
  .from("course_lessons")
  .select("lesson_id")
  .eq("course_id", course.course_id)
  .eq("lesson_no", 1)
  .maybeSingle();
if (!lesson) {
  const ins = await admin
    .from("course_lessons")
    .insert({
      course_id: course.course_id,
      lesson_no: 1,
      title: "테스트 회차 (재생 확인)",
      sort_order: 0,
      is_preview: false,
      is_published: true,
    })
    .select("lesson_id")
    .single();
  if (ins.error) throw ins.error;
  lesson = ins.data;
}

// 4) 영상 (active 1개 규칙) ----------------------------------------------
const { data: activeVideo } = await admin
  .from("lesson_videos")
  .select("video_id, drm_video_id")
  .eq("lesson_id", lesson.lesson_id)
  .eq("is_active", true)
  .maybeSingle();
if (!activeVideo) {
  const ins = await admin
    .from("lesson_videos")
    .insert({
      lesson_id: lesson.lesson_id,
      drm_provider: "kollus",
      drm_video_id: MCKEY,
      duration_seconds: DURATION,
      is_active: true,
    })
    .select("video_id")
    .single();
  if (ins.error) throw ins.error;
} else if (process.env.MCKEY) {
  // 이미 있고 MCKEY 를 새로 넘겼으면 갱신(placeholder → 실제 키).
  const upd = await admin
    .from("lesson_videos")
    .update({ drm_video_id: MCKEY, duration_seconds: DURATION })
    .eq("video_id", activeVideo.video_id);
  if (upd.error) throw upd.error;
}

// 5) 수강권 ---------------------------------------------------------------
const { data: enroll } = await admin
  .from("enrollments")
  .select("enrollment_id")
  .eq("user_id", user.id)
  .eq("course_id", course.course_id)
  .maybeSingle();
if (!enroll) {
  const expires = new Date(Date.now() + 365 * 86400_000).toISOString();
  const ins = await admin.from("enrollments").insert({
    user_id: user.id,
    course_id: course.course_id,
    source: "manual",
    starts_at: new Date().toISOString(),
    expires_at: expires,
    status: "active",
    base_duration_snapshot_seconds: DURATION,
    admin_note: "Kollus 재생 테스트 시드",
  });
  if (ins.error) throw ins.error;
}

console.log("OK — Kollus 테스트 강좌 준비 완료");
console.log({
  email: EMAIL,
  courseId: course.course_id,
  lessonId: lesson.lesson_id,
  mckey: MCKEY,
  durationSeconds: DURATION,
  watchPath: `/lecture/watch/${lesson.lesson_id}`,
});
console.log(
  MCKEY === "REPLACE_WITH_KOLLUS_MCKEY"
    ? "\n다음: Kollus 콘솔에 영상 업로드 → 미디어 콘텐츠 키 확보 후\n  MCKEY=<키> DURATION=<초> npx dotenv -e .env -- node scripts/seed-kollus-test-course.mjs\n재실행(또는 /admin/lms 회차 편집에서 drm_video_id 입력).\n또한 Vercel/.env 에 KOLLUS_SECURITY_KEY·KOLLUS_CUSTOM_KEY 설정 필요."
    : "\nKOLLUS_SECURITY_KEY·KOLLUS_CUSTOM_KEY 가 설정돼 있으면 위 watchPath 로 바로 재생됩니다.",
);
